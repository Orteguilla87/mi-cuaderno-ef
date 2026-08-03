import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { TituloSeccion } from '../components/TituloSeccion'
import { leerCursoActivo } from '../db/curso'
import { db } from '../db/db'
import { crearSesion, lunesDe, semanaActual, semanaDe, type HuecoSemana } from '../db/planificador'
import type { CursoEscolar, Grupo, Sesion } from '../db/types'
import { estadoDia, type EstadoDia } from '../lib/calendarioEscolar'
import { aISO, deISO, formatoCorto, formatoLargo, NOMBRES_DIA, sumarDias } from '../lib/fechas'
import { navegar } from '../lib/router'

const INICIALES_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

/** Etiqueta corta del motivo por el que un día no es lectivo. */
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
      return 'Antes del curso'
    case 'despuesDeCurso':
      return 'Curso terminado'
  }
}

/** §5 M8: calendario del curso, con vista de mes y de semana. */
export function Calendario() {
  const [vista, setVista] = useState<'mes' | 'semana'>('mes')
  const curso = useLiveQuery(leerCursoActivo, [])

  return (
    <>
      <Cabecera
        titulo="Calendario"
        atras
        acciones={
          <div role="tablist" aria-label="Vista" className="flex gap-1">
            {(['mes', 'semana'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                onClick={() => setVista(v)}
                aria-selected={vista === v}
                className="pestana-clara"
              >
                {v === 'mes' ? 'Mes' : 'Semana'}
              </button>
            ))}
          </div>
        }
      />

      {vista === 'mes' ? <VistaMes curso={curso} /> : <VistaSemana curso={curso} />}
    </>
  )
}

// ——————————————————————————— vista de mes ———————————————————————————

/** Primer día del mes al que pertenece una fecha, en ISO. */
function primerDiaMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Último día del mes al que pertenece una fecha, en ISO. */
function ultimoDiaMes(iso: string): string {
  const d = deISO(iso)
  return aISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/** Semanas (lunes→domingo) que hay que pintar para cubrir el mes completo. */
function matrizMes(mesISO: string): string[][] {
  const inicio = lunesDe(primerDiaMes(mesISO))
  const finGrid = sumarDias(lunesDe(ultimoDiaMes(mesISO)), 6)
  const semanas: string[][] = []
  for (let cursor = inicio; cursor <= finGrid; cursor = sumarDias(cursor, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(cursor, i)))
  }
  return semanas
}

