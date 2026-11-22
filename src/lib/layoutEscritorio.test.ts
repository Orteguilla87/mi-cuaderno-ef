import { describe, expect, it } from 'vitest'
import {
  CLASES_LAYOUT_ESCRITORIO,
  claseLayoutEscritorio,
  layoutDeRuta,
  LAYOUT_POR_SECCION,
} from './layoutEscritorio'

describe('layout de escritorio por vista (Bloque F2)', () => {
  it('las 14 vistas del menú declaran el tipo pedido', () => {
    const trabajo = ['cuaderno', 'planificador', 'calendario']
    const lectura = [
      'hoy', 'grupos', 'rubricas', 'observaciones', 'cobertura', 'informes',
      'etiquetas-alumnado', 'vincular-alumnado', 'inventario', 'herramientas', 'ajustes',
    ]
    for (const s of trabajo) expect(layoutDeRuta(`/${s}`)).toBe('trabajo')
    for (const s of lectura) expect(layoutDeRuta(`/${s}`)).toBe('lectura')
    expect(trabajo.length + lectura.length).toBe(14)
  })

  it('las subvistas heredan el de su sección y una ruta desconocida el de Hoy', () => {
    expect(layoutDeRuta('/grupos/g1')).toBe('lectura')
    expect(layoutDeRuta('/cuaderno/g1')).toBe('trabajo')
    expect(layoutDeRuta('/planificador/importar')).toBe('trabajo')
    expect(layoutDeRuta('/nada')).toBe(LAYOUT_POR_SECCION.hoy)
    expect(layoutDeRuta('/')).toBe('lectura')
  })

  it('todo lo de escritorio lleva `lg:`: nada alcanza al móvil', () => {
    for (const clases of Object.values(CLASES_LAYOUT_ESCRITORIO))
      for (const c of clases.split(' ')) expect(c.startsWith('lg:')).toBe(true)
    expect(claseLayoutEscritorio('/hoy')).toBe(CLASES_LAYOUT_ESCRITORIO.lectura)
  })
})
