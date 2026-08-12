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
  // una subida colgando ocho segundos después de terminar el test.
  globalThis.window = {
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  } as unknown as Window & typeof globalThis
})

import { sembrarCriterios, VERSION_SEMILLA_CRITERIOS } from './criterios'
import { leerConfig } from './config'
import { db } from './db'
import { observarEscrituras, olvidarSincro } from './sincro'
import { sinMarcar } from './supresion'
import { leerEstado } from '../lib/sincroEstado'
import { nuevoId } from './db'

/** Lo que hace el arranque de la app en cuanto a escrituras de sistema. */
async function arranque(): Promise<void> {
  observarEscrituras()
  await sembrarCriterios()
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

    await db.grupos.add({
      id: nuevoId(),
      cursoEscolarId: nuevoId(),
      nombre: '3ºA',
      etapa: 'primaria',
      nivel: 3,
      color: '#006A80',
      orden: 0,
      horario: [],
    })

    expect(leerEstado().pendiente).toBe(true)
  })

  it('la supresión cae aunque la operación interna lance', async () => {
    await arranque()

    await expect(
      sinMarcar(() => {
        throw new Error('semilla rota')
      }),
    ).rejects.toThrow('semilla rota')

    await db.grupos.add({
      id: nuevoId(),
      cursoEscolarId: nuevoId(),
      nombre: '4ºB',
      etapa: 'primaria',
      nivel: 4,
      color: '#006A80',
      orden: 1,
      horario: [],
    })

    expect(leerEstado().pendiente).toBe(true)
  })
})
