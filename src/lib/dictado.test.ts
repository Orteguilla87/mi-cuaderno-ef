import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearDictado, mensajeDeError, MS_LIMITE, soporteDictado, unirSinSolape } from './dictado'

/**
 * Doble del motor del navegador. No hay forma de probar `SpeechRecognition` de
 * verdad en Node, y tampoco hace falta: lo que hay que asegurar es que la app
 * NUNCA da por hecho que existe y que el estado vuelve a su sitio pase lo que
 * pase, que es de lo que depende el respaldo por teclado.
 */
class MotorFalso {
  static ultimo: MotorFalso | null = null

  lang = ''
  continuous = true
  interimResults = false
  maxAlternatives = 0
  arrancado = 0
  parado = 0

  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error?: string }) => void) | null = null
  onend: (() => void) | null = null

  constructor() {
    MotorFalso.ultimo = this
  }

  start() {
    this.arrancado++
  }

  stop() {
    this.parado++
    this.onend?.()
  }

  abortado = 0

  abort() {
    this.abortado++
    this.onend?.()
  }

  /** Simula lo que emite el motor: un tramo provisional y su versión definitiva. */
  emitir(texto: string, definitivo: boolean) {
    this.emitirVarios([[texto, definitivo]])
  }

  /** La lista completa de resultados del tramo, como la da el navegador. */
  emitirVarios(resultados: [string, boolean][]) {
    this.onresult?.({
      resultIndex: 0,
      results: resultados.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })),
    })
  }

  /** Lo que hace Chrome Android tras un silencio aunque `continuous` sea true. */
  cerrarPorSilencio() {
    this.onerror?.({ error: 'no-speech' })
    this.onend?.()
  }
}

function instalarMotor() {
  ;(globalThis as unknown as Record<string, unknown>).SpeechRecognition = MotorFalso
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).SpeechRecognition
  delete (globalThis as unknown as Record<string, unknown>).webkitSpeechRecognition
  MotorFalso.ultimo = null
})

/** Reloj manual: el tiempo solo avanza cuando el test lo dice. */
function relojFalso() {
  let t = 0
  let id = 0
  const pendientes = new Map<number, { cuando: number; fn: () => void }>()
  return {
    fijar: (fn: () => void, ms: number) => {
      pendientes.set(++id, { cuando: t + ms, fn })
      return id
    },
    cancelar: (i: number) => void pendientes.delete(i),
    ahora: () => t,
    avanzar(ms: number) {
      t += ms
      for (const [i, p] of [...pendientes]) {
        if (p.cuando <= t) {
          pendientes.delete(i)
          p.fn()
        }
      }
    },
  }
}

describe('soporte', () => {
  it('sin motor en el navegador no hay dictado, y crearDictado no revienta', () => {
    expect(soporteDictado()).toBe(false)

    const onError = vi.fn()
    const onFin = vi.fn()
    const sesion = crearDictado({ onError, onFin })
    sesion.iniciar()
    sesion.parar()

    expect(onError).toHaveBeenCalledWith('sin-soporte')
    expect(onFin).toHaveBeenCalledWith('', 'error')
  })

  it('también se reconoce el motor con el prefijo de Chrome', () => {
    ;(globalThis as unknown as Record<string, unknown>).webkitSpeechRecognition = MotorFalso
    expect(soporteDictado()).toBe(true)
  })
})

