import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive,
  ArchiveRestore,
  CalendarOff,
  CalendarPlus,
  CalendarRange,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Layers,
  MinusCircle,
  MoreVertical,
  MoveRight,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Campo, CampoArea } from '../components/Campo'
import { Hoja } from '../components/Hoja'
import { NavegadorFecha } from '../components/NavegadorFecha'
import { Recursos } from '../components/Recursos'
import { SelectorCriterios } from '../components/SelectorCriterios'
import { TituloSeccion } from '../components/TituloSeccion'
import { coberturaInfantil } from '../db/coberturaInfantil'
import { leerCursoActivo } from '../db/curso'
import { db } from '../db/db'
import {
  anadirCursoAUnidad,
  anadirSesionPlan,
  aplicarVolcado,
  archivarUnidad,
  contarImpactoUnidad,
  copiarUnidad,
  crearSesion,
  crearUnidad,
  duplicarSesionPlan,
  eliminarSesionPlan,
  eliminarUnidad,
  guardarSesionPlan,
  impactoQuitarCurso,
  lunesDe,
  motivoNoAdmiteCurso,
  marcarCriteriosRevisados,
  moverUnidad,
  quitarCursoDeUnidad,
  previsualizarVolcado,
  resumenCopia,
  sesionesDe,
  type ImpactoQuitarCurso,
  type ImpactoUnidad,
  type ModoVolcado,
  type PreviaVolcado,
  type ResumenCopia,
} from '../db/planificador'
import { huecosCanceladosDe, huecosDe, type HuecoCalendario } from '../db/sesiones'
import { ordinalesDelDia, rotuloOrdinal } from '../lib/clasesDelDia'
import { BotonNoHayClase, FilasCanceladas } from '../components/ClasesCanceladas'
import type { Etapa, Recurso, SesionPlan, UnidadDidactica } from '../db/types'
import { estadoDia, type EstadoDia } from '../lib/calendarioEscolar'
import { aISO, diaLectivo, formatoCorto, formatoDiaCorto, NOMBRES_DIA, sumarDias } from '../lib/fechas'
import { ETAPA_POR_DEFECTO, ETAPA_UNICA, ETAPAS_DISPONIBLES, etapaVisible, nivelesDe } from '../lib/etapas'
import { ambitoUnidad, terminologia } from '../lib/literales'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'
import { useVistaPlanificador, type VistaPlanificador } from '../store/vistaPlanificador'
import { PlanGrupo } from './PlanGrupo'
import { variablesColor } from '../components/SelectorColor'

/** Etiqueta corta del motivo por el que un día no es lectivo (misma lógica que Hoy/Calendario). */
function etiquetaNoLectivo(estado: Exclude<EstadoDia, { tipo: 'lectivo' }>): string {
  switch (estado.tipo) {
    case 'finDeSemana':
      return 'Fin de semana'
    case 'festivo':
      return 'Día festivo'
    case 'periodo':
      return estado.nombre
    case 'vacaciones':
      return 'Vacaciones'
    case 'antesDeCurso':
      return 'El curso aún no ha empezado'
    case 'despuesDeCurso':
      return 'El curso ha terminado'
  }
}

const SUBTITULOS: Record<VistaPlanificador, string> = {
  grupo: 'Programación por grupo',
  semana: '',
  // Con las dos etapas activas el listado las mezcla y no hay etapa que
  // consultar en la cabecera, así que se nombran las dos. Con una sola
  // (lib/etapas.ts) se usa su término y punto: nombrar aquí la etapa apagada
  // sería hablarle al usuario de algo que no existe en su app.
  unidades:
    ETAPA_UNICA !== null
      ? terminologia(ETAPA_UNICA).unidadPlural
      : 'Unidades y situaciones de aprendizaje',
}

export function Planificador() {
  // Pestaña y semana viven en un store, no aquí: editar una sesión desmonta
  // esta pantalla y con estado local «Atrás» volvía siempre a Grupo y a la
  // semana en curso.
  const vista = useVistaPlanificador((s) => s.vista)
  const setVista = useVistaPlanificador((s) => s.fijarVista)
  const lunes = useVistaPlanificador((s) => s.lunes)
  const setLunes = useVistaPlanificador((s) => s.fijarLunes)

  return (
    <>
      <Cabecera
        titulo="Planificador"
        subtitulo={
          vista === 'semana' ? (
            <span className="cifra">
              {formatoCorto(lunes)} – {formatoCorto(sumarDias(lunes, 4))}
            </span>
          ) : (
            SUBTITULOS[vista]
          )
        }
      />

      <div className="space-y-4 p-4">
        <div role="tablist" aria-label="Vista del planificador" className="pestanas">
          <button role="tab" onClick={() => setVista('grupo')} aria-selected={vista === 'grupo'} className="pestana">
            <Users size={18} aria-hidden />
            Grupo
          </button>
          <button role="tab" onClick={() => setVista('semana')} aria-selected={vista === 'semana'} className="pestana">
            <CalendarRange size={18} aria-hidden />
            Semana
          </button>
          <button
            role="tab"
            onClick={() => setVista('unidades')}
            aria-selected={vista === 'unidades'}
            className="pestana"
          >
            <Layers size={18} aria-hidden />
            Unidades
          </button>
        </div>

        {vista === 'grupo' && <PlanGrupo />}
        {vista === 'semana' && <VistaSemana lunes={lunes} onCambiarSemana={setLunes} />}
        {vista === 'unidades' && <VistaUnidades />}
      </div>
    </>
  )
}

function VistaSemana({
  lunes,
  onCambiarSemana,
}: {
  lunes: string
  onCambiarSemana: (l: string) => void
}) {
  const huecos = useLiveQuery(
    () => huecosDe({ desde: lunes, hasta: sumarDias(lunes, 4) }),
    [lunes],
  )
  // Las clases canceladas de un día suelto se enseñan aparte, apagadas: quitar
  // una clase no puede ser un hueco que desaparece sin explicación.
  const canceladas = useLiveQuery(
    () => huecosCanceladosDe({ desde: lunes, hasta: sumarDias(lunes, 4) }),
    [lunes],
  )
  const curso = useLiveQuery(() => leerCursoActivo(), [])
  const hoy = aISO()

  async function abrir(h: HuecoCalendario) {
    // Un hueco sin sesión la crea al vuelo: planificar no debe costar dos pasos.
    const id = h.sesion?.id ?? (await crearSesion(h.grupo.id, h.fecha, { franjaInicio: h.franjaInicio }))
    navegar(`/sesiones/${id}`)
  }

  const porDia = (d: number) => (huecos ?? []).filter((h) => h.diaSemana === d)
  const canceladasDe = (d: number) => (canceladas ?? []).filter((h) => h.diaSemana === d)

  // Un día no lectivo (§ Bloque 7.2) se enseña marcado, sin huecos «Planificar»
  // ni creación de sesión al vuelo: la fuente de «¿toca clase?» es SIEMPRE
  // `estadoDia`, la misma que usan Hoy y el Calendario — nunca una comprobación
  // de festivos por su cuenta.
  const estados: (EstadoDia | undefined)[] = [1, 2, 3, 4, 5].map((d) =>
    curso ? estadoDia(sumarDias(lunes, d - 1), curso) : undefined,
  )
  // Fuera del periodo lectivo (§ Bloque 7.3): TODA la semana cae antes del
  // inicio o después del fin de curso. Un festivo suelto o unas vacaciones no
  // cuentan como «fuera»: eso ya lo dice cada día marcado.
  const fueraDePeriodo =
    curso != null &&
    estados.every((e) => e?.tipo === 'antesDeCurso' || e?.tipo === 'despuesDeCurso')

  return (
    <>
      <NavegadorFecha
        etiqueta={`${formatoCorto(lunes)} – ${formatoCorto(sumarDias(lunes, 4))}`}
        valor={lunes}
        esHoy={lunes === lunesDe(hoy)}
        etiquetaHoy="Volver a esta semana"
        onAnterior={() => onCambiarSemana(sumarDias(lunes, -7))}
        onSiguiente={() => onCambiarSemana(sumarDias(lunes, 7))}
        onElegir={(iso) => onCambiarSemana(lunesDe(iso))}
        onHoy={() => onCambiarSemana(lunesDe(hoy))}
        ariaAnterior="Semana anterior"
        ariaSiguiente="Semana siguiente"
      />

      {fueraDePeriodo ? (
        <div className="tarjeta text-center">
          <CalendarOff className="mx-auto text-tinta-tenue" size={32} aria-hidden />
          <p className="mt-2 text-base font-semibold">Fuera del periodo lectivo</p>
          <p className="mt-1 text-sm texto-suave">
            {estados[0]?.tipo === 'antesDeCurso'
              ? `Las clases empiezan el ${formatoCorto(curso!.inicio)}.`
              : `El curso acabó el ${formatoCorto(curso!.fin)}.`}
          </p>
        </div>
      ) : huecos?.length === 0 ? (
        <div className="tarjeta text-center">
          <p className="text-base font-semibold">Sin clases esta semana</p>
          <p className="mt-1 text-sm texto-suave">
            El planificador se construye sobre el horario de cada grupo.
          </p>
          <button className="btn-primario mt-4 w-full" onClick={() => navegar('/grupos')}>
            Ir a Grupos
          </button>
        </div>
      ) : (
        [1, 2, 3, 4, 5].map((d) => {
          const delDia = porDia(d)
          const sinClase = canceladasDe(d)
          const estado = estados[d - 1]
          const noLectivo = estado && estado.tipo !== 'lectivo' ? estado : null
          if (delDia.length === 0 && sinClase.length === 0 && !noLectivo) return null
          const fecha = sumarDias(lunes, d - 1)
          return (
            <section key={d}>
              <TituloSeccion>
                {NOMBRES_DIA[d - 1]}{' '}
                <span className="cifra text-sm font-normal texto-suave">{formatoCorto(fecha)}</span>
                {fecha === hoy && <span className="pildora ml-2 bg-primario text-white">Hoy</span>}
              </TituloSeccion>

              {noLectivo ? (
                <p className="text-sm texto-suave">{etiquetaNoLectivo(noLectivo)}</p>
              ) : (
                <>
                <ul className="grid gap-2 apaisado:grid-cols-2 lg:grid-cols-2">
                  {(() => {
                    // Un grupo con dos clases ese día se rotula «1.ª de 2» /
                    // «2.ª de 2»: sin la marca, dos filas iguales seguidas
                    // parecen un duplicado por error.
                    const ordinales = ordinalesDelDia(delDia.map((h) => ({ grupoId: h.grupo.id })))
                    return delDia.map((h, i) => {
                    const ord = ordinales[i]
                    return (
                    <li key={`${h.grupo.id}-${h.franjaInicio ?? h.horaInicio}`}>
                      <div className="tarjeta-pulsable flex w-full items-center gap-3">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => void abrir(h)}
                        >
                          <span
                            className="color-dato h-10 w-2 shrink-0 rounded-full"
                            style={variablesColor(h.grupo.colorId ?? h.grupo.color)}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-bold">{h.grupo.nombre}</span>
                              <BadgeEtapa etapa={h.grupo.etapa} nivel={h.grupo.nivel} />
                            </span>
                            <span className="cifra mt-0.5 block truncate text-sm texto-suave">
                              {h.horaInicio && h.horaFin ? `${h.horaInicio}–${h.horaFin}` : 'Sin hora fija'}
                              {rotuloOrdinal(ord) ? ` · ${rotuloOrdinal(ord)}` : ''}
                              {h.sesion?.titulo ? ` · ${h.sesion.titulo}` : ''}
                            </span>
                          </span>
                          <span
                            className={
                              'shrink-0 text-xs font-bold ' +
                              (h.sesion ? 'text-lima-oscuro dark:text-lima' : 'text-primario dark:text-agua')
                            }
                          >
                            {h.sesion ? `${h.sesion.juegos.length} juegos` : 'Planificar'}
                          </span>
                        </button>
                        {/* Un hueco sin planificar se puede quitar de ese día
                            sin tocar el horario; con sesión, eso se decide en
                            su detalle, donde se ve qué se pierde. */}
                        {!h.sesion && (
                          <BotonNoHayClase
                            grupo={h.grupo}
                            fecha={h.fecha}
                            horaInicio={h.franjaInicio ?? h.horaInicio}
                          />
                        )}
                      </div>
                    </li>
                    )
                    })
                  })()}
                </ul>
                <FilasCanceladas huecos={sinClase} />
                </>
              )}
            </section>
          )
        })
      )}
    </>
  )
}

