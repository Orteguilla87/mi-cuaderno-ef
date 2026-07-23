import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { resumirAsistencia } from '../db/asistencia'
import { db } from '../db/db'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

export function AlumnoDetalle({ alumnoId }: { alumnoId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [editando, setEditando] = useState(false)

  const alumno = useLiveQuery(() => db.alumnos.get(alumnoId), [alumnoId])
  const grupo = useLiveQuery(
    async () => (alumno ? db.grupos.get(alumno.grupoId) : undefined),
    [alumno?.grupoId],
  )
  const asistencias = useLiveQuery(
    () => db.asistencias.where('alumnoId').equals(alumnoId).toArray(),
    [alumnoId],
  )
  const observaciones = useLiveQuery(async () => {
    const lista = await db.observaciones.where('alumnoId').equals(alumnoId).toArray()
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5)
  }, [alumnoId])

  if (alumno === undefined) return null
  if (alumno === null) {
    return (
      <>
        <Cabecera titulo="Alumno no encontrado" atras />
        <div className="p-4">
          <button className="btn-suave w-full" onClick={() => navegar('/grupos')}>
            Volver a Grupos
          </button>
        </div>
      </>
    )
  }

  const resumen = resumirAsistencia(asistencias ?? [])

  async function darDeBaja() {
    if (!alumno) return
    if (!window.confirm(`¿Dar de baja a ${alumno.nombre}? Se conserva su historial.`)) return
    await db.alumnos.update(alumno.id, { activo: false })
    navegar(`/grupos/${alumno.grupoId}`)
    mostrarAviso(`${alumno.nombre} dado de baja`, async () => {
      await db.alumnos.update(alumno.id, { activo: true })
    })
  }

  return (
    <>
      <Cabecera
        titulo={`${alumno.nombre} ${alumno.apellidos}`.trim()}
        atras
        subtitulo={
          grupo && (
            <span className="flex items-center gap-2">
              <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
              <span>{grupo.nombre}</span>
            </span>
          )
        }
        acciones={
          <button className="btn-suave" onClick={() => setEditando((v) => !v)}>
            {editando ? 'Cerrar' : 'Editar'}
          </button>
        }
      />

      <div className="space-y-4 p-4">
        {editando && <FormularioAlumno alumnoId={alumnoId} />}

        <div className="grid grid-cols-4 gap-2">
          <Dato
            valor={resumen.total === 0 ? '—' : `${resumen.pctAsistencia}%`}
            etiqueta="Asistencia"
          />
          <Dato valor={resumen.total === 0 ? '—' : String(resumen.faltas)} etiqueta="Faltas" />
          <Dato
            valor={resumen.total === 0 ? '—' : String(resumen.justificadas)}
            etiqueta="Justif."
          />
          <Dato
            valor={resumen.total === 0 ? '—' : String(resumen.rachaChandal)}
            etiqueta="Racha chándal"
          />
        </div>

        {resumen.total === 0 && (
          <p className="text-center text-sm texto-suave">
            Sin registros de asistencia todavía.
          </p>
        )}

        <section>
          <h2 className="text-lg font-bold">Últimas observaciones</h2>
          <div className="linea-pista mb-2 mt-1.5" aria-hidden />
          {observaciones?.length ? (
            <ul className="space-y-2">
              {observaciones.map((o) => (
                <li key={o.id} className="tarjeta py-3">
                  <div className="flex items-center gap-2 text-sm texto-suave">
                    <span className="font-bold">{o.signo}</span>
                    <span>{o.tipo}</span>
                    <span className="ml-auto">{o.fecha}</span>
                  </div>
                  <p className="mt-1">{o.texto}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm texto-suave">
              Sin observaciones. El registro llega en la fase 3.
            </p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold">Evolución de notas</h2>
          <div className="linea-pista mb-2 mt-1.5" aria-hidden />
          <p className="text-sm texto-suave">
            Disponible cuando se implante la evaluación (fases 4 y 5).
          </p>
        </section>

        <button className="btn w-full text-acento" onClick={darDeBaja}>
          Dar de baja
        </button>
      </div>
    </>
  )
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="tarjeta py-3 text-center">
      <div className="cifra text-2xl font-bold text-primario dark:text-agua">{valor}</div>
      <div className="mt-0.5 text-xs texto-suave">{etiqueta}</div>
    </div>
  )
}

/** Datos personales editables, incluido `apoyos` con su aviso obligatorio (§1.6). */
function FormularioAlumno({ alumnoId }: { alumnoId: string }) {
  const alumno = useLiveQuery(() => db.alumnos.get(alumnoId), [alumnoId])
  if (!alumno) return null

  const actualizar = (cambios: Parameters<typeof db.alumnos.update>[1]) =>
    void db.alumnos.update(alumnoId, cambios)

  return (
    <div className="tarjeta space-y-4">
      <div>
        <label className="etiqueta" htmlFor="f-nombre">
          Nombre
        </label>
        <input
          id="f-nombre"
          className="campo"
          value={alumno.nombre}
          onChange={(e) => actualizar({ nombre: e.target.value })}
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor="f-apellidos">
          Apellidos
        </label>
        <input
          id="f-apellidos"
          className="campo"
          value={alumno.apellidos}
          onChange={(e) => actualizar({ apellidos: e.target.value })}
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor="f-alias">
          Alias
        </label>
        <input
          id="f-alias"
          className="campo"
          value={alumno.alias}
          onChange={(e) => actualizar({ alias: e.target.value })}
        />
        <p className="mt-1 text-xs texto-suave">
          Cómo le llamas en clase. El agente de voz lo usará para reconocerle.
        </p>
      </div>

      <div>
        <label className="etiqueta" htmlFor="f-apoyos">
          Apoyos
        </label>
        <div className="mb-2 rounded-lg border border-aviso/40 bg-aviso-claro p-2 text-xs text-aviso-oscuro dark:border-aviso/50 dark:bg-noche-elevada dark:text-aviso-claro">
          No escribas diagnósticos: solo pautas prácticas. Este campo nunca aparece en informes
          exportables; solo viaja en el backup cifrado.
        </div>
        <textarea
          id="f-apoyos"
          className="campo h-24 resize-none py-2"
          value={alumno.apoyos ?? ''}
          onChange={(e) => actualizar({ apoyos: e.target.value })}
          placeholder="Se sitúa cerca de mí al explicar; necesita consigna corta."
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="f-notas">
          Notas privadas
        </label>
        <textarea
          id="f-notas"
          className="campo h-24 resize-none py-2"
          value={alumno.notasPrivadas ?? ''}
          onChange={(e) => actualizar({ notasPrivadas: e.target.value })}
        />
      </div>
    </div>
  )
}
