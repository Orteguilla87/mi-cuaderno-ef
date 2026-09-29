import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { crearColumna, guardarValor } from './cuaderno'
import { trasMarcarColumna } from '../lib/avanceCalificacion'

/**
 * El recorrido tal como lo hace la vista: cada marca se escribe al momento
 * (la pantalla puede bloquearse a mitad), y «saltar» solo mueve el índice.
 */
const ALUMNOS = ['a1', 'a2', 'a3']

async function leer(columnaId: string, alumnoId: string) {
  return db.valores.where('[columnaId+alumnoId]').equals([columnaId, alumnoId]).first()
}

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('recorrido de calificación', () => {
  it('cada marca persiste de inmediato, sin esperar a cerrar', async () => {
    const col = await crearColumna({ grupoId: 'g1', trimestre: 1, titulo: 'Salto', tipo: 'numero' })
    await guardarValor(col, 'a1', { numero: 7 })
    // Sin cerrar nada: ya está en la base.
    expect((await leer(col, 'a1'))?.numero).toBe(7)
  })

  it('saltar deja la celda SIN dato, no en cero', async () => {
    const col = await crearColumna({ grupoId: 'g1', trimestre: 1, titulo: 'Salto', tipo: 'numero' })
    let i = 0
    await guardarValor(col, ALUMNOS[i], { numero: 6 })
    const tras = trasMarcarColumna(i, ALUMNOS.length, true)
    expect(tras).toEqual({ tipo: 'ir', a: 1 })
    i = 1
    // Saltar: se avanza sin escribir.
    i = i + 1
    await guardarValor(col, ALUMNOS[i], { numero: 8 })

    expect(await leer(col, 'a2')).toBeUndefined()
    expect((await leer(col, 'a3'))?.numero).toBe(8)
  })
})
