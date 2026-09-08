import { db, nuevoId } from './db'
import type { Observacion, SignoObservacion, TipoObservacion } from './types'
import { aISO } from '../lib/fechas'

export interface NuevaObservacion {
  alumnoId?: string
  grupoId: string
  tipo: TipoObservacion
  signo: SignoObservacion
  texto: string
  tags: string[]
  fecha?: string
}

/** Crea la observación y devuelve su función de deshacer (§7). */
export async function crearObservacion(
  datos: NuevaObservacion,
): Promise<{ observacion: Observacion; deshacer: () => Promise<void> }> {
  const observacion: Observacion = {
    id: nuevoId(),
    alumnoId: datos.alumnoId,
    grupoId: datos.grupoId,
    fecha: datos.fecha ?? aISO(),
    tipo: datos.tipo,
    signo: datos.signo,
    texto: datos.texto.trim(),
    tags: datos.tags,
  }
  await db.observaciones.add(observacion)
  return {
    observacion,
    deshacer: async () => void (await db.observaciones.delete(observacion.id)),
  }
}

/**
 * Lo que se puede cambiar de una observación ya registrada: su CONTENIDO.
 *
 * La fecha queda fuera a propósito: es dato de registro —cuándo pasó—, no de
 * contenido, y corregirla es otra operación distinta que sigue por su camino.
 */
export interface CambiosObservacion {
  texto?: string
  signo?: SignoObservacion
  tipo?: TipoObservacion
  tags?: string[]
}

/**
 * Edita una observación en el sitio y devuelve su deshacer, que repone el
 * registro ENTERO tal como estaba —incluida la marca de tiempo anterior—.
 *
 * `actualizadoEn` distingue una observación tocada de una recién creada. La
 * marca de «pendiente de sincronizar» no se pone aquí: los hooks de Dexie de
 * `db/sincro.ts` vigilan toda escritura de toda tabla, así que un `update` ya
 * la marca por sí solo, igual que cualquier otra escritura de la app.
 */
export async function editarObservacion(
  id: string,
  cambios: CambiosObservacion,
  ahora = Date.now(),
): Promise<{ deshacer: () => Promise<void> }> {
  const previa = await db.observaciones.get(id)
  if (!previa) throw new Error('La observación ya no existe')

  const siguiente: Observacion = {
    ...previa,
    ...(cambios.texto !== undefined ? { texto: cambios.texto.trim() } : {}),
    ...(cambios.signo !== undefined ? { signo: cambios.signo } : {}),
    ...(cambios.tipo !== undefined ? { tipo: cambios.tipo } : {}),
    ...(cambios.tags !== undefined ? { tags: cambios.tags } : {}),
    actualizadoEn: ahora,
  }
  await db.observaciones.put(siguiente)

  return { deshacer: async () => void (await db.observaciones.put(previa)) }
}

/** Elimina una observación. El deshacer la repone intacta, con su id original. */
export async function eliminarObservacion(
  id: string,
): Promise<{ deshacer: () => Promise<void> }> {
  const previa = await db.observaciones.get(id)
  if (!previa) throw new Error('La observación ya no existe')
  await db.observaciones.delete(id)
  return { deshacer: async () => void (await db.observaciones.add(previa)) }
}

export interface ContadorSigno {
  positivos: number
  negativos: number
}

/**
 * Contadores +/− por alumno de un grupo, para pintarlos en la vista de grupo
 * (paridad con «positivos y negativos» de Additio).
 */
export async function contadoresPorAlumno(
  grupoId: string,
): Promise<Map<string, ContadorSigno>> {
  const lista = await db.observaciones.where('grupoId').equals(grupoId).toArray()
  const mapa = new Map<string, ContadorSigno>()
  for (const o of lista) {
    if (!o.alumnoId) continue // las de grupo no cuentan para nadie en particular
    const actual = mapa.get(o.alumnoId) ?? { positivos: 0, negativos: 0 }
    if (o.signo === '+') actual.positivos++
    else if (o.signo === '-') actual.negativos++
    mapa.set(o.alumnoId, actual)
  }
  return mapa
}

export interface FiltroObservaciones {
  grupoId?: string
  alumnoId?: string
  tipo?: TipoObservacion
  signo?: SignoObservacion
  texto?: string
}

/** Timeline filtrable, de más reciente a más antigua. */
export async function buscarObservaciones(filtro: FiltroObservaciones): Promise<Observacion[]> {
  let lista: Observacion[]
  // Se ataca por el índice más selectivo disponible antes de filtrar en memoria.
  if (filtro.alumnoId) {
    lista = await db.observaciones.where('alumnoId').equals(filtro.alumnoId).toArray()
  } else if (filtro.grupoId) {
    lista = await db.observaciones.where('grupoId').equals(filtro.grupoId).toArray()
  } else {
    lista = await db.observaciones.toArray()
  }

  const texto = filtro.texto?.trim().toLowerCase()
  return lista
    .filter((o) => (filtro.grupoId ? o.grupoId === filtro.grupoId : true))
    .filter((o) => (filtro.tipo ? o.tipo === filtro.tipo : true))
    .filter((o) => (filtro.signo ? o.signo === filtro.signo : true))
    .filter((o) =>
      texto
        ? o.texto.toLowerCase().includes(texto) ||
          o.tags.some((t) => t.toLowerCase().includes(texto))
        : true,
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
}
