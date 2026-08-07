/**
 * Importador de inventario — lógica pura (parseo y normalización).
 *
 * Premisa: los inventarios reales de centro son hojas sin formato fijo. Aquí
 * NO se asume ninguna cabecera concreta ni ningún orden de columnas; se
 * sugiere un mapeo y el usuario lo corrige. Todo lo que no se entiende queda
 * marcado como incidencia y visible en la vista previa, nunca rellenado a
 * ojo: una cantidad que no se lee es `undefined`, jamás 0.
 *
 * Sin dependencias nuevas: el parseo del fichero lo hace SheetJS, que ya está
 * en el proyecto por los informes (`lib/informes.ts`).
 */

import type { EstadoMaterial } from '../db/types'
import { normalizarTexto } from './texto'

// ——————————————————————— destino de cada columna ———————————————————————

export type DestinoColumna =
  | 'ignorar'
  | 'nombre'
  | 'cantidad'
  | 'cantidadInservible'
  | 'estado'
  | 'ubicacion'
  | 'notas'
  | 'etiquetas'

export const DESTINOS: DestinoColumna[] = [
  'ignorar',
  'nombre',
  'cantidad',
  'cantidadInservible',
  'estado',
  'ubicacion',
  'notas',
  'etiquetas',
]

export const ETIQUETA_DESTINO: Record<DestinoColumna, string> = {
  ignorar: 'No importar',
  nombre: 'Nombre',
  cantidad: 'Cantidad',
  cantidadInservible: 'Inservibles',
  estado: 'Estado',
  ubicacion: 'Ubicación',
  notas: 'Notas',
  etiquetas: 'Etiquetas',
}

/**
 * Alias de cabecera, en el mismo espíritu que el `ALIAS` del Banco de Juegos:
 * mejor reconocer de más y dejar que el usuario corrija, que exigir un
 * formato que ninguna hoja real cumple.
 */
const ALIAS: Record<Exclude<DestinoColumna, 'ignorar'>, string[]> = {
  nombre: ['nombre', 'material', 'materiales', 'descripcion', 'denominacion', 'articulo', 'item', 'concepto'],
  cantidad: ['cantidad', 'cant', 'n', 'no', 'num', 'numero', 'uds', 'unidades', 'existencias', 'stock', 'total'],
  cantidadInservible: ['inservibles', 'inservible', 'rotos', 'roto', 'bajas', 'de baja', 'no sirven', 'deteriorados'],
  estado: ['estado', 'conservacion', 'condicion', 'situacion'],
  ubicacion: ['ubicacion', 'lugar', 'sitio', 'almacen', 'localizacion', 'donde'],
  notas: ['notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'comentario'],
  etiquetas: ['etiquetas', 'etiqueta', 'tipo', 'tipos', 'categoria', 'categorias', 'familia', 'grupo', 'tags'],
}

/**
 * Sugerencia de destino para una cabecera. Coincidencia exacta primero y por
 * inclusión después, para que «Cantidad (uds)» o «Nº total» caigan donde
 * toca sin arrastrar falsos positivos: `nombre` va la última en el barrido
 * por inclusión porque «material» aparece dentro de medio encabezado.
 */
export function sugerirDestino(cabecera: string): DestinoColumna {
  const n = normalizarTexto(cabecera).replace(/[.ºª°]/g, '')
  if (!n) return 'ignorar'

  for (const [destino, alias] of Object.entries(ALIAS))
    if (alias.includes(n)) return destino as DestinoColumna

  // Los inservibles antes que la cantidad: «cantidad inservible» contiene las
  // dos, y la específica es la que manda.
  const orden: Exclude<DestinoColumna, 'ignorar'>[] = [
    'cantidadInservible',
    'cantidad',
    'estado',
    'ubicacion',
    'notas',
    'etiquetas',
    'nombre',
  ]
  for (const destino of orden)
    if (ALIAS[destino].some((a) => a.length > 2 && n.includes(a))) return destino

  return 'ignorar'
}

// ——————————————————————— normalización tolerante ———————————————————————

/**
 * «12», «12 uds», «12u», «aprox. 12», «12 unidades (2 rotas)» → 12.
 *
 * Sin número legible devuelve `undefined`, NUNCA 0: la fila se marca como
 * incidencia y el material entra sin cantidad. Un 0 inventado diría «no
 * queda ninguno», que es una afirmación que nadie ha hecho.
 */
export function parsearCantidad(valor: unknown): number | undefined {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : undefined
  if (typeof valor !== 'string') return undefined
  // El primer número del texto: en «12 unidades (2 rotas)» la cantidad es 12.
  const encontrado = valor.replace(',', '.').match(/-?\d+(\.\d+)?/)
  if (!encontrado) return undefined
  const n = Number(encontrado[0])
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n)
}

