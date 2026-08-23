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
  MoreVertical,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Campo } from '../components/Campo'
import { Hoja } from '../components/Hoja'
import { NavegadorFecha } from '../components/NavegadorFecha'
import { SelectorCriterios } from '../components/SelectorCriterios'
import { TituloSeccion } from '../components/TituloSeccion'
import { coberturaInfantil } from '../db/coberturaInfantil'
import { leerCursoActivo } from '../db/curso'
import { db } from '../db/db'
import {
  aplicarUnidadAGrupo,
  archivarUnidad,
  contarImpactoUnidad,
  crearSesion,
  crearUnidad,
  duplicarUnidad,
  eliminarUnidad,
  lunesDe,
  type ImpactoUnidad,
} from '../db/planificador'
import { huecosDe, type HuecoCalendario } from '../db/sesiones'
import type { Etapa, UnidadDidactica } from '../db/types'
import { estadoDia, type EstadoDia } from '../lib/calendarioEscolar'
import { aISO, formatoCorto, NOMBRES_DIA, sumarDias } from '../lib/fechas'
import { ambitoUnidad, terminologia } from '../lib/literales'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'
import { useVistaPlanificador, type VistaPlanificador } from '../store/vistaPlanificador'
import { PlanGrupo } from './PlanGrupo'

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
  // Sin etapa que consultar en la cabecera —el listado las mezcla—, se usa el
  // término neutro; el rótulo por etapa aparece dentro de cada elemento.
  unidades: 'Unidades y situaciones de aprendizaje',
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
  const curso = useLiveQuery(() => leerCursoActivo(), [])
  const hoy = aISO()

  async function abrir(h: HuecoCalendario) {
    // Un hueco sin sesión la crea al vuelo: planificar no debe costar dos pasos.
    const id = h.sesion?.id ?? (await crearSesion(h.grupo.id, h.fecha))
    navegar(`/sesiones/${id}`)
  }

  const porDia = (d: number) => (huecos ?? []).filter((h) => h.diaSemana === d)

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
          const estado = estados[d - 1]
          const noLectivo = estado && estado.tipo !== 'lectivo' ? estado : null
          if (delDia.length === 0 && !noLectivo) return null
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
                <ul className="grid gap-2 apaisado:grid-cols-2 lg:grid-cols-2">
                  {delDia.map((h) => (
                    <li key={`${h.grupo.id}-${h.horaInicio}`}>
                      <button
                        className="tarjeta-pulsable flex w-full items-center gap-3 text-left"
                        onClick={() => void abrir(h)}
                      >
                        <span
                          className="h-10 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: h.grupo.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-bold">{h.grupo.nombre}</span>
                            <BadgeEtapa etapa={h.grupo.etapa} nivel={h.grupo.nivel} />
                          </span>
                          <span className="cifra mt-0.5 block truncate text-sm texto-suave">
                            {h.horaInicio && h.horaFin ? `${h.horaInicio}–${h.horaFin}` : 'Sin hora fija'}
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
                    </li>
                  ))}
                </ul>
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

const FILTROS: { valor: FiltroEtapa; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'primaria', etiqueta: 'Primaria' },
  { valor: 'infantil', etiqueta: 'Infantil' },
]

