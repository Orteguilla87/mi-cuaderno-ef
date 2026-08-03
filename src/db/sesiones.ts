/**
 * Fuente única de sesiones para las vistas de calendario (§ Bloque 8).
 *
 * Antes, «Calendario» (Mes y Semana), «Hoy» (Día y Semana) y «Planificador >
 * Semana» leían o derivaban sesiones cada una por su cuenta:
 *  - Planificador > Semana (`semanaDe` en `db/planificador.ts`) generaba los
 *    huecos del horario SIN mirar el calendario escolar en absoluto: ofrecía
 *    «Planificar» en festivos, vacaciones e incluso antes de empezar el curso.
 *  - Hoy > Día y Hoy > Semana cruzaban `grupo.horario` con `db.sesiones` cada
 *    una con su propia consulta, igual que Calendario > Semana: una sesión
 *    movida a mano a un día sin franja de horario para ese grupo desaparecía
 *    de las tres, porque ninguna la buscaba fuera del hueco de horario.
 *  - Calendario > Mes consultaba `db.sesiones` directamente por rango de
 *    fechas, sin filtrar por calendario: contaba y pintaba sesiones también
 *    en días festivos o de vacaciones.
 *
 * Ninguna generaba sesiones sintéticas (persistidas de la nada), pero cada
 * una decidía por su cuenta qué mostrar. Este módulo es ahora la ÚNICA fuente:
 * lee exclusivamente lo persistido en Dexie y filtra siempre por el calendario
 * escolar (`lib/calendarioEscolar.ts`), para que las cinco vistas dejen de
 * poder desincronizarse entre sí.
 */

import { estadoDia, esDiaLectivo, type EstadoDia } from '../lib/calendarioEscolar'
import { diaLectivo, sumarDias } from '../lib/fechas'
import { db } from './db'
import { fechasDeClase } from './planificador'
import type { Grupo, Sesion } from './types'

interface RangoGrupo {
  desde: string
  hasta: string
  grupoId?: string
}

/** Una sesión ya persistida, con el grupo resuelto y la hora que le corresponde. */
export interface SesionConGrupo {
  sesion: Sesion
  grupo: Grupo
  /** Hora propia de la sesión si la tiene; si no, la de la franja del grupo ese día. */
  horaInicio?: string
  horaFin?: string
}

async function cursoActivo() {
  return db.cursos.filter((c) => c.activo).first()
}

/**
 * Sesiones YA PERSISTIDAS en un rango de fechas, listas para pintar (§ 8.2).
 * Cero generación: solo lee `db.sesiones`. Fuera de periodo lectivo o en un
 * día no lectivo, no se devuelve nada — es la vista de solo lectura que usa
 * Calendario > Mes, así que un festivo con sesión guardada no debe contarse
 * como una clase más (esas sesiones huérfanas se listan aparte, ver
 * `sesionesEnDiasNoLectivos`).
 */
export async function getSesiones({ desde, hasta, grupoId }: RangoGrupo): Promise<SesionConGrupo[]> {
  const curso = await cursoActivo()
  let sesiones = await db.sesiones.where('fecha').between(desde, hasta, true, true).toArray()
  if (grupoId) sesiones = sesiones.filter((s) => s.grupoId === grupoId)
  if (curso) sesiones = sesiones.filter((s) => esDiaLectivo(s.fecha, curso))

  const grupos = await db.grupos.toArray()
  const gruposPorId = new Map(grupos.map((g) => [g.id, g]))

  const resultado: SesionConGrupo[] = []
  for (const sesion of sesiones) {
    const grupo = gruposPorId.get(sesion.grupoId)
    if (!grupo) continue // el grupo se borró; la sesión queda huérfana, fuera de alcance aquí
    const dow = diaLectivo(sesion.fecha)
    const franja = grupo.horario.find((f) => f.diaSemana === dow)
    resultado.push({
      sesion,
      grupo,
      horaInicio: sesion.horaInicio ?? franja?.horaInicio,
      horaFin: sesion.horaFin ?? franja?.horaFin,
    })
  }
  return resultado.sort(
    (a, b) => a.sesion.fecha.localeCompare(b.sesion.fecha) || (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''),
  )
}

/** Un hueco planificable: una franja de horario en una fecha concreta, con su sesión si ya existe. */
export interface HuecoCalendario {
  fecha: string
  diaSemana: 1 | 2 | 3 | 4 | 5
  grupo: Grupo
  horaInicio?: string
  horaFin?: string
  sesion?: Sesion
}

/**
 * Huecos planificables de un rango de fechas (§ 8.2): uno por cada franja de
 * horario de cada grupo, en cada día LECTIVO del rango, con su sesión si ya
 * existe. Única fuente para Hoy (Día y Semana), Calendario > Semana y
 * Planificador > Semana — las cuatro vistas que dejan crear una sesión al
 * tocar un hueco vacío.
 *
 * Una sesión ya persistida cuyo grupo no tiene franja ese día de la semana
 * (se movió a mano a otro día) se añade igual, con su propia hora: sin esto,
 * moverla la hacía desaparecer de estas cuatro vistas aunque siguiera
 * guardada.
 */
