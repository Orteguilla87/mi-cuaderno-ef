import { db, nuevoId } from './db'
import { COLOR_POR_DEFECTO, PALETA } from '../lib/paleta'
import { escribirCompartido } from './personas'
import type { Alumno, EtiquetaAlumno } from './types'

/**
 * Etiquetas de alumnado (TDAH, ACNEE, Compensatoria, lesionado…).
 *
 * ——— REGLA DURA, y no es una recomendación ———
 *
 * Son datos de categoría especial: salud y necesidades educativas. Heredan
 * enteras las dos protecciones de `Alumno.apoyos`:
 *
 *  1. NUNCA salen del dispositivo salvo dentro del blob cifrado del backup y
 *     de la sincronización. Ni a PDF, ni a XLSX, ni a CSV, ni al portapapeles,
 *     aunque la exportación salga del propio Cuaderno. Ni al agente de voz, ni
 *     siquiera pseudonimizadas.
 *  2. Solo se pintan en las vistas de gestión del maestro —«Cuaderno», la
 *     ficha del grupo, el pase de lista y la ficha del alumno—, que se miran de
 *     cerca en el móvil y nunca se proyectan. NO aparecen en el generador de
 *     equipos, ni en el sorteo de alumno, ni en el marcador, ni en la pizarra,
 *     ni en ninguna otra vista a pantalla completa: un punto de color junto a
 *     un nombre señala a ese alumno delante de sus compañeros. Tampoco en el
 *     calendario, el planificador ni Hoy. Y en las que sí, tras el interruptor
 *     GLOBAL de `store/etiquetasVisibles.ts`.
 *
 * Las dos las vigila `lib/etiquetasAlumno.test.ts`, que revisa la fuente de
 * todas las vistas y de todas las rutas de exportación.
 */

