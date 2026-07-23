import { create } from 'zustand'
import type { JuegoEnSesion, Recurso } from '../db/types'

/**
 * Portapapeles de una sesión (§ petición del usuario): «copiar» guarda el
 * contenido aquí; «pegar», en cualquier grupo, lo vuelca sobre la sesión que
 * el usuario elija. Vive solo en memoria: no tiene sentido persistirlo entre
 * arranques de la app.
 */
export interface SesionCopiada {
  titulo: string
  udId?: string
  juegos: JuegoEnSesion[]
  notas: string
  recursos: Recurso[]
  recursosNecesarios?: string
  comentarios?: string
  /** Para mostrar «Copiado: <título> · <grupo>» mientras el portapapeles esté lleno. */
  origenResumen: string
}

interface EstadoPortapapeles {
  sesionCopiada: SesionCopiada | null
  copiar: (s: SesionCopiada) => void
  limpiar: () => void
}

export const usePortapapeles = create<EstadoPortapapeles>((set) => ({
  sesionCopiada: null,
  copiar: (s) => set({ sesionCopiada: s }),
  limpiar: () => set({ sesionCopiada: null }),
}))
