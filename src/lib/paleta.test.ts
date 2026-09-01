import { describe, expect, it } from 'vitest'
import {
  COLOR_POR_DEFECTO,
  PALETA,
  aLab,
  aRgb,
  colorPorId,
  contraste,
  distancia,
  idMasCercano,
  normalizarColor,
} from './paleta'

/**
 * La paleta no se da por buena: se mide.
 *
 * Un color de dato puede acabar siendo un punto de 8 px al lado de un nombre, y
 * ahí no hay texto que rescate al que no lo distingue. Estas pruebas fijan las
 * tres cosas que tienen que cumplirse siempre, y son las que hay que volver a
 * pasar al tocar un solo tono o al reordenar la cuadrícula.
 */

/** Los fondos reales de la app: `--bg` y `--night-bg` de `styles/tokens.css`. */
const FONDO_CLARO = '#F3F3EC'
const FONDO_OSCURO = '#062830'

/**
 * 3:1 es el umbral de WCAG 1.4.11 para objetos gráficos y componentes de
 * interfaz, que es exactamente lo que es una muestra de color o un punto —no
 * texto, donde harían falta 4,5:1.
 */
const CONTRASTE_MINIMO = 3

/**
 * Simulación de dicromatismo (Viénot, Brettel y Mollon, 1999) sobre RGB lineal.
 * Es la aproximación estándar y basta de sobra para lo que se pregunta aquí: si
 * dos colores colapsan en el mismo, no si el tono resultante es exacto.
 */
const MATRICES = {
  protanopia: [
    [0.11238, 0.88762, 0],
    [0.11238, 0.88762, 0],
    [0.00401, -0.00401, 1],
  ],
  deuteranopia: [
    [0.29275, 0.70725, 0],
    [0.29275, 0.70725, 0],
    [-0.02234, 0.02234, 1],
  ],
} as const

type Matriz = readonly (readonly number[])[]

