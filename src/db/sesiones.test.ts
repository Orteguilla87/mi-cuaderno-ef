import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, nuevoId } from './db'
import {
  cancelarClase,
  eliminarSesionesNoLectivas,
  getSesiones,
  huecosCanceladosDe,
  huecosDe,
  restaurarClase,
  resumenSesion,
  reubicarSesionesNoLectivas,
  sesionesEnDiasNoLectivos,
} from './sesiones'
import { crearSesion, eliminarClase } from './planificador'
import { deshacerLote } from './lotes'

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

/**
 * El bug que motivó `db.clasesCanceladas`: borrar la sesión de un día no
 * quitaba la clase de las vistas, porque el hueco se genera del horario del
 * grupo y volvía a aparecer vacío en cada render.
 */
describe('clases canceladas de un día suelto', () => {
  const MARTES = '2026-09-08'
  const MARTES_SIGUIENTE = '2026-09-15'
  const SEMANA = { desde: '2026-09-07', hasta: '2026-09-11' }
  const SEMANA_SIGUIENTE = { desde: '2026-09-14', hasta: '2026-09-18' }

  async function otroGrupoLosMartes() {
    await db.grupos.put({
      id: 'g2',
      cursoEscolarId: CURSO_ID,
      nombre: '4ºB',
      etapa: 'primaria',
      nivel: 4,
      color: '#006A80',
      orden: 1,
      horario: [{ diaSemana: 2, horaInicio: '11:00', horaFin: '11:45' }],
    })
  }

  it('eliminar cancelando el hueco quita la clase de todas las vistas', async () => {
    const id = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Bote y conducción' })
    expect(await huecosDe(SEMANA)).toHaveLength(1)

    await eliminarClase(id, 'eliminar')

    // Las cuatro vistas de hueco (Hoy día, Hoy semana, Planificador semana y
    // Calendario semana) leen de `huecosDe`; Calendario mes, de `getSesiones`.
    expect(await huecosDe({ desde: MARTES, hasta: MARTES })).toHaveLength(0)
    expect(await huecosDe(SEMANA)).toHaveLength(0)
    expect(await getSesiones(SEMANA)).toHaveLength(0)
  })

  it('la cancelación persiste: releer la base no la resucita', async () => {
    const id = await crearSesion(GRUPO_ID, MARTES)
    await eliminarClase(id, 'eliminar')

    // Equivalente a recargar la app: nada en memoria, todo desde Dexie.
    expect(await db.clasesCanceladas.count()).toBe(1)
    expect(await huecosDe(SEMANA)).toHaveLength(0)
  })

  it('no afecta a la misma franja de otras semanas', async () => {
    const id = await crearSesion(GRUPO_ID, MARTES)
    await eliminarClase(id, 'eliminar')

    const siguiente = await huecosDe(SEMANA_SIGUIENTE)
    expect(siguiente).toHaveLength(1)
    expect(siguiente[0].fecha).toBe(MARTES_SIGUIENTE)
    // El horario del grupo no se ha tocado.
    expect((await db.grupos.get(GRUPO_ID))!.horario).toHaveLength(1)
  })

  it('no afecta a otros grupos del mismo día', async () => {
    await otroGrupoLosMartes()
    const id = await crearSesion(GRUPO_ID, MARTES)
    await eliminarClase(id, 'eliminar')

    const quedan = await huecosDe(SEMANA)
    expect(quedan).toHaveLength(1)
    expect(quedan[0].grupo.id).toBe('g2')
  })

  it('la clase cancelada se lista aparte, para poder restaurarla', async () => {
    const id = await crearSesion(GRUPO_ID, MARTES)
    await eliminarClase(id, 'eliminar')

    const canceladas = await huecosCanceladosDe(SEMANA)
    expect(canceladas).toHaveLength(1)
    expect(canceladas[0].grupo.id).toBe(GRUPO_ID)
    expect(canceladas[0].fecha).toBe(MARTES)
  })

  it('restaurar devuelve el hueco a todas las vistas', async () => {
    const id = await crearSesion(GRUPO_ID, MARTES)
    await eliminarClase(id, 'eliminar')

    await restaurarClase(GRUPO_ID, MARTES)
    expect(await huecosDe(SEMANA)).toHaveLength(1)
    expect(await huecosCanceladosDe(SEMANA)).toHaveLength(0)
  })

  it('deshacer el borrado devuelve sesión y clase de una vez', async () => {
    const id = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Bote y conducción' })
    const { lote } = await eliminarClase(id, 'eliminar')

    await deshacerLote(lote)

    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(1)
    expect(huecos[0].sesion?.titulo).toBe('Bote y conducción')
    expect(await db.clasesCanceladas.count()).toBe(0)
  })

  it('una sesión persistida siempre se ve, aunque quede una cancelación vieja', async () => {
    await cancelarClase(GRUPO_ID, MARTES)
    expect(await huecosDe(SEMANA)).toHaveLength(0)

    // Volver a planificar ese día retira la excepción (y, aun antes de eso,
    // `huecosDe` nunca esconde un hueco que tiene sesión).
    await crearSesion(GRUPO_ID, MARTES, { titulo: 'Otra cosa' })
    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(1)
    expect(huecos[0].sesion?.titulo).toBe('Otra cosa')
    expect(await db.clasesCanceladas.count()).toBe(0)
  })

  it('cancelar un hueco vacío no borra nada y se deshace', async () => {
    const deshacer = await cancelarClase(GRUPO_ID, MARTES)
    expect(await huecosDe(SEMANA)).toHaveLength(0)

    await deshacer()
    expect(await huecosDe(SEMANA)).toHaveLength(1)
  })

  it('cancelar dos veces el mismo día no duplica la excepción', async () => {
    await cancelarClase(GRUPO_ID, MARTES)
    await cancelarClase(GRUPO_ID, MARTES)
    expect(await db.clasesCanceladas.count()).toBe(1)
  })

  it('una excepción con franja solo tapa esa franja', async () => {
    await db.grupos.update(GRUPO_ID, {
      horario: [
        { diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' },
        { diaSemana: 2, horaInicio: '12:00', horaFin: '12:45' },
      ],
    })
    await cancelarClase(GRUPO_ID, MARTES, '10:00')

    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(1)
    expect(huecos[0].horaInicio).toBe('12:00')
  })
})

describe('resumenSesion', () => {
  it('cuenta lo que se pierde y lo que sobrevive al borrado', async () => {
    await db.alumnos.bulkPut([
      { id: 'a1', grupoId: GRUPO_ID, nombre: 'Ana', apellidos: 'Pérez', alias: 'Ana', activo: true },
      { id: 'a2', grupoId: GRUPO_ID, nombre: 'Luis', apellidos: 'Gil', alias: 'Luis', activo: true },
    ])
    await db.asistencias.put({
      id: nuevoId(),
      alumnoId: 'a1',
      fecha: '2026-09-08',
      estado: 'presente',
      chandal: true,
    })
    await db.observaciones.put({
      id: nuevoId(),
      alumnoId: 'a2',
      grupoId: GRUPO_ID,
      fecha: '2026-09-08',
      tipo: 'conducta',
      signo: '+',
      texto: 'Ayuda a recoger',
      tags: [],
    })
    const id = await crearSesion(GRUPO_ID, '2026-09-08', {
      juegos: [{ gameId: 'j1', nombre: 'El pañuelo' }],
      notas: 'Por parejas',
      valoracion: 4,
    })

    const resumen = (await resumenSesion(id))!
    expect(resumen.juegos).toBe(1)
    expect(resumen.tieneNotas).toBe(true)
    expect(resumen.tieneValoracion).toBe(true)
    // Asistencia y observaciones van por fecha y grupo: no se borran con la sesión.
    expect(resumen.asistencias).toBe(1)
    expect(resumen.observaciones).toBe(1)
  })
})

/**
 * El bug de las DOS clases el mismo día (§ v24 en `db.ts`).
 *
 * Un grupo con dos franjas separadas —a primera hora y después del recreo—
 * solo enseñaba una: la sesión se buscaba por `grupoId+fecha` con un `find`,
 * así que las dos franjas resolvían a la MISMA sesión. Y la asistencia, por
 * `alumnoId+fecha`, hacía que pasar lista en la segunda sobrescribiera la
 * primera: eso era pérdida de datos, no una molestia visual.
 */
describe('dos clases del mismo grupo el mismo día', () => {
  const MARTES = '2026-09-08'
  const SEMANA = { desde: '2026-09-07', hasta: '2026-09-11' }

  async function grupoConDosClasesElMartes() {
    await db.grupos.update(GRUPO_ID, {
      horario: [
        { diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' },
        { diaSemana: 2, horaInicio: '12:30', horaFin: '13:15' },
      ],
    })
  }

  it('las dos aparecen, cada una con su sesión, en huecos y en sesiones', async () => {
    await grupoConDosClasesElMartes()
    const a = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Bote', franjaInicio: '10:00' })
    const b = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Saltos', franjaInicio: '12:30' })

    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(2)
    expect(huecos.map((h) => h.sesion?.id)).toEqual([a, b])
    // Cada una hereda la hora de SU franja, no la de la primera del día.
    expect(huecos.map((h) => h.horaInicio)).toEqual(['10:00', '12:30'])
    expect(huecos.map((h) => h.franjaInicio)).toEqual(['10:00', '12:30'])

    // Calendario > Mes lee de `getSesiones`: también las dos.
    const sesiones = await getSesiones(SEMANA)
    expect(sesiones.map((s) => s.sesion.id)).toEqual([a, b])
    expect(sesiones.map((s) => s.horaFin)).toEqual(['10:45', '13:15'])
  })

  it('se ordenan por hora aunque se creen al revés', async () => {
    await grupoConDosClasesElMartes()
    await crearSesion(GRUPO_ID, MARTES, { titulo: 'Tarde', franjaInicio: '12:30' })
    await crearSesion(GRUPO_ID, MARTES, { titulo: 'Mañana', franjaInicio: '10:00' })

    const huecos = await huecosDe(SEMANA)
    expect(huecos.map((h) => h.sesion?.titulo)).toEqual(['Mañana', 'Tarde'])
  })

  it('planificar solo una deja la otra como hueco vacío, no como copia suya', async () => {
    await grupoConDosClasesElMartes()
    const a = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Bote', franjaInicio: '10:00' })

    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(2)
    expect(huecos[0].sesion?.id).toBe(a)
    expect(huecos[1].sesion).toBeUndefined()
    expect(huecos[1].horaInicio).toBe('12:30')
  })

  it('eliminar una de las dos no elimina ni desplaza la otra', async () => {
    await grupoConDosClasesElMartes()
    const a = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Bote', franjaInicio: '10:00' })
    const b = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Saltos', franjaInicio: '12:30' })

    await eliminarClase(a, 'eliminar')

    // Solo se cancela la franja de la eliminada: la otra clase sigue en pie.
    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(1)
    expect(huecos[0].sesion?.id).toBe(b)
    expect(huecos[0].sesion?.titulo).toBe('Saltos')
    // La superviviente sigue en su franja: no se ha adelantado a la vacante.
    expect((await db.sesiones.get(b))!.franjaInicio).toBe('12:30')
  })

  it('una sesión sin franja (anterior a v24) ocupa la primera clase del día', async () => {
    await grupoConDosClasesElMartes()
    const id = nuevoId()
    await db.sesiones.put({
      id,
      grupoId: GRUPO_ID,
      fecha: MARTES,
      titulo: 'Heredada',
      juegos: [],
      notas: '',
      recursos: [],
    })

    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(2)
    expect(huecos[0].sesion?.id).toBe(id)
    expect(huecos[1].sesion).toBeUndefined()
  })

  it('un grupo con una sola clase al día se comporta exactamente como antes', async () => {
    const id = await crearSesion(GRUPO_ID, MARTES, { titulo: 'Única', franjaInicio: '10:00' })
    const huecos = await huecosDe(SEMANA)
    expect(huecos).toHaveLength(1)
    expect(huecos[0].sesion?.id).toBe(id)
    expect(huecos[0].horaInicio).toBe('10:00')
  })
})

/**
 * «Preparar el material» del día se arma con lo que devuelve `huecosDe`: si
 * ahí solo llegaba una de las dos clases, la lista salía a medias por mucho
 * que el texto se generase bien.
 */
describe('material del día con dos clases del mismo grupo', () => {
  it('las dos sesiones llegan con su propio material', async () => {
    await db.grupos.update(GRUPO_ID, {
      horario: [
        { diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' },
        { diaSemana: 2, horaInicio: '12:30', horaFin: '13:15' },
      ],
    })
    await crearSesion(GRUPO_ID, '2026-09-08', {
      franjaInicio: '10:00',
      recursosNecesarios: 'Material: 12 conos, 4 aros',
    })
    await crearSesion(GRUPO_ID, '2026-09-08', {
      franjaInicio: '12:30',
      recursosNecesarios: 'Material: 6 picas',
    })

    const huecos = await huecosDe({ desde: '2026-09-07', hasta: '2026-09-11' })
    expect(huecos.map((h) => h.sesion?.recursosNecesarios)).toEqual([
      'Material: 12 conos, 4 aros',
      'Material: 6 picas',
    ])
  })
})
