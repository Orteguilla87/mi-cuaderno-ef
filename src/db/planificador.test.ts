import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  anadirCursoAUnidad,
  anadirSesionPlan,
  aplicarUnidadAGrupo,
  archivarUnidad,
  claveHueco,
  clavesOcupadas,
  contarImpactoUnidad,
  copiarUnidad,
  crearSesion,
  crearUnidad,
  duplicarSesionPlan,
  fechasDeClase,
  huecosDeClase,
  eliminarSesionPlan,
  eliminarUnidad,
  guardarPesosTrimestre,
  generarCursoCompleto,
  guardarSesionPlan,
  importarUnidad,
  mapearCriterios,
  marcarCriteriosRevisados,
  moverSesionPlan,
  moverUnidad,
  quitarCursoDeUnidad,
  resumenCopia,
  sesionesDe,
  unidadesDelCurso,
} from './planificador'
import { crearColumna, crearRubrica, guardarValor } from './cuaderno'
import { sembrarCriterios } from './criterios'

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

/** Fechas de las sesiones con contenido: el esqueleto vacío no cuenta. */
async function fechasProgramadas() {
  return (await db.sesiones.toArray())
    .filter((s) => s.titulo)
    .map((s) => s.fecha)
    .sort()
}

describe('aplicarUnidadAGrupo', () => {
  beforeEach(async () => {
    // Solo «Generar curso completo» crea sesiones: el volcado las rellena.
    await generarCursoCompleto(GRUPO_ID)
  })

  it('coloca el plan en las sesiones seguidas desde la fecha', async () => {
    const udId = await unidadDeTres()
    const r = await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })

    expect(r.colocadas).toBe(3)
    expect(r.sinHueco).toBe(0)
    // Martes seguidos: 8, 15 y 22 de septiembre.
    expect(await fechasProgramadas()).toEqual(['2026-09-08', '2026-09-15', '2026-09-22'])
  })

  it('salta los festivos: no son clase del grupo', async () => {
    const udId = await unidadDeTres()
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-10-06' })

    expect(await fechasProgramadas()).toEqual(['2026-10-06', '2026-10-20', '2026-10-27'])
  })

  it('nunca pisa una clase que ya tenía trabajo', async () => {
    const udId = await unidadDeTres()
    const ya = (await db.sesiones.where('fecha').equals('2026-09-15').first())!
    await db.sesiones.update(ya.id, { titulo: 'Trabajo previo' })

    const r = await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })

    expect(r.colocadas).toBe(3)
    expect(r.omitidas).toBe(1)
    expect((await db.sesiones.get(ya.id))?.titulo).toBe('Trabajo previo')
    expect(await fechasProgramadas()).toEqual([
      '2026-09-08',
      '2026-09-15',
      '2026-09-22',
      '2026-09-29',
    ])
  })

  it('las sesiones colocadas quedan atadas a la unidad', async () => {
    const udId = await unidadDeTres()
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const colocadas = await db.sesiones.where('udId').equals(udId).toArray()
    expect(colocadas).toHaveLength(3)
    expect(colocadas.find((s) => s.fecha === '2026-09-08')?.recursosNecesarios).toBe('10 balones')
  })

  it('avisa si no quedan sesiones para todo el plan', async () => {
    const udId = await unidadDeTres()
    const r = await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2027-06-15' })
    // Solo queda un martes antes del fin de curso.
    expect(r.colocadas).toBe(1)
    expect(r.sinHueco).toBe(2)
  })

  it('deshacer devuelve las sesiones rellenadas a su estado anterior', async () => {
    const antes = await db.sesiones.toArray()
    const udId = await unidadDeTres()
    const { deshacer } = await aplicarUnidadAGrupo({
      udId,
      grupoId: GRUPO_ID,
      desde: '2026-09-07',
    })
    await deshacer()
    expect(await db.sesiones.toArray()).toEqual(antes)
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
      sesiones: [{ id: 's1', nivel: 3, orden: 0, titulo: 'Plan 1', notas: '', recursos: [] }],
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

// ——— El plan de sesiones de una unidad ———

/** Títulos del plan, en el orden en que se verán. */
async function titulosDelPlan(udId: string) {
  const ud = await db.unidades.get(udId)
  return [...(ud?.sesiones ?? [])].sort((a, b) => a.orden - b.orden).map((s) => s.titulo)
}

/** Comprueba que `orden` es 0..n-1 sin huecos ni empates. */
async function ordenPosicional(udId: string) {
  const ud = await db.unidades.get(udId)
  const plan = [...(ud?.sesiones ?? [])].sort((a, b) => a.orden - b.orden)
  return plan.map((s) => s.orden)
}

describe('anadirSesionPlan', () => {
  it('añade al final y numera por posición', async () => {
    const udId = await unidadDeTres()

    const { id } = await anadirSesionPlan(udId, 3, { titulo: '  Cuatro  ' })

    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro'])
    expect(await ordenPosicional(udId)).toEqual([0, 1, 2, 3])
    const ud = await db.unidades.get(udId)
    expect(ud?.sesiones?.find((s) => s.id === id)?.titulo).toBe('Cuatro')
  })

  it('crea una unidad sin plan su primera sesión', async () => {
    const udId = await crearUnidad({ etapa: 'infantil', titulo: 'El bosque', trimestre: null })

    await anadirSesionPlan(udId, 0)

    expect(await ordenPosicional(udId)).toEqual([0])
  })

  it('deshacer la deja como estaba', async () => {
    const udId = await unidadDeTres()
    const { deshacer } = await anadirSesionPlan(udId, 3, { titulo: 'Cuatro' })

    await deshacer()

    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Dos', 'Tres'])
  })
})

describe('guardarSesionPlan', () => {
  it('guarda los mismos campos genéricos en las dos etapas', async () => {
    const udId = await crearUnidad({ etapa: 'infantil', titulo: 'El bosque', trimestre: null })
    const { id } = await anadirSesionPlan(udId, 0)

    await guardarSesionPlan(udId, 0, id, {
      titulo: 'Reptamos',
      notas: 'Circuito bajo las colchonetas.',
      recursosNecesarios: '4 colchonetas',
      recursos: [{ tipo: 'nota', valor: 'Vigilar el paso estrecho' }],
    })

    const s = (await db.unidades.get(udId))?.sesiones?.[0]
    expect(s).toMatchObject({
      titulo: 'Reptamos',
      notas: 'Circuito bajo las colchonetas.',
      recursosNecesarios: '4 colchonetas',
    })
    expect(s?.recursos).toEqual([{ tipo: 'nota', valor: 'Vigilar el paso estrecho' }])
  })

  it('el material en blanco quita el campo en vez de guardar una cadena vacía', async () => {
    const udId = await unidadDeTres()
    const plan = (await db.unidades.get(udId))!.sesiones!
    const conMaterial = plan.find((s) => s.titulo === 'Uno')!
    expect(conMaterial.recursosNecesarios).toBe('10 balones')

    await guardarSesionPlan(udId, 3, conMaterial.id, { recursosNecesarios: '   ' })

    const despues = (await db.unidades.get(udId))!.sesiones!.find((s) => s.id === conMaterial.id)
    expect(despues?.recursosNecesarios).toBeUndefined()
  })

  it('no cambia el orden, y deshacer restaura el contenido anterior', async () => {
    const udId = await unidadDeTres()
    const plan = (await db.unidades.get(udId))!.sesiones!
    const dos = plan.find((s) => s.titulo === 'Dos')!

    const deshacer = await guardarSesionPlan(udId, 3, dos.id, { titulo: 'Dos bis' })
    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Dos bis', 'Tres'])

    await deshacer()
    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('lanza si la sesión ya no está en el plan', async () => {
    const udId = await unidadDeTres()
    await expect(guardarSesionPlan(udId, 3, 'no-existe', { titulo: 'X' })).rejects.toThrow(
      /ya no está en el plan/,
    )
  })
})

describe('duplicarSesionPlan', () => {
  it('coloca la copia justo detrás de la original y renumera', async () => {
    const udId = await unidadDeTres()
    const uno = (await db.unidades.get(udId))!.sesiones!.find((s) => s.titulo === 'Uno')!

    const { id } = await duplicarSesionPlan(udId, 3, uno.id)

    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Uno', 'Dos', 'Tres'])
    expect(await ordenPosicional(udId)).toEqual([0, 1, 2, 3])
    expect(id).not.toBe(uno.id)
  })

  it('copia el contenido, no la referencia', async () => {
    const udId = await unidadDeTres()
    const uno = (await db.unidades.get(udId))!.sesiones!.find((s) => s.titulo === 'Uno')!

    const { id } = await duplicarSesionPlan(udId, 3, uno.id)
    await guardarSesionPlan(udId, 3, id, { titulo: 'Copia editada' })

    const plan = (await db.unidades.get(udId))!.sesiones!
    expect(plan.find((s) => s.id === uno.id)?.titulo).toBe('Uno')
    expect(plan.find((s) => s.id === uno.id)?.recursosNecesarios).toBe('10 balones')
  })
})

describe('eliminarSesionPlan', () => {
  it('quita la sesión, renumera el resto y no toca las sesiones ya colocadas', async () => {
    const udId = await unidadDeTres()
    await generarCursoCompleto(GRUPO_ID)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const realesAntes = await db.sesiones.count()
    const dos = (await db.unidades.get(udId))!.sesiones!.find((s) => s.titulo === 'Dos')!

    await eliminarSesionPlan(udId, 3, dos.id)

    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Tres'])
    expect(await ordenPosicional(udId)).toEqual([0, 1])
    expect(await db.sesiones.count()).toBe(realesAntes)
  })

  it('vaciar el plan deja la unidad sin campo `sesiones`, y deshacer lo repone', async () => {
    const udId = await crearUnidad({ etapa: 'primaria', titulo: 'Bote', nivel: 3, trimestre: 1 })
    const { id } = await anadirSesionPlan(udId, 3, { titulo: 'Única' })

    const deshacer = await eliminarSesionPlan(udId, 3, id)
    expect((await db.unidades.get(udId))?.sesiones).toBeUndefined()

    await deshacer()
    expect(await titulosDelPlan(udId)).toEqual(['Única'])
  })
})

describe('moverSesionPlan', () => {
  it('sube y baja una posición, renumerando', async () => {
    const udId = await unidadDeTres()
    const tres = (await db.unidades.get(udId))!.sesiones!.find((s) => s.titulo === 'Tres')!

    await moverSesionPlan(udId, 3, tres.id, -1)
    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Tres', 'Dos'])
    expect(await ordenPosicional(udId)).toEqual([0, 1, 2])

    await moverSesionPlan(udId, 3, tres.id, 1)
    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('en los extremos no hace nada y lo dice devolviendo null', async () => {
    const udId = await unidadDeTres()
    const uno = (await db.unidades.get(udId))!.sesiones!.find((s) => s.titulo === 'Uno')!

    expect(await moverSesionPlan(udId, 3, uno.id, -1)).toBeNull()
    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('deshacer devuelve el orden anterior', async () => {
    const udId = await unidadDeTres()
    const uno = (await db.unidades.get(udId))!.sesiones!.find((s) => s.titulo === 'Uno')!

    const deshacer = await moverSesionPlan(udId, 3, uno.id, 1)
    expect(await titulosDelPlan(udId)).toEqual(['Dos', 'Uno', 'Tres'])

    await deshacer!()
    expect(await titulosDelPlan(udId)).toEqual(['Uno', 'Dos', 'Tres'])
  })
})

// ——— Copiar y mover unidades a otro curso ———
//
// Los criterios reales del Decreto 61/2022: 2.º ciclo tiene «4.5» y 3.er ciclo
// no, así que 2.º→5.º es el caso auténtico de criterio sin equivalente.

async function unidadDe2oCiclo(criterios: string[]) {
  await sembrarCriterios()
  return crearUnidad({
    etapa: 'primaria',
    titulo: 'Habilidades con móvil',
    nivel: 3,
    trimestre: 1,
    computa: true,
    pesoTrimestre: 40,
    criterios,
  })
}

describe('mapearCriterios', () => {
  it('dentro del mismo ciclo pasa los criterios tal cual', async () => {
    await sembrarCriterios()
    const r = await mapearCriterios(['EF.2C.1.1', 'EF.2C.4.5'], 3, 4)
    expect(r.sinMapear).toEqual([])
    expect(r.mapeados.map((m) => m.destino)).toEqual(['EF.2C.1.1', 'EF.2C.4.5'])
  })

  it('al cambiar de ciclo remapea por posición', async () => {
    await sembrarCriterios()
    const r = await mapearCriterios(['EF.2C.1.1', 'EF.2C.3.1'], 3, 5)
    expect(r.mapeados).toEqual([
      { origen: 'EF.2C.1.1', destino: 'EF.3C.1.1' },
      { origen: 'EF.2C.3.1', destino: 'EF.3C.3.1' },
    ])
    expect(r.sinMapear).toEqual([])
  })

  it('deja sin mapear el criterio que no existe en el ciclo destino', async () => {
    await sembrarCriterios()
    // «4.5» está en 2.º ciclo y no en 3.er ciclo.
    const r = await mapearCriterios(['EF.2C.4.5'], 3, 5)
    expect(r.mapeados).toEqual([])
    expect(r.sinMapear).toEqual(['EF.2C.4.5'])
  })
})

describe('copiarUnidad', () => {
  it('copia TODAS las sesiones con su contenido íntegro (la regresión del bug)', async () => {
    await sembrarCriterios()
    const udId = await unidadDeTres()

    const { id } = await copiarUnidad(udId, 5)

    const copia = await db.unidades.get(id)
    const plan = [...(copia?.sesiones ?? [])].sort((a, b) => a.orden - b.orden)
    expect(plan).toHaveLength(3)
    expect(plan.map((s) => s.titulo)).toEqual(['Uno', 'Dos', 'Tres'])
    expect(plan.map((s) => s.orden)).toEqual([0, 1, 2])
    expect(plan[0].notas).toBe('Desarrollo de Uno.')
    expect(plan[0].recursosNecesarios).toBe('10 balones')

    // Ids nuevos: si compartieran id, editar una sería editar la otra.
    const origen = await db.unidades.get(udId)
    const idsOrigen = new Set(origen?.sesiones?.map((s) => s.id))
    expect(plan.every((s) => !idsOrigen.has(s.id))).toBe(true)
  })

  it('editar la copia no toca el original', async () => {
    await sembrarCriterios()
    const udId = await unidadDeTres()
    const { id } = await copiarUnidad(udId, 5)

    const copia = await db.unidades.get(id)
    await guardarSesionPlan(id, 5, copia!.sesiones![0].id, { titulo: 'Cambiada' })
    await eliminarSesionPlan(id, 5, copia!.sesiones![2].id)

    const origen = await db.unidades.get(udId)
    expect(origen?.sesiones).toHaveLength(3)
    expect([...origen!.sesiones!].sort((a, b) => a.orden - b.orden)[0].titulo).toBe('Uno')
  })

  it('dentro del mismo ciclo conserva los criterios y no marca nada por revisar', async () => {
    const udId = await unidadDe2oCiclo(['EF.2C.1.1', 'EF.2C.4.5'])

    const { id } = await copiarUnidad(udId, 4)

    const copia = await db.unidades.get(id)
    expect(copia?.criterios).toEqual(['EF.2C.1.1', 'EF.2C.4.5'])
    expect(copia?.criteriosSinMapear).toBeUndefined()
  })

  it('al cambiar de ciclo remapea y deja fuera lo que no encaja, anotándolo', async () => {
    const udId = await unidadDe2oCiclo(['EF.2C.1.1', 'EF.2C.4.5'])

    const { id } = await copiarUnidad(udId, 5)

    const copia = await db.unidades.get(id)
    expect(copia?.criterios).toEqual(['EF.3C.1.1'])
    expect(copia?.criteriosSinMapear).toEqual(['EF.2C.4.5'])
  })

  it('no hereda el peso del trimestre: llega el que se le pase', async () => {
    const udId = await unidadDe2oCiclo([])

    const porDefecto = await copiarUnidad(udId, 5)
    const conPeso = await copiarUnidad(udId, 5, { pesoTrimestre: 25 })

    const a = await db.unidades.get(porDefecto.id)
    const b = await db.unidades.get(conPeso.id)
    expect(a?.etapa === 'primaria' && a.pesosPorNivel[5]).toBe(0)
    expect(b?.etapa === 'primaria' && b.pesosPorNivel[5]).toBe(25)
  })

  it('anota de dónde viene y nace visible aunque el original esté archivado', async () => {
    const udId = await unidadDe2oCiclo([])
    await archivarUnidad(udId, true)

    const { id } = await copiarUnidad(udId, 5)

    const copia = await db.unidades.get(id)
    expect(copia?.copiadaDe).toBe(udId)
    expect(copia?.archivada).toBe(false)
    // El original sigue archivado y donde estaba.
    const origen = await db.unidades.get(udId)
    expect(origen?.archivada).toBe(true)
    expect(origen?.niveles).toEqual([3])
  })

  it('no crea alumnado, notas, observaciones ni asistencia, ni toca las sesiones colocadas', async () => {
    await sembrarCriterios()
    const udId = await unidadDeTres()
    await generarCursoCompleto(GRUPO_ID)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const colocadasAntes = await db.sesiones.count()

    await copiarUnidad(udId, 5)

    expect(await db.sesiones.count()).toBe(colocadasAntes)
    expect(await db.sesiones.where('udId').equals(udId).count()).toBe(3)
    expect(await db.alumnos.count()).toBe(0)
    expect(await db.valores.count()).toBe(0)
    expect(await db.observaciones.count()).toBe(0)
    expect(await db.asistencias.count()).toBe(0)
  })

  it('deshacer borra solo la copia', async () => {
    const udId = await unidadDe2oCiclo([])
    const { id, deshacer } = await copiarUnidad(udId, 5)

    await deshacer()

    expect(await db.unidades.get(id)).toBeUndefined()
    expect(await db.unidades.get(udId)).toBeDefined()
  })

  it('se niega en Infantil: no hay otro curso al que llevarla', async () => {
    const udId = await crearUnidad({ etapa: 'infantil', titulo: 'El bosque', trimestre: null })
    await expect(copiarUnidad(udId, 5)).rejects.toThrow(/2\.º ciclo entero/)
  })
})

describe('moverUnidad', () => {
  it('se bloquea si hay notas puestas, y no cambia nada', async () => {
    const udId = await unidadDe2oCiclo(['EF.2C.1.1'])
    const colId = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Prueba',
      tipo: 'numero',
      udId,
    })
    await guardarValor(colId, 'a1', { numero: 7 })

    await expect(moverUnidad(udId, 5)).rejects.toThrow(/Cópiala en su lugar/)

    const ud = await db.unidades.get(udId)
    expect(ud?.niveles).toEqual([3])
    expect(ud?.criterios).toEqual(['EF.2C.1.1'])
  })

  it('cambia de curso, remapea y no deja copia', async () => {
    const udId = await unidadDe2oCiclo(['EF.2C.1.1', 'EF.2C.4.5'])

    await moverUnidad(udId, 5)

    expect(await db.unidades.count()).toBe(1)
    const ud = await db.unidades.get(udId)
    expect(ud?.niveles).toEqual([5])
    expect(ud?.criterios).toEqual(['EF.3C.1.1'])
    expect(ud?.criteriosSinMapear).toEqual(['EF.2C.4.5'])
    expect(ud?.etapa === 'primaria' && ud.pesosPorNivel[5]).toBe(0)
  })

  it('conserva las filas de instrumento que dejan de encajar, sin criterio', async () => {
    const udId = await unidadDe2oCiclo(['EF.2C.4.5'])
    const colId = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Prueba',
      tipo: 'numero',
      udId,
    })
    const fila = (await db.filas.where('columnaId').equals(colId).toArray())[0]
    await db.filas.update(fila.id, { criterioId: 'EF.2C.4.5' })

    await moverUnidad(udId, 5)

    const despues = await db.filas.get(fila.id)
    expect(despues).toBeDefined()
    expect(despues?.criterioId).toBeNull()
    expect(despues?.descriptor).toBe(fila.descriptor)
  })

  it('deja las clases ya colocadas sin unidad, pero sin borrarlas', async () => {
    await sembrarCriterios()
    const udId = await unidadDeTres()
    await generarCursoCompleto(GRUPO_ID)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    const antes = await db.sesiones.count()

    await moverUnidad(udId, 5)

    expect(await db.sesiones.count()).toBe(antes)
    expect((await db.sesiones.toArray()).every((s) => s.udId === undefined)).toBe(true)
  })

  it('deshacer devuelve el curso, los criterios, las filas y las sesiones', async () => {
    await sembrarCriterios()
    const udId = await unidadDeTres()
    await db.unidades.update(udId, { criterios: ['EF.2C.4.5'] })
    const colId = await crearColumna({
      grupoId: GRUPO_ID,
      trimestre: 1,
      titulo: 'Prueba',
      tipo: 'numero',
      udId,
    })
    const fila = (await db.filas.where('columnaId').equals(colId).toArray())[0]
    await db.filas.update(fila.id, { criterioId: 'EF.2C.4.5' })
    await generarCursoCompleto(GRUPO_ID)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })

    const deshacer = await moverUnidad(udId, 5)
    await deshacer()

    const ud = await db.unidades.get(udId)
    expect(ud?.niveles).toEqual([3])
    expect(ud?.criterios).toEqual(['EF.2C.4.5'])
    expect((await db.filas.get(fila.id))?.criterioId).toBe('EF.2C.4.5')
    expect(await db.sesiones.where('udId').equals(udId).count()).toBe(3)
  })

  it('se niega en Infantil', async () => {
    const udId = await crearUnidad({ etapa: 'infantil', titulo: 'El bosque', trimestre: null })
    await expect(moverUnidad(udId, 5)).rejects.toThrow(/2\.º ciclo entero/)
  })
})

describe('resumenCopia', () => {
  it('reúne lo que hay que enseñar antes de confirmar', async () => {
    await sembrarCriterios()
    const udId = await unidadDeTres()
    await db.unidades.update(udId, { criterios: ['EF.2C.1.1', 'EF.2C.4.5'], trimestre: 1 })
    await generarCursoCompleto(GRUPO_ID)
    await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })

    const r = await resumenCopia(udId, 5)

    expect(r).toMatchObject({
      titulo: 'Habilidades con móvil',
      nivelOrigen: 3,
      cambiaDeCiclo: true,
      sesionesPlan: 3,
      sinMapear: ['EF.2C.4.5'],
      valores: 0,
      sesionesColocadas: 3,
    })
    expect(r.mapeados).toEqual([{ origen: 'EF.2C.1.1', destino: 'EF.3C.1.1' }])
  })

  it('suma el peso ya repartido en el trimestre destino, sin contar la propia unidad', async () => {
    await sembrarCriterios()
    const udId = await crearUnidad({
      etapa: 'primaria',
      titulo: 'La que se copia',
      nivel: 3,
      trimestre: 1,
      computa: true,
      pesoTrimestre: 40,
    })
    await crearUnidad({
      etapa: 'primaria',
      titulo: 'Ya en 5.º',
      nivel: 5,
      trimestre: 1,
      computa: true,
      pesoTrimestre: 70,
    })

    expect((await resumenCopia(udId, 5)).pesoOcupadoDestino).toBe(70)
    // Al mismo curso: la propia unidad no se cuenta dos veces.
    expect((await resumenCopia(udId, 3)).pesoOcupadoDestino).toBe(0)
  })
})

