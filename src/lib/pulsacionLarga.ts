import { useRef } from 'react'

/**
 * Pulsación larga (~500 ms) sin librerías, con pointer events que cubren dedo y
 * ratón por igual. Devuelve los props para el elemento y un `fueLargo` para que
 * el `onClick` distinga la pulsación larga del toque normal y no dispare las dos
 * acciones a la vez.
 *
 * Se extrajo del pase de lista, donde el long-press abría el detalle del
 * alumno; ahora lo comparte la cabecera de columna del cuaderno para «Aplicar a
 * todo el grupo».
 */
export function usePulsacionLarga(onLargo: () => void, ms = 500) {
  const temporizador = useRef<number | null>(null)
  const fueLargo = useRef(false)

  function iniciar() {
    fueLargo.current = false
    temporizador.current = window.setTimeout(() => {
      fueLargo.current = true
      onLargo()
    }, ms)
  }

  function terminar() {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current)
    temporizador.current = null
  }

  return {
    fueLargo,
    props: {
      onPointerDown: iniciar,
      onPointerUp: terminar,
      onPointerLeave: terminar,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  }
}
