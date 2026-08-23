import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  aplicarUnidadAGrupo,
  archivarUnidad,
  contarImpactoUnidad,
  crearSesion,
  crearUnidad,
  eliminarUnidad,
  importarUnidad,
} from './planificador'
import { crearColumna, crearRubrica, guardarValor } from './cuaderno'

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
    festivos: ['2026-10-13'], // martes, festivo suelto
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
    // Martes, único día de clase de este grupo.
    horario: [{ diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' }],
  })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

const sesion = (titulo: string, recursos: string[] = [], enlacesYNotas = '') => ({
  titulo,
  descripcion: `Desarrollo de ${titulo}.`,
  recursos,
  enlacesYNotas,
})

async function unidadDeTres() {
  const { id } = await importarUnidad({
    etapa: 'primaria',
    nivel: 3,
    titulo: 'Habilidades con móvil',
    sesiones: [sesion('Uno', ['10 balones']), sesion('Dos'), sesion('Tres')],
  })
  return id
}

describe('importarUnidad', () => {
  it('guarda el plan en la unidad, sin trimestre y sin criterios', async () => {
    const id = await unidadDeTres()
    const ud = await db.unidades.get(id)

    expect(ud?.trimestre).toBeNull()
    expect(ud?.criterios).toEqual([])
    expect(ud?.sesiones).toHaveLength(3)
    expect(ud?.sesiones?.map((s) => s.orden)).toEqual([0, 1, 2])
    expect(ud?.sesiones?.[0].recursosNecesarios).toBe('10 balones')
    // Todavía no hay ninguna sesión real: no se ha elegido grupo ni fecha.
    expect(await db.sesiones.count()).toBe(0)
  })

  it('separa enlaces de notas sueltas en «Enlaces y notas»', async () => {
    const { id } = await importarUnidad({
      etapa: 'primaria',
      nivel: 3,
      titulo: 'Con enlaces',
      sesiones: [sesion('Uno', [], 'https://ejemplo.org/video\nPedir el pabellón')],
    })
    const ud = await db.unidades.get(id)
    expect(ud?.sesiones?.[0].recursos).toEqual([
      { tipo: 'enlace', valor: 'https://ejemplo.org/video' },
      { tipo: 'nota', valor: 'Pedir el pabellón' },
    ])
  })

  it('deshacer borra la unidad entera', async () => {
    const { id, deshacer } = await importarUnidad({
      etapa: 'infantil',
      titulo: 'El bosque',
      sesiones: [sesion('Uno')],
    })
    await deshacer()
    expect(await db.unidades.get(id)).toBeUndefined()
  })
})

describe('aplicarUnidadAGrupo', () => {
  it('coloca el plan en las clases reales seguidas desde la fecha', async () => {
    const udId = await unidadDeTres()
    const r = await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })

    expect(r.creadas).toBe(3)
    expect(r.sinHueco).toBe(0)
    const fechas = (await db.sesiones.toArray()).map((s) => s.fecha).sort()
    // Martes seguidos: 8, 15 y 22 de septiembre.
    expect(fechas).toEqual(['2026-09-08', '2026-09-15', '2026-09-22'])
  })

  it('salta los festivos: no son clase del grupo', async () => {
    const udId = await unidadDeTres()
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-10-06' })

    const fechas = (await db.sesiones.toArray()).map((s) => s.fecha).sort()
    expect(fechas).not.toContain('2026-10-13')
    expect(fechas).toEqual(['2026-10-06', '2026-10-20', '2026-10-27'])
  })

  it('nunca pisa una clase que ya tenía sesión', async () => {
    const udId = await unidadDeTres()
    await db.sesiones.put({
      id: 'ya-existe',
      grupoId: GRUPO_ID,
      fecha: '2026-09-15',
      titulo: 'Trabajo previo',
      juegos: [],
      notas: '',
      recursos: [],
    })

    const r = await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })

    expect(r.creadas).toBe(3)
    expect(r.omitidas).toBe(1)
    expect((await db.sesiones.get('ya-existe'))?.titulo).toBe('Trabajo previo')
    const fechas = (await db.sesiones.toArray()).map((s) => s.fecha).sort()
    expect(fechas).toEqual(['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'])
  })

  it('las sesiones creadas quedan atadas a la unidad', async () => {
    const udId = await unidadDeTres()
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const creadas = await db.sesiones.toArray()
    expect(creadas.every((s) => s.udId === udId)).toBe(true)
    expect(creadas.find((s) => s.fecha === '2026-09-08')?.recursosNecesarios).toBe('10 balones')
  })

  it('avisa si el curso se queda sin clases para todo el plan', async () => {
    const udId = await unidadDeTres()
    const r = await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2027-06-15' })
    // Solo queda un martes antes del fin de curso.
    expect(r.creadas).toBe(1)
    expect(r.sinHueco).toBe(2)
  })

  it('deshacer retira solo las sesiones creadas', async () => {
    const udId = await unidadDeTres()
    const { deshacer } = await aplicarUnidadAGrupo({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
    })
    await deshacer()
    expect(await db.sesiones.count()).toBe(0)
  })

  it('se niega a llevar una unidad a un grupo de otra etapa', async () => {
    const { id } = await importarUnidad({
      etapa: 'infantil',
      titulo: 'El bosque',
      sesiones: [sesion('Uno')],
    })
    await expect(
      aplicarUnidadAGrupo({ udId: id, grupoId: GRUPO_ID, desde: '2026-09-07' }),
    ).rejects.toThrow(/otra etapa/)
  })
})

