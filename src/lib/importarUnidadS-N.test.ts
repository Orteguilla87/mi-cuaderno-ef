import { describe, expect, it } from 'vitest'
import { analizarTexto } from './importarTexto'

/**
 * El texto REAL de la unidad que se importaba a medias: 16 sesiones y solo
 * salían 10.
 *
 * Se guarda ÍNTEGRO y con los espacios como vienen —uno al principio y otro al
 * final de cada cabecera, que es lo que deja Word al pegar—, porque el fallo
 * vivía justo ahí: la cabecera no casaba con el patrón fuerte de sesión y el
 * troceo caía en la heurística de MAYÚSCULAS, que se come las seis cabeceras
 * que llevan minúsculas (S5, S9, S13, S14, S15 y S16).
 *
 * El orden de los tokens es «S1 – UD2 – …»; antes era «UD2 – S1 – …». Ha
 * cambiado una vez y volverá a cambiar, así que la detección no puede depender
 * de cuál va delante.
 */
export const UD2_REAL = [
  ' UD2 · ¡TE LO REGALO! (pp. 24-39) ',
  ' S1 – UD2 – P.24-29 ',
  'Contenidos: apertura de la unidad ¡Te lo regalo! Lectura modelada de El califa y el pastor.',
  'Consejo: presenta el producto final (notas de agradecimiento) hoy.',
  ' S2 – UD2 – P.30 ',
  'Contenidos: comprensión lectora (literal, inferencial, crítica). Enseñanza del cuento.',
  'Consejo: para la lectura antes del desenlace y que predigan.',
  ' S3 – UD2 – P.31 ',
  'Contenidos: vocabulario — campo léxico.',
  'Consejo: contrástalo con el campo semántico de la UD1.',
  ' S4 – UD2 – P.32 ',
  'Contenidos: ortografía — acentuación de palabras agudas (regla).',
  'Dictado 1: diagnóstico de la UD1 — clasificación tónica.',
  'Consejo: la regla no se sostiene si la tónica falla.',
  ' S5 – UD2 – SESIÓN DE LECTURA · Libro B, bloque 2 (p. 24) ',
  'Lectura: Diario de Álex — ¿Por qué a él sí y a mí no?',
  'Consejo: lectura en parejas con roles.',
  ' S6 – UD2 – P.33 ',
  'Contenidos: práctica de acentuación de agudas.',
  'Consejo: tantas agudas sin tilde como con tilde.',
  ' S7 – UD2 – P.34 ',
  'Contenidos: gramática — los pronombres personales.',
  'Consejo: parte de la sustitución del sintagma nominal.',
  ' S8 – UD2 – P.35 ',
  'Contenidos: práctica de pronombres: evitar repeticiones en un texto.',
  'Dictado 2: El regalo del califa — agudas con y sin tilde + pronombres personales.',
  'Consejo: error típico mi / mí.',
  ' S9 – UD2 – SESIÓN DE LECTURA · Libro A, bloque 6 (p. 60) ',
  'Lectura: El duende de la ñ · ¿Quién era Johannes Gutenberg?',
  'Consejo: prepara la alfabetización mediática de la S11.',
  ' S10 – UD2 – P.32-35 · REFUERZO ',
  'Contenidos: taller de errores de los dictados 1 y 2 + pronombres en contexto.',
  'Consejo: selecciona los 5 errores más repetidos del grupo.',
  ' S11 – UD2 – P.36-37 ',
  'Contenidos: otros textos — texto informativo El arte de regalar.',
  'Consejo: compara con el cuento de la S1.',
  ' S12 – UD2 – P.38-39 ',
  'Contenidos: taller — notas de agradecimiento: planificación, redacción y entrega real.',
  'Consejo: da plantilla cerrada.',
  ' S13 – UD2 – SESIÓN DE LECTURA · Libro A, bloque 2 (p. 17) ',
  'Lectura: Trocólo, un duende de imprenta · poesías Libros baratos, Don Libro está helado.',
  'Consejo: alterna prosa y verso en la misma sesión.',
  ' S14 – UD2 – PRUEBA ESCRITA I · Material propio ',
  'Contenidos: comprensión lectora de un texto informativo nuevo + expresión escrita.',
  'Consejo: el texto debe ser nuevo, o mides memoria.',
  ' S15 – UD2 – PRUEBA ESCRITA II · Material propio ',
  'Contenidos: pronombres personales, campo léxico, acentuación de agudas + ítems de la UD1.',
  'Dictado 3 (evaluable): repaso UD1 + agudas mezcladas.',
  'Consejo: clasifica los errores del dictado por tipo.',
  ' S16 – UD2 – PRUEBAS ORALES · Material propio ',
  'Contenidos: devolución de las pruebas escritas (15 min) · comprensión oral.',
  'Consejo: quien falla en instrucciones encadenadas suele fallar por memoria de trabajo.',
].join('\n')

/** El mismo texto con el orden de tokens de antes: «UD2 – S1 – …». */
const UD2_ORDEN_ANTIGUO = UD2_REAL.split('\n')
  .map((l) => l.replace(/^ S(\d+) – UD2 – /, ' UD2 – S$1 – '))
  .join('\n')

/**
 * La primera línea de cada sesión, para mirar por dónde cortó. Se lee sobre
 * `r.texto` —el texto YA normalizado—, que es donde están medidos los offsets.
 */
