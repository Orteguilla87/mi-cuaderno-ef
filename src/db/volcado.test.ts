import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { exportarBackup, restaurarBackup } from './backup'
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
 * Volcar una unidad a un grupo.
 *
 * Regla dura: el volcado solo RELLENA sesiones que ya existen. Nunca crea, nunca
 * resucita una eliminada, nunca toca el horario ni las cancelaciones. El fallo
 * que la motiva: el volcado recorría el horario, así que las clases que el
 * docente había eliminado volvían a aparecer al llevar una unidad nueva.
 *
 * Por eso cada prueba parte de un curso YA GENERADO: es lo único que crea
 * sesiones.
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
  await generarCursoCompleto(GRUPO_ID)
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

/** «fecha franja título» de las sesiones CON contenido, en el orden real de las clases. */
async function programacion() {
  const lista = await db.sesiones.toArray()
  return lista
    .filter((s) => s.titulo)
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''),
    )
    .map((s) => `${s.fecha} ${s.franjaInicio} ${s.titulo}`)
}

/** La sesión del esqueleto en esa clase. */
async function sesionEn(fecha: string, franjaInicio: string) {
  const s = await db.sesiones
    .where('[grupoId+fecha+franjaInicio]')
    .equals([GRUPO_ID, fecha, franjaInicio])
    .first()
  if (!s) throw new Error(`No hay sesión el ${fecha} a las ${franjaInicio}`)
  return s
}

