import infantilJson from '../../seeds/criterios_infantil.json'
import primariaJson from '../../seeds/criterios_primaria.json'
import { cicloDeCurso } from '../lib/ciclos'
import { guardarConfig, leerConfig } from './config'
import { db } from './db'
import { sinMarcar } from './supresion'
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

/** Ídem para Infantil: 2.º ciclo del Decreto 36/2022, tres áreas. */
export const CRITERIOS_INFANTIL_ESPERADOS = 56
export const AREAS_INFANTIL_ESPERADAS = 3

export class ErrorSemillaCriterios extends Error {
  constructor(
    public readonly etapa: Etapa,
    public readonly problemas: string[],
  ) {
    super(
      `La semilla de criterios de ${etapa === 'infantil' ? 'Infantil' : 'Primaria'} no cuadra:\n· ${problemas.join('\n· ')}`,
    )
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
 * Lo mismo para Infantil. El motivo es idéntico —los criterios son la referencia
 * legal, y una semilla a medias haría que el selector ofreciera criterios que no
 * existen y que la cobertura mintiera— pero las comprobaciones no: aquí no hay
 * ciclos (los 56 son del 2.º ciclo entero) y sí áreas, con una sola marcada como
 * principal, que es la que se ofrece por defecto desde Psicomotricidad.
 */
export function validarCriteriosInfantil(lista: Criterio[]): string[] {
  const problemas: string[] = []

  if (lista.length !== CRITERIOS_INFANTIL_ESPERADOS)
    problemas.push(`hay ${lista.length} criterios y deberían ser ${CRITERIOS_INFANTIL_ESPERADOS}`)

  const areas = new Set(lista.map((c) => c.areaCodigo))
  if (areas.size !== AREAS_INFANTIL_ESPERADAS)
    problemas.push(`hay ${areas.size} áreas y deberían ser ${AREAS_INFANTIL_ESPERADAS}`)

  const principales = new Set(lista.filter((c) => c.principal).map((c) => c.areaCodigo))
  if (principales.size !== 1)
    problemas.push(`hay ${principales.size} áreas marcadas como principal y debería haber 1`)

  for (const c of lista) {
    if (!c.competenciaTexto)
      problemas.push(`${c.id} apunta a la competencia ${c.competenciaCodigo}, que no tiene texto`)
    if (!c.areaNombre) problemas.push(`${c.id} está en un área sin nombre`)
  }

  const ids = new Set(lista.map((c) => c.id))
  if (ids.size !== lista.length) problemas.push('hay ids de criterio repetidos')

  return problemas
}

/**
 * Versión de la semilla de criterios. **Subirla es la única forma de forzar que
 * se vuelva a volcar**: cambiar `seeds/criterios_*.json` sin tocar este número
 * deja las bases ya sembradas con los textos antiguos.
 *
 * Existe porque volcar en cada arranque no era gratis: `bulkPut` dispara los
 * hooks `updating` de Dexie fila a fila aunque el contenido sea idéntico, y la
 * sincronización (§11) los lee como «el maestro ha cambiado algo». Resultado:
 * cada apertura de la app marcaba trabajo local sin subir y el segundo
 * dispositivo se encontraba un conflicto que nadie había provocado.
 */
export const VERSION_SEMILLA_CRITERIOS = 1

/**
 * Vuelca los criterios en la base, **solo si hace falta**: si la tabla ya está
 * sembrada con esta misma versión de semilla, no se escribe ni una fila.
 *
 * La validación sí corre siempre: es sobre los JSON del bundle, no toca la
 * base, y es la red que impide que una semilla degradada pase inadvertida.
 * Lanza `ErrorSemillaCriterios` si alguna de las dos no valida: quien llama
 * decide cómo enseñarlo, pero nunca en silencio.
 */
export async function sembrarCriterios(): Promise<void> {
  const infantil = criteriosInfantil()
  const problemasInfantil = validarCriteriosInfantil(infantil)
  if (problemasInfantil.length > 0) throw new ErrorSemillaCriterios('infantil', problemasInfantil)

  const primaria = criteriosPrimaria()
  const problemas = validarCriteriosPrimaria(primaria)
  if (problemas.length > 0) throw new ErrorSemillaCriterios('primaria', problemas)

  // El recuento va aparte de la versión a propósito: una base restaurada de una
  // copia sin criterios, o vaciada a mano, trae la marca puesta y la tabla
  // vacía. Sin esta comprobación se quedaría sin criterios para siempre.
  const yaSembrada =
    (await leerConfig()).semillaCriterios === VERSION_SEMILLA_CRITERIOS &&
    (await db.criterios.count()) > 0
  if (yaSembrada) return

  // Nada de lo que se escribe aquí es trabajo del maestro: sale del bundle y es
  // idéntico en los dos dispositivos, así que no debe marcarse como cambio
  // pendiente de subir.
  await sinMarcar(async () => {
    await db.criterios.bulkPut([...infantil, ...primaria])

    // Los ids de Primaria cambiaron de 'PRI:2:1.1' al del propio decreto
    // ('EF.2C.1.1'). `bulkPut` no toca los antiguos, así que se barren aquí: si
    // no, los selectores enseñarían cada criterio dos veces.
    const vigentes = new Set(primaria.map((c) => c.id))
    const sobrantes = (await db.criterios.where('etapa').equals('primaria').toArray())
      .filter((c) => !vigentes.has(c.id))
      .map((c) => c.id)
    if (sobrantes.length > 0) await db.criterios.bulkDelete(sobrantes)

    // La marca, en la base y no en `localStorage`: así viaja dentro del backup
    // y una copia restaurada llega ya sembrada, en vez de resembrarse encima.
    await guardarConfig({ semillaCriterios: VERSION_SEMILLA_CRITERIOS })
  })
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
