import { describe, expect, it } from 'vitest'
import { parsearTablaRubrica } from './rubricaTabla'

describe('parsearTablaRubrica', () => {
  it('detecta tabulador y calcula valores en progresión par sin cabecera explícita', () => {
    const texto = [
      'Criterio\tNo conseguido\tEn proceso\tConseguido',
      'Equilibrio\tSe cae\tDuda\tFirme',
      'Salto\tNo salta\tCon ayuda\tSolo',
    ].join('\n')

    const r = parsearTablaRubrica(texto)

    expect(r.niveles.map((n) => n.etiqueta)).toEqual(['No conseguido', 'En proceso', 'Conseguido'])
    expect(r.niveles.map((n) => n.valor)).toEqual([3, 7, 10])
    expect(r.criterios).toHaveLength(2)
    expect(r.criterios[0]).toEqual({
      titulo: 'Equilibrio',
      descripciones: ['Se cae', 'Duda', 'Firme'],
    })
  })

  it('respeta valores explícitos con "Etiqueta:valor" y CSV con comas', () => {
    const texto = [
      'Criterio,Bajo:2,Medio:6,Alto:10',
      'Fuerza,Poca,Media,Mucha',
    ].join('\n')

    const r = parsearTablaRubrica(texto)

    expect(r.niveles).toEqual([
      { etiqueta: 'Bajo', valor: 2 },
      { etiqueta: 'Medio', valor: 6 },
      { etiqueta: 'Alto', valor: 10 },
    ])
    expect(r.criterios[0].descripciones).toEqual(['Poca', 'Media', 'Mucha'])
  })

  it('lanza un error si falta la fila de niveles o de criterios', () => {
    expect(() => parsearTablaRubrica('Criterio,Bajo,Alto')).toThrow()
    expect(() => parsearTablaRubrica('')).toThrow()
  })
})
