import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearColumna } from './cuaderno'
import { db } from './db'
import { asignarCriterio, filasDe, sincronizarFilasConRubrica } from './filas'
import type { Rubrica } from './types'

const RUBRICA: Rubrica = {
  id: 'r1',
  titulo: 'Coreografía',
  niveles: [
    { id: 'n1', etiqueta: 'No conseguido', valor: 2 },
    { id: 'n2', etiqueta: 'Conseguido', valor: 10 },
  ],
  criterios: [
    { id: 'rc1', titulo: 'Ritmo', pesoPct: 50 },
    { id: 'rc2', titulo: 'Expresividad', pesoPct: 50 },
  ],
}

beforeEach(async () => {
  await db.rubricas.put(RUBRICA)
  await db.unidades.put({
    id: 'ud1',
    nivel: 3,
    trimestre: 1,
    titulo: 'Expresión corporal',
    criterios: ['EF.2C.4.5'],
    computa: true,
    pesoTrimestre: 100,
  })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('filas de un instrumento', () => {
  it('da una sola fila a un instrumento de nota única', async () => {
    const id = await crearColumna({
      grupoId: 'g1',
      trimestre: 1,
      titulo: 'Salto de altura',
      tipo: 'numero',
    })
    const filas = await filasDe(id)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ descriptor: 'Salto de altura', criterioId: null, pesoFila: null })
  })

  it('da a una rúbrica una fila por criterio, con su peso', async () => {
    const id = await crearColumna({
      grupoId: 'g1',
      trimestre: 1,
      titulo: 'Coreografía',
      tipo: 'rubrica',
      rubricaId: 'r1',
    })
    const filas = await filasDe(id)
    expect(filas.map((f) => [f.descriptor, f.pesoFila, f.criterioRubricaId])).toEqual([
      ['Ritmo', 50, 'rc1'],
      ['Expresividad', 50, 'rc2'],
    ])
  })

  it('conserva criterio y peso al reconciliar con una rúbrica editada', async () => {
    const id = await crearColumna({
      grupoId: 'g1',
      trimestre: 1,
      titulo: 'Coreografía',
      tipo: 'rubrica',
      rubricaId: 'r1',
      udId: 'ud1',
    })
    const [ritmo] = await filasDe(id)
    await asignarCriterio(ritmo.id, 'EF.2C.4.5')
    await db.filas.update(ritmo.id, { pesoFila: 70 })

    // La rúbrica pierde «Expresividad» y gana «Coordinación».
    await db.rubricas.update('r1', {
      criterios: [
        { id: 'rc1', titulo: 'Ritmo y pulso', pesoPct: 50 },
        { id: 'rc3', titulo: 'Coordinación', pesoPct: 50 },
      ],
    })
    await sincronizarFilasConRubrica(id)

    const filas = await filasDe(id)
    expect(filas).toHaveLength(2)
    // La fila que sobrevive mantiene lo que se asignó en la columna y toma el
    // descriptor nuevo del banco: el criterio y el peso son de aquí, el texto no.
    expect(filas[0]).toMatchObject({
      id: ritmo.id,
      descriptor: 'Ritmo y pulso',
      criterioId: 'EF.2C.4.5',
      pesoFila: 70,
    })
    expect(filas[1]).toMatchObject({ descriptor: 'Coordinación', criterioId: null, pesoFila: 50 })
  })

  it('añade a la unidad el criterio que no tenía, y lo quita al deshacer', async () => {
    const id = await crearColumna({
      grupoId: 'g1',
      trimestre: 1,
      titulo: 'Salto',
      tipo: 'numero',
      udId: 'ud1',
    })
    const [fila] = await filasDe(id)

    const { anadidoALaUnidad, deshacer } = await asignarCriterio(fila.id, 'EF.2C.2.3')
    expect(anadidoALaUnidad).toBe('Expresión corporal')
    expect((await db.unidades.get('ud1'))!.criterios).toEqual(['EF.2C.4.5', 'EF.2C.2.3'])

    await deshacer()
    expect((await db.unidades.get('ud1'))!.criterios).toEqual(['EF.2C.4.5'])
    expect((await db.filas.get(fila.id))!.criterioId).toBeNull()
  })

  it('no toca la unidad cuando el criterio ya estaba declarado', async () => {
    const id = await crearColumna({
      grupoId: 'g1',
      trimestre: 1,
      titulo: 'Salto',
      tipo: 'numero',
      udId: 'ud1',
    })
    const [fila] = await filasDe(id)

    const { anadidoALaUnidad } = await asignarCriterio(fila.id, 'EF.2C.4.5')
    expect(anadidoALaUnidad).toBeUndefined()
    expect((await db.unidades.get('ud1'))!.criterios).toEqual(['EF.2C.4.5'])
  })
})
