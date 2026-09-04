import { describe, expect, it } from 'vitest'
import { aMarkdown, comoActividad, esEncabezadoReservado } from './estructuraSesion'
import { analizarTexto } from './importarTexto'
import { extraerRecursos, itemsDeMaterial } from './recursosTexto'

/**
 * El texto REAL de la programación del usuario, con la forma que tiene que
 * funcionar: «Sesión N · Título», «Recursos:» en una línea con punto medio, y
 * tres niveles de jerarquía (momento / submomento / actividad con guion largo).
 *
 * Es el caso que se rompía: el bloque de material se abría siempre y seguía
 * capturando por «línea corta sin punto final», así que «Momento de recogida»
 * acababa en la lista de la compra y la jerarquía se perdía entera.
 */
const SESIONES: string[][] = [
  [
    'Sesión 1 · Bienvenidos a Educación Física',
    'Recursos: Conos para delimitar · pandereta · cartel de señales',
    'Momento de recogida',
    'Fila y desplazamiento — Recogida del grupo en el aula y desplazamiento hasta la pista, en fila y sin adelantar.',
    'Reconocimiento del espacio — El grupo recorre andando el perímetro de la pista para ver dónde acaba.',
    'Desarrollo de las tareas',
    'Puesta en acción',
    'Nos movemos y nos paramos — Desplazamiento libre por la pista, parando al oír la pandereta.',
    'Parte principal',
    'Las tres señales — Actividad clave de la sesión: cada señal pide una forma de desplazarse.',
    'Tulipán — Juego de persecución con todo el grupo.',
    'Fase de recuperación',
    'Círculo de nombres — Sentados en círculo.',
    'Momento de despedida y propuesta crítica',
    'Qué hacemos en Educación Física — Explicación breve de para qué sirve la asignatura.',
  ],
  [
    'Sesión 2 · Nos preparamos para movernos',
    'Recursos: Conos · altavoz',
    'Momento de recogida',
    'Fila y desplazamiento — Recogida del grupo y subida a la pista.',
    'Desarrollo de las tareas',
    'Calentamiento',
    'Movemos las articulaciones — De arriba abajo, sin prisa.',
    'Parte principal',
    'El pañuelo — Dos equipos enfrentados y un número cantado.',
    'Vuelta a la calma',
    'Respiramos — Tumbados, con la mano en la barriga.',
  ],
  ['Sesión 3 · Saltamos', 'Recursos: combas · colchonetas', 'Parte principal', 'La comba larga — Dos giran y el resto entra por turnos.'],
  ['Sesión 4 · Lanzamos y recibimos', 'Recursos: pelotas de gomaespuma', 'Parte principal', 'Diez pases — Por equipos, sin que caiga la pelota.'],
  ['Sesión 5 · Equilibrios', 'Recursos: bancos suecos · ladrillos', 'Parte principal', 'El río — Cruzar de un lado al otro sin pisar el suelo.'],
  ['Sesión 6 · Giros', 'Recursos: colchonetas', 'Parte principal', 'La croqueta — Giro longitudinal sobre la colchoneta.'],
  ['Sesión 7 · Juegos cooperativos', 'Recursos: paracaídas · pelota grande', 'Parte principal', 'El mar y las olas — Todo el grupo agitando el paracaídas a la vez.'],
  ['Sesión 8 · Repaso y despedida', 'Recursos: material de las sesiones anteriores', 'Momento de despedida y propuesta crítica', 'Qué nos ha gustado — Ronda de opiniones en círculo.'],
]

const TEXTO = SESIONES.map((s) => s.join('\n')).join('\n')

describe('programación real pegada — el bug de los materiales', () => {
  const { sesiones } = analizarTexto(TEXTO)

  it('salen las ocho sesiones', () => {
    expect(sesiones).toHaveLength(8)
  })

  it('ningún encabezado de momento ni de submomento acaba como material', () => {
    const prohibidos = [
      'momento de recogida',
      'momento de despedida y propuesta crítica',
      'desarrollo de las tareas',
      'puesta en acción',
      'parte principal',
      'fase de recuperación',
      'calentamiento',
      'vuelta a la calma',
    ]
    const todos = sesiones.flatMap((s) => s.recursos.map((r) => r.toLocaleLowerCase('es')))
    for (const p of prohibidos) expect(todos).not.toContain(p)
  })

  it('la sesión 1 se queda con sus tres materiales, y solo con esos', () => {
    expect(sesiones[0].recursos).toEqual([
      'Conos para delimitar',
      'pandereta',
      'cartel de señales',
    ])
  })

  it('la sesión 2 se queda con sus dos materiales', () => {
    expect(sesiones[1].recursos).toEqual(['Conos', 'altavoz'])
  })

  it('cada sesión se queda solo con SUS recursos', () => {
    expect(sesiones.map((s) => s.recursos)).toEqual([
      ['Conos para delimitar', 'pandereta', 'cartel de señales'],
      ['Conos', 'altavoz'],
      ['combas', 'colchonetas'],
      ['pelotas de gomaespuma'],
      ['bancos suecos', 'ladrillos'],
      ['colchonetas'],
      ['paracaídas', 'pelota grande'],
      ['material de las sesiones anteriores'],
    ])
  })

  it('la línea «Recursos: …» no se queda en la descripción', () => {
    for (const s of sesiones) expect(s.descripcion).not.toMatch(/Recursos\s*:/i)
  })

  it('los títulos van sin el prefijo «Sesión N ·»', () => {
    expect(sesiones.map((s) => s.titulo)).toEqual([
      'Bienvenidos a Educación Física',
      'Nos preparamos para movernos',
      'Saltamos',
      'Lanzamos y recibimos',
      'Equilibrios',
      'Giros',
      'Juegos cooperativos',
      'Repaso y despedida',
    ])
  })
})

