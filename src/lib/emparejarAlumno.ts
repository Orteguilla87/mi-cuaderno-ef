import type { Alumno } from '../db/types'
import { normalizarTexto } from './texto'

/**
 * Emparejamiento nombre→alumno del agente de voz. Es lo ÚNICO que decide a
 * quién se refiere un dictado: lo consumen el fuzzy local
 * (`buscarAlumnoEnTexto`), la pseudonimización antes de la API
 * (`pseudonimizarTexto`) y la propuesta de alias tras corregir.
 *
 * ——— POR QUÉ NO ES FUSE ———
 *
 * Antes cada palabra del dictado entraba en Fuse (`threshold: 0.4`) y se
 * proponía al mejor, sin mínimo propio. Con veinte nombres delante siempre hay
 * un «menos malo»: «Bea muy bien» acababa en Alba (0,36) sin que nadie
 * preguntara, «falta» casaba con «Alba» y «trae» con «Herrera». Una sugerencia
 * errónea que el maestro tiene que cazar es peor que ninguna.
 *
 * Aquí: forma canónica fonética del español, ventanas del dictado contra varias
 * formas del nombre, distancia de edición y un UMBRAL por debajo del cual no se
 * propone a nadie. Si varios quedan a menos de MARGEN del mejor, salen todos:
 * el sistema no elige por el maestro.
 *
 * ——— INVARIANTE: `alumnos` YA VIENE ACOTADO AL GRUPO ———
 *
 * Quien llama pasa SOLO los activos del grupo resuelto (`lib/grupoEnTexto.ts`,
 * `db/agente.ts:resolverGrupo`), y el texto ya sin la mención del grupo. Este
 * módulo no puede devolver a un alumno de otra clase porque no lo ve.
 *
 * Módulo puro: ni `db` ni React.
 */

/**
 * Por debajo de esto, no hay candidato. Calibrado sobre canónicos: deja pasar
 * una errata en un nombre de seis letras o más («Daniel»/«Danie»), y deja fuera
 * «falta»/«alba» (0,6), «bea»/«bega» (0,75) o «ablo»/«pablo» (0,8, que es lo que
 * queda de «habló» sin la hache).
 */
export const UMBRAL = 0.82

/** Quienes quedan a menos de esto del mejor empatan con él y se preguntan. */
export const MARGEN = 0.1

/**
 * Palabras de las órdenes, que nunca se proponen como alias: si el maestro
 * elige a mano tras «falta», lo que dijo del alumno no es «falta».
 */
const VOCABULARIO_ORDENES = new Set(
  [
    'falta', 'faltas', 'ausente', 'presente', 'retraso', 'tarde', 'llega', 'llegado', 'justificada',
    'justificado', 'venido', 'vino', 'chandal', 'trae', 'lleva', 'olvidado', 'sin', 'con', 'muy',
    'bien', 'mal', 'genial', 'hoy', 'ayer', 'manana', 'nota', 'observacion', 'positivo', 'negativo',
    'tiene', 'esta', 'para', 'que', 'por', 'del', 'los', 'las', 'una', 'uno', 'pon', 'ponle', 'apunta',
    'clase', 'sesion', 'lesionado', 'lesionada', 'ayuda', 'colabora', 'pelea', 'molesta',
  ].map((p) => canonico(p)),
)

/**
 * Forma canónica fonética de UNA palabra en español. Sobre la forma ya
 * normalizada (minúsculas, sin tildes), en un orden fijo, porque las reglas se
 * pisan: «g» ante e/i pasa a «j» ANTES de que «gu» ante e/i pierda la «u»
 * («Guille» no es «Jille»), y «ch» se aparta antes de borrar las haches.
 *
 * b/v/w · ll/y · h muda · c/z/s · j/g ante e,i · qu/k · tildes · dobles.
 */
export function canonico(palabra: string): string {
  return (
    normalizarTexto(palabra)
      .replace(/[^a-z0-9]/g, '')
      .replace(/ch/g, '§')
      .replace(/g(?=[ei])/g, 'j')
      .replace(/gu(?=[ei])/g, 'g')
      .replace(/qu(?=[ei])/g, 'k')
      .replace(/q/g, 'k')
      .replace(/c(?=[ei])/g, 's')
      .replace(/z/g, 's')
      .replace(/c/g, 'k')
      .replace(/h/g, '')
      .replace(/ll/g, 'y')
      .replace(/[vw]/g, 'b')
      .replace(/y$/, 'i')
      .replace(/(.)\1+/g, '$1')
      .replace(/§/g, 'ch')
  )
}

