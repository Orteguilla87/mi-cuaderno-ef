import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cicloDeCurso,
  criteriosDeGrupo,
  criteriosInfantil,
  criteriosPrimaria,
  CRITERIOS_INFANTIL_ESPERADOS,
  CRITERIOS_PRIMARIA_ESPERADOS,
  idCriterioPrimaria,
  sembrarCriterios,
  validarCriteriosInfantil,
  validarCriteriosPrimaria,
} from './criterios'
import { db } from './db'
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

/**
 * Lo mismo para Infantil (Decreto 36/2022). Aquí no hay ciclos que distinguir
 * —los 56 criterios son del 2.º ciclo entero— pero sí tres áreas, y solo una es
 * la que se evalúa desde Psicomotricidad.
 */
describe('semilla de criterios de Infantil', () => {
  const lista = criteriosInfantil()

  it('carga los 56 criterios del 2.º ciclo repartidos en 3 áreas', () => {
    expect(lista).toHaveLength(CRITERIOS_INFANTIL_ESPERADOS)
    expect(new Set(lista.map((c) => c.areaCodigo))).toEqual(new Set(['I', 'II', 'III']))
    expect(validarCriteriosInfantil(lista)).toEqual([])
  })

  it('marca una sola área como principal: la I, «Crecimiento en armonía»', () => {
    const principales = new Set(lista.filter((c) => c.principal).map((c) => c.areaCodigo))
    expect([...principales]).toEqual(['I'])
  })

  it('no asigna ciclo ni cursos: los criterios no dependen de la edad', () => {
    for (const c of lista) {
      expect(c.ciclo).toBeUndefined()
      expect(c.cursos).toBeUndefined()
      expect(c.competenciaTexto.length).toBeGreaterThan(0)
    }
  })

  it('detecta una semilla incompleta, sin área principal o con ids repetidos', () => {
    expect(validarCriteriosInfantil(lista.slice(0, 10)).join(' ')).toContain('deberían ser 56')

    const sinPrincipal = lista.map((c) => ({ ...c, principal: false }))
    expect(validarCriteriosInfantil(sinPrincipal).join(' ')).toContain(
      '0 áreas marcadas como principal',
    )

    const duplicado: Criterio[] = [...lista.slice(0, -1), { ...lista[0] }]
    expect(validarCriteriosInfantil(duplicado).join(' ')).toContain('ids de criterio repetidos')
  })
})

/**
 * La regla dura de la etapa: NINGÚN selector mezcla criterios de las dos. La
 * fuente la elige la etapa del grupo, nunca el usuario, y por eso se prueba
 * aquí y no en la vista: si `criteriosDeGrupo` cruza las etapas, da igual lo
 * bien que esté escrita la pantalla.
 */
describe('criteriosDeGrupo elige la fuente por etapa', () => {
  beforeEach(async () => {
    await sembrarCriterios()
  })

  afterEach(async () => {
    await db.delete()
    await db.open()
  })

  it('devuelve solo criterios de la etapa pedida', async () => {
    const infantil = await criteriosDeGrupo('infantil', 4, false)
    expect(infantil.length).toBe(CRITERIOS_INFANTIL_ESPERADOS)
    expect(infantil.every((c) => c.etapa === 'infantil')).toBe(true)

    const primaria = await criteriosDeGrupo('primaria', 4)
    expect(primaria.length).toBeGreaterThan(0)
    expect(primaria.every((c) => c.etapa === 'primaria')).toBe(true)
  })

  it('en Infantil no filtra por curso: 3, 4 y 5 años comparten los mismos', async () => {
    const [tres, cuatro, cinco] = await Promise.all([
      criteriosDeGrupo('infantil', 3, false),
      criteriosDeGrupo('infantil', 4, false),
      criteriosDeGrupo('infantil', 5, false),
    ])
    const ids = (lista: Criterio[]) => lista.map((c) => c.id)
    expect(ids(cuatro)).toEqual(ids(tres))
    expect(ids(cinco)).toEqual(ids(tres))
  })

  it('en Primaria sí filtra por ciclo: 1.º y 5.º no ven lo mismo', async () => {
    const primero = await criteriosDeGrupo('primaria', 1)
    const quinto = await criteriosDeGrupo('primaria', 5)
    expect(primero.map((c) => c.id)).not.toEqual(quinto.map((c) => c.id))
    expect(new Set(primero.map((c) => c.ciclo))).toEqual(new Set([1]))
    expect(new Set(quinto.map((c) => c.ciclo))).toEqual(new Set([3]))
  })

  it('por defecto, en Infantil solo ofrece el Área I (la de Psicomotricidad)', async () => {
    const soloPrincipal = await criteriosDeGrupo('infantil', 4)
    expect(soloPrincipal.length).toBeLessThan(CRITERIOS_INFANTIL_ESPERADOS)
    expect(soloPrincipal.every((c) => c.areaCodigo === 'I')).toBe(true)
  })
})
