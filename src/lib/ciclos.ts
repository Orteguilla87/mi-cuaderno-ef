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
 * Id de un criterio de Primaria a partir de su ciclo y su código.
 *
 * El código no basta como identidad: «1.1» existe en los tres ciclos con textos
 * distintos (46 criterios, solo 17 códigos únicos). El id lleva el ciclo dentro
 * y es el mismo que trae el JSON del decreto.
 */
export function idCriterioPrimaria(ciclo: 1 | 2 | 3, codigo: string): string {
  return `EF.${ciclo}C.${codigo}`
}
