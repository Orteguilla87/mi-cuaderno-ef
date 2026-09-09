import Fuse from 'fuse.js'
import type { Alumno } from '../db/types'
import { normalizarTexto } from './texto'

/**
 * Propuestas de vinculación entre DOS grupos concretos: qué ficha de aquí
 * podría ser la misma persona que cuál de allí.
 *
 * ——— REGLA DURA: ESTO SOLO PROPONE ———
 *
 * Aquí no se escribe nada. Dos alumnos pueden llamarse igual, y el mismo alumno
 * estar escrito distinto en cada lista («José Luis» / «Jose L.»); un
 * emparejamiento automático mezclaría en silencio los datos de dos niños
 * distintos, y eso no se arregla mirando la pantalla porque nadie sospecha que
 * haya pasado. Así que en cuanto hay más de un candidato —a un lado o al otro—
 * la propuesta sale marcada como AMBIGUA y sin nadie preseleccionado: la
 * resuelve el usuario o no se resuelve.
 *
 * Solo se comparan los dos grupos que el usuario elige. Nunca se recorre la
 * base entera.
 */

export type EstadoPropuesta =
  /** Mismo nombre normalizado, y único a los dos lados. */
  | 'exacta'
  /** Coincidencia difusa clara y única: «José Luis» / «Jose L.». */
  | 'probable'
  /** Dos o más candidatos, a un lado o al otro. Exige resolución individual. */
  | 'ambigua'
  /** Nadie se le parece lo bastante. Se queda sin vincular, sin ruido. */
  | 'sin-pareja'
  /** Ya son la misma persona. No hay nada que confirmar. */
  | 'ya-vinculada'

export interface Candidato {
  alumno: Alumno
  /** 0..1; 1 es idéntico. */
  puntuacion: number
}

export interface Propuesta {
  /** La ficha del primer grupo. */
  a: Alumno
  estado: EstadoPropuesta
  /** La pareja propuesta. Solo en 'exacta', 'probable' y 'ya-vinculada'. */
  b?: Alumno
  /**
   * Los candidatos del segundo grupo, de más a menos parecido. En 'ambigua' son
   * los que hay que desempatar a mano; en el resto se deja lo que se encontró
   * para que la UI pueda ofrecer «elegir otro».
   */
  candidatos: Candidato[]
}

/**
 * Por debajo de esto no se propone nada. Es el mismo umbral que usa el fuzzy de
 * nombres del agente de voz (`lib/pseudonimizacion.ts`), que resuelve el mismo
 * problema —un nombre escrito a medias— sobre los mismos datos.
 */
const UMBRAL = 0.55

/**
 * Cuánto tiene que despegarse el primero del segundo para que no sea un empate.
 * Con menos, los dos van a la propuesta como ambigua: dos hermanos con el mismo
 * apellido y nombres parecidos no se distinguen por una centésima.
 */
const MARGEN = 0.1

/** Lo que se compara: nombre y apellidos normalizados, en un solo texto. */
export function claveNombre(alumno: Pick<Alumno, 'nombre' | 'apellidos'>): string {
  return normalizarTexto(`${alumno.nombre} ${alumno.apellidos}`)
}

/**
 * Empareja los alumnos de dos grupos. El orden de salida es el de `grupoA`.
 *
 * Las fichas inactivas se filtran fuera antes de llamar aquí, en la vista: dar
 * de baja en un área no da de baja en la otra, y una baja no debería aparecer
 * como pareja de nadie.
 */
export function emparejar(grupoA: Alumno[], grupoB: Alumno[]): Propuesta[] {
  const clavesA = new Map<string, number>()
  for (const a of grupoA) clavesA.set(claveNombre(a), (clavesA.get(claveNombre(a)) ?? 0) + 1)

  const porClaveB = new Map<string, Alumno[]>()
  for (const b of grupoB) {
    const clave = claveNombre(b)
    porClaveB.set(clave, [...(porClaveB.get(clave) ?? []), b])
  }

  const fuse = new Fuse(
    grupoB.map((alumno) => ({ alumno, clave: claveNombre(alumno) })),
    { keys: ['clave'], threshold: 0.4, ignoreLocation: true, includeScore: true },
  )

  const propuestas: Propuesta[] = grupoA.map((a) => proponer(a, clavesA, porClaveB, fuse))

  // Una misma ficha de B no puede ser la pareja de dos de A. Si dos la
  // reclaman, las dos pasan a ambiguas: el sistema no elige cuál se la queda.
  const reclamadas = new Map<string, number>()
  for (const p of propuestas)
    if (p.b && p.estado !== 'ya-vinculada')
      reclamadas.set(p.b.id, (reclamadas.get(p.b.id) ?? 0) + 1)

  return propuestas.map((p) =>
    p.b && p.estado !== 'ya-vinculada' && (reclamadas.get(p.b.id) ?? 0) > 1
      ? { ...p, estado: 'ambigua', b: undefined }
      : p,
  )
}

function proponer(
  a: Alumno,
  clavesA: Map<string, number>,
  porClaveB: Map<string, Alumno[]>,
  fuse: Fuse<{ alumno: Alumno; clave: string }>,
): Propuesta {
  const clave = claveNombre(a)

  // Ya vinculadas: se enseñan, pero no hay nada que confirmar.
  const yaVinculada = a.personaId
    ? [...porClaveB.values()].flat().find((b) => b.personaId === a.personaId)
    : undefined
  if (yaVinculada) return { a, estado: 'ya-vinculada', b: yaVinculada, candidatos: [] }

  const mismos = porClaveB.get(clave) ?? []

  // Homónimos: a un lado o al otro da igual, no se puede saber quién es quién.
  if (mismos.length > 1 || (mismos.length === 1 && (clavesA.get(clave) ?? 0) > 1))
    return {
      a,
      estado: 'ambigua',
      candidatos: mismos.map((alumno) => ({ alumno, puntuacion: 1 })),
    }

  if (mismos.length === 1) return { a, estado: 'exacta', b: mismos[0], candidatos: [] }

  const candidatos = fuse
    .search(clave)
    .map((r) => ({ alumno: r.item.alumno, puntuacion: 1 - (r.score ?? 1) }))
    .filter((c) => c.puntuacion >= UMBRAL)
    .sort((x, y) => y.puntuacion - x.puntuacion)

  if (candidatos.length === 0) return { a, estado: 'sin-pareja', candidatos: [] }

  const empatan = candidatos.length > 1 && candidatos[0].puntuacion - candidatos[1].puntuacion < MARGEN
  if (empatan) return { a, estado: 'ambigua', candidatos }

  return { a, estado: 'probable', b: candidatos[0].alumno, candidatos }
}

/** Resumen para la cabecera del asistente, sin recorrer la lista en la vista. */
export function resumir(propuestas: Propuesta[]): Record<EstadoPropuesta, number> {
  const conteo: Record<EstadoPropuesta, number> = {
    exacta: 0,
    probable: 0,
    ambigua: 0,
    'sin-pareja': 0,
    'ya-vinculada': 0,
  }
  for (const p of propuestas) conteo[p.estado]++
  return conteo
}
