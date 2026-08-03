import { create } from 'zustand'

export interface Aviso {
  id: number
  texto: string
  /** Si existe, el snackbar muestra «Deshacer». */
  deshacer?: () => void | Promise<void>
}

interface EstadoUI {
  /** Cola de uno: nunca hay dos avisos a la vez (§7, capa fija). */
  aviso: Aviso | null
  mostrarAviso: (texto: string, deshacer?: () => void | Promise<void>) => void
  cerrarAviso: (id: number) => void
  /**
   * Cuántas hojas/pantallas completas hay abiertas a la vez (Hoja, Pizarra,
   * BloqueoPin). El FAB de voz cede el sitio y se oculta mientras el contador
   * sea mayor que 0: es un contador, no un booleano, porque una hoja puede
   * abrir otra encima (p. ej. el editor de una celda desde dentro de otra
   * hoja) y solo debe reaparecer cuando se cierra la última.
   */
  capasAbiertas: number
  abrirCapa: () => void
  cerrarCapa: () => void
  /**
   * Fallo al sembrar los criterios oficiales. No es un aviso pasajero: los
   * criterios son la referencia legal de toda la evaluación, así que si la
   * semilla no cuadra hay que verlo hasta arreglarlo, no durante 1,8 segundos.
   */
  errorSemilla: string | null
  fijarErrorSemilla: (mensaje: string | null) => void
}

let siguienteId = 1

/**
 * Temporizador del aviso visible. Vive fuera del store porque solo puede haber
 * uno: al llegar un aviso nuevo hay que CANCELAR el anterior, o su timeout
 * cerraría el nuevo antes de tiempo.
 */
let temporizador: number | null = null

/** Lo justo para leerlo. Con Deshacer, lo justo para llegar a pulsarlo. */
const MS_SIMPLE = 1800
const MS_DESHACER = 4000

function cancelarTemporizador() {
  if (temporizador !== null) window.clearTimeout(temporizador)
  temporizador = null
}

export const useUI = create<EstadoUI>((set) => ({
  aviso: null,
  mostrarAviso: (texto, deshacer) => {
    const id = siguienteId++
    // El aviso nuevo descarta al anterior en vez de apilarse: evaluando a 25
    // alumnos se toca muy deprisa, y una pila de avisos acaba tapando la
    // pantalla justo cuando más se necesita verla.
    cancelarTemporizador()
    set({ aviso: { id, texto, deshacer } })
    temporizador = window.setTimeout(
      () => {
        temporizador = null
        set((s) => (s.aviso?.id === id ? { aviso: null } : {}))
      },
      deshacer ? MS_DESHACER : MS_SIMPLE,
    )
  },
  cerrarAviso: (id) => {
    cancelarTemporizador()
    set((s) => (s.aviso?.id === id ? { aviso: null } : {}))
  },
  capasAbiertas: 0,
  abrirCapa: () => set((s) => ({ capasAbiertas: s.capasAbiertas + 1 })),
  cerrarCapa: () => set((s) => ({ capasAbiertas: Math.max(0, s.capasAbiertas - 1) })),
  errorSemilla: null,
  fijarErrorSemilla: (errorSemilla) => set({ errorSemilla }),
}))
