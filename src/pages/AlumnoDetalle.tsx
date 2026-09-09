import { useLiveQuery } from 'dexie-react-hooks'
import { Link2, Link2Off, Tags } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { variablesColor } from '../components/SelectorColor'
import { asignar, etiquetas as leerEtiquetas, etiquetasDe } from '../db/etiquetasAlumno'
import { desvincular, escribirCompartido, fichasDe, otrasFichasDe } from '../db/personas'
import { Cabecera } from '../components/Cabecera'
import { Campo, CampoArea } from '../components/Campo'
import { HojaConfirmar } from '../components/HojaConfirmar'
import { ListaObservacionesEnLinea } from '../components/ObservacionEnLinea'
import { TituloSeccion } from '../components/TituloSeccion'
import { resumirAsistencia } from '../db/asistencia'
import { db } from '../db/db'
import type { Alumno, EtiquetaAlumno } from '../db/types'
import { navegar } from '../lib/router'
import { useAvisosVistos } from '../store/avisosVistos'
import { useEtiquetasVisibles } from '../store/etiquetasVisibles'
import { useUI } from '../store/ui'

export function AlumnoDetalle({ alumnoId }: { alumnoId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [editando, setEditando] = useState(false)
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)

  const etiquetasVisibles = useEtiquetasVisibles((e) => e.visibles)
  const catalogoEtiquetas = useLiveQuery(() => leerEtiquetas(), []) ?? []

  const alumno = useLiveQuery(() => db.alumnos.get(alumnoId), [alumnoId])
  const grupo = useLiveQuery(
    async () => (alumno ? db.grupos.get(alumno.grupoId) : undefined),
    [alumno?.grupoId],
  )
  const asistencias = useLiveQuery(
    () => db.asistencias.where('alumnoId').equals(alumnoId).toArray(),
    [alumnoId],
  )
  /**
   * Las fichas de la MISMA PERSONA: esta y las de sus otras áreas, si el
   * usuario las vinculó. Sin vincular es solo esta, y todo lo de abajo se
   * comporta exactamente igual que antes.
   */
  const fichas = useLiveQuery(
    async () => (alumno ? fichasDe(alumno) : []),
    [alumno?.id, alumno?.personaId],
  )
  const otras = (fichas ?? []).filter((f) => f.id !== alumnoId)

  const gruposDeLaPersona = useLiveQuery(
    async () => db.grupos.bulkGet((fichas ?? []).map((f) => f.grupoId)),
    [fichas],
  )
  const nombresGrupo = new Map(
    (gruposDeLaPersona ?? []).filter((g) => g !== undefined).map((g) => [g.id, g.nombre]),
  )

  /**
   * Las observaciones de TODAS sus fichas: el niño es uno, y saber que en
   * Lengua lleva tres semanas revuelto explica lo que pasa en EF. Las de otra
   * área se pintan en lectura y NO cuentan en el balance de este grupo, que
   * sale de `contadoresPorAlumno(grupoId)` y no ve nada de esto.
   */
  const observaciones = useLiveQuery(async () => {
    const ids = (fichas ?? [alumno]).filter((f) => f !== undefined).map((f) => f.id)
    if (ids.length === 0) return []
    const lista = await db.observaciones.where('alumnoId').anyOf(ids).toArray()
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5)
  }, [fichas])

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
          {/* Se ven sin entrar a editar: es lo primero que hace falta saber al
              abrir la ficha, se llegue desde el grupo o desde el Cuaderno. */}
          {etiquetasVisibles && <PuntoEtiquetas alumno={alumno} catalogo={catalogoEtiquetas} />}

          {otras.length > 0 && (
            <FichasVinculadas alumno={alumno} otras={otras} nombresGrupo={nombresGrupo} />
          )}

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
            <ListaObservacionesEnLinea
              observaciones={observaciones}
              contexto="ficha-alumno"
              grupoPropio={alumno.grupoId}
              nombresGrupo={nombresGrupo}
            />
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

/**
 * En qué otros grupos existe la MISMA PERSONA, y cómo llegar a esas fichas.
 *
 * Discreto a propósito: es contexto, no una acción del día a día. Lo que tiene
 * que quedar claro de un vistazo es que lo que se toque aquí de la persona
 * —etiquetas y pautas— se toca también allí, y que lo del área no.
 */