// ——— Eliminar y archivar unidades ———

const GRUPO_INF = 'gi1'

/**
 * Grupo de Infantil aparte del de Primaria del fixture: hace falta para
 * comprobar que las columnas de observación sobreviven al borrado.
 */
async function grupoInfantil() {
  await db.grupos.put({
    id: GRUPO_INF,
    cursoEscolarId: CURSO_ID,
    nombre: '4 años A',
    etapa: 'infantil',
    nivel: 4,
    color: '#9AC3CC',
    orden: 1,
    horario: [{ diaSemana: 3, horaInicio: '11:00', horaFin: '11:45' }],
  })
}

describe('eliminarUnidad', () => {
  it('se niega a borrar si hay una sola celda escrita, y no toca nada', async () => {
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'Bote', nivel: 3, trimestre: 1 })
    const colId = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Prueba de bote',
      tipo: 'numero',
      udId,
    })
    await guardarValor(colId, 'a1', { numero: 7 })

    await expect(eliminarUnidad(udId)).rejects.toThrow(/notas u observaciones/)

    expect(await db.unidades.get(udId)).toBeDefined()
    expect((await db.columnas.get(colId))?.udId).toBe(udId)
    expect(await db.valores.where('columnaId').equals(colId).count()).toBe(1)
  })

  it('sin celdas escritas borra la unidad con sus columnas de Primaria y sus filas', async () => {
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'Bote', nivel: 3, trimestre: 1 })
    const colId = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Prueba de bote',
      tipo: 'numero',
      udId,
    })
    // Una columna del mismo grupo SIN unidad: no es de la unidad, no se toca.
    const ajena = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Actitud',
      tipo: 'caritas',
    })
    expect(await db.filas.where('columnaId').equals(colId).count()).toBeGreaterThan(0)

    await eliminarUnidad(udId)

    expect(await db.unidades.get(udId)).toBeUndefined()
    expect(await db.columnas.get(colId)).toBeUndefined()
    expect(await db.filas.where('columnaId').equals(colId).count()).toBe(0)
    expect(await db.columnas.get(ajena)).toBeDefined()
  })

  it('conserva las columnas de observación de Infantil, desvinculadas', async () => {
    await grupoInfantil()
    const udId = await crearUnidad({ etapa: 'infantil', titulo: 'El bosque', trimestre: 1 })
    const colId = await crearColumna({
      grupoId: GRUPO_INF,
      trimestre: 1,
      titulo: '¿Salta con los pies juntos?',
      tipo: 'si_no',
      udId,
      pesoUd: 40,
    })

    await eliminarUnidad(udId)

    const columna = await db.columnas.get(colId)
    expect(columna).toBeDefined()
    expect(columna?.udId).toBeUndefined()
    expect(columna?.pesoUd).toBe(0)
    expect(await db.filas.where('columnaId').equals(colId).count()).toBeGreaterThan(0)
  })

  it('conserva las sesiones ya colocadas y los equipos, desvinculados', async () => {
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'Bote', nivel: 3, trimestre: 1 })
    const sesionId = await crearSesion(GRUPO_ID, '2026-09-08', {
      titulo: 'Sesión 1',
      udId,
      valoracion: 4,
      notas: 'Salió muy bien',
    })
    await db.equipos.put({
      id: 'eq1',
      grupoId: GRUPO_ID,
      nombre: 'Equipos del bote',
      fecha: '2026-09-08',
      udId,
      config: {
        modo: 'aleatorio',
        soloPresentes: false,
        equilibrarGenero: false,
        respetarVinculos: false,
        repartirApoyos: false,
        priorizarNuevos: false,
      },
      equipos: [{ nombre: 'Rojos', color: 'acento', miembros: ['a1'] }],
    })

    await eliminarUnidad(udId)

    const sesion = await db.sesiones.get(sesionId)
    expect(sesion).toBeDefined()
    expect(sesion?.udId).toBeUndefined()
    expect(sesion?.valoracion).toBe(4)
    expect(sesion?.notas).toBe('Salió muy bien')
    expect((await db.equipos.get('eq1'))?.udId).toBeUndefined()
  })

  it('no toca el banco de rúbricas', async () => {
    const rubricaId = await crearRubrica('Coordinación', 'primaria')
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'Bote', nivel: 3, trimestre: 1 })
    await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Rúbrica de bote',
      tipo: 'rubrica',
      rubricaId,
      udId,
    })

    await eliminarUnidad(udId)

    expect(await db.rubricas.get(rubricaId)).toBeDefined()
  })

  it('deshacer devuelve la base al estado anterior', async () => {
    await grupoInfantil()
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'Bote', nivel: 3, trimestre: 1 })
    const colPrim = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Prueba de bote',
      tipo: 'numero',
      udId,
    })
    const colInf = await crearColumna({
      grupoId: GRUPO_INF,
      trimestre: 1,
      titulo: 'Observación',
      tipo: 'si_no',
      udId,
      pesoUd: 30,
    })
    const sesionId = await crearSesion(GRUPO_ID, '2026-09-08', { titulo: 'Sesión 1', udId })
    const filasAntes = await db.filas.where('columnaId').equals(colPrim).count()

    const deshacer = await eliminarUnidad(udId)
    await deshacer()

    expect(await db.unidades.get(udId)).toBeDefined()
    expect((await db.columnas.get(colPrim))?.udId).toBe(udId)
    expect(await db.filas.where('columnaId').equals(colPrim).count()).toBe(filasAntes)
    const inf = await db.columnas.get(colInf)
    expect(inf?.udId).toBe(udId)
    expect(inf?.pesoUd).toBe(30)
    expect((await db.sesiones.get(sesionId))?.udId).toBe(udId)
  })
})