function VistaUnidades() {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<UnidadDidactica | null>(null)
  const [duplicando, setDuplicando] = useState<{ id: string; titulo: string; nivel: number } | null>(
    null,
  )
  const [llevando, setLlevando] = useState<UnidadDidactica | null>(null)
  const [acciones, setAcciones] = useState<UnidadDidactica | null>(null)
  const [eliminando, setEliminando] = useState<UnidadDidactica | null>(null)
  const [desplegada, setDesplegada] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroEtapa>('todas')
  const [verArchivadas, setVerArchivadas] = useState(false)

  const unidades = useLiveQuery(async () => {
    const lista = await db.unidades.toArray()
    // Las unidades sin trimestre van al final de su nivel: son las sueltas.
    // Infantil va primero porque su nivel es 0 (el ciclo entero).
    const orden = (t: number | null) => t ?? 9
    return lista.sort(
      (a, b) =>
        a.nivel - b.nivel ||
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

  const porEtapa = (unidades ?? []).filter((u) => filtro === 'todas' || u.etapa === filtro)
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
          const plan = [...(u.sesiones ?? [])].sort((a, b) => a.orden - b.orden)
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
                  </div>
                  <p className="cifra mt-0.5 text-sm texto-suave">
                    {ambitoUnidad(u.etapa, u.nivel)} ·{' '}
                    {u.trimestre === null ? 'sin trimestre' : `${u.trimestre}.º trimestre`} ·{' '}
                    {/* Dos cifras distintas: lo que la unidad tiene escrito y lo
                        que ya ocupa clases. Una sola las confundiría. */}
                    {plan.length > 0 && `${plan.length} planificadas · `}
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

              {plan.length > 0 && (
                <>
                  <div className="flex gap-2">
                    <button
                      className="btn-suave flex-1 px-3 text-xs"
                      onClick={() => setDesplegada(abierta ? null : u.id)}
                      aria-expanded={abierta}
                    >
                      <ChevronDown
                        size={16}
                        className={abierta ? 'rotate-180 transition-transform' : 'transition-transform'}
                        aria-hidden
                      />
                      {abierta ? 'Ocultar sesiones' : `Ver las ${plan.length} sesiones`}
                    </button>
                    <button
                      className="btn-suave flex-1 px-3 text-xs"
                      onClick={() => setLlevando(u)}
                    >
                      <CalendarPlus size={16} aria-hidden />
                      Llevar a un grupo
                    </button>
                  </div>

                  {abierta && (
                    <ol className="space-y-1 border-t border-borde pt-2 dark:border-noche-borde">
                      {plan.map((s, i) => (
                        <li key={s.id} className="flex gap-2 text-sm">
                          <span className="cifra shrink-0 font-bold texto-suave">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{s.titulo}</span>
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
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>

      <HojaNuevaUnidad abierta={creando} onCerrar={() => setCreando(false)} />
      <HojaEditarUnidad unidad={editando} onCerrar={() => setEditando(null)} />
      <HojaDuplicarUnidad unidad={duplicando} onCerrar={() => setDuplicando(null)} />
      <HojaLlevarAGrupo unidad={llevando} onCerrar={() => setLlevando(null)} />
      <HojaAccionesUnidad
        unidad={acciones}
        onCerrar={() => setAcciones(null)}
        onDuplicar={(u) => setDuplicando({ id: u.id, titulo: u.titulo, nivel: u.nivel })}
        onEliminar={setEliminando}
      />
      <HojaEliminarUnidad unidad={eliminando} onCerrar={() => setEliminando(null)} />
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
 */
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
  const [error, setError] = useState<string | null>(null)

  const grupos = useLiveQuery(async () => {
    if (!unidad) return []
    const lista = await db.grupos.where('etapa').equals(unidad.etapa).toArray()
    return lista
      .filter((g) => unidad.etapa === 'infantil' || g.nivel === unidad.nivel)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [unidad?.id])

  useEffect(() => {
    if (!unidad) return
    setDesde(aISO())
    setError(null)
    setGrupoId('')
  }, [unidad])

  if (!unidad) return null

  const plan = unidad.sesiones ?? []
  const vocabulario = terminologia(unidad.etapa)

  async function llevar() {
    if (!unidad || !grupoId) return
    setError(null)
    try {
      const r = await aplicarUnidadAGrupo({ udId: unidad.id, grupoId, desde })
      onCerrar()
      const partes = [`${r.creadas} ${r.creadas === 1 ? 'sesión colocada' : 'sesiones colocadas'}`]
      if (r.omitidas > 0) partes.push(`${r.omitidas} ${r.omitidas === 1 ? 'clase ocupada' : 'clases ocupadas'} respetadas`)
      if (r.sinHueco > 0) partes.push(`${r.sinHueco} sin hueco antes de fin de curso`)
      mostrarAviso(partes.join(' · '), r.deshacer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido llevar la unidad')
    }
  }

  return (
    <Hoja abierta={!!unidad} titulo={`Llevar «${unidad.titulo}» a un grupo`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          Las {plan.length} sesiones de {vocabulario.unidadEnFrase} se colocan en las clases
          seguidas del grupo a partir de la fecha. Una clase que ya tenga sesión se respeta y la
          siguiente busca el hueco de después.
        </p>

        <div>
          <span className="etiqueta">Grupo</span>
          {grupos?.length === 0 ? (
            <p className="text-sm texto-suave">
              No hay ningún grupo de {ambitoUnidad(unidad.etapa, unidad.nivel)} en esta etapa.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grupos?.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGrupoId(g.id)}
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
            Primera clase
          </label>
          <input
            id="ud-desde"
            type="date"
            className="campo"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>

        {error && <p className="text-sm font-semibold text-acento">{error}</p>}

        <button
          className="btn-primario w-full"
          onClick={() => void llevar()}
          disabled={!grupoId || plan.length === 0}
        >
          Colocar {plan.length} {plan.length === 1 ? 'sesión' : 'sesiones'}
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
  onDuplicar,
  onEliminar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
  onDuplicar: (u: UnidadDidactica & { etapa: 'primaria' }) => void
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
        {/* Duplicar es «llevar esto a otro curso». En Infantil no hay otro
            curso al que llevarlo: la unidad ya es del ciclo entero. */}
        {unidad?.etapa === 'primaria' && (
          <button
            className="btn-suave w-full justify-start"
            onClick={() => {
              onDuplicar(unidad)
              onCerrar()
            }}
          >
            <Copy size={20} aria-hidden />
            Duplicar a otro curso
          </button>
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
 * salida es archivar. Sin nada escrito, se borra, pero exigiendo escribir el
 * título: es la única acción de la app que no se puede deshacer de un toque.
 */
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
  const titulo = unidad?.titulo.trim().toLocaleLowerCase('es') ?? ''
  const coincide = confirmacion.trim().toLocaleLowerCase('es') === titulo && titulo !== ''
  const pesoEnJuego =
    unidad?.etapa === 'primaria' && unidad.computa && unidad.pesoTrimestre > 0
      ? unidad.pesoTrimestre
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
                    Escribe «{unidad?.titulo}» para confirmar
                  </label>
                  <Campo
                    id="ud-confirmar"
                    className="campo"
                    valor={confirmacion}
                    onValor={setConfirmacion}
                    placeholder={unidad?.titulo}
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

/** Duplicar una UD a otro nivel: así se reutiliza el mismo esqueleto entre cursos. */
function HojaDuplicarUnidad({
  unidad,
  onCerrar,
}: {
  unidad: { id: string; titulo: string; nivel: number } | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nivel, setNivel] = useState(1)

  // El nivel de partida es el siguiente al de origen: duplicar a su propio
  // nivel casi nunca es lo que se quiere.
  useEffect(() => {
    if (unidad) setNivel(unidad.nivel < 6 ? unidad.nivel + 1 : 1)
  }, [unidad])

  async function duplicar() {
    if (!unidad) return
    const id = await duplicarUnidad(unidad.id, nivel)
    onCerrar()
    mostrarAviso(`«${unidad.titulo}» duplicada a ${nivel}º`, async () => {
      await db.unidades.delete(id)
    })
  }

  return (
    <Hoja abierta={!!unidad} titulo="Duplicar unidad" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          Se copia «{unidad?.titulo}» con sus criterios y trimestre. Las sesiones no se duplican.
        </p>

        <div>
          <span className="etiqueta">Nivel de destino</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
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

        <button className="btn-primario w-full" onClick={() => void duplicar()}>
          Duplicar unidad
        </button>
      </div>
    </Hoja>
  )
}

function HojaNuevaUnidad({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [titulo, setTitulo] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('primaria')
  const [nivel, setNivel] = useState(1)
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

        <div>
          <span className="etiqueta">Etapa</span>
          <div className="flex gap-2">
            {(['primaria', 'infantil'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEtapa(e)}
                aria-pressed={etapa === e}
                className={(etapa === e ? 'btn-primario' : 'btn-suave') + ' flex-1 px-0'}
              >
                {e === 'primaria' ? 'Primaria' : 'Infantil'}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs texto-suave">
            No se puede cambiar después: los criterios son de un decreto distinto en cada etapa.
          </p>
        </div>

        {etapa === 'primaria' ? (
          <div>
            <span className="etiqueta">Nivel</span>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
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
              Nivel: <strong>{unidad.nivel}º</strong>. Para cambiarlo, duplica la unidad al nivel
              destino desde la lista.
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

        <SelectorCriterios
          etapa={unidad.etapa}
          nivel={unidad.nivel}
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
