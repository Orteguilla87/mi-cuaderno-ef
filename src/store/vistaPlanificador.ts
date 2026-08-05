import { create } from 'zustand'
import { semanaActual } from '../db/planificador'

/**
 * Pestaña y semana que se están viendo en el Planificador. Vive fuera del
 * componente por lo mismo que `useFechaActiva`: entrar a editar una sesión
 * desmonta el Planificador, así que con estado local «Atrás» te devolvía
 * siempre a la pestaña Grupo y a la semana en curso, perdiendo el sitio
 * desde el que habías entrado.
 *
 * Sin `persist` a propósito: debe sobrevivir a navegar dentro de la app, no a
 * cerrarla — reabrir mañana en la semana de la última sesión editada sería
 * peor que el problema que resuelve.
 */
export type VistaPlanificador = 'grupo' | 'semana' | 'unidades'

interface EstadoVistaPlanificador {
  vista: VistaPlanificador
  lunes: string
  fijarVista: (vista: VistaPlanificador) => void
  fijarLunes: (lunes: string) => void
}

export const useVistaPlanificador = create<EstadoVistaPlanificador>()((set) => ({
  // Se entra por grupo: lo habitual es programar el curso de un grupo entero,
  // y solo después bajar a la semana a retocar un día concreto.
  vista: 'grupo',
  lunes: semanaActual(),
  fijarVista: (vista) => set({ vista }),
  fijarLunes: (lunes) => set({ lunes }),
}))