describe('marcarCriteriosRevisados', () => {
  it('vacía el aviso y se puede deshacer', async () => {
    const udId = await unidadDe2oCiclo(['EF.2C.4.5'])
    const { id } = await copiarUnidad(udId, 5)
    expect((await db.unidades.get(id))?.criteriosSinMapear).toEqual(['EF.2C.4.5'])

    const deshacer = await marcarCriteriosRevisados(id)
    expect((await db.unidades.get(id))?.criteriosSinMapear).toBeUndefined()

    await deshacer()
    expect((await db.unidades.get(id))?.criteriosSinMapear).toEqual(['EF.2C.4.5'])
  })
})

// ——— Unidad multi-curso ———

async function grupoPrimaria(id: string, nombre: string, nivel: number) {
  await db.grupos.put({
    id,
    cursoEscolarId: CURSO_ID,
    nombre,
    etapa: 'primaria',
    nivel,
    color: '#006A80',
    orden: 5,
    horario: [{ diaSemana: 4, horaInicio: '09:00', horaFin: '09:45' }],
  })
}

describe('unidad de un solo curso (no regresión)', () => {
  it('nace con un curso y su plan en ese curso', async () => {
    const udId = await unidadDeTres()
    const ud = await db.unidades.get(udId)
    expect(ud?.niveles).toEqual([3])
    expect(ud?.sesiones?.every((s) => s.nivel === 3)).toBe(true)
    expect(sesionesDe(ud!, 3)).toHaveLength(3)
  })

  it('llevar a un grupo coloca su plan igual que antes', async () => {
    const udId = await unidadDeTres()
    await generarCursoCompleto(GRUPO_ID)
    const r = await aplicarUnidadAGrupo({ udId, grupoId: GRUPO_ID, desde: '2026-09-07' })
    expect(r.colocadas).toBe(3)
  })
})

