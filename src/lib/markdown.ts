/**
 * Renderizador de markdown mínimo — solo el subconjunto que la app escribe.
 *
 * No hay dependencia: §1.1 pide un bundle autocontenido y sin CDN, y meter una
 * librería de markdown entera (con HTML crudo, tablas y `dangerouslySetInnerHTML`
 * detrás) para pintar tres encabezados y una negrita sería pagar peso y
 * superficie de ataque por nada. Esto devuelve una estructura de datos; quien
 * pinta es `components/TextoMarkdown.tsx`, con elementos de React. Así no se
 * inyecta HTML en ningún momento.
 *
 * El subconjunto es exactamente el que produce `aMarkdown`:
 *   `### ` momento · `#### ` submomento · `- ` lista · `1. ` lista numerada ·
 *   `  - ` sublista (2 espacios, cuelga del elemento anterior) · `**negrita**` ·
 *   párrafo.
 */

export interface TrozoMd {
  texto: string
  fuerte: boolean
}

/** Un elemento de lista y su sublista, si la tiene. */
export interface ItemMd {
  trozos: TrozoMd[]
  hijos: TrozoMd[][]
}

export type BloqueMd =
  | { tipo: 'titulo'; nivel: 1 | 2; trozos: TrozoMd[] }
  | { tipo: 'parrafo'; lineas: TrozoMd[][] }
  | { tipo: 'lista'; items: ItemMd[] }
  /** `numero` es el que traía el texto: no se renumera, ni al pintar. */
  | { tipo: 'listaOrdenada'; items: (ItemMd & { numero: number })[] }

const ENCABEZADO = /^(#{1,6})\s+(.*)$/
const ITEM = /^[-*]\s+(.*)$/
const NUMERADO = /^(\d+)[.)]\s+(.*)$/
const SANGRIA = /^\s{2,}/
const FUERTE = /\*\*(.+?)\*\*/g

/** Parte una línea en trozos normales y en negrita. Sin anidar: no hace falta. */
export function trozos(linea: string): TrozoMd[] {
  const salida: TrozoMd[] = []
  let ultimo = 0
  for (const m of linea.matchAll(FUERTE)) {
    const i = m.index ?? 0
    if (i > ultimo) salida.push({ texto: linea.slice(ultimo, i), fuerte: false })
    salida.push({ texto: m[1], fuerte: true })
    ultimo = i + m[0].length
  }
  if (ultimo < linea.length) salida.push({ texto: linea.slice(ultimo), fuerte: false })
  return salida.length ? salida : [{ texto: linea, fuerte: false }]
}

/**
 * Bloques de un texto en markdown.
 *
 * Las líneas seguidas se agrupan en un párrafo y las viñetas seguidas en una
 * lista: agrupar es lo que da el aire entre bloques que hace legible el texto
 * en el móvil, y sin ello cada salto de línea sería un párrafo con su margen.
 *
 * Una línea en blanco NO cierra una lista numerada: entre «4.» y su sublista, y
 * entre la sublista y «5.», el texto deja aire, pero sigue siendo la misma
 * lista. La cierra un párrafo, un encabezado o una viñeta sin sangría.
 */
export function bloques(texto: string): BloqueMd[] {
  const salida: BloqueMd[] = []
  let parrafo: TrozoMd[][] = []
  let vinetas: ItemMd[] = []
  let numerados: (ItemMd & { numero: number })[] = []

  const cerrar = () => {
    if (parrafo.length) salida.push({ tipo: 'parrafo', lineas: parrafo })
    if (vinetas.length) salida.push({ tipo: 'lista', items: vinetas })
    if (numerados.length) salida.push({ tipo: 'listaOrdenada', items: numerados })
    parrafo = []
    vinetas = []
    numerados = []
  }

  for (const cruda of (texto ?? '').split('\n')) {
    const t = cruda.trim()
    if (!t) {
      if (!numerados.length) cerrar()
      continue
    }

    const encabezado = ENCABEZADO.exec(t)
    if (encabezado) {
      cerrar()
      salida.push({
        tipo: 'titulo',
        nivel: encabezado[1].length <= 3 ? 1 : 2,
        trozos: trozos(encabezado[2].trim()),
      })
      continue
    }

    const item = ITEM.exec(t)
    const abierta = numerados.length ? numerados : vinetas
    if (item && SANGRIA.test(cruda) && abierta.length) {
      abierta[abierta.length - 1].hijos.push(trozos(item[1]))
      continue
    }

    const numerado = NUMERADO.exec(t)
    if (numerado) {
      if (!numerados.length) cerrar()
      numerados.push({ numero: Number(numerado[1]), trozos: trozos(numerado[2]), hijos: [] })
      continue
    }

    if (item) {
      if (!vinetas.length) cerrar()
      vinetas.push({ trozos: trozos(item[1]), hijos: [] })
      continue
    }

    if (vinetas.length || numerados.length) cerrar()
    parrafo.push(trozos(t))
  }

  cerrar()
  return salida
}
