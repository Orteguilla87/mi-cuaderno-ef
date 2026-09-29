/**
 * Avance automático al calificar: a qué celda se salta después de marcar una.
 *
 * Lógica pura —ni React ni Dexie— para poder probar los dos recorridos de la
 * rúbrica y la regla de parada sin montar la tabla.
 *
 * Regla común: al llegar al final NO se da la vuelta ni se salta a otra
 * columna. Volver al primero sin avisar hace creer que queda gente por
 * calificar, o machaca una nota ya puesta con el siguiente toque.
 */

/**
 * - `criterio`: tras marcar, el siguiente criterio DEL MISMO ALUMNO (calificar a
 *   un alumno entero de una vez).
 * - `alumno`: tras marcar, el MISMO CRITERIO del siguiente alumno (recorrer la
 *   clase criterio a criterio).
 */
export type ModoAvanceRubrica = 'criterio' | 'alumno'

export interface PosicionRubrica {
  /** Índice del alumno en la lista que se está calificando. */
  fila: number
  /** Índice del criterio en la rúbrica. */
  criterio: number
}

export type TrasMarcar<P> =
  /** Avance desactivado: se queda donde está, como antes de existir esto. */
  | { tipo: 'quedarse' }
  | { tipo: 'ir'; a: P }
  /** Era la última: se para aquí, se dice y se cierra la celda. */
  | { tipo: 'fin' }

/** La celda siguiente de la rúbrica según el modo, o `null` si era la última. */
export function siguienteEnRubrica(
  pos: PosicionRubrica,
  dims: { filas: number; criterios: number },
  modo: ModoAvanceRubrica,
): PosicionRubrica | null {
  if (modo === 'criterio')
    return pos.criterio + 1 < dims.criterios ? { fila: pos.fila, criterio: pos.criterio + 1 } : null
  return pos.fila + 1 < dims.filas ? { fila: pos.fila + 1, criterio: pos.criterio } : null
}

/** La celda anterior según el modo, o `null` si era la primera. */
export function anteriorEnRubrica(
  pos: PosicionRubrica,
  modo: ModoAvanceRubrica,
): PosicionRubrica | null {
  if (modo === 'criterio') return pos.criterio > 0 ? { fila: pos.fila, criterio: pos.criterio - 1 } : null
  return pos.fila > 0 ? { fila: pos.fila - 1, criterio: pos.criterio } : null
}

export function trasMarcarRubrica(
  pos: PosicionRubrica,
  dims: { filas: number; criterios: number },
  preferencia: { activo: boolean; modo: ModoAvanceRubrica },
): TrasMarcar<PosicionRubrica> {
  if (!preferencia.activo) return { tipo: 'quedarse' }
  const siguiente = siguienteEnRubrica(pos, dims, preferencia.modo)
  return siguiente ? { tipo: 'ir', a: siguiente } : { tipo: 'fin' }
}

/** Columnas de un solo valor (nota, texto, caritas): la misma columna, siguiente alumno. */
export function trasMarcarColumna(fila: number, filas: number, activo: boolean): TrasMarcar<number> {
  if (!activo) return { tipo: 'quedarse' }
  return fila + 1 < filas ? { tipo: 'ir', a: fila + 1 } : { tipo: 'fin' }
}

/**
 * «12 / 24»: en qué punto del recorrido se está. En la rúbrica cuenta lo que
 * recorre el modo —criterios de este alumno, o alumnos de este criterio—.
 */
export function progresoRubrica(
  pos: PosicionRubrica,
  dims: { filas: number; criterios: number },
  modo: ModoAvanceRubrica,
): { actual: number; total: number } {
  return modo === 'criterio'
    ? { actual: pos.criterio + 1, total: dims.criterios }
    : { actual: pos.fila + 1, total: dims.filas }
}
