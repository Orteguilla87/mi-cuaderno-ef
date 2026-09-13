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
 *
 * Los HUECOS planificables sí se derivan del horario del grupo, y por eso
 * borrar una sesión no quitaba la clase de las vistas: el hueco volvía a
 * aparecer vacío en cada render. `db.clasesCanceladas` es la excepción por
 * grupo y día que faltaba —«este día, este grupo, no hay clase»— y se aplica
 * aquí, en el único sitio donde se generan huecos, para que las cuatro vistas
 * que los pintan la respeten sin tocarlas.
 */

import { estadoDia, esDiaLectivo, type EstadoDia } from '../lib/calendarioEscolar'
import { diaLectivo, sumarDias } from '../lib/fechas'
import { db, nuevoId } from './db'
import { gruposVisibles } from './grupos'
import { claveHueco, clavesOcupadas, huecosDeClase, type HuecoDeClase } from './planificador'
import type { ClaseCancelada, Grupo, Sesion } from './types'

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

  // `gruposVisibles` y no `db.grupos`: con una etapa oculta (lib/etapas.ts) sus
  // sesiones desaparecen de Hoy y del calendario sin que se borre nada.
  const grupos = await gruposVisibles()
  const gruposPorId = new Map(grupos.map((g) => [g.id, g]))

  const resultado: SesionConGrupo[] = []
  for (const sesion of sesiones) {
    const grupo = gruposPorId.get(sesion.grupoId)
    if (!grupo) continue // el grupo se borró; la sesión queda huérfana, fuera de alcance aquí
    const dow = diaLectivo(sesion.fecha)
    // La franja de ESTA sesión, no la primera del día: un grupo puede tener dos
    // clases en franjas separadas y cada una hereda su propia hora.
    const franjasHoy = grupo.horario.filter((f) => f.diaSemana === dow)
    const franja =
      franjasHoy.find((f) => f.horaInicio === sesion.franjaInicio) ??
      (sesion.franjaInicio === undefined ? ordenarFranjas(franjasHoy)[0] : undefined)
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
  /**
   * IDENTIDAD del hueco dentro del día: la `horaInicio` de la franja del
   * horario que ocupa. Es lo que distingue las dos clases de un mismo grupo el
   * mismo día, y lo que se guarda en `Sesion.franjaInicio` y en la asistencia.
   * `horaInicio` de abajo es solo presentación —puede venir cambiada por la
   * sesión— y por eso no sirve como clave.
   *
   * Ausente solo en el caso raro de una sesión movida a mano a un día en el que
   * su grupo no tiene ninguna franja.
   */
  franjaInicio?: string
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
export async function huecosDe(rango: RangoGrupo): Promise<HuecoCalendario[]> {
  const { activos } = await generarHuecos(rango)
  return activos
}

/** Un hueco del horario que el usuario ha cancelado para ese día concreto. */
export interface HuecoCancelado extends HuecoCalendario {
  cancelada: ClaseCancelada
}

/**
 * Huecos cancelados de un rango (§ 8.5). Las vistas los pintan apagados con un
 * «Restaurar»: una clase cancelada no desaparece en silencio, se ve que se
 * ocultó ese día concreto y se puede devolver en un toque.
 */
export async function huecosCanceladosDe(rango: RangoGrupo): Promise<HuecoCancelado[]> {
  const { cancelados } = await generarHuecos(rango)
  return cancelados
}

/** Una excepción tapa un hueco si coincide el día y, si la lleva, la franja. */
function tapa(c: ClaseCancelada, grupoId: string, fecha: string, horaInicio?: string) {
  if (c.grupoId !== grupoId || c.fecha !== fecha) return false
  // Sin franja, la excepción cancela el día entero para ese grupo.
  return c.horaInicio === undefined || c.horaInicio === horaInicio
}

/**
 * Generación de huecos, separando los cancelados de los que siguen en pie.
 * Todas las lecturas van al principio, antes de cualquier bucle: `useLiveQuery`
 * solo vigila lo que se lee mientras sigue su rastro, y una lectura tardía
 * deja de refrescar las vistas al cancelar o restaurar una clase.
 */
async function generarHuecos({ desde, hasta, grupoId }: RangoGrupo): Promise<{
  activos: HuecoCalendario[]
  cancelados: HuecoCancelado[]
}> {
  const curso = await cursoActivo()
  let grupos = await gruposVisibles()
  if (grupoId) grupos = grupos.filter((g) => g.id === grupoId)

  const sesiones = await db.sesiones.where('fecha').between(desde, hasta, true, true).toArray()
  const canceladas = await db.clasesCanceladas
    .where('fecha')
    .between(desde, hasta, true, true)
    .toArray()
  // Las sesiones de un grupo y día, ya repartidas por franja. Reparto, no
  // búsqueda: con `find(grupoId + fecha)` las DOS franjas de un día resolvían a
  // la misma sesión y solo se veía una clase. Cada sesión se entrega a UNA sola
  // franja, y ninguna se queda sin salir.
  const porGrupoYDia = new Map<string, Sesion[]>()
  for (const s of sesiones) {
    const clave = `${s.grupoId}|${s.fecha}`
    const lista = porGrupoYDia.get(clave)
    if (lista) lista.push(s)
    else porGrupoYDia.set(clave, [s])
  }

  const activos: HuecoCalendario[] = []
  const cancelados: HuecoCancelado[] = []
  const guardar = (hueco: HuecoCalendario) => {
    // Regla de seguridad: una sesión persistida SIEMPRE se ve. Si se volvió a
    // planificar ese día, una excepción olvidada no puede esconderla.
    const cancelada = hueco.sesion
      ? undefined
      : canceladas.find((c) => tapa(c, hueco.grupo.id, hueco.fecha, hueco.horaInicio))
    if (cancelada) cancelados.push({ ...hueco, cancelada })
    else activos.push(hueco)
  }

  let fecha = desde
  // Tope de seguridad, igual que en `fechasDeClase`.
  for (let i = 0; fecha <= hasta && i < 400; i++) {
    const estado = curso ? estadoDia(fecha, curso) : undefined
    if (estado?.tipo === 'lectivo') {
      for (const grupo of grupos) {
        const franjasHoy = ordenarFranjas(grupo.horario.filter((f) => f.diaSemana === estado.dia))
        const delDia = porGrupoYDia.get(`${grupo.id}|${fecha}`) ?? []
        const { porFranja, sueltas } = repartirPorFranja(delDia, franjasHoy)

        for (const franja of franjasHoy) {
          const sesion = porFranja.get(franja.horaInicio)
          guardar({
            fecha,
            diaSemana: estado.dia,
            grupo,
            franjaInicio: franja.horaInicio,
            horaInicio: sesion?.horaInicio ?? franja.horaInicio,
            horaFin: sesion?.horaFin ?? franja.horaFin,
            sesion,
          })
        }
        // Sesiones que no encajan en ninguna franja del día (movidas a mano, o
        // más sesiones que franjas): se pintan igual, con su propia hora. Nunca
        // se esconde algo que está guardado.
        for (const sesion of sueltas) {
          guardar({
            fecha,
            diaSemana: estado.dia,
            grupo,
            franjaInicio: sesion.franjaInicio,
            horaInicio: sesion.horaInicio,
            horaFin: sesion.horaFin,
            sesion,
          })
        }
      }
    }
    fecha = sumarDias(fecha, 1)
  }
  const porFechaYHora = (a: HuecoCalendario, b: HuecoCalendario) =>
    a.fecha.localeCompare(b.fecha) || (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '')
  return { activos: activos.sort(porFechaYHora), cancelados: cancelados.sort(porFechaYHora) }
}

/** Franjas ordenadas por hora: el orden del array del grupo no está garantizado. */
function ordenarFranjas<T extends { horaInicio: string }>(franjas: T[]): T[] {
  return [...franjas].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
}

/**
 * Reparte las sesiones de un grupo en un día entre las franjas de su horario.
 *
 * Tres pasadas, en este orden, y cada sesión se consume UNA sola vez:
 *  1. Coincidencia exacta de `franjaInicio` — el caso normal desde v24.
 *  2. Sesiones sin `franjaInicio` (anteriores a v24, o creadas fuera de un
 *     hueco) a la primera franja libre: es donde ya se pintaban, así que un
 *     grupo con una sola clase al día se comporta exactamente como antes.
 *  3. Lo que sobre sale aparte, con su propia hora, sin perderse.
 */
function repartirPorFranja(
  sesiones: Sesion[],
  franjas: { horaInicio: string }[],
): { porFranja: Map<string, Sesion>; sueltas: Sesion[] } {
  const porFranja = new Map<string, Sesion>()
  const pendientes = [...sesiones]

  for (const franja of franjas) {
    const i = pendientes.findIndex((s) => s.franjaInicio === franja.horaInicio)
    if (i >= 0) porFranja.set(franja.horaInicio, pendientes.splice(i, 1)[0])
  }
  for (const franja of franjas) {
    if (porFranja.has(franja.horaInicio)) continue
    const i = pendientes.findIndex((s) => s.franjaInicio === undefined)
    if (i >= 0) porFranja.set(franja.horaInicio, pendientes.splice(i, 1)[0])
  }
  return { porFranja, sueltas: pendientes }
}

/**
 * Cancela la clase de un grupo en un día concreto (§ 8.5): el hueco deja de
 * ofrecerse en Hoy, Planificador y Calendario. NO toca `Grupo.horario`, así
 * que el resto de semanas siguen igual, y no borra ningún dato del día.
 */
export async function cancelarClase(
  grupoId: string,
  fecha: string,
  horaInicio?: string,
): Promise<() => Promise<void>> {
  const previas = await db.clasesCanceladas.where('[grupoId+fecha]').equals([grupoId, fecha]).toArray()
  // Ya cancelada (esa franja, o el día entero): nada que hacer ni que deshacer.
  if (previas.some((c) => c.horaInicio === undefined || c.horaInicio === horaInicio)) {
    return async () => {}
  }

  const cancelada: ClaseCancelada = {
    id: nuevoId(),
    grupoId,
    fecha,
    horaInicio,
    creado: new Date().toISOString(),
  }
  await db.clasesCanceladas.add(cancelada)
  return async () => void (await db.clasesCanceladas.delete(cancelada.id))
}

/**
 * Devuelve a su sitio una clase cancelada. Con `horaInicio` retira esa franja
 * y también la excepción de día entero, si la hubiera; sin él, todas las de
 * ese grupo ese día.
 */
export async function restaurarClase(
  grupoId: string,
  fecha: string,
  horaInicio?: string,
): Promise<() => Promise<void>> {
  const todas = await db.clasesCanceladas.where('[grupoId+fecha]').equals([grupoId, fecha]).toArray()
  const quitar = todas.filter(
    (c) => horaInicio === undefined || c.horaInicio === undefined || c.horaInicio === horaInicio,
  )
  await db.clasesCanceladas.bulkDelete(quitar.map((c) => c.id))
  return async () => void (await db.clasesCanceladas.bulkAdd(quitar))
}

/** Lo que se pierde y lo que NO al eliminar una sesión, para avisar con cifras. */
export interface ResumenSesion {
  juegos: number
  tieneNotas: boolean
  tieneValoracion: boolean
  /** Registros de asistencia de ese grupo ese día: sobreviven al borrado. */
  asistencias: number
  /** Observaciones del grupo ese día: también sobreviven. */
  observaciones: number
  /** Notas del Cuaderno en columnas fechadas ese día: tampoco se borran. */
  calificaciones: number
}

/**
 * Recuento para la confirmación de borrado (§ M9: nunca destruir datos en
 * silencio). Asistencia y observaciones van por `fecha`, no por `sesionId`, así
 * que no se borran con la sesión: se cuentan para poder decirlo, no para
 * alarmar.
 */
export async function resumenSesion(sesionId: string): Promise<ResumenSesion | undefined> {
  const sesion = await db.sesiones.get(sesionId)
  if (!sesion) return undefined

  const alumnos = await db.alumnos.where('grupoId').equals(sesion.grupoId).toArray()
  const delGrupo = new Set(alumnos.filter((a) => a.activo).map((a) => a.id))

  // Solo la asistencia de ESTA clase: con dos clases del mismo grupo el mismo
  // día, contar las del día entero decía el doble de registros de los que hay.
  const grupo = await db.grupos.get(sesion.grupoId)
  const dow = diaLectivo(sesion.fecha)
  const franjas = ordenarFranjas((grupo?.horario ?? []).filter((f) => f.diaSemana === dow))
  const esPrimera =
    franjas.length === 0 ||
    sesion.franjaInicio === undefined ||
    sesion.franjaInicio === franjas[0].horaInicio
  const asistencias = (await db.asistencias.where('fecha').equals(sesion.fecha).toArray()).filter(
    (a) => (a.franjaInicio === undefined ? esPrimera : a.franjaInicio === sesion.franjaInicio),
  )
  const observaciones = await db.observaciones
    .where('[grupoId+fecha]')
    .equals([sesion.grupoId, sesion.fecha])
    .count()

  // Calificaciones de ese día: celdas del Cuaderno en columnas fechadas ese día,
  // más las del modelo antiguo (`calificaciones`), que llevan fecha propia.
  const columnas = await db.columnas
    .where('grupoId')
    .equals(sesion.grupoId)
    .filter((c) => c.fecha === sesion.fecha)
    .toArray()
  let calificaciones = 0
  for (const c of columnas)
    calificaciones += await db.valores
      .where('columnaId')
      .equals(c.id)
      .filter((v) => delGrupo.has(v.alumnoId))
      .count()
  calificaciones += await db.calificaciones
    .filter((c) => c.fecha === sesion.fecha && delGrupo.has(c.alumnoId))
    .count()

  return {
    calificaciones,
    juegos: sesion.juegos.length,
    tieneNotas: Boolean(sesion.notas?.trim() || sesion.comentarios?.trim()),
    tieneValoracion: sesion.valoracion != null,
    asistencias: asistencias.filter((a) => delGrupo.has(a.alumnoId)).length,
    observaciones,
  }
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
  const [sesiones, grupos, todos] = await Promise.all([
    db.sesiones.toArray(),
    gruposVisibles(),
    db.grupos.toArray(),
  ])
  const gruposPorId = new Map(grupos.map((g) => [g.id, g]))
  // Un grupo oculto no es un grupo borrado: sus sesiones no se listan como
  // huérfanas, simplemente no se listan.
  const ocultos = new Set(todos.filter((g) => !gruposPorId.has(g.id)).map((g) => g.id))

  const resultado: SesionNoLectiva[] = []
  for (const sesion of sesiones) {
    if (ocultos.has(sesion.grupoId)) continue
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

  const cambios: {
    id: string
    antes: { fecha: string; franjaInicio?: string }
    despues: HuecoDeClase
  }[] = []
  let sinHueco = 0

  for (const id of sesionIds) {
    const sesion = await db.sesiones.get(id)
    if (!sesion) continue
    const grupo = await db.grupos.get(sesion.grupoId)
    if (!grupo) continue

    const ocupadas = clavesOcupadas(
      await db.sesiones.where('grupoId').equals(grupo.id).toArray(),
      grupo,
    )
    // Por clases y no por fechas: con dos franjas el mismo día, la primera
    // sesión reubicada tapaba la segunda clase de ese día sin querer.
    const destino = huecosDeClase(grupo, curso, sesion.fecha).find(
      (h) => !ocupadas.has(claveHueco(h)) && h.fecha !== sesion.fecha,
    )
    if (!destino) {
      sinHueco++
      continue
    }
    cambios.push({
      id,
      antes: { fecha: sesion.fecha, franjaInicio: sesion.franjaInicio },
      despues: destino,
    })
  }

  await db.transaction('rw', db.sesiones, async () => {
    for (const c of cambios)
      await db.sesiones.update(c.id, {
        fecha: c.despues.fecha,
        franjaInicio: c.despues.franjaInicio,
      })
  })

  return {
    reubicadas: cambios.length,
    sinHueco,
    deshacer: async () => {
      await db.transaction('rw', db.sesiones, async () => {
        for (const c of cambios)
          await db.sesiones.update(c.id, {
            fecha: c.antes.fecha,
            franjaInicio: c.antes.franjaInicio,
          })
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
