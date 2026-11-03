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
    expect(b[1]).toMatchObject({
      tipo: 'lista',
      items: [{ trozos: [{ texto: 'Tres' }] }, { trozos: [{ texto: 'Cuatro' }] }],
    })
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

  it('lista numerada con su sublista dentro y el número que traía', () => {
    const b = bloques(
      ['3. Tres', '4. Cuatro', '', '  - a', '  - b', '', '5. Cinco', '', '- Nota suelta'].join('\n'),
    )
    expect(b.map((x) => x.tipo)).toEqual(['listaOrdenada', 'lista'])
    const ol = b[0] as Extract<(typeof b)[number], { tipo: 'listaOrdenada' }>
    expect(ol.items.map((i) => i.numero)).toEqual([3, 4, 5])
    expect(ol.items[1].hijos.map((h) => h[0].texto)).toEqual(['a', 'b'])
    expect(ol.items[2].hijos).toEqual([])
  })

  it('un párrafo cierra la lista numerada', () => {
    const b = bloques('1. Uno\n\nTexto suelto.\n\n2. Dos')
    expect(b.map((x) => x.tipo)).toEqual(['listaOrdenada', 'parrafo', 'listaOrdenada'])
  })

  it('pinta las actividades importadas con las preguntas dentro del punto 4', () => {
    const md = aMarkdown(
      [
        '1. Uno (8 min · GG). A.',
        '4. Cabezas numeradas (15 min · G4). Ocho preguntas.',
        '',
        '- Núcleo (perro).',
        '- Pronombre (ellos).',
        '- Clasifica.',
        '',
        '5. Cierre (2 min · GG). Qué ha costado.',
        '',
        '- Registro: lo que falla.',
      ].join('\n'),
    )
    const b = bloques(md)
    expect(b.map((x) => x.tipo)).toEqual(['listaOrdenada', 'lista'])
    const ol = b[0] as Extract<(typeof b)[number], { tipo: 'listaOrdenada' }>
    expect(ol.items[1].trozos[0]).toEqual({ texto: 'Cabezas numeradas', fuerte: true })
    expect(ol.items[1].hijos).toHaveLength(3)
  })
})

