/**
 * Parser de la programación pegada como texto plano — lógica pura, determinista.
 *
 * Sin IA y sin red: lo que entra por aquí es la programación real del usuario y
 * §1.2 no permite que salga del dispositivo. Un parser determinista además se
 * puede probar, y su preview se puede corregir a mano; un modelo, no.
 *
 * La regla que gobierna todo el módulo: NUNCA inventar un título. Si el texto no
 * trae candidato, el título queda `undefined` y la UI obliga a escribirlo antes
 * de importar. Un título inventado es peor que ninguno: es el único
 * identificador de la sesión en los listados, y nadie revisa lo que ya parece
 * escrito.
 */

import { aMarkdown } from './estructuraSesion'
import { URL, extraerRecursos } from './recursosTexto'
import { normalizarLinea } from './texto'

/** Patrón que ha producido un corte. Se enseña en el preview para poder juzgarlo. */
export type PatronCorte = 'markdown' | 'sesion-n' | 's-n' | 'mayusculas' | 'numerada'

export interface SesionParseada {
  /** Ausente si el texto no traía candidato. NUNCA se rellena por defecto. */
  titulo?: string
  /** `true` si se dedujo de un encabezado; `false` si venía de «Título:». */
  tituloProvisional: boolean
  descripcion: string
  recursos: string[]
  enlacesYNotas: string
  /** Offset dentro del texto YA normalizado, para resaltar en el preview. */
  inicioEnTexto: number
  patronDeteccion?: string
}

export interface ImportacionParseada {
  tituloUnidad?: string
  sesiones: SesionParseada[]
  /** `true` si los cortes salieron de un patrón débil y podrían ser apartados. */
  ambiguo: boolean
  /**
   * Números de sesión que el texto numeraba pero de los que no salió ningún
   * corte. Se avisa en el preview en vez de fusionarlas en silencio: dos
   * sesiones numeradas pegadas en una sola pasan desapercibidas al revisar.
   */
  sesionesFaltantes: number[]
  /** El texto normalizado sobre el que están medidos los `inicioEnTexto`. */
  texto: string
}

// ——————————————————————— 1.1 normalización ———————————————————————

/**
 * Deja el texto en una forma comparable venga de donde venga. Se hace ANTES de
 * parsear y el resultado se devuelve, porque los offsets del preview están
 * medidos sobre él: normalizar por dentro y devolver los offsets del original
 * los descuadraría en cuanto Word metiera un solo espacio duro.
 */
export function normalizarPegado(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(normalizarLinea)
    .join('\n')
}

// ——————————————————————— 1.2 cortes ———————————————————————

const MARKDOWN = /^\s{0,3}#{1,3}\s+\S/
const SESION_N = /^\s*sesi[óo]n\s*(?:n[ºo°]?\s*)?\d+/i
const NUMERADA = /^\s*\d+\s*[.\-)]\s+\S/
const ETIQUETA_TITULO = /^\s*t[íi]tulo\s*[:\-–]\s*(.*)$/i
const ETIQUETA_ENLACES = /^\s*(?:enlaces?|links?|notas)\s*[:\-–]\s*(.*)$/i

/**
 * «Consejo: …» es una nota para el maestro, no contenido de la sesión: se lleva
 * a «Enlaces y notas», que es el campo de eso. Se mueve el texto sin la
 * etiqueta, porque el campo ya dice que son notas.
 */
const ETIQUETA_CONSEJO = /^\s*consejos?\s*[:\-–]\s*(.*)$/i

/**
 * Etiquetas que SÍ son contenido de la sesión. Se quedan en la descripción,
 * pero con el rótulo en negrita: además de leerse mejor, la negrita protege la
 * línea de `comoActividad`, que si no convertiría «Contenidos: vocabulario —
 * campo léxico» en una actividad inventada por culpa del guion largo.
 */
