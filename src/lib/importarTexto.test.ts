import { describe, expect, it } from 'vitest'
import { analizarTexto, fusionarSesiones, normalizarPegado } from './importarTexto'

describe('normalizarPegado', () => {
  it('unifica saltos de línea, espacios duros y viñetas de Word', () => {
    const texto = normalizarPegado('Uno\r\nDos tres\r• cuatro   ')
    expect(texto).toBe('Uno\nDos tres\n- cuatro')
  })
})

describe('analizarTexto — troceo', () => {
  it('un texto sin encabezados es UNA sesión', () => {
    const { sesiones, ambiguo } = analizarTexto(
      'Calentamiento con desplazamientos.\nJuego de los diez pases.\nEstiramientos.',
    )
    expect(sesiones).toHaveLength(1)
    expect(ambiguo).toBe(false)
  })

  it('trocea por «SESIÓN N» y no marca ambigüedad', () => {
    const texto = [
      'UD 3: Habilidades con móvil',
      '',
      'Sesión 1: Familiarización',
      'Botar el balón por el espacio.',
      '',
      'Sesión 2: Pases',
      'Pases por parejas.',
      '',
      'Sesión 3: Juego global',
      'Diez pases.',
    ].join('\n')

    const r = analizarTexto(texto)
    expect(r.sesiones).toHaveLength(3)
    expect(r.ambiguo).toBe(false)
    expect(r.tituloUnidad).toBe('UD 3: Habilidades con móvil')
    expect(r.sesiones.map((s) => s.titulo)).toEqual(['Familiarización', 'Pases', 'Juego global'])
    expect(r.sesiones[0].patronDeteccion).toBe('sesion-n')
  })

  it('trocea por encabezados markdown', () => {
    const r = analizarTexto('# Unidad\n\n## Primera\nTexto.\n\n## Segunda\nMás texto.')
    expect(r.sesiones).toHaveLength(3)
    expect(r.ambiguo).toBe(false)
  })

  it('una lista numerada de actividades NO se trocea en sesiones', () => {
    const texto = [
      'Sesión de iniciación al salto',
      '1. Calentamiento articular',
      '2. Saltos a la comba',
      '3. Vuelta a la calma',
    ].join('\n')
    expect(analizarTexto(texto).sesiones).toHaveLength(1)
  })

  it('una numeración con bloques largos sí trocea, pero marca ambigüedad', () => {
    const cuerpo =
      'Se organiza la clase en cuatro grupos y cada uno trabaja en una estación distinta, ' +
      'rotando cada cinco minutos hasta completar el circuito entero de la sesión.'
    const texto = ['1. Circuito de equilibrio', cuerpo, '2. Circuito de saltos', cuerpo].join('\n')
    const r = analizarTexto(texto)
    expect(r.sesiones).toHaveLength(2)
    expect(r.ambiguo).toBe(true)
    expect(r.sesiones[0].patronDeteccion).toBe('numerada')
  })

  it('encabezados en mayúsculas trocean pero marcan ambigüedad', () => {
    const r = analizarTexto('ASAMBLEA\nNos sentamos.\n\nEXPLORACIÓN\nRecorremos el circuito.')
    expect(r.sesiones).toHaveLength(2)
    expect(r.ambiguo).toBe(true)
  })
})

describe('analizarTexto — títulos', () => {
  it('la etiqueta explícita no es provisional', () => {
    const { sesiones } = analizarTexto('Título: El bosque de los sentidos\nRecorrido sensorial.')
    expect(sesiones[0].titulo).toBe('El bosque de los sentidos')
    expect(sesiones[0].tituloProvisional).toBe(false)
  })

  it('un encabezado deducido queda marcado como provisional', () => {
    const { sesiones } = analizarTexto('Sesión 1: Familiarización\nBotar el balón.')
    expect(sesiones[0].titulo).toBe('Familiarización')
    expect(sesiones[0].tituloProvisional).toBe(true)
  })

  it('sin candidato el título queda undefined, no se inventa', () => {
    const { sesiones } = analizarTexto(
      'Se empieza corriendo por el espacio hasta que suena el silbato, y entonces cada uno busca pareja.',
    )
    expect(sesiones[0].titulo).toBeUndefined()
  })

  it('«Sesión 3» a secas no es un título: es una posición', () => {
    const { sesiones } = analizarTexto('Sesión 3\nJuegos de persecución.\n\nSesión 4\nRelevos.')
    expect(sesiones[0].titulo).toBeUndefined()
    // Y el encabezado no se cuela en la descripción.
    expect(sesiones[0].descripcion).toBe('Juegos de persecución.')
  })

  it('la etiqueta de unidad manda sobre cualquier deducción', () => {
    for (const etiqueta of [
      'Unidad: Nos movemos por el espacio',
      'UD: Nos movemos por el espacio',
      'U.D.: Nos movemos por el espacio',
      'Unidad didáctica: Nos movemos por el espacio',
      'Título: Nos movemos por el espacio',
    ]) {
      const r = analizarTexto(`${etiqueta}\n\nSesión 1: Uno\nTexto.`)
      expect(r.tituloUnidad).toBe('Nos movemos por el espacio')
    }
  })

  it('«UNIDAD 1» a secas no es el título: se coge la línea de debajo', () => {
    const r = analizarTexto('UNIDAD 1\nNos movemos por el espacio\n\nSesión 1: Uno\nTexto.')
    expect(r.tituloUnidad).toBe('Nos movemos por el espacio')
  })

  it('la etiqueta puede ir debajo de la posición', () => {
    const r = analizarTexto('UD 2\nTítulo: El bosque de los sentidos\n\nSesión 1: Uno\nTexto.')
    expect(r.tituloUnidad).toBe('El bosque de los sentidos')
  })

  it('sin encabezado por encima del primer corte no hay título de unidad', () => {
    const r = analizarTexto(
      'Esta programación se ha diseñado para el segundo trimestre del curso, en el pabellón.\n\nSesión 1: Uno\nTexto.',
    )
    expect(r.tituloUnidad).toBeUndefined()
  })
})

