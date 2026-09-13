import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { cambiosPosteriores, deshacerLote } from './lotes'
import {
  aplicarVolcado,
  crearUnidad,
  eliminarClase,
  generarCursoCompleto,
  importarUnidad,
  previsualizarEliminarClase,
  sesionesDeGrupo,
} from './planificador'
import { resumenSesion } from './sesiones'
import type { Sesion } from './types'

/**
 * Eliminar una sesión de la planificación: exactamente dos opciones.
 *  - «mover»: el contenido de la eliminada y de las siguientes avanza una
 *    sesión, y el desplazamiento se detiene en la primera sesión vacía.
 *  - «eliminar»: desaparece con su contenido y no se mueve nada más.
 * Ninguna crea sesiones ni toca el horario, y las dos se deshacen enteras.
 */

const CURSO_ID = 'curso1'
const GRUPO_ID = 'g1'

beforeEach(async () => {
  await db.cursos.put({
    id: CURSO_ID,
    nombre: '2026-2027',
    activo: true,
    inicio: '2026-09-07',
    fin: '2027-06-18',
    trimestres: [
      { n: 1, inicio: '2026-09-07', fin: '2026-12-22' },
      { n: 2, inicio: '2027-01-11', fin: '2027-03-18' },
      { n: 3, inicio: '2027-03-30', fin: '2027-06-18' },
    ],
    festivos: [],
    periodosNoLectivos: [],
  })
  await db.grupos.put({
    id: GRUPO_ID,
    cursoEscolarId: CURSO_ID,
    nombre: '3ºA',
    etapa: 'primaria',
    nivel: 3,
    color: '#006A80',
    orden: 0,
    horario: [
      { diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' },
      { diaSemana: 3, horaInicio: '11:00', horaFin: '11:45' },
    ],
  })
  await generarCursoCompleto(GRUPO_ID)
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

async function lista(): Promise<Sesion[]> {
  return sesionesDeGrupo(GRUPO_ID)
}

async function poner(s: Sesion, cambios: Partial<Sesion>) {
  await db.sesiones.update(s.id, cambios)
}

/** Estado completo de la planificación, en orden estable. */
async function foto() {
  const porId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id)
  return {
    sesiones: (await db.sesiones.toArray()).sort(porId),
    cancelaciones: (await db.clasesCanceladas.toArray()).sort(porId),
    grupo: await db.grupos.get(GRUPO_ID),
  }
}

describe('opción A — eliminar y mover a la derecha', () => {
  it('desplaza el contenido y se detiene en la primera sesión vacía', async () => {
    const s = await lista()
    await poner(s[0], { titulo: 'T0' })
    await poner(s[1], {
      titulo: 'T1',
      comentarios: 'Llevar petos',
      valoracion: 4,
      juegos: [{ gameId: 'j1', nombre: 'Pañuelo' }],
    })
    await poner(s[2], { titulo: 'T2', horaInicio: '11:15' })
    // s[3] vacía: aquí se detiene.
    await poner(s[4], { titulo: 'T4' })
    const total = await db.sesiones.count()

    const { previa } = await eliminarClase(s[1].id, 'mover')

    expect(await db.sesiones.get(s[1].id)).toBeUndefined()
    expect((await db.sesiones.get(s[0].id))?.titulo).toBe('T0')
    // Se mueve TODO el contenido, comentarios y valoración incluidos…
    expect(await db.sesiones.get(s[2].id)).toMatchObject({
      titulo: 'T1',
      comentarios: 'Llevar petos',
      valoracion: 4,
      juegos: [{ gameId: 'j1', nombre: 'Pañuelo' }],
      // …pero la clase sigue siendo la misma: su fecha, su franja y su hora.
      fecha: s[2].fecha,
      franjaInicio: s[2].franjaInicio,
      horaInicio: '11:15',
    })
    expect((await db.sesiones.get(s[3].id))?.titulo).toBe('T2')
    // Más allá de la vacía no cambia nada.
    expect(await db.sesiones.get(s[4].id)).toEqual({ ...s[4], titulo: 'T4' })

    expect(previa.movimientos.map((m) => [m.titulo, m.a.fecha])).toEqual([
      ['T1', s[2].fecha],
      ['T2', s[3].fecha],
    ])
    expect(previa.seDetieneEn).toEqual({ fecha: s[3].fecha, franja: s[3].franjaInicio })
    expect(previa.sinUbicacion).toBeNull()
    expect(await db.sesiones.count()).toBe(total - 1)
  })

  it('sin ninguna vacía por delante, avisa de qué contenido se queda sin ubicación', async () => {
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'UD final', nivel: 3, trimestre: null })
    const s = await lista()
    const n = s.length
    await poner(s[n - 3], { titulo: 'A', udId })
    await poner(s[n - 2], { titulo: 'B', udId })
    await poner(s[n - 1], { titulo: 'C', udId })
    const total = await db.sesiones.count()

    const previa = await previsualizarEliminarClase(s[n - 3].id, 'mover')
    expect(previa.sinUbicacion).toEqual({ titulo: 'C', unidad: 'UD final' })
    expect(previa.seDetieneEn).toBeNull()
    // La previa no escribe.
    expect(await db.sesiones.count()).toBe(total)

    await eliminarClase(s[n - 3].id, 'mover')
    expect((await db.sesiones.get(s[n - 2].id))?.titulo).toBe('A')
    expect((await db.sesiones.get(s[n - 1].id))?.titulo).toBe('B')
    // No se crea ninguna sesión para alojar «C».
    expect(await db.sesiones.count()).toBe(total - 1)
  })

  it('una sesión vacía no arrastra nada', async () => {
    const s = await lista()
    await poner(s[1], { titulo: 'T1' })
    const antes = await db.sesiones.get(s[1].id)

    const { previa } = await eliminarClase(s[0].id, 'mover')
    expect(previa.movimientos).toEqual([])
    expect(await db.sesiones.get(s[1].id)).toEqual(antes)
  })
})

