import infantilJson from '../../seeds/criterios_infantil.json'
import primariaJson from '../../seeds/criterios_primaria.json'
import { db } from './db'
import type { Criterio, Etapa } from './types'

/**
 * Criterios oficiales de los Decretos 36/2022 (Infantil) y 61/2022 (Primaria).
 *
 * Los JSON se empaquetan en el bundle (§1: nada de red en runtime) y se
 * vuelcan a Dexie al arrancar. Los textos son los literales del decreto
 * aportados por el usuario: la app no los inventa (§9).
 */

interface CriterioInfantilJson {
  codigo: string
  texto: string
}
interface CompetenciaInfantilJson {
  codigo: string
  texto: string
  criterios: CriterioInfantilJson[]
}
interface AreaInfantilJson {
  codigo: string
  nombre: string
  principal?: boolean
  competencias: CompetenciaInfantilJson[]
}

interface CriterioPrimariaJson {
  codigo: string
  competencia: string
  texto: string
}
interface CicloPrimariaJson {
  ciclo: number
  cursos: number[]
  criterios: CriterioPrimariaJson[]
}

export function criteriosInfantil(): Criterio[] {
  const areas = (infantilJson as { areas: AreaInfantilJson[] }).areas
  return areas.flatMap((area) =>
    area.competencias.flatMap((competencia) =>
      competencia.criterios.map((c) => ({
        id: `INF:${c.codigo}`,
        codigo: c.codigo,
        etapa: 'infantil' as Etapa,
        competenciaCodigo: competencia.codigo,
        competenciaTexto: competencia.texto,
        texto: c.texto,
        areaCodigo: area.codigo,
        areaNombre: area.nombre,
        principal: !!area.principal,
      })),
    ),
  )
}

export function criteriosPrimaria(): Criterio[] {
  const datos = primariaJson as {
    competencias_especificas: { codigo: string; texto: string }[]
    ciclos: CicloPrimariaJson[]
  }
  const competencias = new Map(datos.competencias_especificas.map((c) => [c.codigo, c.texto]))

  return datos.ciclos.flatMap((ciclo) =>
    ciclo.criterios.map((c) => ({
      // El ciclo entra en la clave: el mismo código existe en los tres.
      id: `PRI:${ciclo.ciclo}:${c.codigo}`,
      codigo: c.codigo,
      etapa: 'primaria' as Etapa,
      competenciaCodigo: c.competencia,
      competenciaTexto: competencias.get(c.competencia) ?? '',
      texto: c.texto,
      ciclo: ciclo.ciclo as 1 | 2 | 3,
      cursos: ciclo.cursos,
    })),
  )
}

/**
 * Vuelca los criterios en la base. `bulkPut` actualiza los textos si cambian y
 * respeta los ids, así que es seguro llamarlo en cada arranque.
 */
export async function sembrarCriterios(): Promise<void> {
  const todos = [...criteriosInfantil(), ...criteriosPrimaria()]
  await db.criterios.bulkPut(todos)
}

/** Ciclo de Primaria (1–3) al que pertenece un curso (1–6). */
export function cicloDeCurso(curso: number): 1 | 2 | 3 {
  if (curso <= 2) return 1
  if (curso <= 4) return 2
  return 3
}

/** Criterios que aplican a un grupo, según su etapa y su nivel. */
export async function criteriosDeGrupo(
  etapa: Etapa,
  nivel: number,
  soloAreaPrincipal = true,
): Promise<Criterio[]> {
  if (etapa === 'infantil') {
    const lista = await db.criterios.where('etapa').equals('infantil').toArray()
    // Desde Psicomotricidad se evalúa el Área I; las otras quedan disponibles
    // por si se decide registrar en ellas.
    const filtrados = soloAreaPrincipal ? lista.filter((c) => c.principal) : lista
    return filtrados.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  }

  const ciclo = cicloDeCurso(nivel)
  const lista = await db.criterios.where('[etapa+ciclo]').equals(['primaria', ciclo]).toArray()
  return lista.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
}