const ETIQUETA_DESCRIPCION =
  /^\s*(contenidos?|lectura|dictado\s*\d*(?:\s*\([^)]*\))?)\s*:\s*(.*)$/i

/** Si una línea de «Enlaces y notas» es un enlace o una nota suelta. */
export function esEnlace(valor: string): boolean {
  return /^(?:https?:\/\/|www\.)\S+$/i.test(valor.trim())
}

/**
 * Una línea corta, en mayúsculas y sin punto final parece un encabezado. Se pide
 * que tenga alguna letra: «12 - 4 - 2» no es un título.
 */
function esMayusculas(linea: string): boolean {
  const t = linea.trim()
  if (!t || t.length >= 80 || t.endsWith('.')) return false
  if (!/\p{L}/u.test(t)) return false
  return t === t.toLocaleUpperCase('es')
}

// ————————————— cabecera «S<n>», en el orden que venga —————————————
//
// El formato de la cabecera ya ha cambiado una vez —«UD2 – S1 – …» pasó a
// «S1 – UD2 – …»— y volverá a cambiar. Por eso el token de sesión se busca
// SUELTO en la línea y no anclado al principio: lo que identifica una cabecera
// es que lleve un «S<n>» aislado, no en qué puesto lo lleva.
//
// El fallo que motivó esto: el patrón anterior, `/^\s*S\s*\d+\s*[:.\-]/`, pedía
// el separador en ASCII, y el texto real usa guion largo (–). No casaba, el
// troceo caía en la heurística de MAYÚSCULAS y las seis cabeceras que llevan
// minúsculas («Libro B, bloque 2», «Material propio») se perdían: 10 de 16.

/** Separadores que pueden rodear un token en una cabecera. */
const SEPARADOR = '[\\s–—\\-·:.|]'

/** `S 12`, aislado por separadores o por los bordes de la línea. Nunca `\d` a secas. */
const TOKEN_SESION = new RegExp(`(?:^|${SEPARADOR})S\\s*(\\d{1,3})(?=$|${SEPARADOR})`, 'i')

/** `UD2`, `U.D. 2`, `ud 2`: la unidad, vaya delante o detrás de la sesión. */
const TOKEN_UNIDAD = new RegExp(`(?:^|${SEPARADOR})U\\.?D\\.?\\s*(\\d{1,3})(?=$|${SEPARADOR})`, 'i')

/** Más larga que esto ya es prosa, no un rótulo. */
const LARGO_CABECERA = 120

/**
 * Líneas que empiezan por una etiqueta de campo conocida. Nunca son cabecera,
 * aunque mencionen una sesión: «Consejo: … prepara la alfabetización mediática
 * de la S11» habla de la sesión 11, no la abre.
 */
const ETIQUETA_DE_CAMPO =
  /^\s*(?:contenidos?|consejos?|lectura|dictado\s*\d*(?:\s*\([^)]*\))?|recursos?|materiales?)\s*:/i

/** El número de sesión de una cabecera `S<n>`, o `null` si la línea no lo es. */
function numeroDeCabecera(linea: string): number | null {
  const t = linea.trim()
  if (!t || t.length >= LARGO_CABECERA) return null
  if (ETIQUETA_DE_CAMPO.test(t)) return null
  const m = TOKEN_SESION.exec(t)
  return m ? Number(m[1]) : null
}

/**
 * El título de una cabecera `S<n>`: la línea sin los dos tokens y sin los
 * separadores que quedan sueltos en los extremos.
 *
 * « S5 – UD2 – SESIÓN DE LECTURA · Libro B, bloque 2 (p. 24) » →
 * «SESIÓN DE LECTURA · Libro B, bloque 2 (p. 24)». Si no queda nada, cadena
 * vacía: la regla de no inventar títulos manda, y la UI lo pedirá.
 */
