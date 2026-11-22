import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { deshacerLote } from './lotes'
import { gruposConClaseEn, pasarProgramacionDia, previsualizarPasarDia } from './pasarDia'
import { eliminarClase, generarCursoCompleto } from './planificador'
import type { Grupo, Sesion } from './types'

/**
 * «Pasar programación al siguiente día»: en cada grupo marcado, las k clases
 * del día quedan vacías y lo programado avanza k posiciones hasta las primeras
 * sesiones vacías. Nada se crea, nada se borra, y se deshace entero.
 */

const CURSO_ID = 'curso1'
const D = '2026-11-23' // lunes

const grupo = (id: string, nombre: string, nivel: number, horario: Grupo['horario']): Grupo => ({
  id,
  cursoEscolarId: CURSO_ID,
  nombre,
  etapa: 'primaria',
  nivel,
  color: '#006A80',
  orden: 0,
  horario,
})

// EF de 3.º: lunes y miércoles. Lengua de 4.º: dos clases el lunes y una el jueves.
const EF3 = grupo('ef3', '3ºA', 3, [
  { diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' },
  { diaSemana: 3, horaInicio: '11:00', horaFin: '11:45' },
])
const LEN4 = grupo('len4', 'Lengua 4º', 4, [
  { diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' },
  { diaSemana: 1, horaInicio: '12:00', horaFin: '12:45' },
  { diaSemana: 4, horaInicio: '10:00', horaFin: '10:45' },
])
const EF4 = grupo('ef4', '4ºB', 4, [
  { diaSemana: 1, horaInicio: '10:00', horaFin: '10:45' },
  { diaSemana: 5, horaInicio: '10:00', horaFin: '10:45' },
])

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
  for (const g of [EF3, LEN4, EF4]) {
    await db.grupos.put(g)
    await generarCursoCompleto(g.id)
  }
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

/** Sesiones del grupo desde D, en orden real (fecha y franja). */
async function desdeD(grupoId: string): Promise<Sesion[]> {
  return (await db.sesiones.where('grupoId').equals(grupoId).toArray())
    .filter((s) => s.fecha >= D)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''))
}

/** Pone títulos (con unidad y recursos, para ver que viaja todo) desde D; `null` = vacía. */
async function programar(grupoId: string, titulos: (string | null)[]) {
  const lista = await desdeD(grupoId)
  for (const [i, t] of titulos.entries())
    if (t !== null)
      await db.sesiones.update(lista[i].id, {
        titulo: t,
        udId: 'ud-' + t,
        recursos: [{ tipo: 'nota', valor: 'n-' + t }],
        recursosNecesarios: 'conos ' + t,
      })
}

async function titulos(grupoId: string, n: number): Promise<string[]> {
  return (await desdeD(grupoId)).slice(0, n).map((s) => s.titulo)
}

async function foto() {
  const porId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id)
  return {
    sesiones: (await db.sesiones.toArray()).sort(porId),
    sinClase: (await db.contenidoSinClase.toArray()).sort(porId),
  }
}