describe('programación real pegada — la jerarquía en la descripción', () => {
  const { sesiones } = analizarTexto(TEXTO)

  it('los tres niveles quedan marcados en el markdown', () => {
    const d = sesiones[0].descripcion
    expect(d).toContain('### Momento de recogida')
    expect(d).toContain('### Desarrollo de las tareas')
    expect(d).toContain('### Momento de despedida y propuesta crítica')
    expect(d).toContain('#### Puesta en acción')
    expect(d).toContain('#### Parte principal')
    expect(d).toContain('#### Fase de recuperación')
  })

  it('las actividades con guion largo salen en negrita, con su descripción detrás', () => {
    const d = sesiones[0].descripcion
    expect(d).toContain('**Tulipán** — Juego de persecución con todo el grupo.')
    expect(d).toContain('**Círculo de nombres** — Sentados en círculo.')
    expect(d).toMatch(/\*\*Fila y desplazamiento\*\* — Recogida del grupo/)
  })

  it('los bloques van separados por una línea en blanco', () => {
    expect(sesiones[0].descripcion).toContain('\n\n### Desarrollo de las tareas\n\n')
  })

  it('el orden del texto se conserva', () => {
    const d = sesiones[0].descripcion
    expect(d.indexOf('### Momento de recogida')).toBeLessThan(d.indexOf('### Desarrollo'))
    expect(d.indexOf('#### Puesta en acción')).toBeLessThan(d.indexOf('#### Parte principal'))
    expect(d.indexOf('#### Parte principal')).toBeLessThan(d.indexOf('#### Fase de recuperación'))
  })
})

describe('comoActividad — un guion largo no es siempre una actividad', () => {
  it('rótulo corto y descripción que empieza en mayúscula: sí es actividad', () => {
    expect(comoActividad('Tulipán — Juego de persecución con todo el grupo.')).toEqual({
      nombre: 'Tulipán',
      descripcion: 'Juego de persecución con todo el grupo.',
    })
  })

  it('un guion largo dentro de una frase NO genera actividad', () => {
    const frase =
      'Los conos delimitan el espacio — no se puede salir de ahí bajo ningún concepto y hay que avisar.'
    expect(comoActividad(frase)).toBeNull()
    expect(aMarkdown(frase)).toBe(frase)
  })

  it('un guion incidental a media frase tampoco', () => {
    const frase =
      'Se colocan en círculo y, cuando suena la pandereta, se paran donde estén — sin empujar a nadie.'
    expect(comoActividad(frase)).toBeNull()
  })

  it('el guion corto no separa actividades: es un guion', () => {
    expect(comoActividad('Ida - vuelta al cono y otra vez a la fila')).toBeNull()
  })

  it('un nombre con punto no es un rótulo', () => {
    expect(comoActividad('Ya está. — Se recoge todo y se vuelve al aula.')).toBeNull()
  })

  it('aMarkdown es idempotente sobre lo que ya está marcado', () => {
    const md = aMarkdown('Momento de recogida\nTulipán — Juego de persecución.')
    expect(aMarkdown(md)).toBe(md)
  })
})

describe('encabezados reservados — nunca son material', () => {
  it('cortan un bloque de material abierto', () => {
    const { recursos } = extraerRecursos(
      ['Material:', '- 12 conos', 'Parte principal', '- 4 aros'].join('\n'),
    )
    expect(recursos).toEqual(['12 conos'])
  })

  it('cortan también una lista suelta, sin viñetas', () => {
    const { recursos } = extraerRecursos(
      ['Material:', '12 conos', 'Parte principal', 'esto ya es la descripción'].join('\n'),
    )
    expect(recursos).toEqual(['12 conos'])
  })

  it('una actividad corta la lista aunque la línea sea corta', () => {
    const { recursos } = extraerRecursos(
      ['Recursos: conos · pandereta', 'Tulipán — Persecución'].join('\n'),
    )
    expect(recursos).toEqual(['conos', 'pandereta'])
  })

  it('con viñeta delante siguen siendo encabezados', () => {
    const { recursos } = extraerRecursos(
      ['Material:', '- 12 conos', '- Momento de recogida', '- 4 aros'].join('\n'),
    )
    expect(recursos).toEqual(['12 conos'])
  })

  it('tampoco cuelan por el campo de material ya guardado', () => {
    expect(itemsDeMaterial('conos\nParte principal\naros')).toEqual(['conos', 'aros'])
  })

  it('reconoce el momento con y sin la coletilla', () => {
    expect(esEncabezadoReservado('Momento de despedida')).toBe(true)
    expect(esEncabezadoReservado('Momento de despedida y propuesta crítica')).toBe(true)
    expect(esEncabezadoReservado('Momento de recogida')).toBe(true)
    expect(esEncabezadoReservado('Momentos de tensión en el juego')).toBe(false)
  })
})

describe('«Preparar el material» consume el mismo extractor', () => {
  it('el campo que deja la importación se sigue leyendo entero', () => {
    const { sesiones } = analizarTexto(TEXTO)
    // Es exactamente lo que `importarUnidad` guarda en `recursosNecesarios`.
    const campo = sesiones[0].recursos.join(', ')
    expect(itemsDeMaterial(campo)).toEqual([
      'Conos para delimitar',
      'pandereta',
      'cartel de señales',
    ])
  })

  it('el punto medio también sirve de separador en el campo guardado', () => {
    expect(itemsDeMaterial('Conos · pandereta · cartel de señales')).toEqual([
      'Conos',
      'pandereta',
      'cartel de señales',
    ])
  })
})
