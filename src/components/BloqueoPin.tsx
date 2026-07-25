import { Delete, Lock } from 'lucide-react'
import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { comprobarPin } from '../db/pin'
import { useCapaAbierta } from '../lib/capas'
import { LONGITUD_MAX_PIN, LONGITUD_MIN_PIN } from '../lib/pin'

/**
 * Pantalla de bloqueo (§1.7, M9). Cubre toda la app hasta que se introduce el
 * PIN correcto. Solo protege el ACCESO a la interfaz: la base de IndexedDB
 * sigue sin cifrar en el dispositivo — se avisa de ello en Ajustes.
 */
export function BloqueoPin({ onDesbloqueo }: { onDesbloqueo: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  useCapaAbierta(true)
  const idTitulo = useId()
  const refPrimeraTecla = useRef<HTMLButtonElement>(null)

  // Foco inicial: no hay nada detrás que se pueda usar, pero un lector de
  // pantalla que arranca en <body> no sabe que la app está bloqueada hasta
  // que el foco entra aquí.
  useEffect(() => {
    refPrimeraTecla.current?.focus()
  }, [])

  useEffect(() => {
    if (pin.length < LONGITUD_MIN_PIN) return
    let cancelado = false
    // El PIN real puede tener entre 4 y 6 dígitos y esta pantalla no sabe
    // cuántos: al llegar al máximo se comprueba al instante (no se puede
    // teclear más), y si no, se espera una pausa antes de dar por
    // terminada la entrada. Sin esta espera, un PIN de 4 dígitos tecleado
    // mal nunca mostraba error — se quedaba esperando 2 dígitos de más que
    // el usuario no iba a escribir.
    const espera = pin.length >= LONGITUD_MAX_PIN ? 0 : 500
    const temporizador = window.setTimeout(() => {
      setComprobando(true)
      void comprobarPin(pin).then((ok) => {
        if (cancelado) return
        setComprobando(false)
        if (ok) {
          onDesbloqueo()
        } else {
          setError(true)
          setPin('')
        }
      })
    }, espera)
    return () => {
      cancelado = true
      window.clearTimeout(temporizador)
    }
  }, [pin])

  function pulsar(digito: string) {
    setError(false)
    setPin((p) => (p.length < LONGITUD_MAX_PIN ? p + digito : p))
  }

  function borrar() {
    setError(false)
    setPin((p) => p.slice(0, -1))
  }

  return (
    <div
      className="fixed inset-0 z-bloqueo flex flex-col items-center justify-center gap-8 bg-primario px-6 text-white dark:bg-primario-oscuro"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
    >
      <div className="flex flex-col items-center gap-2">
        <Lock size={32} aria-hidden />
        <h1 id={idTitulo} className="text-xl font-bold">
          Cuaderno bloqueado
        </h1>
        {/* Montado solo mientras hay error: con opacidad seguía en el árbol
            de accesibilidad y el lector lo anunciaba aunque fuera invisible. */}
        <div className="min-h-[1.25rem] text-sm text-agua">
          {error && <p role="alert">PIN incorrecto. Inténtalo de nuevo.</p>}
        </div>
      </div>

      <div className="flex gap-3" aria-live="polite">
        {Array.from({ length: LONGITUD_MAX_PIN }).map((_, i) => (
          <span
            key={i}
            className={
              'h-4 w-4 rounded-full border-2 border-white/70 ' +
              (i < pin.length ? 'bg-white' : 'bg-transparent')
            }
          />
        ))}
      </div>

      <div className={'grid grid-cols-3 gap-3 ' + (comprobando ? 'pointer-events-none opacity-60' : '')}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d, i) => (
          <TeclaPin key={d} ref={i === 0 ? refPrimeraTecla : undefined} onClick={() => pulsar(d)}>
            {d}
          </TeclaPin>
        ))}
        <span />
        <TeclaPin onClick={() => pulsar('0')}>0</TeclaPin>
        <TeclaPin onClick={borrar} etiqueta="Borrar">
          <Delete size={24} aria-hidden />
        </TeclaPin>
      </div>
    </div>
  )
}

const TeclaPin = forwardRef<
  HTMLButtonElement,
  { children: React.ReactNode; onClick: () => void; etiqueta?: string }
>(function TeclaPin({ children, onClick, etiqueta }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-label={etiqueta}
      className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold
                 active:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
    >
      {children}
    </button>
  )
})