describe('añadir y quitar cursos', () => {
  it('bloquea añadir un curso de otro ciclo, y admite uno del mismo', async () => {
    const udId = await unidadDeTres() // 3º, 2.º ciclo

    // 5º es de 3.er ciclo: no.
    await expect(anadirCursoAUnidad(udId, 5, 'blanco')).rejects.toThrow(/ciclo/)
    // 4º es del mismo ciclo: sí.
    await anadirCursoAUnidad(udId, 4, 'blanco')
    expect((await db.unidades.get(udId))?.niveles).toEqual([3, 4])
  })

  it('«en blanco» no crea sesiones; «copiar de 3º» las crea en el curso nuevo', async () => {
    const udId = await unidadDeTres()

    await anadirCursoAUnidad(udId, 4, 'blanco')
    let ud = await db.unidades.get(udId)
    expect(sesionesDe(ud!, 4)).toHaveLength(0)

    // Copiar de 3º a 4º (mismo ciclo) al añadir:
    const ud2Id = await unidadDeTres()
    await anadirCursoAUnidad(ud2Id, 4, 3)
    ud = await db.unidades.get(ud2Id)
    const enCuatro = sesionesDe(ud!, 4)
    expect(enCuatro).toHaveLength(3)
    expect(enCuatro.map((s) => s.titulo)).toEqual(['Uno', 'Dos', 'Tres'])
    // Ids propios, no compartidos con los de 3º.
    const ids3 = new Set(sesionesDe(ud!, 3).map((s) => s.id))
    expect(enCuatro.every((s) => !ids3.has(s.id))).toBe(true)
  })

  it('quitar un curso borra solo sus sesiones y su peso', async () => {
    const udId = await unidadDeTres()
    await anadirCursoAUnidad(udId, 4, 3)
    await guardarPesosTrimestre(3, [{ udId, pesoTrimestre: 40 }])
    await guardarPesosTrimestre(4, [{ udId, pesoTrimestre: 25 }])

    await quitarCursoDeUnidad(udId, 4)

    const ud = await db.unidades.get(udId)
    expect(ud?.niveles).toEqual([3])
    expect(sesionesDe(ud!, 4)).toHaveLength(0)
    expect(sesionesDe(ud!, 3)).toHaveLength(3)
    expect(ud?.etapa === 'primaria' && ud.pesosPorNivel).toEqual({ 3: 40 })
  })

  it('quitar un curso con notas puestas en ese curso se bloquea', async () => {
    const udId = await unidadDeTres()
    await grupoPrimaria('g4', '4ºA', 4)
    await anadirCursoAUnidad(udId, 4, 'blanco')
    const colId = await crearColumna({
      grupoId: 'g4',
      trimestre: 1,
      titulo: 'Prueba de 4º',
      tipo: 'numero',
      udId,
    })
    await guardarValor(colId, 'a1', { numero: 7 })

    await expect(quitarCursoDeUnidad(udId, 4)).rejects.toThrow(/colgando|notas/)
    expect((await db.unidades.get(udId))?.niveles).toEqual([3, 4])
  })

  it('no se puede quitar el último curso', async () => {
    const udId = await unidadDeTres()
    await expect(quitarCursoDeUnidad(udId, 3)).rejects.toThrow(/único curso/)
  })

  it('Infantil no admite añadir cursos: ya es del ciclo entero', async () => {
    const udId = await crearUnidad({ etapa: 'infantil', titulo: 'El bosque', trimestre: null })
    await expect(anadirCursoAUnidad(udId, 4, 'blanco')).rejects.toThrow(/Infantil|2\.º ciclo/)
  })
})

