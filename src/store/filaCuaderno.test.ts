import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CADUCIDAD_PETICION_MS,
  decidirPeticion,
  DURACION_RESALTADO_MS,
  resaltarDurante,
  rutaParaVerAlumno,
  useFilaCuaderno,
} from './filaCuaderno'

/**
 * «Ver alumno» desde el sorteo: lleva al Cuaderno del grupo correcto, sitúa y
 * resalta la fila un momento, y no hace nada más. El proyecto no tiene entorno
 * DOM de test: la decisión vive en funciones puras y el efecto de la rejilla
 * (`pages/Cuaderno.tsx`) se vigila sobre la fuente.
 */

beforeEach(() => useFilaCuaderno.setState({ pendiente: null, pedidaEn: 0 }))

describe('a qué Cuaderno lleva', () => {
  it('desde Herramientas, al Cuaderno del grupo del sorteo', () => {
    expect(rutaParaVerAlumno('/herramientas', 'g-otro', 'g4a')).toBe('/cuaderno/g4a')
  })

  it('con el Cuaderno abierto en OTRO grupo, cambia al del sorteo', () => {
    expect(rutaParaVerAlumno('/cuaderno/g3b', 'g3b', 'g4a')).toBe('/cuaderno/g4a')
    expect(rutaParaVerAlumno('/cuaderno', 'g3b', 'g4a')).toBe('/cuaderno/g4a')
  })

  it('con el Cuaderno ya abierto en ese grupo, no navega: solo desplaza y resalta', () => {
    expect(rutaParaVerAlumno('/cuaderno/g4a', 'g3b', 'g4a')).toBeNull()
    // Sin grupo en la ruta, el Cuaderno enseña el grupo activo.
    expect(rutaParaVerAlumno('/cuaderno', 'g4a', 'g4a')).toBeNull()
  })
})

describe('la petición', () => {
  it('espera a que la fila esté pintada y entonces la sitúa', () => {
    useFilaCuaderno.getState().pedir('a7', 1_000)
    const { pendiente, pedidaEn } = useFilaCuaderno.getState()
    expect(decidirPeticion(pendiente, pedidaEn, [], 1_100)).toBe('esperar')
    expect(decidirPeticion(pendiente, pedidaEn, ['a1', 'a7'], 1_200)).toBe('situar')
  })

  it('caduca: no salta minutos después si la fila nunca llegó a pintarse', () => {
    expect(decidirPeticion('a7', 0, ['a7'], CADUCIDAD_PETICION_MS + 1)).toBe('descartar')
  })

  it('una vez atendida no se repite', () => {
    useFilaCuaderno.getState().pedir('a7')
    useFilaCuaderno.getState().atendida()
    expect(decidirPeticion(useFilaCuaderno.getState().pendiente, 0, ['a7'])).toBe('nada')
  })
})

describe('el resaltado', () => {
  it('se pone y se quita solo pasado el tiempo', () => {
    let resaltada: string | null = null
    let pendiente: { fn: () => void; ms: number } | null = null
    resaltarDurante(
      'a7',
      (id) => (resaltada = id),
      (fn, ms) => {
        pendiente = { fn, ms }
        return 1
      },
      () => {},
    )
    expect(resaltada).toBe('a7')
    expect(pendiente!.ms).toBe(DURACION_RESALTADO_MS)
    pendiente!.fn()
    expect(resaltada).toBeNull()
  })
})

describe('sobre la fuente', () => {
  const RAIZ = join(__dirname, '..')
  const cuaderno = readFileSync(join(RAIZ, 'pages', 'Cuaderno.tsx'), 'utf-8')
  const bloque = cuaderno.slice(
    cuaderno.indexOf('«Ver alumno» desde el sorteo'),
    cuaderno.indexOf('——— Notas de celda'),
  )

  it('situar la fila no abre ninguna celda ni cambia la columna', () => {
    expect(bloque.length).toBeGreaterThan(0)
    for (const prohibido of ['onEvaluar', 'setEvaluando', 'onAbrirEditor', 'setNotaAbierta', 'focus('])
      expect(bloque, prohibido).not.toContain(prohibido)
    // Solo el eje vertical: nada de scrollLeft ni scrollIntoView sobre la fila.
    expect(bloque).not.toMatch(/scrollLeft|left:/)
    expect(bloque).not.toMatch(/fila\.scrollIntoView/)
  })

  it('el apagado del resaltado no depende de la limpieza del efecto', () => {
    // Si volviera a `return resaltarDurante(...)`, marcar la petición como
    // atendida relanzaría el efecto y cancelaría el apagado.
    expect(bloque).not.toMatch(/return resaltarDurante/)
  })

  it('el sorteo pide dos toques para salir al Cuaderno (pantalla proyectable)', () => {
    const sorteo = readFileSync(join(RAIZ, 'components', 'SorteoAlumno.tsx'), 'utf-8')
    expect(sorteo).toMatch(/if \(!confirmandoVer\) return setConfirmandoVer\(true\)/)
  })
})
