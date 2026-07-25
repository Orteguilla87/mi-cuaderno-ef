import { Star } from 'lucide-react'

/** Estrellas 1-5 de una sesión. Pulsar la misma estrella la borra (§5 M3). */
export function ValoracionSesion({
  valor,
  onCambio,
}: {
  valor: 1 | 2 | 3 | 4 | 5 | undefined
  onCambio: (v: 1 | 2 | 3 | 4 | 5 | undefined) => void
}) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as const).map((v) => (
        <button
          key={v}
          onClick={() => onCambio(valor === v ? undefined : v)}
          className="flex min-h-tap flex-1 items-center justify-center"
          aria-label={`Valorar con ${v}`}
          aria-pressed={valor === v}
        >
          <Star
            size={28}
            className={valor && v <= valor ? 'fill-lima text-lima-oscuro' : 'text-tinta-tenue'}
            aria-hidden
          />
        </button>
      ))}
    </div>
  )
}
