import { describe, expect, it } from 'vitest'
import { valorNormalizado } from '../db/cuaderno'
import type {
  Columna,
  FilaInstrumento,
  Rubrica,
  TipoColumna,
  UnidadDidactica,
  ValorCelda,
} from '../db/types'
import {
  calificacionOficial,
  notaInstrumento,
  notaTrimestre,
  notaUd,
  type Evaluable,
  type Instrumento,
} from './notas'

// ——————————————————————————— utillería ———————————————————————————

let n = 0
const id = () => `x${n++}`

function columna(datos: Partial<Columna> & { titulo: string; tipo: TipoColumna }): Columna {
  return {
    id: id(),
    grupoId: 'g1',
    trimestre: 1,
    orden: 0,
    pesoUd: 0,
    escala: datos.tipo === 'numero' ? { min: 0, max: 10, decimales: 1 } : undefined,
    ...datos,
  }
}

function unidad(datos: Partial<UnidadDidactica> & { titulo: string }): UnidadDidactica {
  return {
    id: id(),
    nivel: 3,
    trimestre: 1,
    criterios: [],
    computa: true,
    pesoTrimestre: 0,
    ...datos,
  }
}

function fila(columnaId: string, datos: Partial<FilaInstrumento> = {}): FilaInstrumento {
  return { id: id(), columnaId, orden: 0, descriptor: 'fila', criterioId: null, pesoFila: null, ...datos }
}

/** Instrumento de nota simple con su única fila implícita. */
function simple(titulo: string, pesoUd: number, tipo: TipoColumna = 'numero'): Instrumento {
  const c = columna({ titulo, tipo, pesoUd })
  return { columna: c, filas: [fila(c.id, { descriptor: titulo })] }
}

const nota = (columnaId: string, numero: number): ValorCelda => ({
  id: id(),
  columnaId,
  alumnoId: 'a1',
  numero,
  actualizado: 0,
})

const buscar = (valores: ValorCelda[]) => (columnaId: string) =>
  valores.find((v) => v.columnaId === columnaId)

const RUBRICA: Rubrica = {
  id: 'r1',
  titulo: 'Coreografía',
  niveles: [
    { id: 'n0', etiqueta: 'No conseguido', valor: 0 },
    { id: 'n1', etiqueta: 'En proceso', valor: 5 },
    { id: 'n2', etiqueta: 'Conseguido', valor: 10 },
  ],
  criterios: [
    { id: 'rc1', titulo: 'Ritmo', pesoPct: 0 },
    { id: 'rc2', titulo: 'Expresividad', pesoPct: 0 },
    { id: 'rc3', titulo: 'Coordinación', pesoPct: 0 },
  ],
}

function rubrica(titulo: string, pesoUd: number, pesos: (number | null)[]): Instrumento {
  const c = columna({ titulo, tipo: 'rubrica', pesoUd, rubricaId: RUBRICA.id })
  return {
    columna: c,
    rubrica: RUBRICA,
    filas: RUBRICA.criterios.map((cr, i) =>
      fila(c.id, { orden: i, descriptor: cr.titulo, pesoFila: pesos[i], criterioRubricaId: cr.id }),
    ),
  }
}

const valorRubrica = (columnaId: string, niveles: Record<string, string>): ValorCelda => ({
  id: id(),
  columnaId,
  alumnoId: 'a1',
  rubrica: niveles,
  actualizado: 0,
})

// ——————————————————————————— conversión oficial ———————————————————————————

describe('conversión a calificación oficial (Orden 130/2023, art. 19)', () => {
  it('convierte en los bordes exactos de cada banda', () => {
    // Los bordes son donde se juega el aprobado y donde un error de < o <= se
    // traduce en un boletín equivocado.
    expect(calificacionOficial(0)).toBe('IN')
    expect(calificacionOficial(4.99)).toBe('IN')
    expect(calificacionOficial(5)).toBe('SU')
    expect(calificacionOficial(5.99)).toBe('SU')
    expect(calificacionOficial(6)).toBe('BI')
    expect(calificacionOficial(6.99)).toBe('BI')
    expect(calificacionOficial(7)).toBe('NT')
    expect(calificacionOficial(8.99)).toBe('NT')
    expect(calificacionOficial(9)).toBe('SB')
    expect(calificacionOficial(10)).toBe('SB')
  })
})