describe('volcado sobre las sesiones existentes', () => {
  it('un día con dos clases se ocupa entero antes de pasar al siguiente', async () => {
    const udId = await unidadDe(8)
    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(r.previa.colocadas).toBe(8)
    expect(r.previa.pasos.every((p) => p.accion === 'rellenar')).toBe(true)
    expect(await programacion()).toEqual([
      '2026-09-07 09:00 S1',
      '2026-09-08 10:00 S2',
      '2026-09-08 12:30 S3',
      '2026-09-10 11:00 S4',
      '2026-09-14 09:00 S5',
      // El martes 15 es festivo: no tiene sesiones, así que no consume ninguna.
      '2026-09-17 11:00 S6',
      '2026-09-21 09:00 S7',
      '2026-09-22 10:00 S8',
    ])
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

  it('reutiliza las sesiones: ni una fila nueva, ni una clase duplicada', async () => {
    const antes = await db.sesiones.count()
    const udId = await unidadDe(8)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(await db.sesiones.count()).toBe(antes)
    const delMartes8 = (await db.sesiones.toArray()).filter((s) => s.fecha === '2026-09-08')
    expect(delMartes8).toHaveLength(2)
  })

  it('conserva la hora ajustada de ese día al rellenar la sesión', async () => {
    const lunes = await sesionEn('2026-09-07', '09:00')
    await db.sesiones.update(lunes.id, { horaInicio: '09:15', horaFin: '10:00' })
    const udId = await unidadDe(1)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(await db.sesiones.get(lunes.id)).toMatchObject({
      titulo: 'S1',
      horaInicio: '09:15',
      horaFin: '10:00',
      franjaInicio: '09:00',
    })
  })

  it('una sesión antigua sin franja cuenta como la primera clase de su día', async () => {
    await db.sesiones.clear()
    const sinFranja = await crearSesion(GRUPO_ID, '2026-09-08')
    const segunda = await crearSesion(GRUPO_ID, '2026-09-08', { franjaInicio: '12:30' })
    const udId = await unidadDe(2)

    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-08', modo: 'saltar' })
    expect(r.previa.colocadas).toBe(2)
    expect((await db.sesiones.get(sinFranja))?.titulo).toBe('S1')
    expect((await db.sesiones.get(segunda))?.titulo).toBe('S2')
  })
})

describe('el volcado nunca crea ni resucita sesiones', () => {
  it('una sesión eliminada NO reaparece tras volcar', async () => {
    const martes = await sesionEn('2026-09-08', '10:00')
    await db.sesiones.delete(martes.id)
    const antes = await db.sesiones.count()

    const udId = await unidadDe(3)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(await db.sesiones.count()).toBe(antes)
    expect(await programacion()).toEqual([
      '2026-09-07 09:00 S1',
      // La de las 10:00 del martes se eliminó: la unidad sigue en la siguiente.
      '2026-09-08 12:30 S2',
      '2026-09-10 11:00 S3',
    ])
    const delMartes = (await db.sesiones.toArray()).filter((s) => s.fecha === '2026-09-08')
    expect(delMartes.map((s) => s.franjaInicio)).toEqual(['12:30'])
  })

  it('una clase eliminada con su cancelación sigue eliminada y cancelada', async () => {
    const lunes = await sesionEn('2026-09-07', '09:00')
    await db.sesiones.delete(lunes.id)
    await db.clasesCanceladas.add({
      id: 'c1',
      grupoId: GRUPO_ID,
      fecha: '2026-09-07',
      horaInicio: '09:00',
      creado: '2026-09-01T10:00:00.000Z',
    })

    const udId = await unidadDe(2)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'sobrescribir' })

    expect(await db.clasesCanceladas.count()).toBe(1)
    expect((await db.sesiones.toArray()).some((s) => s.fecha === '2026-09-07')).toBe(false)
    expect(await programacion()).toEqual(['2026-09-08 10:00 S1', '2026-09-08 12:30 S2'])
  })

  it('el horario del grupo no se modifica', async () => {
    const antes = await db.grupos.get(GRUPO_ID)
    const udId = await unidadDe(10)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'sobrescribir' })
    expect(await db.grupos.get(GRUPO_ID)).toEqual(antes)
  })

  it('una unidad más larga que las sesiones disponibles avisa y no crea nada', async () => {
    const antes = await db.sesiones.count()
    const udId = await unidadDe(6)
    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2027-06-14', modo: 'saltar' })

    // Del 14 al 18 de junio: lunes, martes (x2) y jueves = 4 sesiones.
    expect(r.previa.huecosDisponibles).toBe(4)
    expect(r.previa.colocadas).toBe(4)
    expect(r.previa.sinHueco).toBe(2)
    expect(r.previa.ultimaFecha).toBe('2027-06-17')
    expect(await db.sesiones.count()).toBe(antes)
  })

  it('sin curso generado no coloca nada', async () => {
    await db.sesiones.clear()
    const udId = await unidadDe(3)
    const r = await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    expect(r.previa.huecosDisponibles).toBe(0)
    expect(r.previa.colocadas).toBe(0)
    expect(r.previa.sinHueco).toBe(3)
    expect(await db.sesiones.count()).toBe(0)
  })

  it('regenerar el curso SÍ recupera una clase eliminada, y deshacer la vuelve a quitar', async () => {
    const lunes = await sesionEn('2026-09-07', '09:00')
    await db.sesiones.delete(lunes.id)
    await db.clasesCanceladas.add({
      id: 'c1',
      grupoId: GRUPO_ID,
      fecha: '2026-09-07',
      horaInicio: '09:00',
      creado: '2026-09-01T10:00:00.000Z',
    })

    const { resultado, deshacer } = await generarCursoCompleto(GRUPO_ID)
    expect(resultado.creadas).toBe(1)
    expect(resultado.recuperadas).toBe(1)
    expect((await db.sesiones.toArray()).filter((s) => s.fecha === '2026-09-07')).toHaveLength(1)
    // La clase vuelve a existir: su cancelación ya no tiene sentido.
    expect(await db.clasesCanceladas.count()).toBe(0)

    await deshacer()
    expect((await db.sesiones.toArray()).some((s) => s.fecha === '2026-09-07')).toBe(false)
    expect(await db.clasesCanceladas.get('c1')).toBeDefined()
  })
})

describe('modos', () => {
  /** Una clase con trabajo hecho el jueves 10. */
  async function conTrabajoHecho() {
    const jueves = await sesionEn('2026-09-10', '11:00')
    await db.sesiones.update(jueves.id, { titulo: 'Evaluación inicial' })
  }

  it('«saltar» respeta la clase con trabajo y sigue en la siguiente sesión', async () => {
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

  it('«sobrescribir» ocupa las sesiones seguidas y dice qué se pierde', async () => {
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
    const antes = await db.sesiones.toArray()
    const udId = await unidadDe(4)
    const { deshacer } = await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
      modo: 'sobrescribir',
    })
    await deshacer()

    expect(await programacion()).toEqual(['2026-09-10 11:00 Evaluación inicial'])
    expect(await db.sesiones.toArray()).toEqual(antes)
  })

  it('la previa no escribe nada y cambiar de modo solo cambia el reparto', async () => {
    await conTrabajoHecho()
    const antes = await db.sesiones.toArray()
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
    expect(await db.sesiones.toArray()).toEqual(antes)
  })
})

