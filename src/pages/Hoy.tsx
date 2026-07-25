import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Share2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { TituloSeccion } from '../components/TituloSeccion'
import { ValoracionSesion } from '../components/ValoracionSesion'
import { leerAsistenciaGrupo } from '../db/asistencia'
import { leerCursoActivo } from '../db/curso'
import { db } from '../db/db'
import { crearSesion, lunesDe, semanaActual, semanaDe, type HuecoSemana } from '../db/planificador'
import type { Grupo, Sesion } from '../db/types'
import {
  aISO,
  diaLectivo,
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
  // Se refresca solo cada minuto: «en curso» y «siguiente» dependen de la hora,
  // y el maestro deja la pantalla abierta durante la clase.
  const [ahora, setAhora] = useState(horaActual)
  useEffect(() => {
    const t = window.setInterval(() => setAhora(horaActual()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const curso = useLiveQuery(leerCursoActivo, [])
  const esFestivo = !!curso?.festivos.includes(hoy)
  const dia = diaLectivo(hoy)

  const clases = useLiveQuery(async (): Promise<Clase[]> => {
    if (dia === null) return []
    const grupos = await db.grupos.toArray()
    const conClase = grupos.flatMap((g) =>
      g.horario.filter((f) => f.diaSemana === dia).map((f) => ({ grupo: g, franja: f })),
    )

    const resultado = await Promise.all(
      conClase.map(async ({ grupo, franja }) => {
        const alumnos = await db.alumnos.where('grupoId').equals(grupo.id).toArray()
        const activos = alumnos.filter((a) => a.activo)
        const registros = await leerAsistenciaGrupo(
          activos.map((a) => a.id),
          hoy,
        )
        const sesion = await db.sesiones
          .where('[grupoId+fecha]')
          .equals([grupo.id, hoy])
          .first()
        return {
          grupo,
          horaInicio: franja.horaInicio,
          horaFin: franja.horaFin,
          registrados: registros.size,
          totalAlumnos: activos.length,
          sesion,
        }
      }),
    )
    return resultado.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
  }, [dia, hoy])

  const enCurso = clases?.find((c) => c.horaInicio <= ahora && ahora < c.horaFin)
  const siguiente = clases?.find((c) => c.horaInicio > ahora)
  // Lo que hay que atender ahora: la clase en curso o, si no, la próxima.
  const destacada = enCurso ?? siguiente

  return (
    <>
      <Cabecera
        titulo="Hoy"
        subtitulo={
          <span className="cifra">
            {formatoLargo(hoy)} · {ahora}
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
        <VistaSemanaHoy hoy={hoy} />
      ) : (
      <div className="space-y-4 p-4">
        {dia === null || esFestivo ? (
          <div className="tarjeta text-center">
            <CalendarOff className="mx-auto text-tinta-tenue" size={32} aria-hidden />
            <p className="mt-2 text-base font-semibold">
              {esFestivo ? 'Día no lectivo' : 'Fin de semana'}
            </p>
            <p className="mt-1 text-sm texto-suave">
              {esFestivo
                ? 'Está marcado como festivo en el calendario del curso.'
                : 'No hay clases programadas.'}
            </p>
          </div>
        ) : clases?.length === 0 ? (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Sin clases el {NOMBRES_DIA[dia - 1]}</p>
            <p className="mt-1 text-sm texto-suave">
              Añade el horario en la ficha de cada grupo y aparecerán aquí.
            </p>
            <button className="btn-primario mt-4 w-full" onClick={() => navegar('/grupos')}>
              Ir a Grupos
            </button>
          </div>
        ) : (
          <>
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

            <section>
              <TituloSeccion>Jornada completa</TituloSeccion>
              <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {clases?.map((c) => (
                  <li key={`${c.grupo.id}-${c.horaInicio}`}>
                    <TarjetaClase
                      clase={c}
                      enCurso={c === enCurso}
                      pasada={c.horaFin <= ahora && c !== enCurso}
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
                    hoy,
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
 * Vista semanal de «Hoy» (Bloque 5): sesiones plegadas por defecto, solo con
 * cabecera. Al desplegar, únicamente los campos que tienen contenido — nada
 * de secciones vacías ni guiones.
 */
function VistaSemanaHoy({ hoy }: { hoy: string }) {
  const [lunes, setLunes] = useState(semanaActual)
  const huecos = useLiveQuery(() => semanaDe(lunes), [lunes])

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
        <button className="btn-fantasma flex-1" onClick={() => setLunes(lunesDe(hoy))}>
          Semana actual
        </button>
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
        return (
          <section key={d}>
            <TituloSeccion>
              {NOMBRES_DIA[d - 1]}{' '}
              <span className="cifra text-sm font-normal texto-suave">{formatoCorto(fecha)}</span>
              {fecha === hoy && <span className="pildora ml-2 bg-primario text-white">Hoy</span>}
            </TituloSeccion>
            <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {delDia.map((h) => (
                <li key={`${h.grupo.id}-${h.horaInicio}`}>
                  <TarjetaSesionSemana hueco={h} />
                </li>
              ))}
            </ul>
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
              {c.texto}
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
      <button
        onClick={() => navegar(`/asistencia/${grupo.id}`)}
        className="flex w-full items-center gap-3 text-left"
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

        <span
          className={
            'flex shrink-0 flex-col items-center gap-0.5 text-xs font-bold ' +
            (completo ? 'text-lima-oscuro dark:text-lima' : 'text-primario dark:text-agua')
          }
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
        </span>
      </button>

      {hayDescripcion && (
        <>
          <button
            onClick={() => setAbierta((v) => !v)}
            className="mt-2 flex w-full items-center justify-between border-t border-borde pt-2 text-xs font-bold text-primario dark:border-noche-borde dark:text-agua"
            aria-expanded={abierta}
          >
            {abierta ? 'Ocultar descripción' : 'Ver descripción de la sesión'}
            <ChevronDown
              size={16}
              className={abierta ? 'rotate-180 transition-transform' : 'transition-transform'}
              aria-hidden
            />
          </button>
          {abierta && (
            <div className="mt-2 space-y-1.5 text-sm">
              {sesion!.notas && (
                <p>
                  <span className="font-bold">Descripción: </span>
                  {sesion!.notas}
                </p>
              )}
              {sesion!.recursosNecesarios && (
                <p>
                  <span className="font-bold">Recursos necesarios: </span>
                  {sesion!.recursosNecesarios}
                </p>
              )}
              {sesion!.comentarios && (
                <p>
                  <span className="font-bold">Comentarios: </span>
                  {sesion!.comentarios}
                </p>
              )}
              {sesion!.juegos.length > 0 && (
                <p className="texto-suave">
                  Juegos: {sesion!.juegos.map((j) => j.nombre).join(', ')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
