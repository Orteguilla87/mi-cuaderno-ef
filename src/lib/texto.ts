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
