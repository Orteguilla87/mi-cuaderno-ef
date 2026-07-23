import type { Etapa } from '../db/types'

/** Badge de etapa visible en toda la app (M1): distingue Infantil de Primaria de un vistazo. */
export function BadgeEtapa({ etapa, nivel }: { etapa: Etapa; nivel?: number }) {
  const esInfantil = etapa === 'infantil'
  return (
    <span
      className={
        'pildora ' +
        (esInfantil
          ? 'bg-lima text-white dark:bg-lima-oscuro'
          : 'bg-agua text-primario-oscuro dark:bg-agua/25 dark:text-agua')
      }
    >
      {esInfantil ? 'Infantil' : 'Primaria'}
      {nivel !== undefined && ` ${nivel}`}
    </span>
  )
}
