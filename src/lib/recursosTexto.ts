/**
 * Extractor de material escrito a mano — lógica pura, sin Dexie ni React.
 *
 * Es el ÚNICO sitio donde un texto libre de material se trocea en ítems. Lo
 * usan la importación de unidades (para llenar `recursosNecesarios`) y el botón
 * «Preparar el material» de «Hoy» (para la lista que se copia al portapapeles).
 * Dos troceadores que se separen significan que la misma sesión produce dos
 * listas distintas según desde dónde se mire, que es justo lo que no puede
 * pasar cuando se baja al almacén con una de ellas.
 *
 * El cotejo con el Inventario NO vive aquí: lo hace quien llame, con
 * `buscarPorNombre` de `db/inventario.ts`. Así este módulo no toca la base y se
 * puede probar entero sin abrirla.
 */

import { formatoCorto, formatoLargo } from './fechas'
import { normalizarTexto } from './texto'

/** Línea que anuncia una lista de material: «Material:», «Recursos necesarios -»… */
const ETIQUETA_MATERIAL = /^\s*(?:material(?:es)?|recursos?)(?:\s+necesarios?)?\s*[:\-–]\s*(.*)$/i

/** Viñeta de lista, en cualquiera de las formas que llegan de Word o markdown. */
const VINETA = /^\s*[-–—*·•]\s+(.*)$/

export interface RecursosExtraidos {
  /** Ítems en el orden en que aparecen, sin repetidos y con su grafía original. */
  recursos: string[]
  /** Índices (base 0) de las líneas del bloque que la lista ha ocupado. */
  lineasConsumidas: number[]
}

/**
 * Trocea una lista escrita en una sola línea: «12 conos, 4 aros · 2 balones».
 * El punto y coma y el `·` cuentan como separadores porque es como se escribe
 * cuando la coma ya está dentro de un ítem.
 */
function trocearLinea(linea: string): string[] {
  return linea
    .split(/[,;·]|\s+[-–—]\s+/)
    .map((t) => t.trim().replace(/[.;,]+$/, '').trim())
    .filter(Boolean)
}

/**
 * Ítems de material de un bloque de texto.
 *
 * Solo lee lo que va bajo una etiqueta explícita. Sin etiqueta no adivina: una
 * descripción de sesión está llena de sustantivos que parecen material («los
 * conos del principio se recogen al final») y convertirlos en una lista de la
 * compra sería inventar datos, no extraerlos.
 */
export function extraerRecursos(bloque: string): RecursosExtraidos {
  const lineas = bloque.split('\n')
  const recursos: string[] = []
  const vistos = new Set<string>()
  const lineasConsumidas: number[] = []

  const anadir = (item: string) => {
    const limpio = item.trim().replace(/[.;,]+$/, '').trim()
    if (!limpio) return
    const clave = normalizarTexto(limpio)
    if (!clave || vistos.has(clave)) return
    vistos.add(clave)
    recursos.push(limpio)
  }

  for (let i = 0; i < lineas.length; i++) {
    const encabezado = ETIQUETA_MATERIAL.exec(lineas[i])
    if (!encabezado) continue

    lineasConsumidas.push(i)
    for (const item of trocearLinea(encabezado[1] ?? '')) anadir(item)

    // La lista continúa mientras haya viñetas. Una línea en blanco no la corta
    // (Word intercala párrafos vacíos); una etiqueta nueva o un párrafo suelto sí.
    for (let j = i + 1; j < lineas.length; j++) {
      const linea = lineas[j]
      if (!linea.trim()) {
        // Blanco: se consume solo si después sigue habiendo viñetas.
        const siguiente = lineas.slice(j + 1).find((l) => l.trim())
        if (siguiente && VINETA.test(siguiente)) {
          lineasConsumidas.push(j)
          continue
        }
        break
      }
      const vineta = VINETA.exec(linea)
      if (!vineta) break
      lineasConsumidas.push(j)
      for (const item of trocearLinea(vineta[1])) anadir(item)
      i = j
    }
  }

  return { recursos, lineasConsumidas }
}