function tituloDeCabecera(linea: string): string {
  return linea
    .trim()
    .replace(TOKEN_SESION, ' ')
    .replace(TOKEN_UNIDAD, ' ')
    .replace(new RegExp(`^${SEPARADOR}+`), '')
    .replace(new RegExp(`${SEPARADOR}+$`), '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** Longitud a partir de la cual un bloque es «texto de verdad» y no un ítem de lista. */
const BLOQUE_SIGNIFICATIVO = 120

interface Corte {
  linea: number
  patron: PatronCorte
  /** Solo en el patrón `s-n`: el número que traía la cabecera. */
  numero?: number
}

/**
 * Cortes de una lista de líneas, quedándose con el PRIMER patrón que produzca
 * alguno. El orden importa: `## Sesión 1` casa con markdown y con `sesion-n`, y
 * cortar dos veces por la misma línea partiría la sesión en una vacía y otra.
 */
function detectarCortes(lineas: string[]): Corte[] {
  const porPatron = (patron: PatronCorte, prueba: (l: string) => boolean): Corte[] =>
    lineas.flatMap((l, i) => (prueba(l) ? [{ linea: i, patron }] : []))

  const markdown = porPatron('markdown', (l) => MARKDOWN.test(l))
  if (markdown.length) return markdown

  const sesionN = porPatron('sesion-n', (l) => SESION_N.test(l))
  if (sesionN.length) return sesionN

  const sN = lineas.flatMap((l, i) => {
    const numero = numeroDeCabecera(l)
    return numero === null ? [] : [{ linea: i, patron: 's-n' as const, numero }]
  })
  if (sN.length) return sN

  const mayusculas = porPatron('mayusculas', esMayusculas)
  if (mayusculas.length) return mayusculas

  // Numeración: solo si hay 2+ y entre ellas hay texto de longitud significativa.
  // Sin esta condición, «1. Calentamiento / 2. Juego / 3. Vuelta a la calma»
  // —la lista de actividades de UNA sesión— saldría como tres sesiones.
  const numerada = porPatron('numerada', (l) => NUMERADA.test(l))
  if (numerada.length >= 2) {
    const cuerpos = numerada.map((c, i) => {
      const fin = i + 1 < numerada.length ? numerada[i + 1].linea : lineas.length
      return lineas.slice(c.linea + 1, fin).join('\n').trim().length
    })
    if (cuerpos.filter((n) => n >= BLOQUE_SIGNIFICATIVO).length >= 2) return numerada
  }

  return []
}

// ——————————————————————— 1.4 título ———————————————————————

/** Una línea corta y sin punto final puede ser un encabezado aunque no grite. */
function pareceEncabezado(linea: string): boolean {
  const t = linea.trim()
  return !!t && t.length < 80 && !t.endsWith('.')
}

/**
 * «Sesión 1 · Bienvenidos a Educación Física» → el título es lo que va tras el
 * separador. El número es POSICIONAL: la sesión ya sabe en qué puesto va, y
 * arrastrarlo al título lo repite en cada listado y estorba al reordenar.
 *
 * El punto medio entra en la lista de separadores porque es el que se usa al
 * escribir esto en Word; sin él el título salía como «· Bienvenidos a…».
 */
const SESION_TITULADA = /^sesi[óo]n\s*\d+\s*[·\-–—:.]\s*(.+)$/i

/** Deja un encabezado en su texto: sin `##`, sin viñeta y sin «Sesión 3:» delante. */
function limpiarEncabezado(linea: string): string {
  const base = linea
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/^\s*[-–—*·]\s+/, '')
    .trim()

  const titulada = SESION_TITULADA.exec(base)
  if (titulada) return titulada[1].trim()

  // Sin separador tras el número no se recorta: «Sesión 3 Bienvenidos» se queda
  // entero, porque no hay forma de saber dónde acaba la posición y empieza el
  // título sin adivinarlo. Lo único que sí se sabe es que un «Sesión 3» a secas
  // no deja título: ahí devuelve cadena vacía y la UI lo pide.
  const sinPosicion = base
    .replace(/^\s*(?:sesi[óo]n\s*(?:n[ºo°]?\s*)?\d+|S\s*\d+|\d+)\s*[:.\-–)]?\s*/i, '')
    .trim()
  if (sinPosicion === base) return base
  return sinPosicion ? base : ''
}

