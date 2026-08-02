import { describe, expect, it } from 'vitest'
import {
  decidir,
  esperaTrasFallo,
  ESPERAS_REINTENTO,
  huella,
  nombreDispositivo,
  reensamblar,
  trocear,
  type EstadoLocal,
  type MetaRemota,
} from './sincro'
import { errorIdSincro, idSincroValido, nuevoIdSincro } from './firebase'

function meta(version: number): MetaRemota {
  return {
    version,
    partes: 1,
    bytes: 10,
    esquema: 14,
    creado: '2026-08-02T10:00:00.000Z',
    dispositivo: 'Android',
  }
}

// Dispositivo que ya sincronizó alguna vez: la base tiene datos, claro, pero
// eso ya no decide nada.
const limpio: EstadoLocal = { versionAplicada: 3, pendiente: false, baseConDatos: true }
const sucio: EstadoLocal = { versionAplicada: 3, pendiente: true, baseConDatos: true }

describe('decidir', () => {
  it('sin nada en el servidor, sube solo si hay algo que subir', () => {
    expect(decidir(null, limpio)).toBe('nada')
    expect(decidir(null, sucio)).toBe('subir')
  })

  it('con el servidor a la par, no toca nada salvo que haya cambios locales', () => {
    expect(decidir(meta(3), limpio)).toBe('nada')
    expect(decidir(meta(3), sucio)).toBe('subir')
  })

  it('si el servidor va por delante y aquí no hay nada pendiente, baja', () => {
    expect(decidir(meta(4), limpio)).toBe('bajar')
  })

  it('si los dos avanzaron, se para: nunca fusiona ni elige por su cuenta', () => {
    expect(decidir(meta(4), sucio)).toBe('conflicto')
  })

  it('un servidor que se quedó atrás no arrastra a este dispositivo hacia atrás', () => {
    // Puede pasar tras resolver un conflicto a favor de lo local.
    expect(decidir(meta(2), limpio)).toBe('nada')
    expect(decidir(meta(2), sucio)).toBe('subir')
  })
})

describe('decidir — primera sincronización de un dispositivo', () => {
  const nuevoVacio: EstadoLocal = { versionAplicada: 0, pendiente: false, baseConDatos: false }
  const nuevoConDatos: EstadoLocal = { versionAplicada: 0, pendiente: false, baseConDatos: true }

  it('un dispositivo nuevo y vacío se trae la copia sin molestar', () => {
    expect(decidir(meta(1), nuevoVacio)).toBe('bajar')
  })

  it('un dispositivo que ya tenía datos NO se sobrescribe solo', () => {
    // El caso que costaba un curso entero: esos datos son anteriores a que
    // existiera la sincronización, así que nunca se marcaron como pendientes.
    expect(decidir(meta(1), nuevoConDatos)).toBe('conflicto')
  })

  it('con el servidor vacío no hay conflicto: sube, aunque nada esté marcado como pendiente', () => {
    // Estrenar la sincronización tiene que poner a salvo lo que ya hay. Sin
    // esto no subiría nada hasta el siguiente cambio, y el maestro se creería
    // respaldado sin estarlo.
    expect(decidir(null, nuevoConDatos)).toBe('subir')
    expect(decidir(null, { ...nuevoConDatos, pendiente: true })).toBe('subir')
  })

  it('un dispositivo nuevo y vacío con el servidor vacío no inventa una subida', () => {
    expect(decidir(null, nuevoVacio)).toBe('nada')
  })

  it('la regla solo mira la PRIMERA vez: después manda la versión', () => {
    expect(decidir(meta(4), { versionAplicada: 3, pendiente: false, baseConDatos: true })).toBe(
      'bajar',
    )
  })

  it('resuelto una vez, no vuelve a saltar', () => {
    // Tras quedarse con lo remoto, `versionAplicada` deja de ser 0.
    expect(decidir(meta(1), { versionAplicada: 1, pendiente: false, baseConDatos: true })).toBe(
      'nada',
    )
  })
})

