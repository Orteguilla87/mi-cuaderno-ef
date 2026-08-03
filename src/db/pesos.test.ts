import { describe, expect, it } from 'vitest'
import { repartirAPartesIguales } from './planificador'

describe('repartirAPartesIguales', () => {
  it('reparte exacto cuando 100 es divisible', () => {
    const reparto = repartirAPartesIguales(['a', 'b', 'c', 'd'])
    expect(reparto.map((r) => r.pesoTrimestre)).toEqual([25, 25, 25, 25])
  })

  it('da el sobrante a las primeras para que la suma dé 100 clavado', () => {
    // Sin esto, 3 unidades a 33 sumarían 99 y el total saldría en ámbar
    // justo después de pulsar el botón que promete repartir bien.
    const reparto = repartirAPartesIguales(['a', 'b', 'c'])
    expect(reparto.map((r) => r.pesoTrimestre)).toEqual([34, 33, 33])
    expect(reparto.reduce((n, r) => n + r.pesoTrimestre, 0)).toBe(100)
  })

  it('suma 100 con cualquier número de unidades', () => {
    for (let n = 1; n <= 12; n++) {
      const ids = Array.from({ length: n }, (_, i) => `ud-${i}`)
      const total = repartirAPartesIguales(ids).reduce((s, r) => s + r.pesoTrimestre, 0)
      expect(total).toBe(100)
    }
  })

  it('no revienta sin unidades', () => {
    expect(repartirAPartesIguales([])).toEqual([])
  })
})