// ——————————————————————————— instrumento ———————————————————————————

describe('notaInstrumento', () => {
  it('lleva la nota de una escala cualquiera a 0–10', () => {
    const c = columna({ titulo: 'Salto', tipo: 'numero', escala: { min: 0, max: 20, decimales: 1 } })
    const inst: Instrumento = { columna: c, filas: [fila(c.id)] }
    expect(notaInstrumento(inst, nota(c.id, 15), valorNormalizado).valor).toBe(7.5)
  })

  it('reparte a partes iguales las filas sin peso', () => {
    const inst = rubrica('Coreografía', 0, [null, null, null])
    const v = valorRubrica(inst.columna.id, { rc1: 'n2', rc2: 'n0', rc3: 'n1' })
    // (10 + 0 + 5) / 3
    expect(notaInstrumento(inst, v, valorNormalizado).valor).toBeCloseTo(5, 10)
  })

  it('renormaliza cuando faltan filas por valorar, sin contarlas como cero', () => {
    const inst = rubrica('Coreografía', 0, [null, null, null])
    const v = valorRubrica(inst.columna.id, { rc1: 'n2', rc2: 'n2' })
    const res = notaInstrumento(inst, v, valorNormalizado)

    // Dos dieces y una fila sin valorar dan un 10, no un 6,67: no hay evidencia
    // de que la tercera esté mal, solo de que no se ha evaluado.
    expect(res.valor).toBe(10)
    expect(res.log.filter((l) => l.motivo === 'sin_evidencia')).toHaveLength(1)
    expect(res.log.find((l) => l.motivo === 'renormalizado')?.detalle).toBe(
      '2 de 3 filas con evidencia',
    )
  })

  it('pondera por el peso de cada fila', () => {
    const inst = rubrica('Coreografía', 0, [80, 10, 10])
    const v = valorRubrica(inst.columna.id, { rc1: 'n2', rc2: 'n0', rc3: 'n0' })
    expect(notaInstrumento(inst, v, valorNormalizado).valor).toBeCloseTo(8, 10)
  })

  it('da a una fila sin peso el peso medio de sus hermanas, no un 1 suelto', () => {
    const inst = rubrica('Coreografía', 0, [70, 70, null])
    const v = valorRubrica(inst.columna.id, { rc1: 'n2', rc2: 'n2', rc3: 'n0' })
    // Con la fila sin peso valiendo 1, un 0 casi no se notaría (9,86). Valiendo
    // 70 como sus hermanas, el reparto es el que cualquiera esperaría.
    expect(notaInstrumento(inst, v, valorNormalizado).valor).toBeCloseTo(6.667, 3)
  })

  it('se queda sin nota si el alumno no tiene nada evaluado', () => {
    const inst = simple('Salto', 100)
    const res = notaInstrumento(inst, undefined, valorNormalizado)
    expect(res.valor).toBeNull()
    expect(res.log.some((l) => l.nivel === 'instrumento' && l.motivo === 'sin_evidencia')).toBe(true)
  })
})

// ——————————————————————————— unidad ———————————————————————————