// ——————————————————————— título de la unidad ———————————————————————

/**
 * Etiqueta explícita del título de la unidad, en el preámbulo: «Unidad: …»,
 * «UD: …», «Unidad didáctica: …», «Título: …». Manda sobre cualquier deducción.
 */
const ETIQUETA_UNIDAD =
  /^\s*(?:t[íi]tulo(?:\s+de\s+la\s+unidad)?|unidad(?:\s+did[áa]ctica)?|u\.?\s*d\.?)\s*[:\-–—]\s*(.+)$/i

/**
 * «Unidad 3», «UD 3», «U.D. 3» a secas, sin nada detrás: es la posición de la
 * unidad, no su título, igual que «Sesión 3» no es el título de una sesión.
 */
const UNIDAD_POSICIONAL =
  /^\s*(?:unidad(?:\s+did[áa]ctica)?|u\.?\s*d\.?)\s*(?:n[ºo°]?\s*)?\d*\s*[:.\-–—)]?\s*$/i

/**
 * Título de la unidad, de lo que va por encima del primer corte.
 *
 * Tres intentos, de más fiable a menos, y ninguno inventa: si el preámbulo es
 * un párrafo de contexto («Esta programación se ha diseñado para…»), no hay
 * título y la UI lo pide antes de dejar importar.
 *
 * El salto sobre la línea posicional es lo que arregla el caso corriente de un
 * documento que empieza con «UNIDAD 1» en un renglón y el título en el
 * siguiente: antes se quedaba con «UNIDAD 1», que no dice nada, y había que
 * escribirlo a mano igualmente.
 */
function tituloDelPreambulo(preambulo: string[]): string | undefined {
  for (const linea of preambulo) {
    const etiqueta = ETIQUETA_UNIDAD.exec(linea)
    const valor = etiqueta?.[1]?.trim()
    if (valor) return valor
  }

  for (const linea of preambulo) {
    if (!linea.trim()) continue
    // Un párrafo corta la búsqueda: lo que venga después ya no es el
    // encabezado de la unidad, es el cuerpo del documento.
    if (!pareceEncabezado(linea)) return undefined
    if (UNIDAD_POSICIONAL.test(linea)) continue
    const candidato = limpiarEncabezado(linea)
    if (candidato) return candidato
  }

  return undefined
}

// ——————————————————————— bloque → sesión ———————————————————————

