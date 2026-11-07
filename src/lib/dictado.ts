import { normalizarTexto } from './texto'

/**
 * Captura de voz con la Web Speech API del navegador — lógica pura, sin React.
 *
 * La transcripción la hace el NAVEGADOR, no la API de Anthropic: aquí no viaja
 * audio a ningún sitio nuestro, y el texto resultante sigue el mismo camino que
 * si se hubiera tecleado (§6).
 *
 * ——— LA ESCUCHA SOLO LA TERMINA EL MAESTRO ———
 *
 * El maestro piensa entre palabras («David de cuarto A… ha ayudado… a recoger
 * el material»). Antes se escuchaba con `continuous: false` y una guarda de 8 s
 * de silencio: a la primera pausa se cerraba el micro y se perdía la frase.
 *
 * Ahora `continuous: true`, sin guarda de silencio, y además: Chrome Android
 * cierra el reconocimiento por su cuenta tras un silencio AUNQUE sea continuo.
 * Por eso, si `onend` llega sin que se haya pulsado «Parar», se relanza
 * `start()` en el acto y el texto de cada tramo se ACUMULA en un único
 * transcrito. Solo `parar()` entrega el texto para procesar; `cancelar()` lo
 * descarta.
 *
 * Salidas que no dependen del maestro, y por eso avisan:
 *  - errores fatales (permiso, micro ocupado, red): no se relanza, sin bucles;
 *  - 2 minutos abiertos: se para para no dejar el micro encendido por olvido;
 *  - relanzamientos en ráfaga sin ningún resultado: el motor está roto, se para.
 *
 * Nada de asumir soporte: `SpeechRecognition` no existe en Firefox ni en
 * Safari, así que `soporteDictado()` se consulta EN TIEMPO DE EJECUCIÓN y la UI
 * se queda con la entrada por teclado cuando dice que no.
 */

/** Motivos por los que el dictado se para sin que lo pida el maestro. */
export type ErrorDictado = 'sin-soporte' | 'sin-permiso' | 'sin-micro' | 'red' | 'limite' | 'otro'

/** Por qué terminó la sesión. Solo `parar` significa «procesa esto». */
export type MotivoFin = 'parar' | 'cancelar' | 'limite' | 'error'

export interface OpcionesDictado {
  /** El transcrito acumulado de toda la sesión, provisional incluido. Llega muchas veces. */
  onTexto?: (acumulado: string) => void
  onError?: (error: ErrorDictado) => void
  /**
   * Una sola vez, al terminar. `texto` es el transcrito completo (vacío si se
   * canceló). Solo con `motivo === 'parar'` debe procesarse.
   */
  onFin?: (texto: string, motivo: MotivoFin) => void
  /** Solo para los tests: el reloj con el que se miden el límite y las ráfagas. */
  reloj?: {
    fijar: (fn: () => void, ms: number) => number
    cancelar: (id: number) => void
    ahora: () => number
  }
}

export interface SesionDictado {
  iniciar: () => void
  /** Termina y entrega el texto para procesar. Idempotente. */
  parar: () => void
  /** Termina y descarta lo dictado. Idempotente. */
  cancelar: () => void
}

/** Micro abierto sin que nadie pulse nada: a partir de aquí es un olvido. */
export const MS_LIMITE = 2 * 60 * 1000

/** Si `stop()` no trae su `onend` en este rato, se cierra igualmente. */
const MS_ESPERA_FIN = 1500

/** Más de RAFAGA_MAX relanzamientos en RAFAGA_MS sin oír nada: el motor no funciona. */
const RAFAGA_MAX = 5
const RAFAGA_MS = 3000

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

/**
 * Traduce el código del motor. `null` = no es un error para el maestro (el
 * silencio, o el `abort` que provocamos nosotros): se sigue escuchando.
 */
function traducirError(codigo: string | undefined): ErrorDictado | null {
  switch (codigo) {
    case 'no-speech':
    case 'aborted':
      return null
    case 'not-allowed':
    case 'service-not-allowed':
      return 'sin-permiso'
    case 'audio-capture':
      return 'sin-micro'
    case 'network':
      return 'red'
    default:
      return 'otro'
  }
}

