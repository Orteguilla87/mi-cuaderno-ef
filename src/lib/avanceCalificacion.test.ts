import { describe, expect, it } from 'vitest'
import {
  anteriorEnRubrica,
  progresoRubrica,
  trasMarcarColumna,
  trasMarcarRubrica,
} from './avanceCalificacion'

const DIMS = { filas: 3, criterios: 4 }
const activo = (modo: 'criterio' | 'alumno') => ({ activo: true, modo })

describe('avance en rúbricas', () => {
  it('«siguiente criterio» avanza dentro del MISMO alumno', () => {
    expect(trasMarcarRubrica({ fila: 1, criterio: 0 }, DIMS, activo('criterio'))).toEqual({
      tipo: 'ir',
      a: { fila: 1, criterio: 1 },
    })
  })

  it('«siguiente alumno» avanza al MISMO criterio del siguiente', () => {
    expect(trasMarcarRubrica({ fila: 0, criterio: 2 }, DIMS, activo('alumno'))).toEqual({
      tipo: 'ir',
      a: { fila: 1, criterio: 2 },
    })
  })

  it('al final se detiene: ni da la vuelta ni salta de alumno o de criterio', () => {
    expect(trasMarcarRubrica({ fila: 1, criterio: 3 }, DIMS, activo('criterio'))).toEqual({ tipo: 'fin' })
    expect(trasMarcarRubrica({ fila: 2, criterio: 1 }, DIMS, activo('alumno'))).toEqual({ tipo: 'fin' })
  })

  it('desactivado, se queda en la celda como antes', () => {
    expect(trasMarcarRubrica({ fila: 0, criterio: 0 }, DIMS, { activo: false, modo: 'alumno' })).toEqual({
      tipo: 'quedarse',
    })
  })

  it('atrás tampoco da la vuelta', () => {
    expect(anteriorEnRubrica({ fila: 0, criterio: 2 }, 'alumno')).toBeNull()
    expect(anteriorEnRubrica({ fila: 2, criterio: 0 }, 'criterio')).toBeNull()
    expect(anteriorEnRubrica({ fila: 2, criterio: 1 }, 'criterio')).toEqual({ fila: 2, criterio: 0 })
  })

  it('el progreso cuenta lo que recorre el modo', () => {
    expect(progresoRubrica({ fila: 1, criterio: 2 }, DIMS, 'alumno')).toEqual({ actual: 2, total: 3 })
    expect(progresoRubrica({ fila: 1, criterio: 2 }, DIMS, 'criterio')).toEqual({ actual: 3, total: 4 })
  })
})

describe('avance en el resto de columnas', () => {
  it('va a la misma columna del siguiente alumno', () => {
    expect(trasMarcarColumna(4, 24, true)).toEqual({ tipo: 'ir', a: 5 })
  })

  it('en el último se para, sin volver al primero', () => {
    expect(trasMarcarColumna(23, 24, true)).toEqual({ tipo: 'fin' })
  })

  it('desactivado, no se mueve', () => {
    expect(trasMarcarColumna(4, 24, false)).toEqual({ tipo: 'quedarse' })
  })
})
