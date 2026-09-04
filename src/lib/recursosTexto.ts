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

import { comoActividad, esEncabezadoReservado } from './estructuraSesion'
import { formatoCorto, formatoLargo } from './fechas'
import { normalizarLinea, normalizarTexto } from './texto'

/**
 * Línea que anuncia una lista de material.
 *
 * Tres grupos: 1) la coletilla («necesarios», «y materiales»…), capturada solo
 * para poder saltarla; 2) el separador, OPCIONAL; 3) lo que quede de línea. Que
 * el separador sea opcional es lo que hace que «MATERIAL» a secas, en su propia
 * línea, cuente como etiqueta — la forma más común cuando el texto viene de un
 * documento con la lista debajo.
 *
 * El guardarraíl está en quien la usa: sin separador solo vale si NO queda resto
 * de línea. Si no, «Material didáctico variado para todo el trimestre» en medio
 * de una descripción se tragaría el párrafo entero como si fuera una lista.
 *
 * El tabulador cuenta como separador porque es lo que llega al pegar una celda
 * de tabla, y ahí no hay dos puntos que valgan.
 */
const ETIQUETA_MATERIAL =
  /^[ \t]*(?:-[ \t]+)?(?:material(?:es)?|recursos?)((?:[ ]+(?:y[ ]+)?(?:material(?:es)?|necesarios?|did[áa]cticos?|de[ ]+clase))*)[ ]*([:\-–—\t])?[ \t]*(.*)$/i

/** Viñeta de lista, en cualquiera de las formas que llegan de Word o markdown. */
const VINETA = /^[ \t]*[-–—*·•][ \t]+(.*)$/

/** Ítem de una lista numerada: «1. 10 conos», «2) 4 aros». */
const NUMERADA = /^[ \t]*\d+[ \t]*[.)\-][ \t]+(.*)$/

/**
 * Etiqueta de OTRO apartado. Cierra el bloque de material: lo que va debajo ya
 * no es material por mucho que tenga forma de lista.
 */
const OTRA_ETIQUETA =
  /^[ \t]*(?:-[ \t]+)?(?:enlaces?|links?|notas?|t[íi]tulo|desarrollo|objetivos?|criterios?|evaluaci[óo]n|contenidos?|competencias?|metodolog[íi]a|espacios?|instalaci[óo]n|agrupamientos?|duraci[óo]n|temporalizaci[óo]n|calentamiento|parte[ ]+principal|vuelta[ ]+a[ ]+la[ ]+calma|observaciones?|variantes?)\b/i

/**
 * Encabezado de sesión. Cierra el bloque igual que otra etiqueta.
 *
 * La numeración suelta NO entra aquí a propósito: dentro de un bloque de
 * material «1. 10 conos» es un ítem, no una sesión nueva. Quien decide que una
 * numeración corta sesiones es `detectarCortes`, y para entonces el bloque ya
 * está delimitado.
 */
const CORTE_SESION =
  /^[ ]{0,3}#{1,3}[ \t]+\S|^[ \t]*sesi[óo]n[ \t]*(?:n[ºo°]?[ \t]*)?\d+|^[ \t]*S[ \t]*\d+[ \t]*[:.\-]/i

/**
 * URL en texto libre. Vive aquí, y no en el parser de la importación, porque el
 * primero que tiene que reconocerla es el extractor: una URL dentro del bloque
 * de material no es material.
 */
export const URL = /\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi

export interface RecursosExtraidos {
  /** Ítems en el orden en que aparecen, sin repetidos y con su grafía original. */
  recursos: string[]
  /** URLs halladas DENTRO del bloque de material: van a «Enlaces y notas». */
  enlaces: string[]
  /** Índices (base 0) de las líneas del bloque que la lista ha ocupado. */
  lineasConsumidas: number[]
}

/**
 * Trocea una lista escrita en una sola línea: «12 conos, 4 aros · 2 balones».
 * El punto y coma, el punto medio `·` y la viñeta `•` cuentan como separadores
 * porque es como se escribe cuando la coma ya está dentro de un ítem. El `•`
 * está aquí además de en `normalizarLinea` porque esa solo lo traduce al
 * principio de la línea: en medio de una lista de una sola línea sigue siendo
 * un separador.
 */
