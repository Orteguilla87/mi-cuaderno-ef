import { describe, expect, it } from 'vitest'
import { extraerRecursos, itemsDeMaterial, textoMaterial } from './recursosTexto'

describe('extraerRecursos', () => {
  it('trocea una lista en una sola línea bajo etiqueta', () => {
    const { recursos } = extraerRecursos('Material: 12 conos, 4 aros · 2 balones de gomaespuma')
    expect(recursos).toEqual(['12 conos', '4 aros', '2 balones de gomaespuma'])
  })

  it('lee la lista de viñetas que sigue a la etiqueta', () => {
    const { recursos } = extraerRecursos(
      ['Recursos necesarios:', '- 12 conos', '- 4 aros', '', 'Desarrollo de la sesión.'].join('\n'),
    )
    expect(recursos).toEqual(['12 conos', '4 aros'])
  })

  it('sin etiqueta no adivina material en la descripción', () => {
    const { recursos } = extraerRecursos(
      'Los conos del principio se recogen al final, y los aros se guardan en el carro.',
    )
    expect(recursos).toEqual([])
  })

  it('deduplica ignorando mayúsculas, tildes y espacios de sobra', () => {
    const { recursos } = extraerRecursos('Material: Aros,  aros , ARÓS')
    expect(recursos).toEqual(['Aros'])
  })

  it('marca las líneas que ha consumido para que no se repitan en la descripción', () => {
    const bloque = ['Calentamiento libre.', 'Material:', '- 12 conos', 'Vuelta a la calma.'].join('\n')
    const { lineasConsumidas } = extraerRecursos(bloque)
    expect(lineasConsumidas).toEqual([1, 2])
  })
})

describe('textoMaterial', () => {
  const dia = (fecha: string, ...clases: string[]) => ({
    fecha,
    clases: clases.map((texto, i) => ({ grupo: `Grupo ${i + 1}`, texto })),
  })

  it('un solo día: lista plana, sin markdown', () => {
    const texto = textoMaterial([dia('2026-09-22', 'Material: 12 conos, 4 aros')])
    expect(texto).toContain('- 12 conos')
    expect(texto).toContain('- 4 aros')
    expect(texto).not.toContain('#')
    expect(texto).not.toContain('|')
  })

  it('deduplica entre las clases del mismo día', () => {
    const texto = textoMaterial([
      dia('2026-09-22', 'Material: 12 conos, 4 aros', 'Material: 4 ARÓS, 6 picas'),
    ])
    expect(texto.match(/aros/gi)).toHaveLength(1)
    expect(texto).toContain('- 6 picas')
  })

  it('dos cantidades distintas del mismo material NO se funden', () => {
    const texto = textoMaterial([dia('2026-09-22', 'Material: 12 conos', 'Material: 6 conos')])
    expect(texto).toContain('- 12 conos')
    expect(texto).toContain('- 6 conos')
  })

  it('varios días: un bloque por día y el total de la semana', () => {
    const texto = textoMaterial([
      dia('2026-09-22', 'Material: 12 conos'),
      dia('2026-09-23', 'Material: 4 aros, 12 conos'),
    ])
    expect(texto).toContain('Total de la semana')
    // El total no repite los conos aunque salgan los dos días.
    const total = texto.slice(texto.indexOf('Total de la semana'))
    expect(total.match(/conos/g)).toHaveLength(1)
    expect(total).toContain('- 4 aros')
  })

  it('los días sin material no aparecen', () => {
    const texto = textoMaterial([dia('2026-09-22', 'Material: 12 conos'), dia('2026-09-23', '')])
    expect(texto).not.toContain('Total de la semana')
    expect(texto).toContain('12 conos')
  })

  it('sin material en todo el rango devuelve cadena vacía', () => {
    expect(textoMaterial([dia('2026-09-22', ''), dia('2026-09-23')])).toBe('')
  })

  // El caso que se coló hasta probarlo de punta a punta: lo que el importador
  // guarda en `recursosNecesarios` es la lista ya limpia, SIN etiqueta.
  it('lee el campo de material tal como lo deja la importación, sin etiqueta', () => {
    const texto = textoMaterial([dia('2026-09-22', '25 balones de baloncesto, 12 conos')])
    expect(texto).toContain('- 25 balones de baloncesto')
    expect(texto).toContain('- 12 conos')
  })
})

describe('itemsDeMaterial', () => {
  it('trocea el campo entero aunque no lleve etiqueta', () => {
    expect(itemsDeMaterial('25 balones de baloncesto, 12 conos')).toEqual([
      '25 balones de baloncesto',
      '12 conos',
    ])
  })

  it('sigue entendiendo la etiqueta si el usuario la escribe a mano', () => {
    expect(itemsDeMaterial('Material: 4 aros, 6 picas')).toEqual(['4 aros', '6 picas'])
  })

  it('acepta una lista de viñetas escrita a mano en el campo', () => {
    expect(itemsDeMaterial('- 4 aros\n- 6 picas')).toEqual(['4 aros', '6 picas'])
  })

  it('deduplica y no devuelve nada con el campo vacío', () => {
    expect(itemsDeMaterial('aros, AROS')).toEqual(['aros'])
    expect(itemsDeMaterial('   ')).toEqual([])
  })
})