describe('notaUd', () => {
  it('pondera los instrumentos por su peso en la unidad', () => {
    const a = simple('Prueba', 70)
    const b = simple('Actitud', 30)
    const ev: Evaluable = { unidad: unidad({ titulo: 'UD1' }), instrumentos: [a, b] }
    const valores = [nota(a.columna.id, 10), nota(b.columna.id, 5)]

    expect(notaUd(ev, buscar(valores), valorNormalizado).valor).toBeCloseTo(8.5, 10)
  })

  it('renormaliza sobre los instrumentos que el alumno sí tiene', () => {
    const a = simple('Prueba', 70)
    const b = simple('Actitud', 30)
    const ev: Evaluable = { unidad: unidad({ titulo: 'UD1' }), instrumentos: [a, b] }

    // Faltó el día de «Actitud»: la nota es la de «Prueba», no un 7 rebajado.
    expect(notaUd(ev, buscar([nota(a.columna.id, 10)]), valorNormalizado).valor).toBe(10)
  })

  it('deja fuera lo que no califica y las columnas de cálculo', () => {
    const bueno = simple('Prueba', 100)
    const texto = simple('Anotaciones', 100, 'texto')
    const contador = simple('Positivos', 100, 'positivo_negativo')
    const calculo = simple('Media UD', 100, 'calculo')
    const ev: Evaluable = {
      unidad: unidad({ titulo: 'UD1' }),
      instrumentos: [bueno, texto, contador, calculo],
    }

    const res = notaUd(ev, buscar([nota(bueno.columna.id, 6)]), valorNormalizado)
    expect(res.valor).toBe(6)
    expect(res.log.filter((l) => l.motivo === 'tipo_no_califica').map((l) => l.referencia)).toEqual([
      'Anotaciones',
      'Positivos',
    ])
    expect(res.log.filter((l) => l.motivo === 'es_calculo')).toHaveLength(1)
  })

  it('no da nota si ningún instrumento evaluado tiene peso', () => {
    // Columnas creadas y notas puestas, pero el reparto sin hacer: mejor decir
    // que falta repartir que inventarse una media que cambiará sola después.
    const a = simple('Prueba', 0)
    const ev: Evaluable = { unidad: unidad({ titulo: 'UD1' }), instrumentos: [a] }
    const res = notaUd(ev, buscar([nota(a.columna.id, 8)]), valorNormalizado)

    expect(res.valor).toBeNull()
    expect(res.log.some((l) => l.motivo === 'sin_pesos')).toBe(true)
  })
})

// ——————————————————————————— trimestre ———————————————————————————

