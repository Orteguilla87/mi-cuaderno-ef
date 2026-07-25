import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { estadoCiclo, reiniciarCiclo, siguienteAleatorio } from './aleatorio'
import { db } from './db'
import type { Alumno } from './types'
import { aISO } from '../lib/fechas'

const GRUPO = 'grupo-aleatorio'

function alumno(id: string, activo = true): Alumno {
  return { id, grupoId: GRUPO, nombre: id, apellidos: '', alias: id, activo }
}

async function vaciarBase() {
  await db.transaction('rw', db.tables, async () => {
    for (const tabla of db.tables) await tabla.clear()
  })
}

beforeEach(vaciarBase)
afterEach(vaciarBase)

describe('siguienteAleatorio', () => {
  it('no repite ningún alumno hasta agotar el ciclo', async () => {
    const alumnos = ['a', 'b', 'c', 'd'].map((id) => alumno(id))
    await db.alumnos.bulkAdd(alumnos)

    const salidos: string[] = []
    for (let i = 0; i < alumnos.length; i++) {
      const r = await siguienteAleatorio(GRUPO, { soloPresentes: false })
      expect(r.elegido).not.toBeNull()
      salidos.push(r.elegido!.id)
    }

    expect(new Set(salidos).size).toBe(alumnos.length)
  })

  it('marca agotado y no elige a nadie más al llegar al final', async () => {
    await db.alumnos.bulkAdd([alumno('a'), alumno('b')])

    await siguienteAleatorio(GRUPO, { soloPresentes: false })
    const ultimo = await siguienteAleatorio(GRUPO, { soloPresentes: false })
    expect(ultimo.agotado).toBe(true)

    const sinCandidatos = await siguienteAleatorio(GRUPO, { soloPresentes: false })
    expect(sinCandidatos.elegido).toBeNull()
  })

  it('reiniciarCiclo permite volver a sortear a todos', async () => {
    await db.alumnos.bulkAdd([alumno('a'), alumno('b')])
    await siguienteAleatorio(GRUPO, { soloPresentes: false })
    await siguienteAleatorio(GRUPO, { soloPresentes: false })

    await reiniciarCiclo(GRUPO)
    const estado = await estadoCiclo(GRUPO)
    expect(estado.yaSalieron).toBe(0)
    expect(estado.agotado).toBe(false)
  })

  it('con "solo presentes" solo elige entre los marcados presente o retraso', async () => {
    await db.alumnos.bulkAdd([alumno('a'), alumno('b'), alumno('c')])
    await db.asistencias.bulkAdd([
      { id: 'as-1', alumnoId: 'a', fecha: aISO(), estado: 'falta', chandal: false },
      { id: 'as-2', alumnoId: 'b', fecha: aISO(), estado: 'presente', chandal: true },
    ])
    // 'c' no tiene registro todavía: con pase de lista ya empezado, no cuenta como presente.

    const r = await siguienteAleatorio(GRUPO, { soloPresentes: true })
    expect(r.elegido?.id).toBe('b')
  })

  it('sin pase de lista hoy, "solo presentes" no excluye a nadie', async () => {
    await db.alumnos.bulkAdd([alumno('a')])
    const r = await siguienteAleatorio(GRUPO, { soloPresentes: true })
    expect(r.elegido?.id).toBe('a')
  })

  it('ignora a los alumnos inactivos', async () => {
    await db.alumnos.bulkAdd([alumno('a'), alumno('b', false)])
    const estado = await estadoCiclo(GRUPO)
    expect(estado.total).toBe(1)
  })
})