export async function etiquetas(): Promise<EtiquetaAlumno[]> {
  const lista = await db.etiquetasAlumno.toArray()
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function crearEtiqueta(datos: {
  nombre: string
  abreviatura: string
  colorId: string
  icono?: string
  temporal?: boolean
}): Promise<EtiquetaAlumno> {
  const etiqueta: EtiquetaAlumno = {
    id: nuevoId(),
    nombre: datos.nombre.trim(),
    abreviatura: datos.abreviatura.trim().slice(0, 3),
    colorId: datos.colorId,
    // Ausencia real: sin icono no hay campo, y `temporal: false` no se escribe
    // porque no dice nada que la ausencia no diga ya.
    ...(datos.icono ? { icono: datos.icono } : {}),
    ...(datos.temporal ? { temporal: true } : {}),
    creadoEn: Date.now(),
  }
  await db.etiquetasAlumno.add(etiqueta)
  return etiqueta
}

export async function editarEtiqueta(
  id: string,
  cambios: Partial<Pick<EtiquetaAlumno, 'nombre' | 'abreviatura' | 'colorId' | 'icono' | 'temporal'>>,
): Promise<void> {
  const limpios = { ...cambios }
  if (limpios.nombre !== undefined) limpios.nombre = limpios.nombre.trim()
  if (limpios.abreviatura !== undefined) limpios.abreviatura = limpios.abreviatura.trim().slice(0, 3)
  // Quitar el icono o dejar de ser temporal borra el campo, no guarda un vacío.
  if (limpios.icono === '') limpios.icono = undefined
  if (limpios.temporal === false) limpios.temporal = undefined
  await db.etiquetasAlumno.update(id, limpios)
}

/** A cuánto alumnado está puesta. Se enseña antes de borrarla. */
export async function alumnosConEtiqueta(etiquetaId: string): Promise<Alumno[]> {
  return db.alumnos.where('etiquetas').equals(etiquetaId).toArray()
}

/**
 * Borra la etiqueta y la quita de todo el alumnado que la llevara. Devuelve el
 * deshacer, como el resto de escrituras de la app: sin él, un toque de más
 * costaría rehacer las asignaciones a mano.
 */
export async function borrarEtiqueta(etiquetaId: string): Promise<() => Promise<void>> {
  const etiqueta = await db.etiquetasAlumno.get(etiquetaId)
  const afectados = (await alumnosConEtiqueta(etiquetaId)).map((a) => a.id)

  await db.transaction('rw', [db.etiquetasAlumno, db.alumnos], async () => {
    for (const id of afectados) {
      const alumno = await db.alumnos.get(id)
      if (!alumno?.etiquetas) continue
      const quedan = alumno.etiquetas.filter((e) => e !== etiquetaId)
      // Sin etiquetas, el campo desaparece: no se deja un array vacío, que
      // significaría «tiene lista, vacía» en vez de «no tiene». Su caducidad se
      // va con ella: dejarla huérfana en el mapa sería basura invisible.
      await db.alumnos.update(id, {
        etiquetas: quedan.length > 0 ? quedan : undefined,
        etiquetasHasta: siguienteCaducidad(alumno.etiquetasHasta, etiquetaId, undefined),
      })
    }
    await db.etiquetasAlumno.delete(etiquetaId)
  })

  return async () => {
    await db.transaction('rw', [db.etiquetasAlumno, db.alumnos], async () => {
      if (etiqueta) await db.etiquetasAlumno.put(etiqueta)
      for (const id of afectados) await asignar(id, etiquetaId, true)
    })
  }
}

/**
 * La etiqueta «Lesionado» de la semilla. Id FIJO, no `nuevoId()`, por lo mismo
 * que los criterios oficiales y las etiquetas de material: React monta el
 * efecto de arranque dos veces en desarrollo y las dos leen la tabla vacía
 * antes de que ninguna escriba, así que se planta con `put` sobre una clave
 * conocida y repetirlo no duplica nada.
 */
export const ETIQUETA_LESIONADO = 'etq-alu-lesionado'

/**
 * Una sola etiqueta preconfigurada: «Lesionado».
 *
 * Es la que más falta hace y la única cuyo sentido no depende del centro: saber
 * de un vistazo quién no hace la sesión, antes de montarla. Viene con la cruz y
 * marcada como TEMPORAL, que es lo que la distingue de ACNEE o TDAH — una
 * lesión se cura.
 *
 * Solo siembra con la tabla VACÍA. Con la condición puesta sobre la propia
 * etiqueta volvería a plantarla cada vez que el usuario la borrase a
 * conciencia, y la repondría en una copia restaurada que deliberadamente no la
 * tenía.
 */
export async function sembrarEtiquetas(ahora = Date.now()): Promise<void> {
  if ((await db.etiquetasAlumno.count()) > 0) return
  await db.etiquetasAlumno.put({
    id: ETIQUETA_LESIONADO,
    nombre: 'Lesionado',
    abreviatura: 'LES',
    colorId: COLOR_LESIONADO,
    icono: 'cruz',
    temporal: true,
    creadoEn: ahora,
  })
}

/**
 * El carmín de la paleta de datos, que es el acento de la app para lo negativo
 * (§3.1). Se comprueba contra `PALETA` en vez de escribirlo a pelo: si algún
 * día se reordena la paleta y el id desaparece, la semilla cae en el color por
 * defecto en vez de guardar un identificador que no existe.
 */
const COLOR_LESIONADO = PALETA.find((c) => c.id === 'carmin-500')?.id ?? COLOR_POR_DEFECTO

/**
 * Pone o quita una etiqueta a un alumno. Idempotente en las dos direcciones.
 *
 * Va por `escribirCompartido` y no por `db.alumnos.update`: la etiqueta es del
 * NIÑO, no de la asignatura, así que si su ficha está vinculada con la de otro
 * grupo la etiqueta aparece —o desaparece— en las dos (`db/personas.ts`). Sin
 * vincular, `escribirCompartido` escribe exactamente en una ficha y esto se
 * comporta igual que antes.
 */
export async function asignar(
  alumnoId: string,
  etiquetaId: string,
  puesta: boolean,
  /**
   * Cuándo caduca, en milisegundos. Solo tiene sentido al PONER, y solo en las
   * etiquetas temporales. `undefined` = indefinida, que es lo normal.
   */
  hasta?: number,
): Promise<void> {
  const alumno = await db.alumnos.get(alumnoId)
  if (!alumno) return
  const actuales = alumno.etiquetas ?? []
  const yaEsta = actuales.includes(etiquetaId)
  if (puesta === yaEsta && (!puesta || hasta === undefined)) return
  const siguientes = puesta ? [...new Set([...actuales, etiquetaId])] : actuales.filter((e) => e !== etiquetaId)
  // Sin etiquetas, el campo desaparece: no se deja un array vacío, que
  // significaría «tiene lista, vacía» en vez de «no tiene».
  await escribirCompartido(alumnoId, {
    etiquetas: siguientes.length > 0 ? siguientes : undefined,
    etiquetasHasta: siguienteCaducidad(alumno.etiquetasHasta, etiquetaId, puesta ? hasta : undefined),
  })
}

/**
 * Fija o prolonga la caducidad de una etiqueta ya puesta, sin tocar nada más.
 * Con `hasta` a `undefined` la vuelve indefinida.
 */
export async function fijarCaducidad(
  alumnoId: string,
  etiquetaId: string,
  hasta: number | undefined,
): Promise<void> {
  const alumno = await db.alumnos.get(alumnoId)
  if (!alumno) return
  await escribirCompartido(alumnoId, {
    etiquetasHasta: siguienteCaducidad(alumno.etiquetasHasta, etiquetaId, hasta),
  })
}

/**
 * El mapa de caducidades resultante. Devuelve `undefined` —campo ausente— si se
 * queda vacío: un `{}` significaría «tiene mapa, vacío» y no es lo mismo que
 * «ninguna de sus etiquetas caduca».
 */
function siguienteCaducidad(
  actual: Record<string, number> | undefined,
  etiquetaId: string,
  hasta: number | undefined,
): Record<string, number> | undefined {
  const siguiente = { ...(actual ?? {}) }
  if (hasta === undefined) delete siguiente[etiquetaId]
  else siguiente[etiquetaId] = hasta
  return Object.keys(siguiente).length > 0 ? siguiente : undefined
}

/**
 * Una etiqueta puesta, con su caducidad resuelta.
 *
 * `caducada` se calcula al leer y no se guarda: guardarlo obligaría a repasar
 * la base cada mañana, y basta con comparar contra hoy en el momento de pintar.
 */
export interface EtiquetaPuesta {
  etiqueta: EtiquetaAlumno
  /** Milisegundos, o ausente si la asignación es indefinida. */
  hasta?: number
  caducada: boolean
}

/** Las etiquetas de un alumno, resueltas y en el orden del catálogo. */
export function etiquetasDe(alumno: Alumno, catalogo: EtiquetaAlumno[]): EtiquetaAlumno[] {
  if (!alumno.etiquetas || alumno.etiquetas.length === 0) return []
  const puestas = new Set(alumno.etiquetas)
  return catalogo.filter((e) => puestas.has(e.id))
}

/**
 * Lo mismo, pero con la caducidad de cada asignación resuelta contra `ahora`.
 *
 * Una caducada SIGUE EN LA LISTA: se pinta atenuada y marcada, y se retira o se
 * prolonga de un toque desde la ficha. Nunca desaparece sola — es un dato que
 * puso el usuario, y quitarlo por su cuenta sería borrar información que él no
 * ha decidido borrar.
 */
export function etiquetasPuestasDe(
  alumno: Alumno,
  catalogo: EtiquetaAlumno[],
  ahora = Date.now(),
): EtiquetaPuesta[] {
  return etiquetasDe(alumno, catalogo).map((etiqueta) => {
    const hasta = alumno.etiquetasHasta?.[etiqueta.id]
    return { etiqueta, ...(hasta !== undefined ? { hasta } : {}), caducada: hasta !== undefined && hasta < ahora }
  })
}

/** Si el alumno lleva puesta esa etiqueta, caducada o no. */
export function tieneEtiqueta(alumno: Alumno, etiquetaId: string): boolean {
  return !!alumno.etiquetas?.includes(etiquetaId)
}
