import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import { PALETA, colorPorId } from '../lib/paleta'

/**
 * Elegir un color de dato (`lib/paleta.ts`): grupo, peto, etiqueta de alumnado.
 *
 * Tres cosas que no son opcionales:
 *  - lo que sale del componente es el ID del color, nunca el hex;
 *  - cada muestra se anuncia por su nombre en español, no por su hexadecimal
 *    («Turquesa», no «Color #006A80»);
 *  - la elegida se marca con un icono además del anillo, porque un anillo de
 *    color sobre una muestra de color no es una marca para todo el mundo.
 *
 * Es un `radiogroup` de verdad, así que se recorre con las flechas y se elige
 * con la propia flecha, como cualquier grupo de opciones excluyentes.
 */
export function SelectorColor({
  valor,
  onValor,
  etiqueta = 'Color',
  id,
}: {
  /** Identificador de la paleta. Un valor desconocido no marca ninguna muestra. */
  valor: string
  onValor: (id: string) => void
  /** Rótulo del grupo, para el lector de pantalla. */
  etiqueta?: string
  id?: string
}) {
  const indiceActual = PALETA.findIndex((c) => c.id === valor)

  function mover(delta: number) {
    const desde = indiceActual === -1 ? 0 : indiceActual
    const siguiente = (desde + delta + PALETA.length) % PALETA.length
    onValor(PALETA[siguiente].id)
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={etiqueta}
      className="grid grid-cols-6 gap-2"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          mover(1)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          mover(-1)
        }
      }}
    >
      {PALETA.map((c) => {
        const elegido = c.id === valor
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={elegido}
            aria-label={c.nombre}
            title={c.nombre}
            // Solo la muestra elegida entra en el orden de tabulación: dentro
            // del grupo se navega con las flechas, no con el tabulador.
            tabIndex={elegido || (indiceActual === -1 && c === PALETA[0]) ? 0 : -1}
            onClick={() => onValor(c.id)}
            style={variablesColor(c.id)}
            className={
              'color-dato flex h-12 w-full items-center justify-center rounded-xl transition ' +
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
              (elegido
                ? 'ring-2 ring-tinta ring-offset-2 ring-offset-superficie dark:ring-white dark:ring-offset-noche-superficie'
                : 'active:scale-95')
            }
          >
            {elegido && <Check size={20} strokeWidth={3} className="text-white" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Las dos variables que consumen las clases `.color-dato*` de `index.css`. Se
 * exporta porque cualquier sitio que pinte un color de dato —la banda de un
 * grupo, el punto de una etiqueta— necesita exactamente esto.
 */
export function variablesColor(id: string | undefined): CSSProperties {
  const color = colorPorId(id) ?? PALETA[0]
  return {
    ['--color-claro' as string]: color.claro,
    ['--color-oscuro' as string]: color.oscuro,
  } as CSSProperties
}
