/**
 * Parser de rúbricas pegadas como tabla (CSV o copiado de Excel/Sheets, que
 * viaja separado por tabuladores). Primera fila = niveles (a partir de la 2.ª
 * columna); primera columna de cada fila siguiente = criterio, el resto =
 * descriptor de ese criterio en cada nivel.
 *
 * Formato de cabecera de nivel: «Conseguido» (valor autocalculado) o
 * «Conseguido:6» / «Conseguido;6» (valor explícito).
 */

export interface NivelImportado {
  etiqueta: string
  valor: number
}

export interface CriterioImportado {
  titulo: string
  descripciones: string[] // en el mismo orden que `niveles`
}

export interface TablaRubricaImportada {
  niveles: NivelImportado[]
  criterios: CriterioImportado[]
}

export function parsearTablaRubrica(texto: string): TablaRubricaImportada {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '')

  if (lineas.length < 2) {
    throw new Error('Pega al menos una fila de niveles y una fila de criterio.')
  }

  const delimitador = lineas[0].includes('\t') ? '\t' : ','
  const filas = lineas.map((l) => l.split(delimitador).map((c) => c.trim()))

  const cabecera = filas[0]
  const etiquetasNivel = cabecera.slice(1).filter((c) => c !== '')
  if (etiquetasNivel.length === 0) {
    throw new Error(
      'La primera fila debe traer el nombre de cada nivel a partir de la 2.ª columna.',
    )
  }

  const n = etiquetasNivel.length
  const niveles: NivelImportado[] = etiquetasNivel.map((celda, i) => {
    const conValor = celda.match(/^(.*?)[:;]\s*(\d+(?:[.,]\d+)?)\s*$/)
    if (conValor) {
      return { etiqueta: conValor[1].trim(), valor: Number(conValor[2].replace(',', '.')) }
    }
    // Sin valor explícito: progresión pareja hasta 10 (2,4,6,8,10 para 5 niveles).
    return { etiqueta: celda, valor: Math.round(((i + 1) / n) * 10) }
  })

  const criterios: CriterioImportado[] = filas
    .slice(1)
    .filter((fila) => fila[0]?.trim())
    .map((fila) => ({
      titulo: fila[0].trim(),
      descripciones: etiquetasNivel.map((_, i) => fila[i + 1]?.trim() ?? ''),
    }))

  if (criterios.length === 0) {
    throw new Error('No se ha reconocido ningún criterio (la 1.ª columna de cada fila).')
  }

  return { niveles, criterios }
}
