import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `db/sincro.ts` lee `localStorage` al importarse. En el entorno `node` de
 * Vitest no existe, y sin él `leerEstado()` devolvería siempre el estado
 * inicial: el test pasaría sin comprobar nada. Se monta antes que los imports
 * (`vi.hoisted` corre primero) para que el módulo lo encuentre puesto.
 */
vi.hoisted(() => {
  const almacen = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, String(v)),
    removeItem: (k: string) => void almacen.delete(k),
    clear: () => almacen.clear(),
    key: (i: number) => [...almacen.keys()][i] ?? null,
    get length() {
      return almacen.size
    },
  } as Storage

  // El marcado programa el debounce de subida con `window.setTimeout`. Aquí se
  // prueba el marcado, no el debounce: temporizadores de mentira, para no dejar
  // una subida colgando ocho segundos después de terminar el test. `reload` es
  // lo que hace `bajar` al terminar; aquí no hay página que recargar.
  globalThis.window = {
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    location: { reload: () => undefined },
  } as unknown as Window & typeof globalThis

  // El motor se para en seco si cree que no hay cobertura.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true, userAgent: 'Windows' },
  })
})

/**
 * Servidor de mentira. El motor no distingue: llama al mismo `firebase/firestore`
 * y a la misma `firestore()` de `lib/firebase`, solo que detrás hay un `Map`.
 */
vi.mock('firebase/firestore', async () => ({ ...(await import('../test/firestoreFalso')) }))
vi.mock('../lib/firebase', async (original) => ({
  ...(await original<typeof import('../lib/firebase')>()),
  firestore: () => Promise.resolve({}),
}))

import { sembrarCriterios, VERSION_SEMILLA_CRITERIOS } from './criterios'
import { guardarConfig, leerConfig } from './config'
import { db, nuevoId } from './db'
import {
  conflictoActual,
  ejecutar,
  observarEscrituras,
  olvidarSincro,
  resolverConLoLocal,
  resolverConLoRemoto,
} from './sincro'
import { sinMarcar } from './supresion'
import { leerEstado } from '../lib/sincroEstado'
import { useSincro } from '../store/sincro'
import { almacen, meta, reiniciarFirestoreFalso, romperParte } from '../test/firestoreFalso'
import type { Grupo } from './types'

/** Lo que hace el arranque de la app en cuanto a escrituras de sistema. */
async function arranque(): Promise<void> {
  observarEscrituras()
  await sembrarCriterios()
}

/** 24 caracteres base64url: la forma que exigen las reglas de `firestore.rules`. */
const ID_SINCRO = 'pruebaPruebaPruebaPrueba'
const PASSPHRASE = 'contrasena-de-prueba'

function grupo(nombre: string): Grupo {
  return {
    id: nuevoId(),
    cursoEscolarId: nuevoId(),
    nombre,
    etapa: 'primaria',
    nivel: 3,
    color: '#006A80',
    orden: 0,
    horario: [],
  }
}

describe('el arranque no inventa cambios que subir', () => {
  beforeEach(async () => {
    // Vaciar primero y olvidar después: los hooks ya están puestos desde el
    // test anterior y un `clear()` también es una escritura. `olvidarSincro`
    // y no `olvidarEstado` porque hay que limpiar también el espejo en memoria.
    await Promise.all(db.tables.map((t) => t.clear()))
    olvidarSincro()
  })

  /**
   * El fallo que este test existe para impedir: `sembrarCriterios` volcaba los
   * ~200 criterios en CADA arranque, los hooks de Dexie lo leían como trabajo
   * del maestro, y el otro dispositivo se encontraba un conflicto sin que nadie
   * hubiera tocado nada.
   */
  it('abrir la app dos veces sin tocar nada no deja cambios pendientes', async () => {
    await arranque()
    await arranque()

    expect(leerEstado().pendiente).toBe(false)
    expect(leerEstado().ultimaEscritura).toBeNull()
  })

  it('la primera siembra tampoco marca: sale del bundle, no del maestro', async () => {
    await arranque()

    expect(leerEstado().pendiente).toBe(false)
    expect(await db.criterios.count()).toBeGreaterThan(0)
  })

  it('la segunda siembra no escribe ni una fila', async () => {
    await arranque()
    const escrituras = vi.fn()
    db.criterios.hook('creating', escrituras)
    db.criterios.hook('updating', escrituras)
    db.criterios.hook('deleting', escrituras)

    await sembrarCriterios()

    expect(escrituras).not.toHaveBeenCalled()
  })

  it('deja anotada la versión de semilla para no volver a volcarla', async () => {
    await arranque()

    expect((await leerConfig()).semillaCriterios).toBe(VERSION_SEMILLA_CRITERIOS)
  })

  it('resiembra si la tabla se quedó vacía, aunque la marca esté puesta', async () => {
    await arranque()
    await db.criterios.clear()

    await sembrarCriterios()

    expect(await db.criterios.count()).toBeGreaterThan(0)
  })

  /**
   * La otra mitad del trato: si el marcado dejara de funcionar, el trabajo real
   * del maestro no se subiría nunca. Eso es peor que un conflicto de más.
   */
  it('un cambio de verdad del maestro sí se marca', async () => {
    await arranque()

    await db.grupos.add(grupo('3ºA'))

    expect(leerEstado().pendiente).toBe(true)
  })

  it('la supresión cae aunque la operación interna lance', async () => {
    await arranque()

    await expect(
      sinMarcar(() => {
        throw new Error('semilla rota')
      }),
    ).rejects.toThrow('semilla rota')

    await db.grupos.add(grupo('4ºB'))

    expect(leerEstado().pendiente).toBe(true)
  })
})