/** Filtro del listado. `todas` es el estado de partida: no esconde nada. */
type FiltroEtapa = 'todas' | Etapa

const ETIQUETA_ETAPA: Record<Etapa, string> = { primaria: 'Primaria', infantil: 'Infantil' }

/**
 * Con una sola etapa disponible (lib/etapas.ts) no hay nada que filtrar y el
 * grupo de botones no se pinta. La lista se construye de las etapas
 * disponibles, así que vuelve sola al encender el interruptor.
 */
const FILTROS: { valor: FiltroEtapa; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  ...ETAPAS_DISPONIBLES.map((e) => ({ valor: e as FiltroEtapa, etiqueta: ETIQUETA_ETAPA[e] })),
]

function VistaUnidades() {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<UnidadDidactica | null>(null)
  const [copiando, setCopiando] = useState<UnidadDidactica | null>(null)
  const [moviendo, setMoviendo] = useState<UnidadDidactica | null>(null)
  const [llevando, setLlevando] = useState<UnidadDidactica | null>(null)
  const [acciones, setAcciones] = useState<UnidadDidactica | null>(null)
  const [eliminando, setEliminando] = useState<UnidadDidactica | null>(null)
  const [editandoSesion, setEditandoSesion] = useState<{
    udId: string
    nivel: number
    sesionId: string
  } | null>(null)
  const [anadiendoCurso, setAnadiendoCurso] = useState<UnidadDidactica | null>(null)
  const [quitandoCurso, setQuitandoCurso] = useState<UnidadDidactica | null>(null)
  const [desplegada, setDesplegada] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroEtapa>('todas')
  const [verArchivadas, setVerArchivadas] = useState(false)

  const unidades = useLiveQuery(async () => {
    const lista = await db.unidades.toArray()
    // Las unidades sin trimestre van al final de su nivel: son las sueltas.
    // Infantil va primero porque su nivel es 0 (el ciclo entero).
    const orden = (t: number | null) => t ?? 9
    // Por el primer curso que abarca: todos son del mismo ciclo, así que basta.
    // Infantil va primero porque su curso es 0 (el ciclo entero).
    return lista.sort(
      (a, b) =>
        (a.niveles[0] ?? 0) - (b.niveles[0] ?? 0) ||
        orden(a.trimestre) - orden(b.trimestre) ||
        a.titulo.localeCompare(b.titulo, 'es'),
    )
  }, [])

  const conteos = useLiveQuery(async () => {
    const sesiones = await db.sesiones.toArray()
    const mapa: Record<string, number> = {}
    for (const s of sesiones) if (s.udId) mapa[s.udId] = (mapa[s.udId] ?? 0) + 1
    return mapa
  }, [])

  // Las unidades de una etapa oculta no se listan; siguen enteras en la base.
  const porEtapa = (unidades ?? []).filter(
    (u) => etapaVisible(u.etapa) && (filtro === 'todas' || u.etapa === filtro),
  )
  // Archivar no borra: la unidad sigue ahí, solo deja de estorbar en el listado.
  const archivadas = porEtapa.filter((u) => u.archivada).length
  const visibles = porEtapa.filter((u) => (verArchivadas ? u.archivada : !u.archivada))
  // El rótulo del estado vacío y del botón de alta siguen al filtro: con
  // «Infantil» activo, «Nueva unidad didáctica» sería el nombre equivocado.
  const vocabulario = terminologia(filtro === 'infantil' ? 'infantil' : 'primaria')

  return (
    <>
      <button className="btn-primario w-full" onClick={() => setCreando(true)}>
        <Plus size={20} aria-hidden />
        Nueva unidad
      </button>

      <button className="btn-suave w-full" onClick={() => navegar('/planificador/importar')}>
        <ClipboardPaste size={20} aria-hidden />
        Importar pegando texto
      </button>

      {ETAPA_UNICA === null && (
      <div role="group" aria-label="Filtrar por etapa" className="flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            aria-pressed={filtro === f.valor}
            className={(filtro === f.valor ? 'btn-primario' : 'btn-suave') + ' flex-1 px-0 text-sm'}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>
      )}

      {(archivadas > 0 || verArchivadas) && (
        <button
          className={(verArchivadas ? 'btn-primario' : 'btn-suave') + ' w-full text-sm'}
          onClick={() => setVerArchivadas(!verArchivadas)}
          aria-pressed={verArchivadas}
        >
          <Archive size={16} aria-hidden />
          {verArchivadas
            ? 'Volver a las activas'
            : `Ver archivadas (${archivadas})`}
        </button>
      )}

      {filtro === 'infantil' && !verArchivadas && <AvisoCoberturaInfantil unidades={visibles} />}

      {visibles.length === 0 && (
        <div className="tarjeta text-center">
          <p className="text-base font-semibold">
            {verArchivadas
              ? `Sin ${vocabulario.unidadPluralEnFrase} archivadas`
              : `Sin ${vocabulario.unidadPluralEnFrase}`}
          </p>
          <p className="mt-1 text-sm texto-suave">
            {verArchivadas
              ? 'Al archivar una, se guarda aquí sin perder nada de lo que tiene dentro.'
              : filtro === 'infantil'
                ? 'Agrupa las sesiones de Psicomotricidad para vincularlas a los criterios del Decreto 36/2022.'
                : 'Agrupa las sesiones en unidades para reutilizarlas entre niveles.'}
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {visibles.map((u) => {
          const totalPlan = u.sesiones?.length ?? 0
          const colocadas = conteos?.[u.id] ?? 0
          const abierta = desplegada === u.id
          return (
            <li key={u.id} className="tarjeta space-y-2 py-3">
              <div className="flex items-start gap-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setEditando(u)}
                  aria-label={`Editar ${terminologia(u.etapa).unidadEnFrase} ${u.titulo}`}
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-bold">{u.titulo}</p>
                    {u.etapa === 'primaria' && !u.computa && (
                      <span className="pildora shrink-0 bg-aviso/15 px-2 py-0.5 text-xs font-semibold text-aviso-oscuro">
                        No cuenta
                      </span>
                    )}
                    {u.etapa === 'infantil' && (
                      <span className="pildora shrink-0 bg-agua-claro px-2 py-0.5 text-xs font-semibold text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                        Infantil
                      </span>
                    )}
                    {u.archivada && (
                      <span className="pildora shrink-0 px-2 py-0.5 text-xs font-semibold texto-suave">
                        Archivada
                      </span>
                    )}
                    {/* Se copió o se movió y algún criterio no tenía equivalente
                        en el ciclo destino: queda pendiente elegirlo a mano. */}
                    {u.criteriosSinMapear?.length && (
                      <span className="pildora shrink-0 border border-acento/40 bg-acento/10 px-2 py-0.5 text-xs font-semibold text-acento">
                        Revisar criterios
                      </span>
                    )}
                  </div>
                  <p className="cifra mt-0.5 text-sm texto-suave">
                    {ambitoUnidad(u.etapa, u.niveles)} ·{' '}
                    {u.trimestre === null ? 'sin trimestre' : `${u.trimestre}.º trimestre`} ·{' '}
                    {/* Dos cifras distintas: lo que la unidad tiene escrito y lo
                        que ya ocupa clases. Una sola las confundiría. */}
                    {totalPlan > 0 && `${totalPlan} planificadas · `}
                    {colocadas} colocadas ·{' '}
                    {u.criterios.length} {u.criterios.length === 1 ? 'criterio' : 'criterios'}
                  </p>
                </button>
                {/* Un solo punto de entrada a lo que se hace CON la unidad
                    (duplicar, archivar, eliminar), en las dos etapas: el toque
                    en la tarjeta ya está ocupado por editar su contenido. */}
                <button
                  className="btn-suave shrink-0 px-3"
                  onClick={() => setAcciones(u)}
                  aria-label={`Acciones de ${terminologia(u.etapa).unidadEnFrase} ${u.titulo}`}
                >
                  <MoreVertical size={18} aria-hidden />
                </button>
              </div>

              <PlanDeUnidad
                unidad={u}
                abierta={abierta}
                onAlternar={() => setDesplegada(abierta ? null : u.id)}
                onLlevar={() => setLlevando(u)}
                onEditarSesion={(nivel, sesionId) =>
                  setEditandoSesion({ udId: u.id, nivel, sesionId })
                }
                onAnadirCurso={() => setAnadiendoCurso(u)}
              />
            </li>
          )
        })}
      </ul>

      <HojaNuevaUnidad abierta={creando} onCerrar={() => setCreando(false)} />
      <HojaEditarUnidad unidad={editando} onCerrar={() => setEditando(null)} />
      <HojaCopiarUnidad
        unidad={copiando}
        onCerrar={() => setCopiando(null)}
        onCopiada={(id) => void db.unidades.get(id).then((u) => u && setEditando(u))}
      />
      <HojaMoverUnidad
        unidad={moviendo}
        onCerrar={() => setMoviendo(null)}
        onCopiar={() => setCopiando(moviendo)}
      />
      <HojaLlevarAGrupo unidad={llevando} onCerrar={() => setLlevando(null)} />
      <HojaAccionesUnidad
        unidad={acciones}
        onCerrar={() => setAcciones(null)}
        onCopiar={setCopiando}
        onMover={setMoviendo}
        onQuitarCurso={setQuitandoCurso}
        onEliminar={setEliminando}
      />
      <HojaEliminarUnidad unidad={eliminando} onCerrar={() => setEliminando(null)} />
      <HojaSesionPlan destino={editandoSesion} onCerrar={() => setEditandoSesion(null)} />
      <HojaAnadirCurso unidad={anadiendoCurso} onCerrar={() => setAnadiendoCurso(null)} />
      <HojaQuitarCurso unidad={quitandoCurso} onCerrar={() => setQuitandoCurso(null)} />
    </>
  )
}

/**
 * Llevar el plan de una unidad a un grupo: es el momento en que la programación
 * escrita pasa a ocupar clases del calendario.
 *
 * Solo se ofrecen grupos de la misma etapa —y, en Primaria, del mismo curso—:
 * los criterios de la unidad son de un decreto y de un ciclo concretos, y
 * llevarla a otro sitio los dejaría apuntando a donde no aplican.
 *
 * Se elige DÍA y CLASE de arranque —un grupo con dos clases el mismo día tiene
 * que poder empezar en la segunda—, y las sesiones caen en los huecos reales
 * del horario, seguidas: si un día tiene dos clases se ocupan las dos antes de
 * pasar al siguiente. Antes de escribir nada se enseña la previa, hueco a
 * hueco, con lo que se rellena, lo que se salta y lo que se sustituye.
 */
/**
 * Qué enseñarle al maestro cuando el volcado falla.
 *
 * Los errores que lanza `aplicarVolcado` a propósito —otra etapa, otro curso,
 * unidad sin sesiones— ya están escritos para leerse, y se pasan tal cual. Lo
 * que NO puede salir a pantalla es el texto de una excepción de IndexedDB
 * («Failed to execute 'objectStore' on 'IDBTransaction'…»): no le dice nada a
 * quien está en la pista y da la sensación de que la app se ha roto por dentro.
 * Se sustituye por una frase llana y por lo único que importa saber: que no ha
 * quedado nada a medias.
 */
function mensajeVolcado(e: unknown): string {
  if (!(e instanceof Error)) return 'No se ha podido llevar la unidad. No se ha colocado nada.'
  const tecnico =
    e.name === 'NotFoundError' ||
    e.name === 'TransactionInactiveError' ||
    e.name === 'QuotaExceededError' ||
    e.name.startsWith('Dexie') ||
    /objectStore|IDBTransaction|IDBDatabase|transaction/i.test(e.message)
  if (!tecnico) return e.message
  return 'No se ha podido guardar la programación. No se ha colocado ninguna sesión: la unidad y el grupo están como estaban. Vuelve a intentarlo; si sigue igual, cierra y abre la app.'
}

function HojaLlevarAGrupo({
  unidad,
  onCerrar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [grupoId, setGrupoId] = useState('')
  const [desde, setDesde] = useState(aISO())
  const [franja, setFranja] = useState<string | null>(null)
  const [modo, setModo] = useState<ModoVolcado>('saltar')
  const [reemplazar, setReemplazar] = useState(false)
  const [previa, setPrevia] = useState<PreviaVolcado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const grupos = useLiveQuery(async () => {
    if (!unidad) return []
    const lista = await db.grupos.where('etapa').equals(unidad.etapa).toArray()
    return lista
      .filter((g) => unidad.etapa === 'infantil' || unidad.niveles.includes(g.nivel))
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [unidad?.id])

  const grupo = grupos?.find((g) => g.id === grupoId) ?? null

  // Clases del grupo el día elegido: es lo que permite decir «empieza en la 2.ª».
  const franjasDelDia = (() => {
    const dow = diaLectivo(desde)
    if (!grupo || dow === null) return []
    return grupo.horario
      .filter((f) => f.diaSemana === dow)
      .map((f) => f.horaInicio)
      .sort((a, b) => a.localeCompare(b))
  })()

  useEffect(() => {
    if (!unidad) return
    setDesde(aISO())
    setFranja(null)
    setModo('saltar')
    setReemplazar(false)
    setPrevia(null)
    setError(null)
    setGrupoId('')
  }, [unidad])

  // La previa se recalcula sola con cada cambio: cambiar de modo enseña el
  // resultado sin salir de la hoja y sin escribir nada.
  useEffect(() => {
    if (!unidad || !grupoId) {
      setPrevia(null)
      return
    }
    let vigente = true
    previsualizarVolcado({
      udId: unidad.id,
      grupoId,
      desde,
      franjaInicio: franja ?? undefined,
      modo,
      reemplazarPrevio: reemplazar,
    })
      .then((p) => {
        if (!vigente) return
        setPrevia(p)
        setError(null)
      })
      .catch((e) => {
        if (!vigente) return
        setPrevia(null)
        setError(e instanceof Error ? e.message : 'No se ha podido calcular el volcado')
      })
    return () => {
      vigente = false
    }
  }, [unidad, grupoId, desde, franja, modo, reemplazar])

  if (!unidad) return null

  const vocabulario = terminologia(unidad.etapa)

  async function llevar() {
    if (!unidad || !grupoId || !previa) return
    setGuardando(true)
    setError(null)
    try {
      const r = await aplicarVolcado({
        udId: unidad.id,
        grupoId,
        desde,
        franjaInicio: franja ?? undefined,
        modo,
        reemplazarPrevio: reemplazar,
      })
      onCerrar()
      const partes = [
        `${r.previa.colocadas} ${r.previa.colocadas === 1 ? 'sesión colocada' : 'sesiones colocadas'}`,
      ]
      if (r.previa.sustituidas.length > 0)
        partes.push(`${r.previa.sustituidas.length} sustituidas`)
      if (r.previa.saltadas > 0) partes.push(`${r.previa.saltadas} clases ocupadas respetadas`)
      if (r.previa.sinHueco > 0) partes.push(`${r.previa.sinHueco} sin hueco`)
      mostrarAviso(partes.join(' · '), r.deshacer)
    } catch (e) {
      setError(mensajeVolcado(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta={!!unidad} titulo={`Llevar «${unidad.titulo}» a un grupo`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          Las sesiones de {vocabulario.unidadEnFrase} se colocan en las clases seguidas del grupo a
          partir del día y la clase que elijas. Un día con dos clases se ocupa entero antes de pasar
          al siguiente.
        </p>

        <div>
          <span className="etiqueta">Grupo</span>
          {grupos?.length === 0 ? (
            <p className="text-sm texto-suave">
              No hay ningún grupo de {ambitoUnidad(unidad.etapa, unidad.niveles)} en esta etapa.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grupos?.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setGrupoId(g.id)
                    setFranja(null)
                  }}
                  aria-pressed={grupoId === g.id}
                  className={(grupoId === g.id ? 'btn-primario' : 'btn-suave') + ' px-4'}
                >
                  {g.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="etiqueta" htmlFor="ud-desde">
            Primer día
          </label>
          <input
            id="ud-desde"
            type="date"
            className="campo"
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value)
              setFranja(null)
            }}
          />
        </div>

        {/* Elegir la CLASE, no solo el día: con dos clases el mismo día, «el
            martes» no dice en cuál de las dos empieza la unidad. */}
        {franjasDelDia.length > 1 && (
          <div>
            <span className="etiqueta">Clase de ese día</span>
            <div className="flex flex-wrap gap-2">
              {franjasDelDia.map((h, i) => (
                <button
                  key={h}
                  onClick={() => setFranja(h)}
                  aria-pressed={(franja ?? franjasDelDia[0]) === h}
                  className={
                    ((franja ?? franjasDelDia[0]) === h ? 'btn-primario' : 'btn-suave') + ' px-4'
                  }
                >
                  <span className="cifra">
                    {i + 1}.ª · {h}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {grupoId && (
          <div>
            <span className="etiqueta">Si la clase ya tiene sesión</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModo('saltar')}
                aria-pressed={modo === 'saltar'}
                className={(modo === 'saltar' ? 'btn-primario' : 'btn-suave') + ' px-4'}
              >
                Saltarla
              </button>
              <button
                onClick={() => setModo('sobrescribir')}
                aria-pressed={modo === 'sobrescribir'}
                className={(modo === 'sobrescribir' ? 'btn-primario' : 'btn-suave') + ' px-4'}
              >
                Sustituirla
              </button>
            </div>
            <p className="mt-1 text-xs texto-suave">
              {modo === 'saltar'
                ? 'La unidad puede quedar partida: las clases con trabajo se respetan y la siguiente sesión busca el hueco de después.'
                : 'Las sesiones ocupan huecos seguidos. Abajo está la lista de lo que se pierde; se puede deshacer.'}{' '}
              Una clase vacía se rellena siempre: no hay nada que perder.
            </p>
          </div>
        )}

        {previa && <PreviaDelVolcado previa={previa} />}

        {previa && previa.volcadoPrevio > 0 && (
          <label className="panel-agua flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-primario"
              checked={reemplazar}
              onChange={(e) => setReemplazar(e.target.checked)}
            />
            <span>
              Esta unidad ya está volcada en el grupo ({previa.volcadoPrevio}{' '}
              {previa.volcadoPrevio === 1 ? 'sesión' : 'sesiones'}). Marca esta casilla para{' '}
              <strong>reemplazar el volcado anterior</strong> en vez de duplicarlo.
            </span>
          </label>
        )}

        {error && <p className="text-sm font-semibold text-acento">{error}</p>}

        <button
          className="btn-primario w-full"
          onClick={() => void llevar()}
          disabled={!grupoId || !previa || previa.colocadas === 0 || guardando}
        >
          {previa
            ? `Colocar ${previa.colocadas} ${previa.colocadas === 1 ? 'sesión' : 'sesiones'}`
            : 'Elige un grupo'}
        </button>
      </div>
    </Hoja>
  )
}

/**
 * La previa: qué va a pasar en cada hueco, antes de escribir nada. Los avisos
 * no bloquean —sesiones que no caben, vacaciones de por medio—, solo informan.
 */
function PreviaDelVolcado({ previa }: { previa: PreviaVolcado }) {
  const avisos: string[] = []
  if (previa.sinHueco > 0)
    avisos.push(
      `${previa.sinHueco} ${previa.sinHueco === 1 ? 'sesión se queda' : 'sesiones se quedan'} fuera: no hay más clases antes de fin de curso.`,
    )
  if (previa.periodosCruzados.length > 0)
    avisos.push(`La unidad atraviesa ${previa.periodosCruzados.join(' y ')}.`)
  if (previa.trimestresCruzados.length > 1)
    avisos.push(`Se reparte entre los trimestres ${previa.trimestresCruzados.join(' y ')}.`)
  if (previa.saltadas > 0)
    avisos.push(
      `${previa.saltadas} ${previa.saltadas === 1 ? 'clase ocupada se salta' : 'clases ocupadas se saltan'}: la unidad no queda seguida.`,
    )

  return (
    <div className="space-y-2">
      <TituloSeccion>
        Previa · {previa.colocadas} de {previa.totalPlan}
      </TituloSeccion>

      {avisos.length > 0 && (
        <ul className="panel-agua space-y-1 text-sm">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {previa.sustituidas.length > 0 && (
        <div className="tarjeta border-2 border-acento p-3 text-sm">
          <p className="font-bold text-acento">
            Se sustituyen {previa.sustituidas.length}{' '}
            {previa.sustituidas.length === 1 ? 'sesión' : 'sesiones'} con trabajo hecho
          </p>
          <ul className="mt-1 space-y-0.5">
            {previa.sustituidas.map((s) => (
              <li key={`${s.fecha}|${s.franjaInicio}`} className="cifra">
                {formatoDiaCorto(s.fecha)} · {s.franjaInicio} — {s.titulo}
              </li>
            ))}
          </ul>
          <p className="mt-1 texto-suave">Se puede deshacer: vuelven tal como estaban.</p>
        </div>
      )}

      {previa.pasos.length === 0 ? (
        <p className="text-sm texto-suave">
          No hay ninguna clase de este grupo a partir de esa fecha.
        </p>
      ) : (
        <ol className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {previa.pasos.map((p) => (
            <li
              key={`${p.fecha}|${p.franjaInicio}`}
              className={
                'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ' +
                (p.accion === 'saltar'
                  ? 'bg-agua-claro/50 text-tinta-tenue dark:bg-noche-elevada'
                  : p.accion === 'sustituir'
                    ? 'bg-acento/10'
                    : 'bg-agua-claro dark:bg-noche-elevada')
              }
            >
              <span className="cifra shrink-0 tabular-nums">
                {formatoDiaCorto(p.fecha)} · {p.franjaInicio}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {p.plan ? p.plan.titulo || 'Sesión sin título' : p.previa?.titulo}
              </span>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">
                {p.accion === 'crear'
                  ? 'Nueva'
                  : p.accion === 'rellenar'
                    ? 'Rellena'
                    : p.accion === 'sustituir'
                      ? 'Sustituye'
                      : 'Se salta'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * El plan de sesiones de una unidad, editable sin salir del listado.
 *
 * Una unidad puede abarcar varios cursos del mismo ciclo, y las sesiones son
 * PROPIAS de cada curso: la misma unidad se desarrolla distinto en 3.º y en 4.º.
 * Por eso hay una pestaña por curso, y cada una enseña y edita solo sus
 * sesiones. Con un solo curso las pestañas no se dibujan: se ve igual que antes
 * del multi-curso.
 *
 * Las sesiones se numeran por POSICIÓN dentro de su curso, no por un campo que
 * se escriba: el número que se ve es el índice en la lista, y reordenar renumera
 * solo. Por eso subir y bajar son botones y no hay ningún «número» que tocar.
 */
function PlanDeUnidad({
  unidad,
  abierta,
  onAlternar,
  onLlevar,
  onEditarSesion,
  onAnadirCurso,
}: {
  unidad: UnidadDidactica
  abierta: boolean
  onAlternar: () => void
  onLlevar: () => void
  onEditarSesion: (nivel: number, sesionId: string) => void
  onAnadirCurso: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [borrando, setBorrando] = useState<SesionPlan | null>(null)
  // Curso activo: el primero mientras no se elija otro. Si la pestaña activa deja
  // de existir (se quitó ese curso), se cae al primero.
  const [cursoActivo, setCursoActivo] = useState<number | null>(null)
  const nivel = cursoActivo != null && unidad.niveles.includes(cursoActivo)
    ? cursoActivo
    : (unidad.niveles[0] ?? 0)

  const plan = sesionesDe(unidad, nivel)
  const totalPlan = unidad.sesiones?.length ?? 0
  const variosCursos = unidad.niveles.length > 1

  async function anadir() {
    const { id, deshacer } = await anadirSesionPlan(unidad.id, nivel)
    if (!abierta) onAlternar()
    onEditarSesion(nivel, id)
    mostrarAviso('Sesión añadida', deshacer)
  }

  async function duplicar(s: SesionPlan) {
    const { deshacer } = await duplicarSesionPlan(unidad.id, nivel, s.id)
    mostrarAviso(`«${s.titulo || 'Sesión sin título'}» duplicada`, deshacer)
  }

  async function eliminar() {
    if (!borrando) return
    const deshacer = await eliminarSesionPlan(unidad.id, nivel, borrando.id)
    const titulo = borrando.titulo || 'Sesión sin título'
    setBorrando(null)
    mostrarAviso(`«${titulo}» quitada del plan`, deshacer)
  }

  return (
    <>
      <div className="flex gap-2">
        <button
          className="btn-suave flex-1 px-3 text-xs"
          onClick={onAlternar}
          aria-expanded={abierta}
        >
          <ChevronDown
            size={16}
            className={abierta ? 'rotate-180 transition-transform' : 'transition-transform'}
            aria-hidden
          />
          {abierta
            ? 'Ocultar sesiones'
            : totalPlan === 0
              ? 'Añadir sesiones'
              : `Ver las ${totalPlan} sesiones`}
        </button>
        {totalPlan > 0 && (
          <button className="btn-suave flex-1 px-3 text-xs" onClick={onLlevar}>
            <CalendarPlus size={16} aria-hidden />
            Llevar a un grupo
          </button>
        )}
      </div>

      {abierta && (
        <div className="space-y-2 border-t border-borde pt-2 dark:border-noche-borde">
          {/* Pestañas por curso, solo en Primaria multi-curso. El botón de
              añadir curso está siempre en Primaria: es el punto de entrada al
              multi-curso desde una unidad de un solo curso. */}
          {unidad.etapa === 'primaria' && (
            <div className="flex flex-wrap items-center gap-1">
              {variosCursos &&
                [...unidad.niveles]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <button
                      key={n}
                      onClick={() => setCursoActivo(n)}
                      aria-pressed={n === nivel}
                      className={
                        (n === nivel ? 'btn-primario' : 'btn-suave') + ' px-3 py-1.5 text-xs'
                      }
                    >
                      {n}º
                    </button>
                  ))}
              <button
                className="btn-suave px-3 py-1.5 text-xs"
                onClick={onAnadirCurso}
                aria-label="Añadir un curso a la unidad"
              >
                <Plus size={14} aria-hidden />
                {variosCursos ? 'Curso' : 'Añadir curso'}
              </button>
            </div>
          )}

          {plan.length === 0 && (
            <p className="text-sm texto-suave">
              {variosCursos
                ? `${nivel}º todavía no tiene sesiones. Escribe aquí su secuencia.`
                : 'Todavía no hay sesiones. Escribe aquí la secuencia y luego llévala a un grupo.'}
            </p>
          )}

          <ol className="space-y-1">
            {plan.map((s, i) => (
              <li key={s.id} className="flex items-start gap-1 text-sm">
                <span className="cifra w-5 shrink-0 pt-3 text-right font-bold texto-suave">
                  {i + 1}
                </span>
                <button
                  className="min-w-0 flex-1 py-2 text-left"
                  onClick={() => onEditarSesion(nivel, s.id)}
                  aria-label={`Editar sesión ${i + 1}: ${s.titulo || 'sin título'}`}
                >
                  <span className="block font-semibold">
                    {s.titulo || <span className="texto-suave">Sesión sin título</span>}
                  </span>
                  {s.notas && (
                    <span className="block truncate texto-suave">
                      {s.notas.split('\n').find((l) => l.trim()) ?? ''}
                    </span>
                  )}
                  {s.recursosNecesarios && (
                    <span className="block truncate text-xs texto-suave">
                      Material: {s.recursosNecesarios}
                    </span>
                  )}
                </button>
                <span className="flex shrink-0 items-center">
                  <button
                    className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                    onClick={() => void duplicar(s)}
                    aria-label={`Duplicar la sesión ${i + 1}`}
                  >
                    <Copy size={16} aria-hidden />
                  </button>
                  <button
                    className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                    onClick={() => setBorrando(s)}
                    aria-label={`Quitar la sesión ${i + 1} del plan`}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ol>

          <button className="btn-suave w-full text-xs" onClick={() => void anadir()}>
            <Plus size={16} aria-hidden />
            Añadir sesión{variosCursos ? ` a ${nivel}º` : ''}
          </button>
        </div>
      )}

      <Hoja abierta={!!borrando} titulo="Quitar sesión del plan" onCerrar={() => setBorrando(null)}>
        <div className="space-y-4">
          <p className="text-sm">
            «{borrando?.titulo || 'Sesión sin título'}» sale del plan de «{unidad.titulo}»
            {variosCursos ? ` en ${nivel}º` : ''}.
          </p>
          {/* Una sesión del plan no lleva notas: las columnas del cuaderno
              cuelgan de la unidad, y las clases ya colocadas son copias con
              vida propia. Por eso basta una confirmación simple. */}
          <p className="text-sm texto-suave">
            Las clases que ya estén colocadas en el calendario no se tocan.
          </p>
          <button className="btn-peligro w-full" onClick={() => void eliminar()}>
            <Trash2 size={20} aria-hidden />
            Quitar del plan
          </button>
        </div>
      </Hoja>
    </>
  )
}

/**
 * Edición de una sesión del plan. Los mismos campos genéricos en las dos
 * etapas: lo que cambia entre Infantil y Primaria es la evaluación, no cómo se
 * escribe una sesión.
 *
 * Guarda sin salir de la unidad y avisa mientras haya cambios sin guardar: es
 * un formulario con botón, no escritura optimista campo a campo, porque aquí se
 * reescribe el plan entero de la unidad en cada toque.
 */
function HojaSesionPlan({
  destino,
  onCerrar,
}: {
  destino: { udId: string; nivel: number; sesionId: string } | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [titulo, setTitulo] = useState('')
  const [notas, setNotas] = useState('')
  const [material, setMaterial] = useState('')
  const [recursos, setRecursos] = useState<Recurso[]>([])
  const [sucio, setSucio] = useState(false)

  const unidad = useLiveQuery(
    async () => (destino ? db.unidades.get(destino.udId) : undefined),
    [destino?.udId],
  )
  const sesion = destino
    ? unidad?.sesiones?.find((s) => s.id === destino.sesionId)
    : undefined

  // Se carga una sola vez por sesión abierta: si siguiera al `useLiveQuery`,
  // guardar reescribiría el formulario encima de lo que se está escribiendo.
  useEffect(() => {
    setSucio(false)
    if (!destino) return
    void db.unidades.get(destino.udId).then((u) => {
      const s = u?.sesiones?.find((x) => x.id === destino.sesionId)
      setTitulo(s?.titulo ?? '')
      setNotas(s?.notas ?? '')
      setMaterial(s?.recursosNecesarios ?? '')
      setRecursos(s?.recursos ?? [])
    })
  }, [destino])

  function editar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setSucio(true)
    }
  }

  async function guardar() {
    if (!destino) return
    try {
      const deshacer = await guardarSesionPlan(destino.udId, destino.nivel, destino.sesionId, {
        titulo,
        notas,
        recursosNecesarios: material,
        recursos,
      })
      setSucio(false)
      onCerrar()
      mostrarAviso('Sesión guardada', deshacer)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se ha podido guardar')
    }
  }

  return (
    <Hoja abierta={!!destino} titulo="Sesión de la unidad" onCerrar={onCerrar}>
      <div className="space-y-4">
        {destino && !sesion && unidad && (
          <p className="aviso">Esta sesión ya no está en el plan.</p>
        )}

        <div>
          <label className="etiqueta" htmlFor="sp-titulo">
            Título
          </label>
          <Campo
            id="sp-titulo"
            className="campo"
            valor={titulo}
            onValor={editar(setTitulo)}
            placeholder="Circuito de equilibrio"
            autoFocus
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="sp-notas">
            Descripción
          </label>
          <CampoArea
            id="sp-notas"
            className="campo h-40 resize-none py-2"
            valor={notas}
            onValor={editar(setNotas)}
            placeholder="Organización, variantes, qué vigilar…"
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="sp-material">
            Recursos necesarios
          </label>
          <CampoArea
            id="sp-material"
            className="campo h-20 resize-none py-2"
            valor={material}
            onValor={editar(setMaterial)}
            placeholder="12 conos, silbato, petos de 2 colores…"
          />
        </div>

        <Recursos recursos={recursos} onCambio={editar(setRecursos)} />

        {sucio && <p className="text-sm texto-suave">Hay cambios sin guardar.</p>}

        <button className="btn-primario w-full" onClick={() => void guardar()} disabled={!sucio}>
          Guardar cambios
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Lo que se puede hacer CON una unidad, frente a lo que se hace DENTRO de ella
 * (que es el toque en la tarjeta). Un solo sitio, en las dos etapas: en la
 * tarjeta ya no cabía un botón más sin convertirla en una botonera.
 */
function HojaAccionesUnidad({
  unidad,
  onCerrar,
  onCopiar,
  onMover,
  onQuitarCurso,
  onEliminar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
  onCopiar: (u: UnidadDidactica) => void
  onMover: (u: UnidadDidactica) => void
  onQuitarCurso: (u: UnidadDidactica) => void
  onEliminar: (u: UnidadDidactica) => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const vocabulario = terminologia(unidad?.etapa ?? 'primaria')

  async function archivar() {
    if (!unidad) return
    const archivada = !unidad.archivada
    const deshacer = await archivarUnidad(unidad.id, archivada)
    onCerrar()
    mostrarAviso(
      archivada ? `«${unidad.titulo}» archivada` : `«${unidad.titulo}» de vuelta en el listado`,
      deshacer,
    )
  }

  return (
    <Hoja abierta={!!unidad} titulo={unidad?.titulo ?? ''} onCerrar={onCerrar}>
      <div className="space-y-2">
        {/* En Infantil no hay otro curso al que llevarla: la unidad ya es del
            2.º ciclo entero, y 3, 4 y 5 años comparten criterios. Por eso
            copiar y mover solo existen en Primaria. */}
        {unidad?.etapa === 'primaria' && (
          <>
            <button
              className="btn-suave w-full justify-start"
              onClick={() => {
                onCopiar(unidad)
                onCerrar()
              }}
            >
              <Copy size={20} aria-hidden />
              Copiar a otro curso
            </button>
            <button
              className="btn-suave w-full justify-start"
              onClick={() => {
                onMover(unidad)
                onCerrar()
              }}
            >
              <MoveRight size={20} aria-hidden />
              Mover a otro curso
            </button>
            <p className="px-1 text-xs texto-suave">
              Copiar deja la original donde está; mover no.
            </p>
            {unidad.niveles.length > 1 && (
              <button
                className="btn-suave w-full justify-start"
                onClick={() => {
                  onQuitarCurso(unidad)
                  onCerrar()
                }}
              >
                <MinusCircle size={20} aria-hidden />
                Quitar un curso de la unidad
              </button>
            )}
          </>
        )}

        <button className="btn-suave w-full justify-start" onClick={() => void archivar()}>
          {unidad?.archivada ? (
            <ArchiveRestore size={20} aria-hidden />
          ) : (
            <Archive size={20} aria-hidden />
          )}
          {unidad?.archivada ? 'Desarchivar' : 'Archivar'}
        </button>
        <p className="px-1 text-xs texto-suave">
          Archivar la retira del listado sin borrar nada de lo que tiene dentro.
        </p>

        <button
          className="btn-peligro w-full justify-start"
          onClick={() => {
            if (unidad) onEliminar(unidad)
            onCerrar()
          }}
        >
          <Trash2 size={20} aria-hidden />
          Eliminar {vocabulario.unidadEnFrase}
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Borrado de una unidad, con el impacto real delante antes de preguntar.
 *
 * Dos caminos según lo que haya escrito: con una sola nota u observación puesta
 * no hay botón de borrar —no hay papelera, sería pérdida irreversible— y la
 * salida es archivar. Sin nada escrito, se borra, pero escribiendo «Eliminar»:
 * es la única acción de la app que no se puede deshacer de un toque, así que
 * pide algo más que un toque.
 *
 * Antes pedía el título entero de la unidad. Lo que protege de verdad el
 * trabajo escrito es el camino de arriba —con datos registrados no hay botón—,
 * no la longitud de lo que se teclea; y teclear «Circuitos y habilidades
 * gimnásticas» en el móvil, de pie en el porche, era un peaje sin dueño.
 */
/** Lo que hay que teclear para borrar. En minúscula: la comparación no distingue. */
const PALABRA_BORRAR = 'eliminar'

function HojaEliminarUnidad({
  unidad,
  onCerrar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [confirmacion, setConfirmacion] = useState('')
  const [impacto, setImpacto] = useState<ImpactoUnidad | null>(null)

  useEffect(() => {
    setConfirmacion('')
    setImpacto(null)
    if (!unidad) return
    let vigente = true
    void contarImpactoUnidad(unidad.id).then((i) => {
      if (vigente) setImpacto(i)
    })
    return () => {
      vigente = false
    }
  }, [unidad])

  const vocabulario = terminologia(unidad?.etapa ?? 'primaria')
  const bloqueado = (impacto?.valores ?? 0) > 0
  const coincide = confirmacion.trim().toLocaleLowerCase('es') === PALABRA_BORRAR
  const pesoEnJuego =
    unidad?.etapa === 'primaria' && unidad.computa
      ? Math.max(0, ...Object.values(unidad.pesosPorNivel))
      : 0
  const instrumentos = impacto ? impacto.columnas - impacto.columnasInfantil : 0

  async function archivar() {
    if (!unidad) return
    const deshacer = await archivarUnidad(unidad.id, true)
    onCerrar()
    mostrarAviso(`«${unidad.titulo}» archivada`, deshacer)
  }

  async function eliminar() {
    if (!unidad) return
    try {
      const deshacer = await eliminarUnidad(unidad.id)
      onCerrar()
      mostrarAviso(`«${unidad.titulo}» eliminada`, deshacer)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se ha podido eliminar')
    }
  }

  return (
    <Hoja abierta={!!unidad} titulo={`Eliminar ${vocabulario.unidadEnFrase}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm font-semibold">«{unidad?.titulo}»</p>

        {!impacto && <p className="text-sm texto-suave">Contando lo que hay dentro…</p>}

        {impacto && (
          <>
            <div className="tarjeta space-y-1 py-3 text-sm">
              <p className="font-semibold">Se borra</p>
              <ul className="texto-suave">
                <li>
                  {impacto.sesionesPlan}{' '}
                  {impacto.sesionesPlan === 1 ? 'sesión planificada' : 'sesiones planificadas'}
                </li>
                <li>
                  {instrumentos}{' '}
                  {instrumentos === 1 ? 'instrumento del cuaderno' : 'instrumentos del cuaderno'}
                  {impacto.filas > 0 && ` (${impacto.filas} filas)`}
                </li>
              </ul>
            </div>

            <div className="tarjeta space-y-1 py-3 text-sm">
              <p className="font-semibold">Se conserva, sin unidad</p>
              <ul className="texto-suave">
                <li>
                  {impacto.sesionesReales}{' '}
                  {impacto.sesionesReales === 1
                    ? 'sesión ya colocada en el calendario'
                    : 'sesiones ya colocadas en el calendario'}
                </li>
                {impacto.columnasInfantil > 0 && (
                  <li>
                    {impacto.columnasInfantil}{' '}
                    {impacto.columnasInfantil === 1
                      ? 'columna de observación'
                      : 'columnas de observación'}
                  </li>
                )}
                {impacto.equipos > 0 && (
                  <li>
                    {impacto.equipos} {impacto.equipos === 1 ? 'agrupamiento' : 'agrupamientos'}
                  </li>
                )}
                <li>Las rúbricas del banco y el alumnado, siempre.</li>
              </ul>
            </div>

            {bloqueado ? (
              <>
                <div className="aviso-fuerte">
                  <p className="font-semibold">
                    Hay {impacto.valores}{' '}
                    {impacto.valores === 1 ? 'dato registrado' : 'datos registrados'}
                  </p>
                  <p className="mt-1">
                    No hay papelera: borrarla ahora sería perderlos para siempre. Archívala y
                    desaparece del listado sin destruir nada.
                  </p>
                </div>
                <button className="btn-primario w-full" onClick={() => void archivar()}>
                  <Archive size={20} aria-hidden />
                  Archivar en su lugar
                </button>
              </>
            ) : (
              <>
                {pesoEnJuego > 0 && (
                  <p className="text-sm texto-suave">
                    Pesaba {pesoEnJuego} % de su trimestre: al borrarla, el reparto dejará de sumar
                    100 y habrá que rehacerlo.
                  </p>
                )}
                <div>
                  <label className="etiqueta" htmlFor="ud-confirmar">
                    Escribe «Eliminar» para confirmar
                  </label>
                  <Campo
                    id="ud-confirmar"
                    className="campo"
                    valor={confirmacion}
                    onValor={setConfirmacion}
                    placeholder="Eliminar"
                    autoCapitalize="none"
                  />
                </div>
                <button
                  className="btn-peligro w-full"
                  disabled={!coincide}
                  onClick={() => void eliminar()}
                >
                  <Trash2 size={20} aria-hidden />
                  Eliminar definitivamente
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Hoja>
  )
}

/**
 * Aviso persistente de §3.8: al copiar o mover a otro ciclo, los criterios sin
 * equivalente se quedan fuera y hay que elegirlos a mano. No se sustituyen por
 * el más parecido, así que el aviso no puede desaparecer solo: se queda hasta
 * que el usuario dice que ya lo ha mirado.
 */
/**
 * Añade un curso a la unidad. Solo los del mismo ciclo se pueden pulsar: los
 * demás salen deshabilitados con el motivo, porque los criterios se definen por
 * ciclo y una unidad no puede sostener dos juegos a la vez (regla dura del §4).
 *
 * Al añadir, se elige el punto de partida de las sesiones: en blanco, o copiando
 * las de un curso que ya esté en la unidad. Nunca se copia en silencio.
 */
function HojaAnadirCurso({
  unidad,
  onCerrar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nivel, setNivel] = useState<number | null>(null)
  const [origen, setOrigen] = useState<'blanco' | number>('blanco')

  useEffect(() => {
    setNivel(null)
    setOrigen('blanco')
  }, [unidad])

  if (!unidad || unidad.etapa !== 'primaria') return null

  // Los cursos con sesiones son los candidatos a «copiar de»; por defecto, el
  // primero que tenga plan.
  const conSesiones = unidad.niveles.filter((n) => sesionesDe(unidad, n).length > 0)

  async function anadir() {
    if (!unidad || nivel === null) return
    try {
      const deshacer = await anadirCursoAUnidad(unidad.id, nivel, origen)
      onCerrar()
      mostrarAviso(`${nivel}º añadido a «${unidad.titulo}»`, deshacer)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se ha podido añadir el curso')
    }
  }

  const motivoActual = nivel !== null ? motivoNoAdmiteCurso(unidad, nivel) : null

  return (
    <Hoja abierta={!!unidad} titulo="Añadir un curso a la unidad" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          La unidad pasará a abarcar también ese curso, con sus propias sesiones. El título, los
          criterios y el trimestre se comparten entre todos los cursos.
        </p>

        <div>
          <span className="etiqueta">Curso</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const motivo = motivoNoAdmiteCurso(unidad, n)
              const yaEsta = unidad.niveles.includes(n)
              return (
                <button
                  key={n}
                  onClick={() => setNivel(n)}
                  disabled={!!motivo}
                  aria-pressed={nivel === n}
                  title={motivo ?? undefined}
                  className={
                    (nivel === n ? 'btn-primario' : 'btn-suave') +
                    ' min-w-tap flex-1 px-0 disabled:opacity-30'
                  }
                >
                  {n}º{yaEsta ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
        </div>

        {/* Cuando el curso elegido es de otro ciclo, se explica y se remite a
            copiar, en vez de dejar el botón muerto sin decir por qué. */}
        {motivoActual && (
          <div className="aviso">
            <p>{motivoActual}</p>
          </div>
        )}

        {nivel !== null && !motivoActual && conSesiones.length > 0 && (
          <div>
            <span className="etiqueta">Sus sesiones</span>
            <div className="space-y-2">
              <button
                onClick={() => setOrigen('blanco')}
                aria-pressed={origen === 'blanco'}
                className={
                  (origen === 'blanco' ? 'btn-primario' : 'btn-suave') + ' w-full justify-start'
                }
              >
                Empezar en blanco
              </button>
              {conSesiones.map((n) => (
                <button
                  key={n}
                  onClick={() => setOrigen(n)}
                  aria-pressed={origen === n}
                  className={
                    (origen === n ? 'btn-primario' : 'btn-suave') + ' w-full justify-start'
                  }
                >
                  Copiar las {sesionesDe(unidad, n).length} sesiones de {n}º
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn-primario w-full"
          onClick={() => void anadir()}
          disabled={nivel === null || !!motivoActual}
        >
          <Plus size={20} aria-hidden />
          Añadir {nivel !== null ? `${nivel}º` : 'curso'}
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Quita un curso de la unidad. Se elige cuál, se enseña qué se lleva por delante
 * —las sesiones de ese curso— y se bloquea si tiene notas puestas: entonces
 * quitarlo las dejaría colgando de una unidad que ya no es de su curso.
 */
function HojaQuitarCurso({
  unidad,
  onCerrar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nivel, setNivel] = useState<number | null>(null)
  const [impacto, setImpacto] = useState<ImpactoQuitarCurso | null>(null)

  useEffect(() => {
    setNivel(null)
    setImpacto(null)
  }, [unidad])

  useEffect(() => {
    setImpacto(null)
    if (!unidad || nivel === null) return
    let vigente = true
    void impactoQuitarCurso(unidad.id, nivel).then((i) => {
      if (vigente) setImpacto(i)
    })
    return () => {
      vigente = false
    }
  }, [unidad, nivel])

  if (!unidad || unidad.etapa !== 'primaria') return null

  const bloqueado = (impacto?.valores ?? 0) > 0

  async function quitar() {
    if (!unidad || nivel === null) return
    try {
      const deshacer = await quitarCursoDeUnidad(unidad.id, nivel)
      onCerrar()
      mostrarAviso(`${nivel}º quitado de «${unidad.titulo}»`, deshacer)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se ha podido quitar el curso')
    }
  }

  return (
    <Hoja abierta={!!unidad} titulo="Quitar un curso de la unidad" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <span className="etiqueta">Curso</span>
          <div className="flex flex-wrap gap-2">
            {[...unidad.niveles]
              .sort((a, b) => a - b)
              .map((n) => (
                <button
                  key={n}
                  onClick={() => setNivel(n)}
                  aria-pressed={nivel === n}
                  className={
                    (nivel === n ? 'btn-primario' : 'btn-suave') + ' min-w-tap flex-1 px-0'
                  }
                >
                  {n}º
                </button>
              ))}
          </div>
        </div>

        {nivel !== null && impacto && (
          <>
            {bloqueado ? (
              <div className="aviso-fuerte">
                <p className="font-semibold">
                  Hay {impacto.valores}{' '}
                  {impacto.valores === 1 ? 'dato registrado' : 'datos registrados'} en {nivel}º
                </p>
                <p className="mt-1">
                  Quitar el curso dejaría esas notas colgando de una unidad que ya no es suya.
                  Bórralas antes, o deja el curso donde está.
                </p>
              </div>
            ) : (
              <>
                <div className="tarjeta space-y-1 py-3 text-sm">
                  <p className="font-semibold">Al quitar {nivel}º</p>
                  <ul className="texto-suave">
                    <li>
                      Se borran sus {impacto.sesiones}{' '}
                      {impacto.sesiones === 1 ? 'sesión planificada' : 'sesiones planificadas'}
                    </li>
                    {impacto.sesionesColocadas > 0 && (
                      <li>
                        {impacto.sesionesColocadas}{' '}
                        {impacto.sesionesColocadas === 1
                          ? 'clase ya colocada se queda'
                          : 'clases ya colocadas se quedan'}{' '}
                        sin unidad, sin borrarse
                      </li>
                    )}
                    <li>Los demás cursos de la unidad no se tocan</li>
                  </ul>
                </div>
                <button className="btn-peligro w-full" onClick={() => void quitar()}>
                  <MinusCircle size={20} aria-hidden />
                  Quitar {nivel}º de la unidad
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Hoja>
  )
}

function AvisoCriteriosSinMapear({ unidad }: { unidad: UnidadDidactica }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const pendientes = unidad.criteriosSinMapear ?? []
  if (pendientes.length === 0) return null

  async function revisado() {
    const deshacer = await marcarCriteriosRevisados(unidad.id)
    mostrarAviso('Criterios dados por revisados', deshacer)
  }

  return (
    <div className="aviso space-y-2">
      <p className="font-semibold">
        {pendientes.length === 1
          ? 'Un criterio se quedó sin equivalente'
          : `${pendientes.length} criterios se quedaron sin equivalente`}
      </p>
      <p>
        Al traer esta unidad de otro ciclo no existía el equivalente de{' '}
        <span className="cifra">{pendientes.join(', ')}</span>. Elige abajo los que correspondan a
        este ciclo.
      </p>
      <button className="btn-suave w-full text-sm" onClick={() => void revisado()}>
        Ya lo he revisado
      </button>
    </div>
  )
}

/**
 * Selector de curso destino, común a copiar y a mover. El curso de partida es
 * el siguiente al de origen: llevarla a su propio curso casi nunca es lo que se
 * quiere, aunque se permite.
 */
function SelectorCurso({
  nivel,
  onCambio,
}: {
  nivel: number
  onCambio: (n: number) => void
}) {
  return (
    <div>
      <span className="etiqueta">Curso de destino</span>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            onClick={() => onCambio(n)}
            aria-pressed={nivel === n}
            className={(nivel === n ? 'btn-primario' : 'btn-suave') + ' min-w-tap flex-1 px-0'}
          >
            {n}º
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Resumen previo de 3.8: qué viaja, qué no, y qué queda por revisar. Se enseña
 * antes del botón de confirmar, en las dos hojas, porque copiar y mover
 * arrastran exactamente lo mismo — lo que cambia es si el original se queda.
 */
function ResumenDeCopia({ resumen, moviendo }: { resumen: ResumenCopia; moviendo: boolean }) {
  return (
    <>
      <div className="tarjeta space-y-1 py-3 text-sm">
        <p className="font-semibold">Viaja con la unidad</p>
        <ul className="texto-suave">
          <li>
            {resumen.sesionesPlan}{' '}
            {resumen.sesionesPlan === 1 ? 'sesión planificada' : 'sesiones planificadas'}, con su
            descripción, material y enlaces
          </li>
          <li>
            {resumen.mapeados.length}{' '}
            {resumen.mapeados.length === 1 ? 'criterio' : 'criterios'}
            {resumen.cambiaDeCiclo && ' (equivalentes del ciclo destino)'}
          </li>
          <li>El trimestre y si cuenta para la nota</li>
        </ul>
      </div>

      <div className="tarjeta space-y-1 py-3 text-sm">
        <p className="font-semibold">No viaja</p>
        <ul className="texto-suave">
          <li>Alumnado, notas, observaciones y asistencia</li>
          <li>Las fechas de las clases: el plan va sin calendario</li>
          <li>Los instrumentos del cuaderno, que son de cada grupo</li>
          <li>El peso en el trimestre, que es de cada curso</li>
        </ul>
      </div>

      {resumen.sinMapear.length > 0 && (
        <div className="aviso">
          <p className="font-semibold">
            {resumen.sinMapear.length}{' '}
            {resumen.sinMapear.length === 1
              ? 'criterio sin equivalente'
              : 'criterios sin equivalente'}{' '}
            en el ciclo destino
          </p>
          <p className="mt-1">
            Se quedan fuera y habrá que elegirlos a mano: {resumen.sinMapear.join(', ')}. No se
            sustituyen por el más parecido, porque dos criterios que se parecen no son el mismo.
          </p>
        </div>
      )}

      {moviendo && resumen.sesionesColocadas > 0 && (
        <div className="aviso">
          <p>
            {resumen.sesionesColocadas}{' '}
            {resumen.sesionesColocadas === 1
              ? 'clase ya colocada se queda'
              : 'clases ya colocadas se quedan'}{' '}
            sin unidad: son clases de los grupos del curso de origen y atribuirlas al curso nuevo
            sería falsear el registro. No se borran.
          </p>
        </div>
      )}
    </>
  )
}

/** Copiar una unidad a otro curso: la original se queda donde está. */
function HojaCopiarUnidad({
  unidad,
  onCerrar,
  onCopiada,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
  onCopiada: (id: string) => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nivel, setNivel] = useState(1)
  const [peso, setPeso] = useState('0')
  const [resumen, setResumen] = useState<ResumenCopia | null>(null)

  useEffect(() => {
    if (unidad) {
      const base = unidad.niveles[unidad.niveles.length - 1] ?? 0
      setNivel(base < 6 ? base + 1 : 1)
    }
    setPeso('0')
  }, [unidad])

  useEffect(() => {
    setResumen(null)
    if (!unidad) return
    let vigente = true
    void resumenCopia(unidad.id, nivel).then((r) => {
      if (vigente) setResumen(r)
    })
    return () => {
      vigente = false
    }
  }, [unidad, nivel])

  const pesoNum = Number(peso) || 0
  const sumaDestino = (resumen?.pesoOcupadoDestino ?? 0) + pesoNum
  const computa = unidad?.etapa === 'primaria' && unidad.computa

  async function copiar() {
    if (!unidad) return
    try {
      const { id, deshacer } = await copiarUnidad(unidad.id, nivel, { pesoTrimestre: pesoNum })
      onCerrar()
      onCopiada(id)
      mostrarAviso(`«${unidad.titulo}» copiada a ${nivel}º`, deshacer)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se ha podido copiar')
    }
  }

  return (
    <Hoja abierta={!!unidad} titulo="Copiar a otro curso" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm">
          Se crea una unidad nueva en el curso que elijas. «{unidad?.titulo}» se queda donde está.
        </p>

        <SelectorCurso nivel={nivel} onCambio={setNivel} />

        {/* §3.6: el peso no se hereda, se pide aquí. El aviso de suma ≠ 100 es
            aviso y no bloqueo, igual que en el reparto del trimestre. */}
        {computa && unidad?.trimestre !== null && (
          <div>
            <label className="etiqueta" htmlFor="ud-peso-destino">
              Peso en el {unidad?.trimestre}.º trimestre de {nivel}º (%)
            </label>
            <Campo
              id="ud-peso-destino"
              className="campo cifra"
              inputMode="numeric"
              valor={peso}
              onValor={setPeso}
            />
            {resumen && sumaDestino !== 100 && (
              <p className="mt-1 text-sm texto-suave">
                Con este peso, el trimestre de {nivel}º suma {sumaDestino} % en vez de 100. Se puede
                dejar así y repartir luego.
              </p>
            )}
          </div>
        )}

        {!resumen && <p className="text-sm texto-suave">Comprobando qué se puede llevar…</p>}
        {resumen && <ResumenDeCopia resumen={resumen} moviendo={false} />}

        <button className="btn-primario w-full" onClick={() => void copiar()} disabled={!resumen}>
          <Copy size={20} aria-hidden />
          Copiar a {nivel}º
        </button>
      </div>
    </Hoja>
  )
}

/** Mover una unidad a otro curso: no deja copia, y se bloquea si hay datos. */
function HojaMoverUnidad({
  unidad,
  onCerrar,
  onCopiar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
  onCopiar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nivel, setNivel] = useState(1)
  const [resumen, setResumen] = useState<ResumenCopia | null>(null)

  useEffect(() => {
    if (unidad) {
      const base = unidad.niveles[unidad.niveles.length - 1] ?? 0
      setNivel(base < 6 ? base + 1 : 1)
    }
  }, [unidad])

  useEffect(() => {
    setResumen(null)
    if (!unidad) return
    let vigente = true
    void resumenCopia(unidad.id, nivel).then((r) => {
      if (vigente) setResumen(r)
    })
    return () => {
      vigente = false
    }
  }, [unidad, nivel])

  const bloqueado = (resumen?.valores ?? 0) > 0

  async function mover() {
    if (!unidad) return
    try {
      const deshacer = await moverUnidad(unidad.id, nivel)
      onCerrar()
      mostrarAviso(`«${unidad.titulo}» movida a ${nivel}º`, deshacer)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se ha podido mover')
    }
  }

  return (
    <Hoja abierta={!!unidad} titulo="Mover a otro curso" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm">
          «{unidad?.titulo}» pasa a ser del curso que elijas. No queda copia en{' '}
          {unidad ? ambitoUnidad(unidad.etapa, unidad.niveles) : ''}.
        </p>

        <SelectorCurso nivel={nivel} onCambio={setNivel} />

        {!resumen && <p className="text-sm texto-suave">Comprobando qué se puede llevar…</p>}

        {resumen && bloqueado ? (
          <>
            <div className="aviso-fuerte">
              <p className="font-semibold">
                Hay {resumen.valores}{' '}
                {resumen.valores === 1 ? 'dato registrado' : 'datos registrados'}
              </p>
              <p className="mt-1">
                Moverla dejaría esas notas atribuidas a un curso que no es el suyo, y eso no se
                arregla después. Cópiala: el original se queda con sus notas.
              </p>
            </div>
            <button
              className="btn-primario w-full"
              onClick={() => {
                onCerrar()
                onCopiar()
              }}
            >
              <Copy size={20} aria-hidden />
              Copiar en su lugar
            </button>
          </>
        ) : (
          resumen && (
            <>
              <ResumenDeCopia resumen={resumen} moviendo />
              <button className="btn-primario w-full" onClick={() => void mover()}>
                <MoveRight size={20} aria-hidden />
                Mover a {nivel}º
              </button>
            </>
          )
        )}
      </div>
    </Hoja>
  )
}

function HojaNuevaUnidad({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [titulo, setTitulo] = useState('')
  const [etapa, setEtapa] = useState<Etapa>(ETAPA_POR_DEFECTO)
  const [nivel, setNivel] = useState(nivelesDe(ETAPA_POR_DEFECTO)[0])
  const [trimestre, setTrimestre] = useState<1 | 2 | 3 | null>(1)
  const [computa, setComputa] = useState(true)
  const [criterios, setCriterios] = useState<string[]>([])

  // Los criterios ofrecidos dependen de la etapa y, en Primaria, del ciclo del
  // nivel: al cambiar cualquiera de los dos, los ya elegidos apuntarían a otro
  // decreto o a otro ciclo.
  useEffect(() => {
    if (abierta) setCriterios([])
  }, [abierta, etapa, nivel])

  const vocabulario = terminologia(etapa)

  async function guardar() {
    if (!titulo.trim()) return
    const id =
      etapa === 'infantil'
        ? await crearUnidad({ etapa: 'infantil', titulo, trimestre, criterios })
        : await crearUnidad({ etapa: 'primaria', titulo, nivel, trimestre, computa, criterios })
    setTitulo('')
    onCerrar()
    mostrarAviso(`${vocabulario.unidad} «${titulo.trim()}» creada`, async () => {
      await db.unidades.delete(id)
    })
  }

  return (
    <Hoja abierta={abierta} titulo={vocabulario.nuevaUnidad} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="ud-titulo">
            Título
          </label>
          <Campo
            id="ud-titulo"
            className="campo"
            valor={titulo}
            onValor={setTitulo}
            placeholder={etapa === 'infantil' ? 'El bosque de los sentidos' : 'Habilidades con móvil'}
            autoFocus
          />
        </div>

        {ETAPA_UNICA === null && (
          <div>
            <span className="etiqueta">Etapa</span>
            <div className="flex gap-2">
              {ETAPAS_DISPONIBLES.map((e) => (
                <button
                  key={e}
                  onClick={() => setEtapa(e)}
                  aria-pressed={etapa === e}
                  className={(etapa === e ? 'btn-primario' : 'btn-suave') + ' flex-1 px-0'}
                >
                  {ETIQUETA_ETAPA[e]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs texto-suave">
              No se puede cambiar después: los criterios son de un decreto distinto en cada etapa.
            </p>
          </div>
        )}

        {etapa === 'primaria' ? (
          <div>
            <span className="etiqueta">Nivel</span>
            <div className="flex flex-wrap gap-2">
              {nivelesDe('primaria').map((n) => (
                <button
                  key={n}
                  onClick={() => setNivel(n)}
                  className={(nivel === n ? 'btn-primario' : 'btn-suave') + ' min-w-tap flex-1 px-0'}
                >
                  {n}º
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel-agua text-sm">
            2.º ciclo de Infantil (3, 4 y 5 años). Los criterios del Decreto 36/2022 son los mismos
            para las tres edades, así que la situación de aprendizaje vale para todo el ciclo.
          </div>
        )}

        <div>
          <span className="etiqueta">Trimestre</span>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTrimestre(t)}
                className={(trimestre === t ? 'btn-primario' : 'btn-suave') + ' px-0'}
              >
                {t}.º
              </button>
            ))}
            <button
              onClick={() => setTrimestre(null)}
              className={(trimestre === null ? 'btn-primario' : 'btn-suave') + ' px-0 text-xs'}
            >
              Ninguno
            </button>
          </div>
          {trimestre === null && etapa === 'primaria' && (
            <p className="mt-1 text-xs texto-suave">
              Una unidad suelta: no entra en la nota de ningún trimestre, pero sí cuenta en la
              cobertura de criterios.
            </p>
          )}
        </div>

        {/* Ponderación: solo Primaria. En Infantil la evaluación es cualitativa
            (§6), así que no hay peso, ni nota, ni nada que repartir. */}
        {etapa === 'primaria' && (
          <label className="tarjeta flex cursor-pointer items-center gap-3 py-3">
            <input
              type="checkbox"
              className="h-6 w-6 shrink-0 accent-primario"
              checked={computa}
              onChange={(e) => setComputa(e.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Cuenta para la nota</span>
              <span className="mt-0.5 block text-xs texto-suave">
                Si lo desmarcas, la unidad se sigue programando y evaluando, pero no entra en el
                reparto de pesos del trimestre.
              </span>
            </span>
          </label>
        )}

        <SelectorCriterios
          etapa={etapa}
          nivel={nivel}
          seleccionados={criterios}
          onCambio={setCriterios}
        />

        <button className="btn-primario w-full" onClick={() => void guardar()} disabled={!titulo.trim()}>
          Crear
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Edición de una unidad ya creada: no existía antes (§ Bloque 1). El nivel se
 * enseña de solo lectura porque cambiarlo cambiaría el ciclo de sus criterios
 * ya asignados; para eso está «Duplicar a otro nivel». La etapa, por lo mismo,
 * tampoco es editable: cambiarla los dejaría apuntando a otro decreto.
 */
function HojaEditarUnidad({
  unidad,
  onCerrar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [trimestre, setTrimestre] = useState<1 | 2 | 3 | null>(1)
  const [computa, setComputa] = useState(true)
  const [criterios, setCriterios] = useState<string[]>([])

  useEffect(() => {
    if (!unidad) return
    setTitulo(unidad.titulo)
    setTrimestre(unidad.trimestre)
    setComputa(unidad.etapa === 'primaria' ? unidad.computa : true)
    setCriterios(unidad.criterios)
  }, [unidad])

  if (!unidad) return null

  const vocabulario = terminologia(unidad.etapa)

  async function guardar() {
    if (!unidad || !titulo.trim()) return
    // Se reescribe la unidad entera en vez de actualizar campos sueltos: así el
    // tipo garantiza que no se cuela `computa` en una unidad de Infantil.
    await db.unidades.put(
      unidad.etapa === 'infantil'
        ? { ...unidad, titulo: titulo.trim(), trimestre, criterios }
        : { ...unidad, titulo: titulo.trim(), trimestre, computa, criterios },
    )
    onCerrar()
  }

  return (
    <Hoja abierta={!!unidad} titulo={`Editar ${vocabulario.unidadEnFrase}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="ud-editar-titulo">
            Título
          </label>
          <Campo
            id="ud-editar-titulo"
            className="campo"
            valor={titulo}
            onValor={setTitulo}
            autoFocus
          />
        </div>

        <div className="panel-agua text-sm">
          {unidad.etapa === 'infantil' ? (
            <>
              2.º ciclo de Infantil (3, 4 y 5 años). Los criterios del Decreto 36/2022 son los
              mismos para las tres edades.
            </>
          ) : (
            <>
              Cursos: <strong>{ambitoUnidad(unidad.etapa, unidad.niveles)}</strong>. Se añaden y
              quitan desde las pestañas de la unidad; los criterios son del ciclo, comunes a todos.
            </>
          )}
        </div>

        <div>
          <span className="etiqueta">Trimestre</span>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTrimestre(t)}
                className={(trimestre === t ? 'btn-primario' : 'btn-suave') + ' px-0'}
              >
                {t}.º
              </button>
            ))}
            <button
              onClick={() => setTrimestre(null)}
              className={(trimestre === null ? 'btn-primario' : 'btn-suave') + ' px-0 text-xs'}
            >
              Ninguno
            </button>
          </div>
        </div>

        {unidad.etapa === 'primaria' && (
          <label className="tarjeta flex cursor-pointer items-center gap-3 py-3">
            <input
              type="checkbox"
              className="h-6 w-6 shrink-0 accent-primario"
              checked={computa}
              onChange={(e) => setComputa(e.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Cuenta para la nota</span>
              <span className="mt-0.5 block text-xs texto-suave">
                Si lo desmarcas, la unidad se sigue programando y evaluando, pero no entra en el
                reparto de pesos del trimestre.
              </span>
            </span>
          </label>
        )}

        <AvisoCriteriosSinMapear unidad={unidad} />

        <SelectorCriterios
          etapa={unidad.etapa}
          nivel={unidad.niveles[0] ?? 1}
          seleccionados={criterios}
          onCambio={setCriterios}
        />

        <button
          className="btn-primario w-full"
          onClick={() => void guardar()}
          disabled={!titulo.trim()}
        >
          Guardar cambios
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Aviso de criterios de Infantil sin programar. Informa, nunca bloquea: en
 * octubre lo normal es tener casi todo el Área I sin tocar, y eso no es un
 * error que corregir sino un mapa de lo que queda.
 */
function AvisoCoberturaInfantil({ unidades }: { unidades: UnidadDidactica[] }) {
  const [abierto, setAbierto] = useState(false)
  // `unidades` no se usa para calcular —eso lo hace `coberturaInfantil` contra
  // la base—, sino como disparador: al cambiar los vínculos, se recalcula.
  const cobertura = useLiveQuery(() => coberturaInfantil(), [unidades.length])

  if (!cobertura || cobertura.length === 0) return null

  const sinVincular = cobertura.filter((c) => c.unidades.length === 0)
  if (sinVincular.length === 0)
    return (
      <div className="panel-agua text-sm">
        Los {cobertura.length} criterios del Área I están vinculados a alguna situación de
        aprendizaje.
      </div>
    )

  return (
    <div className="rounded-xl2 border-2 border-aviso bg-aviso/10 p-3">
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        <span className="flex-1 text-sm font-semibold text-aviso-oscuro">
          {sinVincular.length} de {cobertura.length} criterios del Área I sin vincular
        </span>
        <ChevronDown
          size={18}
          className={'shrink-0 text-aviso-oscuro transition-transform ' + (abierto ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {abierto && (
        <ul className="mt-2 space-y-1">
          {sinVincular.map((c) => (
            <li key={c.criterio.id} className="text-sm">
              <span className="cifra font-bold">{c.criterio.codigo}</span>{' '}
              <span className="texto-suave">{c.criterio.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
