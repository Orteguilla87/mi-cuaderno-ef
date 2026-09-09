import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Si las vistas de gestión del maestro —el Cuaderno, la ficha del grupo, el
 * pase de lista y la ficha del alumno— pintan las etiquetas de alumnado.
 *
 * Es UNO para todas, y GLOBAL: lo que se decide aquí es «alguien puede
 * acercarse a esta pantalla», y eso no cambia según en qué vista se esté.
 * Apagarlo desde cualquiera de ellas lo apaga en todas.
 *
 * No amplía dónde se pintan: las vistas proyectables —generador de equipos,
 * sorteo de alumno, marcador, pizarra— no lo consultan siquiera, porque no
 * mencionan las etiquetas en absoluto (`lib/etiquetasAlumno.test.ts`).
 *
 * Preferencia DE DISPOSITIVO, y a propósito fuera de la sincronización: vive en
 * `localStorage` y no en `Config`, por el mismo motivo que documenta
 * `lib/sincroEstado.ts`. Lo que se guarda aquí es «alguien puede acercarse a
 * esta pantalla», que es una circunstancia de este aparato y de este momento,
 * no una decisión que deba viajar al otro dispositivo dentro de la copia.
 *
 * No guarda ningún dato de alumnado: solo un booleano.
 */
interface EstadoEtiquetasVisibles {
  visibles: boolean
  alternar: () => void
}

export const useEtiquetasVisibles = create<EstadoEtiquetasVisibles>()(
  persist(
    (set) => ({
      visibles: true,
      alternar: () => set((s) => ({ visibles: !s.visibles })),
    }),
    { name: 'cuaderno-ef:etiquetas-visibles' },
  ),
)