describe('analizarTexto — recursos y enlaces', () => {
  it('los recursos salen del extractor y no se repiten en la descripción', () => {
    const { sesiones } = analizarTexto(
      ['Sesión 1: Pases', 'Pases por parejas.', 'Material: 10 balones, 4 conos'].join('\n'),
    )
    expect(sesiones[0].recursos).toEqual(['10 balones', '4 conos'])
    expect(sesiones[0].descripcion).toBe('Pases por parejas.')
  })

  it('sin recursos, la lista queda vacía', () => {
    const { sesiones } = analizarTexto('Sesión 1: Pases\nPases por parejas.')
    expect(sesiones[0].recursos).toEqual([])
    expect(sesiones[0].enlacesYNotas).toBe('')
  })

  it('un enlace bajo etiqueta se MUEVE fuera de la descripción', () => {
    const { sesiones } = analizarTexto(
      ['Sesión 1: Pases', 'Pases por parejas.', 'Enlaces: https://ejemplo.org/pases'].join('\n'),
    )
    expect(sesiones[0].enlacesYNotas).toBe('https://ejemplo.org/pases')
    expect(sesiones[0].descripcion).toBe('Pases por parejas.')
  })

  it('un enlace en línea propia se mueve; uno dentro de una frase se copia y se deja', () => {
    const { sesiones } = analizarTexto(
      [
        'Sesión 1: Pases',
        'https://ejemplo.org/suelto',
        'El vídeo de https://ejemplo.org/dentro explica la progresión.',
      ].join('\n'),
    )
    expect(sesiones[0].enlacesYNotas.split('\n')).toEqual([
      'https://ejemplo.org/suelto',
      'https://ejemplo.org/dentro',
    ])
    expect(sesiones[0].descripcion).toBe(
      'El vídeo de https://ejemplo.org/dentro explica la progresión.',
    )
  })

  it('conserva los apartados didácticos tal cual, sin reordenarlos', () => {
    const cuerpo = 'Asamblea\nNos sentamos.\n\nExploración\nRecorremos.\n\nRepresentación\nDibujamos.'
    const { sesiones } = analizarTexto(`Título: El bosque\n${cuerpo}`)
    expect(sesiones[0].descripcion).toBe(cuerpo)
  })
})

describe('fusionarSesiones', () => {
  it('el título de la segunda baja a la descripción y los recursos se unen', () => {
    const r = analizarTexto('ASAMBLEA\nNos sentamos.\nMaterial: 4 aros\n\nEXPLORACIÓN\nRecorremos.')
    const unida = fusionarSesiones(r.sesiones[0], r.sesiones[1])
    expect(unida.titulo).toBe('ASAMBLEA')
    expect(unida.descripcion).toContain('EXPLORACIÓN')
    expect(unida.descripcion).toContain('Recorremos.')
    expect(unida.recursos).toEqual(['4 aros'])
  })
})

describe('analizarTexto — reparto del apartado de material', () => {
  const texto = [
    '## Sesión 1: Bote',
    'Calentamiento con desplazamientos.',
    'MATERIAL:',
    '- 10 conos',
    '- 4 aros grandes',
    '- https://ejemplo.org/video',
    '',
    '## Sesión 2: Pases',
    'Trabajo por parejas.',
    'Material: 8 balones',
  ].join('\n')

  it('cada sesión se queda con SU material, no todo en la primera', () => {
    const { sesiones } = analizarTexto(texto)
    expect(sesiones[0].recursos).toEqual(['10 conos', '4 aros grandes'])
    expect(sesiones[1].recursos).toEqual(['8 balones'])
  })

  it('la URL del bloque de material va a «Enlaces y notas», no a recursos', () => {
    const { sesiones } = analizarTexto(texto)
    expect(sesiones[0].enlacesYNotas).toBe('https://ejemplo.org/video')
    expect(sesiones[0].recursos).not.toContain('https://ejemplo.org/video')
  })

  it('es un movimiento: la descripción ya no contiene el bloque de material', () => {
    const { sesiones } = analizarTexto(texto)
    expect(sesiones[0].descripcion).toBe('Calentamiento con desplazamientos.')
    expect(sesiones[0].descripcion).not.toContain('MATERIAL')
    expect(sesiones[0].descripcion).not.toContain('conos')
  })

  it('sin bloque de material la descripción queda intacta', () => {
    const { sesiones } = analizarTexto(
      ['## Sesión 1: Bote', 'Los conos del principio se recogen al final.', 'Estiramientos.'].join('\n'),
    )
    expect(sesiones[0].recursos).toEqual([])
    expect(sesiones[0].descripcion).toBe('Los conos del principio se recogen al final.\nEstiramientos.')
  })

  it('el hueco del bloque no deja líneas en blanco de más', () => {
    const { sesiones } = analizarTexto(
      ['## Sesión 1: Bote', 'Antes.', '', 'Material:', '- 12 conos', '', 'Después.'].join('\n'),
    )
    expect(sesiones[0].descripcion).toBe('Antes.\n\nDespués.')
  })
})
