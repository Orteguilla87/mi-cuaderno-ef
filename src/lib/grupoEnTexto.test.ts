import { describe, expect, it } from 'vitest'
import type { Grupo } from '../db/types'
import { detectarGrupoEnTexto } from './grupoEnTexto'

/**
 * El agente devolvía alumnos de otras clases. Dos causas, y estos tests sujetan
 * las dos: que el grupo dictado acote la búsqueda, y que su mención NO participe
 * en el emparejamiento de nombres.
 */

function grupo(id: string, nombre: string, nivel: number, alias?: string[]): Grupo {
  return {
    id,
    cursoEscolarId: 'c1',
    nombre,
    alias,
    etapa: 'primaria',
    nivel,
    color: '#006A80',
    orden: 0,
    horario: [],
  }
}

const cuartoA = grupo('g4a', '4ºA', 4, ['4A', 'cuarto de lengua'])
const terceroB = grupo('g3b', '3ºB', 3)
const quintoA = grupo('g5a', '5ºA', 5)
const GRUPOS = [cuartoA, terceroB, quintoA]

describe('detección del grupo dictado', () => {
  it('reconoce el ordinal hablado con letra de clase', () => {
    expect(detectarGrupoEnTexto('cuarto A, Pablo sin chándal', GRUPOS).candidatos).toEqual([cuartoA])
  })

  it('reconoce las formas escritas: 4A, 4ºA, 4º A', () => {
    for (const forma of ['4A', '4ºA', '4º A', '4 A']) {
      const r = detectarGrupoEnTexto(`${forma}, Pablo sin chándal`, GRUPOS)
      expect(r.candidatos, forma).toEqual([cuartoA])
    }
  })

  it('reconoce los alias del grupo, que es como se dice en voz alta', () => {
    expect(detectarGrupoEnTexto('cuarto de lengua, Pablo sin chándal', GRUPOS).candidatos).toEqual([
      cuartoA,
    ])
  })

  it('el ordinal sin letra se queda con el curso entero', () => {
    expect(detectarGrupoEnTexto('quinto, Pablo sin chándal', GRUPOS).candidatos).toEqual([quintoA])
  })

  it('sin mención de grupo no devuelve ningún candidato ni toca el texto', () => {
    const r = detectarGrupoEnTexto('Pablo sin chándal', GRUPOS)
    expect(r.candidatos).toEqual([])
    expect(r.textoSinGrupo).toBe('Pablo sin chándal')
  })
})

describe('la mención del grupo se RETIRA del texto', () => {
  it('el ordinal y la letra no sobreviven al texto que ve el fuzzy de nombres', () => {
    const r = detectarGrupoEnTexto('cuarto A, Pablo sin chándal', GRUPOS)
    expect(r.textoSinGrupo).toBe('Pablo sin chándal')
    expect(r.textoSinGrupo.toLowerCase()).not.toContain('cuarto')
  })

  it('se lleva también el relleno y el área: «cuarto de lengua»', () => {
    const r = detectarGrupoEnTexto('cuarto de lengua, Pablo sin chándal', GRUPOS)
    expect(r.textoSinGrupo).toBe('Pablo sin chándal')
    expect(r.textoSinGrupo.toLowerCase()).not.toContain('lengua')
  })

  it('devuelve la mención reconocida tal cual, para poder enseñarla', () => {
    expect(detectarGrupoEnTexto('Cuarto A, Pablo sin chándal', GRUPOS).mencion).toBe('Cuarto A')
  })
})

describe('ambigüedad entre áreas', () => {
  const cuartoEF = grupo('gef', '4ºA EF', 4, ['cuarto de EF'])
  const cuartoLengua = grupo('glen', '4ºA Lengua', 4, ['cuarto de lengua'])
  const dosAreas = [cuartoEF, cuartoLengua]

  it('«cuarto A» encaja con los dos y NO se elige ninguno', () => {
    const r = detectarGrupoEnTexto('cuarto A, Pablo sin chándal', dosAreas)
    expect(r.candidatos).toHaveLength(2)
  })

  it('el alias del área sí desempata', () => {
    expect(detectarGrupoEnTexto('cuarto de EF, Pablo sin chándal', dosAreas).candidatos).toEqual([
      cuartoEF,
    ])
  })
})
