import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardCheck, ClipboardList, MessageSquareText, Minus, Plus, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { HojaObservacion } from '../components/HojaObservacion'
import { db, nuevoId } from '../db/db'
import { contadoresPorAlumno } from '../db/observaciones'
import type { Alumno, FranjaHorario, SignoObservacion } from '../db/types'
import { aliasPorDefecto, parsearAlumnos } from '../lib/importAlumnos'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'
import { EditorHorario } from './Grupos'

export function GrupoDetalle({ grupoId }: { grupoId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [hoja, setHoja] = useState<'ninguna' | 'importar' | 'alumno' | 'grupo'>('ninguna')
  const [observando, setObservando] = useState<{
    alumno: Alumno
    signo: SignoObservacion
  } | null>(null)

  const grupo = useLiveQuery(() => db.grupos.get(grupoId), [grupoId])
  const contadores = useLiveQuery(() => contadoresPorAlumno(grupoId), [grupoId])
  const alumnos = useLiveQuery(async () => {
    const lista = await db.alumnos.where('grupoId').equals(grupoId).toArray()
    return lista
      .filter((a) => a.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  }, [grupoId])

  if (grupo === undefined) return null
  if (grupo === null) {
    return (
      <>
        <Cabecera titulo="Grupo no encontrado" atras />
        <div className="p-4">
          <button className="btn-suave w-full" onClick={() => navegar('/grupos')}>
            Volver a Grupos
          </button>
        </div>
      </>
    )
  }

  async function eliminarGrupo() {
    if (!grupo) return
    const cuantos = alumnos?.length ?? 0
    const confirmado = window.confirm(
      cuantos > 0
        ? `Se eliminará «${grupo.nombre}» y sus ${cuantos} alumnos, con toda su asistencia, observaciones y notas. ¿Continuar?`
        : `¿Eliminar el grupo «${grupo.nombre}»?`,
    )
    if (!confirmado) return

    const ids = (alumnos ?? []).map((a) => a.id)
    await db.transaction(
      'rw',
      [db.grupos, db.alumnos, db.asistencias, db.observaciones, db.calificaciones],
      async () => {
        await db.asistencias.where('alumnoId').anyOf(ids).delete()
        await db.calificaciones.where('alumnoId').anyOf(ids).delete()
        await db.observaciones.where('grupoId').equals(grupo.id).delete()
        await db.alumnos.where('grupoId').equals(grupo.id).delete()
        await db.grupos.delete(grupo.id)
      },
    )
    navegar('/grupos')
    mostrarAviso(`Grupo «${grupo.nombre}» eliminado`)
  }

  return (
    <>
      <Cabecera
        titulo={grupo.nombre}
        atras
        subtitulo={
          <span className="flex items-center gap-2">
            <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
            <span>{alumnos?.length ?? 0} alumnos</span>
          </span>
        }
        acciones={
          <button className="btn-suave" onClick={() => setHoja('grupo')}>
            Editar
          </button>
        }
      />

      <div className="space-y-4 p-4">
        {(alumnos?.length ?? 0) > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-primario"
              onClick={() => navegar(`/asistencia/${grupoId}`)}
            >
              <ClipboardCheck size={20} aria-hidden />
              Pasar lista
            </button>
            {/* Infantil no accede al cuaderno (§6): su evaluación es cualitativa. */}
            {grupo.etapa === 'infantil' && (
              <button className="btn-suave" onClick={() => navegar(`/infantil/${grupoId}`)}>
                <ClipboardList size={20} aria-hidden />
                Evaluar
              </button>
            )}
            <button
              className={grupo.etapa === 'infantil' ? 'btn-suave col-span-2' : 'btn-suave'}
              onClick={() => navegar(`/equipos/${grupoId}`)}
            >
              <Shuffle size={20} aria-hidden />
              Generar equipos
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-suave" onClick={() => setHoja('importar')}>
            Importar listado
          </button>
          <button className="btn-suave" onClick={() => setHoja('alumno')}>
            + Alumno
          </button>
        </div>

        {alumnos?.length === 0 && (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Grupo sin alumnado</p>
            <p className="mt-1 text-sm texto-suave">
              Pega el listado de clase: una línea por alumno.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {alumnos?.map((a) => {
            const c = contadores?.get(a.id)
            return (
              <li key={a.id}>
                <div className="tarjeta flex items-center gap-2 py-2">
                  <button
                    onClick={() => navegar(`/alumnos/${a.id}`)}
                    className="min-w-0 flex-1 py-1 text-left"
                  >
                    <span className="block truncate text-lg font-semibold">
                      {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-sm texto-suave">
                      {a.alias && a.alias !== a.nombre && <span>{a.alias}</span>}
                      {c && (c.positivos > 0 || c.negativos > 0) && (
                        <span className="cifra flex items-center gap-1.5 font-bold">
                          {c.positivos > 0 && (
                            <span className="text-lima-oscuro dark:text-lima">
                              +{c.positivos}
                            </span>
                          )}
                          {c.negativos > 0 && <span className="text-acento">−{c.negativos}</span>}
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Registro en ≤3 taps: el signo ya viene elegido desde aquí. */}
                  <button
                    onClick={() => setObservando({ alumno: a, signo: '+' })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lima/20 text-lima-oscuro dark:text-lima"
                    aria-label={`Observación positiva para ${a.alias || a.nombre}`}
                  >
                    <Plus size={20} strokeWidth={3} aria-hidden />
                  </button>
                  <button
                    onClick={() => setObservando({ alumno: a, signo: '-' })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acento/15 text-acento"
                    aria-label={`Observación negativa para ${a.alias || a.nombre}`}
                  >
                    <Minus size={20} strokeWidth={3} aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        {(alumnos?.length ?? 0) > 0 && (
          <button
            className="btn-suave w-full"
            onClick={() => navegar(`/observaciones/${grupoId}`)}
          >
            <MessageSquareText size={18} aria-hidden />
            Ver observaciones del grupo
          </button>
        )}

        <button className="btn w-full text-acento" onClick={eliminarGrupo}>
          Eliminar grupo
        </button>
      </div>

      <HojaObservacion
        abierta={!!observando}
        grupoId={grupoId}
        alumno={observando?.alumno}
        signoInicial={observando?.signo}
        onCerrar={() => setObservando(null)}
      />

      <HojaImportar
        abierta={hoja === 'importar'}
        grupoId={grupoId}
        onCerrar={() => setHoja('ninguna')}
      />
      <HojaNuevoAlumno
        abierta={hoja === 'alumno'}
        grupoId={grupoId}
        onCerrar={() => setHoja('ninguna')}
      />
      <HojaEditarGrupo
        abierta={hoja === 'grupo'}
        grupoId={grupoId}
        onCerrar={() => setHoja('ninguna')}
      />
    </>
  )
}

function HojaImportar({
  abierta,
  grupoId,
  onCerrar,
}: {
  abierta: boolean
  grupoId: string
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [texto, setTexto] = useState('')
  const previsualizacion = parsearAlumnos(texto)

  async function importar() {
    const nuevos: Alumno[] = previsualizacion.map((a) => ({
      id: nuevoId(),
      grupoId,
      nombre: a.nombre,
      apellidos: a.apellidos,
      alias: aliasPorDefecto(a),
      activo: true,
    }))
    await db.alumnos.bulkAdd(nuevos)
    setTexto('')
    onCerrar()
    mostrarAviso(`${nuevos.length} alumnos importados`, async () => {
      await db.alumnos.bulkDelete(nuevos.map((n) => n.id))
    })
  }

  return (
    <Hoja abierta={abierta} titulo="Importar alumnado" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          Una línea por alumno. Se admite «Apellidos, Nombre», «Nombre Apellidos» y CSV con
          <code className="mx-1 rounded bg-agua-claro px-1 dark:bg-noche-elevada">;</code>
          o tabulador.
        </p>

        <textarea
          className="campo h-48 resize-none py-2"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'García López, Ana\nMartín Ruiz, Pablo'}
          autoFocus
        />

        {previsualizacion.length > 0 && (
          <div className="tarjeta max-h-56 overflow-y-auto p-3">
            <p className="mb-2 text-sm font-bold">
              {previsualizacion.length} alumnos detectados
            </p>
            <ul className="space-y-1 text-sm">
              {previsualizacion.map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">
                    {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
                  </span>
                  <span className="shrink-0 text-tinta-tenue">{aliasPorDefecto(a)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          className="btn-primario w-full"
          onClick={importar}
          disabled={previsualizacion.length === 0}
        >
          Importar {previsualizacion.length > 0 && `(${previsualizacion.length})`}
        </button>
      </div>
    </Hoja>
  )
}

function HojaNuevoAlumno({
  abierta,
  grupoId,
  onCerrar,
}: {
  abierta: boolean
  grupoId: string
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nombre, setNombre] = useState('')
  const [apellidos, setApellidos] = useState('')

  async function guardar() {
    if (!nombre.trim()) return
    const alumno: Alumno = {
      id: nuevoId(),
      grupoId,
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      alias: aliasPorDefecto({ nombre: nombre.trim(), apellidos: apellidos.trim() }),
      activo: true,
    }
    await db.alumnos.add(alumno)
    setNombre('')
    setApellidos('')
    onCerrar()
    mostrarAviso(`${alumno.nombre} añadido`, async () => {
      await db.alumnos.delete(alumno.id)
    })
  }

  return (
    <Hoja abierta={abierta} titulo="Nuevo alumno" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="alumno-nombre">
            Nombre
          </label>
          <input
            id="alumno-nombre"
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="alumno-apellidos">
            Apellidos
          </label>
          <input
            id="alumno-apellidos"
            className="campo"
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
          />
        </div>
        <button className="btn-primario w-full" onClick={guardar} disabled={!nombre.trim()}>
          Añadir
        </button>
      </div>
    </Hoja>
  )
}

function HojaEditarGrupo({
  abierta,
  grupoId,
  onCerrar,
}: {
  abierta: boolean
  grupoId: string
  onCerrar: () => void
}) {
  const grupo = useLiveQuery(() => db.grupos.get(grupoId), [grupoId])
  const [nombre, setNombre] = useState<string | null>(null)
  const [horario, setHorario] = useState<FranjaHorario[] | null>(null)

  if (!grupo) return null

  const nombreActual = nombre ?? grupo.nombre
  const horarioActual = horario ?? grupo.horario

  async function guardar() {
    await db.grupos.update(grupoId, { nombre: nombreActual.trim(), horario: horarioActual })
    setNombre(null)
    setHorario(null)
    onCerrar()
  }

  return (
    <Hoja abierta={abierta} titulo="Editar grupo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="editar-nombre">
            Nombre
          </label>
          <input
            id="editar-nombre"
            className="campo"
            value={nombreActual}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <EditorHorario horario={horarioActual} onCambio={setHorario} />

        <button className="btn-primario w-full" onClick={guardar} disabled={!nombreActual.trim()}>
          Guardar
        </button>
      </div>
    </Hoja>
  )
}