/** Cuántos ítems distintos hay, sin construir la lista. Para contadores de UI. */
export function contarRecursos(bloque: string): number {
  return extraerRecursos(bloque).recursos.length
}

/**
 * Ítems de un campo que YA es de material (`Sesion.recursosNecesarios`), no de
 * un bloque de prosa.
 *
 * La diferencia con `extraerRecursos` no es de forma, es de contexto: en una
 * descripción hace falta una etiqueta para saber qué es material y qué no, pero
 * aquí el campo entero lo es —para eso existe—, así que exigir «Material:»
 * dentro de él devolvería una lista vacía justo cuando el dato está completo.
 * Es lo que pasaba: el importador guarda «25 balones, 12 conos» sin etiqueta,
 * y «Preparar el material» no encontraba nada que copiar.
 *
 * La etiqueta se sigue admitiendo por si el usuario la escribe a mano.
 */
export function itemsDeMaterial(campo: string): string[] {
  const texto = campo?.trim()
  if (!texto) return []

  const conEtiqueta = extraerRecursos(texto)
  if (conEtiqueta.recursos.length > 0) return conEtiqueta.recursos

  const items: string[] = []
  const vistos = new Set<string>()
  for (const linea of texto.split('\n')) {
    const contenido = VINETA.exec(linea)?.[1] ?? linea
    for (const item of trocearLinea(contenido)) {
      const clave = normalizarTexto(item)
      if (!clave || vistos.has(clave)) continue
      vistos.add(clave)
      items.push(item)
    }
  }
  return items
}

// ——————————————————————— «Preparar el material» ———————————————————————

export interface ClaseMaterial {
  /** Nombre del grupo, para saber de qué clase sale cada cosa. */
  grupo: string
  /** El `recursosNecesarios` de la sesión, tal cual está guardado. */
  texto?: string
}

export interface DiaMaterial {
  fecha: string
  clases: ClaseMaterial[]
}

/** Ítems de un día, deduplicados entre todas sus clases y en orden de aparición. */
function recursosDelDia(dia: DiaMaterial): string[] {
  const vistos = new Set<string>()
  const lista: string[] = []
  for (const clase of dia.clases) {
    for (const item of itemsDeMaterial(clase.texto ?? '')) {
      const clave = normalizarTexto(item)
      if (vistos.has(clave)) continue
      vistos.add(clave)
      lista.push(item)
    }
  }
  return lista
}

/**
 * Lista de material lista para pegar en WhatsApp o en cualquier editor: texto
 * plano, sin markdown ni tablas, que es lo único que sobrevive a un pegado en
 * un chat. Cadena vacía si no hay material en todo el rango — quien llama avisa
 * en vez de copiar un texto vacío al portapapeles.
 *
 * Con un solo día sale la lista sin más. Con varios sale un bloque por día y al
 * final el total deduplicado, que es la lista con la que se baja al almacén una
 * sola vez para toda la semana.
 */
export function textoMaterial(dias: DiaMaterial[]): string {
  const conMaterial = dias
    .map((d) => ({ fecha: d.fecha, recursos: recursosDelDia(d) }))
    .filter((d) => d.recursos.length > 0)

  if (conMaterial.length === 0) return ''

  const enLineas = (items: string[]) => items.map((r) => `- ${r}`).join('\n')

  if (conMaterial.length === 1) {
    const dia = conMaterial[0]
    return `Material · ${formatoLargo(dia.fecha)}\n${enLineas(dia.recursos)}`
  }

  const primero = conMaterial[0].fecha
  const ultimo = conMaterial[conMaterial.length - 1].fecha
  const cabecera = `Material · ${formatoCorto(primero)} – ${formatoCorto(ultimo)}`

  const bloques = conMaterial.map((d) => `${formatoLargo(d.fecha)}\n${enLineas(d.recursos)}`)

  const vistos = new Set<string>()
  const total: string[] = []
  for (const dia of conMaterial) {
    for (const item of dia.recursos) {
      const clave = normalizarTexto(item)
      if (vistos.has(clave)) continue
      vistos.add(clave)
      total.push(item)
    }
  }

  return `${cabecera}\n\n${bloques.join('\n\n')}\n\nTotal de la semana\n${enLineas(total)}`
}
