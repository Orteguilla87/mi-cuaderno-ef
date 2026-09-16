import { describe, expect, it } from 'vitest'
import { interpretarLocal, resolverGrupo } from './agente'
import { buscarAlumnoEnTexto } from '../lib/pseudonimizacion'
import type { Alumno, Grupo } from './types'

/**
 * La cadena que decide a qué grupo se aplica lo dictado. Lo que se sujeta aquí
 * no es que acierte, sino que NO ADIVINE: sin grupo y sin contexto, o con dos
 * áreas empatadas, la app tiene que pararse y preguntar.
 */

function grupo(id: string, nombre: string, nivel: number, extra: Partial<Grupo> = {}): Grupo {
  return {
    id,
    cursoEscolarId: 'c1',
    nombre,
    etapa: 'primaria',
    nivel,
    color: '#006A80',
    orden: 0,
    horario: [],
    ...extra,
  }
}

const cuartoA = grupo('g4a', '4ºA', 4, { alias: ['4A'] })
const terceroB = grupo('g3b', '3ºB', 3)

// Martes lectivo, para las franjas de horario.
const MARTES = '2026-09-15'

describe('resolverGrupo', () => {
  it('con el grupo dictado, ese manda aunque haya otro abierto en la app', () => {
    const r = resolverGrupo('cuarto A, Pablo sin chándal', [cuartoA, terceroB], terceroB)
    expect(r.grupo).toBe(cuartoA)
    expect(r.textoSinGrupo).toBe('Pablo sin chándal')
  })

  it('sin grupo dictado, usa el del contexto activo', () => {
    const r = resolverGrupo('Pablo sin chándal', [cuartoA, terceroB], terceroB)
    expect(r.grupo).toBe(terceroB)
  })

  it('sin grupo dictado y sin contexto, NO adivina: se queda sin grupo', () => {
    const r = resolverGrupo('Pablo sin chándal', [cuartoA, terceroB])
    expect(r.grupo).toBeUndefined()
    expect(r.ambiguos).toBeUndefined()
  })
})

describe('ambigüedad entre áreas («cuarto A» de EF y de Lengua)', () => {
  const ef = grupo('gef', '4ºA EF', 4, {
    alias: ['cuarto de EF'],
    horario: [{ diaSemana: 2, horaInicio: '10:00', horaFin: '11:00' }],
  })
  const lengua = grupo('glen', '4ºA Lengua', 4, {
    alias: ['cuarto de lengua'],
    horario: [{ diaSemana: 2, horaInicio: '12:00', horaFin: '13:00' }],
  })
  const dosAreas = [ef, lengua]
  const dictado = 'cuarto A, Pablo sin chándal'

  it('desambigua por el grupo abierto en la app si es uno de los dos', () => {
    expect(resolverGrupo(dictado, dosAreas, lengua).grupo).toBe(lengua)
  })

  it('desambigua por la franja horaria en que se está dando clase', () => {
    const r = resolverGrupo(dictado, dosAreas, undefined, { fecha: MARTES, hora: '10:30' })
    expect(r.grupo).toBe(ef)
  })

  it('fuera de horario y sin contexto, PREGUNTA en vez de elegir', () => {
    const r = resolverGrupo(dictado, dosAreas, undefined, { fecha: MARTES, hora: '17:00' })
    expect(r.grupo).toBeUndefined()
    expect(r.ambiguos).toEqual(dosAreas)
  })

  it('si dos grupos se solapan en el horario tampoco elige', () => {
    const solapado = grupo('gsol', '4ºA Música', 4, {
      horario: [{ diaSemana: 2, horaInicio: '10:00', horaFin: '11:00' }],
    })
    const r = resolverGrupo(dictado, [ef, solapado], undefined, { fecha: MARTES, hora: '10:30' })
    expect(r.grupo).toBeUndefined()
    expect(r.ambiguos).toHaveLength(2)
  })
})

describe('interpretarLocal acotado', () => {
  const pabloDeCuarto: Alumno = {
    id: 'a-4a',
    grupoId: 'g4a',
    nombre: 'Pablo',
    apellidos: 'Mena',
    alias: 'Pablo',
    activo: true,
  }
  const pabloDeTercero: Alumno = {
    id: 'a-3b',
    grupoId: 'g3b',
    nombre: 'Pablo',
    apellidos: 'Cuartero',
    alias: 'Pablo',
    activo: true,
  }

  it('resuelve al alumno del grupo dictado, no al de la otra clase', () => {
    const { grupo: g, textoSinGrupo } = resolverGrupo('cuarto A, Pablo sin chándal', [
      cuartoA,
      terceroB,
    ])
    const delGrupo = [pabloDeCuarto, pabloDeTercero].filter((a) => a.grupoId === g!.id)
    const r = interpretarLocal(textoSinGrupo, g!, delGrupo, buscarAlumnoEnTexto)

    expect(r.tipo).toBe('accion')
    if (r.tipo !== 'accion') return
    expect(r.accion.alumnoId).toBe('a-4a')
    expect(r.accion.grupoId).toBe('g4a')
    expect(r.grupo).toBe(cuartoA)
    expect(r.accion.payload.chandal).toBe(false)
  })

  it('el grupo viaja en el resultado para que la tarjeta pueda enseñarlo', () => {
    const r = interpretarLocal('deshacer', cuartoA, [], buscarAlumnoEnTexto)
    expect(r.tipo).toBe('accion')
    if (r.tipo !== 'accion') return
    expect(r.grupo).toBe(cuartoA)
  })

  it('nadie del grupo se parece: no_reconocido, y no se sale a buscar fuera', () => {
    // «Cuartero» está en el otro grupo y casaría de sobra; aquí no se ve.
    const r = interpretarLocal('Cuartero sin chándal', cuartoA, [pabloDeCuarto], buscarAlumnoEnTexto)
    expect(r.tipo).toBe('no_reconocido')
  })
})
