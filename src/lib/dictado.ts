/**
 * Captura de voz con la Web Speech API del navegador — lógica pura, sin React.
 *
 * La transcripción la hace el NAVEGADOR, no la API de Anthropic: aquí no viaja
 * audio a ningún sitio nuestro, y el texto resultante sigue el mismo camino que
 * si se hubiera tecleado (§6). Sustituye al dictado del teclado de Android, que
 * pedía tres toques para una orden; con esto es uno.
 *
 * Nada de asumir soporte: `SpeechRecognition` no existe en Firefox ni en
 * Safari, así que `soporteDictado()` se consulta EN TIEMPO DE EJECUCIÓN y la UI
 * se queda con la entrada por teclado cuando dice que no.
 */

/** Motivos por los que el dictado se para, ya traducidos a algo que se pueda contar. */
export type ErrorDictado = 'sin-soporte' | 'sin-permiso' | 'sin-habla' | 'red' | 'otro'

export interface OpcionesDictado {
  /** Texto reconocido que el motor aún puede corregir. Llega varias veces. */
  onParcial?: (texto: string) => void
  /** Texto que el motor ya da por bueno. */
  onFinal?: (texto: string) => void
  onError?: (error: ErrorDictado) => void
  /** Siempre al terminar, con error o sin él: sirve para apagar el estado «escuchando». */
  onFin?: () => void
  /** Solo para los tests: el reloj con el que se mide el silencio. */
  reloj?: { fijar: (fn: () => void, ms: number) => number; cancelar: (id: number) => void }
}

export interface SesionDictado {
  iniciar: () => void
  /** Idempotente: pararlo dos veces no es un error, es lo que pasa al soltar el botón. */
  detener: () => void
}

/**
 * Guarda contra el ruido de la pista: con 25 alumnos gritando, el motor puede
 * no dar nunca la frase por terminada y quedarse escuchando indefinidamente.
 */
const MS_SILENCIO = 8000

interface ConstructorReconocimiento {
  new (): ReconocimientoVoz
}

/** Lo que usamos de `SpeechRecognition`, sin depender de los tipos del DOM. */
interface ReconocimientoVoz {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((evento: EventoResultado) => void) | null
  onerror: ((evento: { error?: string }) => void) | null
  onend: (() => void) | null
}

interface EventoResultado {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

interface GlobalConVoz {
  SpeechRecognition?: ConstructorReconocimiento
  webkitSpeechRecognition?: ConstructorReconocimiento
}

/**
 * Se mira en `globalThis` y no en `window` —que en el navegador son el mismo
 * objeto— para que esto se pueda probar sin montar un DOM entero: los tests de
 * este proyecto corren en Node.
 */
function constructor(): ConstructorReconocimiento | undefined {
  const g = globalThis as unknown as GlobalConVoz
  return g.SpeechRecognition ?? g.webkitSpeechRecognition
}

/** `true` si este navegador sabe transcribir. Se consulta, nunca se supone. */
export function soporteDictado(): boolean {
  return constructor() !== undefined
}

/** Traduce el código del motor a uno de los nuestros, que sí se puede explicar. */
function traducirError(codigo: string | undefined): ErrorDictado {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'sin-permiso'
    case 'no-speech':
      return 'sin-habla'
    case 'network':
      return 'red'
    default:
      return 'otro'
  }
}

/**
 * Una sesión de dictado: una orden por pulsación.
 *
 * `continuous: false` es deliberado —una orden, un toque— y de paso hace que el
 * propio motor cierre al callar. `interimResults: true` porque en un sitio
 * ruidoso hay que ver lo que se está entendiendo mientras se habla, no al final.
 */
export function crearDictado(opciones: OpcionesDictado = {}): SesionDictado {
  const Reconocimiento = constructor()
  if (!Reconocimiento) {
    return {
      iniciar: () => {
        opciones.onError?.('sin-soporte')
        opciones.onFin?.()
      },
      detener: () => {},
    }
  }

  const reloj = opciones.reloj ?? {
    fijar: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    cancelar: (id: number) => clearTimeout(id),
  }

  let motor: ReconocimientoVoz | null = null
  let guarda: number | null = null

  const cancelarGuarda = () => {
    if (guarda !== null) reloj.cancelar(guarda)
    guarda = null
  }

  const rearmarGuarda = () => {
    cancelarGuarda()
    guarda = reloj.fijar(() => {
      guarda = null
      motor?.stop()
    }, MS_SILENCIO)
  }

  const detener = () => {
    cancelarGuarda()
    if (!motor) return
    const actual = motor
    motor = null
    actual.stop()
  }

  const iniciar = () => {
    if (motor) return
    const r = new Reconocimiento()
    motor = r
    r.lang = 'es-ES'
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 1

    r.onresult = (evento) => {
      rearmarGuarda()
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i]
        const texto = resultado[0]?.transcript ?? ''
        if (!texto) continue
        if (resultado.isFinal) opciones.onFinal?.(texto)
        else opciones.onParcial?.(texto)
      }
    }

    r.onerror = (evento) => {
      opciones.onError?.(traducirError(evento.error))
    }

    r.onend = () => {
      cancelarGuarda()
      motor = null
      opciones.onFin?.()
    }

    try {
      r.start()
      rearmarGuarda()
    } catch {
      // `start()` sobre un motor que ya estaba escuchando lanza: no es un fallo
      // que el maestro tenga que ver, pero el estado sí hay que devolverlo.
      motor = null
      cancelarGuarda()
      opciones.onFin?.()
    }
  }

  return { iniciar, detener }
}

/** Qué decirle al maestro cuando el dictado se para solo. */
export function mensajeDeError(error: ErrorDictado): string {
  switch (error) {
    case 'sin-permiso':
      return 'No tengo permiso para usar el micrófono. Tócalo en el candado de la barra de direcciones → Micrófono → Permitir, y vuelve a intentarlo. Mientras tanto puedes escribir la orden.'
    case 'sin-soporte':
      return 'Este navegador no sabe transcribir. Escribe la orden y el resto funciona igual.'
    case 'sin-habla':
      return 'No he oído nada. Toca el micrófono y habla más cerca.'
    case 'red':
      return 'El navegador necesita conexión para transcribir. Sin ella, escribe la orden.'
    default:
      return 'El micrófono se ha parado. Prueba otra vez o escribe la orden.'
  }
}
