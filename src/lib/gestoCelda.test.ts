import { beforeEach, describe, expect, it } from 'vitest'
import { crearGestoCelda } from './gestoCelda'

/**
 * El gesto de la nota de celda, evento a evento y con un reloj falso: el
 * proyecto no tiene entorno DOM de test, así que la decisión vive en una
 * función pura y la tabla solo le pasa los eventos (`pages/Cuaderno.tsx`).
 */

type Celda = string

let pendiente: (() => void) | null
let notas: Celda[]
let menus: { celda: Celda; x: number; y: number }[]

function gesto() {
  return crearGestoCelda<Celda>({
    onNota: (c) => notas.push(c),
    onMenu: (celda, x, y) => menus.push({ celda, x, y }),
    programar: (fn) => {
      pendiente = fn
      return 1
    },
    cancelar: () => {
      pendiente = null
    },
  })
}

/** Deja pasar los 500 ms: dispara el temporizador si sigue vivo. */
const pasaElTiempo = () => {
  const fn = pendiente
  pendiente = null
  fn?.()
}

const dedo = { pointerType: 'touch', button: 0, x: 100, y: 100 }
const raton = { pointerType: 'mouse', button: 0, x: 100, y: 100 }

beforeEach(() => {
  pendiente = null
  notas = []
  menus = []
})

describe('móvil: pulsación larga', () => {
  it('abre la nota de esa celda y se traga el click de rebote', () => {
    const g = gesto()
    g.abajo('c1|a1', dedo)
    pasaElTiempo()
    g.soltar()
    expect(notas).toEqual(['c1|a1'])
    // El click que manda el navegador al soltar NO llega a la celda: no marca
    // la lista de control ni suma un positivo.
    expect(g.click()).toBe(true)
    // …y solo ese: el siguiente toque normal pasa.
    expect(g.click()).toBe(false)
  })

  it('un toque corto no abre nada y su click pasa', () => {
    const g = gesto()
    g.abajo('c1|a1', dedo)
    g.soltar()
    pasaElTiempo()
    expect(notas).toEqual([])
    expect(g.click()).toBe(false)
  })

  it('arrastrar para desplazar la rejilla cancela la pulsación', () => {
    const g = gesto()
    g.abajo('c1|a1', dedo)
    g.mover({ x: 100, y: 130 })
    pasaElTiempo()
    expect(notas).toEqual([])
  })

  it('un temblor de unos píxeles no la cancela', () => {
    const g = gesto()
    g.abajo('c1|a1', dedo)
    g.mover({ x: 104, y: 103 })
    pasaElTiempo()
    expect(notas).toEqual(['c1|a1'])
  })

  it('si el navegador se queda el gesto (pointercancel), no se abre', () => {
    const g = gesto()
    g.abajo('c1|a1', dedo)
    g.soltar()
    pasaElTiempo()
    expect(notas).toEqual([])
  })

  it('el contextmenu de Android tras la pulsación no abre además el menú', () => {
    const g = gesto()
    g.abajo('c1|a1', dedo)
    expect(g.menuContextual('c1|a1', 100, 100)).toBe(true)
    pasaElTiempo()
    expect(menus).toEqual([])
    expect(notas).toEqual(['c1|a1'])
  })
})

describe('escritorio: clic derecho', () => {
  it('abre el menú propio en la posición del ratón y suprime el del navegador', () => {
    const g = gesto()
    g.abajo('c2|a3', { ...raton, button: 2 })
    expect(g.menuContextual('c2|a3', 640, 320)).toBe(true)
    expect(menus).toEqual([{ celda: 'c2|a3', x: 640, y: 320 }])
    expect(notas).toEqual([])
  })

  it('mantener el botón izquierdo no abre la nota', () => {
    const g = gesto()
    g.abajo('c1|a1', raton)
    pasaElTiempo()
    g.soltar()
    expect(notas).toEqual([])
    expect(g.click()).toBe(false)
  })

  it('la tecla de menú (sin puntero previo) también abre el menú', () => {
    const g = gesto()
    g.menuContextual('c1|a1', 10, 10)
    expect(menus).toHaveLength(1)
  })
})