describe('aplicarUnidadAGrupo con varios cursos', () => {
  it('coloca solo las sesiones del curso del grupo', async () => {
    const udId = await unidadDeTres() // 3º
    await anadirCursoAUnidad(udId, 4, 'blanco')
    // 4º tiene una sesión propia distinta.
    await anadirSesionPlan(udId, 4, { titulo: 'Solo de cuarto' })
    await grupoPrimaria('g4', '4ºA', 4)
    await generarCursoCompleto('g4')

    const r = await aplicarUnidadAGrupo({ udId, grupoId: 'g4', desde: '2026-09-07' })

    expect(r.colocadas).toBe(1)
    const colocadas = await db.sesiones.where('udId').equals(udId).toArray()
    expect(colocadas.map((s) => s.titulo)).toEqual(['Solo de cuarto'])
  })

  it('se niega si el grupo es de un curso que la unidad no abarca', async () => {
    const udId = await unidadDeTres() // 3º
    await grupoPrimaria('g4', '4ºA', 4)
    await expect(
      aplicarUnidadAGrupo({ udId, grupoId: 'g4', desde: '2026-09-07' }),
    ).rejects.toThrow(/no abarca/)
  })
})

describe('peso por curso', () => {
  it('cambiar el peso de 3º no toca el de 4º, y la nota usa el del curso del grupo', async () => {
    await sembrarCriterios()
    const udId = await crearUnidad({
      etapa: 'primaria',
      titulo: 'Con peso',
      nivel: 3,
      trimestre: 1,
      pesoTrimestre: 40,
    })
    await anadirCursoAUnidad(udId, 4, 'blanco')

    await guardarPesosTrimestre(4, [{ udId, pesoTrimestre: 25 }])

    const ud = await db.unidades.get(udId)
    expect(ud?.etapa === 'primaria' && ud.pesosPorNivel).toEqual({ 3: 40, 4: 25 })
  })

  it('unidadesDelCurso proyecta el peso del curso pedido', async () => {
    const udId = await crearUnidad({
      etapa: 'primaria',
      titulo: 'Con peso',
      nivel: 3,
      trimestre: 1,
      pesoTrimestre: 40,
    })
    await anadirCursoAUnidad(udId, 4, 'blanco')
    await guardarPesosTrimestre(4, [{ udId, pesoTrimestre: 25 }])

    const en3 = await unidadesDelCurso(3)
    const en4 = await unidadesDelCurso(4)
    expect(en3.find((u) => u.id === udId)?.pesoTrimestre).toBe(40)
    expect(en4.find((u) => u.id === udId)?.pesoTrimestre).toBe(25)
  })
})

