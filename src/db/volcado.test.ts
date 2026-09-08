import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  aplicarUnidadAGrupo,
  aplicarVolcado,
  crearSesion,
  generarCursoCompleto,
  importarUnidad,
  previsualizarVolcado,
} from './planificador'
import type { FranjaHorario } from './types'

/**
 * Volcar una unidad a un grupo. El fallo que motiva estas pruebas: en un grupo
 * con el curso ya generado, el volcado saltaba TODOS los huecos por «ocupados»
 * salvo las segundas franjas del día —las únicas que la migración v24 no había
 * marcado—, y la unidad caía a razón de una sesión por semana.
 */

const CURSO_ID = 'curso1'
const GRUPO_ID = 'g1'

/** Lunes 09:00, martes 10:00 y 12:30 (día doble), jueves 11:00. */
const HORARIO_CUATRO: FranjaHorario[] = [
  { diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' },
  { diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' },
  { diaSemana: 2, horaInicio: '12:30', horaFin: '13:15' },
  { diaSemana: 4, horaInicio: '11:00', horaFin: '11:45' },
]

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
    festivos: ['2026-09-15'], // martes: se lleva por delante las DOS clases del día
    periodosNoLectivos: [
      { nombre: 'Vacaciones de Navidad', inicio: '2026-12-23', fin: '2027-01-10' },
    ],
  })
  await db.grupos.put({
    id: GRUPO_ID,
    cursoEscolarId: CURSO_ID,
    nombre: 'Lengua 4º',
    etapa: 'primaria',
    nivel: 4,
    color: '#006A80',
    orden: 0,
    horario: HORARIO_CUATRO,
  })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

async function unidadDe(cuantas: number) {
  const { id } = await importarUnidad({
    etapa: 'primaria',
    nivel: 4,
    titulo: 'Unidad larga',
    sesiones: Array.from({ length: cuantas }, (_, i) => ({
      titulo: `S${i + 1}`,
      descripcion: `Desarrollo ${i + 1}`,
      recursos: [],
      enlacesYNotas: '',
    })),
  })
  return id
}

/** «fecha franja título», en el orden real en que ocurren las clases. */
async function programacion() {
  const lista = await db.sesiones.toArray()
  return lista
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''),
    )
    .map((s) => `${s.fecha} ${s.franjaInicio} ${s.titulo}`)
}

describe('volcado sobre huecos reales', () => {
  it('un día con dos clases se ocupa entero antes de pasar al siguiente', async () => {
    const udId = await unidadDe(8)
    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(r.previa.colocadas).toBe(8)
    expect(await programacion()).toEqual([
      '2026-09-07 09:00 S1',
      '2026-09-08 10:00 S2',
      '2026-09-08 12:30 S3',
      '2026-09-10 11:00 S4',
      '2026-09-14 09:00 S5',
      // El martes 15 es festivo: se salta entero, con sus dos clases.
      '2026-09-17 11:00 S6',
      '2026-09-21 09:00 S7',
      '2026-09-22 10:00 S8',
    ])
  })

  it('el festivo no consume sesiones: la secuencia continúa después', async () => {
    const udId = await unidadDe(8)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })
    const fechas = (await db.sesiones.toArray()).map((s) => s.fecha)
    expect(fechas).not.toContain('2026-09-15')
  })

  it('empieza en la FRANJA elegida, no en la primera del día', async () => {
    const udId = await unidadDe(3)
    await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-08',
      franjaInicio: '12:30',
      modo: 'saltar',
    })
    expect(await programacion()).toEqual([
      '2026-09-08 12:30 S1',
      '2026-09-10 11:00 S2',
      '2026-09-14 09:00 S3',
    ])
  })

  it('un grupo de una sola clase al día se comporta igual que siempre', async () => {
    await db.grupos.update(GRUPO_ID, {
      horario: [{ diaSemana: 4, horaInicio: '11:00', horaFin: '11:45' }],
    })
    const udId = await unidadDe(3)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })
    expect(await programacion()).toEqual([
      '2026-09-10 11:00 S1',
      '2026-09-17 11:00 S2',
      '2026-09-24 11:00 S3',
    ])
  })
})

describe('el curso ya generado no bloquea el volcado', () => {
  it('rellena el esqueleto vacío en vez de saltarlo — el bug de «una por semana»', async () => {
    await generarCursoCompleto(GRUPO_ID)
    const udId = await unidadDe(8)

    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(r.previa.colocadas).toBe(8)
    expect(r.previa.saltadas).toBe(0)
    expect(r.previa.pasos.filter((p) => p.plan).every((p) => p.accion === 'rellenar')).toBe(true)
    // Se REUTILIZAN las sesiones del esqueleto: ni una clase duplicada.
    const delMartes8 = (await db.sesiones.toArray()).filter((s) => s.fecha === '2026-09-08')
    expect(delMartes8).toHaveLength(2)
    expect((await programacion()).slice(0, 4)).toEqual([
      '2026-09-07 09:00 S1',
      '2026-09-08 10:00 S2',
      '2026-09-08 12:30 S3',
      '2026-09-10 11:00 S4',
    ])
  })

  it('con sesiones antiguas sin franja, la segunda clase del día también se llena', async () => {
    // Estado real tras la v24: una sesión por día, atada a la primera franja.
    await crearSesion(GRUPO_ID, '2026-09-08', { franjaInicio: '10:00' })
    const udId = await unidadDe(2)

    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-08', modo: 'saltar' })
    expect(r.previa.colocadas).toBe(2)
    expect(await programacion()).toEqual(['2026-09-08 10:00 S1', '2026-09-08 12:30 S2'])
  })
})