function FichasVinculadas({
  alumno,
  otras,
  nombresGrupo,
}: {
  alumno: Alumno
  otras: Alumno[]
  nombresGrupo: Map<string, string>
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [confirmando, setConfirmando] = useState(false)

  async function separar() {
    setConfirmando(false)
    const { deshacer } = await desvincular(alumno.id)
    mostrarAviso('Ficha desvinculada', deshacer)
  }

  return (
    <section className="tarjeta space-y-2 py-3">
      <div className="flex items-center gap-2">
        <Link2 size={18} className="shrink-0 text-primario dark:text-agua" aria-hidden />
        <span className="etiqueta mb-0">La misma persona, en otros grupos</span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {otras.map((f) => (
          <li key={f.id}>
            <button
              className="btn-suave"
              onClick={() => navegar(`/alumnos/${f.id}`)}
              aria-label={`Abrir su ficha de ${nombresGrupo.get(f.grupoId) ?? 'otro grupo'}`}
            >
              {nombresGrupo.get(f.grupoId) ?? 'Otro grupo'}
              <span aria-hidden>›</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs texto-suave">
        Las etiquetas y las pautas de apoyo se comparten entre estas fichas. Las notas, la
        asistencia y el Cuaderno son de cada área.
      </p>

      <button className="btn-fantasma w-full" onClick={() => setConfirmando(true)}>
        <Link2Off size={18} aria-hidden />
        Desvincular esta ficha
      </button>

      <HojaConfirmar
        abierta={confirmando}
        titulo="Desvincular esta ficha"
        descripcion={
          'Dejará de compartir etiquetas y pautas con las demás. Lo que ya tenga se CONSERVA ' +
          'aquí y allí, como propio de cada ficha: no se borra nada. Puedes volver a vincularla ' +
          'cuando quieras.'
        }
        textoConfirmar="Desvincular"
        onConfirmar={separar}
        onCerrar={() => setConfirmando(false)}
      />
    </section>
  )
}

/**
 * El punto de color y la abreviatura de las etiquetas de un alumno.
 *
 * VIVE AQUÍ DENTRO A PROPÓSITO, y no en `src/components/`: las etiquetas de
 * alumnado solo se pintan en las vistas de gestión del maestro —nunca en el
 * generador de equipos, ni en el sorteo, ni en el marcador, ni en nada que
 * pueda acabar proyectado—, y esa condición tiene que ser física, no una prop
 * opcional que otra vista pueda activar por descuido.
 * `lib/etiquetasAlumno.test.ts` comprueba quién puede mencionarlo.
 */
function PuntoEtiquetas({ alumno, catalogo }: { alumno: Alumno; catalogo: EtiquetaAlumno[] }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const puestas = etiquetasDe(alumno, catalogo)
  if (puestas.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      {puestas.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => mostrarAviso(e.nombre)}
          title={e.nombre}
          aria-label={`Etiqueta ${e.nombre}`}
          style={variablesColor(e.colorId)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-borde px-2 py-1 text-xs font-bold uppercase leading-none tracking-wide dark:border-noche-borde"
        >
          <span className="color-dato h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden />
          {e.abreviatura}
        </button>
      ))}
    </div>
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
 * alumnado». Fuera de esta ficha se ven como punto de color más abreviatura en
 * el Cuaderno, en la ficha del grupo y en el pase de lista, y en ningún sitio
 * más.
 */
function EtiquetasDelAlumno({ alumno }: { alumno: Alumno }) {
  const catalogo = useLiveQuery(() => leerEtiquetas(), [])
  const puestas = new Set(alumno.etiquetas ?? [])

  // Las otras fichas de la misma persona: si las hay, la etiqueta que se
  // toque aquí se toca también allí, y eso hay que decirlo antes de la primera
  // vez, no después.
  const otras = useLiveQuery(async () => otrasFichasDe(alumno), [alumno.id, alumno.personaId]) ?? []
  const pendiente = useAvisosVistos((s) => s.pendiente('etiquetas-compartidas'))
  const marcarVisto = useAvisosVistos((s) => s.marcarVisto)
  const [confirmando, setConfirmando] = useState<{ etiquetaId: string; poner: boolean } | null>(
    null,
  )

  async function alternar(etiquetaId: string, poner: boolean) {
    if (otras.length > 0 && pendiente) {
      setConfirmando({ etiquetaId, poner })
      return
    }
    await asignar(alumno.id, etiquetaId, poner)
  }

  async function confirmar() {
    if (!confirmando) return
    marcarVisto('etiquetas-compartidas')
    await asignar(alumno.id, confirmando.etiquetaId, confirmando.poner)
    setConfirmando(null)
  }

  return (
    <div>
      <span className="etiqueta">Etiquetas</span>
      <div className="aviso mb-2 text-xs">
        Solo se ven en tus pantallas de trabajo —Cuaderno, ficha del grupo, pase de lista y esta
        ficha—: nunca en informes, exportaciones, herramientas de aula ni nada que se proyecte.
      </div>
      {otras.length > 0 && (
        <p className="mb-2 text-xs texto-suave">
          Es la condición del niño, no de la asignatura: lo que pongas o quites aquí aparece
          también en sus otras fichas.
        </p>
      )}
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
                onClick={() => void alternar(e.id, !activa)}
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

      <HojaConfirmar
        abierta={confirmando !== null}
        titulo="Esta etiqueta se comparte"
        descripcion={
          `Esta ficha está vinculada con ${otras.length === 1 ? 'otra' : `otras ${otras.length}`} ` +
          'de la misma persona. Las etiquetas son del niño, no de la asignatura, así que este ' +
          'cambio aparecerá en todas sus fichas. Solo se avisa esta vez.'
        }
        textoConfirmar={confirmando?.poner ? 'Poner en todas' : 'Quitar de todas'}
        onConfirmar={confirmar}
        onCerrar={() => setConfirmando(null)}
      />
    </div>
  )
}

/** Datos personales editables, incluido `apoyos` con su aviso obligatorio (§1.6). */
function FormularioAlumno({ alumnoId }: { alumnoId: string }) {
  const alumno = useLiveQuery(() => db.alumnos.get(alumnoId), [alumnoId])
  if (!alumno) return null

  const actualizar = (cambios: Parameters<typeof db.alumnos.update>[1]) =>
    void db.alumnos.update(alumnoId, cambios)

  /**
   * Los campos de la PERSONA van por `escribirCompartido`: si la ficha está
   * vinculada con la de otra área, las pautas y la nota se escriben en las dos.
   * Sin vincular escribe exactamente en una y es lo mismo que `actualizar`.
   */
  const actualizarCompartido = (cambios: Parameters<typeof escribirCompartido>[1]) =>
    void escribirCompartido(alumnoId, cambios)

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
          onValor={(v) => actualizarCompartido({ apoyos: v })}
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
          onValor={(v) => actualizarCompartido({ notasPrivadas: v })}
        />
      </div>
    </div>
  )
}
