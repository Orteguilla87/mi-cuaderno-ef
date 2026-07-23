import { create } from 'zustand'

export interface Aviso {
  id: number
  texto: string
  /** Si existe, el snackbar muestra «Deshacer». */
  deshacer?: () => void | Promise<void>
}

interface EstadoUI {
  avisos: Aviso[]
  mostrarAviso: (texto: string, deshacer?: () => void | Promise<void>) => void
  cerrarAviso: (id: number) => void
}

let siguienteId = 1

export const useUI = create<EstadoUI>((set) => ({
  avisos: [],
  mostrarAviso: (texto, deshacer) => {
    const id = siguienteId++
    // Como mucho 2 a la vez: tocar deprisa (p. ej. evaluando toda una clase)
    // no debe apilar avisos hasta tapar la pantalla. Los que no traen
    // deshacer son solo confirmación, así que se van antes.
    set((s) => ({ avisos: [...s.avisos, { id, texto, deshacer }].slice(-2) }))
    window.setTimeout(
      () => set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) })),
      deshacer ? 6000 : 2000,
    )
  },
  cerrarAviso: (id) => set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) })),
}))
