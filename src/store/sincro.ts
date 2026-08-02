import { create } from 'zustand'

/**
 * Estado visible de la sincronización. Solo para pintar: la verdad la tienen
 * `lib/sincroEstado.ts` (lo que este dispositivo sabe) y el propio servidor.
 */
export type EstadoUI =
  /** Sin identificador configurado: la sincronización no existe para esta app. */
  | 'apagado'
  | 'sincronizado'
  | 'sincronizando'
  /** Los dos lados avanzaron. Parado a la espera de que el usuario elija. */
  | 'conflicto'
  | 'sin_conexion'
  /** Fallo que no es de red: reglas sin publicar, copia corrupta… */
  | 'error'

interface Store {
  estado: EstadoUI
  /** Texto del último error, para poder enseñar la causa real y no un «falló». */
  detalle?: string
  /** ISO 8601 de la última sincronización con éxito, para mostrarla en Ajustes. */
  ultimaSincro?: string
  poner: (estado: EstadoUI, detalle?: string) => void
}

export const useSincro = create<Store>((set) => ({
  estado: 'apagado',
  poner: (estado, detalle) => set({ estado, detalle }),
}))
