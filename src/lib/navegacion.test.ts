import { describe, expect, it } from 'vitest'
import {
  ENTRADAS_MAS,
  entradaActiva,
  GRUPOS_LATERAL,
  masActivo,
  PESTANAS,
  RUTA_AJUSTES,
  tituloDeRuta,
} from './navegacion'

const MENU = [...GRUPOS_LATERAL.flatMap((g) => g.rutas), RUTA_AJUSTES]

describe('barra lateral (Bloque F1)', () => {
  it('tiene las 14 entradas (4+4+2+3 y Ajustes), cada una una vez, y ninguna falta', () => {
    expect(MENU).toHaveLength(14)
    expect(new Set(MENU).size).toBe(14)
    const conocidas = new Set([...PESTANAS, ...ENTRADAS_MAS].map((x) => x.ruta))
    for (const r of MENU) expect(conocidas.has(r)).toBe(true)
    expect([...conocidas].every((r) => MENU.includes(r))).toBe(true)
  })

  it('en cada vista del menú, la única entrada activa es la suya', () => {
    for (const r of MENU) expect(entradaActiva(r.slice(1))).toBe(r)
  })

  it('rúbricas y observaciones ya no marcan Cuaderno ni Grupos', () => {
    expect(entradaActiva('rubricas')).toBe('/rubricas')
    expect(entradaActiva('observaciones')).toBe('/observaciones')
  })

  it('las subvistas marcan su sección', () => {
    expect(entradaActiva('alumnos')).toBe('/grupos')
    expect(entradaActiva('asistencia')).toBe('/grupos')
    expect(entradaActiva('sesiones')).toBe('/planificador')
    expect(entradaActiva('equipos')).toBe('/herramientas')
    expect(entradaActiva('mas')).toBeUndefined()
  })
})

describe('barra inferior: «Más»', () => {
  it('activo solo si la ruta no es de una pestaña', () => {
    for (const r of ['hoy', 'cuaderno', 'grupos', 'planificador', 'alumnos', 'sesiones'])
      expect(masActivo(r)).toBe(false)
    for (const r of ['mas', 'rubricas', 'observaciones', 'cobertura', 'ajustes', 'inventario'])
      expect(masActivo(r)).toBe(true)
  })
})

describe('título de la pestaña', () => {
  it('«<Vista> · Cuaderno EF», sin «Psico»', () => {
    expect(tituloDeRuta('/hoy')).toBe('Hoy · Cuaderno EF')
    expect(tituloDeRuta('/rubricas')).toBe('Rúbricas · Cuaderno EF')
    expect(tituloDeRuta('/etiquetas-alumnado')).toBe('Etiquetas de alumnado · Cuaderno EF')
    expect(tituloDeRuta('/grupos/abc')).toBe('Grupo · Cuaderno EF')
    expect(tituloDeRuta('/sesiones/s1')).toBe('Sesión · Cuaderno EF')
    expect(tituloDeRuta('/mas')).toBe('Más · Cuaderno EF')
    for (const r of MENU) expect(tituloDeRuta(r)).not.toMatch(/Psico/)
  })
})
