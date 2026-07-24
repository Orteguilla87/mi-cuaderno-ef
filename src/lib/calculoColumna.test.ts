import { describe, expect, it } from 'vitest'
import { calcularColumna } from '../db/cuaderno'
import type { Columna, Rubrica, ValorCelda } from '../db/types'

/**
 * Motor de columnas calculadas (§5 M5, fórmulas). Lógica pura: se prueba con
 * mapas en memoria, sin tocar Dexie.
 */

const SIN_RUBRICAS = new Map<string, Rubrica>()

function columna(parcial: Partial<Columna> & Pick<Columna, 'id' | 'tipo'>): Columna {
  return {
    grupoId: 'g',
    trimestre: 1,
    titulo: parcial.id,
    orden: 0,
    ...parcial,
  } as Columna
}

function mapaColumnas(...cols: Columna[]): Map<string, Columna> {
  return new Map(cols.map((c) => [c.id, c]))
}

function valor(columnaId: string, alumnoId: string, campos: Partial<ValorCelda>): ValorCelda {
  return { id: `${columnaId}-${alumnoId}`, columnaId, alumnoId, actualizado: 0, ...campos }
}

function mapaValores(...vs: ValorCelda[]): Map<string, ValorCelda> {
  return new Map(vs.map((v) => [`${v.columnaId}|${v.alumnoId}`, v]))
}

describe('calcularColumna', () => {
  it('media ponderada de columnas de tipos distintos, normalizadas a 0–10', () => {
    const num = columna({ id: 'n', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const car = columna({ id: 'c', tipo: 'caritas', caritas: 3 })
    const calc = columna({
      id: 'calc',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'n', pesoPct: 50 }, { columnaId: 'c', pesoPct: 50 }] },
    })

    // num = 8/10 → 8; carita 2 de 3 (índice 2/2) → 10.  Media 50/50 = 9.
    const valores = mapaValores(
      valor('n', 'a', { numero: 8 }),
      valor('c', 'a', { carita: 2 }),
    )
    const r = calcularColumna(calc, mapaColumnas(num, car, calc), valores, 'a', SIN_RUBRICAS)
    expect(r.valor).toBeCloseTo(9)
    expect(r).toMatchObject({ contadas: 2, total: 2 })
  })

  it('pesos que no suman 100 se reparten proporcionalmente', () => {
    const a = columna({ id: 'a', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const b = columna({ id: 'b', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const calc = columna({
      id: 'calc',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'a', pesoPct: 30 }, { columnaId: 'b', pesoPct: 10 }] },
    })
    // a=10 (peso 30), b=2 (peso 10) → (10*30 + 2*10)/40 = 8.
    const valores = mapaValores(valor('a', 'x', { numero: 10 }), valor('b', 'x', { numero: 2 }))
    expect(calcularColumna(calc, mapaColumnas(a, b, calc), valores, 'x', SIN_RUBRICAS).valor).toBeCloseTo(8)
  })

  it('con todos los pesos a 0, los componentes pesan por igual', () => {
    const a = columna({ id: 'a', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const b = columna({ id: 'b', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const calc = columna({
      id: 'calc',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'a', pesoPct: 0 }, { columnaId: 'b', pesoPct: 0 }] },
    })
    const valores = mapaValores(valor('a', 'x', { numero: 4 }), valor('b', 'x', { numero: 6 }))
    expect(calcularColumna(calc, mapaColumnas(a, b, calc), valores, 'x', SIN_RUBRICAS).valor).toBeCloseTo(5)
  })

  it('una nota ausente excluye ese componente y renormaliza el resto', () => {
    const a = columna({ id: 'a', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const b = columna({ id: 'b', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const calc = columna({
      id: 'calc',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'a', pesoPct: 50 }, { columnaId: 'b', pesoPct: 50 }] },
    })
    // Solo a=7; b sin nota → media = 7, no 3,5.
    const valores = mapaValores(valor('a', 'x', { numero: 7 }))
    const r = calcularColumna(calc, mapaColumnas(a, b, calc), valores, 'x', SIN_RUBRICAS)
    expect(r.valor).toBeCloseTo(7)
    expect(r).toMatchObject({ contadas: 1, total: 2 })
  })

  it('sin ninguna nota, el valor es null', () => {
    const a = columna({ id: 'a', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const calc = columna({
      id: 'calc',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'a', pesoPct: 100 }] },
    })
    const r = calcularColumna(calc, mapaColumnas(a, calc), new Map(), 'x', SIN_RUBRICAS)
    expect(r.valor).toBeNull()
    expect(r).toMatchObject({ contadas: 0, total: 1 })
  })

  it('encadena una columna de cálculo dentro de otra', () => {
    const a = columna({ id: 'a', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const b = columna({ id: 'b', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    // calc1 = media de a,b.  calc2 = media de calc1 y c.
    const calc1 = columna({
      id: 'calc1',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'a', pesoPct: 50 }, { columnaId: 'b', pesoPct: 50 }] },
    })
    const c = columna({ id: 'c', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const calc2 = columna({
      id: 'calc2',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'calc1', pesoPct: 50 }, { columnaId: 'c', pesoPct: 50 }] },
    })
    // a=6, b=10 → calc1=8.  c=4 → calc2 = (8+4)/2 = 6.
    const valores = mapaValores(
      valor('a', 'x', { numero: 6 }),
      valor('b', 'x', { numero: 10 }),
      valor('c', 'x', { numero: 4 }),
    )
    const cols = mapaColumnas(a, b, c, calc1, calc2)
    expect(calcularColumna(calc2, cols, valores, 'x', SIN_RUBRICAS).valor).toBeCloseTo(6)
  })

  it('una referencia circular devuelve null en vez de colgar', () => {
    // A depende de B y B depende de A.
    const calcA = columna({
      id: 'A',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'B', pesoPct: 100 }] },
    })
    const calcB = columna({
      id: 'B',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'A', pesoPct: 100 }] },
    })
    const r = calcularColumna(calcA, mapaColumnas(calcA, calcB), new Map(), 'x', SIN_RUBRICAS)
    expect(r.valor).toBeNull()
  })

  it('memoiza: un componente compartido no se recalcula por rama', () => {
    const base = columna({
      id: 'base',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'n', pesoPct: 100 }] },
    })
    const n = columna({ id: 'n', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const top = columna({
      id: 'top',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'base', pesoPct: 50 }, { columnaId: 'base', pesoPct: 50 }] },
    })
    const memo = new Map()
    const valores = mapaValores(valor('n', 'x', { numero: 9 }))
    const r = calcularColumna(top, mapaColumnas(base, n, top), valores, 'x', SIN_RUBRICAS, memo)
    expect(r.valor).toBeCloseTo(9)
    // base·x quedó memoizado tras la primera rama.
    expect(memo.has('base|x')).toBe(true)
  })
})
