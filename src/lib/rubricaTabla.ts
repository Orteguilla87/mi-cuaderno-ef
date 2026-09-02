/**
 * Parser de rúbricas pegadas como tabla, venga de un CSV o de un copiado de
 * Excel/Sheets (que viaja separado por TABULADORES).
 *
 * Se troceaba antes por `split('\n')` y `split(delimitador)` a pelo, con el
 * delimitador adivinado como «hay tabulador o es una coma». Eso rompe justo en
 * el formato real de estas rúbricas: descriptores largos que Excel entrecomilla
 * y que llevan saltos de línea y comas DENTRO de la celda, y CSV español, que
 * separa por punto y coma. Aquí hay un troceador CSV de verdad (comillas,
 * comillas dobladas y saltos internos) y una detección de delimitador por
 * consistencia de columnas.
 *
 * Formato de referencia, el habitual pero no el único:
 *
 *   Indicador · Peso · 10 · 8 · 6 · 4 · 2
 *
 * con descriptores reales solo en 10, 6 y 2 —los de 8 y 4 son relleno
 * («Nivel intermedio entre 10 y 6»)— y el indicador precedido de la referencia
 * del criterio del decreto («2.2.a», «1.2.F»). Nada de esto se da por supuesto:
 * las columnas se identifican POR CABECERA, no por posición, y lo que no se
 * reconozca se enseña en el preview en vez de rellenarse a ojo.
 */

import { normalizarLinea, normalizarTexto } from './texto'

// ——————————————————————— troceado ———————————————————————

export type Delimitador = '\t' | ';' | ','
/** En orden de preferencia: a igual consistencia gana el tabulador. */
export const DELIMITADORES: Delimitador[] = ['\t', ';', ',']

/**
 * Trocea texto delimitado respetando comillas: una celda entrecomillada puede
 * contener el delimitador, saltos de línea y comillas dobladas (`""`).
 *
 * Devuelve solo las filas con algo escrito; una fila en blanco es relleno de la
 * hoja, no un dato.
 */
export function trocearCsv(texto: string, delimitador: Delimitador): string[][] {
  const s = texto.replace(/\r\n?/g, '\n')
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false

  for (let i = 0; i < s.length; i++) {
    const c = s[i]

    if (entreComillas) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          celda += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        celda += c
      }
      continue
    }

    // La comilla solo abre celda si está al principio de ella: una comilla en
    // medio de una frase («mide 1" de alto») es texto, no delimitación.
    if (c === '"' && celda.trim() === '') {
      entreComillas = true
      celda = ''
    } else if (c === delimitador) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else {
      celda += c
    }
  }
  fila.push(celda)
  filas.push(fila)

  return filas.filter((f) => f.some((c) => c.trim() !== ''))
}

function moda(numeros: number[]): number {
  const cuenta = new Map<number, number>()
  for (const n of numeros) cuenta.set(n, (cuenta.get(n) ?? 0) + 1)
  let mejor = 0
  let veces = -1
  for (const [n, v] of cuenta) {
    if (v > veces || (v === veces && n > mejor)) {
      mejor = n
      veces = v
    }
  }
  return mejor
}

/**
 * El delimitador que trocea la tabla en un número de columnas CONSISTENTE.
 *
 * No se mira «cuál aparece más»: una coma dentro de un descriptor aparece
 * muchas veces y no separa nada. Se prueban los tres y gana el que deja más
 * filas con el mismo ancho; a empate, el primero de `DELIMITADORES`, porque un
 * pegado de Excel siempre trae tabuladores y es el caso más común.
 */
export function detectarDelimitador(texto: string): Delimitador {
  let mejor: Delimitador = DELIMITADORES[0]
  let mejorConsistencia = -1

  for (const d of DELIMITADORES) {
    const filas = trocearCsv(texto, d)
    if (filas.length === 0) continue
    const anchos = filas.map((f) => f.length)
    const ancho = moda(anchos)
    if (ancho < 2) continue
    const consistencia = anchos.filter((n) => n === ancho).length / anchos.length
    if (consistencia > mejorConsistencia) {
      mejorConsistencia = consistencia
      mejor = d
    }
  }
  return mejor
}

