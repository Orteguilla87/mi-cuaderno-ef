import { create } from 'zustand'
import { aISO } from '../lib/fechas'

/**
 * Fecha que se está consultando en «Hoy» y en Pasar lista (§ Bloque 3):
 * compartida entre ambos para que ir a un grupo o a pasar lista y volver con
 * «Atrás» mantenga la fecha elegida, en vez de volver a hoy.
 *
 * Sin `persist` a propósito: solo debe sobrevivir a navegar dentro de la
 * app, no a cerrarla — reabrir mañana con la fecha de ayer sería peor que
 * el problema que resuelve.
 */
interface EstadoFechaActiva {
  fecha: string
  fijarFecha: (fecha: string) => void
}

export const useFechaActiva = create<EstadoFechaActiva>()((set) => ({
  fecha: aISO(),
  fijarFecha: (fecha) => set({ fecha }),
}))
