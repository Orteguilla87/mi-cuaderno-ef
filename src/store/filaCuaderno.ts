import { create } from 'zustand'
import { useGrupoActivo } from './grupoActivo'
import { navegar, rutaActual, segmentos } from '../lib/router'

/**
 * «Ver alumno» desde el sorteo: pedir al Cuaderno que SITÚE y RESALTE la fila
 * de un alumno. Solo eso: ni cambia la columna activa ni abre ninguna celda;
 * qué hacer desde ahí lo decide el maestro.
 *
 * Vive fuera del Cuaderno para que la petición sobreviva a la navegación: desde
 * Herramientas se pide, se navega, y el Cuaderno la atiende al montar y tener
 * cargadas las filas. Con el Cuaderno ya abierto en ese grupo se atiende sin
 * navegar ni recargar nada. No se persiste: es una petición de un momento.
 */

/** Lo que dura el resaltado de la fila antes de desvanecerse solo. */
export const DURACION_RESALTADO_MS = 3000

/**
 * Pasado esto, una petición sin atender se descarta: si el Cuaderno no llegó a
 * pintar la fila (grupo sin columnas, por ejemplo), no puede saltar minutos
 * después cuando el maestro ya está a otra cosa.
 */
export const CADUCIDAD_PETICION_MS = 10_000

interface EstadoFilaCuaderno {
  /** Alumno cuya fila hay que situar; `null` si no hay nada pendiente. */
  pendiente: string | null
  pedidaEn: number
  pedir: (alumnoId: string, ahora?: number) => void
  /** El Cuaderno la ha atendido (o descartado). */
  atendida: () => void
}

export const useFilaCuaderno = create<EstadoFilaCuaderno>()((set) => ({
  pendiente: null,
  pedidaEn: 0,
  pedir: (alumnoId, ahora = Date.now()) => set({ pendiente: alumnoId, pedidaEn: ahora }),
  atendida: () => set({ pendiente: null }),
}))

/**
 * Qué hace la rejilla con la petición pendiente:
 *  - 'esperar': la fila aún no está entre las pintadas (cargando).
 *  - 'descartar': caducada.
 *  - 'situar': desplazar hasta ella y resaltarla.
 */
export function decidirPeticion(
  pendiente: string | null,
  pedidaEn: number,
  alumnosPintados: string[],
  ahora = Date.now(),
): 'nada' | 'esperar' | 'descartar' | 'situar' {
  if (!pendiente) return 'nada'
  if (ahora - pedidaEn > CADUCIDAD_PETICION_MS) return 'descartar'
  return alumnosPintados.includes(pendiente) ? 'situar' : 'esperar'
}

/**
 * Resalta y programa el apagado. Devuelve la cancelación (para el cleanup del
 * efecto). El resaltado nunca se queda puesto: siempre hay un apagado en cola.
 */
export function resaltarDurante(
  alumnoId: string,
  fijar: (id: string | null) => void,
  programar: (fn: () => void, ms: number) => number = (fn, ms) => window.setTimeout(fn, ms),
  cancelar: (id: number) => void = (id) => window.clearTimeout(id),
): () => void {
  fijar(alumnoId)
  const t = programar(() => fijar(null), DURACION_RESALTADO_MS)
  return () => cancelar(t)
}

/**
 * A dónde hay que ir para ver la fila, o `null` si el Cuaderno ya está abierto
 * en ese grupo (entonces basta con desplazar y resaltar, sin recargar).
 *
 * El Cuaderno sin grupo en la ruta (`/cuaderno`) muestra el grupo activo.
 */
export function rutaParaVerAlumno(ruta: string, grupoActivo: string | null, grupoId: string): string | null {
  const [seccion, param] = segmentos(ruta)
  if (seccion === 'cuaderno' && (param ?? grupoActivo) === grupoId) return null
  return `/cuaderno/${grupoId}`
}

/**
 * Pide la fila y, si hace falta, navega. `navegar` APILA la entrada: «Atrás»
 * desde el Cuaderno devuelve a donde estaba el maestro (Herramientas, Hoy…),
 * no a una pantalla fija.
 */
export function verAlumnoEnCuaderno(grupoId: string, alumnoId: string): void {
  useFilaCuaderno.getState().pedir(alumnoId)
  const destino = rutaParaVerAlumno(rutaActual(), useGrupoActivo.getState().grupoId, grupoId)
  if (destino) navegar(destino)
}