describe('contarImpactoUnidad', () => {
  it('cuenta por separado lo que se borra y lo que se conserva', async () => {
    await grupoInfantil()
    const udId = await crearUnidad({
      etapa: 'primaria',
      titulo: 'Bote',
      nivel: 3,
      trimestre: 1,
      sesiones: [{ id: 's1', orden: 0, titulo: 'Plan 1', notas: '', recursos: [] }],
    })
    const colId = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Prueba',
      tipo: 'numero',
      udId,
    })
    await crearColumna({
      grupoId: GRUPO_INF,
      trimestre: 1,
      titulo: 'Observación',
      tipo: 'si_no',
      udId,
    })
    await crearSesion(GRUPO_ID, '2026-09-08', { titulo: 'Sesión 1', udId })
    await guardarValor(colId, 'a1', { numero: 7 })

    const impacto = await contarImpactoUnidad(udId)

    expect(impacto).toMatchObject({
      etapa: 'primaria',
      titulo: 'Bote',
      sesionesPlan: 1,
      sesionesReales: 1,
      columnas: 2,
      columnasInfantil: 1,
      valores: 1,
      equipos: 0,
    })
    expect(impacto?.filas).toBeGreaterThan(0)
  })

  it('devuelve null si la unidad no existe', async () => {
    expect(await contarImpactoUnidad('no-existe')).toBeNull()
  })
})

describe('archivarUnidad', () => {
  it('archiva sin borrar y se puede deshacer', async () => {
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'Bote', nivel: 3, trimestre: 1 })

    const deshacer = await archivarUnidad(udId, true)
    expect((await db.unidades.get(udId))?.archivada).toBe(true)

    await deshacer()
    expect((await db.unidades.get(udId))?.archivada).toBe(false)
    expect(await db.unidades.get(udId)).toBeDefined()
  })
})