function trocearLinea(linea: string): string[] {
  return linea
    .split(/[,;·•]|\s+[-–—]\s+/)
    .map((t) => t.trim().replace(/[.;,:]+$/, '').trim())
    .filter(Boolean)
}

/**
 * Una línea sin viñeta ni número puede seguir siendo un ítem: mucha gente
 * escribe la lista a pelo bajo «Material:», y una lista larga se parte en
 * varias líneas sin marcar ninguna. Se pide que sea corta y sin punto final,
 * que es lo que separa un ítem de una frase de la descripción. Lo que evita
 * que este criterio —laxo a propósito— se coma un encabezado son los cortes
 * que se comprueban ANTES en el bucle, empezando por `esEncabezadoReservado`.
 */
function pareceItem(linea: string): boolean {
  const t = linea.trim()
  return !!t && t.length < 80 && !t.endsWith('.')
}

/** `true` si la línea abre un apartado de material (con o sin separador). */
function esEtiquetaMaterial(linea: string): boolean {
  const m = ETIQUETA_MATERIAL.exec(linea)
  if (!m) return false
  return !!m[2] || !m[3].trim()
}

/**
 * Saca las URLs de una línea ANTES de trocearla y devuelve lo que queda.
 *
 * El orden no es un detalle: si se trocea primero, la URL entra en la lista de
 * la compra como si fuera un material y, además, su línea queda marcada como
 * consumida, así que el enlace tampoco llega a «Enlaces y notas». Es
 * exactamente el fallo que esto arregla.
 *
 * Si al quitar la URL no queda nada con letras ni números, la línea entera
 * desaparece del bloque en vez de dejar un ítem fantasma con los dos puntos.
 */
function separarEnlaces(contenido: string, anadirEnlace: (u: string) => void): string {
  const urls = contenido.match(URL)
  if (!urls || urls.length === 0) return contenido

  let resto = contenido
  for (const u of urls) {
    anadirEnlace(u)
    resto = resto.replace(u, ' ')
  }
  resto = resto
    .replace(/ {2,}/g, ' ')
    .trim()
    .replace(/^[:,;.\-–—]+/, '')
    .replace(/[:,;.\-–—]+$/, '')
    .trim()

  return /[\p{L}\p{N}]/u.test(resto) ? resto : ''
}

/**
 * Ítems de material de un bloque de texto.
 *
 * Solo lee lo que va bajo una etiqueta explícita. Sin etiqueta no adivina: una
 * descripción de sesión está llena de sustantivos que parecen material («los
 * conos del principio se recogen al final») y convertirlos en una lista de la
 * compra sería inventar datos, no extraerlos.
 *
 * La lista puede venir en la misma línea de la etiqueta («Material: 12 conos,
 * 4 aros»), debajo, o las dos cosas, y puede ocupar VARIAS líneas: con nueve
 * grupos, una lista de material larga partida en tres renglones es lo normal, y
 * perder los dos últimos es perder el viaje al almacén.
 *
 * Lo que decide dónde acaba la lista no es su forma, es dónde EMPIEZA otra
 * cosa. El bloque se cierra en:
 *
 * - un encabezado de la estructura de la sesión (`esEncabezadoReservado`),
 * - otra etiqueta de apartado o un encabezado de sesión,
 * - una actividad («Nombre — descripción»): ahí ya es el cuerpo de la sesión,
 * - una frase de verdad (larga, o con punto final),
 * - un cambio de estilo: si la lista iba marcada con viñetas, una línea suelta
 *   la cierra, y al revés. Mezclarlos sería colarse en la descripción.
 *
 * El guardarraíl de los encabezados es el que faltaba: sin él, «Recursos:
 * conos · pandereta» seguido de «Momento de recogida» metía el encabezado del
 * momento en la lista de la compra.
 */
