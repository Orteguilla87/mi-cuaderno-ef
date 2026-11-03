/**
 * La estructura con la que está escrita una sesión: los encabezados fijos que la
 * ordenan (momentos y submomentos) y las actividades que van dentro.
 *
 * Vive aparte porque la necesitan dos módulos que no deben depender uno del
 * otro: el extractor de material (`recursosTexto.ts`), para no confundir un
 * encabezado con un material, y el parser de la importación
 * (`importarTexto.ts`), para pasar la jerarquía a markdown. Dos copias de esta
 * lista que se separen significan que la misma línea es un encabezado para uno
 * y un material para el otro, que es exactamente el fallo que esto arregla.
 *
 * La jerarquía NO se modela en base de datos: la sesión sigue teniendo los
 * mismos campos genéricos (título, descripción, material, enlaces). Los tres
 * niveles viven DENTRO del texto de la descripción, en markdown.
 */

/**
 * Nivel 1 — MOMENTO. Los tramos grandes de la sesión.
 *
 * El de «momento de…» va sin ancla final a propósito: «Momento de despedida y
 * propuesta crítica» es el mismo encabezado con la coletilla puesta.
 */
const MOMENTO: RegExp[] = [
  /^momento\s+de\s+(?:recogida|acogida|despedida)\b/i,
  /^desarrollo\s+de\s+las\s+tareas$/i,
]

/** Nivel 2 — SUBMOMENTO. Los apartados dentro de «Desarrollo de las tareas». */
const SUBMOMENTO: RegExp[] = [
  /^puesta\s+en\s+acci[óo]n$/i,
  /^parte\s+principal$/i,
  /^fase\s+de\s+recuperaci[óo]n$/i,
  /^vuelta\s+a\s+la\s+calma$/i,
  /^calentamiento$/i,
  /^propuesta\s+cr[íi]tica$/i,
]

/** Línea que ya viene marcada como encabezado de markdown. */
const YA_ENCABEZADO = /^#{1,6}\s+\S/

/** Actividad que ya lleva el nombre en negrita: no se vuelve a marcar. */
const YA_ACTIVIDAD = /^\*\*.+\*\*/

export function esMomento(linea: string): boolean {
  const t = linea.trim()
  return MOMENTO.some((r) => r.test(t))
}

export function esSubmomento(linea: string): boolean {
  const t = linea.trim()
  return SUBMOMENTO.some((r) => r.test(t))
}

/**
 * `true` si la línea es uno de los encabezados de la estructura de la sesión.
 *
 * Ninguna línea que dé `true` aquí puede acabar como material, ni siquiera
 * dentro de un bloque de material abierto: además de no ser un ítem, lo cierra.
 * Sin esto, «Recursos: conos · pandereta» seguido de «Momento de recogida»
 * metía el encabezado en la lista de la compra.
 */
export function esEncabezadoReservado(linea: string): boolean {
  return esMomento(linea) || esSubmomento(linea)
}

// ——————————————————————— nivel 3: actividades ———————————————————————

/**
 * `Nombre de la actividad — descripción larga`.
 *
 * Solo guion largo o medio: el corto es un guion de verdad («ida-vuelta») y una
 * viñeta ya se ha normalizado a `- ` antes de llegar aquí.
 */
const ACTIVIDAD = /^(.{3,70}?)\s+[—–]\s+(.+)$/

export interface Actividad {
  nombre: string
  descripcion: string
}

/**
 * Descompone una línea en actividad + descripción, o devuelve `null`.
 *
 * Los dos guardarraíles son lo que separa una actividad de una frase con un
 * guion largo en medio, que en español es puntuación normal:
 *
 * 1. El guion tiene que estar pronto —en el primer tercio de la línea, o la
 *    línea entera ser corta—: un guion incidental llega después de una oración.
 * 2. Lo que va detrás tiene que empezar como una frase nueva (mayúscula o
 *    cifra). «los conos delimitan el espacio — no se puede salir de ahí» es
 *    prosa, y sin este guardarraíl saldría como una actividad inventada.
 *
 * El nombre tampoco puede llevar punto: un punto ya cerró una frase, así que lo
 * que hay delante del guion no es un rótulo.
 */
export function comoActividad(linea: string): Actividad | null {
  const t = linea.trim()
  // Sin esto, pasar dos veces por `aMarkdown` doblaba los asteriscos.
  if (YA_ENCABEZADO.test(t) || YA_ACTIVIDAD.test(t)) return null

  const m = ACTIVIDAD.exec(t)
  if (!m) return null

  const nombre = m[1].trim()
  const descripcion = m[2].trim()
  if (!nombre || !descripcion || nombre.includes('.')) return null

  const guionPronto = nombre.length <= t.length / 3 || t.length <= 60
  if (!guionPronto) return null

  const inicio = descripcion[0]
  if (inicio !== inicio.toLocaleUpperCase('es') && !/\p{N}/u.test(inicio)) return null

  return { nombre, descripcion }
}

// ——————————————————————— listas ———————————————————————

/**
 * `4. Cabezas numeradas (15 min · G4). Ocho preguntas…` — actividad escrita
 * como elemento de lista: marcador, nombre corto, paréntesis con duración y
 * agrupamiento, punto y el resto.
 */
