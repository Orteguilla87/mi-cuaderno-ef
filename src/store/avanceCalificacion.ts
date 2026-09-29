import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModoAvanceRubrica } from '../lib/avanceCalificacion'

/**
 * Avance automático al calificar (`lib/avanceCalificacion.ts`).
 *
 * Preferencia DE DISPOSITIVO, fuera de la sincronización, como
 * `etiquetasVisibles`: se apaga para corregir una celda suelta en este aparato,
 * y eso no es algo que deba viajar al otro dentro de la copia.
 *
 * `activo` vale para todas las columnas; `modoRubrica` solo para las rúbricas.
 */
interface EstadoAvance {
  activo: boolean
  modoRubrica: ModoAvanceRubrica
  fijarActivo: (activo: boolean) => void
  fijarModoRubrica: (modo: ModoAvanceRubrica) => void
}

export const useAvanceCalificacion = create<EstadoAvance>()(
  persist(
    (set) => ({
      activo: true,
      modoRubrica: 'alumno',
      fijarActivo: (activo) => set({ activo }),
      fijarModoRubrica: (modoRubrica) => set({ modoRubrica }),
    }),
    { name: 'cuaderno-ef:avance-calificacion' },
  ),
)
