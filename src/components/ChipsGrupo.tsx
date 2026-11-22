import type { Grupo } from '../db/types'
import { variablesColor } from './SelectorColor'

/**
 * Fila de chips para elegir grupo (Informes, Cuaderno en escritorio). Cada chip
 * lleva el punto de color del grupo Y su nombre: el color nunca va solo.
 */
export function ChipsGrupo({
  grupos,
  valor,
  onCambio,
  className = '',
}: {
  grupos: Grupo[]
  valor: string | undefined
  onCambio: (id: string) => void
  className?: string
}) {
  return (
    <div role="group" aria-label="Grupo" className={'flex flex-wrap gap-2 ' + className}>
      {grupos.map((g) => (
        <button
          key={g.id}
          onClick={() => onCambio(g.id)}
          aria-pressed={valor === g.id}
          className={
            'pildora min-h-[40px] gap-1.5 px-3 ' +
            (valor === g.id
              ? 'bg-primario text-white'
              : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
          }
        >
          <span
            className="color-dato h-2.5 w-2.5 rounded-full"
            style={variablesColor(g.colorId ?? g.color)}
            aria-hidden
          />
          {g.nombre}
        </button>
      ))}
    </div>
  )
}
