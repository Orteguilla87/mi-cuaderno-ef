import { useLiveQuery } from 'dexie-react-hooks'
import { Tags } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { variablesColor } from '../components/SelectorColor'
import { asignar, etiquetas as leerEtiquetas } from '../db/etiquetasAlumno'
import { Cabecera } from '../components/Cabecera'
import { Campo, CampoArea } from '../components/Campo'
import { HojaConfirmar } from '../components/HojaConfirmar'
import { ListaObservacionesEnLinea } from '../components/ObservacionEnLinea'
import { TituloSeccion } from '../components/TituloSeccion'
import { resumirAsistencia } from '../db/asistencia'
import { db } from '../db/db'
import type { Alumno } from '../db/types'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

export function AlumnoDetalle({ alumnoId }: { alumnoId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [editando, setEditando] = useState(false)
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)

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

      <div className="space-y-4 p-4 apaisado:grid apaisado:grid-cols-2 apaisado:items-start apaisado:gap-4 apaisado:space-y-0 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
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
            <TituloSeccion>Evolución de notas</TituloSeccion>
            <p className="text-sm texto-suave">
              Disponible cuando se implante la evaluación (fases 4 y 5).
            </p>
          </section>

          <button className="btn-peligro w-full" onClick={() => setConfirmandoBaja(true)}>
            Dar de baja
          </button>
        </div>

        <section>
          <TituloSeccion>Últimas observaciones</TituloSeccion>
          {observaciones?.length ? (
            // Edición en el sitio: aquí y solo aquí. La timeline y la vista de
            // grupo enseñan lo mismo en pantallas que se proyectan.
            <ListaObservacionesEnLinea observaciones={observaciones} contexto="ficha-alumno" />
          ) : (
            <p className="text-sm texto-suave">
              Sin observaciones. El registro llega en la fase 3.
            </p>
          )}
        </section>
      </div>

      <HojaConfirmar
        abierta={confirmandoBaja}
        titulo="Dar de baja"
        descripcion={`¿Dar de baja a ${alumno.nombre}? Se conserva su historial.`}
        textoConfirmar="Dar de baja"
        onConfirmar={darDeBaja}
        onCerrar={() => setConfirmandoBaja(false)}
      />
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

/**
 * Etiquetas del alumno (`db/etiquetasAlumno.ts`). Van pegadas a `apoyos` porque
 * son lo mismo en cuanto a protección: datos de categoría especial que no salen
 * del dispositivo salvo dentro de la copia cifrada.
 *
 * Aquí se ponen y se quitan; el catálogo se gestiona en «Etiquetas de
 * alumnado». Lo único que se ve de ellas fuera de esta ficha es un punto de
 * color en la columna de alumnado del Cuaderno.
 */
function EtiquetasDelAlumno({ alumno }: { alumno: Alumno }) {
  const catalogo = useLiveQuery(() => leerEtiquetas(), [])
  const puestas = new Set(alumno.etiquetas ?? [])

  return (
    <div>
      <span className="etiqueta">Etiquetas</span>
      <div className="aviso mb-2 text-xs">
        Solo se ven en el Cuaderno: nunca en informes, exportaciones, pase de lista ni nada que se
        proyecte.
      </div>
      {catalogo && catalogo.length === 0 ? (
        <button className="btn-suave w-full" onClick={() => navegar('/etiquetas-alumnado')}>
          <Tags size={20} aria-hidden />
          Crear la primera etiqueta
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(catalogo ?? []).map((e) => {
            const activa = puestas.has(e.id)
            return (
              <button
                key={e.id}
                aria-pressed={activa}
                onClick={() => void asignar(alumno.id, e.id, !activa)}
                style={variablesColor(e.colorId)}
                className={
                  'flex min-h-tap items-center gap-2 rounded-full border px-3 text-sm font-semibold transition active:scale-95 ' +
                  (activa
                    ? 'color-dato-borde border-2 bg-agua-claro dark:bg-noche-elevada'
                    : 'border-borde dark:border-noche-borde')
                }
              >
                <span className="color-dato h-3 w-3 shrink-0 rounded-full" aria-hidden />
                {e.nombre}
              </button>
            )
          })}
        </div>
      )}
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
        <Campo
          id="f-nombre"
          className="campo"
          valor={alumno.nombre}
          onValor={(v) => actualizar({ nombre: v })}
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor="f-apellidos">
          Apellidos
        </label>
        <Campo
          id="f-apellidos"
          className="campo"
          valor={alumno.apellidos}
          onValor={(v) => actualizar({ apellidos: v })}
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor="f-alias">
          Alias
        </label>
        <Campo
          id="f-alias"
          className="campo"
          valor={alumno.alias}
          onValor={(v) => actualizar({ alias: v })}
        />
        <p className="mt-1 text-xs texto-suave">
          Cómo le llamas en clase. El agente de voz lo usará para reconocerle.
        </p>
      </div>

      <div>
        <label className="etiqueta" htmlFor="f-apoyos">
          Apoyos
        </label>
        <div className="aviso mb-2 text-xs">
          No escribas diagnósticos: solo pautas prácticas. Este campo nunca aparece en informes
          exportables; solo viaja en el backup cifrado.
        </div>
        <CampoArea
          id="f-apoyos"
          className="campo h-24 resize-none py-2"
          valor={alumno.apoyos ?? ''}
          onValor={(v) => actualizar({ apoyos: v })}
          placeholder="Se sitúa cerca de mí al explicar; necesita consigna corta."
        />
      </div>

      <EtiquetasDelAlumno alumno={alumno} />

      <div>
        <label className="etiqueta" htmlFor="f-notas">
          Notas privadas
        </label>
        <CampoArea
          id="f-notas"
          className="campo h-24 resize-none py-2"
          valor={alumno.notasPrivadas ?? ''}
          onValor={(v) => actualizar({ notasPrivadas: v })}
        />
      </div>
    </div>
  )
}