const ESTADO_ALIAS: Record<EstadoMaterial, string[]> = {
  bueno: ['bueno', 'buena', 'buen estado', 'buenas', 'ok', 'correcto', 'correcta', 'nuevo', 'nueva', 'perfecto', 'bien'],
  regular: ['regular', 'usado', 'usada', 'desgastado', 'desgastada', 'aceptable', 'medio', 'normal'],
  malo: ['malo', 'mala', 'mal estado', 'roto', 'rota', 'deteriorado', 'deteriorada', 'mal'],
  fuera_de_uso: ['fuera de uso', 'inservible', 'de baja', 'baja', 'desechar', 'retirado', 'retirada', 'inutil'],
}

/** Sin coincidencia → `undefined`. No se adivina un estado que nadie escribió. */
export function parsearEstado(valor: unknown): EstadoMaterial | undefined {
  if (typeof valor !== 'string') return undefined
  const n = normalizarTexto(valor)
  if (!n) return undefined

  for (const [estado, alias] of Object.entries(ESTADO_ALIAS))
    if (alias.includes(n)) return estado as EstadoMaterial

  // «fuera_de_uso» antes que «malo»: «inservible/de baja» es más específico y
  // algunas hojas escriben «malo, de baja» en la misma celda.
  const orden: EstadoMaterial[] = ['fuera_de_uso', 'bueno', 'regular', 'malo']
  for (const estado of orden)
    if (ESTADO_ALIAS[estado].some((a) => n.includes(a))) return estado

  return undefined
}

export type Separador = ',' | ';' | '|'
export const SEPARADORES: Separador[] = [',', ';', '|']

export function parsearEtiquetas(valor: unknown, separador: Separador): string[] {
  if (typeof valor === 'number') return [String(valor)]
  if (typeof valor !== 'string') return []
  return valor
    .split(separador)
    .map((v) => v.trim())
    .filter(Boolean)
}

// ——————————————————————— filas ———————————————————————

export type Celda = string | number | boolean | null | undefined

export interface FilaImportada {
  /** Índice en la hoja (1-based sobre las filas de datos), para el preview. */
  indice: number
  nombre: string
  cantidad?: number
  cantidadInservible?: number
  estado?: EstadoMaterial
  ubicacion?: string
  notas?: string
  etiquetas: string[]
  /** Qué no se ha podido leer. Se enseña, no se rellena a ojo. */
  incidencias: string[]
}

export interface Mapeo {
  /** Un destino por columna, en el orden de las columnas de la hoja. */
  destinos: DestinoColumna[]
  separador: Separador
}

export interface AnalisisFilas {
  filas: FilaImportada[]
  /** Filas sin nombre: se descartan y se cuentan. */
  descartadas: number
}

function texto(valor: Celda): string | undefined {
  if (valor === null || valor === undefined) return undefined
  const s = String(valor).trim()
  return s || undefined
}

/**
 * Aplica el mapeo a las filas de datos. No escribe nada: lo que sale de aquí
 * alimenta la vista previa, y solo tras confirmarla se toca la base.
 */
export function analizarFilas(datos: Celda[][], mapeo: Mapeo): AnalisisFilas {
  const filas: FilaImportada[] = []
  let descartadas = 0

  datos.forEach((fila, i) => {
    const de = (destino: DestinoColumna): Celda => {
      const col = mapeo.destinos.indexOf(destino)
      return col === -1 ? undefined : fila[col]
    }

    const nombre = texto(de('nombre'))
    if (!nombre) {
      // Una fila totalmente vacía es relleno de la hoja, no un error del que
      // informar; solo cuenta como descartada si traía algo.
      if (fila.some((c) => texto(c) !== undefined)) descartadas++
      return
    }

    const incidencias: string[] = []

    const brutoCantidad = de('cantidad')
    const cantidad = parsearCantidad(brutoCantidad)
    if (cantidad === undefined && texto(brutoCantidad) !== undefined)
      incidencias.push(`Cantidad no reconocida («${String(brutoCantidad).trim()}»): entra sin cantidad.`)

    const brutoInservible = de('cantidadInservible')
    const cantidadInservible = parsearCantidad(brutoInservible)
    if (cantidadInservible === undefined && texto(brutoInservible) !== undefined)
      incidencias.push(`Inservibles no reconocidos («${String(brutoInservible).trim()}»).`)

    const brutoEstado = de('estado')
    const estado = parsearEstado(brutoEstado)
    if (estado === undefined && texto(brutoEstado) !== undefined)
      incidencias.push(`Estado no reconocido («${String(brutoEstado).trim()}»): entra sin estado.`)

    if (cantidad !== undefined && cantidadInservible !== undefined && cantidadInservible > cantidad)
      incidencias.push(`Hay más inservibles (${cantidadInservible}) que unidades (${cantidad}).`)

    filas.push({
      indice: i + 1,
      nombre,
      cantidad,
      cantidadInservible,
      estado,
      ubicacion: texto(de('ubicacion')),
      notas: texto(de('notas')),
      etiquetas: parsearEtiquetas(de('etiquetas'), mapeo.separador),
      incidencias,
    })
  })

  return { filas, descartadas }
}