describe('avisos', () => {
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

  it('detecta que la unidad ya estaba volcada y reemplaza vaciando, sin borrar filas', async () => {
    const udId = await unidadDe(3)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const total = await db.sesiones.count()

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
    expect(await db.sesiones.count()).toBe(total)
  })

  it('deshacer un reemplazo repone el volcado anterior tal cual estaba', async () => {
    const udId = await unidadDe(3)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const original = await db.sesiones.toArray()

    const { deshacer } = await aplicarVolcado({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-21',
      modo: 'saltar',
      reemplazarPrevio: true,
    })
    await deshacer()

    expect(await db.sesiones.toArray()).toEqual(original)
  })
})

describe('vínculo con la unidad', () => {
  it('cada sesión colocada guarda su sesión del plan y su unidad', async () => {
    const udId = await unidadDe(3)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })

    const ud = await db.unidades.get(udId)
    const plan = ud!.sesiones!
    const colocadas = (await db.sesiones.where('udId').equals(udId).toArray()).sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''),
    )
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

describe('la transacción es atómica', () => {
  it('si falla a mitad, no queda ni una sesión colocada', async () => {
    const udId = await unidadDe(13)
    let escrituras = 0
    const original = db.sesiones.put.bind(db.sesiones)
    const espia = vi
      .spyOn(db.sesiones, 'put')
      .mockImplementation(((...args: Parameters<typeof original>) => {
        if (++escrituras === 6) throw new Error('fallo simulado a mitad del volcado')
        return original(...args)
      }) as typeof db.sesiones.put)

    await expect(
      aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' }),
    ).rejects.toThrow(/fallo simulado/)

    espia.mockRestore()
    // Ni las cinco que sí llegaron a escribirse: la transacción entera revierte.
    expect(await programacion()).toEqual([])
  })

  it('si falla al reemplazar un volcado previo, el anterior sigue intacto', async () => {
    const udId = await unidadDe(4)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-07', modo: 'saltar' })
    const antes = await programacion()

    const espia = vi.spyOn(db.sesiones, 'put').mockImplementation((() => {
      throw new Error('fallo simulado al reemplazar')
    }) as typeof db.sesiones.put)

    await expect(
      aplicarVolcado({
        udId,
        grupoId: GRUPO_ID,
        desde: '2026-09-21',
        modo: 'saltar',
        reemplazarPrevio: true,
      }),
    ).rejects.toThrow(/fallo simulado/)

    espia.mockRestore()
    expect(await programacion()).toEqual(antes)
  })
})

describe('las cancelaciones viajan en la copia cifrada', () => {
  it('sobreviven al ciclo exportar → restaurar', async () => {
    await db.clasesCanceladas.add({
      id: 'c1',
      grupoId: GRUPO_ID,
      fecha: '2026-09-08',
      horaInicio: '10:00',
      creado: '2026-09-01T10:00:00.000Z',
    })
    const udId = await unidadDe(3)
    await aplicarVolcado({ udId, grupoId: GRUPO_ID, desde: '2026-09-10', modo: 'saltar' })
    const total = await db.sesiones.count()

    const { fichero, cabecera } = await exportarBackup('pista-mojada-2026')
    expect(cabecera.registros.clasesCanceladas).toBe(1)

    await db.transaction('rw', db.tables, async () => {
      for (const tabla of db.tables) await tabla.clear()
    })
    await restaurarBackup(fichero, 'pista-mojada-2026')

    expect(await db.clasesCanceladas.get('c1')).toMatchObject({
      grupoId: GRUPO_ID,
      fecha: '2026-09-08',
      horaInicio: '10:00',
    })
    expect(await db.sesiones.count()).toBe(total)
  })
})