export function extraerRecursos(bloque: string): RecursosExtraidos {
  // Se normaliza aquí dentro, y no solo en el parser de la importación, porque
  // «Preparar el material» entra por otra puerta y traería el texto crudo. La
  // normalización es línea a línea a propósito: `lineasConsumidas` son índices
  // de línea y ninguna regla puede añadir ni quitar saltos.
  const lineas = bloque.split('\n').map(normalizarLinea)
  const recursos: string[] = []
  const enlaces: string[] = []
  const vistos = new Set<string>()
  const vistosEnlace = new Set<string>()
  const lineasConsumidas: number[] = []

  const anadir = (item: string) => {
    const limpio = item.trim().replace(/[.;,:]+$/, '').trim()
    if (!limpio) return
    const clave = normalizarTexto(limpio)
    if (!clave || vistos.has(clave)) return
    vistos.add(clave)
    recursos.push(limpio)
  }

  const anadirEnlace = (valor: string) => {
    const limpio = valor.trim().replace(/[.,;)]+$/, '')
    if (!limpio || vistosEnlace.has(limpio)) return
    vistosEnlace.add(limpio)
    enlaces.push(limpio)
  }

  /** Enlaces fuera, material dentro. Nunca al revés. */
  const consumir = (contenido: string) => {
    for (const item of trocearLinea(separarEnlaces(contenido, anadirEnlace))) anadir(item)
  }

  for (let i = 0; i < lineas.length; i++) {
    // Un encabezado de la estructura de la sesión nunca abre nada: no es una
    // etiqueta de material por mucho que la regex pudiera rozarla.
    if (esEncabezadoReservado(lineas[i])) continue

    const encabezado = ETIQUETA_MATERIAL.exec(lineas[i])
    if (!encabezado) continue
    const separador = encabezado[2]
    const resto = encabezado[3] ?? ''
    // Sin separador solo cuenta si la etiqueta ocupa la línea entera.
    if (!separador && resto.trim()) continue

    lineasConsumidas.push(i)
    consumir(resto)

    // La lista sigue debajo mientras no empiece otra cosa. Que la etiqueta ya
    // trajera ítems en su propia línea no la cierra: una lista larga se parte
    // en varios renglones, y el primero suele ir pegado a la etiqueta.
    let modo: 'marcado' | 'suelto' | null = null
    let j = i + 1
    while (j < lineas.length) {
      const linea = lineas[j]

      if (!linea.trim()) {
        // Un blanco no corta si debajo sigue habiendo ítems marcados (Word
        // intercala párrafos vacíos). Dos blancos seguidos sí cortan, y un
        // blanco seguido de línea sin marca también: ahí ya es otro párrafo.
        const siguiente = lineas[j + 1]
        if (!siguiente || !siguiente.trim()) break
        if (!VINETA.test(siguiente) && !NUMERADA.test(siguiente)) break
        lineasConsumidas.push(j)
        j++
        continue
      }

      if (esEncabezadoReservado(linea)) break
      if (OTRA_ETIQUETA.test(linea) || CORTE_SESION.test(linea) || esEtiquetaMaterial(linea)) break

      const marcado = VINETA.exec(linea) ?? NUMERADA.exec(linea)
      let contenido: string
      if (marcado) {
        if (modo === 'suelto') break
        // Un encabezado al que alguien le puso una viñeta delante sigue siendo
        // un encabezado.
        if (esEncabezadoReservado(marcado[1])) break
        modo = 'marcado'
        contenido = marcado[1]
      } else {
        if (modo === 'marcado') break
        // Una actividad («Nombre — descripción») es el cuerpo de la sesión, no
        // un material: ahí la lista ya terminó aunque la línea sea corta.
        if (comoActividad(linea)) break
        if (!pareceItem(linea)) break
        modo = 'suelto'
        contenido = linea
      }

      lineasConsumidas.push(j)
      consumir(contenido)
      j++
    }

    i = j - 1
  }

  return { recursos, enlaces, lineasConsumidas }
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
  for (const cruda of texto.split('\n')) {
    const linea = normalizarLinea(cruda)
    const contenido = (VINETA.exec(linea) ?? NUMERADA.exec(linea))?.[1] ?? linea
    // Un encabezado de la sesión que se haya colado en este campo tampoco es
    // material: la regla es la misma aquí que en `extraerRecursos`.
    if (esEncabezadoReservado(contenido)) continue
    // Una URL escrita a mano en este campo tampoco es material que bajar del
    // almacén: no se trocea, se descarta.
    for (const item of trocearLinea(separarEnlaces(contenido, () => {}))) {
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
