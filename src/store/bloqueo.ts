import { create } from 'zustand'

/**
 * Estado del bloqueo por PIN (§1.7, M9). Separado de `useUI` porque nada más
 * necesita saber si la app está bloqueada, y así `App.tsx` puede decidir si
 * pintar `<BloqueoPin>` sin acoplar el resto de la interfaz a esto.
 */
interface EstadoBloqueo {
  bloqueado: boolean
  bloquear: () => void
  desbloquear: () => void
}

export const useBloqueo = create<EstadoBloqueo>((set) => ({
  bloqueado: false,
  bloquear: () => set({ bloqueado: true }),
  desbloquear: () => set({ bloqueado: false }),
}))
