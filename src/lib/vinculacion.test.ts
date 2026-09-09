import { describe, expect, it } from 'vitest'
import type { Alumno } from '../db/types'
import { claveNombre, emparejar, resumir } from './vinculacion'

let n = 0
function alumno(nombre: string, apellidos: string, grupoId: string, personaId?: string): Alumno {
  return {
    id: `a${++n}`,
    grupoId,
    nombre,
    apellidos,
    alias: nombre,
    activo: true,
    ...(personaId ? { personaId } : {}),
  }
}

const ef = (nombre: string, apellidos: string, personaId?: string) =>
  alumno(nombre, apellidos, 'g-ef', personaId)
const lengua = (nombre: string, apellidos: string, personaId?: string) =>
  alumno(nombre, apellidos, 'g-lengua', personaId)

describe('claveNombre', () => {
  it('ignora mayúsculas, tildes y espacios de sobra', () => {
    expect(claveNombre({ nombre: '  José ', apellidos: 'Gómez  Ruiz' })).toBe('jose gomez ruiz')
  })
})

describe('emparejar', () => {
  it('empareja el mismo nombre escrito igual', () => {
    const a = ef('Lucía', 'Prieto')
    const b = lengua('Lucía', 'Prieto')
    const [p] = emparejar([a], [b])
    expect(p.estado).toBe('exacta')
    expect(p.b?.id).toBe(b.id)
  })

  it('empareja pese a tildes y mayúsculas', () => {
    const [p] = emparejar([ef('JOSE', 'Gomez')], [lengua('José', 'Gómez')])
    expect(p.estado).toBe('exacta')
  })

  it('tolera la variante del nombre de pila: «José Luis» / «Jose L.»', () => {
    const b = lengua('Jose L.', 'Ramírez')
    const [p] = emparejar([ef('José Luis', 'Ramírez')], [b])
    expect(p.estado).toBe('probable')
    expect(p.b?.id).toBe(b.id)
  })

  it('DOS homónimos en el otro grupo: ambigua, y sin pareja elegida', () => {
    const propuestas = emparejar(
      [ef('Marta', 'López')],
      [lengua('Marta', 'López'), lengua('Marta', 'López')],
    )
    expect(propuestas[0].estado).toBe('ambigua')
    expect(propuestas[0].b).toBeUndefined()
    expect(propuestas[0].candidatos).toHaveLength(2)
  })

  it('DOS homónimos en el propio grupo: también ambigua', () => {
    // No se sabe cuál de las dos Martas de EF es la Marta de Lengua.
    const propuestas = emparejar(
      [ef('Marta', 'López'), ef('Marta', 'López')],
      [lengua('Marta', 'López')],
    )
    expect(propuestas.map((p) => p.estado)).toEqual(['ambigua', 'ambigua'])
    expect(propuestas.every((p) => p.b === undefined)).toBe(true)
  })

  it('nadie parecido: sin pareja, y sin ruido', () => {
    const [p] = emparejar([ef('Aitor', 'Etxeberria')], [lengua('Rocío', 'Salazar')])
    expect(p.estado).toBe('sin-pareja')
    expect(p.b).toBeUndefined()
    expect(p.candidatos).toEqual([])
  })

  it('una ficha del otro grupo no puede ser pareja de dos', () => {
    // Dos fichas de EF que se parecen a la misma de Lengua: nadie gana.
    const propuestas = emparejar(
      [ef('Ana', 'Ruiz Mora'), ef('Ana', 'Ruiz Mata')],
      [lengua('Ana', 'Ruiz')],
    )
    // Lo que importa es que ninguna se lleva la pareja: ni «ambigua» ni «sin
    // pareja» escriben nada, y las dos obligan a mirar.
    expect(propuestas.every((p) => p.b === undefined)).toBe(true)
    expect(propuestas.every((p) => p.estado !== 'exacta' && p.estado !== 'probable')).toBe(true)
  })

  it('las ya vinculadas se reconocen y no piden confirmación', () => {
    const propuestas = emparejar([ef('Iván', 'Cano', 'p1')], [lengua('Ivan', 'Cano', 'p1')])
    expect(propuestas[0].estado).toBe('ya-vinculada')
    expect(propuestas[0].b?.personaId).toBe('p1')
  })

  it('un grupo entero, con de todo', () => {
    const propuestas = emparejar(
      [ef('Lucía', 'Prieto'), ef('José Luis', 'Ramírez'), ef('Aitor', 'Etxeberria')],
      [lengua('Lucía', 'Prieto'), lengua('Jose L.', 'Ramírez'), lengua('Rocío', 'Salazar')],
    )
    expect(resumir(propuestas)).toMatchObject({
      exacta: 1,
      probable: 1,
      'sin-pareja': 1,
      ambigua: 0,
    })
  })

  it('no escribe nada: las fichas que entran salen intactas', () => {
    const a = ef('Lucía', 'Prieto')
    const copia = { ...a }
    emparejar([a], [lengua('Lucía', 'Prieto')])
    expect(a).toEqual(copia)
    expect(a.personaId).toBeUndefined()
  })
})
