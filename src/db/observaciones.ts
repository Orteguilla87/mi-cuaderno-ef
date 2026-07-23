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
