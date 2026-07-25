import { useEffect } from 'react'
import { useUI } from '../store/ui'

/**
 * Marca que hay una capa (hoja, pizarra, bloqueo por PIN) cubriendo la
 * pantalla mientras el componente que llama a este hook esté montado.
 *
 * El FAB de voz lee `capasAbiertas` y se retira mientras sea mayor que 0
 * (`AgenteVoz.tsx`): así deja de importar si una capa nueva empata o no en
 * z-index con él, porque directamente no está para taparla.
 */
export function useCapaAbierta(activa: boolean) {
  const abrirCapa = useUI((s) => s.abrirCapa)
  const cerrarCapa = useUI((s) => s.cerrarCapa)

  useEffect(() => {
    if (!activa) return
    abrirCapa()
    return () => cerrarCapa()
  }, [activa, abrirCapa, cerrarCapa])
}
