import { describe, expect, it } from 'vitest'
import {
  analizarTabla,
  detectarDelimitador,
  parsearPeso,
  partirReferencia,
  trocearCsv,
} from './rubricaTabla'

/** La cabecera del formato real: Indicador · Peso · 10 · 8 · 6 · 4 · 2. */
const CABECERA = ['Indicador', 'Peso', '10', '8', '6', '4', '2']

/** Fila real, con el descriptor partido en varias líneas como lo pega Excel. */
const FILA_EXCEL = [
  '2.2.a · Cambia de dirección o de ritmo para escapar del perseguidor en al menos dos ocasiones durante el juego, en la sesión 6.',
  '40 %',
  '"Cambia de dirección y de ritmo\nde forma anticipada y eficaz"',
  'Nivel intermedio entre 10 y 6',
  '"Cambia de dirección\nen una ocasión puntual"',
  'Nivel intermedio entre 6 y 2',
  'Mantiene siempre la misma carrera sin adaptarse',
]

describe('trocearCsv', () => {
  it('respeta comillas, saltos de línea internos y comillas dobladas', () => {
    const filas = trocearCsv('a;"uno\ndos";"con ""comillas"" dentro"\nb;c;d', ';')
    expect(filas).toEqual([
      ['a', 'uno\ndos', 'con "comillas" dentro'],
      ['b', 'c', 'd'],
    ])
  })

  it('no toma por delimitación una comilla en medio de una celda', () => {
    expect(trocearCsv('mide 1" de alto,b', ',')).toEqual([['mide 1" de alto', 'b']])
  })
})

describe('detectarDelimitador', () => {
  it('elige el tabulador de un pegado de Excel aunque los descriptores lleven comas', () => {
    const texto = [CABECERA.join('\t'), FILA_EXCEL.join('\t')].join('\n')
    expect(detectarDelimitador(texto)).toBe('\t')
  })

  it('elige el punto y coma de un CSV español con comas dentro de las celdas', () => {
    const texto = [
      'Indicador;Peso;10;6;2',
      '"1.2.F - Salta, gira y cae equilibrado";30 %;"Siempre, sin dudar";A veces;Nunca',
    ].join('\n')
    expect(detectarDelimitador(texto)).toBe(';')
  })

  it('elige la coma de un CSV inglés', () => {
    expect(detectarDelimitador('Indicador,10,6,2\nSalta,Bien,Regular,Mal')).toBe(',')
  })
})

describe('parsearPeso', () => {
  it('acepta las formas habituales, con coma decimal española', () => {
    expect(parsearPeso('40 %')).toBe(40)
    expect(parsearPeso('40%')).toBe(40)
    expect(parsearPeso('40')).toBe(40)
    expect(parsearPeso('0,4')).toBe(40)
    expect(parsearPeso('0.4')).toBe(40)
    expect(parsearPeso('40,0 %')).toBe(40)
  })

  it('devuelve undefined —nunca 0— cuando no se reconoce nada', () => {
    expect(parsearPeso('mucho')).toBeUndefined()
    expect(parsearPeso('')).toBeUndefined()
    expect(parsearPeso(undefined)).toBeUndefined()
  })
})

describe('partirReferencia', () => {
  it('separa el prefijo del texto con letra y sin ella', () => {
    expect(partirReferencia('2.2.a · Cambia de dirección')).toMatchObject({
      codigo: '2.2',
      letra: 'a',
      referencia: '2.2.a',
      titulo: 'Cambia de dirección',
    })
    expect(partirReferencia('1.2.F - Salta y cae')).toMatchObject({
      codigo: '1.2',
      letra: 'F',
      referencia: '1.2.F',
      titulo: 'Salta y cae',
    })
    expect(partirReferencia('3.1: Coopera')).toMatchObject({
      codigo: '3.1',
      letra: undefined,
      referencia: '3.1',
      titulo: 'Coopera',
    })
  })

  it('deja en paz un indicador sin prefijo', () => {
    expect(partirReferencia('Salta con los dos pies')).toBeUndefined()
  })
})

