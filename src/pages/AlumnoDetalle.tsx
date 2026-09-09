import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Link2, Link2Off, Plus, Tags } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Hoja } from '../components/Hoja'
import { SelectorColor, variablesColor } from '../components/SelectorColor'
import {
  asignar,
  crearEtiqueta,
  etiquetasPuestasDe,
  fijarCaducidad,
  etiquetas as leerEtiquetas,
  type EtiquetaPuesta,
} from '../db/etiquetasAlumno'
import { desvincular, escribirCompartido, fichasDe, otrasFichasDe } from '../db/personas'
import { Cabecera } from '../components/Cabecera'
import { Campo, CampoArea } from '../components/Campo'
import { HojaConfirmar } from '../components/HojaConfirmar'
import { ListaObservacionesEnLinea } from '../components/ObservacionEnLinea'
import { TituloSeccion } from '../components/TituloSeccion'
import { resumirAsistencia } from '../db/asistencia'
import { db } from '../db/db'
import type { Alumno, EtiquetaAlumno } from '../db/types'
import { finDelDia, formatoCorto, isoDeMs } from '../lib/fechas'
import { ICONOS_ETIQUETA, iconoDe } from '../lib/iconosEtiqueta'
import { COLOR_POR_DEFECTO } from '../lib/paleta'
import { normalizarTexto } from '../lib/texto'
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
  const puestas = etiquetasPuestasDe(alumno, catalogo)
  if (puestas.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      {puestas.map(({ etiqueta: e, caducada }) => {
        const Icono = iconoDe(e.icono)
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => mostrarAviso(caducada ? `${e.nombre} · caducada` : e.nombre)}
            title={caducada ? `${e.nombre} (caducada)` : e.nombre}
            aria-label={`Etiqueta ${e.nombre}${caducada ? ', caducada' : ''}`}
            style={variablesColor(e.colorId)}
            className={
              'flex shrink-0 items-center gap-1 rounded-full border border-borde px-2 py-1 text-xs font-bold uppercase leading-none tracking-wide dark:border-noche-borde ' +
              // Caducada: atenuada Y tachada. La opacidad sola no basta.
              (caducada ? 'opacity-50 line-through' : '')
            }
          >
            {Icono ? (
              <span
                className="color-dato flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                aria-hidden
              >
                <Icono size={11} strokeWidth={3} className="color-dato-marca" />
              </span>
            ) : (
              <span className="color-dato h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden />
            )}
            {e.abreviatura}
          </button>
        )
      })}
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
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const catalogo = useLiveQuery(() => leerEtiquetas(), [])
  const puestas = etiquetasPuestasDe(alumno, catalogo ?? [])
  const puestasIds = new Set(alumno.etiquetas ?? [])

  // Las otras fichas de la misma persona: si las hay, la etiqueta que se
  // toque aquí se toca también allí, y eso hay que decirlo antes de la primera
  // vez, no después.
  const otras = useLiveQuery(async () => otrasFichasDe(alumno), [alumno.id, alumno.personaId]) ?? []
  const pendiente = useAvisosVistos((s) => s.pendiente('etiquetas-compartidas'))
  const marcarVisto = useAvisosVistos((s) => s.marcarVisto)

  const [confirmando, setConfirmando] = useState<{
    etiqueta: EtiquetaAlumno
    poner: boolean
  } | null>(null)
  /** Etiqueta temporal recién puesta, esperando a que se le proponga el fin. */
  const [fechando, setFechando] = useState<EtiquetaAlumno | null>(null)
  const [creando, setCreando] = useState<string | null>(null)
  const [consulta, setConsulta] = useState('')

  const visibles = (catalogo ?? []).filter((e) =>
    normalizarTexto(e.nombre).includes(normalizarTexto(consulta)),
  )
  const exacta = (catalogo ?? []).some(
    (e) => normalizarTexto(e.nombre) === normalizarTexto(consulta),
  )
  const puedeCrear = consulta.trim().length > 0 && !exacta

  async function alternar(etiqueta: EtiquetaAlumno, poner: boolean) {
    if (otras.length > 0 && pendiente) {
      setConfirmando({ etiqueta, poner })
      return
    }
    await aplicar(etiqueta, poner)
  }

  async function aplicar(etiqueta: EtiquetaAlumno, poner: boolean) {
    await asignar(alumno.id, etiqueta.id, poner)
    // La fecha de fin se propone DESPUÉS de ponerla, no antes: así ponerla
    // sigue siendo un toque y la caducidad es una decisión aparte que se puede
    // saltar sin más.
    if (poner && etiqueta.temporal) setFechando(etiqueta)
  }

  async function confirmar() {
    if (!confirmando) return
    marcarVisto('etiquetas-compartidas')
    const { etiqueta, poner } = confirmando
    setConfirmando(null)
    await aplicar(etiqueta, poner)
  }

  /** Crea la etiqueta en el CATÁLOGO —queda para todo el alumnado— y se la pone. */
  async function crearYPoner(datos: Parameters<typeof crearEtiqueta>[0]) {
    const nueva = await crearEtiqueta(datos)
    setCreando(null)
    setConsulta('')
    await asignar(alumno.id, nueva.id, true)
    if (nueva.temporal) setFechando(nueva)
    mostrarAviso(`«${nueva.nombre}» creada y puesta`)
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

      {/* Las puestas que CADUCAN, con su fecha y sus dos salidas de un toque.
          Van arriba y aparte porque son lo único de aquí que cambia solo con
          que pase el tiempo. */}
      {puestas.some((p) => p.hasta !== undefined) && (
        <ul className="mb-3 space-y-1">
          {puestas
            .filter((p) => p.hasta !== undefined)
            .map((p) => (
              <FilaCaducidad
                key={p.etiqueta.id}
                puesta={p}
                onRetirar={() => void asignar(alumno.id, p.etiqueta.id, false)}
                onProlongar={() => setFechando(p.etiqueta)}
              />
            ))}
        </ul>
      )}

      {/* Buscar o crear: mismo patrón que las etiquetas de material, que ya se
          crean al vuelo desde la ficha de un material. */}
      <Campo
        className="campo mb-2"
        valor={consulta}
        onValor={setConsulta}
        placeholder="Buscar o crear etiqueta"
        aria-label="Buscar o crear etiqueta"
      />

      <div className="flex flex-wrap gap-2">
        {visibles.map((e) => {
          const activa = puestasIds.has(e.id)
          const Icono = iconoDe(e.icono)
          return (
            <button
              key={e.id}
              aria-pressed={activa}
              onClick={() => void alternar(e, !activa)}
              style={variablesColor(e.colorId)}
              className={
                'flex min-h-tap items-center gap-2 rounded-full border px-3 text-sm font-semibold transition active:scale-95 ' +
                (activa
                  ? 'color-dato-borde border-2 bg-agua-claro dark:bg-noche-elevada'
                  : 'border-borde dark:border-noche-borde')
              }
            >
              {Icono ? (
                <span
                  className="color-dato flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  aria-hidden
                >
                  <Icono size={13} strokeWidth={2.5} className="color-dato-marca" />
                </span>
              ) : (
                <span className="color-dato h-3 w-3 shrink-0 rounded-full" aria-hidden />
              )}
              {e.nombre}
            </button>
          )
        })}

        {puedeCrear && (
          <button
            className="btn-suave min-h-tap px-3 text-sm"
            onClick={() => setCreando(consulta.trim())}
          >
            <Plus size={16} aria-hidden />
            Crear «{consulta.trim()}»
          </button>
        )}
      </div>

      {catalogo?.length === 0 && !puedeCrear && (
        <button className="btn-suave mt-2 w-full" onClick={() => navegar('/etiquetas-alumnado')}>
          <Tags size={20} aria-hidden />
          Gestionar el catálogo
        </button>
      )}

      <HojaEtiquetaNueva nombre={creando} onCrear={crearYPoner} onCerrar={() => setCreando(null)} />

      <HojaCaducidad
        etiqueta={fechando}
        hasta={fechando ? alumno.etiquetasHasta?.[fechando.id] : undefined}
        onGuardar={async (hasta) => {
          if (!fechando) return
          await fijarCaducidad(alumno.id, fechando.id, hasta)
          setFechando(null)
        }}
        onCerrar={() => setFechando(null)}
      />

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

/**
 * Una etiqueta con fecha de fin. Caducada, se atenúa Y se tacha —el color no
 * puede ser lo único que lo diga— y ofrece las dos únicas salidas: retirarla o
 * prolongarla. NUNCA se retira sola: la puso el usuario, y es él quien decide
 * que ya no vale.
 */
function FilaCaducidad({
  puesta: { etiqueta, hasta, caducada },
  onRetirar,
  onProlongar,
}: {
  puesta: EtiquetaPuesta
  onRetirar: () => void
  onProlongar: () => void
}) {
  const Icono = iconoDe(etiqueta.icono)
  return (
    <li
      className={
        'tarjeta flex flex-wrap items-center gap-2 py-2 ' + (caducada ? 'border-dashed' : '')
      }
    >
      <span
        className={
          'color-dato flex h-6 w-6 shrink-0 items-center justify-center rounded-full ' +
          (caducada ? 'opacity-50' : '')
        }
        style={variablesColor(etiqueta.colorId)}
        aria-hidden
      >
        {Icono && <Icono size={14} strokeWidth={2.5} className="color-dato-marca" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className={'block text-sm font-semibold ' + (caducada ? 'line-through' : '')}>
          {etiqueta.nombre}
        </span>
        <span className={'block text-xs ' + (caducada ? 'text-acento' : 'texto-suave')}>
          {caducada ? 'Caducada el ' : 'Hasta el '}
          {hasta !== undefined ? formatoCorto(isoDeMs(hasta)) : '—'}
        </span>
      </span>

      <button className="btn-suave min-h-tap px-3 text-sm" onClick={onProlongar}>
        Prolongar
      </button>
      <button className="btn-fantasma min-h-tap px-3 text-sm" onClick={onRetirar}>
        Retirar
      </button>
    </li>
  )
}

/**
 * Fecha de fin de una asignación temporal.
 *
 * Se puede dejar VACÍA: hay lesiones de las que no se sabe cuánto van a durar,
 * y obligar a inventarse una fecha produciría caducidades falsas que el maestro
 * acabaría por no mirar.
 */
function HojaCaducidad({
  etiqueta,
  hasta,
  onGuardar,
  onCerrar,
}: {
  etiqueta: EtiquetaAlumno | null
  hasta: number | undefined
  onGuardar: (hasta: number | undefined) => Promise<void>
  onCerrar: () => void
}) {
  const [iso, setIso] = useState('')

  useEffect(() => {
    if (!etiqueta) return
    setIso(hasta !== undefined ? isoDeMs(hasta) : '')
  }, [etiqueta, hasta])

  return (
    <Hoja abierta={etiqueta !== null} titulo="¿Hasta cuándo?" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          «{etiqueta?.nombre}» es temporal. Pon el último día en que vale, o déjalo vacío si
          todavía no se sabe. Pasada la fecha se avisa, pero nunca se quita sola.
        </p>

        <div>
          <label className="etiqueta" htmlFor="etq-hasta">
            Último día
          </label>
          <input
            id="etq-hasta"
            type="date"
            className="campo cifra"
            value={iso}
            onChange={(e) => setIso(e.target.value)}
          />
        </div>

        <button
          className="btn-primario w-full"
          onClick={() => void onGuardar(iso ? finDelDia(iso) : undefined)}
        >
          {iso ? 'Guardar la fecha' : 'Dejarla indefinida'}
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Crear una etiqueta SIN salir de la ficha, con el nombre ya escrito en el
 * buscador. Queda en el CATÁLOGO, disponible para todo el alumnado: es el mismo
 * trato que las etiquetas de material, que se crean al vuelo desde la ficha de
 * un material y no pertenecen a ese material.
 */
function HojaEtiquetaNueva({
  nombre,
  onCrear,
  onCerrar,
}: {
  nombre: string | null
  onCrear: (datos: Parameters<typeof crearEtiqueta>[0]) => Promise<void>
  onCerrar: () => void
}) {
  const [abreviatura, setAbreviatura] = useState('')
  const [colorId, setColorId] = useState(COLOR_POR_DEFECTO)
  const [icono, setIcono] = useState<string | undefined>(undefined)
  const [temporal, setTemporal] = useState(false)

  useEffect(() => {
    if (nombre === null) return
    setAbreviatura('')
    setColorId(COLOR_POR_DEFECTO)
    setIcono(undefined)
    setTemporal(false)
  }, [nombre])

  const abreviaturaEfectiva = abreviatura.trim() || (nombre ?? '').trim().slice(0, 3).toUpperCase()

  return (
    <Hoja abierta={nombre !== null} titulo="Nueva etiqueta" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          «{nombre}» quedará en el catálogo: podrás ponérsela a cualquier alumno, no solo a este.
        </p>

        <div>
          <label className="etiqueta" htmlFor="etq-nueva-abrev">
            Abreviatura
          </label>
          <Campo
            id="etq-nueva-abrev"
            className="campo"
            valor={abreviatura}
            onValor={(v) => setAbreviatura(v.slice(0, 3))}
            placeholder={abreviaturaEfectiva || 'TDA'}
          />
          <p className="mt-1 text-xs texto-suave">
            Hasta 3 letras. Es lo que se ve junto al color en el Cuaderno y en el pase de lista.
          </p>
        </div>

        <div>
          <span className="etiqueta">Color</span>
          <SelectorColor valor={colorId} onValor={setColorId} etiqueta="Color de la etiqueta" />
        </div>

        <div>
          <span className="etiqueta">Icono</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Icono de la etiqueta">
            <button
              type="button"
              aria-pressed={icono === undefined}
              onClick={() => setIcono(undefined)}
              className={
                'flex min-h-tap items-center gap-2 rounded-xl border px-3 text-sm font-semibold ' +
                (icono === undefined
                  ? 'border-primario border-2 bg-agua-claro dark:bg-noche-elevada'
                  : 'border-borde dark:border-noche-borde')
              }
            >
              <span
                className="color-dato h-4 w-4 shrink-0 rounded-full"
                style={variablesColor(colorId)}
                aria-hidden
              />
              Sin icono
            </button>
            {ICONOS_ETIQUETA.map(({ id, nombre: nom, Icono }) => (
              <button
                key={id}
                type="button"
                aria-pressed={icono === id}
                aria-label={nom}
                onClick={() => setIcono(id)}
                className={
                  'flex min-h-tap min-w-tap items-center justify-center rounded-xl border ' +
                  (icono === id
                    ? 'border-primario border-2 bg-agua-claro dark:bg-noche-elevada'
                    : 'border-borde dark:border-noche-borde')
                }
              >
                <span
                  className="color-dato flex h-7 w-7 items-center justify-center rounded-full"
                  style={variablesColor(colorId)}
                  aria-hidden
                >
                  <Icono size={16} strokeWidth={2.5} className="color-dato-marca" />
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={temporal}
          onClick={() => setTemporal((v) => !v)}
          className={
            'flex min-h-tap w-full items-center gap-3 rounded-xl border px-3 text-left transition ' +
            (temporal
              ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
              : 'border-borde dark:border-noche-borde')
          }
        >
          <span
            className={
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ' +
              (temporal
                ? 'border-primario bg-primario text-white'
                : 'border-borde dark:border-noche-borde')
            }
            aria-hidden
          >
            {temporal && <Check size={14} strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Es temporal</span>
            <span className="block text-xs texto-suave">
              Al ponerla se propone una fecha de fin. Una lesión sí; ACNEE o TDAH, no.
            </span>
          </span>
        </button>

        <button
          className="btn-primario w-full"
          onClick={() =>
            void onCrear({
              nombre: nombre ?? '',
              abreviatura: abreviaturaEfectiva,
              colorId,
              icono,
              temporal,
            })
          }
        >
          Crear y ponérsela
        </button>
      </div>
    </Hoja>
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
