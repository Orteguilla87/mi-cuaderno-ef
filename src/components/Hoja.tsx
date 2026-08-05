import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useCapaAbierta } from '../lib/capas'

const SELECTOR_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  const idTitulo = useId()
  const refPanel = useRef<HTMLDivElement>(null)
  const refDisparador = useRef<Element | null>(null)

  // Foco inicial + restauración: al abrir, guarda quién tenía el foco y entra
  // en la hoja; al cerrar, vuelve exactamente ahí. Sin esto, cerrar una hoja
  // con teclado deja el foco perdido en el <body>.
  useEffect(() => {
    if (!abierta) return
    refDisparador.current = document.activeElement
    const primero = refPanel.current?.querySelector<HTMLElement>(SELECTOR_FOCUSABLE)
    primero?.focus()
    return () => {
      if (refDisparador.current instanceof HTMLElement) refDisparador.current.focus()
    }
  }, [abierta])

  useEffect(() => {
    if (!abierta) return
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCerrar()
        return
      }
      if (e.key !== 'Tab' || !refPanel.current) return
      const focusables = Array.from(
        refPanel.current.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE),
      )
      if (focusables.length === 0) return
      const primero = focusables[0]
      const ultimo = focusables[focusables.length - 1]
      // Trampa de foco: Tab en el último vuelve al primero y viceversa, para
      // que navegar por teclado no se escape a lo que hay detrás de la hoja.
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
    window.addEventListener('keydown', onTecla)
    return () => window.removeEventListener('keydown', onTecla)
  }, [abierta, onCerrar])

  if (!abierta) return null

  return (
    // Girado deja de ser hoja inferior y pasa a diálogo centrado, como en
    // escritorio: pegada abajo solo le quedaban ~350 px de alto y 512 de
    // ancho en una pantalla de 844, que es justo lo que ahogaba la tabla de
    // rúbrica. Centrada usa el ancho, que es lo que sobra al girar.
    <div className="fixed inset-0 z-hoja flex items-end justify-center apaisado:items-center lg:items-center">
      {/* Fondo: hermano del diálogo, no antecesor — así `aria-hidden` solo
          oculta el propio fondo y no se lleva por delante el diálogo. */}
      <div
        className="absolute inset-0 bg-primario-oscuro/50 backdrop-blur-sm"
        onClick={onCerrar}
        aria-hidden="true"
      />
      <div
        ref={refPanel}
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-xl2 bg-hueso p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:bg-noche-fondo apaisado:max-w-3xl apaisado:rounded-xl2 apaisado:pb-4 lg:rounded-xl2 lg:pb-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-agua dark:bg-noche-borde" />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={idTitulo} className="text-xl font-bold text-primario dark:text-agua">
            {titulo}
          </h2>
          <button
            className="btn-fantasma min-h-tap min-w-tap px-0"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
