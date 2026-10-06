/**
 * Gesto para abrir la nota de una celda del Cuaderno (`NotaCelda`).
 *
 *  - Dedo o lápiz: pulsación larga. Se anula si el dedo se mueve —la rejilla se
 *    desplaza arrastrando, y un scroll lento no puede acabar abriendo notas— o si
 *    el navegador cancela el puntero (cuando se queda él el gesto para hacer
 *    scroll). Tras una pulsación larga, el `click` que el navegador manda al
 *    soltar se SUPRIME: si no, la lista de control se marcaría o se sumaría un
 *    positivo de rebote.
 *  - Ratón: clic derecho, con menú propio. El izquierdo mantenido no hace nada:
 *    en escritorio arrastrar y mantener es seleccionar, no pedir una nota.
 *  - El menú contextual del navegador se suprime en las celdas, siempre: en
 *    Android también llega un `contextmenu` con la pulsación larga, y aquí ya la
 *    atiende el temporizador.
 *
 * Lógica pura, sin React ni DOM: el temporizador es inyectable y los tests la
 * recorren evento a evento. `pages/Cuaderno.tsx` la conecta a la tabla con
 * delegación (un solo controlador para toda la rejilla, no uno por celda).
 */

export interface PunteroCelda {
  pointerType: string
  button: number
  x: number
  y: number
}

export interface OpcionesGesto<C> {
  /** Pulsación larga táctil: abrir (o crear) la nota de la celda. */
  onNota: (celda: C) => void
  /** Clic derecho de ratón: menú propio en (x, y). */
  onMenu: (celda: C, x: number, y: number) => void
  ms?: number
  /** Píxeles que puede moverse el dedo antes de que deje de ser una pulsación. */
  tolerancia?: number
  programar?: (fn: () => void, ms: number) => unknown
  cancelar?: (id: unknown) => void
}

export function crearGestoCelda<C>({
  onNota,
  onMenu,
  ms = 500,
  tolerancia = 10,
  programar = (fn, t) => setTimeout(fn, t),
  cancelar = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}: OpcionesGesto<C>) {
  let temporizador: unknown = null
  let origen = { x: 0, y: 0 }
  let ultimoTipo = ''
  let suprimirClick = false

  function parar() {
    if (temporizador !== null) cancelar(temporizador)
    temporizador = null
  }

  return {
    abajo(celda: C, p: PunteroCelda) {
      ultimoTipo = p.pointerType
      suprimirClick = false
      parar()
      if (p.pointerType === 'mouse' || p.button !== 0) return
      origen = { x: p.x, y: p.y }
      temporizador = programar(() => {
        temporizador = null
        suprimirClick = true
        onNota(celda)
      }, ms)
    },

    mover(p: Pick<PunteroCelda, 'x' | 'y'>) {
      if (temporizador === null) return
      if (Math.hypot(p.x - origen.x, p.y - origen.y) > tolerancia) parar()
    },

    /** `pointerup`, `pointercancel` y `pointerleave`. */
    soltar() {
      parar()
    },

    /**
     * `contextmenu` sobre una celda. Devuelve si hay que hacer `preventDefault`
     * (siempre: en las celdas no hay menú del navegador).
     */
    menuContextual(celda: C, x: number, y: number): boolean {
      // Con dedo/lápiz el `contextmenu` es la pulsación larga, que ya va por el
      // temporizador. Con ratón —o con la tecla de menú, sin puntero previo—
      // abre el menú propio.
      if (ultimoTipo === 'mouse' || ultimoTipo === '') onMenu(celda, x, y)
      return true
    },

    /** `click` en fase de captura. Devuelve si hay que tragárselo. */
    click(): boolean {
      if (!suprimirClick) return false
      suprimirClick = false
      return true
    },
  }
}
