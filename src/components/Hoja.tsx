import { useEffect, type ReactNode } from 'react'
import { useCapaAbierta } from '../lib/capas'

/** Hoja inferior (bottom sheet): patrón de diálogo a una mano en móvil. */
export function Hoja({
  abierta,
  titulo,
  onCerrar,
  children,
}: {
  abierta: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
}) {
  useCapaAbierta(abierta)

  useEffect(() => {
    if (!abierta) return
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [abierta, onCerrar])

  if (!abierta) return null

  return (
    <div
      className="fixed inset-0 z-hoja flex items-end justify-center bg-primario-oscuro/50 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-hueso p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:bg-noche-fondo"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-agua dark:bg-noche-borde" />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-primario dark:text-agua">{titulo}</h2>
          <button
            className="min-h-tap min-w-tap text-2xl texto-suave"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