/**
 * Una celda en la forma en que el resto del importador la espera: sin espacios
 * raros (U+00A0 y compañía), sin viñetas sueltas y en UNA línea.
 *
 * Los saltos internos de un descriptor pegado desde Excel son ajuste de ancho
 * de la hoja, no párrafos, así que se colapsan a espacio. Reutiliza
 * `normalizarLinea`, la misma regla que el importador de unidades y el de
 * material, para que «lo mismo escrito igual» sea igual en toda la app.
 */
export function normalizarCelda(celda: string): string {
  return celda
    .split(/\r?\n/)
    .map(normalizarLinea)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ——————————————————————— mapeo de columnas ———————————————————————

export type DestinoColumna = 'indicador' | 'peso' | 'nivel' | 'ignorar'

export const ETIQUETA_DESTINO: Record<DestinoColumna, string> = {
  indicador: 'Indicador',
  peso: 'Peso',
  nivel: 'Nivel',
  ignorar: 'Ignorar',
}

const ALIAS_INDICADOR = ['indicador', 'criterio', 'item', 'aspecto', 'descripcion', 'descriptor']
const ALIAS_PESO = ['peso', 'ponderacion', 'porcentaje', '%', 'valor']

/** Cabecera que es un número a secas: «10», «8», «0,5». */
function comoNumero(celda: string): number | undefined {
  const bruto = celda.trim()
  return /^-?\d+(?:[.,]\d+)?$/.test(bruto) ? Number(bruto.replace(',', '.')) : undefined
}

/**
 * Qué es cada columna, deducido de su cabecera. El orden puede variar y la
 * columna de peso puede no existir: por eso se identifica por nombre y no por
 * posición.
 */
export function sugerirMapeo(cabecera: string[]): DestinoColumna[] {
  const destinos: DestinoColumna[] = cabecera.map((c) => {
    const n = normalizarTexto(c)
    if (n === '' && c.trim() === '') return 'ignorar'
    if (comoNumero(c) !== undefined) return 'nivel'
    if (ALIAS_PESO.some((a) => n.includes(a)) || c.includes('%')) return 'peso'
    if (ALIAS_INDICADOR.some((a) => n.includes(a))) return 'indicador'
    return 'nivel'
  })

  // Sin ninguna columna de indicador reconocida, la primera con texto lo es:
  // toda rúbrica tiene una, y es siempre la de más a la izquierda.
  if (!destinos.includes('indicador')) {
    const i = destinos.findIndex((d) => d !== 'ignorar')
    if (i !== -1) destinos[i] = 'indicador'
  }

  // Un solo indicador y un solo peso: lo que se repita pasa a nivel.
  let indicadorVisto = false
  let pesoVisto = false
  return destinos.map((d) => {
    if (d === 'indicador') {
      if (indicadorVisto) return 'nivel'
      indicadorVisto = true
    }
    if (d === 'peso') {
      if (pesoVisto) return 'nivel'
      pesoVisto = true
    }
    return d
  })
}

// ——————————————————————— celdas ———————————————————————

/**
 * Peso en porcentaje. Acepta «40 %», «40%», «40», «0,4», «0.4», «40,0 %».
 *
 * Sin `%` y con valor ≤ 1 se lee como fracción (0,4 → 40 %): nadie pondera un
 * indicador al 0,4 % y sí al 40. Lo que no se reconozca sale `undefined` y NO
 * cero: un peso 0 apaga la fila en el motor de notas, y eso tiene que ser una
 * decisión del usuario, no el resultado de una lectura fallida.
 */
export function parsearPeso(celda: string | undefined): number | undefined {
  if (!celda) return undefined
  const bruto = celda.trim()
  if (bruto === '') return undefined
  const conPorcentaje = bruto.includes('%')
  const limpio = bruto.replace('%', '').trim()
  if (!/^\d+(?:[.,]\d+)?$/.test(limpio)) return undefined
  const n = Number(limpio.replace(',', '.'))
  if (!Number.isFinite(n)) return undefined
  return !conPorcentaje && n > 0 && n <= 1 ? Math.round(n * 100 * 100) / 100 : n
}

/**
 * Los descriptores de los niveles intermedios son relleno automático de la
 * plantilla («Nivel intermedio entre 10 y 6»): no describen nada, y la vista de
 * calificación ya enseña la descripción solo si existe. Se guardan vacíos.
 */
export const RE_RELLENO = /^nivel\s+intermedio\s+entre\s+\d+\s+y\s+\d+\s*\.?$/i

export function esDescriptorRelleno(texto: string): boolean {
  return RE_RELLENO.test(texto.trim())
}

/**
 * Referencia del criterio al principio del indicador: «2.2.a · texto»,
 * «1.2.F - texto», «3.1: texto».
 *
 * El CICLO no se lee de aquí: «2.2» existe en los tres ciclos con textos
 * distintos. Solo se guarda el código; el id del decreto (`EF.2C.2.2`) se
 * construye al ligar la rúbrica a una columna, que es donde se sabe el curso.
 */
export const RE_REFERENCIA = /^\s*(\d+\.\d+)(?:\.([A-Za-z]))?\s*[·•\-–—:.)]\s*([\s\S]+)$/

