import { describe, expect, it } from 'vitest'
import {
  cicloDeCurso,
  criteriosPrimaria,
  CRITERIOS_PRIMARIA_ESPERADOS,
  idCriterioPrimaria,
  validarCriteriosPrimaria,
} from './criterios'
import type { Criterio } from './types'

/**
 * Los criterios son la referencia legal de toda la evaluación de Primaria. Si
 * la semilla se degrada sin que nadie se entere, los selectores ofrecen menos
 * criterios de los que hay y el informe de cobertura da por descubierto lo que
 * no lo está. De ahí que se valide, y de ahí que se pruebe la validación.
 */
describe('semilla de criterios de Primaria', () => {
  const lista = criteriosPrimaria()

  it('carga los 46 criterios del Decreto 61/2022 repartidos en 3 ciclos', () => {
    expect(lista).toHaveLength(CRITERIOS_PRIMARIA_ESPERADOS)
    expect(new Set(lista.map((c) => c.ciclo))).toEqual(new Set([1, 2, 3]))
    expect(validarCriteriosPrimaria(lista)).toEqual([])
  })

  it('da a cada criterio un id que lleva su ciclo dentro', () => {
    // «1.1» existe en los tres ciclos con textos distintos: sin el ciclo en la
    // clave, 46 criterios se colapsarían en 17.
    const repetidos = lista.filter((c) => c.codigo === '1.1')
    expect(repetidos).toHaveLength(3)
    expect(new Set(repetidos.map((c) => c.id)).size).toBe(3)
    expect(new Set(repetidos.map((c) => c.texto)).size).toBe(3)

    for (const c of lista) expect(c.id).toBe(idCriterioPrimaria(c.ciclo!, c.codigo))
  })

  it('resuelve el texto de la competencia de cada criterio', () => {
    for (const c of lista) {
      expect(c.competenciaCodigo).toMatch(/^CE[1-5]$/)
      expect(c.competenciaTexto.length).toBeGreaterThan(0)
    }
  })

  it('asigna a cada criterio los dos cursos de su ciclo', () => {
    for (const c of lista) {
      expect(c.cursos).toHaveLength(2)
      for (const curso of c.cursos!) expect(cicloDeCurso(curso)).toBe(c.ciclo)
    }
  })

  it('detecta una semilla incompleta, con códigos repetidos o sin competencia', () => {
    expect(validarCriteriosPrimaria(lista.slice(0, 10)).join(' ')).toContain('deberían ser 46')

    const duplicado: Criterio[] = [...lista, { ...lista[0], id: 'EF.1C.9.9' }]
    expect(duplicado.length).toBe(CRITERIOS_PRIMARIA_ESPERADOS + 1)
    expect(validarCriteriosPrimaria(duplicado).join(' ')).toContain('repetido en el ciclo 1')

    const huerfano = lista.map((c, i) => (i === 0 ? { ...c, competenciaTexto: '' } : c))
    expect(validarCriteriosPrimaria(huerfano).join(' ')).toContain('que no está en el fichero')
  })
})
