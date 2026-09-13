import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LotePlan } from '../db/lotes'

/**
 * Cuántas operaciones sobre la planificación se pueden deshacer hacia atrás.
 * Diez cubre de sobra «me he equivocado hace un rato» —un volcado y un par de
 * eliminaciones— sin convertir `localStorage` en un segundo almacén de sesiones.
 */
export const MAX_LOTES = 10

interface EstadoLotes {
  /** Del más reciente al más antiguo. */
  lotes: LotePlan[]
  registrar: (lote: LotePlan) => void
  quitar: (id: string) => void
}

/**
 * Historial de lotes de la planificación (`db/lotes.ts`). Persistido en
 * `localStorage` para que Deshacer siga ahí un rato después, también tras
 * recargar la app. Se consulta desde la cabecera de cada grupo del Planificador.
 */
export const useLotesPlan = create<EstadoLotes>()(
  persist(
    (set) => ({
      lotes: [],
      registrar: (lote) => set((s) => ({ lotes: [lote, ...s.lotes].slice(0, MAX_LOTES) })),
      quitar: (id) => set((s) => ({ lotes: s.lotes.filter((l) => l.id !== id) })),
    }),
    { name: 'cuaderno-ef:lotes-plan' },
  ),
)