export interface Referencia {
  codigo: string
  letra?: string
  /** «2.2.a», tal cual venía, para enseñarla en el preview. */
  referencia: string
  titulo: string
}

export function partirReferencia(indicador: string): Referencia | undefined {
  const m = indicador.match(RE_REFERENCIA)
  if (!m) return undefined
  const [, codigo, letra, titulo] = m
  const limpio = titulo.trim()
  if (limpio === '') return undefined
  return {
    codigo,
    letra: letra || undefined,
    referencia: letra ? `${codigo}.${letra}` : codigo,
    titulo: limpio,
  }
}

// ——————————————————————— tabla ———————————————————————

export interface NivelImportado {
  etiqueta: string
  valor: number
}

export interface FilaImportada {
  /** Índice en la tabla pegada (1-based sobre las filas de datos), para el preview. */
  indice: number
  /** Texto del indicador, ya SIN la referencia del criterio. */
  titulo: string
  codigo?: string
  letra?: string
  referencia?: string
  /** `undefined` = no se ha reconocido ninguno. Nunca 0 por defecto. */
  pesoPct?: number
  /** Descriptor en cada nivel, en el orden de `niveles`. '' = sin descriptor. */
  descripciones: string[]
  /** Cuántos descriptores se han vaciado por ser relleno automático. */
  rellenos: number
  incidencias: string[]
}

export interface TablaRubricaImportada {
  delimitador: Delimitador
  /** Índice de la fila de cabecera dentro de las filas con datos. */
  filaCabecera: number
  cabecera: string[]
  mapeo: DestinoColumna[]
  niveles: NivelImportado[]
  filas: FilaImportada[]
  /** Filas con algo escrito pero sin indicador: se descartan y se cuentan. */
  descartadas: number
  /** Suma de los pesos reconocidos. `undefined` si ninguna fila trae peso. */
  sumaPesos?: number
  /** Los valores de nivel no son la escala de la app (10/8/6/4/2). */
  escalaNoEstandar: boolean
  /** Total de descriptores vaciados por ser relleno. */
  rellenosVaciados: number
}

/**
 * La escala de la app. NE no es un nivel: es la AUSENCIA de valoración
 * («Quitar valoración» en la tabla de calificación), así que la importación no
 * puede crearlo ni leer una columna como tal.
 */
export const ESCALA_APP = [10, 8, 6, 4, 2]

export interface OpcionesTabla {
  delimitador?: Delimitador
  filaCabecera?: number
  mapeo?: DestinoColumna[]
  /** Guardar los descriptores de relleno literalmente en vez de vaciarlos. */
  conservarRelleno?: boolean
}

