import { Mic, MicOff, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { crearDictado, mensajeDeError, soporteDictado, type MotivoFin, type SesionDictado } from '../lib/dictado'
import { guardarConfig } from '../db/config'

/**
 * Dictado de la hoja del agente: «Dictar» abre el micro y SOLO el maestro lo
 * cierra, con «Parar» (procesa) o «Cancelar» (descarta). Los silencios no
 * cortan: el maestro necesita pensar entre palabras (`lib/dictado.ts`).
 *
 * Lo que se transcribe aterriza SIEMPRE en el campo de texto de la hoja y en la
 * tarjeta de confirmación, que siguen siendo editables. No hay ningún camino que
 * escriba en la base sin enseñar antes lo entendido.
 *
 * Si el navegador no sabe transcribir, el botón no se pinta y la entrada por
 * teclado queda tal cual. La detección es en tiempo de ejecución, nunca por
 * suposición: Safari y Firefox no traen `SpeechRecognition`.
 */
export function BotonDictado(props: {
  /** Arranca la escucha: quien lo usa guarda aquí lo que había escrito. */
  onInicio: () => void
  /** El transcrito acumulado de la sesión, en vivo. */
  onTexto: (acumulado: string) => void
  /** Fin de la sesión. Solo `parar` pide procesar. */
  onFin: (texto: string, motivo: MotivoFin) => void
  /** Si ya se explicó alguna vez para qué se pide el micrófono. */
  yaExplicado: boolean
  deshabilitado?: boolean
}) {
  const [soportado] = useState(() => soporteDictado())
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explicando, setExplicando] = useState(false)
  const sesion = useRef<SesionDictado | null>(null)
  // La sesión vive más que un render: sin esto llamaría a los callbacks de la
  // pulsación, con el estado de la hoja de hace un minuto.
  const ultimas = useRef(props)
  ultimas.current = props

  // Salir de la hoja con el micrófono abierto dejaría el motor escuchando y el
  // indicador de grabación encendido en la pestaña.
  useEffect(() => () => sesion.current?.cancelar(), [])

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
    ultimas.current.onInicio()
    const s = crearDictado({
      onTexto: (t) => ultimas.current.onTexto(t),
      onError: (e) => setError(mensajeDeError(e)),
      onFin: (texto, motivo) => {
        sesion.current = null
        setEscuchando(false)
        ultimas.current.onFin(texto, motivo)
      },
    })
    sesion.current = s
    setEscuchando(true)
    s.iniciar()
  }

  function empezar() {
    // La primera vez se explica ANTES de que salte el diálogo del navegador: un
    // permiso que aparece sin avisar se deniega, y denegarlo cuesta mucho más
    // de deshacer que concederlo.
    if (!props.yaExplicado) {
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
      {escuchando ? (
        <div className="space-y-2">
          <p
            className="flex items-center gap-2 text-sm font-semibold text-acento"
            role="status"
            aria-live="polite"
          >
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-acento" aria-hidden />
            Escuchando — tómate tu tiempo, no se corta por los silencios
          </p>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <button
              type="button"
              className="btn-primario min-h-[64px] text-lg"
              onClick={() => sesion.current?.parar()}
            >
              <Square size={20} aria-hidden />
              Parar
            </button>
            <button
              type="button"
              className="btn-suave min-h-[64px]"
              onClick={() => sesion.current?.cancelar()}
            >
              <X size={18} aria-hidden />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-agua-claro font-semibold text-primario-oscuro transition-colors dark:bg-noche-elevada dark:text-agua"
          onClick={empezar}
          disabled={props.deshabilitado}
        >
          <Mic size={18} aria-hidden />
          Dictar
        </button>
      )}

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