const cabeceras = (texto: string) => {
  const r = analizarTexto(texto)
  return r.sesiones.map((s) => r.texto.slice(s.inicioEnTexto).split('\n')[0].trim())
}

describe('importar unidad — cabeceras «S1 – UD2 – …»', () => {
  it('trocea las 16 sesiones, de la 1 a la 16 y en orden', () => {
    const r = analizarTexto(UD2_REAL)
    expect(r.sesiones).toHaveLength(16)
    expect(cabeceras(UD2_REAL).map((l) => /^S(\d+)/.exec(l)?.[1])).toEqual(
      Array.from({ length: 16 }, (_, i) => String(i + 1)),
    )
  })

  it('detecta las cabeceras con minúsculas, que la heurística de mayúsculas se comía', () => {
    const vistas = cabeceras(UD2_REAL)
    for (const n of [5, 9, 13, 14, 15, 16]) {
      expect(vistas.some((l) => l.startsWith(`S${n} `))).toBe(true)
    }
  })

  it('no corta por un consejo que menciona otra sesión', () => {
    // «Consejo: … alfabetización mediática de la S11» no es la sesión 11.
    expect(analizarTexto(UD2_REAL).sesiones).toHaveLength(16)
    const consejo = analizarTexto(UD2_REAL).sesiones[8]
    expect(consejo.descripcion + consejo.enlacesYNotas).toContain('alfabetización mediática')
  })

  it('da igual que la unidad vaya antes que la sesión', () => {
    expect(analizarTexto(UD2_ORDEN_ANTIGUO).sesiones).toHaveLength(16)
  })

  it('no marca el troceo como ambiguo', () => {
    expect(analizarTexto(UD2_REAL).ambiguo).toBe(false)
  })

  it('saca el título de la unidad del preámbulo', () => {
    expect(analizarTexto(UD2_REAL).tituloUnidad).toBe('UD2 · ¡TE LO REGALO! (pp. 24-39)')
  })

  it('deja los títulos de sesión sin los tokens S ni UD', () => {
    const titulos = analizarTexto(UD2_REAL).sesiones.map((s) => s.titulo)
    expect(titulos[0]).toBe('P.24-29')
    expect(titulos[4]).toBe('SESIÓN DE LECTURA · Libro B, bloque 2 (p. 24)')
    expect(titulos[9]).toBe('P.32-35 · REFUERZO')
    expect(titulos[13]).toBe('PRUEBA ESCRITA I · Material propio')
    for (const t of titulos) {
      expect(t).not.toMatch(/^S\d/)
      expect(t).not.toMatch(/UD\s*\d/)
    }
  })

  it('avisa de los números que faltan en vez de fusionar en silencio', () => {
    expect(analizarTexto(UD2_REAL).sesionesFaltantes).toEqual([])

    const sinS7 = UD2_REAL.split('\n')
      .filter((l) => !l.startsWith(' S7 '))
      .join('\n')
    const r = analizarTexto(sinS7)
    expect(r.sesiones).toHaveLength(15)
    expect(r.sesionesFaltantes).toEqual([7])
  })
})

describe('importar unidad — sin topes ni regresiones de formato', () => {
  it('una unidad de 25 sesiones sale con 25', () => {
    const texto = ['UD9 · UNIDAD LARGA (pp. 1-50)']
      .concat(
        Array.from(
          { length: 25 },
          (_, i) => ` S${i + 1} – UD9 – P.${i + 1}\nContenidos: lo de siempre.\nConsejo: nada.`,
        ),
      )
      .join('\n')
    const r = analizarTexto(texto)
    expect(r.sesiones).toHaveLength(25)
    expect(r.sesionesFaltantes).toEqual([])
  })

  it('el formato antiguo «Sesión 1 · Título» sigue funcionando', () => {
    const texto = Array.from(
      { length: 16 },
      (_, i) => `Sesión ${i + 1} · Título ${i + 1}\nTexto de la sesión.`,
    ).join('\n')
    const r = analizarTexto(texto)
    expect(r.sesiones).toHaveLength(16)
    expect(r.sesiones[0].patronDeteccion).toBe('sesion-n')
    expect(r.sesiones[0].titulo).toBe('Título 1')
  })
})

describe('importar unidad — reparto por campos', () => {
  const sesion = () => analizarTexto(UD2_REAL).sesiones[3] // S4: contenidos + dictado + consejo

  it('«Consejo:» va a enlaces y notas', () => {
    expect(sesion().enlacesYNotas).toBe('la regla no se sostiene si la tónica falla.')
    expect(sesion().descripcion).not.toContain('la tónica falla')
  })

  it('«Contenidos:» y «Dictado N:» se quedan en la descripción, con la etiqueta en negrita', () => {
    const d = sesion().descripcion
    expect(d).toContain('**Contenidos:** ortografía — acentuación de palabras agudas (regla).')
    expect(d).toContain('**Dictado 1:** diagnóstico de la UD1 — clasificación tónica.')
  })

  it('«Lectura:» también se queda en la descripción', () => {
    const s5 = analizarTexto(UD2_REAL).sesiones[4]
    expect(s5.descripcion).toContain('**Lectura:** Diario de Álex — ¿Por qué a él sí y a mí no?')
  })
})