export function analizarTabla(texto: string, opciones: OpcionesTabla = {}): TablaRubricaImportada {
  const delimitador = opciones.delimitador ?? detectarDelimitador(texto)
  const brutas = trocearCsv(texto, delimitador)
  if (brutas.length < 2) {
    throw new Error('Pega al menos una fila de cabecera y una fila de indicador.')
  }

  const ancho = brutas.reduce((max, f) => Math.max(max, f.length), 0)
  const filasNorm = brutas.map((f) =>
    Array.from({ length: ancho }, (_, i) => normalizarCelda(f[i] ?? '')),
  )

  const filaCabecera = opciones.filaCabecera ?? 0
  const cabecera = filasNorm[filaCabecera] ?? []
  const mapeo = opciones.mapeo ?? sugerirMapeo(cabecera)

  const colsNivel = mapeo.flatMap((d, i) => (d === 'nivel' ? [i] : []))
  if (colsNivel.length === 0) {
    throw new Error('No se ha reconocido ninguna columna de nivel. Ajusta el mapeo de columnas.')
  }
  const colIndicador = mapeo.indexOf('indicador')
  if (colIndicador === -1) {
    throw new Error('No se ha reconocido la columna del indicador. Ajusta el mapeo de columnas.')
  }
  const colPeso = mapeo.indexOf('peso')

  // Niveles EN EL ORDEN en que aparecen. Valor: el número de la cabecera si lo
  // es; «Etiqueta:6» si lo trae explícito; y si no, progresión pareja hasta 10,
  // que para cinco niveles da justo 2, 4, 6, 8, 10.
  const n = colsNivel.length
  const niveles: NivelImportado[] = colsNivel.map((col, i) => {
    const celda = cabecera[col] ?? ''
    const numero = comoNumero(celda)
    if (numero !== undefined) return { etiqueta: celda.trim(), valor: numero }
    const conValor = celda.match(/^(.*?)[:;]\s*(\d+(?:[.,]\d+)?)\s*$/)
    if (conValor) {
      return { etiqueta: conValor[1].trim(), valor: Number(conValor[2].replace(',', '.')) }
    }
    return { etiqueta: celda.trim() || `Nivel ${i + 1}`, valor: Math.round(((i + 1) / n) * 10) }
  })

  const filas: FilaImportada[] = []
  let descartadas = 0
  let rellenosVaciados = 0

  filasNorm.forEach((fila, i) => {
    if (i === filaCabecera) return
    const indicador = fila[colIndicador] ?? ''
    if (indicador === '') {
      if (fila.some((c) => c !== '')) descartadas++
      return
    }

    const incidencias: string[] = []
    const ref = partirReferencia(indicador)

    const brutoPeso = colPeso === -1 ? '' : (fila[colPeso] ?? '')
    const pesoPct = parsearPeso(brutoPeso)
    if (pesoPct === undefined && brutoPeso !== '')
      incidencias.push(`Peso no reconocido («${brutoPeso}»): entra sin peso.`)

    let rellenos = 0
    const descripciones = colsNivel.map((col) => {
      const valor = fila[col] ?? ''
      if (valor !== '' && !opciones.conservarRelleno && esDescriptorRelleno(valor)) {
        rellenos++
        return ''
      }
      return valor
    })
    rellenosVaciados += rellenos

    filas.push({
      indice: filas.length + descartadas + 1,
      titulo: ref?.titulo ?? indicador,
      codigo: ref?.codigo,
      letra: ref?.letra,
      referencia: ref?.referencia,
      pesoPct,
      descripciones,
      rellenos,
      incidencias,
    })
  })

  if (filas.length === 0) {
    throw new Error('No se ha reconocido ningún indicador en la columna del indicador.')
  }

  const conPeso = filas.filter((f) => f.pesoPct !== undefined)
  const valores = niveles.map((nv) => nv.valor)
  const escalaNoEstandar =
    valores.length !== ESCALA_APP.length || valores.some((v, i) => v !== ESCALA_APP[i])

  return {
    delimitador,
    filaCabecera,
    cabecera,
    mapeo,
    niveles,
    filas,
    descartadas,
    sumaPesos: conPeso.length
      ? Math.round(conPeso.reduce((s, f) => s + (f.pesoPct ?? 0), 0) * 100) / 100
      : undefined,
    escalaNoEstandar,
    rellenosVaciados,
  }
}
