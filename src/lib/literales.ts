/**
 * Terminología curricular por etapa, en un solo sitio.
 *
 * Infantil y Primaria no se llaman igual, y no es cuestión de estilo: el
 * Decreto 36/2022 habla de «situación de aprendizaje» y de «contenidos», y el
 * 61/2022 de «unidad didáctica» y de «saberes básicos». Escribir «Unidad
 * Didáctica» en una pantalla de Infantil es un error de nomenclatura legal, no
 * una errata.
 *
 * Por eso ningún componente escribe estos rótulos a mano: los pide aquí a
 * partir de la etapa del grupo. `literales.test.ts` comprueba que no se cuelen
 * literales sueltos en ninguna vista.
 *
 * Módulo puro: no importa `db` ni React, para que lo puedan usar por igual la
 * UI, los informes y las exportaciones.
 */

import type { Etapa } from '../db/types'

export interface Terminologia {
  /** «Unidad didáctica» · «Situación de aprendizaje». Para títulos y etiquetas. */
  unidad: string
  /** El mismo, en minúscula, para meterlo dentro de una frase. */
  unidadEnFrase: string
  /** «Unidades didácticas» · «Situaciones de aprendizaje». */
  unidadPlural: string
  unidadPluralEnFrase: string
  /** Rótulo del botón de alta. */
  nuevaUnidad: string
  /** «Saberes básicos» · «Contenidos». */
  contenidos: string
  /** Común a las dos etapas, pero se pide aquí para no repartir el vocabulario. */
  criterios: string
  competencias: string
}

const PRIMARIA: Terminologia = {
  unidad: 'Unidad didáctica',
  unidadEnFrase: 'unidad didáctica',
  unidadPlural: 'Unidades didácticas',
  unidadPluralEnFrase: 'unidades didácticas',
  nuevaUnidad: 'Nueva unidad didáctica',
  contenidos: 'Saberes básicos',
  criterios: 'Criterios de evaluación',
  competencias: 'Competencias específicas',
}

const INFANTIL: Terminologia = {
  unidad: 'Situación de aprendizaje',
  unidadEnFrase: 'situación de aprendizaje',
  unidadPlural: 'Situaciones de aprendizaje',
  unidadPluralEnFrase: 'situaciones de aprendizaje',
  nuevaUnidad: 'Nueva situación de aprendizaje',
  contenidos: 'Contenidos',
  criterios: 'Criterios de evaluación',
  competencias: 'Competencias específicas',
}

export function terminologia(etapa: Etapa): Terminologia {
  return etapa === 'infantil' ? INFANTIL : PRIMARIA
}

/**
 * A qué alcanza una unidad, en palabras: sus cursos en Primaria y el ciclo
 * entero en Infantil, donde los criterios del Decreto 36/2022 son los mismos
 * para 3, 4 y 5 años y no hay programación por edad.
 *
 * Una unidad puede abarcar varios cursos del mismo ciclo, así que la lista se
 * resume en una frase legible: «3.º», «3.º y 4.º», «1.º, 2.º y 3.º».
 */
export function ambitoUnidad(etapa: Etapa, niveles: number[]): string {
  if (etapa === 'infantil') return '2.º ciclo'
  const cursos = [...niveles].sort((a, b) => a - b).map((n) => `${n}º`)
  if (cursos.length === 0) return 'sin curso'
  if (cursos.length === 1) return cursos[0]
  return `${cursos.slice(0, -1).join(', ')} y ${cursos[cursos.length - 1]}`
}
