import { useEffect } from 'react'
import { useUI } from '../store/ui'

/**
 * Contrae el FAB de voz mientras la pantalla esté montada.
 *
 * Lo usan las pantallas densas —rejilla del cuaderno, pase de lista— donde el
 * micrófono a tamaño completo se superpone a celdas y botones de acción. Quien
 * cede es siempre el FAB, nunca el contenido de la pantalla (§7).
 */
export function useFabCompacto() {
  const setFabCompacto = useUI((s) => s.setFabCompacto)

  useEffect(() => {
    setFabCompacto(true)
    return () => setFabCompacto(false)
  }, [setFabCompacto])
}