function claveDe(palabra: string): string {
  return normalizarTexto(palabra).replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Une dos trozos de transcrito con un espacio, quitando lo que se repite en la
 * costura: el mayor solape entre el final de `a` y el principio de `b`.
 *
 * Existe por dos motivos. Chrome Android, en modo continuo, devuelve a menudo
 * cada resultado final con el anterior delante («ha ayudado» → «ha ayudado a
 * recoger»); y al relanzar, el primer tramo nuevo puede repetir la última
 * palabra provisional del anterior. Se compara sin tildes, mayúsculas ni
 * puntuación. Un solape de UNA sola palabra no cuenta salvo que `b` entero esté
 * repetido: «muy» + «muy bien» es énfasis, no un duplicado.
 */
export function unirSinSolape(a: string, b: string): string {
  const pa = a.trim().split(/\s+/).filter(Boolean)
  const pb = b.trim().split(/\s+/).filter(Boolean)
  if (pa.length === 0) return pb.join(' ')
  if (pb.length === 0) return pa.join(' ')
  const ka = pa.map(claveDe)
  const kb = pb.map(claveDe)
  for (let k = Math.min(ka.length, kb.length); k >= 1; k--) {
    if (k === 1 && kb.length > 1) break
    let iguales = true
    for (let i = 0; i < k; i++) {
      if (ka[ka.length - k + i] !== kb[i]) {
        iguales = false
        break
      }
    }
    if (iguales) return [...pa, ...pb.slice(k)].join(' ')
  }
  return [...pa, ...pb].join(' ')
}

/**
 * Una sesión de dictado: desde que el maestro pulsa hasta que pulsa «Parar» (o
 * «Cancelar»), con los relanzamientos que hagan falta entre medias.
 */
export function crearDictado(opciones: OpcionesDictado = {}): SesionDictado {
  const Reconocimiento = constructor()
  if (!Reconocimiento) {
    let avisado = false
    return {
      iniciar: () => {
        if (avisado) return
        avisado = true
        opciones.onError?.('sin-soporte')
        opciones.onFin?.('', 'error')
      },
      parar: () => {},
      cancelar: () => {},
    }
  }

  const reloj = opciones.reloj ?? {
    fijar: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    cancelar: (id: number) => clearTimeout(id),
    ahora: () => Date.now(),
  }

  let motor: ReconocimientoVoz | null = null
  /** Texto de los tramos ya cerrados. */
  let confirmado = ''
  /** Texto del tramo en curso (finales + provisional), recalculado en cada evento. */
  let tramo = ''
  /** Qué se ha pedido. `null` mientras se escucha. */
  let pedido: MotivoFin | null = null
  let errorFatal: ErrorDictado | null = null
  let terminado = false
  let empezado = false
  let temporizadorLimite: number | null = null
  let temporizadorEspera: number | null = null
  /** Momentos de los relanzamientos desde el último resultado. */
  let relanzamientos: number[] = []

  const acumulado = () => unirSinSolape(confirmado, tramo)

  const cancelarTemporizadores = () => {
    if (temporizadorLimite !== null) reloj.cancelar(temporizadorLimite)
    if (temporizadorEspera !== null) reloj.cancelar(temporizadorEspera)
    temporizadorLimite = null
    temporizadorEspera = null
  }

  const soltarMotor = () => {
    if (!motor) return
    motor.onresult = null
    motor.onerror = null
    motor.onend = null
    motor = null
  }

  const terminar = (motivo: MotivoFin) => {
    if (terminado) return
    terminado = true
    cancelarTemporizadores()
    const texto = motivo === 'cancelar' ? '' : acumulado()
    soltarMotor()
    if (motivo === 'limite') opciones.onError?.('limite')
    if (motivo === 'error') opciones.onError?.(errorFatal ?? 'otro')
    opciones.onFin?.(texto, motivo)
  }

  const montar = (): ReconocimientoVoz => {
    const r = new Reconocimiento()
    r.lang = 'es-ES'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1

    r.onresult = (evento) => {
      relanzamientos = []
      // Se recorre el tramo ENTERO, no desde `resultIndex`: el motor reescribe
      // los provisionales y lo que interesa es la foto completa del tramo.
      let texto = ''
      for (let i = 0; i < evento.results.length; i++) {
        const t = evento.results[i][0]?.transcript ?? ''
        if (t.trim()) texto = unirSinSolape(texto, t)
      }
      tramo = texto
      opciones.onTexto?.(acumulado())
    }

    r.onerror = (evento) => {
      const e = traducirError(evento.error)
      if (e) errorFatal = e
    }

    r.onend = () => {
      // El tramo se da por cerrado, provisional incluido: el motor nuevo empieza
      // con la lista de resultados vacía, así que no hay nada que duplicar.
      confirmado = acumulado()
      tramo = ''
      if (pedido) return terminar(pedido)
      if (errorFatal) return terminar('error')
      relanzar()
    }
    return r
  }

  const arrancar = (r: ReconocimientoVoz): boolean => {
    try {
      r.start()
      return true
    } catch {
      return false
    }
  }

  /** `onend` sin que nadie lo pidiera: Chrome ha cerrado por silencio. Se sigue. */
  const relanzar = () => {
    const ahora = reloj.ahora()
    relanzamientos = [...relanzamientos.filter((t) => ahora - t < RAFAGA_MS), ahora]
    if (relanzamientos.length > RAFAGA_MAX) {
      errorFatal = 'otro'
      return terminar('error')
    }
    if (motor && arrancar(motor)) return
    // El mismo motor no quiere volver a arrancar: uno nuevo.
    soltarMotor()
    motor = montar()
    if (!arrancar(motor)) {
      errorFatal = 'otro'
      terminar('error')
    }
  }

  /** Pide al motor que cierre; `onend` hará el resto. Si no llega, se cierra igual. */
  const pedirFin = (motivo: MotivoFin) => {
    if (terminado || pedido) return
    pedido = motivo
    if (!motor) return terminar(motivo)
    temporizadorEspera = reloj.fijar(() => terminar(motivo), MS_ESPERA_FIN)
    motor.stop()
  }

  return {
    iniciar() {
      if (empezado) return
      empezado = true
      motor = montar()
      if (!arrancar(motor)) {
        errorFatal = 'otro'
        return terminar('error')
      }
      temporizadorLimite = reloj.fijar(() => pedirFin('limite'), MS_LIMITE)
    },
    parar() {
      pedirFin('parar')
    },
    cancelar() {
      if (terminado) return
      const m = motor
      // Se cierra ya, sin esperar a `onend`: lo dictado no se quiere para nada.
      terminar('cancelar')
      try {
        m?.abort()
      } catch {
        // El motor ya estaba cerrado: no hay nada que abortar.
      }
    },
  }
}

/** Qué decirle al maestro cuando el dictado se para sin que él lo pida. */
export function mensajeDeError(error: ErrorDictado): string {
  switch (error) {
    case 'sin-permiso':
      return 'No tengo permiso para usar el micrófono. Tócalo en el candado de la barra de direcciones → Micrófono → Permitir, y vuelve a intentarlo. Mientras tanto puedes escribir la orden.'
    case 'sin-micro':
      return 'No encuentro el micrófono o lo está usando otra app. Ciérrala y vuelve a intentarlo, o escribe la orden.'
    case 'sin-soporte':
      return 'Este navegador no sabe transcribir. Escribe la orden y el resto funciona igual.'
    case 'red':
      return 'El navegador necesita conexión para transcribir. Sin ella, escribe la orden.'
    case 'limite':
      return 'El micrófono llevaba 2 minutos abierto y lo he parado. Revisa el texto y pulsa «Interpretar».'
    default:
      return 'El micrófono se ha parado. Prueba otra vez o escribe la orden.'
  }
}
