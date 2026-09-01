import { db, nuevoId } from './db'
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
 *  2. Solo se pintan en la vista «Cuaderno», que nunca se enseña al alumnado ni
 *     se proyecta. No aparecen en el pase de lista, ni en las herramientas de
 *     aula, ni en el calendario, ni en el planificador, ni en Hoy.
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
}): Promise<EtiquetaAlumno> {
  const etiqueta: EtiquetaAlumno = {
    id: nuevoId(),
    nombre: datos.nombre.trim(),
    abreviatura: datos.abreviatura.trim().slice(0, 3),
    colorId: datos.colorId,
    creadoEn: Date.now(),
  }
  await db.etiquetasAlumno.add(etiqueta)
  return etiqueta
}

export async function editarEtiqueta(
  id: string,
  cambios: Partial<Pick<EtiquetaAlumno, 'nombre' | 'abreviatura' | 'colorId'>>,
): Promise<void> {
  const limpios = { ...cambios }
  if (limpios.nombre !== undefined) limpios.nombre = limpios.nombre.trim()
  if (limpios.abreviatura !== undefined) limpios.abreviatura = limpios.abreviatura.trim().slice(0, 3)
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
      // significaría «tiene lista, vacía» en vez de «no tiene».
      await db.alumnos.update(id, quedan.length > 0 ? { etiquetas: quedan } : { etiquetas: undefined })
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

/** Pone o quita una etiqueta a un alumno. Idempotente en las dos direcciones. */
export async function asignar(alumnoId: string, etiquetaId: string, puesta: boolean): Promise<void> {
  const alumno = await db.alumnos.get(alumnoId)
  if (!alumno) return
  const actuales = alumno.etiquetas ?? []
  const yaEsta = actuales.includes(etiquetaId)
  if (puesta === yaEsta) return
  const siguientes = puesta ? [...actuales, etiquetaId] : actuales.filter((e) => e !== etiquetaId)
  await db.alumnos.update(alumnoId, {
    etiquetas: siguientes.length > 0 ? siguientes : undefined,
  })
}

/** Las etiquetas de un alumno, resueltas y en el orden del catálogo. */
export function etiquetasDe(alumno: Alumno, catalogo: EtiquetaAlumno[]): EtiquetaAlumno[] {
  if (!alumno.etiquetas || alumno.etiquetas.length === 0) return []
  const puestas = new Set(alumno.etiquetas)
  return catalogo.filter((e) => puestas.has(e.id))
}