describe('modos', () => {
  /** Una clase con trabajo hecho el jueves 10. */
  async function conTrabajoHecho() {
    await crearSesion(GRUPO_ID, '2026-09-10', {
      titulo: 'Evaluación inicial',
      franjaInicio: '11:00',
    })
  }

  it('«saltar» respeta la clase con trabajo y sigue en la siguiente libre', async () => {
    await conTrabajoHecho()
    const udId = await unidadDe(4)
    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(r.previa.saltadas).toBe(1)
    expect(r.previa.sustituidas).toEqual([])
    expect(await programacion()).toEqual([
      '2026-09-07 09:00 S1',
      '2026-09-08 10:00 S2',
      '2026-09-08 12:30 S3',
      '2026-09-10 11:00 Evaluación inicial',
      '2026-09-14 09:00 S4',
    ])
  })

  it('«sobrescribir» ocupa los huecos seguidos y dice qué se pierde', async () => {
    await conTrabajoHecho()
    const udId = await unidadDe(4)
    const r = await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
      modo: 'sobrescribir',
    })

    expect(r.previa.sustituidas).toEqual([
      { fecha: '2026-09-10', franjaInicio: '11:00', titulo: 'Evaluación inicial' },
    ])
    expect(await programacion()).toEqual([
      '2026-09-07 09:00 S1',
      '2026-09-08 10:00 S2',
      '2026-09-08 12:30 S3',
      '2026-09-10 11:00 S4',
    ])
  })

  it('deshacer un volcado con sobrescritura restaura lo que había', async () => {
    await conTrabajoHecho()
    const udId = await unidadDe(4)
    const { deshacer } = await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
      modo: 'sobrescribir',
    })
    await deshacer()

    expect(await programacion()).toEqual(['2026-09-10 11:00 Evaluación inicial'])
    const restaurada = (await db.sesiones.toArray())[0]
    expect(restaurada.udId).toBeUndefined()
    expect(restaurada.loteVolcado).toBeUndefined()
  })

  it('deshacer devuelve el esqueleto vacío que se había rellenado', async () => {
    await generarCursoCompleto(GRUPO_ID)
    const antes = await db.sesiones.count()
    const udId = await unidadDe(5)
    const { deshacer } = await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
      modo: 'saltar',
    })
    await deshacer()

    expect(await db.sesiones.count()).toBe(antes)
    expect((await db.sesiones.toArray()).every((s) => !s.udId && s.titulo === '')).toBe(true)
  })

  it('la previa no escribe nada y cambiar de modo solo cambia el reparto', async () => {
    await conTrabajoHecho()
    const udId = await unidadDe(4)
    const saltar = await previsualizarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
      modo: 'saltar',
    })
    const pisar = await previsualizarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
      modo: 'sobrescribir',
    })

    expect(saltar.saltadas).toBe(1)
    expect(pisar.saltadas).toBe(0)
    expect(pisar.sustituidas).toHaveLength(1)
    expect(await db.sesiones.count()).toBe(1) // solo la clase con trabajo hecho
  })
})

describe('avisos', () => {
  it('avisa de cuántas sesiones se quedan fuera del curso y coloca las que caben', async () => {
    const udId = await unidadDe(6)
    const previa = await previsualizarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2027-06-14',
      modo: 'saltar',
    })
    // Del 14 al 18 de junio: lunes, martes (x2) y jueves = 4 clases.
    expect(previa.colocadas).toBe(4)
    expect(previa.sinHueco).toBe(2)
  })

  it('señala el periodo vacacional que atraviesa y los trimestres que cruza', async () => {
    const udId = await unidadDe(30)
    const previa = await previsualizarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-12-07',
      modo: 'saltar',
    })
    expect(previa.periodosCruzados).toEqual(['Vacaciones de Navidad'])
    expect(previa.trimestresCruzados).toEqual([1, 2])
  })

  it('detecta que la unidad ya estaba volcada y sabe reemplazar el volcado anterior', async () => {
    const udId = await unidadDe(3)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })

    const previa = await previsualizarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-21',
      modo: 'saltar',
    })
    expect(previa.volcadoPrevio).toBe(3)

    const r = await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-21',
      modo: 'saltar',
      reemplazarPrevio: true,
    })
    expect(r.previa.colocadas).toBe(3)
    expect(await programacion()).toEqual([
      '2026-09-21 09:00 S1',
      '2026-09-22 10:00 S2',
      '2026-09-22 12:30 S3',
    ])
  })

  it('deshacer un reemplazo repone el volcado anterior tal cual estaba', async () => {
    const udId = await unidadDe(3)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const original = await programacion()

    const { deshacer } = await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-21',
      modo: 'saltar',
      reemplazarPrevio: true,
    })
    await deshacer()

    expect(await programacion()).toEqual(original)
  })
})

describe('vínculo con la unidad', () => {
  it('cada sesión colocada guarda su sesión del plan y su unidad', async () => {
    const udId = await unidadDe(3)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    const ud = await db.unidades.get(udId)
    const plan = ud!.sesiones!
    const colocadas = (await db.sesiones.toArray()).sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''),
    )
    expect(colocadas.every((s) => s.udId === udId)).toBe(true)
    expect(colocadas.map((s) => s.sesionPlanId)).toEqual(plan.map((p) => p.id))
    expect(new Set(colocadas.map((s) => s.loteVolcado)).size).toBe(1)
  })

  it('reordenar el plan después de volcar no mueve lo ya programado', async () => {
    const udId = await unidadDe(3)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })
    const antes = await programacion()

    const ud = await db.unidades.get(udId)
    const sesiones = [...ud!.sesiones!]
    await db.unidades.update(udId, {
      sesiones: [sesiones[2], sesiones[0], sesiones[1]].map((s, i) => ({ ...s, orden: i })),
    })

    expect(await programacion()).toEqual(antes)
  })
})