function parsearBloque(
  bloque: string,
  inicioEnTexto: number,
  patron: PatronCorte | undefined,
  esEncabezado: boolean,
): SesionParseada {
  // El patrón `s-n` tiene su propia limpieza: hay que quitar DOS tokens (la
  // sesión y la unidad) y da igual en qué orden vengan. `limpiarEncabezado` no
  // sirve — conserva la línea entera cuando el separador no es el que espera—,
  // y se deja intacta para no mover los demás patrones.
  const limpiar = patron === 's-n' ? tituloDeCabecera : limpiarEncabezado
  const lineas = bloque.split('\n')

  // — título —
  let titulo: string | undefined
  let tituloProvisional = true
  const lineasTitulo = new Set<number>()

  const iEtiqueta = lineas.findIndex((l) => ETIQUETA_TITULO.test(l))
  if (iEtiqueta >= 0) {
    const valor = (ETIQUETA_TITULO.exec(lineas[iEtiqueta])?.[1] ?? '').trim()
    if (valor) {
      titulo = valor
      tituloProvisional = false
      lineasTitulo.add(iEtiqueta)
    }
  }

  if (titulo === undefined) {
    const iPrimera = lineas.findIndex((l) => l.trim())
    if (iPrimera >= 0 && (esEncabezado || pareceEncabezado(lineas[iPrimera]))) {
      const candidato = limpiar(lineas[iPrimera])
      // Un encabezado que solo decía «Sesión 3» se queda sin texto al limpiarlo:
      // «Sesión 3» no es un título, es una posición. Mejor sin título y que el
      // preview lo pida, que colar un rótulo que no dice qué se hace en clase.
      if (candidato) {
        titulo = candidato
        lineasTitulo.add(iPrimera)
      } else if (esEncabezado) {
        lineasTitulo.add(iPrimera)
      }
    }
  }

  // — recursos (1.5): el extractor único, sobre el bloque entero —
  const { recursos, enlaces: enlacesDelMaterial, lineasConsumidas } = extraerRecursos(bloque)
  const lineasRecursos = new Set(lineasConsumidas)

  // — enlaces y notas (1.6) —
  const enlaces: string[] = []
  const vistos = new Set<string>()
  const lineasEnlace = new Set<number>()

  const anadirEnlace = (valor: string) => {
    const limpio = valor.trim().replace(/[.,;)]+$/, '')
    if (!limpio || vistos.has(limpio)) return
    vistos.add(limpio)
    enlaces.push(limpio)
  }

  // Una nota es una frase: conserva su punto final. Recortarlo como se hace con
  // las URLs la dejaría coja.
  const anadirNota = (valor: string) => {
    const limpio = valor.trim()
    if (!limpio || vistos.has(limpio)) return
    vistos.add(limpio)
    enlaces.push(limpio)
  }

  // Las URLs que iban DENTRO del apartado de material entran primero: sus
  // líneas ya están consumidas, así que el bucle de abajo no las verá, y sin
  // esto el enlace se perdería por el camino.
  for (const u of enlacesDelMaterial) anadirEnlace(u)

  for (let i = 0; i < lineas.length; i++) {
    if (lineasTitulo.has(i) || lineasRecursos.has(i)) continue
    const linea = lineas[i]

    const consejo = ETIQUETA_CONSEJO.exec(linea)
    if (consejo) {
      const valor = consejo[1].trim()
      if (valor) anadirNota(valor)
      lineasEnlace.add(i)
      continue
    }

    const etiqueta = ETIQUETA_ENLACES.exec(linea)
    const encontradas = linea.match(URL) ?? []

    if (etiqueta) {
      // Bajo etiqueta explícita: la línea entera se MUEVE, traiga URL o no.
      const valor = etiqueta[1].trim()
      if (valor) anadirEnlace(valor)
      lineasEnlace.add(i)
      continue
    }

    if (encontradas.length === 0) continue

    // URL en línea propia (la línea es solo la URL) → se mueve.
    // URL embebida en una frase → se copia y la frase se queda como está, o el
    // texto perdería el sentido justo donde explica para qué es el enlace.
    const soloUrl = encontradas.length === 1 && linea.trim() === encontradas[0]
    for (const u of encontradas) anadirEnlace(u)
    if (soloUrl) lineasEnlace.add(i)
  }

  // — descripción (1.7): el resto, con la jerarquía marcada en markdown —
  // `aMarkdown` va al final y hace dos cosas de un tiro: marcar los tres
  // niveles y cerrar el hueco que deja el bloque de material al marcharse —es
  // un movimiento, y un movimiento no debe dejar ni la etiqueta huérfana ni el
  // agujero donde estaba—. Al final y no antes, porque marcar la jerarquía
  // primero convertiría en encabezado una línea que luego se lleva otro campo.
  const descripcion = aMarkdown(
    lineas
      .filter((_, i) => !lineasTitulo.has(i) && !lineasRecursos.has(i) && !lineasEnlace.has(i))
      .map((l) => {
        const etiqueta = ETIQUETA_DESCRIPCION.exec(l)
        if (!etiqueta) return l
        const [, rotulo, resto] = etiqueta
        return resto.trim() ? `**${rotulo.trim()}:** ${resto.trim()}` : `**${rotulo.trim()}:**`
      })
      .join('\n'),
  )

  return {
    titulo,
    tituloProvisional,
    descripcion,
    recursos,
    enlacesYNotas: enlaces.join('\n'),
    inicioEnTexto,
    patronDeteccion: patron,
  }
}