function nombreMes(mesISO: string): string {
  const texto = deISO(mesISO).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function VistaMes({ curso }: { curso: CursoEscolar | undefined }) {
  const hoy = aISO()
  const [mes, setMes] = useState(() => primerDiaMes(hoy))
  const [diaSel, setDiaSel] = useState<string | null>(hoy.slice(0, 7) === mes.slice(0, 7) ? hoy : null)

  const semanas = matrizMes(mes)
  const gridInicio = semanas[0][0]
  const gridFin = semanas[semanas.length - 1][6]

  const datos = useLiveQuery(async () => {
    const [grupos, sesiones] = await Promise.all([
      db.grupos.toArray(),
      db.sesiones.where('fecha').between(gridInicio, gridFin, true, true).toArray(),
    ])
    const gruposPorId = new Map(grupos.map((g) => [g.id, g]))
    const porDia = new Map<string, Sesion[]>()
    for (const s of sesiones) {
      const lista = porDia.get(s.fecha)
      if (lista) lista.push(s)
      else porDia.set(s.fecha, [s])
    }
    return { gruposPorId, porDia }
  }, [gridInicio, gridFin])

  function cambiarMes(delta: 1 | -1) {
    const nuevo = delta === 1 ? primerDiaMes(sumarDias(ultimoDiaMes(mes), 1)) : primerDiaMes(sumarDias(mes, -1))
    setMes(nuevo)
    setDiaSel(hoy.slice(0, 7) === nuevo.slice(0, 7) ? hoy : null)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <button className="btn-suave px-3" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
          <ChevronLeft size={20} aria-hidden />
        </button>
        <div className="flex-1 text-center text-base font-bold">{nombreMes(mes)}</div>
        <button className="btn-suave px-3" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      <div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-semibold texto-suave">
          {INICIALES_SEMANA.map((d, i) => (
            <div key={i} className={i >= 5 ? 'text-tinta-tenue' : undefined}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {semanas.flat().map((fecha) => (
            <CeldaDia
              key={fecha}
              fecha={fecha}
              enMes={fecha.slice(0, 7) === mes.slice(0, 7)}
              esHoy={fecha === hoy}
              seleccionado={fecha === diaSel}
              nSesiones={datos?.porDia.get(fecha)?.length ?? 0}
              estado={curso ? estadoDia(fecha, curso) : undefined}
              onElegir={() => setDiaSel(fecha)}
            />
          ))}
        </div>
      </div>

      {diaSel && (
        <PanelDia
          fecha={diaSel}
          sesiones={datos?.porDia.get(diaSel) ?? []}
          gruposPorId={datos?.gruposPorId}
          estado={curso ? estadoDia(diaSel, curso) : undefined}
        />
      )}
    </div>
  )
}

/** Fondo de una celda según el estado del día, siempre con tokens de diseño. */
function fondoCelda(estado: EstadoDia | undefined, enMes: boolean): string {
  if (!estado || estado.tipo === 'lectivo')
    return enMes ? 'bg-superficie dark:bg-noche-superficie' : 'bg-superficie/50 dark:bg-noche-superficie/50'
  if (estado.tipo === 'festivo') return 'bg-acento/10 dark:bg-acento/20'
  // Fin de semana, vacaciones y fuera de curso: superficie suave, no accionable.
  return 'bg-agua-claro dark:bg-noche-elevada'
}

function CeldaDia({
  fecha,
  enMes,
  esHoy,
  seleccionado,
  nSesiones,
  estado,
  onElegir,
}: {
  fecha: string
  enMes: boolean
  esHoy: boolean
  seleccionado: boolean
  nSesiones: number
  estado: EstadoDia | undefined
  onElegir: () => void
}) {
  const dia = deISO(fecha).getDate()
  const noLectivo = estado && estado.tipo !== 'lectivo'
  return (
    <button
      onClick={onElegir}
      aria-pressed={seleccionado}
      aria-label={`${formatoLargo(fecha)}${nSesiones ? `, ${nSesiones} ${nSesiones === 1 ? 'sesión' : 'sesiones'}` : ''}`}
      className={
        'flex min-h-[3rem] flex-col items-center justify-start gap-1 rounded-xl p-1 pt-1.5 transition ' +
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 active:scale-95 ' +
        fondoCelda(estado, enMes) +
        (seleccionado ? ' ring-2 ring-primario' : '') +
        (enMes ? '' : ' opacity-55')
      }
    >
      <span
        className={
          'cifra flex h-6 w-6 items-center justify-center rounded-full text-sm ' +
          (esHoy ? 'bg-primario font-bold text-white' : noLectivo ? 'texto-suave' : 'font-semibold')
        }
      >
        {dia}
      </span>
      {nSesiones > 0 ? (
        <span className="cifra rounded-full bg-agua-medio px-1.5 text-xs font-semibold text-primario-oscuro dark:bg-primario/40 dark:text-agua">
          {nSesiones}
        </span>
      ) : (
        <span className="h-4" aria-hidden />
      )}
    </button>
  )
}

function PanelDia({
  fecha,
  sesiones,
  gruposPorId,
  estado,
}: {
  fecha: string
  sesiones: Sesion[]
  gruposPorId: Map<string, Grupo> | undefined
  estado: EstadoDia | undefined
}) {
  const ordenadas = [...sesiones].sort((a, b) => {
    const ga = gruposPorId?.get(a.grupoId)?.nombre ?? ''
    const gb = gruposPorId?.get(b.grupoId)?.nombre ?? ''
    return ga.localeCompare(gb, 'es')
  })
  const noLectivo = estado && estado.tipo !== 'lectivo' ? estado : null

  return (
    <section>
      <TituloSeccion>{formatoLargo(fecha)}</TituloSeccion>

      {noLectivo && (
        <div className="tarjeta mb-2 flex items-center gap-2 bg-agua-claro dark:bg-noche-elevada">
          <CalendarOff size={18} className="shrink-0 texto-suave" aria-hidden />
          <span className="text-sm font-semibold">{etiquetaNoLectivo(noLectivo)}</span>
        </div>
      )}

      {ordenadas.length === 0 ? (
        <p className="text-sm texto-suave">
          {noLectivo ? 'No hay clase este día.' : 'Sin sesiones guardadas este día.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {ordenadas.map((s) => {
            const grupo = gruposPorId?.get(s.grupoId)
            return (
              <li key={s.id}>
                <button
                  onClick={() => navegar(`/sesiones/${s.id}`)}
                  className="tarjeta-pulsable flex w-full items-center gap-3 text-left"
                >
                  <span
                    className="h-10 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: grupo?.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-bold">{grupo?.nombre ?? 'Grupo'}</span>
                      {grupo && <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />}
                    </span>
                    <span className="mt-0.5 block truncate text-sm texto-suave">
                      {s.titulo || 'Sin título'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ——————————————————————————— vista de semana ———————————————————————————

function VistaSemana({ curso }: { curso: CursoEscolar | undefined }) {
  const [lunes, setLunes] = useState(semanaActual)
  const huecos = useLiveQuery(() => semanaDe(lunes), [lunes])
  const viernes = sumarDias(lunes, 4)

  const porDia = (d: number) => (huecos ?? []).filter((h) => h.diaSemana === d)

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <button
          className="btn-suave px-3"
          onClick={() => setLunes(sumarDias(lunes, -7))}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <div className="flex-1 text-center text-base font-bold">
          {formatoCorto(lunes)} – {formatoCorto(viernes)}
        </div>
        <button
          className="btn-suave px-3"
          onClick={() => setLunes(sumarDias(lunes, 7))}
          aria-label="Semana siguiente"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {huecos?.length === 0 && (
        <div className="tarjeta text-center">
          <p className="text-base font-semibold">Sin clases esta semana</p>
          <p className="mt-1 text-sm texto-suave">
            Añade el horario en la ficha de cada grupo y aparecerán aquí.
          </p>
        </div>
      )}

      {[1, 2, 3, 4, 5].map((d) => {
        const delDia = porDia(d)
        if (delDia.length === 0) return null
        const fecha = sumarDias(lunes, d - 1)
        const est = curso ? estadoDia(fecha, curso) : undefined
        const noLectivo = est && est.tipo !== 'lectivo' ? est : null
        return (
          <section key={d}>
            <TituloSeccion>
              {NOMBRES_DIA[d - 1]}{' '}
              <span className="cifra text-sm font-normal texto-suave">{formatoCorto(fecha)}</span>
            </TituloSeccion>
            {noLectivo ? (
              <p className="text-sm texto-suave">{etiquetaNoLectivo(noLectivo)}</p>
            ) : (
              <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {delDia.map((h) => (
                  <li key={`${h.grupo.id}-${h.horaInicio}`}>
                    <TarjetaHueco hueco={h} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function TarjetaHueco({ hueco }: { hueco: HuecoSemana }) {
  const { grupo, fecha, horaInicio, horaFin, sesion } = hueco

  async function editar() {
    const id = sesion?.id ?? (await crearSesion(grupo.id, fecha))
    navegar(`/sesiones/${id}`)
  }

  return (
    <button
      onClick={() => void editar()}
      className="tarjeta-pulsable flex w-full items-center gap-3 text-left"
    >
      <span
        className="h-10 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: grupo.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-bold">{grupo.nombre}</span>
          <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
        </span>
        <span className="cifra mt-0.5 block truncate text-sm texto-suave">
          {horaInicio}–{horaFin}
          {sesion?.titulo ? ` · ${sesion.titulo}` : ' · Sin título'}
        </span>
      </span>
    </button>
  )
}
