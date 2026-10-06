import { db } from './db'
import type { NotaCelda } from './types'

/**
 * Notas de texto por celda del Cuaderno (`NotaCelda`, esquema v26).
 *
 * Solo las lee la vista Cuaderno. Ni el motor de cálculo ni ninguna exportación
 * pueden importar este módulo ni la tabla: lo vigila la lista blanca de
 * `lib/notasCeldaPrivacidad.test.ts`.
 */

/** Clave de una celda, la misma que usa la rejilla para sus valores. */
export const claveCelda = (columnaId: string, alumnoId: string) => `${columnaId}|${alumnoId}`

/** Las notas de un conjunto de columnas, por `claveCelda`. */
export async function notasDeColumnas(columnaIds: string[]): Promise<Map<string, NotaCelda>> {
  const lista = columnaIds.length ? await db.notasCelda.where('columnaId').anyOf(columnaIds).toArray() : []
  return new Map(lista.map((n) => [claveCelda(n.columnaId, n.alumnoId), n]))
}

/**
 * Escribe la nota de una celda. Un texto vacío (o solo espacios) BORRA el
 * registro: sin nota no hay fila, nunca una cadena vacía. Devuelve la función de
 * deshacer, que deja la celda exactamente como estaba (con su nota anterior o
 * sin ninguna).
 */
export async function guardarNota(
  columnaId: string,
  alumnoId: string,
  texto: string,
): Promise<() => Promise<void>> {
  const limpio = texto.trim()
  const antes = await db.notasCelda.get([columnaId, alumnoId])
  if (limpio) {
    await db.notasCelda.put({ columnaId, alumnoId, texto: limpio, actualizadoEn: Date.now() })
  } else if (antes) {
    await db.notasCelda.delete([columnaId, alumnoId])
  }
  return async () => {
    if (antes) await db.notasCelda.put(antes)
    else await db.notasCelda.delete([columnaId, alumnoId])
  }
}

export function borrarNota(columnaId: string, alumnoId: string): Promise<() => Promise<void>> {
  return guardarNota(columnaId, alumnoId, '')
}
