import { useSyncExternalStore } from 'react'

/**
 * ¿Estamos en escritorio? Mismo corte que `lg:` y que `--alto-nav: 0px`
 * (index.css): 1024 px. Solo para lo que CSS no puede decidir —dónde se
 * monta un bloque—; todo lo visual sigue en clases `lg:`.
 */
const CONSULTA = '(min-width: 1024px)'

function suscribir(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA)
  mq.addEventListener('change', aviso)
  return () => mq.removeEventListener('change', aviso)
}

export function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  )
}
