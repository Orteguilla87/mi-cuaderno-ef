/**
 * Consultas del motor de notas: reúne de Dexie lo que `lib/notas.ts` necesita y
 * lo invoca. Toda la aritmética vive allí, pura; aquí solo se lee.
 */

import {
  notaTrimestre,
  type Evaluable,
  type Instrumento,
  type ResultadoTrimestre,
} from '../lib/notas'
import { valorNormalizado } from './cuaderno'
import { db } from './db'
import { filasPorColumna } from './filas'
import type { Trimestre, ValorCelda } from './types'

/**
 * Todo lo que hace falta para calificar un grupo en un trimestre, en una sola
 * lectura. Se saca de golpe porque la rejilla lo recalcula para los ~25 alumnos
 * a la vez y una consulta por alumno sería absurda.
 */
export interface DatosCalificacion {
  evaluables: Evaluable[]
  valores: Map<string, ValorCelda>
}

export async function datosCalificacion(
  grupoId: string,
  trimestre: Trimestre,
): Promise<DatosCalificacion> {
  const grupo = await db.grupos.get(grupoId)
  if (!grupo) return { evaluables: [], valores: new Map() }

  const columnas = await db.columnas
    .where('[grupoId+trimestre]')
    .equals([grupoId, trimestre])
    .toArray()

  const filas = await filasPorColumna(columnas.map((c) => c.id))
  const rubricas = new Map((await db.rubricas.toArray()).map((r) => [r.id, r]))

  // Las unidades son del curso, no del grupo: 3ºA y 3ºB comparten programación.
  const unidades = await db.unidades.where('nivel').equals(grupo.nivel).toArray()

  const evaluables: Evaluable[] = unidades.map((unidad) => ({
    unidad,
    instrumentos: columnas
      .filter((c) => c.udId === unidad.id)
      .map<Instrumento>((columna) => ({
        columna,
        filas: filas.get(columna.id) ?? [],
        rubrica: columna.rubricaId ? rubricas.get(columna.rubricaId) : undefined,
      })),
  }))

  const listaValores = columnas.length
    ? await db.valores.where('columnaId').anyOf(columnas.map((c) => c.id)).toArray()
    : []

  return {
    evaluables,
    valores: new Map(listaValores.map((v) => [`${v.columnaId}|${v.alumnoId}`, v])),
  }
}

/** Nota de trimestre de un alumno a partir de unos datos ya leídos. */
export function calificarAlumno(
  datos: DatosCalificacion,
  alumnoId: string,
  trimestre: Trimestre,
): ResultadoTrimestre {
  return notaTrimestre(
    datos.evaluables,
    trimestre,
    (columnaId) => datos.valores.get(`${columnaId}|${alumnoId}`),
    valorNormalizado,
  )
}

/** Nota de trimestre de todo un grupo, indexada por alumno. */
export async function calificarGrupo(
  grupoId: string,
  trimestre: Trimestre,
): Promise<Map<string, ResultadoTrimestre>> {
  const datos = await datosCalificacion(grupoId, trimestre)
  // Se filtra en memoria, no por el índice `[grupoId+activo]`: IndexedDB no
  // admite booleanos como clave, así que ese índice no contiene nada. Es lo que
  // hace el resto del cuaderno.
  const alumnos = (await db.alumnos.where('grupoId').equals(grupoId).toArray()).filter(
    (a) => a.activo,
  )
  return new Map(alumnos.map((a) => [a.id, calificarAlumno(datos, a.id, trimestre)]))
}
