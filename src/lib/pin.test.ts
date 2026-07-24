import { describe, expect, it } from 'vitest'
import { hashearPin, LONGITUD_MAX_PIN, LONGITUD_MIN_PIN, pinValido, verificarPin } from './pin'
import { ITERACIONES_PBKDF2 } from './cripto'

const RAPIDO = 1_000

describe('pinValido', () => {
  it('acepta 4 a 6 dígitos', () => {
    expect(pinValido('1234')).toBe(true)
    expect(pinValido('123456')).toBe(true)
    expect(pinValido('12345')).toBe(true)
  })

  it('rechaza fuera de rango o no numérico', () => {
    expect(pinValido('123')).toBe(false)
    expect(pinValido('1234567')).toBe(false)
    expect(pinValido('12a4')).toBe(false)
    expect(pinValido('')).toBe(false)
  })

  it('los límites publicados coinciden con §1.7 (4–6 dígitos)', () => {
    expect(LONGITUD_MIN_PIN).toBe(4)
    expect(LONGITUD_MAX_PIN).toBe(6)
  })
})

describe('hashearPin / verificarPin', () => {
  it('nunca guarda el PIN en claro', async () => {
    const guardado = await hashearPin('4269', undefined, RAPIDO)
    expect(guardado.hash).not.toContain('4269')
    expect(guardado.salt).not.toContain('4269')
    expect(JSON.stringify(guardado)).not.toContain('4269')
  })

  it('verifica el PIN correcto y rechaza el incorrecto', async () => {
    const guardado = await hashearPin('4269', undefined, RAPIDO)
    expect(await verificarPin('4269', guardado)).toBe(true)
    expect(await verificarPin('9624', guardado)).toBe(false)
    expect(await verificarPin('426', guardado)).toBe(false)
  })

  it('el mismo PIN con salts distintos produce hashes distintos', async () => {
    const a = await hashearPin('123456', undefined, RAPIDO)
    const b = await hashearPin('123456', undefined, RAPIDO)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it('por defecto usa las mismas ≥600.000 iteraciones que el backup', async () => {
    const guardado = await hashearPin('1234')
    expect(guardado.iteraciones).toBe(ITERACIONES_PBKDF2)
    expect(guardado.iteraciones).toBeGreaterThanOrEqual(600_000)
  })
})
