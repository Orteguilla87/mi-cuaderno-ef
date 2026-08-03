import { CALENDARIO_CAM_2026_27 } from '../lib/calendarioEscolar'
import { db, nuevoId } from './db'
import type { CursoEscolar } from './types'

/**
 * Curso escolar al que pertenece una fecha. El corte es el 1 de julio, no septiembre:
 * en cuanto acaba el curso ya se prepara el siguiente, así que en julio de 2026
 * el curso vigente para la app es 2026-2027.
 */
export function nombreCursoActual(hoy = new Date()): string {
  const anio = hoy.getFullYear()
  const inicio = hoy.getMonth() >= 6 ? anio : anio - 1 // julio (mes 6) en adelante
  return `${inicio}-${inicio + 1}`
}

/**
 * Límites por defecto del curso: 1 de septiembre a 30 de junio del año siguiente.
 * Es el calendario habitual en Madrid y sirve para empezar a planificar sin
 * configurar nada; el usuario los ajusta en Ajustes cuando salga el oficial.
 */
export function limitesPorDefecto(nombre: string): { inicio: string; fin: string } {
  const anioInicio = Number(nombre.split('-')[0])
  return { inicio: `${anioInicio}-09-01`, fin: `${anioInicio + 1}-06-30` }
}

/** Lectura pura: apta para `useLiveQuery`. `undefined` mientras no exista curso. */
export function leerCursoActivo(): Promise<CursoEscolar | undefined> {
  return db.cursos.filter((c) => c.activo).first()
}

/**
 * Único punto de escritura del curso. NO llamar desde `useLiveQuery`: Dexie no
 * admite transacciones de escritura dentro de una consulta observada.
 *
 * Se cachea la promesa porque varios sitios lo piden a la vez en el primer
 * arranque (y StrictMode duplica los efectos); sin esto se creaban cursos
 * duplicados. La transacción protege además frente a otra pestaña abierta.
 */
let enCurso: Promise<CursoEscolar> | null = null

export function obtenerCursoActivo(): Promise<CursoEscolar> {
  enCurso ??= db
    .transaction('rw', db.cursos, async () => {
      const activo = await db.cursos.filter((c) => c.activo).first()
      if (activo) return activo

      // Trimestres y festivos nacen vacíos a propósito: las fechas las publica
      // cada año la Consejería, así que las fija el usuario en Ajustes. Para
      // el curso 2026-2027 se conoce el calendario oficial (§ Bloque 7.1), así
      // que se precarga editable y marcado pendiente de confirmar; cualquier
      // otro curso arranca con los límites genéricos de siempre.
      const nombre = nombreCursoActual()
      const nuevo: CursoEscolar = {
        id: nuevoId(),
        nombre,
        activo: true,
        ...(nombre === '2026-2027'
          ? {
              inicio: CALENDARIO_CAM_2026_27.inicio,
              fin: CALENDARIO_CAM_2026_27.fin,
              trimestres: CALENDARIO_CAM_2026_27.trimestres,
              festivos: CALENDARIO_CAM_2026_27.festivos,
              periodosNoLectivos: CALENDARIO_CAM_2026_27.periodosNoLectivos,
              calendarioPendienteConfirmar: true,
            }
          : { ...limitesPorDefecto(nombre), trimestres: [], festivos: [], periodosNoLectivos: [] }),
      }
      await db.cursos.add(nuevo)
      return nuevo
    })
    .catch((e) => {
      enCurso = null // permite reintentar si la base estaba cerrada o bloqueada
      throw e
    })

  return enCurso
}
