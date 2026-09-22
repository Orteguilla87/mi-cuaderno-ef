import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearDictado, mensajeDeError, soporteDictado } from './dictado'

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

  abort() {}

  /** Simula lo que emite el motor: un tramo provisional y su versión definitiva. */
  emitir(texto: string, definitivo: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: Object.assign([Object.assign([{ transcript: texto }], { isFinal: definitivo })], {
        length: 1,
      }),
    })
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

describe('soporte', () => {
  it('sin motor en el navegador no hay dictado, y crearDictado no revienta', () => {
    expect(soporteDictado()).toBe(false)

    const onError = vi.fn()
    const onFin = vi.fn()
    const sesion = crearDictado({ onError, onFin })
    sesion.iniciar()
    sesion.detener()

    expect(onError).toHaveBeenCalledWith('sin-soporte')
    expect(onFin).toHaveBeenCalled()
  })

  it('también se reconoce el motor con el prefijo de Chrome', () => {
    ;(globalThis as unknown as Record<string, unknown>).webkitSpeechRecognition = MotorFalso
    expect(soporteDictado()).toBe(true)
  })
})

describe('sesión de dictado', () => {
  it('configura una orden por pulsación, en español y con parciales', () => {
    instalarMotor()
    crearDictado().iniciar()

    const motor = MotorFalso.ultimo!
    expect(motor.lang).toBe('es-ES')
    expect(motor.continuous).toBe(false)
    expect(motor.interimResults).toBe(true)
    expect(motor.maxAlternatives).toBe(1)
    expect(motor.arrancado).toBe(1)
  })

  it('emite los parciales y el final en orden', () => {
    instalarMotor()
    const parciales: string[] = []
    const finales: string[] = []
    crearDictado({ onParcial: (t) => parciales.push(t), onFinal: (t) => finales.push(t) }).iniciar()

    const motor = MotorFalso.ultimo!
    motor.emitir('cuarto a marta', false)
    motor.emitir('cuarto a marta un', false)
    motor.emitir('Cuarto A, Marta un positivo', true)

    expect(parciales).toEqual(['cuarto a marta', 'cuarto a marta un'])
    expect(finales).toEqual(['Cuarto A, Marta un positivo'])
  })

  it('detener dos veces no para el motor dos veces', () => {
    instalarMotor()
    const sesion = crearDictado()
    sesion.iniciar()
    sesion.detener()
    sesion.detener()

    expect(MotorFalso.ultimo!.parado).toBe(1)
  })

  it('iniciar con una sesión ya en marcha no abre una segunda', () => {
    instalarMotor()
    const sesion = crearDictado()
    sesion.iniciar()
    sesion.iniciar()

    expect(MotorFalso.ultimo!.arrancado).toBe(1)
  })

  it('el temporizador de guarda corta el silencio', () => {
    instalarMotor()
    let pendiente: (() => void) | null = null
    const reloj = {
      fijar: (fn: () => void) => {
        pendiente = fn
        return 1
      },
      cancelar: () => {
        pendiente = null
      },
    }

    const onFin = vi.fn()
    crearDictado({ onFin, reloj }).iniciar()
    expect(pendiente).not.toBeNull()

    pendiente!()
    expect(MotorFalso.ultimo!.parado).toBe(1)
    expect(onFin).toHaveBeenCalled()
  })

  it('el permiso denegado se traduce a «sin-permiso» y el estado vuelve', () => {
    instalarMotor()
    const onError = vi.fn()
    const onFin = vi.fn()
    crearDictado({ onError, onFin }).iniciar()

    MotorFalso.ultimo!.onerror?.({ error: 'not-allowed' })
    MotorFalso.ultimo!.onend?.()

    expect(onError).toHaveBeenCalledWith('sin-permiso')
    expect(onFin).toHaveBeenCalled()
  })

  it('cada motivo se explica, y el de permiso dice que se puede escribir', () => {
    expect(mensajeDeError('sin-permiso')).toMatch(/escribir/i)
    expect(mensajeDeError('sin-soporte')).toMatch(/escribe/i)
    expect(mensajeDeError('sin-habla')).toMatch(/no he o[íi]do/i)
    expect(mensajeDeError('red')).toMatch(/conexi[óo]n/i)
  })
})
