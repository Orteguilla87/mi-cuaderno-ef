import { describe, expect, it } from 'vitest'
import {
  analizarFilas,
  anchoDeHoja,
  detectarDuplicados,
  etiquetasNuevas,
  fusionarCampos,
  nombresDeColumna,
  parsearCantidad,
  parsearEstado,
  parsearEtiquetas,
  primeraFilaConDatos,
  resolucionPorDefecto,
  sugerirDestino,
  type Celda,
  type FilaImportada,
} from './importInventario'

describe('sugerirDestino', () => {
  it('reconoce las cabeceras habituales de una hoja de centro', () => {
    expect(sugerirDestino('Material')).toBe('nombre')
    expect(sugerirDestino('DESCRIPCIÓN')).toBe('nombre')
    expect(sugerirDestino('Nº')).toBe('cantidad')
    expect(sugerirDestino('uds')).toBe('cantidad')
    expect(sugerirDestino('Unidades')).toBe('cantidad')
    expect(sugerirDestino('Conservación')).toBe('estado')
    expect(sugerirDestino('Lugar')).toBe('ubicacion')
    expect(sugerirDestino('Observaciones')).toBe('notas')
    expect(sugerirDestino('Categoría')).toBe('etiquetas')
  })

  it('la específica gana a la genérica cuando la cabecera contiene las dos', () => {
    expect(sugerirDestino('Cantidad inservible')).toBe('cantidadInservible')
    expect(sugerirDestino('Cantidad (uds)')).toBe('cantidad')
  })

  it('lo que no reconoce lo deja sin mapear en vez de adivinar', () => {
    expect(sugerirDestino('')).toBe('ignorar')
    expect(sugerirDestino('Zzz')).toBe('ignorar')
  })
})

describe('parsearCantidad — sin número no hay cero', () => {
  it('lee las formas en que la gente escribe una cantidad', () => {
    expect(parsearCantidad('12')).toBe(12)
    expect(parsearCantidad('12 uds')).toBe(12)
    expect(parsearCantidad('12u')).toBe(12)
    expect(parsearCantidad('aprox. 12')).toBe(12)
    expect(parsearCantidad('12 unidades (2 rotas)')).toBe(12)
    expect(parsearCantidad(12)).toBe(12)
    expect(parsearCantidad('12,4')).toBe(12)
  })

  it('devuelve undefined, JAMÁS 0, cuando no hay número', () => {
    expect(parsearCantidad('')).toBeUndefined()
    expect(parsearCantidad('varios')).toBeUndefined()
    expect(parsearCantidad('?')).toBeUndefined()
    expect(parsearCantidad(null)).toBeUndefined()
    expect(parsearCantidad(undefined)).toBeUndefined()
    expect(parsearCantidad('-4')).toBeUndefined()
  })

  it('el cero escrito de verdad sí se conserva', () => {
    expect(parsearCantidad('0')).toBe(0)
    expect(parsearCantidad(0)).toBe(0)
  })
})

describe('parsearEstado', () => {
  it('mapea las cuatro familias con las palabras que se usan de verdad', () => {
    for (const v of ['bueno', 'BUEN ESTADO', 'ok', 'Correcto', 'nuevo'])
      expect(parsearEstado(v)).toBe('bueno')
    for (const v of ['regular', 'usado', 'Desgastado']) expect(parsearEstado(v)).toBe('regular')
    for (const v of ['malo', 'roto', 'Deteriorado']) expect(parsearEstado(v)).toBe('malo')
    for (const v of ['inservible', 'de baja', 'Desechar'])
      expect(parsearEstado(v)).toBe('fuera_de_uso')
  })

  it('lo específico gana cuando la celda mezcla dos', () => {
    expect(parsearEstado('malo, de baja')).toBe('fuera_de_uso')
  })

  it('sin coincidencia no inventa un estado', () => {
    expect(parsearEstado('')).toBeUndefined()
    expect(parsearEstado('ni idea')).toBeUndefined()
    expect(parsearEstado(3)).toBeUndefined()
  })
})

describe('parsearEtiquetas', () => {
  it('respeta el separador elegido', () => {
    expect(parsearEtiquetas('aros; conos', ';')).toEqual(['aros', 'conos'])
    expect(parsearEtiquetas('aros; conos', ',')).toEqual(['aros; conos'])
    expect(parsearEtiquetas('a|b|', '|')).toEqual(['a', 'b'])
    expect(parsearEtiquetas(undefined, ',')).toEqual([])
  })
})