describe('pasar programación al siguiente día', () => {
  it('marca por defecto los grupos con clase ese día', async () => {
    expect((await gruposConClaseEn(D)).map((g) => g.id).sort()).toEqual(['ef3', 'ef4', 'len4'])
    expect(await gruposConClaseEn('2026-11-22')).toEqual([]) // domingo
  })

  it('1 · una clase en D: avanza 1 y se para en la primera vacía; lo posterior, intacto', async () => {
    await programar('ef3', ['A', 'B', 'C', null, 'E'])
    const previa = await previsualizarPasarDia(D, ['ef3'])
    const g = previa.grupos.find((x) => x.grupoId === 'ef3')!
    expect(g.k).toBe(1)
    expect(g.movimientos.map((m) => m.titulo)).toEqual(['A', 'B', 'C'])
    expect(g.seDetieneEn).toHaveLength(1)

    await pasarProgramacionDia(D, ['ef3'])
    expect(await titulos('ef3', 5)).toEqual(['', 'A', 'B', 'C', 'E'])
    // Todo el contenido viaja: unidad, enlaces y notas, material.
    const [, a] = await desdeD('ef3')
    expect(a).toMatchObject({ udId: 'ud-A', recursos: [{ tipo: 'nota', valor: 'n-A' }], recursosNecesarios: 'conos A' })
    const [d0] = await desdeD('ef3')
    expect(d0.udId).toBeUndefined()
    expect(d0.recursosNecesarios).toBeUndefined()
  })

  it('2 · Lengua con 2 clases en D: las dos vacías y todo avanza 2', async () => {
    await programar('len4', ['A', 'B', 'C', 'D', 'E', 'F', null, null, 'Z'])
    const previa = await previsualizarPasarDia(D, ['len4'])
    expect(previa.grupos.find((x) => x.grupoId === 'len4')!.k).toBe(2)

    await pasarProgramacionDia(D, ['len4'])
    expect(await titulos('len4', 9)).toEqual(['', '', 'A', 'B', 'C', 'D', 'E', 'F', 'Z'])
  })

  it('3 · un festivo entre D y la siguiente clase se salta', async () => {
    await programar('ef3', ['A', 'X', null]) // lun 23, mié 25, lun 30
    const curso = (await db.cursos.get(CURSO_ID))!
    await db.cursos.update(CURSO_ID, { festivos: [...curso.festivos, '2026-11-25'] })

    await pasarProgramacionDia(D, ['ef3'])
    const [lun23, mie25, lun30] = await desdeD('ef3')
    expect(lun23.titulo).toBe('')
    expect(mie25.titulo).toBe('X') // en festivo: ni recibe ni cede
    expect(lun30.titulo).toBe('A')
  })

  it('4 · sin vacías hasta fin de curso: aviso, y nada se borra', async () => {
    const todas = await desdeD('ef3')
    await programar('ef3', todas.map((_, i) => `S${i}`))
    const ultimo = `S${todas.length - 1}`

    const previa = await previsualizarPasarDia(D, ['ef3'])
    const g = previa.grupos.find((x) => x.grupoId === 'ef3')!
    expect(g.sinUbicacion.map((x) => x.titulo)).toEqual([ultimo])
    expect(g.desborde).toBe('cancelar') // lo seguro, por defecto
    expect(g.seAplica).toBe(false)

    // Cancelar ese grupo: queda exactamente igual.
    const antes = await foto()
    const { lote } = await pasarProgramacionDia(D, ['ef3'])
    expect(lote).toBeNull()
    expect(await foto()).toEqual(antes)

    // Guardar en la bandeja: todos los títulos siguen existiendo.
    await pasarProgramacionDia(D, ['ef3'], { ef3: 'bandeja' })
    const tras = (await db.sesiones.where('grupoId').equals('ef3').toArray()).map((s) => s.titulo)
    const aparcados = (await db.contenidoSinClase.toArray()).map((c) => c.contenido.titulo)
    expect(aparcados).toEqual([ultimo])
    expect([...tras, ...aparcados].filter(Boolean).sort()).toEqual(todas.map((_, i) => `S${i}`).sort())
    // Y no se ha creado ninguna sesión.
    expect(await db.sesiones.where('grupoId').equals('ef3').count()).toBe(
      antes.sesiones.filter((s) => s.grupoId === 'ef3').length,
    )
  })

  it('5 · un grupo desmarcado queda intacto', async () => {
    await programar('ef3', ['A', 'B', null])
    await programar('ef4', ['P', 'Q', null])
    const ef4Antes = await desdeD('ef4')
    await pasarProgramacionDia(D, ['ef3'])
    expect(await desdeD('ef4')).toEqual(ef4Antes)
    expect(await titulos('ef3', 3)).toEqual(['', 'A', 'B'])
  })

  it('6 · deshacer devuelve todos los grupos exactamente como estaban', async () => {
    await programar('ef3', ['A', 'B', null])
    await programar('len4', ['A', 'B', 'C', null, 'E'])
    const todas = await desdeD('ef4')
    await programar('ef4', todas.map((_, i) => `S${i}`))
    const antes = await foto()

    const { lote } = await pasarProgramacionDia(D, ['ef3', 'len4', 'ef4'], { ef4: 'bandeja' })
    expect(lote?.grupoIds?.sort()).toEqual(['ef3', 'ef4', 'len4'])
    expect(await foto()).not.toEqual(antes)

    await deshacerLote(lote!)
    expect(await foto()).toEqual(antes)
  })

  it('7 · k=1 da lo mismo que «Mover a la derecha»', async () => {
    await programar('ef3', ['A', 'B', 'C', null, 'E'])
    const { lote } = await pasarProgramacionDia(D, ['ef3'])
    const porPasar = await desdeD('ef3')
    await deshacerLote(lote!)

    const [primera] = await desdeD('ef3')
    await eliminarClase(primera.id, 'vaciar')
    expect(await desdeD('ef3')).toEqual(porPasar)
  })

  it('avisa si un grupo del mismo ciclo deja de ir a la par', async () => {
    // 3ºA y 4ºB son del 2.º ciclo: uno se para enseguida, el otro más tarde.
    await programar('ef3', ['A', null])
    await programar('ef4', ['P', 'Q', 'R', null])
    const previa = await previsualizarPasarDia(D, ['ef3', 'ef4'])
    expect(previa.desalineados).toHaveLength(1)
    expect(previa.desalineados[0]).toMatch(/2\.º ciclo/)

    // Desmarcar uno también se avisa.
    const otra = await previsualizarPasarDia(D, ['ef3'])
    expect(otra.desalineados[0]).toMatch(/4ºB no se corre/)
  })
})

describe('bandeja «Sin clase asignada»', () => {
  it('colocar y descartar, con deshacer', async () => {
    const { colocarSinClase, descartarSinClase } = await import('./sinClase')
    const todas = await desdeD('ef3')
    await programar('ef3', todas.map((_, i) => `S${i}`))
    await pasarProgramacionDia(D, ['ef3'], { ef3: 'bandeja' })
    const [aparcado] = await db.contenidoSinClase.toArray()
    const [d0] = await desdeD('ef3') // D quedó vacía

    const deshacer = await colocarSinClase(aparcado.id, d0.id)
    expect((await db.sesiones.get(d0.id))!.titulo).toBe(aparcado.contenido.titulo)
    expect(await db.contenidoSinClase.count()).toBe(0)
    await deshacer()
    expect((await db.sesiones.get(d0.id))!.titulo).toBe('')
    expect(await db.contenidoSinClase.count()).toBe(1)

    const volver = await descartarSinClase(aparcado.id)
    expect(await db.contenidoSinClase.count()).toBe(0)
    await volver()
    expect(await db.contenidoSinClase.get(aparcado.id)).toEqual(aparcado)
  })
})