function palabrasCanonicas(s: string): string[] {
  return s
    .split(/\s+/)
    .map(canonico)
    .filter(Boolean)
}

/**
 * Las formas con las que el maestro puede nombrar a un alumno, ya canónicas:
 * nombre, cada palabra del nombre compuesto, apellidos, cada apellido, nombre
 * completo, nombre + primer apellido, el alias visible y los alias de voz.
 *
 * Una forma de una sola palabra de menos de tres letras es arriesgada: «Lu» o
 * «Bo» casarían a una letra de cualquier «la», «lo», «no». Las de nombre y
 * alias se quedan pero solo valen IDÉNTICAS (`exacta`); las de apellido («de»,
 * «la» de «de la Fuente») no se quedan.
 */
export function formasDe(
  a: Pick<Alumno, 'nombre' | 'apellidos' | 'alias' | 'aliasVoz'>,
): { palabras: string[]; exacta: boolean }[] {
  const nombre = palabrasCanonicas(a.nombre)
  const apellidos = palabrasCanonicas(a.apellidos)
  const primerApellido = apellidos.find((p) => p.length >= 3)
  const corta = (f: string[]) => f.length === 1 && f[0].length < 3
  const deNombre: string[][] = [
    nombre,
    ...nombre.map((p) => [p]),
    palabrasCanonicas(a.alias ?? ''),
    ...(a.aliasVoz ?? []).map(palabrasCanonicas),
  ]
  const deApellido: string[][] = [
    apellidos,
    ...apellidos.map((p) => [p]).filter((f) => !corta(f)),
    [...nombre, ...apellidos],
    primerApellido ? [...nombre, primerApellido] : [],
  ]
  const vistas = new Set<string>()
  return [...deNombre, ...deApellido]
    .filter((f) => {
      if (f.length === 0) return false
      const clave = f.join(' ')
      if (vistas.has(clave)) return false
      vistas.add(clave)
      return true
    })
    .map((palabras) => ({ palabras, exacta: corta(palabras) }))
}

/** 1 − distancia de Levenshtein / longitud mayor. 1 es idéntico. */
export function similitud(a: string, b: string): number {
  if (a === b) return 1
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previa = actual
  }
  return 1 - previa[b.length] / max
}

/** Una palabra del dictado, con su posición en el texto ORIGINAL. */
interface Palabra {
  canonica: string
  inicio: number
  fin: number
}

function palabrasDe(texto: string): Palabra[] {
  return [...texto.matchAll(/[\p{L}\p{N}]+/gu)]
    .map((m) => ({ canonica: canonico(m[0]), inicio: m.index!, fin: m.index! + m[0].length }))
    .filter((p) => p.canonica)
}

/** Dónde y con qué fuerza aparece un alumno en el dictado. */
export interface Coincidencia {
  alumno: Alumno
  puntuacion: number
  /** Tramo del texto original (para sustituirlo por un token). */
  inicio: number
  fin: number
  /** Lo dictado tal cual en ese tramo. */
  fragmento: string
  /** Cuántas palabras cubre: «Pablo Vidal» (2) pesa más que «Pablo» (1). */
  palabras: number
}

/**
 * Todas las ventanas del dictado que se parecen a alguna forma de algún alumno,
 * SIN aplicar el umbral. Cada ventana tiene tantas palabras como la forma con
 * la que se compara; una ventana de una palabra necesita tres letras.
 */
function todasLasCoincidencias(texto: string, alumnos: Alumno[]): Coincidencia[] {
  const palabras = palabrasDe(texto)
  const salida: Coincidencia[] = []
  for (const alumno of alumnos) {
    for (const { palabras: forma, exacta } of formasDe(alumno)) {
      const n = forma.length
      const objetivo = forma.join(' ')
      for (let i = 0; i + n <= palabras.length; i++) {
        const ventana = palabras.slice(i, i + n)
        const dicho = ventana.map((p) => p.canonica).join(' ')
        // Una palabra de menos de tres letras solo cuenta si es idéntica a una
        // forma corta («Lu»); nunca por parecido.
        if (n === 1 && dicho.length < 3 && !exacta) continue
        const puntuacion = exacta ? (dicho === objetivo ? 1 : 0) : similitud(dicho, objetivo)
        const inicio = ventana[0].inicio
        const fin = ventana[n - 1].fin
        salida.push({ alumno, puntuacion, inicio, fin, fragmento: texto.slice(inicio, fin), palabras: n })
      }
    }
  }
  return salida
}

