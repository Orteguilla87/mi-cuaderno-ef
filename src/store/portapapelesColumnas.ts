import { create } from 'zustand'
import type { Columna, Etapa } from '../db/types'

/**
 * Portapapeles de columnas del Cuaderno (Bloque 3): «copiar» guarda aquí la
 * estructura elegida (una columna suelta o todas las de un grupo/trimestre);
 * «pegar», en cualquier grupo/trimestre compatible, la vuelca como columnas
 * nuevas. Solo estructura — NUNCA calificaciones — y solo en memoria: no tiene
 * sentido persistirlo entre arranques de la app.
 */
export interface ColumnasCopiadas {
  columnas: Columna[]
  etapaOrigen: Etapa
  /** Para mostrar «Copiado: N columnas de <grupo>» mientras el portapapeles esté lleno. */
  origenResumen: string
}

interface EstadoPortapapelesColumnas {
  copiadas: ColumnasCopiadas | null
  copiar: (c: ColumnasCopiadas) => void
  limpiar: () => void
}

export const usePortapapelesColumnas = create<EstadoPortapapelesColumnas>((set) => ({
  copiadas: null,
  copiar: (c) => set({ copiadas: c }),
  limpiar: () => set({ copiadas: null }),
}))
