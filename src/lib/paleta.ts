/**
 * PALETA DE COLORES DE DATOS. No confundir con los tokens de §3.1.
 *
 * ——— La distinción, que es lo importante ———
 *
 * El CHROME de la app —botones, cabeceras, navegación, estados del sistema,
 * chips de asistencia— usa SOLO los cinco tokens de `styles/tokens.css` a
 * través de las utilidades de Tailwind (`bg-primario`, `text-tinta`…). Ahí
 * sigue intacta la prohibición de escribir un hex suelto en un componente.
 *
 * Esta paleta es otra cosa: los colores que ELIGE EL USUARIO para distinguir
 * sus propios datos —el color de un grupo, el de un peto, el punto de una
 * etiqueta de alumnado—. Son datos, no interfaz, y por eso pueden ser más de
 * cinco.
 *
 * Se persiste SIEMPRE el `id` («teal-500»), nunca el hex. Así se puede
 * reajustar un tono aquí sin migrar un solo registro de la base.
 *
 * ——— Por qué cada entrada tiene DOS valores ———
 *
 * Un mismo hex no puede dar contraste suficiente contra el fondo claro
 * (#F3F3EC) y contra el oscuro (#062830) a la vez: la banda de luminancia que
 * cumple las dos cosas es tan estrecha que ni el propio `--primary` cabe en
 * ella (2,49:1 sobre el fondo oscuro). Así que cada color tiene su valor para
 * cada tema, exactamente como ya hacía `tokens.css` con `--primary-light`
 * («primario sobre fondo oscuro»). `paleta.test.ts` comprueba cada uno contra
 * SU fondo.
 *
 * Los cinco tokens de §3.1 están todos aquí: #006A80 y #CE184B como valor
 * claro de `teal-500` y `carmin-500`; #9AC3CC, #ABB200 y #F3F3EC como valor
 * oscuro de `agua-300`, `lima-300` y `arena-300` —son demasiado luminosos para
 * leerse sobre el fondo claro, y ese es justamente su sitio—.
 *
 * ——— Daltonismo ———
 *
 * `paleta.test.ts` simula protanopia y deuteranopia y exige que ningún par
 * rojo/verde quede confundido, y que dos muestras contiguas de la cuadrícula
 * se distingan. No basta con suponerlo: la primera versión de esta paleta
 * tenía un verde y un carmín que bajo deuteranopia quedaban a ΔE 3,2.
 */

export interface ColorPaleta {
  /** Identificador estable. ES LO QUE SE GUARDA EN LA BASE, nunca el hex. */
  id: string
  /** Valor sobre el fondo claro de la app. */
  claro: string
  /** Valor sobre el fondo oscuro. */
  oscuro: string
  /** Nombre en español, para el lector de pantalla y el título de la muestra. */
  nombre: string
}

/**
 * Orden de la cuadrícula. No es decorativo: el test comprueba que dos entradas
 * contiguas se distinguen bajo daltonismo rojo-verde, así que reordenar exige
 * volver a pasarlo.
 */
