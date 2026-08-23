import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ambitoUnidad, terminologia } from './literales'

/**
 * La nomenclatura por etapa no es cuestión de estilo: el Decreto 36/2022 no
 * conoce ni las «unidades didácticas» ni los «saberes básicos», y escribirlos
 * en una pantalla de Infantil es un error de nomenclatura legal.
 *
 * El proyecto no monta React en los tests (§2: Vitest solo para motor, parser y
 * cifrado), así que en vez de renderizar vistas se revisa la FUENTE de todas
 * ellas. Sale más barato y cubre más: ninguna pantalla puede escaparse por no
 * tener test propio.
 */
describe('terminología por etapa', () => {
  it('en Infantil no aparece ningún término de Primaria', () => {
    const infantil = Object.values(terminologia('infantil')).join(' | ')
    expect(infantil).not.toMatch(PROHIBIDOS)
  })

  it('en Primaria mantiene los términos del Decreto 61/2022', () => {
    const primaria = terminologia('primaria')
    expect(primaria.unidad).toBe('Unidad didáctica')
    expect(primaria.contenidos).toBe('Saberes básicos')
  })

  it('el ámbito de la unidad es el curso en Primaria y el ciclo en Infantil', () => {
    expect(ambitoUnidad('primaria', [4])).toBe('4º')
    expect(ambitoUnidad('primaria', [3, 4])).toBe('3º y 4º')
    expect(ambitoUnidad('infantil', [0])).toBe('2.º ciclo')
  })
})

/** Los literales que solo puede escribir el módulo de terminología. */
const PROHIBIDOS = /unidad(es)? did[áa]ctica|saberes? b[áa]sicos?/i

/** Único fichero donde estos términos pueden aparecer escritos a mano. */
const EXENTO = 'literales.ts'

const RAIZ = join(import.meta.dirname, '..')

function fuentesDeVistas(dir: string): string[] {
  const entradas = readdirSync(dir, { withFileTypes: true })
  return entradas.flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return fuentesDeVistas(ruta)
    return e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx') ? [ruta] : []
  })
}

/**
 * Quita comentarios antes de buscar: un `// la unidad didáctica de la Orden
 * 130/2023` explicando el motor es documentación correcta, no un rótulo que el
 * usuario vaya a leer.
 */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('ninguna vista escribe la terminología a mano', () => {
  const ficheros = [
    ...fuentesDeVistas(join(RAIZ, 'pages')),
    ...fuentesDeVistas(join(RAIZ, 'components')),
  ]

  it('encuentra las vistas que hay que revisar', () => {
    expect(ficheros.length).toBeGreaterThan(10)
  })

  it.each(ficheros)('%s no lleva literales de etapa', (ruta) => {
    if (ruta.endsWith(EXENTO)) return
    const encontrado = sinComentarios(readFileSync(ruta, 'utf-8')).match(PROHIBIDOS)
    expect(
      encontrado?.[0],
      `«${encontrado?.[0]}» debe salir de terminologia(etapa), no escrito a mano`,
    ).toBeUndefined()
  })
})
