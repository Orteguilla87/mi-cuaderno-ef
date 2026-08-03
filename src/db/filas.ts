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

export interface ResultadoAsignarCriterio {
  /** Título de la unidad a la que se ha añadido el criterio de paso, si ha pasado. */
  anadidoALaUnidad?: string
  deshacer: () => Promise<void>
}

/**
 * Asigna el criterio oficial de una fila.
 *
 * Si el criterio no estaba en la unidad, se añade también a ella: evaluar algo
 * con un criterio y que la unidad diga que no lo trabaja sería una
 * contradicción, y obligar a ir a otra pantalla a declararlo primero sería un
 * peaje. Se hace y se cuenta, con Deshacer, que es lo que hace el resto del
 * cuaderno.
 */
export async function asignarCriterio(
  filaId: string,
  criterioId: string | null,
): Promise<ResultadoAsignarCriterio> {
  const antes = await db.filas.get(filaId)
  if (!antes) return { deshacer: async () => {} }

  const columna = await db.columnas.get(antes.columnaId)
  const unidad = columna?.udId ? await db.unidades.get(columna.udId) : undefined
  const anadir = !!(criterioId && unidad && !unidad.criterios.includes(criterioId))

  await db.transaction('rw', [db.filas, db.unidades], async () => {
    await db.filas.update(filaId, { criterioId })
    if (anadir && unidad && criterioId)
      await db.unidades.update(unidad.id, { criterios: [...unidad.criterios, criterioId] })
  })

  return {
    anadidoALaUnidad: anadir ? unidad!.titulo : undefined,
    deshacer: async () => {
      await db.transaction('rw', [db.filas, db.unidades], async () => {
        await db.filas.update(filaId, { criterioId: antes.criterioId })
        if (anadir && unidad) await db.unidades.update(unidad.id, { criterios: unidad.criterios })
      })
    },
  }
}

/** Cambia el peso de una fila dentro de su instrumento. */
export async function fijarPesoFila(filaId: string, pesoFila: number | null): Promise<void> {
  await db.filas.update(filaId, { pesoFila })
}

/**
 * Cambia el descriptor de una fila. Solo tiene sentido en instrumentos simples:
 * en una rúbrica el descriptor lo pone el banco, y editarlo aquí lo dejaría
 * desincronizado con lo que se ve al calificar.
 */
export async function fijarDescriptorFila(filaId: string, descriptor: string): Promise<void> {
  await db.filas.update(filaId, { descriptor })
}
