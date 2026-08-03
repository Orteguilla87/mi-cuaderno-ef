import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, nuevoId } from './db'
import {
  eliminarSesionesNoLectivas,
  getSesiones,
  huecosDe,
  reubicarSesionesNoLectivas,
  sesionesEnDiasNoLectivos,
} from './sesiones'

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
    festivos: ['2026-10-12'], // lunes, festivo suelto
    periodosNoLectivos: [
      { nombre: 'Vacaciones de Navidad', inicio: '2026-12-23', fin: '2027-01-10' },
    ],
  })
  await db.grupos.put({
    id: GRUPO_ID,
    cursoEscolarId: CURSO_ID,
    nombre: '3ºA',
    etapa: 'primaria',
    nivel: 3,
    color: '#006A80',
    orden: 0,
    // Martes, único día de clase de este grupo.
    horario: [{ diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' }],
  })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('getSesiones', () => {
  it('devuelve una sesión persistida dentro del rango, y deja de hacerlo al borrarla', async () => {
    const id = nuevoId()
    await db.sesiones.put({
      id,
      grupoId: GRUPO_ID,
      fecha: '2026-09-08', // martes lectivo
      titulo: 'Bote y conducción',
      juegos: [],
      notas: '',
      recursos: [],
    })

    const antes = await getSesiones({ desde: '2026-09-07', hasta: '2026-09-11' })
    expect(antes).toHaveLength(1)
    expect(antes[0].sesion.id).toBe(id)
    expect(antes[0].grupo.id).toBe(GRUPO_ID)
    expect(antes[0].horaInicio).toBe('10:00') // hora de la franja, la sesión no trae la suya

    await db.sesiones.delete(id)
    const despues = await getSesiones({ desde: '2026-09-07', hasta: '2026-09-11' })
    expect(despues).toHaveLength(0)
  })

  it('no devuelve nada en un rango íntegramente fuera del periodo lectivo', async () => {
    await db.sesiones.put({
      id: nuevoId(),
      grupoId: GRUPO_ID,
      fecha: '2026-08-04', // antes del inicio de curso
      titulo: 'Fantasma',
      juegos: [],
      notas: '',
      recursos: [],
    })
    const resultado = await getSesiones({ desde: '2026-08-01', hasta: '2026-08-07' })
    expect(resultado).toEqual([])
  })

  it('una sesión en festivo o en periodo no lectivo no aparece, pero sigue guardada', async () => {
    const idFestivo = nuevoId()
    const idPeriodo = nuevoId()
    await db.sesiones.bulkPut([
      {
        id: idFestivo,
        grupoId: GRUPO_ID,
        fecha: '2026-10-12', // festivo suelto
        titulo: 'En festivo',
        juegos: [],
        notas: '',
        recursos: [],
      },
      {
        id: idPeriodo,
        grupoId: GRUPO_ID,
        fecha: '2026-12-29', // dentro de Vacaciones de Navidad
        titulo: 'En Navidad',
        juegos: [],
        notas: '',
        recursos: [],
      },
    ])

    const enRango = await getSesiones({ desde: '2026-10-01', hasta: '2027-01-05' })
    expect(enRango.map((r) => r.sesion.id)).not.toContain(idFestivo)
    expect(enRango.map((r) => r.sesion.id)).not.toContain(idPeriodo)

    // Nada se ha borrado: siguen en la base.
    expect(await db.sesiones.get(idFestivo)).toBeDefined()
    expect(await db.sesiones.get(idPeriodo)).toBeDefined()
  })

  it('filtra por grupo cuando se pide', async () => {
    const otroGrupo = nuevoId()
    await db.grupos.put({
      id: otroGrupo,
      cursoEscolarId: CURSO_ID,
      nombre: '3ºB',
      etapa: 'primaria',
      nivel: 3,
      color: '#CE184B',
      orden: 1,
      horario: [{ diaSemana: 2, horaInicio: '11:00', horaFin: '11:45' }],
    })
    await db.sesiones.bulkPut([
      { id: nuevoId(), grupoId: GRUPO_ID, fecha: '2026-09-08', titulo: 'A', juegos: [], notas: '', recursos: [] },
      { id: nuevoId(), grupoId: otroGrupo, fecha: '2026-09-08', titulo: 'B', juegos: [], notas: '', recursos: [] },
    ])
    const soloA = await getSesiones({ desde: '2026-09-07', hasta: '2026-09-11', grupoId: GRUPO_ID })
    expect(soloA).toHaveLength(1)
    expect(soloA[0].grupo.id).toBe(GRUPO_ID)
  })
})

describe('huecosDe', () => {
  it('da un hueco por franja de horario en cada día lectivo del rango', async () => {
    const huecos = await huecosDe({ desde: '2026-09-07', hasta: '2026-09-11' })
    // Solo el martes tiene franja para este grupo.
    expect(huecos).toHaveLength(1)
    expect(huecos[0]).toMatchObject({ fecha: '2026-09-08', diaSemana: 2, horaInicio: '10:00' })
    expect(huecos[0].sesion).toBeUndefined()
  })

  it('no ofrece huecos en festivos ni en periodos no lectivos', async () => {
    // Martes 13/10 cae justo tras el festivo del 12/10 (lunes); comprobamos
    // que el propio festivo no genera hueco aunque tuviera franja ese día.
    const grupoMartesYLunes = nuevoId()
    await db.grupos.put({
      id: grupoMartesYLunes,
      cursoEscolarId: CURSO_ID,
      nombre: '4ºA',
      etapa: 'primaria',
      nivel: 4,
      color: '#ABB200',
      orden: 1,
      horario: [{ diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' }], // lunes
    })
    const huecos = await huecosDe({
      desde: '2026-10-12',
      hasta: '2026-10-12',
      grupoId: grupoMartesYLunes,
    })
    expect(huecos).toHaveLength(0)
  })

  it('una sesión movida a un día sin franja de horario se sigue ofreciendo', async () => {
    const id = nuevoId()
    // El grupo solo tiene franja los martes; esta sesión se movió a un jueves.
    await db.sesiones.put({
      id,
      grupoId: GRUPO_ID,
      fecha: '2026-09-10', // jueves, sin franja
      titulo: 'Movida a mano',
      juegos: [],
      notas: '',
      recursos: [],
      horaInicio: '12:00',
      horaFin: '12:45',
    })
    const huecos = await huecosDe({ desde: '2026-09-07', hasta: '2026-09-11' })
    const movida = huecos.find((h) => h.sesion?.id === id)
    expect(movida).toBeDefined()
    expect(movida).toMatchObject({ fecha: '2026-09-10', horaInicio: '12:00' })
  })
})

describe('sesionesEnDiasNoLectivos', () => {
  it('lista las sesiones huérfanas sin borrarlas ni moverlas', async () => {
    const id = nuevoId()
    await db.sesiones.put({
      id,
      grupoId: GRUPO_ID,
      fecha: '2026-12-29', // Navidad
      titulo: 'Huérfana',
      juegos: [],
      notas: '',
      recursos: [],
    })
    const huerfanas = await sesionesEnDiasNoLectivos()
    expect(huerfanas).toHaveLength(1)
    expect(huerfanas[0].sesion.id).toBe(id)
    expect(huerfanas[0].estado.tipo).toBe('periodo')
    expect(await db.sesiones.get(id)).toBeDefined() // sigue existiendo, tal cual
  })
})

describe('reubicarSesionesNoLectivas y eliminarSesionesNoLectivas', () => {
  it('reubica a la siguiente clase libre del grupo, y el Deshacer la devuelve a su sitio', async () => {
    const id = nuevoId()
    await db.sesiones.put({
      id,
      grupoId: GRUPO_ID,
      fecha: '2026-12-29', // Navidad, huérfana
      titulo: 'Reubicable',
      juegos: [],
      notas: '',
      recursos: [],
    })

    const { reubicadas, sinHueco, deshacer } = await reubicarSesionesNoLectivas([id])
    expect(reubicadas).toBe(1)
    expect(sinHueco).toBe(0)
    const movida = await db.sesiones.get(id)
    expect(movida!.fecha).not.toBe('2026-12-29')
    expect(movida!.fecha > '2026-12-29').toBe(true)

    await deshacer()
    expect((await db.sesiones.get(id))!.fecha).toBe('2026-12-29')
  })

  it('elimina en bloque y el Deshacer las restaura', async () => {
    const id = nuevoId()
    await db.sesiones.put({
      id,
      grupoId: GRUPO_ID,
      fecha: '2026-12-29',
      titulo: 'Para borrar',
      juegos: [],
      notas: '',
      recursos: [],
    })

    const { eliminadas, deshacer } = await eliminarSesionesNoLectivas([id])
    expect(eliminadas).toBe(1)
    expect(await db.sesiones.get(id)).toBeUndefined()

    await deshacer()
    expect(await db.sesiones.get(id)).toBeDefined()
  })
})
