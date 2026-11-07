import type { Alumno, Grupo, SignoObservacion } from '../db/types'
import { buscarCursoTrasDe } from './grupoEnTexto'
import { normalizarTexto } from './texto'

/**
 * Dictado con la convención fija del maestro: NOMBRE, después CURSO, después
 * LO QUE HA HECHO.
 *
 *   «David de cuarto A ha ayudado a recoger el material»
 *   «Lucía Martín del 4ºB no ha traído el chándal»
 *
 * ——— EL CURSO ES EL DELIMITADOR ———
 *
 * La primera mención «de/del + curso» parte la frase en tres: lo de antes es el
 * nombre (y SOLO eso se empareja con el alumnado), la mención es el grupo, y lo
 * de después es el comentario. Así el comentario nunca contamina la búsqueda del
 * alumno («Bea de cuarto A ha molestado a Hugo» ya no empata Bea con Hugo) y el
 * nombre nunca acaba dentro del comentario.
 *
 * Se corta solo en «de/del» SEGUIDO de un curso, nunca en un «de» suelto: hay
 * nombres que lo llevan dentro («María de los Ángeles»).
 *
 * Módulo puro: ni `db` ni React.
 */

export interface DictadoPartido {
  /** Lo dicho antes del curso: el único texto que se empareja con el alumnado. */
  nombre: string
  /** El curso tal cual se dijo, sin el «de»: «cuarto A», «4ºB». */
  mencion: string
  /** Lo dicho después del curso, en bruto. */
  comentario: string
  /** Grupos compatibles con la mención: 0, 1 o varios (se desempata fuera). */
  candidatos: Grupo[]
}

/** `null` si no hay ninguna mención «de/del + curso» con algo delante. */
export function partirPorCurso(texto: string, grupos: Grupo[]): DictadoPartido | null {
  const curso = buscarCursoTrasDe(texto, grupos)
  if (!curso) return null
  const nombre = texto.slice(0, curso.desde).replace(/[\s,;:.]+$/, '').trim()
  const comentario = texto.slice(curso.hasta).trim()
  // Sin nombre delante, o con una ORDEN delante («haz equipos de cuarto A»),
  // no es la convención: sigue la ruta de órdenes de siempre.
  if (!nombre || ORDEN_DELANTE.test(normalizarTexto(nombre))) return null
  return { nombre, mencion: curso.mencion, comentario, candidatos: curso.candidatos }
}

/** Palabras de orden que nunca forman parte de un nombre de alumno. */
const ORDEN_DELANTE =
  /\b(equipos?|grupos?|parejas|sortea\w*|sorteo|aleatori\w*|crea\w*|haz|hazme|columna|lista|todos|todas|clase|sesion|cronometro|marcador|cuantos|cuantas|que|quien|como|borra\w*|elimina\w*)\b/

/** Conectores que el dictado deja al principio del comentario y no aportan. */
const CONECTORES_INICIALES = /^(?:(?:que|pues|y|e|bueno|eh)\b[\s,]*)+/i

/**
 * El tramo del comentario como texto de cuaderno: en tercera persona y sin
 * sujeto, que es como ya lo dicta el maestro («ha ayudado…»). Solo se limpia el
 * arranque y se pone la mayúscula.
 */
export function redactarComentario(tramo: string): string {
  const limpio = tramo
    .trim()
    .replace(/^[\s,;:.\-–—]+/, '')
    .replace(CONECTORES_INICIALES, '')
    .replace(/\s+/g, ' ')
    .trim()
  return mayusculaInicial(limpio)
}

function mayusculaInicial(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('es') + s.slice(1) : s
}

/** Vocales con y sin tilde, para buscar sin depender de cómo se escribió. */
const VARIANTES: Record<string, string> = {
  a: '[aáàä]',
  e: '[eéèë]',
  i: '[iíìï]',
  o: '[oóòö]',
  u: '[uúùü]',
}

