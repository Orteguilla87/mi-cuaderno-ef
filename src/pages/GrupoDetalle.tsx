import { useLiveQuery } from 'dexie-react-hooks'
import {
  ClipboardCheck,
  ClipboardList,
  Eye,
  EyeOff,
  MessageSquareText,
  Minus,
  Plus,
  Shuffle,
} from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Campo } from '../components/Campo'
import { EstadoVacio } from '../components/EstadoVacio'
import { Hoja } from '../components/Hoja'
import { HojaConfirmar } from '../components/HojaConfirmar'
import { HojaObservacion } from '../components/HojaObservacion'
import { variablesColor } from '../components/SelectorColor'
import { db, nuevoId } from '../db/db'
import { etiquetasDe, etiquetas as leerEtiquetas } from '../db/etiquetasAlumno'
import { contadoresPorAlumno } from '../db/observaciones'
import type {
  Alumno,
  Asistencia,
  Calificacion,
  EtiquetaAlumno,
  FranjaHorario,
  Grupo,
  Observacion,
  SignoObservacion,
} from '../db/types'
import { aliasPorDefecto, parsearAlumnos } from '../lib/importAlumnos'
import { navegar } from '../lib/router'
import { useEtiquetasVisibles } from '../store/etiquetasVisibles'
import { useUI } from '../store/ui'
import { EditorHorario } from './Grupos'

