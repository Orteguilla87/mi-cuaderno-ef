import { Mic, MicOff, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { crearDictado, mensajeDeError, soporteDictado, type SesionDictado } from '../lib/dictado'
import { guardarConfig } from '../db/config'

/**
 * Botón de dictado de la hoja del agente: un toque empieza a escuchar, otro
 * para (§6, 1.1).
 *
 * Lo que se transcribe aterriza SIEMPRE en el campo de texto de la hoja, que
 * sigue siendo editable con un toque. No hay ningún camino que ejecute una
 * transcripción sin haberla enseñado antes: en una pista con 25 alumnos, el
 * motor se equivoca a menudo y actuar a ciegas sería peor que teclear.
 *
 * Si el navegador no sabe transcribir, el botón no se pinta y la entrada por
 * teclado queda tal cual. La detección es en tiempo de ejecución, nunca por
 * suposición: Safari y Firefox no traen `SpeechRecognition`.
 */
export function BotonDictado({
  onParcial,
  onFinal,
  yaExplicado,
  deshabilitado,
}: {
  /** Texto provisional: sustituye a lo dictado en esta pulsación. */
  onParcial: (texto: string) => void
  /** Texto definitivo del motor. */
  onFinal: (texto: string) => void
  /** Si ya se explicó alguna vez para qué se pide el micrófono. */
  yaExplicado: boolean
  deshabilitado?: boolean
}) {
  const [soportado] = useState(() => soporteDictado())
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explicando, setExplicando] = useState(false)
  const sesion = useRef<SesionDictado | null>(null)

  // Salir de la hoja con el micrófono abierto dejaría el motor escuchando y el
  // indicador de grabación encendido en la pestaña.
  useEffect(() => () => sesion.current?.detener(), [])

  if (!soportado) {
    return (
      <p className="flex items-start gap-2 text-xs texto-suave">
        <MicOff size={16} className="mt-0.5 shrink-0" aria-hidden />
        Este navegador no sabe transcribir. Escribe la orden: el resto funciona igual.
      </p>
    )
  }

  function arrancar() {
    setError(null)
    const s = crearDictado({
      onParcial,
      onFinal,
      onError: (e) => setError(mensajeDeError(e)),
      onFin: () => {
        sesion.current = null
        setEscuchando(false)
      },
    })
    sesion.current = s
    setEscuchando(true)
    s.iniciar()
  }

  function alternar() {
    if (escuchando) {
      sesion.current?.detener()
      return
    }
    // La primera vez se explica ANTES de que salte el diálogo del navegador: un
    // permiso que aparece sin avisar se deniega, y denegarlo cuesta mucho más
    // de deshacer que concederlo.
    if (!yaExplicado) {
      setExplicando(true)
      return
    }
    arrancar()
  }

  function aceptarExplicacion() {
    setExplicando(false)
    void guardarConfig({ dictadoExplicado: true })
    arrancar()
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={
          'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl font-semibold transition-colors ' +
          (escuchando
            ? 'bg-acento text-white animate-pulse'
            : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
        }
        onClick={alternar}
        disabled={deshabilitado}
        aria-pressed={escuchando}
      >
        {escuchando ? <Square size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
        {escuchando ? 'Escuchando… toca para parar' : 'Dictar'}
      </button>

      {explicando && (
        <div className="panel-agua space-y-2 text-sm">
          <p>
            El navegador va a pedirte permiso para el micrófono. El audio lo transcribe el propio
            navegador; a la API solo llega después el texto, y con los nombres sustituidos.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-suave" onClick={() => setExplicando(false)}>
              Ahora no
            </button>
            <button type="button" className="btn-primario" onClick={aceptarExplicacion}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-acento">
          {error}
        </p>
      )}
    </div>
  )
}
