import type { FormatoNombre } from '../db/types'

/**
 * Formatea el nombre de un alumno según la preferencia de Config (§ Bloque 4).
 * `'apellidos-nombre'` es el que tenía la app hasta ahora, y sigue siendo el
 * valor por defecto.
 */
export function formatearNombre(
  alumno: { nombre: string; apellidos: string },
  formato: FormatoNombre,
): string {
  switch (formato) {
    case 'nombre-apellidos':
      return alumno.apellidos ? `${alumno.nombre} ${alumno.apellidos}` : alumno.nombre
    case 'solo-nombre':
      return alumno.nombre
    case 'apellidos-nombre':
    default:
      return alumno.apellidos ? `${alumno.apellidos}, ${alumno.nombre}` : alumno.nombre
  }
}

/** Orden alfabético estable por apellidos y nombre, con collation española. */
export function ordenarAlumnos<T extends { nombre: string; apellidos: string }>(alumnos: T[]): T[] {
  return [...alumnos].sort((a, b) =>
    `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'),
  )
}
