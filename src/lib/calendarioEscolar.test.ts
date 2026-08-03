import { describe, expect, it } from 'vitest'
import {
  CALENDARIO_CAM_2026_27,
  estadoDia,
  parsearCalendario,
  parsearFecha,
  trimestreDe,
  type CursoFechas,
} from './calendarioEscolar'

const CURSO: CursoFechas = {
  inicio: '2026-09-07', // lunes
  fin: '2027-06-22', // martes
  festivos: ['2026-10-12', '2026-12-08'], // lunes festivo, martes festivo
  trimestres: [
    { inicio: '2026-09-07', fin: '2026-12-22' },
    { inicio: '2027-01-08', fin: '2027-03-26' },
    { inicio: '2027-04-07', fin: '2027-06-22' },
  ],
  periodosNoLectivos: [{ nombre: 'Vacaciones de Navidad', inicio: '2026-12-23', fin: '2027-01-07' }],
}

describe('estadoDia', () => {
  it('un laborable dentro de un trimestre es lectivo, con su día de la semana', () => {
    expect(estadoDia('2026-09-08', CURSO)).toEqual({ tipo: 'lectivo', dia: 2 }) // martes
    expect(estadoDia('2027-05-06', CURSO)).toEqual({ tipo: 'lectivo', dia: 4 }) // jueves
  })

  it('el fin de semana nunca es lectivo, aunque caiga en trimestre', () => {
    expect(estadoDia('2026-09-12', CURSO).tipo).toBe('finDeSemana') // sábado
    expect(estadoDia('2026-09-13', CURSO).tipo).toBe('finDeSemana') // domingo
  })

  it('antes del inicio del curso: antesDeCurso, aunque sea laborable', () => {
    expect(estadoDia('2026-09-01', CURSO).tipo).toBe('antesDeCurso') // martes previo
  })

  it('después del fin del curso: despuesDeCurso', () => {
    expect(estadoDia('2027-06-23', CURSO).tipo).toBe('despuesDeCurso') // miércoles siguiente
  })

  it('un festivo laborable dentro de curso es festivo', () => {
    expect(estadoDia('2026-10-12', CURSO).tipo).toBe('festivo')
    expect(estadoDia('2026-12-08', CURSO).tipo).toBe('festivo')
  })

  it('un laborable fuera de trimestre y sin periodo con nombre es vacaciones', () => {
    // Semana Santa: hueco entre trimestres, pero este CURSO no le puso nombre.
    expect(estadoDia('2027-03-31', CURSO).tipo).toBe('vacaciones') // miércoles
  })

  it('un periodo no lectivo con nombre manda antes que el hueco genérico de vacaciones', () => {
    expect(estadoDia('2026-12-28', CURSO)).toEqual({
      tipo: 'periodo',
      nombre: 'Vacaciones de Navidad',
    })
  })

  it('sin trimestres cargados, cualquier laborable en rango es lectivo salvo que caiga en un periodo', () => {
    const sinTrimestres: CursoFechas = { ...CURSO, trimestres: [] }
    expect(estadoDia('2026-12-30', sinTrimestres).tipo).toBe('periodo') // sigue en Navidad
    expect(estadoDia('2027-03-31', sinTrimestres)).toEqual({ tipo: 'lectivo', dia: 3 }) // miércoles
    expect(estadoDia('2026-10-12', sinTrimestres).tipo).toBe('festivo') // el festivo manda igual
  })
})

describe('trimestreDe', () => {
  it('deduce el trimestre a partir de la fecha', () => {
    const curso = {
      trimestres: [
        { n: 1 as const, inicio: '2026-09-07', fin: '2026-12-22' },
        { n: 2 as const, inicio: '2027-01-08', fin: '2027-03-26' },
        { n: 3 as const, inicio: '2027-04-07', fin: '2027-06-22' },
      ],
    }
    expect(trimestreDe('2026-10-01', curso)).toBe(1)
    expect(trimestreDe('2027-02-01', curso)).toBe(2)
    expect(trimestreDe('2027-05-01', curso)).toBe(3)
  })

  it('una semana a caballo entre dos trimestres da cada día su propio trimestre', () => {
    const curso = {
      trimestres: [
        { n: 1 as const, inicio: '2026-09-07', fin: '2026-12-22' },
        { n: 2 as const, inicio: '2027-01-08', fin: '2027-03-26' },
      ],
    }
    // Último día del 1.º trimestre y primer día lectivo del 2.º, separados
    // por las vacaciones de Navidad entre medias.
    expect(trimestreDe('2026-12-22', curso)).toBe(1)
    expect(trimestreDe('2026-12-28', curso)).toBeNull() // en el hueco: ningún trimestre
    expect(trimestreDe('2027-01-08', curso)).toBe(2)
  })

  it('null fuera de todos los tramos o sin trimestres cargados', () => {
    expect(trimestreDe('2026-12-28', { trimestres: [] })).toBeNull()
  })
})

describe('CALENDARIO_CAM_2026_27 (precarga editable de Ajustes)', () => {
  it('los tres trimestres caen dentro de los límites del curso, sin solaparse', () => {
    const { inicio, fin, trimestres } = CALENDARIO_CAM_2026_27
    expect(trimestres).toHaveLength(3)
    for (const t of trimestres) {
      expect(t.inicio >= inicio).toBe(true)
      expect(t.fin <= fin).toBe(true)
      expect(t.inicio <= t.fin).toBe(true)
    }
    expect(trimestres[0].fin < trimestres[1].inicio).toBe(true)
    expect(trimestres[1].fin < trimestres[2].inicio).toBe(true)
  })

  it('Navidad y Semana Santa quedan fuera de los trimestres que delimitan', () => {
    const curso: CursoFechas = { ...CALENDARIO_CAM_2026_27, festivos: CALENDARIO_CAM_2026_27.festivos }
    expect(estadoDia('2026-12-28', curso)).toEqual({
      tipo: 'periodo',
      nombre: 'Vacaciones de Navidad',
    })
    expect(estadoDia('2027-03-22', curso)).toEqual({
      tipo: 'periodo',
      nombre: 'Vacaciones de Semana Santa',
    })
  })
})

// Guarda mínima de no-regresión del parser que ya vivía aquí, ahora con test propio.
describe('parsearFecha', () => {
  it('interpreta d/m/aaaa y aaaa-mm-dd', () => {
    expect(parsearFecha('7/9/2026')).toBe('2026-09-07')
    expect(parsearFecha('2026-09-07')).toBe('2026-09-07')
  })

  it('deduce el año de una fecha sin año a partir del curso', () => {
    const curso = { inicio: '2026-09-01', fin: '2027-06-30' }
    expect(parsearFecha('8/12', curso)).toBe('2026-12-08') // diciembre → primer año
    expect(parsearFecha('7/1', curso)).toBe('2027-01-07') // enero → segundo año
  })
})

describe('parsearCalendario', () => {
  it('expande rangos y descarta fines de semana y fechas fuera de curso', () => {
    const curso = { inicio: '2026-09-01', fin: '2027-06-30' }
    const r = parsearCalendario('23/12/2026 - 7/1/2027', curso)
    expect(r.fechas).toContain('2026-12-23')
    expect(r.fechas).toContain('2027-01-07')
    expect(r.fechas).not.toContain('2026-12-26') // sábado omitido
    expect(r.finesDeSemanaOmitidos).toBeGreaterThan(0)
  })
})
