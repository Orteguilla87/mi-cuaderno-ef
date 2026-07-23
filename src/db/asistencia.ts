import { db, nuevoId } from './db'
import type { Alumno, Asistencia, EstadoAsistencia } from './types'

/**
 * Orden del ciclo al tocar una tarjeta en el pase de lista.
 *
 * El flujo real es «Todos presentes» + excepciones, así que el primer toque
 * sobre un alumno ya presente debe llevar a FALTA, que es la excepción más
 * frecuente. Retraso y justificada quedan a uno y dos toques más.
 */
const CICLO: EstadoAsistencia[] = ['presente', 'falta', 'retraso', 'justificada']

export function siguienteEstado(actual: EstadoAsistencia | undefined): EstadoAsistencia {
  if (!actual) return 'presente' // sin registrar → presente
  const i = CICLO.indexOf(actual)
  return CICLO[(i + 1) % CICLO.length]
}

/** Registros de un grupo en una fecha, indexados por alumno. */
export async function leerAsistenciaGrupo(
  alumnoIds: string[],
  fecha: string,
): Promise<Map<string, Asistencia>> {
  if (alumnoIds.length === 0) return new Map()
  const claves = alumnoIds.map((id) => [id, fecha] as [string, string])
  const lista = await db.asistencias.where('[alumnoId+fecha]').anyOf(claves).toArray()
  return new Map(lista.map((a) => [a.alumnoId, a]))
}

/**
 * Marca a todo el grupo presente y con chándal: es el caso normal y el punto de
 * partida del pase de lista en <30 s. Respeta a quien ya tenga un estado
 * distinto de «presente» puesto a mano, para no pisar el trabajo ya hecho.
 *
 * Devuelve la función de deshacer, que restaura el estado exacto anterior
 * (incluido «no había registro»).
 */
export async function marcarTodosPresentes(
  alumnos: Alumno[],
  fecha: string,
): Promise<() => Promise<void>> {
  const previos = await leerAsistenciaGrupo(
    alumnos.map((a) => a.id),
    fecha,
  )

  const aCrear: Asistencia[] = []
  const aActualizar: Asistencia[] = []

  for (const alumno of alumnos) {
    const previo = previos.get(alumno.id)
    if (!previo) {
      aCrear.push({
        id: nuevoId(),
        alumnoId: alumno.id,
        fecha,
        estado: 'presente',
        chandal: true,
      })
    } else if (previo.estado === 'presente' && !previo.chandal) {
      // Ya estaba presente: solo se completa el chándal, sin tocar el resto.
      aActualizar.push({ ...previo, chandal: true })
    }
  }

  await db.asistencias.bulkPut([...aCrear, ...aActualizar])

  const idsCreados = aCrear.map((a) => a.id)
  const originales = aActualizar.map((a) => previos.get(a.alumnoId)!)
  return async () => {
    await db.transaction('rw', db.asistencias, async () => {
      await db.asistencias.bulkDelete(idsCreados)
      await db.asistencias.bulkPut(originales)
    })
  }
}

/** Avanza el estado de un alumno y devuelve su función de deshacer. */
export async function ciclarEstado(
  alumnoId: string,
  fecha: string,
): Promise<() => Promise<void>> {
  const previo = await db.asistencias.where('[alumnoId+fecha]').equals([alumnoId, fecha]).first()
  const estado = siguienteEstado(previo?.estado)

  if (previo) {
    await db.asistencias.update(previo.id, { estado })
    const antes = previo.estado
    return async () => void (await db.asistencias.update(previo.id, { estado: antes }))
  }

  const nuevo: Asistencia = { id: nuevoId(), alumnoId, fecha, estado, chandal: true }
  await db.asistencias.add(nuevo)
  return async () => void (await db.asistencias.delete(nuevo.id))
}

/** Alterna el chándal. Si no había registro, lo crea como presente. */
export async function alternarChandal(
  alumnoId: string,
  fecha: string,
): Promise<() => Promise<void>> {
  const previo = await db.asistencias.where('[alumnoId+fecha]').equals([alumnoId, fecha]).first()

  if (previo) {
    await db.asistencias.update(previo.id, { chandal: !previo.chandal })
    return async () => void (await db.asistencias.update(previo.id, { chandal: previo.chandal }))
  }

  const nuevo: Asistencia = { id: nuevoId(), alumnoId, fecha, estado: 'presente', chandal: false }
  await db.asistencias.add(nuevo)
  return async () => void (await db.asistencias.delete(nuevo.id))
}

export interface ResumenAsistencia {
  total: number
  presentes: number
  faltas: number
  retrasos: number
  justificadas: number
  sinChandal: number
  /** % de sesiones a las que asistió (presente o retraso cuentan como asistencia). */
  pctAsistencia: number
  /** Sesiones consecutivas más recientes con chándal. */
  rachaChandal: number
}

/**
 * Resumen de una lista de registros. Sirve tanto para un alumno a lo largo del
 * curso como para un grupo en una fecha concreta.
 */
export function resumirAsistencia(registros: Asistencia[]): ResumenAsistencia {
  const total = registros.length
  const presentes = registros.filter((r) => r.estado === 'presente').length
  const faltas = registros.filter((r) => r.estado === 'falta').length
  const retrasos = registros.filter((r) => r.estado === 'retraso').length
  const justificadas = registros.filter((r) => r.estado === 'justificada').length
  const sinChandal = registros.filter((r) => !r.chandal).length

  // Presente y retraso cuentan como asistencia porque el alumno estuvo en
  // clase. La justificada NO: es una ausencia, aunque esté excusada. Se muestra
  // aparte para que se vea por qué baja el porcentaje.
  const asistidas = presentes + retrasos
  const pctAsistencia = total === 0 ? 0 : Math.round((asistidas / total) * 100)

  const porFecha = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha))
  let rachaChandal = 0
  for (const r of porFecha) {
    // Un día que no vino no rompe la racha: no pudo traer el chándal.
    if (r.estado === 'falta' || r.estado === 'justificada') continue
    if (!r.chandal) break
    rachaChandal++
  }

  return {
    total,
    presentes,
    faltas,
    retrasos,
    justificadas,
    sinChandal,
    pctAsistencia,
    rachaChandal,
  }
}
