import type { Etapa } from '../db/types'
import { ETAPA_UNICA, textoNivel } from '../lib/etapas'

/**
 * Badge de etapa (M1). Con las dos etapas activas distingue Infantil de
 * Primaria de un vistazo; con una sola (lib/etapas.ts) la palabra sobra —la app
 * no habla de «etapa» cuando no hay elección— y queda solo el curso: «3º».
 * Sin curso que enseñar, no se pinta nada.
 */
export function BadgeEtapa({ etapa, nivel }: { etapa: Etapa; nivel?: number }) {
  const esInfantil = etapa === 'infantil'
  const soloNivel = ETAPA_UNICA !== null

  if (soloNivel && nivel === undefined) return null

  return (
    <span
      className={
        'pildora ' +
        (esInfantil
          ? 'bg-lima text-white dark:bg-lima-oscuro'
          : 'bg-agua text-primario-oscuro dark:bg-agua/25 dark:text-agua')
      }
    >
      {soloNivel ? (
        textoNivel(etapa, nivel as number)
      ) : (
        <>
          {esInfantil ? 'Infantil' : 'Primaria'}
          {nivel !== undefined && ` ${nivel}`}
        </>
      )}
    </span>
  )
}
