import { db, nuevoId } from './db'
import type { ClaseCancelada, Sesion } from './types'

/**
 * Lotes de cambios en la planificación (§ petición: deshacer transversal).
 *
 * Toda operación que altera la planificación de un grupo —volcar una unidad,
 * eliminar una sesión moviendo el resto, eliminarla sin más— se describe como
 * un LOTE: el estado exacto de cada fila que toca, antes y después. Deshacer
 * repone el «antes» de una vez, en una transacción.
 *
 * Por qué una foto y no una función de deshacer: el error se descubre un minuto
 * después, no en el instante del aviso. Una closure muere al recargar la app;
 * una foto se guarda (`store/lotesPlan.ts`, en `localStorage`) y sigue ahí.
 * No vive en Dexie a propósito: es historial de ESTE dispositivo, y no debe
 * viajar en la copia cifrada ni en la sincronización.
 */

export type TipoLote = 'volcado' | 'eliminar-mover' | 'eliminar'

export interface EstadoLote {
  sesiones: Sesion[]
  cancelaciones: ClaseCancelada[]
}

export interface LotePlan {
  id: string
  grupoId: string
  tipo: TipoLote
  /** Frase para el historial: qué se hizo y sobre qué. */
  descripcion: string
  /** ISO de cuándo se aplicó. */
  creado: string
  /** Filas tal como estaban. Una fila que no está aquí no existía. */
  antes: EstadoLote
  /** Filas tal como quedaron. Una fila que no está aquí dejó de existir. */
  despues: EstadoLote
}

export function crearLote(datos: Omit<LotePlan, 'id' | 'creado'>): LotePlan {
  return { id: nuevoId(), creado: new Date().toISOString(), ...datos }
}

/** Serialización estable: Dexie no garantiza el orden de las claves al leer. */
function estable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`
  if (valor && typeof valor === 'object')
    return `{${Object.keys(valor)
      .filter((k) => (valor as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estable((valor as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(valor)
}

/**
 * Cuántas filas del lote han cambiado DESPUÉS de aplicarlo: editadas, borradas
 * o vueltas a crear. Deshacer las devuelve igualmente al estado de antes; el
 * número sirve para avisar de lo que se pierde, no para impedirlo.
 */
export async function cambiosPosteriores(lote: LotePlan): Promise<number> {
  const esperadas = new Map(lote.despues.sesiones.map((s) => [s.id, estable(s)]))
  const desaparecidas = lote.antes.sesiones.filter((s) => !esperadas.has(s.id)).map((s) => s.id)
  const ids = [...esperadas.keys(), ...desaparecidas]
  const actuales = await db.sesiones.bulkGet(ids)

  let cambios = 0
  actuales.forEach((actual, i) => {
    const esperada = esperadas.get(ids[i])
    if (esperada === undefined) {
      if (actual) cambios++ // debía seguir sin existir
    } else if (!actual || estable(actual) !== esperada) cambios++
  })
  return cambios
}

/**
 * Devuelve la planificación al estado exacto anterior al lote: las filas que el
 * lote creó desaparecen y las que tocó o borró vuelven tal como estaban, en una
 * sola transacción.
 */
export async function deshacerLote(lote: LotePlan): Promise<void> {
  const sesionesAntes = new Set(lote.antes.sesiones.map((s) => s.id))
  const cancelacionesAntes = new Set(lote.antes.cancelaciones.map((c) => c.id))

  await db.transaction('rw', db.sesiones, db.clasesCanceladas, async () => {
    const sesionesNuevas = lote.despues.sesiones.filter((s) => !sesionesAntes.has(s.id))
    if (sesionesNuevas.length) await db.sesiones.bulkDelete(sesionesNuevas.map((s) => s.id))
    if (lote.antes.sesiones.length) await db.sesiones.bulkPut(lote.antes.sesiones)

    const cancelacionesNuevas = lote.despues.cancelaciones.filter(
      (c) => !cancelacionesAntes.has(c.id),
    )
    if (cancelacionesNuevas.length)
      await db.clasesCanceladas.bulkDelete(cancelacionesNuevas.map((c) => c.id))
    if (lote.antes.cancelaciones.length) await db.clasesCanceladas.bulkPut(lote.antes.cancelaciones)
  })
}
