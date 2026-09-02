import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Si las vistas de gestión —el Cuaderno y la ficha del grupo— pintan los puntos
 * de etiqueta de alumnado.
 *
 * Es UNO para las dos: lo que se decide aquí es «alguien puede acercarse a esta
 * pantalla», y eso no cambia según en qué vista se esté.
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
