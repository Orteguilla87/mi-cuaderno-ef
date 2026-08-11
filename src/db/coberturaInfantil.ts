/**
 * Cobertura de los criterios de Infantil (Decreto 36/2022).
 *
 * Vive aparte de `db/cobertura.ts` a propósito: aquella responde a «qué
 * instrumentos han evaluado este criterio y qué notas han salido», y aquí no
 * hay instrumentos ni notas que valgan. La pregunta es más simple —«¿qué
 * criterios he llegado a programar y cuáles no he tocado?»— y la respuesta sale
 * solo de los vínculos de las situaciones de aprendizaje.
 *
 * Los criterios son de ciclo completo: 3, 4 y 5 años comparten los 56, así que
 * la cobertura también es del ciclo y no se filtra por edad.
 */

import { db } from './db'
import type { Criterio } from './types'

export interface CoberturaCriterioInfantil {
  criterio: Criterio
  /** Títulos de las unidades que lo tienen vinculado. Vacío = sin trabajar. */
  unidades: string[]
}

/**
 * Todos los criterios de Infantil con las unidades que los vinculan. Los que no
 * aparecen en ninguna salen igualmente con la lista vacía: son justo los que
 * hay que ver.
 *
 * `soloAreaPrincipal` limita el informe al Área I («Crecimiento en armonía»),
 * que es la que se evalúa desde Psicomotricidad. Las otras dos se pueden pedir,
 * pero exigir cobertura de las 56 desde el gimnasio sería un aviso inútil.
 */
export async function coberturaInfantil(
  soloAreaPrincipal = true,
): Promise<CoberturaCriterioInfantil[]> {
  const criterios = (await db.criterios.where('etapa').equals('infantil').toArray())
    .filter((c) => !soloAreaPrincipal || c.principal)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))

  const unidades = await db.unidades.where('etapa').equals('infantil').toArray()

  const porCriterio = new Map<string, string[]>()
  for (const u of unidades) {
    for (const id of u.criterios) {
      const lista = porCriterio.get(id) ?? []
      lista.push(u.titulo)
      porCriterio.set(id, lista)
    }
  }

  return criterios.map((criterio) => ({
    criterio,
    unidades: porCriterio.get(criterio.id) ?? [],
  }))
}
