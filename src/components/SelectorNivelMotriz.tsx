import {
  ETIQUETA_NIVEL_MOTRIZ,
  NIVELES_MOTRICES,
  etiquetaNivelMotriz,
  type NivelMotriz,
} from '../lib/nivelMotriz'

/**
 * Control compacto de nivel motriz 1–5, el mismo en la ficha del alumno y en
 * la vista de lote «Género y nivel»: cinco botones y, debajo, el rótulo en
 * lenguaje llano del que esté elegido.
 *
 * El rótulo va debajo y no dentro de cada botón por sitio: cinco veces
 * «Requiere apoyo» en fila no cabe en un móvil sin partir la palabra. Cada
 * botón lo lleva igualmente en su `aria-label`, así que quien navega con
 * lector de pantalla no oye cinco números pelados.
 *
 * Volver a pulsar el nivel puesto lo QUITA: sin valorar es un estado real
 * (`null`), no un cero ni un valor por defecto.
 */
export function SelectorNivelMotriz({
  valor,
  onCambio,
  id,
}: {
  valor: NivelMotriz | null | undefined
  onCambio: (nivel: NivelMotriz | null) => void
  id?: string
}) {
  return (
    <div>
      <div className="flex gap-1.5" role="group" aria-label="Nivel motriz" id={id}>
        {NIVELES_MOTRICES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onCambio(valor === n ? null : n)}
            aria-pressed={valor === n}
            aria-label={`Nivel motriz ${n}: ${ETIQUETA_NIVEL_MOTRIZ[n]}`}
            className={
              'flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-bold transition ' +
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
              (valor === n
                ? 'bg-primario text-white'
                : 'border border-borde text-tinta-suave dark:border-noche-borde')
            }
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs texto-suave">{etiquetaNivelMotriz(valor)}</p>
    </div>
  )
}
