/**
 * Migración al esquema 15 — calificación por unidades didácticas (Orden
 * 130/2023, art. 6).
 *
 * Vive aquí, en funciones puras sobre filas sueltas, porque hacen falta en dos
 * sitios que no se pueden llamar entre sí: el `upgrade()` de Dexie
 * (`db/db.ts`, sobre la base local) y la migración espejo de los backups
 * (`db/backup.ts`, sobre un JSON recién descifrado). Escribirla dos veces sería
 * garantizar que un día divergen.
 */

import { cicloDeCurso, idCriterioPrimaria } from './ciclos'

type Fila = Record<string, unknown>

/**
 * Unidades: pasan a tener `computa`, `pesoTrimestre` y `trimestre` anulable, y
 * sus criterios dejan de ser códigos para ser ids.
 *
 * Todo lo existente entra con `computa: true` y `pesoTrimestre: 0`: la unidad
 * sigue ahí y sigue contando, simplemente aún no tiene peso repartido. Poner 0
 * y avisar es preferible a inventar un reparto que el usuario no ha decidido.
 */
export function migrarUnidades(unidades: Fila[]): void {
  for (const u of unidades) {
    u.computa ??= true
    u.pesoTrimestre ??= 0
    u.trimestre ??= null

    const ciclo = cicloDeCurso(Number(u.nivel) || 1)
    const criterios = Array.isArray(u.criterios) ? (u.criterios as string[]) : []
    // Los ids del decreto ya empiezan por 'EF.'; lo demás son códigos sueltos
    // ('1.1') que solo cobran identidad al añadirles su ciclo.
    u.criterios = criterios.map((c) => (c.startsWith('EF.') ? c : idCriterioPrimaria(ciclo, c)))
  }
}

/** Columnas: peso dentro de su unidad, a 0 por el mismo motivo que arriba. */
export function migrarColumnas(columnas: Fila[]): void {
  for (const c of columnas) c.pesoUd ??= 0
}

/**
 * Crea la fila (o filas) de cada columna existente. Sin esto, un instrumento
 * anterior a la v15 no tendría de dónde sacar evidencia y daría nota nula.
 *
 * - Columna normal → una sola fila implícita, con el título de la columna como
 *   descriptor y su `criterioCodigo` heredado ya resuelto a id.
 * - Columna de rúbrica → una fila espejo por criterio de la rúbrica, con su
 *   peso. El `criterioCodigo` heredado, si lo había, cae en la primera fila; el
 *   resto quedan sin criterio para que el usuario los asigne, porque adivinarlo
 *   sería inventarse la trazabilidad.
 */
export function crearFilasDeColumnas(
  columnas: Fila[],
  grupos: Fila[],
  rubricas: Fila[],
  nuevoId: () => string,
): Fila[] {
  const nivelPorGrupo = new Map(grupos.map((g) => [String(g.id), Number(g.nivel) || 1]))
  const rubricaPorId = new Map(rubricas.map((r) => [String(r.id), r]))
  const filas: Fila[] = []

  for (const columna of columnas) {
    const nivel = nivelPorGrupo.get(String(columna.grupoId)) ?? 1
    const codigo = typeof columna.criterioCodigo === 'string' ? columna.criterioCodigo : null
    const criterioId = codigo ? idCriterioPrimaria(cicloDeCurso(nivel), codigo) : null

    const rubrica = columna.tipo === 'rubrica' ? rubricaPorId.get(String(columna.rubricaId)) : undefined
    const criteriosRubrica = Array.isArray(rubrica?.criterios) ? (rubrica.criterios as Fila[]) : []

    if (criteriosRubrica.length === 0) {
      filas.push({
        id: nuevoId(),
        columnaId: columna.id,
        orden: 0,
        descriptor: String(columna.titulo ?? ''),
        criterioId,
        pesoFila: null,
      })
      continue
    }

    criteriosRubrica.forEach((cr, i) => {
      const peso = Number(cr.pesoPct)
      filas.push({
        id: nuevoId(),
        columnaId: columna.id,
        orden: i,
        descriptor: String(cr.titulo ?? ''),
        criterioId: i === 0 ? criterioId : null,
        pesoFila: Number.isFinite(peso) && peso > 0 ? peso : null,
        criterioRubricaId: cr.id,
      })
    })
  }

  return filas
}