describe('opción B — eliminar la sesión', () => {
  it('no mueve absolutamente nada', async () => {
    const s = await lista()
    for (let i = 0; i < 5; i++) await poner(s[i], { titulo: `T${i}` })
    const antes = (await foto()).sesiones.filter((x) => x.id !== s[2].id)

    const { previa } = await eliminarClase(s[2].id, 'eliminar')

    const despues = await foto()
    expect(despues.sesiones).toEqual(antes)
    expect(previa.movimientos).toEqual([])
    expect(despues.cancelaciones).toMatchObject([
      { grupoId: GRUPO_ID, fecha: s[2].fecha, horaInicio: s[2].franjaInicio },
    ])
  })
})

describe('ninguna opción crea sesiones ni toca el horario', () => {
  it.each(['mover', 'eliminar'] as const)('«%s»', async (modo) => {
    const s = await lista()
    for (let i = 0; i < 4; i++) await poner(s[i], { titulo: `T${i}` })
    const antes = await foto()

    await eliminarClase(s[1].id, modo)

    const despues = await foto()
    expect(despues.sesiones).toHaveLength(antes.sesiones.length - 1)
    const idsAntes = new Set(antes.sesiones.map((x) => x.id))
    expect(despues.sesiones.every((x) => idsAntes.has(x.id))).toBe(true)
    expect(despues.grupo).toEqual(antes.grupo)
  })

  it('regenerar el curso vuelve a crear la clase eliminada, vacía', async () => {
    const s = await lista()
    await poner(s[0], { titulo: 'T0' })
    await eliminarClase(s[0].id, 'eliminar')

    const { resultado } = await generarCursoCompleto(GRUPO_ID)
    expect(resultado.creadas).toBe(1)
    expect(resultado.recuperadas).toBe(1)
    const recuperada = (await lista()).find(
      (x) => x.fecha === s[0].fecha && x.franjaInicio === s[0].franjaInicio,
    )
    expect(recuperada?.titulo).toBe('')
    expect(await db.clasesCanceladas.count()).toBe(0)
  })
})

describe('deshacer restaura el estado exacto', () => {
  it.each(['mover', 'eliminar'] as const)('tras «%s»', async (modo) => {
    const s = await lista()
    for (let i = 0; i < 6; i++) await poner(s[i], { titulo: `T${i}`, notas: `n${i}` })
    const antes = await foto()

    const { lote } = await eliminarClase(s[2].id, modo)
    expect(await foto()).not.toEqual(antes)

    await deshacerLote(lote)
    expect(await foto()).toEqual(antes)
  })

  it('tras un volcado', async () => {
    const { id: udId } = await importarUnidad({
      etapa: 'primaria',
      nivel: 3,
      titulo: 'Volteretas',
      sesiones: ['Uno', 'Dos', 'Tres'].map((titulo) => ({
        titulo,
        descripcion: '',
        recursos: [],
        enlacesYNotas: '',
      })),
    })
    const antes = await foto()
    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })
    expect(r.lote.tipo).toBe('volcado')

    await deshacerLote(r.lote)
    expect(await foto()).toEqual(antes)
  })

  it('cuenta las sesiones que cambiaron después, para avisar', async () => {
    const s = await lista()
    for (let i = 0; i < 3; i++) await poner(s[i], { titulo: `T${i}` })
    const { lote } = await eliminarClase(s[0].id, 'mover')
    expect(await cambiosPosteriores(lote)).toBe(0)

    await poner(s[1], { notas: 'Retocada a mano' })
    expect(await cambiosPosteriores(lote)).toBe(1)
  })
})

describe('aviso de datos registrados', () => {
  it('cuenta asistencia, observaciones y calificaciones de la clase antes de confirmar', async () => {
    const s = await lista()
    const fecha = s[0].fecha
    await db.alumnos.put({
      id: 'a1',
      grupoId: GRUPO_ID,
      nombre: 'Ana',
      apellidos: 'Pérez',
      alias: '',
      activo: true,
    } as never)
    await db.asistencias.put({ id: 'as1', alumnoId: 'a1', fecha, estado: 'presente', chandal: true })
    await db.observaciones.put({
      id: 'o1',
      alumnoId: 'a1',
      grupoId: GRUPO_ID,
      fecha,
      tipo: 'conducta',
      signo: '+',
      texto: 'Ayuda a recoger',
      tags: [],
    } as never)
    await db.columnas.put({
      id: 'col1',
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Circuito',
      tipo: 'numero',
      orden: 0,
      fecha,
      pesoUd: 0,
    } as never)
    await db.valores.put({ id: 'v1', columnaId: 'col1', alumnoId: 'a1', numero: 7, actualizado: 0 })

    expect(await resumenSesion(s[0].id)).toMatchObject({
      asistencias: 1,
      observaciones: 1,
      calificaciones: 1,
    })

    // Y eliminar no los borra.
    await eliminarClase(s[0].id, 'eliminar')
    expect(await db.asistencias.count()).toBe(1)
    expect(await db.observaciones.count()).toBe(1)
    expect(await db.valores.count()).toBe(1)
  })
})
