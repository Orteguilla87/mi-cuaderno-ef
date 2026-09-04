import { describe, expect, it } from 'vitest'
import { aMarkdown } from './estructuraSesion'
import { bloques, trozos } from './markdown'

describe('trozos', () => {
  it('separa la negrita del resto', () => {
    expect(trozos('**Tulipán** — Juego de persecución.')).toEqual([
      { texto: 'Tulipán', fuerte: true },
      { texto: ' — Juego de persecución.', fuerte: false },
    ])
  })

  it('una línea sin negrita es un solo trozo', () => {
    expect(trozos('Texto llano')).toEqual([{ texto: 'Texto llano', fuerte: false }])
  })
})

describe('bloques', () => {
  it('distingue los dos niveles de encabezado', () => {
    const b = bloques('### Momento de recogida\n\n#### Parte principal')
    expect(b).toEqual([
      { tipo: 'titulo', nivel: 1, trozos: [{ texto: 'Momento de recogida', fuerte: false }] },
      { tipo: 'titulo', nivel: 2, trozos: [{ texto: 'Parte principal', fuerte: false }] },
    ])
  })

  it('agrupa las líneas seguidas en un párrafo y las viñetas en una lista', () => {
    const b = bloques('Una\nDos\n\n- Tres\n- Cuatro')
    expect(b.map((x) => x.tipo)).toEqual(['parrafo', 'lista'])
    expect(b[0]).toMatchObject({ tipo: 'parrafo', lineas: [[{ texto: 'Una' }], [{ texto: 'Dos' }]] })
    expect(b[1]).toMatchObject({ tipo: 'lista', items: [[{ texto: 'Tres' }], [{ texto: 'Cuatro' }]] })
  })

  it('un texto vacío no da bloques', () => {
    expect(bloques('')).toEqual([])
    expect(bloques('\n\n  \n')).toEqual([])
  })

  it('pinta la jerarquía que produce la importación', () => {
    const md = aMarkdown(
      [
        'Momento de recogida',
        'Fila y desplazamiento — Recogida del grupo en el aula.',
        'Desarrollo de las tareas',
        'Parte principal',
        'Tulipán — Juego de persecución.',
      ].join('\n'),
    )
    expect(bloques(md).map((b) => (b.tipo === 'titulo' ? `h${b.nivel}` : b.tipo))).toEqual([
      'h1',
      'parrafo',
      'h1',
      'h2',
      'parrafo',
    ])
  })
})
