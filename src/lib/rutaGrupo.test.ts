import { describe, expect, it } from 'vitest'
import type { Grupo } from '../db/types'
import { esRutaDeGrupo, rutaEnOtroGrupo, rutaPrincipalDe } from './rutaGrupo'

function grupo(id: string, etapa: Grupo['etapa'] = 'primaria'): Grupo {
  return {
    id,
    cursoEscolarId: 'curso1',
    nombre: id.toUpperCase(),
    etapa,
    nivel: 4,
    color: '#006A80',
    orden: 0,
    horario: [],
  }
}

const B = grupo('b')
const INF = grupo('inf', 'infantil')

describe('cambiar de grupo conserva la subpantalla', () => {
  it('del listado de alumnado de uno al listado de alumnado del otro', () => {
    expect(rutaEnOtroGrupo('/grupos/a', B)).toBe('/grupos/b')
  })

  it('del pase de lista de uno al del otro', () => {
    expect(rutaEnOtroGrupo('/asistencia/a', B)).toBe('/asistencia/b')
  })

  it('del cuaderno de uno al del otro', () => {
    expect(rutaEnOtroGrupo('/cuaderno/a', B)).toBe('/cuaderno/b')
  })

  it('del generador de equipos y de las observaciones, también', () => {
    expect(rutaEnOtroGrupo('/equipos/a', B)).toBe('/equipos/b')
    expect(rutaEnOtroGrupo('/observaciones/a', B)).toBe('/observaciones/b')
  })
})

describe('lo que había detrás del grupo se tira', () => {
  it('la fecha y la franja de un pase de lista son de OTRO horario', () => {
    // Arrastrarlas abriría la pantalla en un día en el que este grupo no tiene
    // clase, o en una franja que no existe.
    expect(rutaEnOtroGrupo('/asistencia/a/2026-09-08/10:00', B)).toBe('/asistencia/b')
  })

  it('la sesión de un generador de equipos, igual', () => {
    expect(rutaEnOtroGrupo('/equipos/a/sesion-s1', B)).toBe('/equipos/b')
    expect(rutaEnOtroGrupo('/equipos/a/datos', B)).toBe('/equipos/b')
  })
})

describe('si la subpantalla no aplica, se cae en la ficha del grupo', () => {
  it('el Cuaderno no existe en Infantil', () => {
    // Sin error y sin pantalla en blanco: el destino siempre existe.
    expect(rutaEnOtroGrupo('/cuaderno/a', INF)).toBe('/grupos/inf')
  })

  it('y la pantalla de Infantil no existe en Primaria', () => {
    expect(rutaEnOtroGrupo('/infantil/inf', B)).toBe('/grupos/b')
  })

  it('una sección que no lleva grupo dentro cae también en la ficha', () => {
    expect(rutaEnOtroGrupo('/ajustes', B)).toBe('/grupos/b')
    expect(rutaEnOtroGrupo('/hoy', B)).toBe('/grupos/b')
    expect(rutaEnOtroGrupo('', B)).toBe('/grupos/b')
  })

  it('la ficha del grupo es el destino que siempre existe', () => {
    expect(rutaPrincipalDe(B)).toBe('/grupos/b')
    expect(rutaPrincipalDe(INF)).toBe('/grupos/inf')
  })
})

describe('esRutaDeGrupo', () => {
  it('reconoce las que llevan un grupo dentro', () => {
    expect(esRutaDeGrupo('/grupos/a')).toBe(true)
    expect(esRutaDeGrupo('/asistencia/a/2026-09-08')).toBe(true)
  })

  it('y descarta las que no', () => {
    expect(esRutaDeGrupo('/grupos')).toBe(false)
    expect(esRutaDeGrupo('/ajustes')).toBe(false)
    expect(esRutaDeGrupo('/alumnos/a1')).toBe(false)
  })
})

/**
 * El «Atrás» no se prueba aquí porque no es de este módulo: quien lo protege es
 * `reemplazarRuta` (`lib/router.ts`), que sustituye la entrada del historial en
 * vez de apilarla. Se comprueba sobre la fuente de las vistas que usan el
 * desplegable, porque llamar a `navegar` en su lugar convertiría cada cambio de
 * grupo en un paso atrás y «Atrás» dejaría de salir al listado.
 */
describe('cambiar de grupo no es historial de navegación', () => {
  it('las vistas con desplegable reemplazan la ruta, no la apilan', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raiz = join(import.meta.dirname, '..', 'pages')

    for (const vista of ['GrupoDetalle.tsx', 'PaseLista.tsx']) {
      const fuente = readFileSync(join(raiz, vista), 'utf-8')
      const desde = fuente.indexOf('tituloSlot=')
      expect(desde, `${vista} ya no monta el desplegable`).toBeGreaterThan(-1)
      const slot = fuente.slice(desde, fuente.indexOf('subtitulo=', desde))
      expect(slot, `${vista} apila la ruta al cambiar de grupo`).toContain('reemplazarRuta(')
      expect(slot).not.toMatch(/[^r]navegar\(/)
    }
  })
})
