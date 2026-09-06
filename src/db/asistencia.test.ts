import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, nuevoId } from './db'
import {
  alternarChandal,
  ciclarEstado,
  leerAsistenciaGrupo,
  marcarTodosPresentes,
  type FranjaAsistencia,
} from './asistencia'
import type { Alumno } from './types'

const GRUPO_ID = 'g1'
const MARTES = '2026-09-08'

/** Las dos clases del grupo ese martes: 10:00 y 12:30. */
const PRIMERA: FranjaAsistencia = { inicio: '10:00', primera: true }
const SEGUNDA: FranjaAsistencia = { inicio: '12:30', primera: false }

let alumnos: Alumno[]

beforeEach(async () => {
  alumnos = ['Ana', 'Beto', 'Cira'].map((nombre, i) => ({
    id: `a${i}`,
    grupoId: GRUPO_ID,
    nombre,
    apellidos: 'Ruiz',
    alias: nombre,
    activo: true,
  }))
  await db.alumnos.bulkPut(alumnos)
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

const ids = () => alumnos.map((a) => a.id)

/**
 * El fallo grave del bug de las dos clases: la asistencia iba por
 * `alumnoId+fecha`, así que pasar lista en la segunda clase del día
 * SOBRESCRIBÍA la de la primera. Pérdida de datos, no una molestia visual.
 */
describe('dos clases del mismo grupo el mismo día', () => {
  it('pasar lista en la segunda no altera la asistencia de la primera', async () => {
    await marcarTodosPresentes(alumnos, MARTES, PRIMERA)
    await ciclarEstado('a1', MARTES, PRIMERA) // Beto falta a primera hora

    await marcarTodosPresentes(alumnos, MARTES, SEGUNDA)

    const primera = await leerAsistenciaGrupo(ids(), MARTES, PRIMERA)
    const segunda = await leerAsistenciaGrupo(ids(), MARTES, SEGUNDA)

    expect(primera.get('a1')!.estado).toBe('falta')
    expect(segunda.get('a1')!.estado).toBe('presente')
    // Son registros distintos, no el mismo leído dos veces.
    expect(primera.get('a1')!.id).not.toBe(segunda.get('a1')!.id)
    expect(await db.asistencias.where('fecha').equals(MARTES).count()).toBe(6)
  })

  it('el chándal de una clase no toca el de la otra', async () => {
    await marcarTodosPresentes(alumnos, MARTES, PRIMERA)
    await marcarTodosPresentes(alumnos, MARTES, SEGUNDA)

    await alternarChandal('a0', MARTES, SEGUNDA)

    const primera = await leerAsistenciaGrupo(ids(), MARTES, PRIMERA)
    const segunda = await leerAsistenciaGrupo(ids(), MARTES, SEGUNDA)
    expect(primera.get('a0')!.chandal).toBe(true)
    expect(segunda.get('a0')!.chandal).toBe(false)
  })

  it('deshacer en la segunda deja intacta la primera', async () => {
    await marcarTodosPresentes(alumnos, MARTES, PRIMERA)
    const deshacer = await marcarTodosPresentes(alumnos, MARTES, SEGUNDA)
    await deshacer()

    expect((await leerAsistenciaGrupo(ids(), MARTES, PRIMERA)).size).toBe(3)
    expect((await leerAsistenciaGrupo(ids(), MARTES, SEGUNDA)).size).toBe(0)
  })

  it('un registro anterior a v24, sin franja, pertenece a la primera clase', async () => {
    await db.asistencias.put({
      id: nuevoId(),
      alumnoId: 'a0',
      fecha: MARTES,
      estado: 'justificada',
      chandal: false,
    })

    expect((await leerAsistenciaGrupo(ids(), MARTES, PRIMERA)).get('a0')!.estado).toBe('justificada')
    expect((await leerAsistenciaGrupo(ids(), MARTES, SEGUNDA)).get('a0')).toBeUndefined()

    // Y ciclar sobre él lo ACTUALIZA, no crea un duplicado.
    await ciclarEstado('a0', MARTES, PRIMERA)
    expect(await db.asistencias.where('fecha').equals(MARTES).count()).toBe(1)
    expect((await leerAsistenciaGrupo(ids(), MARTES, PRIMERA)).get('a0')!.estado).toBe('presente')
  })
})

/** Un grupo con una sola clase al día tiene que comportarse igual que antes. */
describe('una sola clase al día', () => {
  const UNICA: FranjaAsistencia = { inicio: '10:00', primera: true }

  it('escribe y lee como siempre, y sin franja se ve lo mismo', async () => {
    await marcarTodosPresentes(alumnos, MARTES, UNICA)
    await ciclarEstado('a2', MARTES, UNICA)

    expect((await leerAsistenciaGrupo(ids(), MARTES, UNICA)).get('a2')!.estado).toBe('falta')
    // Sin franja (ficha de alumno, informes): se ven todos los registros.
    expect((await leerAsistenciaGrupo(ids(), MARTES)).size).toBe(3)
    expect(await db.asistencias.where('fecha').equals(MARTES).count()).toBe(3)
  })
})