/** Las ventanas que superan el umbral, de mejor a peor (y, a igualdad, la más larga). */
export function coincidencias(texto: string, alumnos: Alumno[]): Coincidencia[] {
  return todasLasCoincidencias(texto, alumnos)
    .filter((c) => c.puntuacion >= UMBRAL)
    .sort((a, b) => b.puntuacion - a.puntuacion || b.palabras - a.palabras)
}

export interface CandidatoAlumno {
  alumno: Alumno
  puntuacion: number
  /** Palabras que cubre su mejor coincidencia (1 si no se sabe). */
  palabras?: number
}

/**
 * Los alumnos que superan el umbral, uno por alumno con su mejor puntuación,
 * de mejor a peor. Vacío si nadie se parece lo bastante.
 */
export function candidatosAlumno(texto: string, alumnos: Alumno[]): CandidatoAlumno[] {
  const mejor = new Map<string, CandidatoAlumno>()
  for (const c of coincidencias(texto, alumnos)) {
    const previo = mejor.get(c.alumno.id)
    if (!previo) mejor.set(c.alumno.id, { alumno: c.alumno, puntuacion: c.puntuacion, palabras: c.palabras })
    // Casi igual de parecida pero más entera: cuenta para desempatar en `decidir`.
    else if (c.puntuacion > previo.puntuacion - MARGEN && c.palabras > (previo.palabras ?? 1))
      previo.palabras = c.palabras
  }
  return [...mejor.values()]
}

export type ResultadoEmparejar =
  /** Uno destaca: se propone (y se confirma en la tarjeta). */
  | { estado: 'unico'; alumno: Alumno; candidatos: CandidatoAlumno[] }
  /** Varios a menos de MARGEN del mejor: se enseñan todos. */
  | { estado: 'varios'; candidatos: CandidatoAlumno[] }
  /** Nadie supera el umbral: se enseña la lista del grupo. */
  | { estado: 'ninguno'; candidatos: [] }

/**
 * La decisión, a partir de los candidatos ya filtrados por umbral. Separada de
 * la búsqueda para que los parsers que reciben `buscarAlumno` inyectado
 * decidan con la misma regla.
 */
export function decidir(candidatos: CandidatoAlumno[]): ResultadoEmparejar {
  if (candidatos.length === 0) return { estado: 'ninguno', candidatos: [] }
  const [mejor] = candidatos
  const empatados = candidatos.filter((c) => c.puntuacion > mejor.puntuacion - MARGEN)
  if (empatados.length === 1) return { estado: 'unico', alumno: mejor.alumno, candidatos }
  // Empate en parecido, pero uno se nombró más entero: «Pablo Vidal» con dos
  // Pablos en clase. Solo si es UNO el que cubre más palabras; si no, se pregunta.
  const maxPalabras = Math.max(...empatados.map((c) => c.palabras ?? 1))
  const masEnteros = empatados.filter((c) => (c.palabras ?? 1) === maxPalabras)
  if (maxPalabras > 1 && masEnteros.length === 1)
    return { estado: 'unico', alumno: masEnteros[0].alumno, candidatos }
  return { estado: 'varios', candidatos: empatados }
}

export function emparejarAlumno(texto: string, alumnos: Alumno[]): ResultadoEmparejar {
  return decidir(candidatosAlumno(texto, alumnos))
}

/**
 * Lo que el maestro dijo para referirse a `alumno`, cuando el emparejador no lo
 * reconoció y lo ha elegido a mano: el tramo del dictado más parecido a alguna
 * de sus formas, descartando las palabras de la orden. Es lo que se OFRECE
 * guardar como alias de voz; nunca se guarda solo. `undefined` si no queda
 * nada razonable que ofrecer o si ya es uno de sus alias.
 */
export function fragmentoParaAlias(texto: string, alumno: Alumno): string | undefined {
  const mejor = todasLasCoincidencias(texto, [alumno])
    .filter((c) => !c.fragmento.split(/\s+/).some((p) => VOCABULARIO_ORDENES.has(canonico(p))))
    .sort((a, b) => b.puntuacion - a.puntuacion)[0]
  if (!mejor) return undefined
  const yaEsta = (alumno.aliasVoz ?? []).some((a) => canonico(a) === canonico(mejor.fragmento))
  return yaEsta ? undefined : mejor.fragmento
}