export function GrupoDetalle({ grupoId }: { grupoId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [hoja, setHoja] = useState<'ninguna' | 'importar' | 'alumno' | 'grupo'>('ninguna')
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [observando, setObservando] = useState<{
    alumno: Alumno
    signo: SignoObservacion
  } | null>(null)

  const etiquetasVisibles = useEtiquetasVisibles((e) => e.visibles)
  const alternarEtiquetas = useEtiquetasVisibles((e) => e.alternar)

  const grupo = useLiveQuery(() => db.grupos.get(grupoId), [grupoId])
  const catalogoEtiquetas = useLiveQuery(() => leerEtiquetas(), []) ?? []
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
    const ids = (alumnos ?? []).map((a) => a.id)

    // Captura previa: es el borrado más destructivo de la app (grupo entero
    // en cascada), así que necesita deshacer de verdad y no solo un aviso.
    let copiaGrupo: Grupo | undefined
    let copiaAlumnos: Alumno[] = []
    let copiaAsistencias: Asistencia[] = []
    let copiaObservaciones: Observacion[] = []
    let copiaCalificaciones: Calificacion[] = []

    await db.transaction(
      'rw',
      [db.grupos, db.alumnos, db.asistencias, db.observaciones, db.calificaciones],
      async () => {
        copiaGrupo = await db.grupos.get(grupo.id)
        copiaAlumnos = await db.alumnos.where('grupoId').equals(grupo.id).toArray()
        copiaAsistencias = await db.asistencias.where('alumnoId').anyOf(ids).toArray()
        copiaObservaciones = await db.observaciones.where('grupoId').equals(grupo.id).toArray()
        copiaCalificaciones = await db.calificaciones.where('alumnoId').anyOf(ids).toArray()

        await db.asistencias.where('alumnoId').anyOf(ids).delete()
        await db.calificaciones.where('alumnoId').anyOf(ids).delete()
        await db.observaciones.where('grupoId').equals(grupo.id).delete()
        await db.alumnos.where('grupoId').equals(grupo.id).delete()
        await db.grupos.delete(grupo.id)
      },
    )
    navegar('/grupos')
    mostrarAviso(`Grupo «${grupo.nombre}» eliminado`, async () => {
      await db.transaction(
        'rw',
        [db.grupos, db.alumnos, db.asistencias, db.observaciones, db.calificaciones],
        async () => {
          if (copiaGrupo) await db.grupos.put(copiaGrupo)
          await db.alumnos.bulkPut(copiaAlumnos)
          await db.asistencias.bulkPut(copiaAsistencias)
          await db.observaciones.bulkPut(copiaObservaciones)
          await db.calificaciones.bulkPut(copiaCalificaciones)
        },
      )
      navegar(`/grupos/${grupo.id}`)
    })
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
          <div className="flex items-center gap-2">
            {/* Mismo interruptor que el Cuaderno y el mismo estado: es una
                preferencia del aparato («alguien puede acercarse»), no de la
                pantalla, así que apagarlo en un sitio lo apaga en el otro. */}
            <button
              className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
              onClick={alternarEtiquetas}
              aria-label={etiquetasVisibles ? 'Ocultar etiquetas' : 'Mostrar etiquetas'}
            >
              {etiquetasVisibles ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
            </button>
            <button className="btn-suave" onClick={() => setHoja('grupo')}>
              Editar
            </button>
          </div>
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
          <EstadoVacio
            titulo="Grupo sin alumnado"
            descripcion="Pega el listado de clase: una línea por alumno."
            accion={
              <button className="btn-primario w-full" onClick={() => setHoja('importar')}>
                Importar listado
              </button>
            }
          />
        )}

        <ul className="space-y-2">
          {alumnos?.map((a) => {
            const c = contadores?.get(a.id)
            return (
              <li key={a.id}>
                <div className="tarjeta flex items-center gap-2 py-2">
                  {/* Fuera del botón de la ficha: un botón dentro de otro no es
                      HTML válido, y el punto tiene su propio toque. */}
                  {etiquetasVisibles && <PuntoEtiquetas alumno={a} catalogo={catalogoEtiquetas} />}
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

        <button className="btn-peligro w-full" onClick={() => setConfirmandoBorrado(true)}>
          Eliminar grupo
        </button>
      </div>

      <HojaConfirmar
        abierta={confirmandoBorrado}
        titulo="Eliminar grupo"
        descripcion={
          (alumnos?.length ?? 0) > 0
            ? `Se eliminará «${grupo.nombre}» y sus ${alumnos?.length} alumnos, con toda su asistencia, observaciones y notas.`
            : `¿Eliminar el grupo «${grupo.nombre}»?`
        }
        textoConfirmar="Eliminar grupo"
        onConfirmar={eliminarGrupo}
        onCerrar={() => setConfirmandoBorrado(false)}
      />

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

/**
 * El punto de color de las etiquetas de un alumno.
 *
 * ESTÁ DUPLICADO A PROPÓSITO —hay otro igual dentro de `Cuaderno.tsx`— y no
 * extraído a `src/components/`. La regla es que las etiquetas de alumnado solo
 * se pintan en las vistas de gestión del maestro, nunca en el pase de lista, ni
 * en las herramientas de aula, ni en nada proyectable; y esa condición tiene
 * que ser física, no una prop opcional que cualquier vista pueda activar por
 * descuido. Un componente compartido sería justo esa prop. La duplicación es de
 * quince líneas de pintado; lo que compra es que añadir una vista con etiquetas
 * exija escribirlas otra vez y pasar por `lib/etiquetasAlumno.test.ts`.
 *
 * Es solo el punto: el nombre va en `title` y en `aria-label`, y al pulsarlo
 * sale en el aviso de abajo.
 */
function PuntoEtiquetas({
  alumno,
  catalogo,
}: {
  alumno: Alumno
  catalogo: EtiquetaAlumno[]
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const puestas = etiquetasDe(alumno, catalogo)
  if (puestas.length === 0) return null

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {puestas.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => mostrarAviso(e.nombre)}
          title={e.nombre}
          aria-label={`Etiqueta ${e.nombre}`}
          style={variablesColor(e.colorId)}
          className="color-dato h-2.5 w-2.5 shrink-0 rounded-full"
        />
      ))}
    </span>
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
          aria-label="Listado de alumnado a importar"
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
          <Campo
            id="alumno-nombre"
            className="campo"
            valor={nombre}
            onValor={setNombre}
            autoFocus
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="alumno-apellidos">
            Apellidos
          </label>
          <Campo
            id="alumno-apellidos"
            className="campo"
            valor={apellidos}
            onValor={setApellidos}
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
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const grupo = useLiveQuery(() => db.grupos.get(grupoId), [grupoId])
  const [nombre, setNombre] = useState<string | null>(null)
  const [horario, setHorario] = useState<FranjaHorario[] | null>(null)

  if (!grupo) return null

  const nombreActual = nombre ?? grupo.nombre
  const horarioActual = horario ?? grupo.horario
  const anterior = { nombre: grupo.nombre, horario: grupo.horario }

  async function guardar() {
    await db.grupos.update(grupoId, { nombre: nombreActual.trim(), horario: horarioActual })
    setNombre(null)
    setHorario(null)
    onCerrar()
    mostrarAviso('Grupo actualizado', async () => {
      await db.grupos.update(grupoId, anterior)
    })
  }

  return (
    <Hoja abierta={abierta} titulo="Editar grupo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="editar-nombre">
            Nombre
          </label>
          <Campo
            id="editar-nombre"
            className="campo"
            valor={nombreActual}
            onValor={setNombre}
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
