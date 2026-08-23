/**
 * Ciclos de Primaria e identidad de los criterios del Decreto 61/2022.
 *
 * Vive aparte de `db/criterios.ts` porque lo necesitan las migraciones de
 * `db/db.ts` y `db/backup.ts`, y estas no pueden importar nada que a su vez
 * importe `db` sin montar un ciclo de imports. Es puro y no toca la base.
 */

/** Ciclo de Primaria (1–3) al que pertenece un curso (1–6). */
export function cicloDeCurso(curso: number): 1 | 2 | 3 {
  if (curso <= 2) return 1
  if (curso <= 4) return 2
  return 3
}

/**
 * Ciclo de una unidad a partir de los cursos que abarca.
 *
 * Todos sus cursos comparten ciclo —es la regla dura del multi-curso—, así que
 * basta con el primero. Devuelve `null` si no hay ninguno o si son de Infantil
 * (`NIVEL_CICLO_INFANTIL`, que no es un curso de Primaria): ahí no hay ciclo de
 * Primaria del que hablar.
 */
export function cicloDeUnidad(niveles: number[]): 1 | 2 | 3 | null {
  const primero = niveles[0]
  if (primero === undefined || primero < 1) return null
  return cicloDeCurso(primero)
}

/**
 * Id de un criterio de Primaria a partir de su ciclo y su código.
 *
 * El código no basta como identidad: «1.1» existe en los tres ciclos con textos
 * distintos (46 criterios, solo 17 códigos únicos). El id lleva el ciclo dentro
 * y es el mismo que trae el JSON del decreto.
 */
export function idCriterioPrimaria(ciclo: 1 | 2 | 3, codigo: string): string {
  return `EF.${ciclo}C.${codigo}`
}

/**
 * «1.er ciclo», «2.º ciclo», «3.er ciclo». La abreviatura del ordinal en
 * español depende del número: «primer» y «tercer» se apocopan, «segundo» no.
 */
export function ordinalCiclo(ciclo: 1 | 2 | 3): string {
  return ciclo === 2 ? '2.º' : `${ciclo}.er`
}
