import { db, nuevoId } from './db'
import type { CarpetaUnidades } from './types'

/**
 * Carpetas del listado de unidades.
 *
 * Son pura organización: una unidad vive en a lo sumo una carpeta
 * (`UnidadBase.carpetaId`) y nada del cálculo, del volcado ni de la cobertura
 * mira ese campo. Por eso borrar una carpeta NUNCA borra unidades: las deja
 * sin carpeta, y se puede deshacer.
 */

/** Carpetas en el orden del listado. */
export async function listarCarpetas(): Promise<CarpetaUnidades[]> {
  return db.carpetas.orderBy('orden').toArray()
}

function normalizar(nombre: string): string {
  return nombre.trim().toLocaleLowerCase('es')
}

/** Dos carpetas con el mismo nombre serían indistinguibles en el listado. */
async function comprobarNombre(nombre: string, excepto?: string): Promise<string> {
  const limpio = nombre.trim()
  if (!limpio) throw new Error('Ponle un nombre a la carpeta')
  const repetida = (await db.carpetas.toArray()).find(
    (c) => c.id !== excepto && normalizar(c.nombre) === normalizar(limpio),
  )
  if (repetida) throw new Error(`Ya hay una carpeta «${repetida.nombre}»`)
  return limpio
}

export async function crearCarpeta(
  nombre: string,
): Promise<{ id: string; deshacer: () => Promise<void> }> {
  const limpio = await comprobarNombre(nombre)
  const ultima = await db.carpetas.orderBy('orden').last()
  const id = nuevoId()
  await db.carpetas.add({ id, nombre: limpio, orden: (ultima?.orden ?? -1) + 1 })
  return { id, deshacer: async () => void (await db.carpetas.delete(id)) }
}

export async function renombrarCarpeta(
  id: string,
  nombre: string,
): Promise<() => Promise<void>> {
  const carpeta = await db.carpetas.get(id)
  if (!carpeta) throw new Error('La carpeta ya no existe')
  const limpio = await comprobarNombre(nombre, id)
  await db.carpetas.update(id, { nombre: limpio })
  return async () => void (await db.carpetas.update(id, { nombre: carpeta.nombre }))
}

/**
 * Quita la carpeta. Sus unidades se quedan donde estaban, sin carpeta: es lo
 * que las hace seguir apareciendo en «Sin carpeta» y en las vistas por curso y
 * por ciclo.
 */
export async function eliminarCarpeta(id: string): Promise<{
  unidades: number
  deshacer: () => Promise<void>
}> {
  const carpeta = await db.carpetas.get(id)
  if (!carpeta) throw new Error('La carpeta ya no existe')
  let dentro: string[] = []
  await db.transaction('rw', [db.carpetas, db.unidades], async () => {
    dentro = (await db.unidades.toArray()).filter((u) => u.carpetaId === id).map((u) => u.id)
    for (const udId of dentro) await db.unidades.update(udId, { carpetaId: undefined })
    await db.carpetas.delete(id)
  })
  return {
    unidades: dentro.length,
    deshacer: async () => {
      await db.transaction('rw', [db.carpetas, db.unidades], async () => {
        await db.carpetas.put(carpeta)
        for (const udId of dentro) await db.unidades.update(udId, { carpetaId: id })
      })
    },
  }
}

/** Sube o baja una carpeta una posición en el listado. */
export async function moverCarpeta(
  id: string,
  delta: 1 | -1,
): Promise<(() => Promise<void>) | null> {
  const lista = await listarCarpetas()
  const i = lista.findIndex((c) => c.id === id)
  if (i < 0) throw new Error('La carpeta ya no existe')
  const j = i + delta
  if (j < 0 || j >= lista.length) return null
  const movida = [...lista]
  ;[movida[i], movida[j]] = [movida[j], movida[i]]
  const escribir = async (orden: CarpetaUnidades[]) => {
    await db.transaction('rw', db.carpetas, async () => {
      for (const [k, c] of orden.entries()) await db.carpetas.update(c.id, { orden: k })
    })
  }
  await escribir(movida)
  return () => escribir(lista)
}

/** Guarda una unidad en una carpeta, o la saca de la suya con `null`. */
export async function moverUnidadACarpeta(
  udId: string,
  carpetaId: string | null,
): Promise<() => Promise<void>> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) throw new Error('La unidad ya no existe')
  if (carpetaId !== null && !(await db.carpetas.get(carpetaId)))
    throw new Error('La carpeta ya no existe')
  const previa = unidad.carpetaId
  await db.unidades.update(udId, { carpetaId: carpetaId ?? undefined })
  return async () => void (await db.unidades.update(udId, { carpetaId: previa }))
}
