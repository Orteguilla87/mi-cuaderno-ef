/**
 * Un grupo puede tener DOS clases el mismo día en franjas separadas (por
 * ejemplo, a primera hora y después del recreo). En las listas del día se ven
 * seguidas, y sin marca alguna parecen una clase partida o —peor— un duplicado
 * por error. Esto calcula, por grupo, cuántas clases tiene ese día y cuál es
 * cada una, para poder rotularlas «1.ª clase» / «2.ª clase».
 *
 * Solo mira lo que ya se va a pintar: no consulta la base ni el horario, así
 * que sirve igual para huecos del calendario y para las clases de «Hoy».
 */
export interface ClaseDelDia {
  grupoId: string
}

export interface OrdinalClase {
  /** 1 para la primera clase del grupo ese día, 2 para la segunda… */
  orden: number
  /** Cuántas clases tiene ese grupo ese día. 1 = no hace falta rotular nada. */
  total: number
}

/**
 * Ordinales en PARALELO a la lista que se le pasa —`ordinales[i]` es el de
 * `clases[i]`—, que es lo que consumen las vistas al pintar. Se llama con la
 * lista ya ordenada por hora, así que el orden de aparición ES el orden real.
 */
export function ordinalesDelDia(clases: ClaseDelDia[]): OrdinalClase[] {
  const totales = new Map<string, number>()
  for (const c of clases) totales.set(c.grupoId, (totales.get(c.grupoId) ?? 0) + 1)

  const vistos = new Map<string, number>()
  return clases.map((c) => {
    const orden = (vistos.get(c.grupoId) ?? 0) + 1
    vistos.set(c.grupoId, orden)
    return { orden, total: totales.get(c.grupoId) ?? 1 }
  })
}

/** «2.ª de 2» — vacío cuando el grupo solo tiene una clase ese día. */
export function rotuloOrdinal(o: OrdinalClase | undefined): string {
  if (!o || o.total < 2) return ''
  return `${o.orden}.ª de ${o.total}`
}