function simular(hex: string, matriz: Matriz): string {
  const lineal = aRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const salida = matriz.map((fila) => fila.reduce((n, m, i) => n + m * lineal[i], 0))
  const aByte = (v: number) => {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return '#' + salida.map(aByte).join('')
}

/** ΔE bajo la simulación: cuánto se siguen distinguiendo dos colores. */
function distanciaDicromatica(a: string, b: string, matriz: Matriz): number {
  return distancia(simular(a, matriz), simular(b, matriz))
}

const SIMULACIONES = Object.entries(MATRICES) as [string, Matriz][]
const TEMAS = [
  { tema: 'claro' as const, fondo: FONDO_CLARO },
  { tema: 'oscuro' as const, fondo: FONDO_OSCURO },
]

describe('estructura de la paleta', () => {
  it('tiene alrededor de 24 colores, todos con id único', () => {
    expect(PALETA.length).toBeGreaterThanOrEqual(20)
    expect(PALETA.length).toBeLessThanOrEqual(28)
    expect(new Set(PALETA.map((c) => c.id)).size).toBe(PALETA.length)
  })

  it('cada entrada trae nombre legible y dos valores en hexadecimal', () => {
    for (const c of PALETA) {
      expect(c.nombre.trim().length, c.id).toBeGreaterThan(2)
      expect(c.claro, c.id).toMatch(/^#[0-9A-F]{6}$/)
      expect(c.oscuro, c.id).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('los cinco tokens de §3.1 están en la paleta', () => {
    const valores = new Set(PALETA.flatMap((c) => [c.claro, c.oscuro]))
    for (const token of ['#006A80', '#CE184B', '#ABB200', '#F3F3EC', '#9AC3CC']) {
      expect(valores.has(token), `falta el token ${token}`).toBe(true)
    }
  })
})

describe('contraste sobre los dos fondos de la app', () => {
  for (const { tema, fondo } of TEMAS) {
    it(`todos los valores del tema ${tema} llegan a ${CONTRASTE_MINIMO}:1`, () => {
      const flojos = PALETA.filter((c) => contraste(c[tema], fondo) < CONTRASTE_MINIMO).map(
        (c) => `${c.id} (${contraste(c[tema], fondo).toFixed(2)}:1)`,
      )
      expect(flojos, `sobre ${fondo}`).toEqual([])
    })
  }
})

describe('daltonismo rojo-verde', () => {
  const ROJOS = PALETA.filter((c) => c.id.startsWith('carmin-'))
  const VERDES = PALETA.filter((c) => c.id.startsWith('lima-') || c.id.startsWith('verde-'))

  it('hay familia roja y familia verde que comprobar', () => {
    expect(ROJOS.length).toBeGreaterThan(1)
    expect(VERDES.length).toBeGreaterThan(1)
  })

  /**
   * Ningún par rojo/verde puede quedar a merced del color: bajo protanopia y
   * deuteranopia los dos tiran a ocre, así que lo único que los separa es la
   * claridad. 10 de ΔE es una diferencia que se ve, no una que se supone.
   */
  for (const [nombre, matriz] of SIMULACIONES) {
    for (const { tema } of TEMAS) {
      it(`bajo ${nombre}, ningún rojo se confunde con un verde (tema ${tema})`, () => {
        const cerca: string[] = []
        for (const r of ROJOS) {
          for (const v of VERDES) {
            const d = distanciaDicromatica(r[tema], v[tema], matriz)
            if (d < 10) cerca.push(`${r.id} / ${v.id} (dE ${d.toFixed(1)})`)
          }
        }
        expect(cerca).toEqual([])
      })
    }
  }
})

describe('muestras contiguas de la cuadrícula', () => {
  /**
   * El orden de `PALETA` es el de la cuadrícula del selector. Dos muestras
   * pegadas que se ven iguales convierten elegir color en adivinar.
   */
  for (const [nombre, matriz] of SIMULACIONES) {
    for (const { tema } of TEMAS) {
      it(`se distinguen bajo ${nombre} (tema ${tema})`, () => {
        const cerca: string[] = []
        for (let i = 1; i < PALETA.length; i++) {
          const d = distanciaDicromatica(PALETA[i - 1][tema], PALETA[i][tema], matriz)
          if (d < 6) cerca.push(`${PALETA[i - 1].id} / ${PALETA[i].id} (dE ${d.toFixed(1)})`)
        }
        expect(cerca).toEqual([])
      })
    }
  }
})

describe('migración desde un hex suelto', () => {
  it('cada color de la paleta se resuelve a sí mismo', () => {
    for (const c of PALETA) expect(idMasCercano(c.claro), c.id).toBe(c.id)
  })

  it('los hex que hoy están guardados caen en un color razonable', () => {
    // Los seis colores de grupo de antes de la paleta y los cuatro de peto.
    expect(idMasCercano('#006A80')).toBe('teal-500')
    expect(idMasCercano('#CE184B')).toBe('carmin-500')
    expect(idMasCercano('#00505F')).toBe('teal-700')
    expect(idMasCercano('#7F8500')).toBe('lima-300')
    expect(colorPorId(idMasCercano('#9AC3CC'))).toBeDefined()
    expect(colorPorId(idMasCercano('#B48C00'))).toBeDefined()
  })

  it('es idempotente: migrar dos veces no mueve nada', () => {
    for (const hex of ['#006A80', '#CE184B', '#ABB200', '#9AC3CC', '#B48C00', '#123456']) {
      const una = normalizarColor(hex)
      expect(normalizarColor(una)).toBe(una)
      expect(normalizarColor(normalizarColor(una))).toBe(una)
    }
  })

  it('un valor ausente o ilegible cae en el color por defecto', () => {
    expect(normalizarColor(undefined)).toBe(COLOR_POR_DEFECTO)
    expect(normalizarColor('')).toBe(COLOR_POR_DEFECTO)
    expect(idMasCercano('rojo')).toBe(COLOR_POR_DEFECTO)
  })

  it('colorPorId no inventa colores', () => {
    expect(colorPorId('no-existe')).toBeUndefined()
    expect(colorPorId(undefined)).toBeUndefined()
    expect(colorPorId('teal-500')?.claro).toBe('#006A80')
  })
})

describe('utilidades de color', () => {
  it('el contraste es simétrico y el blanco sobre negro da 21:1', () => {
    expect(contraste('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('Lab sitúa el blanco en L* 100', () => {
    expect(aLab('#FFFFFF')[0]).toBeCloseTo(100, 0)
  })
})