describe('notaTrimestre', () => {
  function escenario() {
    const p1 = simple('Prueba', 60)
    const p2 = simple('Rúbrica', 40)
    const ud1: Evaluable = {
      unidad: unidad({ titulo: 'Habilidades', pesoTrimestre: 70 }),
      instrumentos: [p1, p2],
    }
    const p3 = simple('Cooperar', 100)
    const ud2: Evaluable = {
      unidad: unidad({ titulo: 'Cooperativos', pesoTrimestre: 30 }),
      instrumentos: [p3],
    }
    return { p1, p2, p3, ud1, ud2 }
  }

  it('sube la nota por los dos escalones y la convierte', () => {
    const { p1, p2, p3, ud1, ud2 } = escenario()
    const valores = [nota(p1.columna.id, 8), nota(p2.columna.id, 6), nota(p3.columna.id, 9)]

    const res = notaTrimestre([ud1, ud2], 1, buscar(valores), valorNormalizado)
    // ud1 = 8·0,6 + 6·0,4 = 7,2 · ud2 = 9 → 7,2·0,7 + 9·0,3 = 7,74
    expect(res.nota).toBeCloseTo(7.74, 10)
    expect(res.oficial).toBe('NT')
    expect(res.porUnidad.map((u) => [u.titulo, Number(u.nota.toFixed(2))])).toEqual([
      ['Habilidades', 7.2],
      ['Cooperativos', 9],
    ])
  })

  it('excluye la unidad sin ninguna evidencia y renormaliza el resto', () => {
    const { p1, p2, ud1, ud2 } = escenario()
    const valores = [nota(p1.columna.id, 8), nota(p2.columna.id, 6)]

    const res = notaTrimestre([ud1, ud2], 1, buscar(valores), valorNormalizado)
    // Sin nada de «Cooperativos», el trimestre es «Habilidades» entera.
    expect(res.nota).toBeCloseTo(7.2, 10)
    expect(res.porUnidad).toHaveLength(1)
  })

  it('no cuenta las unidades que no computan, sin trimestre o de otro trimestre', () => {
    const p1 = simple('Prueba', 100)
    const p2 = simple('Ambientación', 100)
    const p3 = simple('Convivencia', 100)
    const p4 = simple('Del segundo', 100)
    const valores = [
      nota(p1.columna.id, 5),
      nota(p2.columna.id, 10),
      nota(p3.columna.id, 10),
      nota(p4.columna.id, 10),
    ]

    const res = notaTrimestre(
      [
        { unidad: unidad({ titulo: 'Sí', pesoTrimestre: 100 }), instrumentos: [p1] },
        {
          unidad: unidad({ titulo: 'No computa', pesoTrimestre: 100, computa: false }),
          instrumentos: [p2],
        },
        {
          unidad: unidad({ titulo: 'Suelta', pesoTrimestre: 100, trimestre: null }),
          instrumentos: [p3],
        },
        {
          unidad: unidad({ titulo: 'Del 2.º', pesoTrimestre: 100, trimestre: 2 }),
          instrumentos: [p4],
        },
      ],
      1,
      buscar(valores),
      valorNormalizado,
    )

    expect(res.nota).toBe(5)
    expect(res.oficial).toBe('SU')
    expect(res.log.map((l) => l.motivo)).toContain('unidad_no_computa')
    expect(res.log.map((l) => l.motivo)).toContain('unidad_sin_trimestre')
  })

  it('descarta la unidad sin un solo instrumento calificable', () => {
    const soloTexto = simple('Anotaciones', 100, 'texto')
    const res = notaTrimestre(
      [{ unidad: unidad({ titulo: 'Expresión', pesoTrimestre: 100 }), instrumentos: [soloTexto] }],
      1,
      buscar([]),
      valorNormalizado,
    )
    expect(res.nota).toBeNull()
    expect(res.log.some((l) => l.motivo === 'unidad_sin_instrumentos')).toBe(true)
  })

  it('funciona con pesos que no suman 100, porque se normalizan', () => {
    const a = simple('A', 100)
    const b = simple('B', 100)
    const valores = [nota(a.columna.id, 10), nota(b.columna.id, 0)]

    // 40 y 40 no suman 100, pero pesan lo mismo: la nota es la media.
    const res = notaTrimestre(
      [
        { unidad: unidad({ titulo: 'A', pesoTrimestre: 40 }), instrumentos: [a] },
        { unidad: unidad({ titulo: 'B', pesoTrimestre: 40 }), instrumentos: [b] },
      ],
      1,
      buscar(valores),
      valorNormalizado,
    )
    expect(res.nota).toBe(5)
  })

  it('ignora el instrumento huérfano: sin unidad no hay por dónde entrar', () => {
    const dentro = simple('Prueba', 100)
    const huerfano = simple('Suelta', 100)
    const valores = [nota(dentro.columna.id, 4), nota(huerfano.columna.id, 10)]

    // El huérfano no aparece en ningún `Evaluable`, que es justo lo que hace
    // `datosCalificacion`: solo agrupa columnas con `udId`.
    const res = notaTrimestre(
      [{ unidad: unidad({ titulo: 'UD1', pesoTrimestre: 100 }), instrumentos: [dentro] }],
      1,
      buscar(valores),
      valorNormalizado,
    )
    expect(res.nota).toBe(4)
    expect(res.oficial).toBe('IN')
  })

  it('se queda sin nota si el trimestre no tiene los pesos repartidos', () => {
    const a = simple('A', 100)
    const res = notaTrimestre(
      [{ unidad: unidad({ titulo: 'A', pesoTrimestre: 0 }), instrumentos: [a] }],
      1,
      buscar([nota(a.columna.id, 8)]),
      valorNormalizado,
    )
    expect(res.nota).toBeNull()
    expect(res.oficial).toBeNull()
    expect(res.log.some((l) => l.motivo === 'sin_pesos')).toBe(true)
  })

  it('no da nota cuando el alumno no tiene absolutamente nada', () => {
    const { ud1, ud2 } = escenario()
    const res = notaTrimestre([ud1, ud2], 1, buscar([]), valorNormalizado)
    expect(res.nota).toBeNull()
    expect(res.oficial).toBeNull()
    expect(res.porUnidad).toEqual([])
  })
})
