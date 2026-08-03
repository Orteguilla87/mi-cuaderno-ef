/**
 * Filas de un instrumento (§ Orden 130/2023, art. 6).
 *
 * La fila es la unidad mínima de evaluación: lo que se puntúa y lo único que se
 * ata a un criterio del decreto. Un instrumento simple tiene una sola fila; una
 * rúbrica tiene una por criterio, cada una con SU criterio oficial.
 */

import { db, nuevoId } from './db'
import type { Columna, FilaInstrumento, Rubrica } from './types'

/** Filas de una columna, en orden. */
export async function filasDe(columnaId: string): Promise<FilaInstrumento[]> {
  const lista = await db.filas.where('columnaId').equals(columnaId).toArray()
  return lista.sort((a, b) => a.orden - b.orden)
}

/** Filas de varias columnas a la vez, agrupadas por columna y ya ordenadas. */
export async function filasPorColumna(
  columnaIds: string[],
): Promise<Map<string, FilaInstrumento[]>> {
  const mapa = new Map<string, FilaInstrumento[]>()
  if (columnaIds.length === 0) return mapa
  const lista = await db.filas.where('columnaId').anyOf(columnaIds).toArray()
  for (const f of lista) {
    const grupo = mapa.get(f.columnaId) ?? []
    grupo.push(f)
    mapa.set(f.columnaId, grupo)
  }
  for (const grupo of mapa.values()) grupo.sort((a, b) => a.orden - b.orden)
  return mapa
}

/**
 * Filas que le corresponden a una columna recién creada, sin escribirlas.
 *
 * Se separa de la escritura porque `pegarColumnas` necesita construir las de
 * todo un lote antes de meterlas de una vez.
 */
export function filasIniciales(
  columna: Pick<Columna, 'id' | 'titulo' | 'tipo'>,
  rubrica: Rubrica | undefined,
): FilaInstrumento[] {
  if (columna.tipo === 'rubrica' && rubrica) {
    return rubrica.criterios.map((cr, i) => ({
      id: nuevoId(),
      columnaId: columna.id,
      orden: i,
      descriptor: cr.titulo,
      criterioId: null,
      pesoFila: cr.pesoPct > 0 ? cr.pesoPct : null,
      criterioRubricaId: cr.id,
    }))
  }

  // Instrumento de nota única: una sola fila, con el título de la columna como
  // descriptor. Existe igualmente para que el motor tenga siempre de dónde
  // sacar la evidencia, sin un camino especial para el caso simple.
  return [
    {
      id: nuevoId(),
      columnaId: columna.id,
      orden: 0,
      descriptor: columna.titulo,
      criterioId: null,
      pesoFila: null,
    },
  ]
}

/**
 * Reconcilia las filas de una columna de rúbrica con los criterios de la
 * rúbrica que tenga ligada.
 *
 * Se llama al ligar una rúbrica y al volver de editarla. Conserva el criterio
 * oficial y el peso ya asignados a cada fila —que viven en la columna y no en
 * el banco, para que la misma rúbrica valga en ciclos distintos—, añade las
 * filas de los criterios nuevos y retira las de los que ya no existen.
 */
export async function sincronizarFilasConRubrica(columnaId: string): Promise<void> {
  const columna = await db.columnas.get(columnaId)
  if (!columna) return

  const rubrica = columna.tipo === 'rubrica' && columna.rubricaId
    ? await db.rubricas.get(columna.rubricaId)
    : undefined

  const actuales = await filasDe(columnaId)

  // Sin rúbrica ligada, la columna vuelve al caso simple: una fila sola. Si ya
  // era así, no se toca nada, para no perder el criterio que tuviera puesto.
  if (!rubrica) {
    if (actuales.length === 1 && !actuales[0].criterioRubricaId) return
    await db.transaction('rw', db.filas, async () => {
      await db.filas.bulkDelete(actuales.map((f) => f.id))
      await db.filas.bulkAdd(filasIniciales(columna, undefined))
    })
    return
  }

  const previaPorCriterio = new Map(
    actuales.filter((f) => f.criterioRubricaId).map((f) => [f.criterioRubricaId!, f]),
  )
  // Una columna que era simple y pasa a rúbrica: su criterio no se tira, se
  // hereda en la primera fila, que es lo que el usuario esperaría.
  const heredado = actuales.find((f) => !f.criterioRubricaId)?.criterioId ?? null

  const nuevas: FilaInstrumento[] = rubrica.criterios.map((cr, i) => {
    const previa = previaPorCriterio.get(cr.id)
    return {
      id: previa?.id ?? nuevoId(),
      columnaId,
      orden: i,
      descriptor: cr.titulo,
      criterioId: previa?.criterioId ?? (i === 0 ? heredado : null),
      pesoFila: previa ? previa.pesoFila : cr.pesoPct > 0 ? cr.pesoPct : null,
      criterioRubricaId: cr.id,
    }
  })

  const sobreviven = new Set(nuevas.map((f) => f.id))
  const aBorrar = actuales.filter((f) => !sobreviven.has(f.id)).map((f) => f.id)

  await db.transaction('rw', db.filas, async () => {
    if (aBorrar.length) await db.filas.bulkDelete(aBorrar)
    await db.filas.bulkPut(nuevas)
  })
}

/** Cambia el criterio oficial de una fila. Devuelve la función de deshacer. */
export async function asignarCriterio(
  filaId: string,
  criterioId: string | null,
): Promise<() => Promise<void>> {
  const antes = await db.filas.get(filaId)
  if (!antes) return async () => {}
  await db.filas.update(filaId, { criterioId })
  return async () => void (await db.filas.update(filaId, { criterioId: antes.criterioId }))
}