describe('sesión de dictado', () => {
  it('escucha en continuo, en español y con provisionales', () => {
    instalarMotor()
    crearDictado({ reloj: relojFalso() }).iniciar()

    const motor = MotorFalso.ultimo!
    expect(motor.lang).toBe('es-ES')
    expect(motor.continuous).toBe(true)
    expect(motor.interimResults).toBe(true)
    expect(motor.maxAlternatives).toBe(1)
    expect(motor.arrancado).toBe(1)
  })

  it('un silencio de varios segundos no detiene la escucha: se relanza y no termina', () => {
    instalarMotor()
    const reloj = relojFalso()
    const onFin = vi.fn()
    crearDictado({ onFin, reloj }).iniciar()
    const motor = MotorFalso.ultimo!

    motor.emitir('David de cuarto A', true)
    reloj.avanzar(10_000)
    motor.cerrarPorSilencio()
    reloj.avanzar(10_000)
    motor.cerrarPorSilencio()

    expect(motor.arrancado).toBe(3)
    expect(onFin).not.toHaveBeenCalled()
  })

  it('acumula los tramos sin duplicar el último provisional ni la repetición de Android', () => {
    instalarMotor()
    const reloj = relojFalso()
    const textos: string[] = []
    const onFin = vi.fn()
    const sesion = crearDictado({ onTexto: (t) => textos.push(t), onFin, reloj })
    sesion.iniciar()
    const motor = MotorFalso.ultimo!

    // Tramo 1: provisional, luego final.
    motor.emitir('David de', false)
    motor.emitir('David de cuarto A', true)
    reloj.avanzar(5000)
    motor.cerrarPorSilencio()

    // Tramo 2: Chrome Android repite el final anterior dentro del siguiente.
    motor.emitirVarios([
      ['ha ayudado', true],
      ['ha ayudado a recoger', true],
    ])
    reloj.avanzar(5000)
    motor.cerrarPorSilencio()

    // Tramo 3: arranca repitiendo las dos últimas palabras del anterior.
    motor.emitir('a recoger el material', false)
    expect(textos[textos.length - 1]).toBe('David de cuarto A ha ayudado a recoger el material')

    sesion.parar()
    expect(onFin).toHaveBeenCalledTimes(1)
    expect(onFin).toHaveBeenCalledWith('David de cuarto A ha ayudado a recoger el material', 'parar')
  })

  it('solo «Parar» entrega el texto para procesar', () => {
    instalarMotor()
    const onFin = vi.fn()
    const sesion = crearDictado({ onFin, reloj: relojFalso() })
    sesion.iniciar()
    MotorFalso.ultimo!.emitir('Lucía del 4ºB no ha traído el chándal', true)
    MotorFalso.ultimo!.cerrarPorSilencio()
    expect(onFin).not.toHaveBeenCalled()

    sesion.parar()
    sesion.parar()
    expect(onFin).toHaveBeenCalledTimes(1)
    expect(onFin).toHaveBeenCalledWith('Lucía del 4ºB no ha traído el chándal', 'parar')
  })

  it('«Cancelar» termina sin texto y no relanza', () => {
    instalarMotor()
    const onFin = vi.fn()
    const sesion = crearDictado({ onFin, reloj: relojFalso() })
    sesion.iniciar()
    const motor = MotorFalso.ultimo!
    motor.emitir('David de cuarto A ha ayudado', true)

    sesion.cancelar()

    expect(onFin).toHaveBeenCalledTimes(1)
    expect(onFin).toHaveBeenCalledWith('', 'cancelar')
    expect(motor.abortado).toBe(1)
    expect(motor.arrancado).toBe(1)
  })

  it('a los 2 minutos sin pulsar nada se para y avisa, sin procesar', () => {
    instalarMotor()
    const reloj = relojFalso()
    const onFin = vi.fn()
    const onError = vi.fn()
    crearDictado({ onFin, onError, reloj }).iniciar()
    MotorFalso.ultimo!.emitir('David de cuarto A', true)

    reloj.avanzar(MS_LIMITE - 1)
    expect(onFin).not.toHaveBeenCalled()
    reloj.avanzar(1)

    expect(onError).toHaveBeenCalledWith('limite')
    expect(onFin).toHaveBeenCalledWith('David de cuarto A', 'limite')
  })

  it('el permiso denegado para sin relanzar, y lo explica', () => {
    instalarMotor()
    const onError = vi.fn()
    const onFin = vi.fn()
    crearDictado({ onError, onFin, reloj: relojFalso() }).iniciar()
    const motor = MotorFalso.ultimo!

    motor.onerror?.({ error: 'not-allowed' })
    motor.onend?.()

    expect(motor.arrancado).toBe(1)
    expect(onError).toHaveBeenCalledWith('sin-permiso')
    expect(onFin).toHaveBeenCalledWith('', 'error')
  })

  it('el error de red tampoco entra en bucle', () => {
    instalarMotor()
    const onError = vi.fn()
    crearDictado({ onError, reloj: relojFalso() }).iniciar()
    const motor = MotorFalso.ultimo!
    motor.onerror?.({ error: 'network' })
    motor.onend?.()
    expect(motor.arrancado).toBe(1)
    expect(onError).toHaveBeenCalledWith('red')
  })

  it('relanzamientos en ráfaga sin oír nada: se para en vez de girar para siempre', () => {
    instalarMotor()
    const onFin = vi.fn()
    crearDictado({ onFin, reloj: relojFalso() }).iniciar()
    const motor = MotorFalso.ultimo!
    for (let i = 0; i < 10; i++) motor.onend?.()
    expect(motor.arrancado).toBeLessThanOrEqual(6)
    expect(onFin).toHaveBeenCalledWith('', 'error')
  })

  it('iniciar con una sesión ya en marcha no abre una segunda', () => {
    instalarMotor()
    const sesion = crearDictado({ reloj: relojFalso() })
    sesion.iniciar()
    sesion.iniciar()
    expect(MotorFalso.ultimo!.arrancado).toBe(1)
  })

  it('cada motivo se explica, y el de permiso dice que se puede escribir', () => {
    expect(mensajeDeError('sin-permiso')).toMatch(/escribir/i)
    expect(mensajeDeError('sin-soporte')).toMatch(/escribe/i)
    expect(mensajeDeError('limite')).toMatch(/2 minutos/i)
    expect(mensajeDeError('red')).toMatch(/conexi[óo]n/i)
  })
})

describe('unirSinSolape', () => {
  it('une con un espacio', () => {
    expect(unirSinSolape('David de cuarto A', 'ha ayudado')).toBe('David de cuarto A ha ayudado')
  })
  it('quita el solape sin mirar tildes ni mayúsculas', () => {
    expect(unirSinSolape('no ha traído', 'No ha traido el chándal')).toBe('no ha traído el chándal')
  })
  it('una sola palabra repetida es énfasis, no duplicado', () => {
    expect(unirSinSolape('muy', 'muy bien')).toBe('muy muy bien')
  })
  it('un tramo repetido entero desaparece', () => {
    expect(unirSinSolape('ha ayudado a recoger', 'a recoger')).toBe('ha ayudado a recoger')
  })
})

