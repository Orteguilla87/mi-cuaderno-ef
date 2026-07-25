import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { volver } from '../lib/router'

/**
 * Barra sólida en primario: es lo primero que se ve y lo que da identidad a la
 * app. En pista, además, un bloque de color grande ancla la vista mejor que un
 * título sobre fondo claro.
 */
export function Cabecera({
  titulo,
  subtitulo,
  atras = false,
  acciones,
}: {
  titulo: string
  subtitulo?: ReactNode
  atras?: boolean
  acciones?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 bg-primario px-4 pb-4 pt-3 text-white shadow-lg shadow-primario/20 dark:bg-primario-oscuro">
      <div className="flex items-center gap-2">
        {atras && (
          <button
            onClick={volver}
            className="-ml-3 flex min-h-tap min-w-tap items-center justify-center rounded-full text-white/90 transition active:bg-white/15
                       focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
            aria-label="Volver"
          >
            <ChevronLeft size={28} aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{titulo}</h1>
        </div>
        {acciones}
      </div>
      {subtitulo && <div className="mt-1.5 text-sm text-agua">{subtitulo}</div>}
    </header>
  )
}

/** Botón pensado para vivir dentro de la Cabecera, sobre fondo primario. */
export function AccionCabecera({
  children,
  onClick,
  destacada = false,
}: {
  children: ReactNode
  onClick: () => void
  destacada?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        // `.btn` da estructura, foco y active:scale; aquí solo se añade el
        // color, porque vive sobre fondo primario y ninguna variante del
        // sistema (pensadas para fondo claro) tiene contraste ahí.
        'btn focus-visible:ring-offset-primario dark:focus-visible:ring-offset-primario-oscuro ' +
        (destacada
          ? 'bg-acento text-white shadow-sm'
          : 'border border-white/35 text-white active:bg-white/15 focus-visible:ring-white/50')
      }
    >
      {children}
    </button>
  )
}