// ——————————————————————— control de numeración ———————————————————————

/**
 * Los números que el texto numeraba y de los que no salió ningún corte.
 *
 * Existe porque una sesión que no se detecta no desaparece: se queda pegada
 * dentro de la anterior, y al revisar el preview no se ve el pegote. Con el
 * número delante, el aviso puede decir exactamente cuál falta.
 *
 * Solo tiene sentido con el patrón `s-n`, que es el único que trae número.
 */
function faltantes(cortes: Corte[]): number[] {
  const numeros = cortes.flatMap((c) => (c.numero === undefined ? [] : [c.numero]))
  if (numeros.length === 0) return []

  const vistos = new Set(numeros)
  const tope = Math.max(...numeros)
  const ausentes: number[] = []
  for (let n = 1; n <= tope; n++) if (!vistos.has(n)) ausentes.push(n)
  return ausentes
}

// ——————————————————————— 1.3 entrada ———————————————————————

/**
 * Trocea el texto pegado en sesiones y reparte cada bloque en los campos que la
 * sesión ya tiene. No escribe nada: quien llame enseña el preview y decide.
 */
export function analizarTexto(entrada: string): ImportacionParseada {
  const texto = normalizarPegado(entrada)
  const lineas = texto.split('\n')

  // Offset de cada línea dentro del texto normalizado.
  const offsets: number[] = []
  let acumulado = 0
  for (const linea of lineas) {
    offsets.push(acumulado)
    acumulado += linea.length + 1
  }

  const cortes = detectarCortes(lineas)

  if (cortes.length === 0) {
    if (!texto.trim())
      return { tituloUnidad: undefined, sesiones: [], ambiguo: false, sesionesFaltantes: [], texto }
    return {
      tituloUnidad: undefined,
      sesiones: [parsearBloque(texto, 0, undefined, false)],
      ambiguo: false,
      sesionesFaltantes: [],
      texto,
    }
  }

  const tituloUnidad = tituloDelPreambulo(lineas.slice(0, cortes[0].linea))

  const sesiones = cortes.map((corte, i) => {
    const fin = i + 1 < cortes.length ? cortes[i + 1].linea : lineas.length
    const bloque = lineas.slice(corte.linea, fin).join('\n')
    return parsearBloque(bloque, offsets[corte.linea], corte.patron, true)
  })

  const patron = cortes[0].patron
  const ambiguo = cortes.length >= 2 && (patron === 'mayusculas' || patron === 'numerada')

  return { tituloUnidad, sesiones, ambiguo, sesionesFaltantes: faltantes(cortes), texto }
}

/**
 * Une dos sesiones contiguas en una: el troceo se pasó de listo y lo que salió
 * como dos sesiones era una con apartados. Se conserva el título de la primera
 * y el de la segunda baja a la descripción, que es donde el usuario lo escribió.
 */
export function fusionarSesiones(a: SesionParseada, b: SesionParseada): SesionParseada {
  const vistos = new Set<string>()
  const recursos = [...a.recursos, ...b.recursos].filter((r) => {
    const clave = r.toLocaleLowerCase('es')
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })

  const cola = [b.titulo, b.descripcion].filter(Boolean).join('\n')
  const descripcion = [a.descripcion, cola].filter(Boolean).join('\n\n')
  const enlaces = [a.enlacesYNotas, b.enlacesYNotas].filter(Boolean).join('\n')

  return {
    titulo: a.titulo,
    tituloProvisional: a.tituloProvisional,
    descripcion,
    recursos,
    enlacesYNotas: enlaces,
    inicioEnTexto: a.inicioEnTexto,
    patronDeteccion: a.patronDeteccion,
  }
}