export const PALETA: readonly ColorPaleta[] = [
  { id: 'teal-300', claro: '#12889F', oscuro: '#6FC5D8', nombre: 'Turquesa claro' },
  { id: 'teal-500', claro: '#006A80', oscuro: '#12889F', nombre: 'Turquesa' },
  { id: 'teal-700', claro: '#00404D', oscuro: '#4FA8BC', nombre: 'Turquesa oscuro' },
  { id: 'agua-300', claro: '#3E7F8D', oscuro: '#9AC3CC', nombre: 'Agua' },
  { id: 'agua-500', claro: '#2C5F6B', oscuro: '#7FB0BB', nombre: 'Agua oscura' },
  { id: 'gris-400', claro: '#5B7E85', oscuro: '#9FBFC6', nombre: 'Gris azulado' },
  { id: 'gris-600', claro: '#3D5C63', oscuro: '#7FA3AB', nombre: 'Gris azulado oscuro' },
  { id: 'azul-500', claro: '#2F5FA8', oscuro: '#8FB4E8', nombre: 'Azul' },
  { id: 'azul-700', claro: '#1E3F73', oscuro: '#5F8FD0', nombre: 'Azul oscuro' },
  { id: 'violeta-300', claro: '#8663C4', oscuro: '#C0AAE6', nombre: 'Violeta claro' },
  { id: 'violeta-500', claro: '#5B3E93', oscuro: '#A98FD6', nombre: 'Violeta' },
  { id: 'magenta-500', claro: '#A8317E', oscuro: '#E07AC0', nombre: 'Magenta' },
  { id: 'carmin-300', claro: '#E04B77', oscuro: '#F79BB4', nombre: 'Carmín claro' },
  { id: 'carmin-500', claro: '#CE184B', oscuro: '#E8628A', nombre: 'Carmín' },
  { id: 'carmin-700', claro: '#8E0F31', oscuro: '#D13463', nombre: 'Carmín oscuro' },
  { id: 'naranja-300', claro: '#C26A16', oscuro: '#F0AE70', nombre: 'Naranja' },
  { id: 'naranja-500', claro: '#9E5312', oscuro: '#E8974A', nombre: 'Naranja oscuro' },
  { id: 'marron-500', claro: '#6B4630', oscuro: '#C79A7E', nombre: 'Marrón' },
  { id: 'oro-500', claro: '#8F7000', oscuro: '#E0BC3C', nombre: 'Oro' },
  { id: 'lima-300', claro: '#8A8F00', oscuro: '#ABB200', nombre: 'Lima' },
  { id: 'lima-500', claro: '#4E5200', oscuro: '#DEE85E', nombre: 'Lima oscuro' },
  { id: 'verde-600', claro: '#0A4526', oscuro: '#63C98F', nombre: 'Verde oscuro' },
  { id: 'arena-300', claro: '#8A8A72', oscuro: '#F3F3EC', nombre: 'Arena' },
  { id: 'arena-500', claro: '#6E6E58', oscuro: '#D6D6C4', nombre: 'Arena oscura' },
] as const satisfies readonly ColorPaleta[]

const POR_ID = new Map(PALETA.map((c) => [c.id, c]))

export function colorPorId(id: string | undefined): ColorPaleta | undefined {
  return id === undefined ? undefined : POR_ID.get(id)
}

/** El primero de la paleta: lo que se ofrece cuando no hay nada elegido. */
export const COLOR_POR_DEFECTO = PALETA[0].id

// ——— Utilidades de color, compartidas con el test ———

export function aRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function lineal(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa WCAG. */
export function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map(lineal)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Ratio de contraste WCAG entre dos colores, siempre ≥ 1. */
export function contraste(a: string, b: string): number {
  const [alta, baja] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (alta + 0.05) / (baja + 0.05)
}

/** CIE Lab desde sRGB lineal, para medir distancia perceptual. */
export function aLab(hex: string): [number, number, number] {
  const [r, g, b] = aRgb(hex).map(lineal)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function distancia(a: string, b: string): number {
  const [la, aa, ba] = aLab(a)
  const [lb, ab, bb] = aLab(b)
  return Math.hypot(la - lb, aa - ab, ba - bb)
}

/**
 * El color de la paleta más parecido a un hex suelto. Solo existe para la
 * migración de los colores que se guardaron como hex antes de que hubiera
 * paleta: es determinista, así que aplicarla dos veces da lo mismo.
 */
export function idMasCercano(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return COLOR_POR_DEFECTO
  let mejor = PALETA[0]
  let min = Infinity
  for (const c of PALETA) {
    const d = distancia(hex, c.claro)
    if (d < min) {
      min = d
      mejor = c
    }
  }
  return mejor.id
}

/**
 * Devuelve el id tal cual si ya es de la paleta, y si no, el más parecido.
 * Idempotente: es lo que hace segura la migración de Dexie.
 */
export function normalizarColor(valor: string | undefined): string {
  if (!valor) return COLOR_POR_DEFECTO
  return POR_ID.has(valor) ? valor : idMasCercano(valor)
}
