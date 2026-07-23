/**
 * Fechas de la app. Convención: string ISO 'YYYY-MM-DD' en hora LOCAL.
 *
 * POR QUÉ NO `Date.toISOString()`: convierte a UTC, así que a partir de las
 * 22:00 en horario de verano de Madrid devuelve el día siguiente. Un pase de
 * lista de la última hora de la tarde acabaría guardado con fecha equivocada.
 */

export type DiaSemana = 1 | 2 | 3 | 4 | 5

export const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const
export const INICIALES_DIA = ['L', 'M', 'X', 'J', 'V'] as const

/** Fecha local en ISO corto. */
export function aISO(fecha = new Date()): string {
  const a = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

/** 'YYYY-MM-DD' → Date local a medianoche (no UTC). */
export function deISO(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

/**
 * Día lectivo 1..5 (lunes..viernes), o `null` en fin de semana.
 * Coincide con `FranjaHorario.diaSemana`.
 */
export function diaLectivo(iso: string): DiaSemana | null {
  const d = deISO(iso).getDay() // 0 domingo … 6 sábado
  return d >= 1 && d <= 5 ? (d as DiaSemana) : null
}

/** Hora local 'HH:MM'. */
export function horaActual(fecha = new Date()): string {
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`
}

export function sumarDias(iso: string, dias: number): string {
  const f = deISO(iso)
  f.setDate(f.getDate() + dias)
  return aISO(f)
}

/** «Martes 22 de julio». Para cabeceras: sin año, que ya se sabe cuál es. */
export function formatoLargo(iso: string): string {
  const f = deISO(iso)
  const texto = f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** «22 jul» — para listas y chips donde no cabe el formato largo. */
export function formatoCorto(iso: string): string {
  return deISO(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const INICIALES_TODOS_DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/** «L 01/09/26» — día de la semana en una letra + fecha corta con año. */
export function formatoDiaCorto(iso: string): string {
  const f = deISO(iso)
  const letra = INICIALES_TODOS_DIAS[f.getDay()]
  const dd = String(f.getDate()).padStart(2, '0')
  const mm = String(f.getMonth() + 1).padStart(2, '0')
  const aa = String(f.getFullYear()).slice(-2)
  return `${letra} ${dd}/${mm}/${aa}`
}

/** Etiqueta relativa cuando ayuda («Hoy», «Ayer»); si no, la fecha larga. */
export function etiquetaDia(iso: string, hoy = aISO()): string {
  if (iso === hoy) return 'Hoy'
  if (iso === sumarDias(hoy, -1)) return 'Ayer'
  if (iso === sumarDias(hoy, 1)) return 'Mañana'
  return formatoLargo(iso)
}
