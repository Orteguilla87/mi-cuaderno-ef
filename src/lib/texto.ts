/**
 * Normalización de texto compartida por todo lo que compara nombres escritos a
 * mano: el Banco de Juegos y el Inventario de material.
 *
 * Vivía suelta en `db/juegos.ts`; el inventario necesita EXACTAMENTE la misma
 * regla para deduplicar («Aros», «aros» y «  Aros » son el mismo material), y
 * dos copias que se separen significan duplicados que la app no ve.
 */

/**
 * Minúsculas, sin tildes y sin espacios de sobra (ni dobles en medio).
 *
 * `\p{Diacritic}` sobre la forma NFD evita escribir a mano el rango de
 * combinantes: mismo efecto, sin caracteres invisibles en el fuente.
 */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deja UNA línea en la forma en que el resto de parsers esperan verla, venga de
 * Word, de Google Docs o de un markdown.
 *
 * Nunca añade ni quita saltos de línea, y por eso se aplica línea a línea: los
 * offsets del preview de importación y los índices de `lineasConsumidas` del
 * extractor de material están medidos en líneas, y una regla que partiera o
 * uniera alguna los descuadraría entera.
 *
 * La viñeta solo se normaliza al principio de la línea: un `-` en medio de una
 * frase es un guion, no un punto de lista.
 */
export function normalizarLinea(linea: string): string {
  return linea
    .replace(/[\u00a0\u2007\u2009\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(/^([ \t]*)(?:[\u2022\u25cf\u25aa\u2023\u25e6\u25b8\u25ab\u2219\u00b7]|[-\u2013\u2014*])[ \t]+/, '$1- ')
    .replace(/[\u2022\u25cf\u25aa\u2023\u25e6\u25b8\u25ab]/g, '-')
    .replace(/ {2,}/g, ' ')
    .replace(/[ \t]+$/, '')
}
