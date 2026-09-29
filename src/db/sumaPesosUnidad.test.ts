import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { crearColumna, crearRubrica, guardarValor, sumaPesosDeLaUnidad } from './cuaderno'
import { calificarAlumno, datosCalificacion } from './notas'
import type { Grupo } from './types'

/**
 * La suma de pesos que se enseña al ponderar es la de UN grupo. Antes se sumaba
 * por unidad a secas: la misma rúbrica del banco al 100 % en 3ºA y en 3ºB se
 * enseñaba como 200 %. El motor ya contaba bien; esto sujeta que la pantalla
 * cuente lo mismo que él.
 */

function grupo(id: string, nombre: string, nivel: number): Grupo {
  return { id, cursoEscolarId: 'c1', nombre, etapa: 'primaria', nivel, color: '#006A80', orden: 0, horario: [] }
}

const UD = 'ud1'

beforeEach(async () => {
  await db.grupos.bulkPut([grupo('g3a', '3ºA', 3), grupo('g3b', '3ºB', 3), grupo('g4a', '4ºA', 4)])
  await db.unidades.put({
    id: UD,
    etapa: 'primaria',
    niveles: [3, 4],
    trimestre: 1,
    titulo: 'Juegos de raqueta',
    criterios: [],
    computa: true,
    pesosPorNivel: { 3: 100, 4: 100 },
  })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

function suma(grupoId: string, extra: Partial<Parameters<typeof sumaPesosDeLaUnidad>[0]> = {}) {
  return sumaPesosDeLaUnidad({
    grupoId,
    trimestre: 1,
    udId: UD,
    excluirColumnaId: null,
    pesoEnEdicion: 0,
    cuentaLaEditada: false,
    ...extra,
  })
}

async function rubricaEn(grupoId: string, rubricaId: string, pesoUd: number) {
  return crearColumna({ grupoId, trimestre: 1, titulo: 'Rúbrica raqueta', tipo: 'rubrica', rubricaId, udId: UD, pesoUd })
}

describe('suma de pesos de la unidad, por grupo', () => {
  it('la MISMA rúbrica del banco al 100 % en 3ºA y 3ºB da 100 % en cada uno, no 200', async () => {
    const rubrica = await crearRubrica('Raqueta')
    const enA = await rubricaEn('g3a', rubrica, 100)
    const enB = await rubricaEn('g3b', rubrica, 100)

    expect((await suma('g3a')).suma).toBe(100)
    expect((await suma('g3b')).suma).toBe(100)

    // Y editando cada una, con su propio peso en la casilla.
    expect((await suma('g3a', { excluirColumnaId: enA, pesoEnEdicion: 100, cuentaLaEditada: true })).suma).toBe(100)
    expect((await suma('g3b', { excluirColumnaId: enB, pesoEnEdicion: 100, cuentaLaEditada: true })).suma).toBe(100)
  })

  it('cambiar el peso en 3ºA no altera la suma de 3ºB', async () => {
    const rubrica = await crearRubrica('Raqueta')
    const enA = await rubricaEn('g3a', rubrica, 100)
    await rubricaEn('g3b', rubrica, 100)

    await db.columnas.update(enA, { pesoUd: 40 })
    expect((await suma('g3a')).suma).toBe(40)
    expect((await suma('g3b')).suma).toBe(100)
  })

  it('unidad multi-curso (3º y 4º): la suma no mezcla cursos', async () => {
    await crearColumna({ grupoId: 'g3a', trimestre: 1, titulo: 'Test', tipo: 'numero', udId: UD, pesoUd: 60 })
    await crearColumna({ grupoId: 'g4a', trimestre: 1, titulo: 'Test', tipo: 'numero', udId: UD, pesoUd: 70 })

    expect((await suma('g3a')).suma).toBe(60)
    expect((await suma('g4a')).suma).toBe(70)
  })

  it('un solo grupo: igual que siempre —calificables, sin la editada, más su peso en edición—', async () => {
    const a = await crearColumna({ grupoId: 'g3a', trimestre: 1, titulo: 'A', tipo: 'numero', udId: UD, pesoUd: 30 })
    await crearColumna({ grupoId: 'g3a', trimestre: 1, titulo: 'B', tipo: 'numero', udId: UD, pesoUd: 50 })
    // No califica: no suma aunque tenga peso.
    await crearColumna({ grupoId: 'g3a', trimestre: 1, titulo: 'Notas', tipo: 'texto', udId: UD, pesoUd: 20 })
    // Otra unidad: no suma.
    await crearColumna({ grupoId: 'g3a', trimestre: 1, titulo: 'C', tipo: 'numero', udId: 'otra', pesoUd: 20 })

    expect(await suma('g3a')).toEqual({ suma: 80, gruposConLaUnidad: 1 })
    expect((await suma('g3a', { excluirColumnaId: a, pesoEnEdicion: 50, cuentaLaEditada: true })).suma).toBe(100)
  })

  it('cuenta los grupos que usan la unidad, para el aviso', async () => {
    const rubrica = await crearRubrica('Raqueta')
    await rubricaEn('g3a', rubrica, 100)
    expect((await suma('g3a')).gruposConLaUnidad).toBe(1)
    await rubricaEn('g3b', rubrica, 100)
    expect((await suma('g3a')).gruposConLaUnidad).toBe(2)
  })
})

describe('el motor de notas no cambia', () => {
  it('la nota de 3ºA sale de sus instrumentos, haya o no instrumentos de 3ºB y 4ºA en la unidad', async () => {
    const a1 = await crearColumna({ grupoId: 'g3a', trimestre: 1, titulo: 'A1', tipo: 'numero', udId: UD, pesoUd: 50 })
    const a2 = await crearColumna({ grupoId: 'g3a', trimestre: 1, titulo: 'A2', tipo: 'numero', udId: UD, pesoUd: 50 })
    await guardarValor(a1, 'alu', { numero: 10 })
    await guardarValor(a2, 'alu', { numero: 0 })

    const antes = calificarAlumno(await datosCalificacion('g3a', 1), 'alu', 1)
    expect(antes.nota).toBe(5)

    await crearColumna({ grupoId: 'g3b', trimestre: 1, titulo: 'B1', tipo: 'numero', udId: UD, pesoUd: 100 })
    await crearColumna({ grupoId: 'g4a', trimestre: 1, titulo: 'C1', tipo: 'numero', udId: UD, pesoUd: 100 })

    const despues = calificarAlumno(await datosCalificacion('g3a', 1), 'alu', 1)
    expect(despues).toEqual(antes)
  })
})