// ——————————————————————— cabecera ———————————————————————

/** Primera fila con algo escrito: el arranque por defecto del asistente. */
export function primeraFilaConDatos(hoja: Celda[][]): number {
  const i = hoja.findIndex((fila) => fila.some((c) => texto(c) !== undefined))
  return i === -1 ? 0 : i
}

export function nombresDeColumna(cabecera: Celda[], columnas: number): string[] {
  return Array.from({ length: columnas }, (_, i) => texto(cabecera[i]) ?? `Columna ${i + 1}`)
}

/** Ancho real de la hoja: la fila más larga, no la primera. */
export function anchoDeHoja(hoja: Celda[][]): number {
  return hoja.reduce((max, fila) => Math.max(max, fila.length), 0)
}

// ——————————————————————— duplicados ———————————————————————

export type Resolucion = 'crear' | 'fusionar' | 'omitir'

export interface Duplicado {
  /** Id del material existente, o `undefined` si el choque es dentro del propio fichero. */
  materialId?: string
  nombreExistente: string
  /** `true` cuando el duplicado es contra otra fila del mismo fichero. */
  enElFichero: boolean
}

/**
 * Choques por nombre normalizado, contra el inventario actual Y contra el
 * propio fichero (una hoja de centro repite nombres con frecuencia).
 *
 * La resolución por defecto es la conservadora: donde ya hay algo, se
 * propone fusionar; donde no, crear.
 */
export function detectarDuplicados(
  filas: FilaImportada[],
  existentes: { id: string; nombre: string; nombreNormalizado: string }[],
): Map<number, Duplicado> {
  const porNombre = new Map(existentes.map((m) => [m.nombreNormalizado, m]))
  const vistas = new Map<string, FilaImportada>()
  const duplicados = new Map<number, Duplicado>()

  for (const fila of filas) {
    const n = normalizarTexto(fila.nombre)
    const existente = porNombre.get(n)
    if (existente) {
      duplicados.set(fila.indice, {
        materialId: existente.id,
        nombreExistente: existente.nombre,
        enElFichero: false,
      })
    } else if (vistas.has(n)) {
      duplicados.set(fila.indice, {
        nombreExistente: vistas.get(n)!.nombre,
        enElFichero: true,
      })
    } else {
      vistas.set(n, fila)
    }
  }

  return duplicados
}

export function resolucionPorDefecto(duplicado: Duplicado): Resolucion {
  // Contra el inventario: fusionar (rellena huecos sin pisar nada).
  // Dentro del fichero: omitir, porque la primera fila ya va a entrar.
  return duplicado.enElFichero ? 'omitir' : 'fusionar'
}

// ——————————————————————— fusión de campos ———————————————————————

/** Lo que sabe la app de un material ya existente, para decidir qué falta. */
export interface CamposMaterial {
  cantidad?: number
  cantidadInservible?: number
  estado?: EstadoMaterial
  ubicacion?: string
  notas?: string
  etiquetaIds: string[]
}

/**
 * Fusiona una fila importada sobre un material existente rellenando SOLO los
 * huecos: lo escrito a mano no se pisa nunca. Las etiquetas se suman, porque
 * ahí no hay nada que sobrescribir.
 */
export function fusionarCampos(
  existente: CamposMaterial,
  fila: FilaImportada,
  etiquetaIdsDeLaFila: string[],
): CamposMaterial {
  const nuevas = etiquetaIdsDeLaFila.filter((id) => !existente.etiquetaIds.includes(id))
  return {
    cantidad: existente.cantidad ?? fila.cantidad,
    cantidadInservible: existente.cantidadInservible ?? fila.cantidadInservible,
    estado: existente.estado ?? fila.estado,
    ubicacion: existente.ubicacion ?? fila.ubicacion,
    notas: existente.notas ?? fila.notas,
    etiquetaIds: [...existente.etiquetaIds, ...nuevas],
  }
}

/** Nombres de etiqueta del fichero que todavía no existen en la base. */
export function etiquetasNuevas(
  filas: FilaImportada[],
  existentes: { nombreNormalizado: string }[],
): string[] {
  const conocidas = new Set(existentes.map((e) => e.nombreNormalizado))
  const nuevas = new Map<string, string>()
  for (const fila of filas)
    for (const nombre of fila.etiquetas) {
      const n = normalizarTexto(nombre)
      if (!n || conocidas.has(n) || nuevas.has(n)) continue
      nuevas.set(n, nombre.trim())
    }
  return [...nuevas.values()].sort((a, b) => a.localeCompare(b, 'es'))
}