describe('analizarFilas — hoja real, cabeceras raras, filas incompletas', () => {
  const mapeo = {
    destinos: ['nombre', 'cantidad', 'estado', 'ubicacion', 'etiquetas'] as const,
    separador: ';' as const,
  }
  const datos: Celda[][] = [
    ['Conos', '30 uds', 'buen estado', 'Almacén', 'pequeño; plástico'],
    ['Aros', 'varios', '', '', ''],
    ['', '', '', '', ''], // fila de relleno
    ['Picas', '', 'ni idea', 'Porche', ''],
    [null, 12, 'bueno', '', ''], // trae datos pero no nombre
  ]

  const { filas, descartadas } = analizarFilas(datos, { ...mapeo, destinos: [...mapeo.destinos] })

  it('descarta las filas sin nombre y las cuenta, sin contar el relleno vacío', () => {
    expect(filas.map((f) => f.nombre)).toEqual(['Conos', 'Aros', 'Picas'])
    expect(descartadas).toBe(1)
  })

  it('lee lo que puede y deja ausente lo que no, con la incidencia a la vista', () => {
    const [conos, aros, picas] = filas
    expect(conos).toMatchObject({ cantidad: 30, estado: 'bueno', ubicacion: 'Almacén' })
    expect(conos.etiquetas).toEqual(['pequeño', 'plástico'])
    expect(conos.incidencias).toEqual([])

    expect(aros.cantidad).toBeUndefined()
    expect(aros.incidencias[0]).toMatch(/Cantidad no reconocida/)

    expect(picas.estado).toBeUndefined()
    expect(picas.incidencias[0]).toMatch(/Estado no reconocido/)
    // Celda de cantidad vacía: eso no es una incidencia, es que no lo han contado.
    expect(picas.incidencias).toHaveLength(1)
  })

  it('avisa de más inservibles que unidades sin descartar la fila', () => {
    const { filas } = analizarFilas([['Petos', 4, 9]], {
      destinos: ['nombre', 'cantidad', 'cantidadInservible'],
      separador: ',',
    })
    expect(filas[0]).toMatchObject({ cantidad: 4, cantidadInservible: 9 })
    expect(filas[0].incidencias[0]).toMatch(/más inservibles/)
  })

  it('una columna sin mapear sencillamente no aporta nada', () => {
    const { filas } = analizarFilas([['Balones', 'lo que sea']], {
      destinos: ['nombre', 'ignorar'],
      separador: ',',
    })
    expect(filas[0].nombre).toBe('Balones')
    expect(filas[0].notas).toBeUndefined()
  })
})

describe('cabecera', () => {
  it('salta las filas vacías de arriba y mide el ancho real', () => {
    const hoja: Celda[][] = [[], ['', ''], ['Material', 'Uds', 'Estado'], ['Conos', 12, 'ok', 'extra']]
    expect(primeraFilaConDatos(hoja)).toBe(2)
    expect(anchoDeHoja(hoja)).toBe(4)
    expect(nombresDeColumna(hoja[2], 4)).toEqual(['Material', 'Uds', 'Estado', 'Columna 4'])
  })
})

describe('duplicados', () => {
  const fila = (indice: number, nombre: string): FilaImportada => ({
    indice,
    nombre,
    etiquetas: [],
    incidencias: [],
  })

  const existentes = [{ id: 'm1', nombre: 'Conos', nombreNormalizado: 'conos' }]

  it('choca contra el inventario y contra el propio fichero', () => {
    const d = detectarDuplicados(
      [fila(1, '  CONOS '), fila(2, 'Aros'), fila(3, 'aros'), fila(4, 'Picas')],
      existentes,
    )
    expect(d.get(1)).toMatchObject({ materialId: 'm1', enElFichero: false })
    expect(d.get(3)).toMatchObject({ nombreExistente: 'Aros', enElFichero: true })
    expect(d.has(2)).toBe(false)
    expect(d.has(4)).toBe(false)
  })

  it('propone fusionar con lo que ya hay y omitir el repetido del fichero', () => {
    expect(resolucionPorDefecto({ nombreExistente: 'Conos', enElFichero: false })).toBe('fusionar')
    expect(resolucionPorDefecto({ nombreExistente: 'Aros', enElFichero: true })).toBe('omitir')
  })
})

describe('fusionarCampos — rellena huecos, nunca pisa lo escrito a mano', () => {
  it('conserva lo que ya había y completa lo que faltaba', () => {
    const resultado = fusionarCampos(
      { cantidad: 30, ubicacion: 'Caseta', etiquetaIds: ['e1'] },
      {
        indice: 1,
        nombre: 'Conos',
        cantidad: 99,
        estado: 'malo',
        ubicacion: 'Almacén',
        notas: 'de la hoja',
        etiquetas: [],
        incidencias: [],
      },
      ['e1', 'e2'],
    )
    expect(resultado.cantidad).toBe(30)
    expect(resultado.ubicacion).toBe('Caseta')
    expect(resultado.estado).toBe('malo')
    expect(resultado.notas).toBe('de la hoja')
    expect(resultado.etiquetaIds).toEqual(['e1', 'e2'])
  })

  it('un 0 ya escrito no cuenta como hueco', () => {
    const resultado = fusionarCampos({ cantidad: 0, etiquetaIds: [] }, {
      indice: 1,
      nombre: 'Conos',
      cantidad: 40,
      etiquetas: [],
      incidencias: [],
    }, [])
    expect(resultado.cantidad).toBe(0)
  })
})

describe('etiquetasNuevas', () => {
  it('lista las que no existen, sin repetir variantes del mismo nombre', () => {
    const filas: FilaImportada[] = [
      { indice: 1, nombre: 'A', etiquetas: ['Aros', 'blandos'], incidencias: [] },
      { indice: 2, nombre: 'B', etiquetas: ['aros', 'Porche'], incidencias: [] },
    ]
    expect(etiquetasNuevas(filas, [{ nombreNormalizado: 'blandos' }])).toEqual(['Aros', 'Porche'])
  })
})
