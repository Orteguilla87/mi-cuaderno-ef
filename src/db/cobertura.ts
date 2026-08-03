/**
 * Informe de cobertura de criterios (§ Orden 130/2023: los criterios son el
 * referente, no una nota).
 *
 * La pregunta que responde no es «cuánto ha sacado» sino «qué he evaluado y qué
 * me queda». Por eso cuenta TODO instrumento que apunte a un criterio, incluidos
 * los de unidades que no computan y los que no tienen unidad: si se enseñó y se
 * evaluó, el criterio está cubierto, aunque su nota no llegue al boletín.
 *
 * La vista es por ciclo y no por curso, porque el Decreto 61/2022 define los
 * criterios por ciclo: lo que se cubra en 3º cuenta para el ciclo de 3º y 4º.
 */

import { cicloDeCurso } from '../lib/ciclos'
import { califica, notaFila, type Instrumento } from '../lib/notas'
import { valorNormalizado } from './cuaderno'
import { db } from './db'
import type { Criterio, TipoColumna, ValorCelda } from './types'

/** Un instrumento que evalúa un criterio, con el contexto para reconocerlo. */
export interface UsoDelCriterio {
  columnaId: string
  titulo: string
  tipo: TipoColumna
  descriptor: string
  grupo: string
  curso: number
  unidad: string | null
  /** Falso si no da nota, si su unidad no computa o si no tiene unidad. */
  calificable: boolean
  /** Notas obtenidas por los alumnos en esa fila, sobre 10. */
  notas: number[]
}

export interface CoberturaCriterio {
  criterio: Criterio
  usos: UsoDelCriterio[]
}

/**
 * Cobertura de todos los criterios de un ciclo, acumulando sus dos cursos.
 *
 * Los criterios sin ningún uso salen igualmente, con la lista vacía: son
 * justamente los que hay que ver, y omitirlos convertiría el informe en una
 * lista de lo ya hecho en vez de en un mapa de lo que falta.
 */
export async function coberturaDelCiclo(ciclo: 1 | 2 | 3): Promise<CoberturaCriterio[]> {
  const criterios = (
    await db.criterios.where('[etapa+ciclo]').equals(['primaria', ciclo]).toArray()
  ).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))

  const grupos = (await db.grupos.toArray()).filter(
    (g) => g.etapa === 'primaria' && cicloDeCurso(g.nivel) === ciclo,
  )
  const porGrupo = new Map(grupos.map((g) => [g.id, g]))
  if (grupos.length === 0) return criterios.map((criterio) => ({ criterio, usos: [] }))

  const columnas = (await db.columnas.toArray()).filter((c) => porGrupo.has(c.grupoId))
  const columnaPorId = new Map(columnas.map((c) => [c.id, c]))
  const ids = columnas.map((c) => c.id)

  const filas = ids.length ? await db.filas.where('columnaId').anyOf(ids).toArray() : []
  const unidades = new Map((await db.unidades.toArray()).map((u) => [u.id, u]))
  const rubricas = new Map((await db.rubricas.toArray()).map((r) => [r.id, r]))

  const valoresPorColumna = new Map<string, ValorCelda[]>()
  for (const v of ids.length ? await db.valores.where('columnaId').anyOf(ids).toArray() : []) {
    const lista = valoresPorColumna.get(v.columnaId) ?? []
    lista.push(v)
    valoresPorColumna.set(v.columnaId, lista)
  }

  const usosPorCriterio = new Map<string, UsoDelCriterio[]>()
  for (const fila of filas) {
    if (!fila.criterioId) continue
    const columna = columnaPorId.get(fila.columnaId)
    const grupo = columna ? porGrupo.get(columna.grupoId) : undefined
    if (!columna || !grupo) continue

    const unidad = columna.udId ? unidades.get(columna.udId) : undefined
    // Instrumento de una sola fila: aquí interesa lo que ha dado ESTA fila, no
    // la nota del instrumento entero. Se reutiliza `notaFila` del motor para no
    // inventar aquí una segunda forma de leer una celda.
    const instrumento: Instrumento = {
      columna,
      filas: [fila],
      rubrica: columna.rubricaId ? rubricas.get(columna.rubricaId) : undefined,
    }

    const uso: UsoDelCriterio = {
      columnaId: columna.id,
      titulo: columna.titulo,
      tipo: columna.tipo,
      descriptor: fila.descriptor,
      grupo: grupo.nombre,
      curso: grupo.nivel,
      unidad: unidad?.titulo ?? null,
      calificable: califica(columna) && !!unidad?.computa,
      notas: (valoresPorColumna.get(columna.id) ?? [])
        .map((v) => notaFila(instrumento, fila, v, valorNormalizado))
        .filter((n): n is number => n !== null),
    }

    const lista = usosPorCriterio.get(fila.criterioId) ?? []
    lista.push(uso)
    usosPorCriterio.set(fila.criterioId, lista)
  }

  return criterios.map((criterio) => ({
    criterio,
    usos: (usosPorCriterio.get(criterio.id) ?? []).sort(
      (a, b) => a.curso - b.curso || a.grupo.localeCompare(b.grupo, 'es'),
    ),
  }))
}

/** Ciclos que tienen algún grupo de Primaria, para poblar el selector. */
export async function ciclosConGrupos(): Promise<(1 | 2 | 3)[]> {
  const grupos = await db.grupos.toArray()
  const ciclos = new Set(
    grupos.filter((g) => g.etapa === 'primaria').map((g) => cicloDeCurso(g.nivel)),
  )
  return [1, 2, 3].filter((c): c is 1 | 2 | 3 => ciclos.has(c as 1 | 2 | 3))
}