describe('analizarTabla', () => {
  const excel = [CABECERA.join('\t'), FILA_EXCEL.join('\t')].join('\n')

  it('lee el pegado de Excel con descriptores largos y saltos internos', () => {
    const t = analizarTabla(excel)

    expect(t.delimitador).toBe('\t')
    expect(t.niveles.map((n) => n.valor)).toEqual([10, 8, 6, 4, 2])
    expect(t.escalaNoEstandar).toBe(false)
    expect(t.filas).toHaveLength(1)

    const f = t.filas[0]
    expect(f.referencia).toBe('2.2.a')
    expect(f.codigo).toBe('2.2')
    expect(f.pesoPct).toBe(40)
    // El texto se guarda SIN el prefijo, y el salto interno colapsado.
    expect(f.titulo.startsWith('Cambia de dirección o de ritmo')).toBe(true)
    expect(f.descripciones[0]).toBe('Cambia de dirección y de ritmo de forma anticipada y eficaz')
  })

  it('vacía los descriptores de relleno y los cuenta', () => {
    const t = analizarTabla(excel)
    expect(t.filas[0].descripciones[1]).toBe('')
    expect(t.filas[0].descripciones[3]).toBe('')
    expect(t.rellenosVaciados).toBe(2)
  })

  it('los conserva literalmente si se pide', () => {
    const t = analizarTabla(excel, { conservarRelleno: true })
    expect(t.filas[0].descripciones[1]).toBe('Nivel intermedio entre 10 y 6')
    expect(t.rellenosVaciados).toBe(0)
  })

  it('lee un CSV con punto y coma y campos entrecomillados', () => {
    const t = analizarTabla(
      [
        'Indicador;Peso;10;6;2',
        '"1.2.F - Salta, gira y cae equilibrado";30 %;"Siempre, sin dudar";A veces;Nunca',
      ].join('\n'),
    )
    expect(t.delimitador).toBe(';')
    expect(t.filas[0].titulo).toBe('Salta, gira y cae equilibrado')
    expect(t.filas[0].descripciones).toEqual(['Siempre, sin dudar', 'A veces', 'Nunca'])
  })

  it('acepta el orden de columnas alterado, con el peso al final', () => {
    const t = analizarTabla(
      ['Indicador,10,6,2,Peso', 'Salta,Bien,Regular,Mal,25 %'].join('\n'),
    )
    expect(t.mapeo).toEqual(['indicador', 'nivel', 'nivel', 'nivel', 'peso'])
    expect(t.niveles.map((n) => n.valor)).toEqual([10, 6, 2])
    expect(t.filas[0].pesoPct).toBe(25)
  })

  it('avisa cuando la escala no es la de la app y no convierte nada', () => {
    const t = analizarTabla(['Indicador;4;3;2;1', 'Salta;A;B;C;D'].join('\n'))
    expect(t.escalaNoEstandar).toBe(true)
    expect(t.niveles.map((n) => n.valor)).toEqual([4, 3, 2, 1])
  })

  it('suma los pesos y deja pasar una suma distinta de 100', () => {
    const t = analizarTabla(
      ['Indicador;Peso;10;6;2', 'A;40 %;x;y;z', 'B;0,3;x;y;z', 'C;;x;y;z'].join('\n'),
    )
    expect(t.sumaPesos).toBe(70)
    expect(t.filas[2].pesoPct).toBeUndefined()
  })

  it('marca el peso ilegible como incidencia y no lo convierte en 0', () => {
    const t = analizarTabla(['Indicador;Peso;10;6;2', 'A;bastante;x;y;z'].join('\n'))
    expect(t.filas[0].pesoPct).toBeUndefined()
    expect(t.filas[0].incidencias).toHaveLength(1)
  })

  it('descarta y cuenta las filas sin indicador', () => {
    const t = analizarTabla(['Indicador;10;6;2', 'A;x;y;z', ';p;q;r'].join('\n'))
    expect(t.filas).toHaveLength(1)
    expect(t.descartadas).toBe(1)
  })

  it('normaliza espacios duros y viñetas venidos de Word', () => {
    const t = analizarTabla(['Indicador;10;6;2', '• Salta alto;a;b;c'].join('\n'))
    expect(t.filas[0].titulo).toBe('- Salta alto')
  })

  it('sigue leyendo el formato antiguo, con niveles por etiqueta', () => {
    const t = analizarTabla(
      ['Criterio\tNo conseguido\tEn proceso\tConseguido', 'Equilibrio\tSe cae\tDuda\tFirme'].join(
        '\n',
      ),
    )
    expect(t.niveles.map((n) => n.etiqueta)).toEqual(['No conseguido', 'En proceso', 'Conseguido'])
    expect(t.niveles.map((n) => n.valor)).toEqual([3, 7, 10])
    expect(t.escalaNoEstandar).toBe(true)
    expect(t.filas[0].descripciones).toEqual(['Se cae', 'Duda', 'Firme'])
  })

  it('respeta los valores explícitos «Etiqueta:valor»', () => {
    const t = analizarTabla(['Criterio,Alto:10,Medio:6,Bajo:2', 'Fuerza,Mucha,Media,Poca'].join('\n'))
    expect(t.niveles).toEqual([
      { etiqueta: 'Alto', valor: 10 },
      { etiqueta: 'Medio', valor: 6 },
      { etiqueta: 'Bajo', valor: 2 },
    ])
  })

  it('no crea ningún nivel NE ni lee una columna como tal', () => {
    const t = analizarTabla(['Indicador;10;8;6;4;2', 'A;a;b;c;d;e'].join('\n'))
    expect(t.niveles.map((n) => n.etiqueta)).not.toContain('NE')
    expect(t.niveles).toHaveLength(5)
  })

  it('protesta si no hay ni cabecera ni filas', () => {
    expect(() => analizarTabla('')).toThrow()
    expect(() => analizarTabla('Indicador;10;6;2')).toThrow()
  })
})