describe('esperaTrasFallo', () => {
  it('crece con los fallos seguidos y se detiene en el tope', () => {
    expect(ESPERAS_REINTENTO.map((_, i) => esperaTrasFallo(i + 1))).toEqual([...ESPERAS_REINTENTO])
    expect(esperaTrasFallo(99)).toBe(ESPERAS_REINTENTO[ESPERAS_REINTENTO.length - 1])
  })

  it('el primer fallo no espera más de lo razonable', () => {
    expect(esperaTrasFallo(1)).toBe(30_000)
    // Un contador a cero (o negativo por lo que sea) no debe dar 0 ms: sería
    // un reintento inmediato en bucle.
    expect(esperaTrasFallo(0)).toBe(30_000)
    expect(esperaTrasFallo(-5)).toBe(30_000)
  })
})

describe('trocear y reensamblar', () => {
  const original = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256))

  it('deja el fichero igual cuando cabe en una parte', () => {
    const partes = trocear(original, 1000)
    expect(partes).toHaveLength(1)
    expect(reensamblar(partes)).toEqual(original)
  })

  it('reconstruye byte a byte con varias partes', () => {
    const partes = trocear(original, 300)
    expect(partes.map((p) => p.length)).toEqual([300, 300, 300, 100])
    expect(reensamblar(partes)).toEqual(original)
  })

  it('la última parte no se rellena', () => {
    const partes = trocear(new Uint8Array(5), 2)
    expect(partes.map((p) => p.length)).toEqual([2, 2, 1])
  })

  it('un fichero vacío da una parte vacía, no cero partes', () => {
    // Cero partes sería indistinguible de «no hay nada subido».
    expect(trocear(new Uint8Array(0))).toHaveLength(1)
  })

  it('rechaza un tamaño de parte imposible en vez de colgarse', () => {
    expect(() => trocear(original, 0)).toThrow(RangeError)
  })
})

describe('huella', () => {
  it('el mismo contenido da la misma huella', async () => {
    const a = await huella(new Uint8Array([1, 2, 3]))
    const b = await huella(new Uint8Array([1, 2, 3]))
    expect(a).toBe(b)
  })

  it('un solo byte distinto cambia la huella', async () => {
    const a = await huella(new Uint8Array([1, 2, 3]))
    const b = await huella(new Uint8Array([1, 2, 4]))
    expect(a).not.toBe(b)
  })
})

describe('identificador de sincronización', () => {
  it('el generado siempre vale', () => {
    for (let i = 0; i < 50; i++) {
      const id = nuevoIdSincro()
      expect(id).toHaveLength(26)
      expect(idSincroValido(id)).toBe(true)
      expect(errorIdSincro(id)).toBeNull()
    }
  })

  it('no se repite', () => {
    const generados = new Set(Array.from({ length: 200 }, () => nuevoIdSincro()))
    expect(generados.size).toBe(200)
  })

  it('rechaza lo que un servidor no debería aceptar', () => {
    expect(idSincroValido('')).toBe(false)
    expect(idSincroValido('a'.repeat(23))).toBe(false)
    expect(idSincroValido('a'.repeat(65))).toBe(false)
    // Nada de barras: partirían la ruta del documento en Firestore.
    expect(idSincroValido('a'.repeat(20) + '/etc')).toBe(false)
    expect(idSincroValido('a'.repeat(20) + '.doc')).toBe(false)
    expect(idSincroValido('cuaderno de carlos aaaaaa')).toBe(false)
  })

  it('acepta justo el mínimo y el máximo', () => {
    expect(idSincroValido('a'.repeat(24))).toBe(true)
    expect(idSincroValido('a'.repeat(64))).toBe(true)
  })

  it('explica el motivo concreto del rechazo', () => {
    expect(errorIdSincro('')).toMatch(/genera/i)
    expect(errorIdSincro('corto')).toMatch(/corto/i)
    expect(errorIdSincro('a'.repeat(65))).toMatch(/largo/i)
    expect(errorIdSincro('con espacios y acentuación aquí')).toMatch(/letras/i)
  })
})

describe('nombreDispositivo', () => {
  it('distingue el móvil del ordenador', () => {
    expect(nombreDispositivo('Mozilla/5.0 (Linux; Android 14) Chrome/126')).toBe('Android')
    expect(nombreDispositivo('Mozilla/5.0 (Windows NT 10.0) Chrome/126')).toBe('Windows')
    expect(nombreDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone o iPad')
  })

  it('no se queda sin respuesta ante un agente desconocido', () => {
    expect(nombreDispositivo('algo raro')).toBe('Otro dispositivo')
  })
})
