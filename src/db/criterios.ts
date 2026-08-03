import infantilJson from '../../seeds/criterios_infantil.json'
import primariaJson from '../../seeds/criterios_primaria.json'
import { cicloDeCurso } from '../lib/ciclos'
import { db } from './db'
import type { Criterio, Etapa } from './types'

export { cicloDeCurso, idCriterioPrimaria } from '../lib/ciclos'

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

/**
 * Forma del JSON de Primaria: competencias específicas numeradas 1–5 y los 46
 * criterios en una lista plana, cada uno con su `id` ya único (lleva el ciclo
 * dentro) tal como lo publica el decreto.
 */
interface CompetenciaPrimariaJson {
  id: number
  texto: string
}
interface CriterioPrimariaJson {
  id: string
  ciclo: number
  cursos: number[]
  competencia: number
  codigo: string
  texto: string
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
    competencias: CompetenciaPrimariaJson[]
    criterios: CriterioPrimariaJson[]
  }
  const competencias = new Map(datos.competencias.map((c) => [c.id, c.texto]))

  return datos.criterios.map((c) => ({
    // El id viene del propio decreto ('EF.2C.1.1') y lleva el ciclo dentro: el
    // código solo no vale, «1.1» existe en los tres con textos distintos.
    id: c.id,
    codigo: c.codigo,
    etapa: 'primaria' as Etapa,
    competenciaCodigo: `CE${c.competencia}`,
    competenciaTexto: competencias.get(c.competencia) ?? '',
    texto: c.texto,
    ciclo: c.ciclo as 1 | 2 | 3,
    cursos: c.cursos,
  }))
}

/** Lo que el JSON de Primaria tiene que cumplir para poder fiarse de él. */
export const CRITERIOS_PRIMARIA_ESPERADOS = 46

export class ErrorSemillaCriterios extends Error {
  constructor(public readonly problemas: string[]) {
    super(`La semilla de criterios de Primaria no cuadra:\n· ${problemas.join('\n· ')}`)
    this.name = 'ErrorSemillaCriterios'
  }
}

/**
 * Comprueba la semilla de Primaria antes de escribirla.
 *
 * Los criterios son la referencia legal de toda la evaluación: si el fichero
 * llega incompleto o con códigos repetidos dentro de un ciclo, los selectores
 * ofrecerían criterios que no existen y la cobertura mentiría. Mejor gritar que
 * seguir con una base a medias.
 */
export function validarCriteriosPrimaria(lista: Criterio[]): string[] {
  const problemas: string[] = []

  if (lista.length !== CRITERIOS_PRIMARIA_ESPERADOS)
    problemas.push(`hay ${lista.length} criterios y deberían ser ${CRITERIOS_PRIMARIA_ESPERADOS}`)

  const ciclos = new Set(lista.map((c) => c.ciclo))
  if (ciclos.size !== 3) problemas.push(`hay ${ciclos.size} ciclos y deberían ser 3`)

  const vistos = new Set<string>()
  for (const c of lista) {
    const clave = `${c.ciclo}:${c.codigo}`
    if (vistos.has(clave)) problemas.push(`código ${c.codigo} repetido en el ciclo ${c.ciclo}`)
    vistos.add(clave)
    if (!c.competenciaTexto)
      problemas.push(`${c.id} apunta a la competencia ${c.competenciaCodigo}, que no está en el fichero`)
  }

  const ids = new Set(lista.map((c) => c.id))
  if (ids.size !== lista.length) problemas.push('hay ids de criterio repetidos')

  return problemas
}

/**
 * Vuelca los criterios en la base. `bulkPut` actualiza los textos si cambian y
 * respeta los ids, así que es seguro llamarlo en cada arranque.
 *
 * Lanza `ErrorSemillaCriterios` si la semilla de Primaria no valida: quien
 * llama decide cómo enseñarlo, pero nunca en silencio.
 */
export async function sembrarCriterios(): Promise<void> {
  const primaria = criteriosPrimaria()
  const problemas = validarCriteriosPrimaria(primaria)
  if (problemas.length > 0) throw new ErrorSemillaCriterios(problemas)

  await db.criterios.bulkPut([...criteriosInfantil(), ...primaria])

  // Los ids de Primaria cambiaron de 'PRI:2:1.1' al del propio decreto
  // ('EF.2C.1.1'). `bulkPut` no toca los antiguos, así que se barren aquí: si
  // no, los selectores enseñarían cada criterio dos veces.
  const vigentes = new Set(primaria.map((c) => c.id))
  const sobrantes = (await db.criterios.where('etapa').equals('primaria').toArray())
    .filter((c) => !vigentes.has(c.id))
    .map((c) => c.id)
  if (sobrantes.length > 0) await db.criterios.bulkDelete(sobrantes)
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
