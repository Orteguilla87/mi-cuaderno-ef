import { describe, expect, it } from 'vitest'
import {
  aCantidad,
  avisosMaterial,
  filtrar,
  limpiarOpcionales,
  normalizarNombre,
  ordenarMateriales,
  textoCantidad,
} from './inventario'
import type { Material } from '../db/types'

function material(parcial: Partial<Material>): Material {
  return {
    id: parcial.nombre ?? 'id',
    nombre: 'X',
    nombreNormalizado: 'x',
    etiquetaIds: [],
    creadoEn: 0,
    actualizadoEn: 0,
    ...parcial,
  }
}

describe('normalizarNombre', () => {
  it('iguala mayúsculas, tildes y espacios de sobra', () => {
    expect(normalizarNombre('  Aros   Grandes ')).toBe('aros grandes')
    expect(normalizarNombre('ARO')).toBe(normalizarNombre('aro'))
    expect(normalizarNombre('Balón')).toBe('balon')
  })
})

describe('limpiarOpcionales — la ausencia tiene que seguir siendo ausencia', () => {
  it('borra la clave en vez de rellenarla con 0, null o cadena vacía', () => {
    const limpio = limpiarOpcionales({
      nombre: 'Conos',
      cantidad: undefined,
      estado: undefined,
      ubicacion: '',
      notas: null,
    })
    expect('cantidad' in limpio).toBe(false)
    expect('estado' in limpio).toBe(false)
    expect('ubicacion' in limpio).toBe(false)
    expect('notas' in limpio).toBe(false)
    expect(limpio.nombre).toBe('Conos')
  })

  it('conserva el cero que el usuario ha escrito de verdad', () => {
    const limpio = limpiarOpcionales({ cantidad: 0, cantidadInservible: 0 })
    expect(limpio.cantidad).toBe(0)
    expect(limpio.cantidadInservible).toBe(0)
  })

  it('sobrevive al viaje de ida y vuelta por JSON del backup', () => {
    const ida = limpiarOpcionales({ nombre: 'Picas', cantidad: undefined })
    const vuelta = JSON.parse(JSON.stringify(ida))
    expect('cantidad' in vuelta).toBe(false)
  })
})

describe('aCantidad', () => {
  it('deja el campo vacío como ausente, nunca como cero', () => {
    expect(aCantidad('')).toBeUndefined()
    expect(aCantidad('   ')).toBeUndefined()
    expect(aCantidad('no sé')).toBeUndefined()
    expect(aCantidad('-3')).toBeUndefined()
  })

  it('lee enteros y redondea decimales', () => {
    expect(aCantidad('12')).toBe(12)
    expect(aCantidad('0')).toBe(0)
    expect(aCantidad('12,4')).toBe(12)
  })
})

describe('textoCantidad', () => {
  it('no pinta nada cuando no hay cantidad', () => {
    expect(textoCantidad({ cantidad: undefined, cantidadInservible: undefined })).toBe('')
  })

  it('añade los inservibles solo si los hay', () => {
    expect(textoCantidad({ cantidad: 12, cantidadInservible: undefined })).toBe('12')
    expect(textoCantidad({ cantidad: 12, cantidadInservible: 0 })).toBe('12')
    expect(textoCantidad({ cantidad: 12, cantidadInservible: 2 })).toBe('12 (2 inservibles)')
    expect(textoCantidad({ cantidad: 12, cantidadInservible: 1 })).toBe('12 (1 inservible)')
  })

  it('cero unidades es un dato, y se enseña', () => {
    expect(textoCantidad({ cantidad: 0, cantidadInservible: undefined })).toBe('0')
  })
})

describe('ordenarMateriales', () => {
  const conos = material({ nombre: 'Conos', cantidad: 30, estado: 'bueno' })
  const aros = material({ nombre: 'Aros', cantidad: 5, estado: 'malo' })
  const picas = material({ nombre: 'Picas' }) // sin cantidad ni estado

  it('alfabético con collation española', () => {
    expect(ordenarMateriales([conos, picas, aros], 'alfabetico').map((m) => m.nombre)).toEqual([
      'Aros',
      'Conos',
      'Picas',
    ])
  })

  it('por cantidad, y lo no contado al final (no como si fuese cero)', () => {
    expect(ordenarMateriales([aros, picas, conos], 'cantidad').map((m) => m.nombre)).toEqual([
      'Conos',
      'Aros',
      'Picas',
    ])
  })

  it('por estado, y lo que no consta al final', () => {
    expect(ordenarMateriales([picas, aros, conos], 'estado').map((m) => m.nombre)).toEqual([
      'Conos',
      'Aros',
      'Picas',
    ])
  })
})

describe('filtrar', () => {
  const pequeno = material({ nombre: 'Aros', etiquetaIds: ['a'], estado: 'bueno' })
  const ambos = material({ nombre: 'Conos', etiquetaIds: ['a', 'b'], estado: 'malo' })
  const sinEstado = material({ nombre: 'Picas', etiquetaIds: ['b'] })

  it('las etiquetas van en AND, no en OR', () => {
    const r = filtrar([pequeno, ambos, sinEstado], { etiquetaIds: ['a', 'b'], estados: [] })
    expect(r.map((m) => m.nombre)).toEqual(['Conos'])
  })

  it('filtrar por estado deja fuera lo que no tiene estado', () => {
    const r = filtrar([pequeno, ambos, sinEstado], { etiquetaIds: [], estados: ['bueno', 'malo'] })
    expect(r.map((m) => m.nombre)).toEqual(['Aros', 'Conos'])
  })
})

describe('avisosMaterial — avisar, nunca bloquear', () => {
  it('avisa de más inservibles que unidades', () => {
    expect(avisosMaterial({ cantidad: 3, cantidadInservible: 5 })).toHaveLength(1)
  })

  it('avisa de inservibles sin cantidad total', () => {
    expect(avisosMaterial({ cantidadInservible: 2 })).toHaveLength(1)
  })

  it('no dice nada cuando no hay cantidades', () => {
    expect(avisosMaterial({})).toEqual([])
  })
})
