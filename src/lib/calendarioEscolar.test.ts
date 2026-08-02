import { describe, expect, it } from 'vitest'
import { estadoDia, parsearCalendario, parsearFecha, type CursoFechas } from './calendarioEscolar'

const CURSO: CursoFechas = {
  inicio: '2026-09-07', // lunes
  fin: '2027-06-22', // martes
  festivos: ['2026-10-12', '2026-12-08'], // lunes festivo, martes festivo
  trimestres: [
    { inicio: '2026-09-07', fin: '2026-12-22' },
    { inicio: '2027-01-08', fin: '2027-03-26' },
    { inicio: '2027-04-07', fin: '2027-06-22' },
  ],
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

  it('un laborable dentro del curso pero fuera de todo trimestre es vacaciones', () => {
    expect(estadoDia('2026-12-28', CURSO).tipo).toBe('vacaciones') // Navidad (lunes)
    expect(estadoDia('2027-03-31', CURSO).tipo).toBe('vacaciones') // Semana Santa (miércoles)
  })

  it('sin trimestres cargados, cualquier laborable en rango es lectivo', () => {
    const sinTrimestres: CursoFechas = { ...CURSO, trimestres: [] }
    expect(estadoDia('2026-12-28', sinTrimestres)).toEqual({ tipo: 'lectivo', dia: 1 }) // lunes
    expect(estadoDia('2026-10-12', sinTrimestres).tipo).toBe('festivo') // el festivo manda igual
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
