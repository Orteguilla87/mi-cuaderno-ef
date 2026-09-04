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
 *   `### ` momento · `#### ` submomento · `- ` lista · `**negrita**` · párrafo.
 */

export interface TrozoMd {
  texto: string
  fuerte: boolean
}

export type BloqueMd =
  | { tipo: 'titulo'; nivel: 1 | 2; trozos: TrozoMd[] }
  | { tipo: 'parrafo'; lineas: TrozoMd[][] }
  | { tipo: 'lista'; items: TrozoMd[][] }

const ENCABEZADO = /^(#{1,6})\s+(.*)$/
const ITEM = /^[-*]\s+(.*)$/
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
 */
export function bloques(texto: string): BloqueMd[] {
  const salida: BloqueMd[] = []
  let parrafo: TrozoMd[][] = []
  let lista: TrozoMd[][] = []

  const cerrar = () => {
    if (parrafo.length) salida.push({ tipo: 'parrafo', lineas: parrafo })
    if (lista.length) salida.push({ tipo: 'lista', items: lista })
    parrafo = []
    lista = []
  }

  for (const cruda of (texto ?? '').split('\n')) {
    const t = cruda.trim()
    if (!t) {
      cerrar()
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
    if (item) {
      if (parrafo.length) cerrar()
      lista.push(trozos(item[1]))
      continue
    }

    if (lista.length) cerrar()
    parrafo.push(trozos(t))
  }

  cerrar()
  return salida
}
