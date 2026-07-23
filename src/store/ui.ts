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
   * El FAB de voz cede el sitio: las pantallas donde estorba (rejilla del
   * cuaderno, pase de lista) lo ponen en compacto mientras están montadas.
   */
  fabCompacto: boolean
  setFabCompacto: (v: boolean) => void
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
  fabCompacto: false,
  setFabCompacto: (v) => set({ fabCompacto: v }),
}))
