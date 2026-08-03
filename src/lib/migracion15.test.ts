import { describe, expect, it } from 'vitest'
import { crearFilasDeColumnas, migrarColumnas, migrarUnidades } from './migracion15'

/**
 * La migración al esquema 15 es la única que CREA registros: sin la fila de
 * cada instrumento, todo lo evaluado antes de la v15 se quedaría sin evidencia
 * y daría nota vacía. Se prueba aquí, sobre filas sueltas, porque la aplican
 * tanto el `upgrade()` de Dexie como la restauración de un backup antiguo.
 */

let n = 0
const id = () => `x${n++}`

describe('migrarUnidades', () => {
  it('pone los valores por defecto sin tocar lo que ya venía', () => {
    const unidades = [
      { id: 'a', nivel: 3, trimestre: 2, titulo: 'Vieja', criterios: [] },
      { id: 'b', nivel: 3, trimestre: 1, titulo: 'Ya migrada', criterios: [], computa: false, pesoTrimestre: 40 },
    ]
    migrarUnidades(unidades)

    // Todo lo existente sigue contando: cambiar el modelo no puede sacar una
    // unidad de la nota sin que nadie lo haya pedido.
    expect(unidades[0]).toMatchObject({ computa: true, pesoTrimestre: 0, trimestre: 2 })
    expect(unidades[1]).toMatchObject({ computa: false, pesoTrimestre: 40 })
  })

  it('convierte los códigos de criterio en ids con su ciclo', () => {
    const unidades = [
      { id: 'a', nivel: 1, trimestre: 1, titulo: '1º', criterios: ['1.1', '3.2'] },
      { id: 'b', nivel: 5, trimestre: 1, titulo: '5º', criterios: ['1.1'] },
      { id: 'c', nivel: 3, trimestre: 1, titulo: 'Ya con id', criterios: ['EF.2C.1.1'] },
    ]
    migrarUnidades(unidades)

    // El mismo «1.1» de 1º y de 5º son criterios distintos, y ahora se nota.
    expect(unidades[0].criterios).toEqual(['EF.1C.1.1', 'EF.1C.3.2'])
    expect(unidades[1].criterios).toEqual(['EF.3C.1.1'])
    expect(unidades[2].criterios).toEqual(['EF.2C.1.1'])
  })
})

describe('migrarColumnas', () => {
  it('deja el peso a 0, que es «aún sin repartir»', () => {
    const columnas = [{ id: 'a', titulo: 'Salto' }, { id: 'b', titulo: 'Con peso', pesoUd: 60 }]
    migrarColumnas(columnas)
    expect(columnas[0].pesoUd).toBe(0)
    expect(columnas[1].pesoUd).toBe(60)
  })
})

describe('crearFilasDeColumnas', () => {
  const grupos = [
    { id: 'g3', nivel: 3 },
    { id: 'g6', nivel: 6 },
  ]

  it('da una fila a cada instrumento simple, con su criterio resuelto', () => {
    const columnas = [
      { id: 'c1', grupoId: 'g3', titulo: 'Salto', tipo: 'numero', criterioCodigo: '2.3' },
      { id: 'c2', grupoId: 'g6', titulo: 'Salto', tipo: 'numero', criterioCodigo: '2.3' },
      { id: 'c3', grupoId: 'g3', titulo: 'Sin criterio', tipo: 'si_no' },
    ]
    const filas = crearFilasDeColumnas(columnas, grupos, [], id)

    expect(filas).toHaveLength(3)
    // El mismo código en dos cursos de ciclos distintos resuelve a criterios
    // distintos, que es justo lo que el modelo viejo no sabía distinguir.
    expect(filas[0]).toMatchObject({ columnaId: 'c1', descriptor: 'Salto', criterioId: 'EF.2C.2.3', pesoFila: null })
    expect(filas[1]).toMatchObject({ columnaId: 'c2', criterioId: 'EF.3C.2.3' })
    expect(filas[2]).toMatchObject({ columnaId: 'c3', criterioId: null })
  })

  it('da a una rúbrica una fila por criterio, con su peso y su enlace', () => {
    const rubricas = [
      {
        id: 'r1',
        criterios: [
          { id: 'rc1', titulo: 'Ritmo', pesoPct: 60 },
          { id: 'rc2', titulo: 'Expresividad', pesoPct: 40 },
          { id: 'rc3', titulo: 'Sin peso', pesoPct: 0 },
        ],
      },
    ]
    const columnas = [
      { id: 'c1', grupoId: 'g3', titulo: 'Coreografía', tipo: 'rubrica', rubricaId: 'r1', criterioCodigo: '4.5' },
    ]
    const filas = crearFilasDeColumnas(columnas, grupos, rubricas, id)

    expect(filas.map((f) => [f.descriptor, f.pesoFila, f.criterioRubricaId])).toEqual([
      ['Ritmo', 60, 'rc1'],
      ['Expresividad', 40, 'rc2'],
      // Un pesoPct de 0 pasa a null: en el modelo viejo significaba «sin
      // decidir», y ahí el 0 explícito quiere decir «que no cuente».
      ['Sin peso', null, 'rc3'],
    ])
    // El criterio heredado cae en la primera fila; el resto quedan por asignar,
    // porque repartirlo a las tres sería inventarse la trazabilidad.
    expect(filas.map((f) => f.criterioId)).toEqual(['EF.2C.4.5', null, null])
  })

  it('trata como simple la columna de rúbrica cuya rúbrica ya no existe', () => {
    const columnas = [{ id: 'c1', grupoId: 'g3', titulo: 'Huérfana', tipo: 'rubrica', rubricaId: 'perdida' }]
    const filas = crearFilasDeColumnas(columnas, grupos, [], id)
    // Una fila sola es mejor que ninguna: la columna sigue existiendo y hay que
    // poder evaluarla y trazarla igual.
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ descriptor: 'Huérfana' })
    expect(filas[0]).not.toHaveProperty('criterioRubricaId')
  })

  it('no revienta con una columna cuyo grupo ya no está', () => {
    const columnas = [{ id: 'c1', grupoId: 'borrado', titulo: 'Suelta', tipo: 'numero', criterioCodigo: '1.1' }]
    const filas = crearFilasDeColumnas(columnas, grupos, [], id)
    expect(filas).toHaveLength(1)
    expect(filas[0].criterioId).toBe('EF.1C.1.1')
  })
})
