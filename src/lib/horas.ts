/**
 * Utilidades de hora 'HH:MM' (hora local del centro, sin zona horaria).
 *
 * El formato de 24 h con cero a la izquierda se ordena y compara correctamente
 * como texto, así que en toda la app se comparan franjas con `<` y `>` directos
 * en lugar de convertir a Date.
 */

/** Duración por defecto de una sesión de EF, usada al proponer la hora de fin. */
export const DURACION_SESION_MIN = 45

/** 'HH:MM' + minutos → 'HH:MM', recortado a 23:59 para no desbordar al día siguiente. */
export function sumarMinutos(hhmm: string, minutos: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  const total = Math.min(h * 60 + m + minutos, 23 * 60 + 59)
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}