function patronSinTildes(forma: string): string {
  return [...normalizarTexto(forma)]
    .map((c) => VARIANTES[c] ?? (c === ' ' ? '\\s+' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'san', 'santa'])

/** Todas las formas con las que se puede nombrar al alumno, de la más larga a la más corta. */
function formasDelAlumno(alumno: Pick<Alumno, 'nombre' | 'apellidos' | 'alias' | 'aliasVoz'>): string[] {
  const nombre = alumno.nombre.trim()
  const apellidos = alumno.apellidos.trim()
  const primerApellido = apellidos.split(/\s+/).find((p) => p.length >= 3)
  const formas = [
    `${nombre} ${apellidos}`,
    primerApellido ? `${nombre} ${primerApellido}` : '',
    nombre,
    apellidos,
    // Las partículas de un nombre compuesto («María DE LOS Ángeles») no se
    // quitan sueltas: se llevarían por delante medio comentario.
    ...nombre.split(/\s+/).filter((p) => p.length >= 3 && !PARTICULAS.has(normalizarTexto(p))),
    ...apellidos.split(/\s+/).filter((p) => p.length >= 4 && !PARTICULAS.has(normalizarTexto(p))),
    alumno.alias ?? '',
    ...(alumno.aliasVoz ?? []),
  ]
  return [...new Set(formas.map((f) => f.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
}

/** Curso dicho como «de/del + ordinal [+ letra]» o escrito «4ºA», en cualquier sitio. */
const CURSO_SUELTO =
  /(?:\b(?:de|del)\s+)?(?:\b(?:primero|primer|primera|segundo|segunda|tercero|tercer|tercera|cuarto|cuarta|quinto|quinta|sexto|sexta)\b(?:\s+[a-e]\b)?|\b[1-6]\s*[º°ª]\s*[a-e]?\b|\b[1-6][a-e]\b)/giu

/**
 * SALVAGUARDA FINAL del comentario, venga del parser local o de la IA: quita el
 * nombre del alumno en todas sus formas (nombre, apellidos, alias, alias de
 * voz), cualquier mención de curso, el nombre y alias del grupo y cualquier
 * marcador de pseudonimización ([A1], [G2]). Se aplica SIEMPRE antes de enseñar
 * o guardar, aunque el texto ya «debería» venir limpio.
 */
export function sanearComentario(
  texto: string,
  ctx: { alumno?: Pick<Alumno, 'nombre' | 'apellidos' | 'alias' | 'aliasVoz'>; grupo?: Pick<Grupo, 'nombre' | 'alias'>; mencion?: string },
): string {
  let s = texto.replace(/\[\s*[AG]\s*\d+\s*\]/gi, ' ')
  const formas = [
    ...(ctx.alumno ? formasDelAlumno(ctx.alumno) : []),
    ...(ctx.grupo ? [ctx.grupo.nombre, ...(ctx.grupo.alias ?? [])] : []),
    ctx.mencion ?? '',
  ]
    .map((f) => f.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  for (const forma of formas) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:de|del)\\s+)?${patronSinTildes(forma)}(?![\\p{L}\\p{N}])`, 'giu')
    s = s.replace(re, ' ')
  }
  s = s.replace(CURSO_SUELTO, ' ')
  return mayusculaInicial(
    s
      .replace(/\s+/g, ' ')
      .replace(/\s+([,;:.!?])/g, '$1')
      .replace(/^[\s,;:.\-–—]+/, '')
      .replace(/([,;:])\s*$/, '')
      .trim(),
  )
}

/** Signo de una observación libre, por palabras clave. Sin pista: neutro. */
export function signoDeComentario(texto: string): SignoObservacion {
  const t = normalizarTexto(texto)
  if (/\b(no ha traido|no trae|no ha hecho|no trabaja|mal|pelea\w*|molest\w*|falta al respeto|insult\w*|empuj\w*)\b/.test(t))
    return '-'
  if (/\b(bien|genial|estupend\w*|ayud\w*|colabor\w*|atent[oa]s?|lider\w*|esfuerz\w*|se esfuerza|participa\w*)\b/.test(t))
    return '+'
  return 'neutro'
}
