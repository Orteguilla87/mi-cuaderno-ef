import { useLiveQuery } from 'dexie-react-hooks'
import {
  Calendar,
  CalendarOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  RotateCcw,
  Share2,
  Table2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { TextoLargo } from '../components/TextoLargo'
import { TituloSeccion } from '../components/TituloSeccion'
import { ValoracionSesion } from '../components/ValoracionSesion'
import { leerCursoActivo } from '../db/curso'
import { db } from '../db/db'
import { crearSesion, lunesDe, semanaActual, semanaDe, type HuecoSemana } from '../db/planificador'
import type { CursoEscolar, Grupo, Sesion } from '../db/types'
import { estadoDia, type EstadoDia } from '../lib/calendarioEscolar'
import {
  aISO,
  formatoCorto,
  formatoLargo,
  horaActual,
  NOMBRES_DIA,
  sumarDias,
} from '../lib/fechas'
import { generarPlanDelDia } from '../lib/informes'
import { navegar } from '../lib/router'

interface Clase {
  grupo: Grupo
  horaInicio: string
  horaFin: string
  registrados: number
  totalAlumnos: number
  sesion?: Sesion
}

export function Hoy() {
  const [vista, setVista] = useState<'dia' | 'semana'>('dia')
  const hoy = aISO()
  // Fecha que se está consultando. Arranca en hoy y se mueve con las flechas o el
  // selector; «en curso»/«siguiente» solo tienen sentido cuando coincide con hoy.
  const [fecha, setFecha] = useState(hoy)
  const esHoy = fecha === hoy
  // Se refresca solo cada minuto: «en curso» y «siguiente» dependen de la hora,
  // y el maestro deja la pantalla abierta durante la clase.
  const [ahora, setAhora] = useState(horaActual)
  useEffect(() => {
    const t = window.setInterval(() => setAhora(horaActual()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const curso = useLiveQuery(leerCursoActivo, [])
  // Única fuente de verdad de «¿toca clase hoy?» (Bloque 1): mira inicio/fin del
  // curso, trimestres y festivos, no solo el fin de semana. Mientras el curso
  // carga, `estado` es undefined y no se afirma nada.
  const estado: EstadoDia | undefined = curso ? estadoDia(fecha, curso) : undefined
  const dia = estado?.tipo === 'lectivo' ? estado.dia : null

  /**
   * Todas las lecturas al principio y el cruce en memoria, como `semanaDe()`.
   *
   * Antes leía la sesión de cada grupo DENTRO de los callbacks de un
   * `Promise.all`, tras un par de `await`: ahí `useLiveQuery` deja de seguirle
   * la pista a lo que se ha leído, y borrar una sesión desde el Planificador no
   * refrescaba esta vista (la de semana sí, porque ya usaba este patrón).
   * De paso pasa de tres consultas por grupo a cuatro en total.
   */
  const clases = useLiveQuery(async (): Promise<Clase[]> => {
    if (dia === null) return []
    const [grupos, alumnos, sesiones, asistencias] = await Promise.all([
      db.grupos.toArray(),
      db.alumnos.toArray(),
      db.sesiones.where('fecha').equals(fecha).toArray(),
      db.asistencias.where('fecha').equals(fecha).toArray(),
    ])

    const registrados = new Set(asistencias.map((a) => a.alumnoId))

    return grupos
      .flatMap((grupo) =>
        grupo.horario
          .filter((f) => f.diaSemana === dia)
          .map((franja) => {
            const activos = alumnos.filter((a) => a.grupoId === grupo.id && a.activo)
            return {
              grupo,
              horaInicio: franja.horaInicio,
              horaFin: franja.horaFin,
              registrados: activos.filter((a) => registrados.has(a.id)).length,
              totalAlumnos: activos.length,
              sesion: sesiones.find((s) => s.grupoId === grupo.id),
            }
          }),
      )
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
  }, [dia, fecha])

  // Solo la jornada de hoy conoce «ahora»: en otros días no hay clase en curso.
  const enCurso = esHoy ? clases?.find((c) => c.horaInicio <= ahora && ahora < c.horaFin) : undefined
  const siguiente = esHoy ? clases?.find((c) => c.horaInicio > ahora) : undefined
  // Lo que hay que atender ahora: la clase en curso o, si no, la próxima.
  const destacada = enCurso ?? siguiente

  return (
    <>
      <Cabecera
        titulo="Hoy"
        subtitulo={
          <span className="cifra">
            {formatoLargo(fecha)}
            {esHoy && ` · ${ahora}`}
          </span>
        }
        acciones={
          <div className="flex rounded-xl border border-white/35 p-0.5">
            {(['dia', 'semana'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className={
                  'rounded-xl px-3 py-1 text-sm font-semibold focus-visible:outline-none ' +
                  'focus-visible:ring-4 focus-visible:ring-white/50 ' +
                  (vista === v ? 'bg-white text-primario' : 'text-white/90')
                }
              >
                {v === 'dia' ? 'Día' : 'Semana'}
              </button>
            ))}
          </div>
        }
      />

      {vista === 'semana' ? (
        <VistaSemanaHoy hoy={hoy} curso={curso} />
      ) : (
      <div className="space-y-4 p-4">
        <NavegadorFecha
          etiqueta={formatoLargo(fecha)}
          valor={fecha}
          esHoy={esHoy}
          onAnterior={() => setFecha(sumarDias(fecha, -1))}
          onSiguiente={() => setFecha(sumarDias(fecha, 1))}
          onElegir={setFecha}
          onHoy={() => setFecha(hoy)}
        />

        {!estado ? null : estado.tipo !== 'lectivo' ? (
          <MensajeNoLectivo estado={estado} curso={curso} />
        ) : clases?.length === 0 ? (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Sin clases el {NOMBRES_DIA[estado.dia - 1]}</p>
            <p className="mt-1 text-sm texto-suave">
              Añade el horario en la ficha de cada grupo y aparecerán aquí.
            </p>
            <button className="btn-primario mt-4 w-full" onClick={() => navegar('/grupos')}>
              Ir a Grupos
            </button>
          </div>
        ) : (
          <>
            {esHoy && (
              <section>
                <TituloSeccion>
                  {enCurso ? 'Ahora en clase' : siguiente ? 'Siguiente clase' : 'Jornada terminada'}
                </TituloSeccion>

                {destacada ? (
                  <TarjetaClase clase={destacada} destacada enCurso={!!enCurso} />
                ) : (
                  <p className="text-sm texto-suave">
                    Ya no quedan clases hoy. Puedes repasar lo registrado más abajo.
                  </p>
                )}
              </section>
            )}

            <section>
              <TituloSeccion>Jornada completa</TituloSeccion>
              <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {clases?.map((c) => (
                  <li key={`${c.grupo.id}-${c.horaInicio}`}>
                    <TarjetaClase
                      clase={c}
                      enCurso={c === enCurso}
                      pasada={esHoy && c.horaFin <= ahora && c !== enCurso}
                    />
                  </li>
                ))}
              </ul>
            </section>

            {clases && clases.length > 0 && (
              <button
                className="btn-suave w-full"
                onClick={() =>
                  void generarPlanDelDia(
                    fecha,
                    clases.map((c) => ({ grupo: c.grupo, horaInicio: c.horaInicio, horaFin: c.horaFin, sesion: c.sesion })),
                  )
                }
              >
                <Share2 size={18} aria-hidden />
                Compartir el día (PDF)
              </button>
            )}
          </>
        )}
      </div>
      )}
    </>
  )
}

/**
 * Tarjeta de «no hay clase», con el motivo real según el estado del día (Bloque 1):
 * fin de semana, festivo, vacaciones entre trimestres, o el curso aún sin empezar
 * o ya terminado. Antes solo distinguía festivo de fin de semana.
 */
function MensajeNoLectivo({
  estado,
  curso,
}: {
  estado: Exclude<EstadoDia, { tipo: 'lectivo' }>
  curso: CursoEscolar | undefined
}) {
  const textos: Record<typeof estado.tipo, { titulo: string; texto: string }> = {
    finDeSemana: { titulo: 'Fin de semana', texto: 'No hay clases programadas.' },
    festivo: {
      titulo: 'Día festivo',
      texto: 'Está marcado como festivo en el calendario del curso.',
    },
    vacaciones: {
      titulo: 'Vacaciones',
      texto: 'Este día queda entre trimestres: no hay clase.',
    },
    antesDeCurso: {
      titulo: 'El curso aún no ha empezado',
      texto: curso ? `Las clases empiezan el ${formatoLargo(curso.inicio)}.` : 'Aún no ha empezado.',
    },
    despuesDeCurso: {
      titulo: 'El curso ha terminado',
      texto: curso ? `El curso acabó el ${formatoLargo(curso.fin)}.` : 'El curso ya ha terminado.',
    },
  }
  const { titulo, texto } = textos[estado.tipo]

  return (
    <div className="tarjeta text-center">
      <CalendarOff className="mx-auto text-tinta-tenue" size={32} aria-hidden />
      <p className="mt-2 text-base font-semibold">{titulo}</p>
      <p className="mt-1 text-sm texto-suave">{texto}</p>
    </div>
  )
}

/** Etiqueta corta de un día no lectivo, para listas donde no cabe la tarjeta entera. */
function etiquetaNoLectivo(tipo: Exclude<EstadoDia, { tipo: 'lectivo' }>['tipo']): string {
  switch (tipo) {
    case 'finDeSemana':
      return 'Fin de semana'
    case 'festivo':
      return 'Día festivo'
    case 'vacaciones':
      return 'Vacaciones'
    case 'antesDeCurso':
      return 'El curso aún no ha empezado'
    case 'despuesDeCurso':
      return 'El curso ha terminado'
  }
}

/**
 * Barra de navegación por fecha: flechas anterior/siguiente y un botón central
 * que abre el selector nativo de fecha. Sirve tanto para moverse día a día como
 * semana a semana (según qué haga cada flecha), reutilizando el mismo diseño en
 * ambas vistas.
 *
 * «Volver a hoy» va DEBAJO, en su propia línea, y no dentro de la fila: ahí
 * aparecía de la nada al cambiar de fecha y empujaba «siguiente» hacia la
 * izquierda, así que el segundo toque en el mismo sitio te devolvía a hoy en
 * vez de avanzar otro día.
 */
function NavegadorFecha({
  etiqueta,
  valor,
  esHoy,
  etiquetaHoy = 'Volver a hoy',
  onAnterior,
  onSiguiente,
  onElegir,
  onHoy,
  ariaAnterior = 'Anterior',
  ariaSiguiente = 'Siguiente',
}: {
  etiqueta: string
  valor: string
  esHoy: boolean
  etiquetaHoy?: string
  onAnterior: () => void
  onSiguiente: () => void
  onElegir: (iso: string) => void
  onHoy: () => void
  ariaAnterior?: string
  ariaSiguiente?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button className="btn-suave px-3" onClick={onAnterior} aria-label={ariaAnterior}>
          <ChevronLeft size={20} aria-hidden />
        </button>
        <label className="btn-fantasma relative flex flex-1 cursor-pointer items-center justify-center gap-2">
          <Calendar size={18} aria-hidden />
          <span className="truncate">{etiqueta}</span>
          <input
            type="date"
            value={valor}
            onChange={(e) => e.target.value && onElegir(e.target.value)}
            aria-label="Elegir fecha"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button className="btn-suave px-3" onClick={onSiguiente} aria-label={ariaSiguiente}>
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {!esHoy && (
        <button className="btn-suave w-full" onClick={onHoy}>
          <RotateCcw size={18} aria-hidden />
          {etiquetaHoy}
        </button>
      )}
    </div>
  )
}

/**
 * Vista semanal de «Hoy» (Bloque 5): sesiones plegadas por defecto, solo con
 * cabecera. Al desplegar, únicamente los campos que tienen contenido — nada
 * de secciones vacías ni guiones.
 */
function VistaSemanaHoy({ hoy, curso }: { hoy: string; curso: CursoEscolar | undefined }) {
  const [lunes, setLunes] = useState(semanaActual)
  const huecos = useLiveQuery(() => semanaDe(lunes), [lunes])

  const porDia = (d: number) => (huecos ?? []).filter((h) => h.diaSemana === d)

  const lunesHoy = lunesDe(hoy)
  const viernes = sumarDias(lunes, 4)

  return (
    <div className="space-y-4 p-4">
      <NavegadorFecha
        etiqueta={`${formatoCorto(lunes)} – ${formatoCorto(viernes)}`}
        valor={lunes}
        esHoy={lunes === lunesHoy}
        etiquetaHoy="Volver a esta semana"
        onAnterior={() => setLunes(sumarDias(lunes, -7))}
        onSiguiente={() => setLunes(sumarDias(lunes, 7))}
        onElegir={(iso) => setLunes(lunesDe(iso))}
        onHoy={() => setLunes(lunesHoy)}
        ariaAnterior="Semana anterior"
        ariaSiguiente="Semana siguiente"
      />

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
        // Un día con horario pero no lectivo (festivo, vacaciones o fuera de
        // curso) no enseña sus clases: contradiría al calendario. Se mantiene la
        // cabecera con el motivo, para que no parezca que se han perdido.
        const est = curso ? estadoDia(fecha, curso) : undefined
        const noLectivo = est && est.tipo !== 'lectivo' ? est : null
        return (
          <section key={d}>
            <TituloSeccion>
              {NOMBRES_DIA[d - 1]}{' '}
              <span className="cifra text-sm font-normal texto-suave">{formatoCorto(fecha)}</span>
              {fecha === hoy && <span className="pildora ml-2 bg-primario text-white">Hoy</span>}
            </TituloSeccion>
            {noLectivo ? (
              <p className="text-sm texto-suave">{etiquetaNoLectivo(noLectivo.tipo)}</p>
            ) : (
              <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {delDia.map((h) => (
                  <li key={`${h.grupo.id}-${h.horaInicio}`}>
                    <TarjetaSesionSemana hueco={h} />
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

function TarjetaSesionSemana({ hueco }: { hueco: HuecoSemana }) {
  const [abierta, setAbierta] = useState(false)
  const { grupo, fecha, horaInicio, horaFin, sesion } = hueco

  const campos: { etiqueta: string; texto: string }[] = []
  if (sesion?.notas) campos.push({ etiqueta: 'Notas', texto: sesion.notas })
  if (sesion?.recursosNecesarios)
    campos.push({ etiqueta: 'Recursos necesarios', texto: sesion.recursosNecesarios })
  if (sesion?.comentarios) campos.push({ etiqueta: 'Comentarios', texto: sesion.comentarios })
  if (sesion?.juegos.length)
    campos.push({ etiqueta: 'Juegos', texto: sesion.juegos.map((j) => j.nombre).join(', ') })
  if (sesion?.recursos.length)
    campos.push({
      etiqueta: 'Enlaces y notas',
      texto: sesion.recursos.map((r) => r.valor).join(' · '),
    })

  async function editar() {
    const id = sesion?.id ?? (await crearSesion(grupo.id, fecha))
    navegar(`/sesiones/${id}`)
  }

  async function valorar(v: 1 | 2 | 3 | 4 | 5 | undefined) {
    const id = sesion?.id ?? (await crearSesion(grupo.id, fecha))
    await db.sesiones.update(id, { valoracion: v })
  }

  return (
    <div className="tarjeta">
      <button
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={abierta}
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
        <ChevronDown
          size={20}
          className={
            'shrink-0 texto-suave ' + (abierta ? 'rotate-180 transition-transform' : 'transition-transform')
          }
          aria-hidden
        />
      </button>

      {abierta && (
        <div className="mt-3 space-y-3 border-t border-borde pt-3 dark:border-noche-borde">
          {campos.map((c) => (
            <p key={c.etiqueta} className="text-sm">
              <span className="font-bold">{c.etiqueta}: </span>
              <TextoLargo texto={c.texto} />
            </p>
          ))}

          <div>
            <p className="etiqueta">Valoración</p>
            <ValoracionSesion valor={sesion?.valoracion} onCambio={(v) => void valorar(v)} />
          </div>

          <button className="btn-suave w-full" onClick={() => void editar()}>
            Editar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Pulsar sobre el grupo despliega/pliega toda la tarjeta (Bloque 3): antes
 * solo navegaba a pasar lista y la descripción tenía su propio mini-botón.
 * El icono de pasar lista queda aparte, siempre visible, para no perder ese
 * acceso al pasar a modo desplegable.
 */
function TarjetaClase({
  clase,
  destacada = false,
  enCurso = false,
  pasada = false,
}: {
  clase: Clase
  destacada?: boolean
  enCurso?: boolean
  pasada?: boolean
}) {
  const [abierta, setAbierta] = useState(false)
  const { grupo, horaInicio, horaFin, registrados, totalAlumnos, sesion } = clase
  const completo = totalAlumnos > 0 && registrados >= totalAlumnos
  const hayDescripcion = !!(
    sesion &&
    (sesion.notas || sesion.recursosNecesarios || sesion.comentarios || sesion.juegos.length > 0)
  )

  return (
    <div
      className={
        'tarjeta ' + (destacada ? 'border-2 border-primario ' : '') + (pasada ? 'opacity-60' : '')
      }
    >
      <div className="flex w-full items-center gap-2">
        <button
          onClick={() => setAbierta((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={abierta}
        >
          <span
            className="h-12 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: grupo.color }}
            aria-hidden
          />

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-lg font-bold">{grupo.nombre}</span>
              <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
              {enCurso && (
                <span className="pildora bg-primario text-white">
                  <Clock size={11} className="mr-1" aria-hidden />
                  Ahora
                </span>
              )}
            </span>
            <span className="cifra mt-0.5 block text-sm texto-suave">
              {horaInicio}–{horaFin} · {totalAlumnos} {totalAlumnos === 1 ? 'alumno' : 'alumnos'}
            </span>
            {sesion?.titulo && <span className="mt-0.5 block truncate text-sm">{sesion.titulo}</span>}
          </span>

          <ChevronDown
            size={18}
            className={
              'shrink-0 texto-suave ' + (abierta ? 'rotate-180 transition-transform' : 'transition-transform')
            }
            aria-hidden
          />
        </button>

        <button
          onClick={() => navegar(`/cuaderno/${grupo.id}`)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-agua-claro text-primario-oscuro transition active:scale-95 dark:bg-noche-elevada dark:text-agua"
          aria-label={`Abrir ${grupo.nombre} en el Cuaderno`}
        >
          <Table2 size={20} aria-hidden />
        </button>

        <button
          onClick={() => navegar(`/asistencia/${grupo.id}`)}
          className={
            'flex shrink-0 flex-col items-center gap-0.5 text-xs font-bold ' +
            (completo ? 'text-lima-oscuro dark:text-lima' : 'text-primario dark:text-agua')
          }
          aria-label={completo ? `Asistencia completa · ${grupo.nombre}` : `Pasar lista · ${grupo.nombre}`}
        >
          {completo ? (
            <>
              <Check size={22} aria-hidden />
              Hecho
            </>
          ) : (
            <>
              <ClipboardCheck size={22} aria-hidden />
              {registrados > 0 ? `${registrados}/${totalAlumnos}` : 'Pasar lista'}
            </>
          )}
        </button>
      </div>

      {abierta && (
        <div className="mt-3 space-y-1.5 border-t border-borde pt-3 text-sm dark:border-noche-borde">
          {hayDescripcion ? (
            <>
              {sesion!.notas && (
                <p>
                  <span className="font-bold">Descripción: </span>
                  <TextoLargo texto={sesion!.notas} />
                </p>
              )}
              {sesion!.recursosNecesarios && (
                <p>
                  <span className="font-bold">Recursos necesarios: </span>
                  <TextoLargo texto={sesion!.recursosNecesarios} />
                </p>
              )}
              {sesion!.comentarios && (
                <p>
                  <span className="font-bold">Comentarios: </span>
                  <TextoLargo texto={sesion!.comentarios} />
                </p>
              )}
              {sesion!.juegos.length > 0 && (
                <p className="texto-suave">
                  Juegos: {sesion!.juegos.map((j) => j.nombre).join(', ')}
                </p>
              )}
            </>
          ) : (
            <p className="texto-suave">Sin planificación para esta sesión.</p>
          )}
        </div>
      )}
    </div>
  )
}