export async function huecosDe({ desde, hasta, grupoId }: RangoGrupo): Promise<HuecoCalendario[]> {
  const curso = await cursoActivo()
  let grupos = await db.grupos.toArray()
  if (grupoId) grupos = grupos.filter((g) => g.id === grupoId)

  const sesiones = await db.sesiones.where('fecha').between(desde, hasta, true, true).toArray()
  const sesionDe = (gId: string, fecha: string) => sesiones.find((s) => s.grupoId === gId && s.fecha === fecha)

  const huecos: HuecoCalendario[] = []
  let fecha = desde
  // Tope de seguridad, igual que en `fechasDeClase`.
  for (let i = 0; fecha <= hasta && i < 400; i++) {
    const estado = curso ? estadoDia(fecha, curso) : undefined
    if (estado?.tipo === 'lectivo') {
      for (const grupo of grupos) {
        const franjasHoy = grupo.horario.filter((f) => f.diaSemana === estado.dia)
        const sesion = sesionDe(grupo.id, fecha)
        if (franjasHoy.length > 0) {
          for (const franja of franjasHoy) {
            huecos.push({
              fecha,
              diaSemana: estado.dia,
              grupo,
              horaInicio: sesion?.horaInicio ?? franja.horaInicio,
              horaFin: sesion?.horaFin ?? franja.horaFin,
              sesion,
            })
          }
        } else if (sesion) {
          huecos.push({
            fecha,
            diaSemana: estado.dia,
            grupo,
            horaInicio: sesion.horaInicio,
            horaFin: sesion.horaFin,
            sesion,
          })
        }
      }
    }
    fecha = sumarDias(fecha, 1)
  }
  return huecos.sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''),
  )
}

export interface SesionNoLectiva {
  sesion: Sesion
  grupo: Grupo | undefined
  estado: Exclude<EstadoDia, { tipo: 'lectivo' }>
}

/**
 * Sesiones persistidas cuya fecha cae en un día no lectivo (§ 8.4): tras
 * configurar un festivo o un periodo nuevo, alguna sesión ya guardada puede
 * quedar huérfana. Se listan para que el usuario decida en Ajustes —nunca se
 * borran ni se mueven solas.
 */
export async function sesionesEnDiasNoLectivos(): Promise<SesionNoLectiva[]> {
  const curso = await cursoActivo()
  if (!curso) return []
  const [sesiones, grupos] = await Promise.all([db.sesiones.toArray(), db.grupos.toArray()])
  const gruposPorId = new Map(grupos.map((g) => [g.id, g]))

  const resultado: SesionNoLectiva[] = []
  for (const sesion of sesiones) {
    const estado = estadoDia(sesion.fecha, curso)
    if (estado.tipo === 'lectivo') continue
    resultado.push({ sesion, grupo: gruposPorId.get(sesion.grupoId), estado })
  }
  return resultado.sort((a, b) => a.sesion.fecha.localeCompare(b.sesion.fecha))
}

/**
 * Reubica en bloque las sesiones dadas a la siguiente clase libre de su
 * propio grupo (§ 8.4): nunca automático por decisión de fondo, solo cuando
 * el usuario lo pide explícitamente desde el aviso de Ajustes. Una sesión sin
 * hueco libre en los próximos meses se deja como está.
 */
export async function reubicarSesionesNoLectivas(
  sesionIds: string[],
): Promise<{ reubicadas: number; sinHueco: number; deshacer: () => Promise<void> }> {
  const curso = await cursoActivo()
  if (!curso) return { reubicadas: 0, sinHueco: sesionIds.length, deshacer: async () => {} }

  const cambios: { id: string; fechaAntes: string; fechaDespues: string }[] = []
  let sinHueco = 0

  for (const id of sesionIds) {
    const sesion = await db.sesiones.get(id)
    if (!sesion) continue
    const grupo = await db.grupos.get(sesion.grupoId)
    if (!grupo) continue

    const ocupadas = new Set(
      (await db.sesiones.where('grupoId').equals(grupo.id).toArray()).map((s) => s.fecha),
    )
    const destino = fechasDeClase(grupo, curso, sesion.fecha).find(
      (f) => !ocupadas.has(f) && f !== sesion.fecha,
    )
    if (!destino) {
      sinHueco++
      continue
    }
    cambios.push({ id, fechaAntes: sesion.fecha, fechaDespues: destino })
  }

  await db.transaction('rw', db.sesiones, async () => {
    for (const c of cambios) await db.sesiones.update(c.id, { fecha: c.fechaDespues })
  })

  return {
    reubicadas: cambios.length,
    sinHueco,
    deshacer: async () => {
      await db.transaction('rw', db.sesiones, async () => {
        for (const c of cambios) await db.sesiones.update(c.id, { fecha: c.fechaAntes })
      })
    },
  }
}

/** Elimina en bloque las sesiones dadas (§ 8.4), con Deshacer del lote entero. */
export async function eliminarSesionesNoLectivas(
  sesionIds: string[],
): Promise<{ eliminadas: number; deshacer: () => Promise<void> }> {
  const previas = (await db.sesiones.bulkGet(sesionIds)).filter((s): s is Sesion => !!s)
  await db.sesiones.bulkDelete(sesionIds)
  return {
    eliminadas: previas.length,
    deshacer: async () => void (await db.sesiones.bulkAdd(previas)),
  }
}
