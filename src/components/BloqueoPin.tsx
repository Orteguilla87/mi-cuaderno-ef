import { Delete, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { comprobarPin } from '../db/pin'
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-primario px-6 text-white dark:bg-primario-oscuro">
      <div className="flex flex-col items-center gap-2">
        <Lock size={32} aria-hidden />
        <h1 className="text-xl font-bold">Cuaderno bloqueado</h1>
        <p className={'text-sm text-agua transition-opacity ' + (error ? 'opacity-100' : 'opacity-0')}>
          PIN incorrecto. Inténtalo de nuevo.
        </p>
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
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <TeclaPin key={d} onClick={() => pulsar(d)}>
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

function TeclaPin({
  children,
  onClick,
  etiqueta,
}: {
  children: React.ReactNode
  onClick: () => void
  etiqueta?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold active:bg-white/15"
    >
      {children}
    </button>
  )
}
