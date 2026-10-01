import { describe, expect, it } from 'vitest'
import {
  columnaVecina,
  decidirTecla,
  modoEntradaNota,
  normalizarEntradaNota,
  notaDeTexto,
  textoDeNota,
  type EscalaNota,
  type TeclaNota,
} from './entradaNota'

const DIEZ: EscalaNota = { min: 0, max: 10, decimales: 1 }
const tecla = (key: string, extra: Partial<TeclaNota> = {}): TeclaNota => ({
  key,
  shiftKey: false,
  cursorInicio: false,
  cursorFin: true,
  ...extra,
})

describe('normalizarEntradaNota', () => {
  it('coma y punto decimales son equivalentes', () => {
    expect(normalizarEntradaNota('7.5', DIEZ)).toBe('7,5')
    expect(normalizarEntradaNota('7,5', DIEZ)).toBe('7,5')
    expect(normalizarEntradaNota(',5', DIEZ)).toBe('0,5')
  })

  it('rechaza caracteres no válidos sin aceptar nada (quien llama conserva lo escrito)', () => {
    expect(normalizarEntradaNota('7a', DIEZ)).toBeNull()
    expect(normalizarEntradaNota('7,5,', DIEZ)).toBeNull()
    expect(normalizarEntradaNota('-1', DIEZ)).toBeNull()
  })

  it('respeta máximo y decimales de la escala', () => {
    expect(normalizarEntradaNota('10', DIEZ)).toBe('10')
    expect(normalizarEntradaNota('12', DIEZ)).toBeNull()
    expect(normalizarEntradaNota('7,55', DIEZ)).toBeNull()
    expect(normalizarEntradaNota('7,', { min: 0, max: 10, decimales: 0 })).toBeNull()
  })
})

describe('decidirTecla', () => {
  it('escribir un número y pulsar Enter lo guarda y avanza', () => {
    const d = decidirTecla(tecla('Enter'), { texto: '7,5', valorPrevio: undefined, escala: DIEZ })
    expect(d).toEqual({ guardar: { numero: 7.5 }, destino: { tipo: 'avanzar' } })
  })

  it('Enter sin cambios no vuelve a escribir, pero avanza igual', () => {
    const d = decidirTecla(tecla('Enter'), { texto: '8', valorPrevio: 8, escala: DIEZ })
    expect(d).toEqual({ destino: { tipo: 'avanzar' } })
  })

  it('Tab guarda y pasa a la columna siguiente; Mayús+Tab a la anterior', () => {
    expect(decidirTecla(tecla('Tab'), { texto: '6', valorPrevio: 4, escala: DIEZ })).toEqual({
      guardar: { numero: 6 },
      destino: { tipo: 'columna', delta: 1 },
    })
    expect(
      decidirTecla(tecla('Tab', { shiftKey: true }), { texto: '', valorPrevio: 4, escala: DIEZ }),
    ).toEqual({ destino: { tipo: 'columna', delta: -1 } })
  })

  it('flechas: arriba/abajo entre alumnos; izquierda/derecha solo en el extremo o vacío', () => {
    const estado = { texto: '75', valorPrevio: undefined, escala: { ...DIEZ, max: 100 } }
    expect(decidirTecla(tecla('ArrowDown'), estado)?.destino).toEqual({ tipo: 'alumno', delta: 1 })
    expect(decidirTecla(tecla('ArrowUp'), estado)?.destino).toEqual({ tipo: 'alumno', delta: -1 })
    expect(decidirTecla(tecla('ArrowRight', { cursorFin: false }), estado)).toBeNull()
    expect(decidirTecla(tecla('ArrowRight'), estado)?.destino).toEqual({ tipo: 'columna', delta: 1 })
    expect(decidirTecla(tecla('ArrowLeft', { cursorFin: false }), estado)).toBeNull()
    expect(
      decidirTecla(tecla('ArrowLeft', { cursorInicio: true }), estado)?.destino,
    ).toEqual({ tipo: 'columna', delta: -1 })
  })

  it('Escape cierra sin guardar: la celda conserva el valor anterior', () => {
    const d = decidirTecla(tecla('Escape'), { texto: '3', valorPrevio: 9, escala: DIEZ })
    expect(d).toEqual({ destino: { tipo: 'cerrar' } })
  })

  it('borrar sobre el campo vacío deja la celda SIN DATO, no a cero', () => {
    for (const key of ['Backspace', 'Delete']) {
      const d = decidirTecla(tecla(key), { texto: '', valorPrevio: 6, escala: DIEZ })
      expect(d?.guardar).toEqual({ numero: undefined })
      expect(d?.guardar?.numero).not.toBe(0)
    }
  })

  it('borrar con texto lo procesa el propio campo', () => {
    expect(decidirTecla(tecla('Backspace'), { texto: '6', valorPrevio: 6, escala: DIEZ })).toBeNull()
  })

  it('los dígitos no son navegación', () => {
    expect(decidirTecla(tecla('7'), { texto: '', valorPrevio: undefined, escala: DIEZ })).toBeNull()
  })
})

describe('notaDeTexto y textoDeNota', () => {
  it('acota a la escala y redondea', () => {
    expect(notaDeTexto('7,', DIEZ)).toBe(7)
    expect(notaDeTexto('0', { min: 1, max: 10, decimales: 0 })).toBe(1)
    expect(notaDeTexto('', DIEZ)).toBeNull()
    expect(textoDeNota(7.5)).toBe('7,5')
    expect(textoDeNota(undefined)).toBe('')
  })
})

describe('columnaVecina', () => {
  const cols = [
    { id: 'a', tipo: 'numero' },
    { id: 'b', tipo: 'si_no' },
    { id: 'c', tipo: 'numero' },
  ]
  it('salta columnas que no son de nota y no da la vuelta', () => {
    expect(columnaVecina(cols, 'a', 1)?.id).toBe('c')
    expect(columnaVecina(cols, 'c', -1)?.id).toBe('a')
    expect(columnaVecina(cols, 'c', 1)).toBeNull()
  })
})

describe('modoEntradaNota', () => {
  it('el móvil conserva el teclado en pantalla y no levanta el del sistema', () => {
    expect(modoEntradaNota(true)).toEqual({ inputMode: 'none', tecladoPantalla: true })
  })
  it('en escritorio el teclado en pantalla va plegado y el campo acepta el físico', () => {
    expect(modoEntradaNota(false)).toEqual({ inputMode: 'decimal', tecladoPantalla: false })
  })
})