describe('mover una unidad multi-curso', () => {
  it('se niega: hay que quitar cursos primero o copiar', async () => {
    const udId = await unidadDeTres()
    await anadirCursoAUnidad(udId, 4, 'blanco')
    await expect(moverUnidad(udId, 6)).rejects.toThrow(/cursos/)
  })
})

/**
 * Un grupo con DOS franjas el mismo día tiene dos clases, no una. Contar por
 * fechas —lo que hacía `fechasDeClase`— se comía la segunda de cada día: al
 * generar el curso salía la mitad de las sesiones, y al volcar una unidad se
 * quedaba media unidad sin colocar.
 */
describe('dos franjas el mismo día', () => {
  const MARTES = '2026-09-08'

  async function dosClasesLosMartes() {
    await db.grupos.update(GRUPO_ID, {
      horario: [
        { diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' },
        { diaSemana: 2, horaInicio: '12:30', horaFin: '13:15' },
      ],
    })
    return (await db.grupos.get(GRUPO_ID))!
  }

  it('huecosDeClase da dos entradas por día; fechasDeClase sigue dando una fecha', async () => {
    const grupo = await dosClasesLosMartes()
    const curso = (await db.cursos.get(CURSO_ID))!

    const huecos = huecosDeClase(grupo, curso).filter((h) => h.fecha === MARTES)
    expect(huecos).toEqual([
      { fecha: MARTES, franjaInicio: '10:00' },
      { fecha: MARTES, franjaInicio: '12:30' },
    ])
    // La fecha no se repite: quien solo necesita días sigue viendo lo de antes.
    expect(fechasDeClase(grupo, curso).filter((f) => f === MARTES)).toEqual([MARTES])
  })

  it('generar el curso crea una sesión por CLASE, y repetirlo no duplica nada', async () => {
    const grupo = await dosClasesLosMartes()
    const { resultado } = await generarCursoCompleto(GRUPO_ID)

    const delMartes = (await db.sesiones.where('grupoId').equals(GRUPO_ID).toArray()).filter(
      (s) => s.fecha === MARTES,
    )
    expect(delMartes.map((s) => s.franjaInicio).sort()).toEqual(['10:00', '12:30'])
    expect(resultado.creadas).toBe(resultado.total)

    const otra = await generarCursoCompleto(GRUPO_ID)
    expect(otra.resultado.creadas).toBe(0)
    expect(otra.resultado.existentes).toBe(resultado.total)
    expect(grupo.horario).toHaveLength(2)
  })

  it('una sesión sin franja ocupa la primera clase de su día', async () => {
    const grupo = await dosClasesLosMartes()
    await crearSesion(GRUPO_ID, MARTES) // sin franja: como antes de v24

    const ocupadas = clavesOcupadas(await db.sesiones.toArray(), grupo)
    expect(ocupadas.has(claveHueco({ fecha: MARTES, franjaInicio: '10:00' }))).toBe(true)
    expect(ocupadas.has(claveHueco({ fecha: MARTES, franjaInicio: '12:30' }))).toBe(false)

    // Generar el curso rellena solo la clase que faltaba, sin pisar la vieja.
    await generarCursoCompleto(GRUPO_ID)
    const delMartes = (await db.sesiones.toArray()).filter((s) => s.fecha === MARTES)
    expect(delMartes).toHaveLength(2)
  })
})