// ——————————————————————————— Bloque 2 ———————————————————————————

/**
 * Aquí ya hay servidor (de mentira, pero servidor): se sube, se baja y se
 * provoca un conflicto de verdad para comprobar lo que pasa cuando resolverlo
 * sale mal.
 */
describe('subir, bajar y resolver conflictos', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    olvidarSincro()
    reiniciarFirestoreFalso()
    useSincro.setState({ estado: 'apagado', detalle: undefined })
    await sinMarcar(() => guardarConfig({ sincro: { id: ID_SINCRO, passphrase: PASSPHRASE } }))
    await arranque()
  })

  /** Deja el servidor por delante y este dispositivo con trabajo propio. */
  async function provocarConflicto(): Promise<void> {
    await db.grupos.add(grupo('3ºA'))
    await ejecutar() // sube: el servidor queda en la versión 1

    // El otro dispositivo sube lo suyo. Basta con adelantar la versión: los
    // trozos siguen siendo legibles, que es lo que hace falta para poder bajar.
    almacen.set(`sync/${ID_SINCRO}`, { ...meta(ID_SINCRO)!, version: 2, dispositivo: 'Android' })

    // Y aquí se sigue trabajando, sin saberlo.
    await db.grupos.add(grupo('4ºB'))
    await ejecutar()
  }

  it('sube y deja la copia entera y legible en el servidor', async () => {
    await db.grupos.add(grupo('3ºA'))

    await ejecutar()

    expect(meta(ID_SINCRO)).toMatchObject({ version: 1, partes: 1 })
    expect(leerEstado().versionAplicada).toBe(1)
    expect(leerEstado().pendiente).toBe(false)
  })

  it('baja sin preguntar cuando el servidor va por delante y aquí no hay nada propio', async () => {
    await db.grupos.add(grupo('3ºA'))
    await ejecutar()

    // Simular un dispositivo que aún no ha visto esa versión.
    await db.grupos.clear()
    olvidarSincro()

    await ejecutar()

    expect(useSincro.getState().estado).toBe('sincronizado')
    expect(await db.grupos.count()).toBe(1)
  })

  it('para y pregunta cuando los dos lados han avanzado', async () => {
    await provocarConflicto()

    expect(useSincro.getState().estado).toBe('conflicto')
    expect(conflictoActual()?.meta.dispositivo).toBe('Android')
  })

  /**
   * El fallo del Bloque 2: la resolución limpiaba el estado ANTES de bajar y
   * sin `catch`. Si la bajada fallaba —copia incompleta, contraseña que no
   * abre, cobertura que se va— el dispositivo se quedaba sin la marca de
   * trabajo pendiente Y con el conflicto sin resolver.
   */
  it('un fallo al bajar deja el estado exactamente como estaba', async () => {
    await provocarConflicto()
    const antes = leerEstado()
    const gruposAntes = await db.grupos.count()
    romperParte(ID_SINCRO, 0)

    await expect(resolverConLoRemoto()).rejects.toThrow(/incompleta/i)

    expect(leerEstado()).toEqual(antes)
    expect(conflictoActual()).not.toBeNull()
    expect(await db.grupos.count()).toBe(gruposAntes)
  })

  it('un fallo al subir tampoco corrompe el estado', async () => {
    await provocarConflicto()
    const antes = leerEstado()
    const { almacen: mapa } = await import('../test/firestoreFalso')
    const romper = new Error('sin red')
    Object.defineProperty(romper, 'code', { value: 'unavailable' })
    const original = mapa.set.bind(mapa)
    mapa.set = () => {
      throw romper
    }

    try {
      await expect(resolverConLoLocal()).rejects.toThrow()
    } finally {
      mapa.set = original
    }

    expect(leerEstado()).toEqual(antes)
    expect(conflictoActual()).not.toBeNull()
  })

  it('resuelto con lo local, la copia de aquí queda por encima de la del servidor', async () => {
    await provocarConflicto()

    await resolverConLoLocal()

    expect(meta(ID_SINCRO)).toMatchObject({ version: 3 })
    expect(conflictoActual()).toBeNull()
    expect(leerEstado().conflicto).toBe(false)
    expect(leerEstado().pendiente).toBe(false)
  })

  it('resuelto con lo remoto, el conflicto se cierra solo al terminar la bajada', async () => {
    await provocarConflicto()

    await resolverConLoRemoto()

    expect(conflictoActual()).toBeNull()
    expect(leerEstado().conflicto).toBe(false)
    expect(leerEstado().versionAplicada).toBe(2)
  })
})
