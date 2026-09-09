import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Avisos que se dan UNA vez y luego estorban.
 *
 * Hoy solo hay uno: la primera vez que se pone o se quita una etiqueta en una
 * ficha vinculada, hay que decir que el cambio afecta a todas las fichas de esa
 * persona. Quien no lo sepa creerá estar tocando solo su área.
 *
 * Preferencia DE DISPOSITIVO, fuera de la sincronización, como
 * `store/etiquetasVisibles.ts`: lo que se guarda es «a este maestro ya se le ha
 * explicado en este aparato», no un dato del cuaderno. Que el otro dispositivo
 * lo vuelva a enseñar una vez no rompe nada; meterlo en la copia cifrada por
 * esto, sí ensuciaría el modelo.
 *
 * No guarda ningún dato de alumnado: solo banderas.
 */
export type Aviso = 'etiquetas-compartidas'

interface EstadoAvisosVistos {
  vistos: Aviso[]
  /** `true` la primera vez y `false` a partir de entonces. */
  pendiente: (aviso: Aviso) => boolean
  marcarVisto: (aviso: Aviso) => void
}

export const useAvisosVistos = create<EstadoAvisosVistos>()(
  persist(
    (set, get) => ({
      vistos: [],
      pendiente: (aviso) => !get().vistos.includes(aviso),
      marcarVisto: (aviso) =>
        set((s) => (s.vistos.includes(aviso) ? s : { vistos: [...s.vistos, aviso] })),
    }),
    {
      name: 'cuaderno-ef:avisos-vistos',
      partialize: (s) => ({ vistos: s.vistos }),
    },
  ),
)