const ACTIVIDAD_CON_TIEMPO = /^(\s*(?:\d+\.|[-*•])\s*)([^.()]{3,70})\s*(\([^)]{1,30}\))\.\s*(.+)$/

const NUMERADO = /^\d+[.)]\s+\S/
const VINETA = /^[-*•]\s+\S/

/** `true` si la línea es una actividad de lista con su paréntesis de tiempo. */
export function esActividadConTiempo(linea: string): boolean {
  return ACTIVIDAD_CON_TIEMPO.test(linea)
}

/**
 * Un elemento de lista con el nombre de la actividad en negrita, conservando el
 * marcador —el número tal cual, sin renumerar—, el paréntesis y el resto.
 */
function elementoDeLista(t: string): string {
  const [, marca, contenido] = /^(\d+[.)]|[-*•])\s+(.*)$/.exec(t) ?? ['', '-', t]
  const marcador = /^[-*•]$/.test(marca) ? '-' : marca
  // Una línea que ya trae negrita no se vuelve a marcar: idempotencia.
  if (contenido.includes('**')) return `${marcador} ${contenido}`

  const m = ACTIVIDAD_CON_TIEMPO.exec(t)
  if (m) return `${marcador} **${m[2].trim()}** ${m[3]}. ${m[4].trim()}`

  // El formato EF, «Nombre — descripción», también dentro de una lista.
  const actividad = comoActividad(contenido)
  if (actividad) return `${marcador} **${actividad.nombre}** — ${actividad.descripcion}`

  return `${marcador} ${contenido}`
}

/**
 * Índices de las viñetas que van DENTRO de un elemento numerado: las de un
 * tramo situado entre dos numerados. Son el desarrollo del anterior —las
 * preguntas de «4. Cabezas numeradas»—, no una lista suelta al mismo nivel.
 * Las viñetas de después del último numerado no tienen a quién pertenecer y
 * se quedan arriba.
 */
function vinetasAnidadas(lineas: string[]): Set<number> {
  const anidadas = new Set<number>()
  let i = 0
  while (i < lineas.length) {
    if (!VINETA.test(lineas[i].trim()) || /^\s{2,}/.test(lineas[i])) {
      i++
      continue
    }
    const tramo: number[] = []
    let j = i
    while (j < lineas.length && (!lineas[j].trim() || VINETA.test(lineas[j].trim()))) {
      if (lineas[j].trim()) tramo.push(j)
      j++
    }
    const anterior = lineas.slice(0, i).reverse().find((l) => l.trim())
    if (anterior && NUMERADO.test(anterior.trim()) && j < lineas.length && NUMERADO.test(lineas[j].trim()))
      for (const k of tramo) anidadas.add(k)
    i = j
  }
  return anidadas
}

// ——————————————————————— jerarquía → markdown ———————————————————————

/**
 * Pasa la jerarquía que vive en la sangría y en los rótulos a markdown, para
 * que se pueda PINTAR estructurada en vez de leerse como un ladrillo.
 *
 * Se hace al importar y no al mostrar porque el texto es del usuario: si la
 * conversión se hiciera en cada render, corregir a mano un encabezado que la
 * heurística no pilló no serviría de nada —volvería a recalcularse—. Aquí se
 * convierte una vez, se enseña en el preview y lo que se guarda ya es lo que se
 * verá.
 *
 * Es idempotente: una línea que ya venía con `#` o en negrita se deja en paz.
 */
export function aMarkdown(descripcion: string): string {
  const bloques: string[] = []
  let parrafo: string[] = []

  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push(parrafo.join('\n'))
    parrafo = []
  }

  const lineas = descripcion.split('\n')
  const anidadas = vinetasAnidadas(lineas)

  for (const [i, cruda] of lineas.entries()) {
    const t = cruda.trim()
    if (!t) {
      cerrarParrafo()
      continue
    }

    if (YA_ENCABEZADO.test(t)) {
      cerrarParrafo()
      bloques.push(t)
      continue
    }

    if (esMomento(t)) {
      cerrarParrafo()
      bloques.push(`### ${t}`)
      continue
    }

    if (esSubmomento(t)) {
      cerrarParrafo()
      bloques.push(`#### ${t}`)
      continue
    }

    // Las listas pasan tal cual, en el párrafo en curso: una línea en blanco
    // sigue cerrando el bloque, así que el aire que traía el texto se conserva.
    // La sangría de 2 espacios marca la sublista para `lib/markdown.ts`.
    if (NUMERADO.test(t) || VINETA.test(t)) {
      const subLista = VINETA.test(t) && (anidadas.has(i) || /^\s{2,}/.test(cruda))
      parrafo.push((subLista ? '  ' : '') + elementoDeLista(t))
      continue
    }

    const actividad = comoActividad(t)
    if (actividad) {
      cerrarParrafo()
      bloques.push(`**${actividad.nombre}** — ${actividad.descripcion}`)
      continue
    }

    parrafo.push(t)
  }

  cerrarParrafo()
  return bloques.join('\n\n')
}
