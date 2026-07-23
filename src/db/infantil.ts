import { db, nuevoId } from './db'
import type { NivelLogro, RegistroInfantil } from './types'

/**
 * Escala cualitativa de Infantil (§6). Es la ÚNICA valoración posible: los
 * grupos de Infantil no admiten números en ningún punto de la app.
 */
export const NIVELES_INFANTIL: {
  nivel: NivelLogro
  etiqueta: string
  corto: string
  clase: string
}[] = [
  { nivel: 'iniciado', etiqueta: 'Iniciado', corto: 'I', clase: 'bg-acento text-white' },
  {
    nivel: 'en_proceso',
    etiqueta: 'En proceso',
    corto: 'P',
    clase: 'bg-aviso text-white',
  },
  {
    nivel: 'conseguido',
    etiqueta: 'Conseguido',
    corto: 'C',
    clase: 'bg-lima-oscuro text-white',
  },
]

/** Orden para ciclar al tocar: sin valorar → iniciado → en proceso → conseguido → sin valorar. */
const CICLO: NivelLogro[] = ['iniciado', 'en_proceso', 'conseguido']

export function siguienteNivel(actual: NivelLogro | undefined): NivelLogro | undefined {
  if (!actual) return 'iniciado'
  const i = CICLO.indexOf(actual)
  return i === CICLO.length - 1 ? undefined : CICLO[i + 1]
}

/** Registros de un grupo en un momento, indexados por `alumnoId|criterioCodigo`. */
export async function registrosDe(
  alumnoIds: string[],
  momento: 1 | 2 | 3,
): Promise<Map<string, RegistroInfantil>> {
  if (alumnoIds.length === 0) return new Map()
  const lista = await db.registrosInfantil.where('alumnoId').anyOf(alumnoIds).toArray()
  return new Map(
    lista.filter((r) => r.momento === momento).map((r) => [`${r.alumnoId}|${r.criterioCodigo}`, r]),
  )
}

/**
 * Fija (o borra) el nivel de un alumno en un criterio y momento. `nivel`
 * `undefined` elimina el registro. Devuelve la función de deshacer.
 */
export async function fijarNivel(
  alumnoId: string,
  criterioCodigo: string,
  momento: 1 | 2 | 3,
  nivel: NivelLogro | undefined,
): Promise<() => Promise<void>> {
  const previo = await db.registrosInfantil
    .where('[alumnoId+criterioCodigo+momento]')
    .equals([alumnoId, criterioCodigo, momento])
    .first()

  if (!nivel) {
    if (!previo) return async () => {}
    await db.registrosInfantil.delete(previo.id)
    return async () => void (await db.registrosInfantil.add(previo))
  }

  if (previo) {
    const antes = { ...previo }
    await db.registrosInfantil.update(previo.id, { nivel })
    return async () => void (await db.registrosInfantil.put(antes))
  }

  const nuevo: RegistroInfantil = {
    id: nuevoId(),
    alumnoId,
    criterioCodigo,
    momento,
    nivel,
  }
  await db.registrosInfantil.add(nuevo)
  return async () => void (await db.registrosInfantil.delete(nuevo.id))
}

export interface ResumenLogro {
  iniciado: number
  en_proceso: number
  conseguido: number
  sinValorar: number
  total: number
}

/**
 * Reparto de niveles de un alumno en un momento, para el resumen automático del
 * informe (§6). `totalCriterios` es cuántos criterios hay, para deducir los aún
 * sin valorar.
 */
export function resumirLogros(
  registros: RegistroInfantil[],
  totalCriterios: number,
): ResumenLogro {
  const r: ResumenLogro = {
    iniciado: 0,
    en_proceso: 0,
    conseguido: 0,
    sinValorar: 0,
    total: totalCriterios,
  }
  for (const reg of registros) r[reg.nivel]++
  r.sinValorar = Math.max(0, totalCriterios - registros.length)
  return r
}
