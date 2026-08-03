import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { coberturaDelCiclo } from './cobertura'
import { sembrarCriterios } from './criterios'
import { db } from './db'

/**
 * La cobertura responde a «qué he evaluado y qué me queda», no a «cuánto han
 * sacado». De ahí que cuente cosas que el motor de notas descarta.
 */
beforeEach(async () => {
  await sembrarCriterios()
  await db.grupos.bulkPut([
    { id: 'g3a', cursoEscolarId: 'c', nombre: '3ºA', etapa: 'primaria', nivel: 3, color: '#006A80', orden: 0, horario: [] },
    { id: 'g4b', cursoEscolarId: 'c', nombre: '4ºB', etapa: 'primaria', nivel: 4, color: '#006A80', orden: 1, horario: [] },
    { id: 'g5a', cursoEscolarId: 'c', nombre: '5ºA', etapa: 'primaria', nivel: 5, color: '#006A80', orden: 2, horario: [] },
  ])
  await db.unidades.bulkPut([
    { id: 'ud1', nivel: 3, trimestre: 1, titulo: 'Cuenta', criterios: [], computa: true, pesoTrimestre: 100 },
    { id: 'ud2', nivel: 4, trimestre: 1, titulo: 'No cuenta', criterios: [], computa: false, pesoTrimestre: 0 },
  ])
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

async function columnaConFila(datos: {
  id: string
  grupoId: string
  titulo: string
  tipo: 'numero' | 'texto'
  udId?: string
  criterioId: string
}) {
  await db.columnas.put({
    id: datos.id,
    grupoId: datos.grupoId,
    trimestre: 1,
    titulo: datos.titulo,
    tipo: datos.tipo,
    orden: 0,
    pesoUd: 100,
    udId: datos.udId,
    escala: datos.tipo === 'numero' ? { min: 0, max: 10, decimales: 1 } : undefined,
  })
  await db.filas.put({
    id: `f-${datos.id}`,
    columnaId: datos.id,
    orden: 0,
    descriptor: datos.titulo,
    criterioId: datos.criterioId,
    pesoFila: null,
  })
}

describe('coberturaDelCiclo', () => {
  it('devuelve los 16 criterios del 2.º ciclo, cubiertos o no', async () => {
    const cobertura = await coberturaDelCiclo(2)
    expect(cobertura).toHaveLength(16)
    // Los que faltan tienen que aparecer: el informe es un mapa de lo que queda,
    // no una lista de lo ya hecho.
    expect(cobertura.every((c) => c.usos.length === 0)).toBe(true)
  })

  it('acumula los dos cursos del ciclo', async () => {
    await columnaConFila({ id: 'c1', grupoId: 'g3a', titulo: 'De 3º', tipo: 'numero', udId: 'ud1', criterioId: 'EF.2C.2.3' })
    await columnaConFila({ id: 'c2', grupoId: 'g4b', titulo: 'De 4º', tipo: 'numero', udId: 'ud2', criterioId: 'EF.2C.2.3' })

    const usos = (await coberturaDelCiclo(2)).find((c) => c.criterio.codigo === '2.3')!.usos
    expect(usos.map((u) => [u.curso, u.grupo])).toEqual([
      [3, '3ºA'],
      [4, '4ºB'],
    ])
  })

  it('cuenta como cobertura lo que no califica, y lo marca', async () => {
    // Un instrumento de una unidad que no computa, otro sin unidad y otro de
    // tipo texto: los tres se enseñaron, así que los tres cubren.
    await columnaConFila({ id: 'c1', grupoId: 'g4b', titulo: 'No computa', tipo: 'numero', udId: 'ud2', criterioId: 'EF.2C.4.3' })
    await columnaConFila({ id: 'c2', grupoId: 'g3a', titulo: 'Sin unidad', tipo: 'numero', criterioId: 'EF.2C.4.3' })
    await columnaConFila({ id: 'c3', grupoId: 'g3a', titulo: 'Anotaciones', tipo: 'texto', udId: 'ud1', criterioId: 'EF.2C.4.3' })
    await columnaConFila({ id: 'c4', grupoId: 'g3a', titulo: 'Prueba', tipo: 'numero', udId: 'ud1', criterioId: 'EF.2C.4.3' })

    const usos = (await coberturaDelCiclo(2)).find((c) => c.criterio.codigo === '4.3')!.usos
    expect(usos).toHaveLength(4)
    expect(usos.filter((u) => u.calificable).map((u) => u.titulo)).toEqual(['Prueba'])
  })

  it('no mezcla ciclos: un grupo de 5º no cubre criterios de 2.º ciclo', async () => {
    await columnaConFila({ id: 'c1', grupoId: 'g5a', titulo: 'De 5º', tipo: 'numero', criterioId: 'EF.3C.2.3' })

    expect((await coberturaDelCiclo(2)).every((c) => c.usos.length === 0)).toBe(true)
    const tercero = (await coberturaDelCiclo(3)).find((c) => c.criterio.codigo === '2.3')!
    expect(tercero.usos.map((u) => u.grupo)).toEqual(['5ºA'])
  })

  it('recoge las notas obtenidas en cada fila', async () => {
    await columnaConFila({ id: 'c1', grupoId: 'g3a', titulo: 'Prueba', tipo: 'numero', udId: 'ud1', criterioId: 'EF.2C.2.3' })
    await db.valores.bulkPut([
      { id: 'v1', columnaId: 'c1', alumnoId: 'a1', numero: 8, actualizado: 0 },
      { id: 'v2', columnaId: 'c1', alumnoId: 'a2', numero: 4, actualizado: 0 },
      { id: 'v3', columnaId: 'c1', alumnoId: 'a3', actualizado: 0 },
    ])

    const [uso] = (await coberturaDelCiclo(2)).find((c) => c.criterio.codigo === '2.3')!.usos
    // La celda vacía no cuenta como un 0: no hay nota, no hay dato.
    expect(uso.notas.sort()).toEqual([4, 8])
  })

  it('sin grupos del ciclo devuelve los criterios sin uso, no una lista vacía', async () => {
    await db.grupos.clear()
    const cobertura = await coberturaDelCiclo(1)
    expect(cobertura).toHaveLength(14)
    expect(cobertura.every((c) => c.usos.length === 0)).toBe(true)
  })
})
