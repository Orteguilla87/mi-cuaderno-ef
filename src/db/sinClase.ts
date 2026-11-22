import { db } from './db'
import { sesionVacia, sinContenido } from './planificador'
import type { ContenidoSinClase } from './types'

/**
 * Bandeja «Sin clase asignada» (v28): contenido que «Pasar programación al
 * siguiente día» no pudo colocar antes de fin de curso. Solo dos salidas, las
 * dos con deshacer: colocarlo sobre una sesión existente o descartarlo.
 */

export async function sinClaseDelGrupo(grupoId: string): Promise<ContenidoSinClase[]> {
  return (await db.contenidoSinClase.where('grupoId').equals(grupoId).toArray()).sort((a, b) =>
    a.creado.localeCompare(b.creado),
  )
}

/**
 * Vuelca el contenido aparcado sobre una sesión del mismo grupo y lo saca de la
 * bandeja, en una transacción. Si la sesión tenía contenido, se sustituye: la
 * UI solo ofrece vacías, pero deshacer lo devuelve igual.
 */
export async function colocarSinClase(id: string, sesionId: string): Promise<() => Promise<void>> {
  const aparcado = await db.contenidoSinClase.get(id)
  if (!aparcado) throw new Error('Ese contenido ya no está en la bandeja')
  const sesion = await db.sesiones.get(sesionId)
  if (!sesion) throw new Error('La sesión ya no existe')
  if (sesion.grupoId !== aparcado.grupoId) throw new Error('La sesión es de otro grupo')

  await db.transaction('rw', db.sesiones, db.contenidoSinClase, async () => {
    await db.sesiones.put({ ...sinContenido(sesion), ...aparcado.contenido })
    await db.contenidoSinClase.delete(id)
  })
  return async () => {
    await db.transaction('rw', db.sesiones, db.contenidoSinClase, async () => {
      await db.sesiones.put(sesion)
      await db.contenidoSinClase.put(aparcado)
    })
  }
}

/** Lo borra de la bandeja. Devuelve cómo deshacerlo. */
export async function descartarSinClase(id: string): Promise<() => Promise<void>> {
  const aparcado = await db.contenidoSinClase.get(id)
  if (!aparcado) throw new Error('Ese contenido ya no está en la bandeja')
  await db.contenidoSinClase.delete(id)
  return async () => void (await db.contenidoSinClase.put(aparcado))
}

/** Sesiones vacías del grupo desde una fecha: los destinos que se ofrecen. */
export async function sesionesVaciasDesde(grupoId: string, desde: string) {
  return (await db.sesiones.where('grupoId').equals(grupoId).toArray())
    .filter((s) => s.fecha >= desde && sesionVacia(s))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''))
}
