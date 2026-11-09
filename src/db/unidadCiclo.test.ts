import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  adaptarSesionPlan,
  anadirCursoAUnidad,
  anadirSesionPlan,
  aplicarVolcado,
  convertirEnUnidadDeCiclo,
  copiarUnidad,
  crearUnidad,
  eliminarSesionPlan,
  generarCursoCompleto,
  guardarSesionPlan,
  importarUnidad,
  motivoNoAdmiteCurso,
  moverSesionPlan,
  previaConversionCiclo,
  sesionesDe,
  volverAVersionComun,
} from './planificador'
import type { FranjaHorario, UnidadPrimaria } from './types'

/**
 * Unidades de ciclo: una unidad, dos cursos, sesiones escritas UNA vez.
 *
 * Los criterios de Primaria son del ciclo, así que 1.º y 2.º comparten unidad
 * sin duplicarla. Lo propio de cada curso —una sesión adaptada— es la
 * excepción, y vive dentro de la sesión común.
 */

const CURSO_ID = 'curso1'
const HORARIO: FranjaHorario[] = [
  { diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' },
  { diaSemana: 3, horaInicio: '10:00', horaFin: '10:45' },
]

async function grupo(id: string, nivel: number) {
  await db.grupos.put({
    id,
    cursoEscolarId: CURSO_ID,
    nombre: `${nivel}º ${id}`,
    etapa: 'primaria',
    nivel,
    color: '#006A80',
    orden: 0,
    horario: HORARIO,
  })
  await generarCursoCompleto(id)
}

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
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

const sesionesImportadas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    titulo: `S${i + 1}`,
    descripcion: `Desarrollo ${i + 1}`,
    recursos: [],
    enlacesYNotas: '',
  }))

async function unidadDeCiclo(n = 8, nivel = 1) {
  const { id } = await importarUnidad({
    etapa: 'primaria',
    nivel,
    ambito: 'ciclo',
    titulo: 'Habilidades',
    sesiones: sesionesImportadas(n),
  })
  return id
}

const leer = async (id: string) => (await db.unidades.get(id))!

describe('unidad de ciclo', () => {
  it('8 sesiones se ven en 1º y 2º sin duplicarse', async () => {
    const id = await unidadDeCiclo(8)
    const u = await leer(id)
    expect(u.niveles).toEqual([1, 2])
    expect((u as UnidadPrimaria).pesosPorNivel).toEqual({ 1: 0, 2: 0 })
    expect(u.sesiones).toHaveLength(8)
    expect(sesionesDe(u, 1).map((s) => s.titulo)).toEqual(sesionesDe(u, 2).map((s) => s.titulo))
    expect(sesionesDe(u, 1)).toHaveLength(8)
    // Mismo id desde los dos cursos: es la misma sesión.
    expect(sesionesDe(u, 1)[0].id).toBe(sesionesDe(u, 2)[0].id)
    expect(sesionesDe(u, 2)[0].nivel).toBe(2)
  })

  it('editar una sesión común la cambia en los dos cursos', async () => {
    const id = await unidadDeCiclo(3)
    const s = sesionesDe(await leer(id), 1)[1]
    await guardarSesionPlan(id, 1, s.id, { titulo: 'Equilibrio' })
    const u = await leer(id)
    expect(sesionesDe(u, 1)[1].titulo).toBe('Equilibrio')
    expect(sesionesDe(u, 2)[1].titulo).toBe('Equilibrio')
  })

  it('añadir, mover y eliminar actúan sobre la secuencia común', async () => {
    const id = await unidadDeCiclo(2)
    await anadirSesionPlan(id, 2, { titulo: 'S3' })
    let u = await leer(id)
    expect(sesionesDe(u, 1).map((s) => s.titulo)).toEqual(['S1', 'S2', 'S3'])
    await moverSesionPlan(id, 1, sesionesDe(u, 1)[2].id, -1)
    u = await leer(id)
    expect(sesionesDe(u, 2).map((s) => s.titulo)).toEqual(['S1', 'S3', 'S2'])
    await eliminarSesionPlan(id, 2, sesionesDe(u, 2)[0].id)
    u = await leer(id)
    expect(sesionesDe(u, 1).map((s) => s.titulo)).toEqual(['S3', 'S2'])
  })

  it('adaptar una sesión para 2º no altera la de 1º', async () => {
    const id = await unidadDeCiclo(3)
    const s = sesionesDe(await leer(id), 2)[0]
    await adaptarSesionPlan(id, 2, s.id)
    await guardarSesionPlan(id, 2, s.id, { titulo: 'S1 con aros', notas: 'Más difícil' })
    const u = await leer(id)
    expect(sesionesDe(u, 2)[0]).toMatchObject({ titulo: 'S1 con aros', notas: 'Más difícil', adaptada: true })
    expect(sesionesDe(u, 1)[0]).toMatchObject({ titulo: 'S1', notas: 'Desarrollo 1', adaptada: false })
    // Editar la común desde 1º ya no alcanza a la adaptada de 2º.
    await guardarSesionPlan(id, 1, s.id, { titulo: 'S1 nueva' })
    const v = await leer(id)
    expect(sesionesDe(v, 1)[0].titulo).toBe('S1 nueva')
    expect(sesionesDe(v, 2)[0].titulo).toBe('S1 con aros')
    // El resto sigue compartido.
    expect(sesionesDe(v, 2)[1].adaptada).toBe(false)
  })

  it('volver a la versión común descarta la adaptación, y se puede deshacer', async () => {
    const id = await unidadDeCiclo(2)
    const s = sesionesDe(await leer(id), 2)[0]
    await adaptarSesionPlan(id, 2, s.id)
    await guardarSesionPlan(id, 2, s.id, { titulo: 'Propia' })
    const deshacer = await volverAVersionComun(id, 2, s.id)
    let u = await leer(id)
    expect(sesionesDe(u, 2)[0]).toMatchObject({ titulo: 'S1', adaptada: false })
    expect(u.sesiones![0].adaptaciones).toBeUndefined()
    await deshacer()
    u = await leer(id)
    expect(sesionesDe(u, 2)[0]).toMatchObject({ titulo: 'Propia', adaptada: true })
  })

  it('el volcado en 1ºA y 2ºB coloca la versión de cada curso', async () => {
    await grupo('1A', 1)
    await grupo('2B', 2)
    const id = await unidadDeCiclo(3)
    const s = sesionesDe(await leer(id), 2)[1]
    await adaptarSesionPlan(id, 2, s.id)
    await guardarSesionPlan(id, 2, s.id, { titulo: 'S2 para 2º' })

    await aplicarVolcado({ udId: id, grupoId: '1A', desde: '2026-09-07', modo: 'saltar' })
    const r = await aplicarVolcado({ udId: id, grupoId: '2B', desde: '2026-09-07', modo: 'saltar' })

    const titulos = async (g: string) =>
      (await db.sesiones.where('grupoId').equals(g).toArray())
        .filter((x) => x.udId === id)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((x) => x.titulo)
    expect(await titulos('1A')).toEqual(['S1', 'S2', 'S3'])
    expect(await titulos('2B')).toEqual(['S1', 'S2 para 2º', 'S3'])

    // Las reglas del volcado siguen: deshacer revierte solo el lote de 2ºB.
    await r.deshacer()
    expect(await titulos('2B')).toEqual([])
    expect(await titulos('1A')).toHaveLength(3)
  })
})

describe('regla dura: una unidad de ciclo nunca mezcla ciclos', () => {
  it('se crea con los dos cursos de SU ciclo, venga del curso que venga', async () => {
    const id = await crearUnidad({ etapa: 'primaria', nivel: 4, ambito: 'ciclo', titulo: 'X', trimestre: 1 })
    expect((await leer(id)).niveles).toEqual([3, 4])
  })

  it('no admite un curso de otro ciclo, ni ningún curso más', async () => {
    const id = await unidadDeCiclo(2, 2)
    const u = await leer(id)
    expect(motivoNoAdmiteCurso(u, 3)).toMatch(/ciclo/)
    await expect(anadirCursoAUnidad(id, 3, 'blanco')).rejects.toThrow()
  })

  it('copiarla a otro ciclo da una unidad por curso con la versión del origen', async () => {
    const id = await unidadDeCiclo(2)
    const s = sesionesDe(await leer(id), 2)[0]
    await adaptarSesionPlan(id, 2, s.id)
    await guardarSesionPlan(id, 2, s.id, { titulo: 'Propia de 2º' })
    const { id: copia } = await copiarUnidad(id, 3, { desdeNivel: 2 })
    const c = (await leer(copia)) as UnidadPrimaria
    expect(c.ambito).toBeUndefined()
    expect(c.niveles).toEqual([3])
    expect(sesionesDe(c, 3).map((x) => x.titulo)).toEqual(['Propia de 2º', 'S2'])
    expect(c.sesiones!.every((x) => x.adaptaciones === undefined && !('adaptada' in x))).toBe(true)
  })
})

describe('unidades existentes y conversión', () => {
  async function porCurso(sesiones1: string[], sesiones2?: string[]) {
    const { id } = await importarUnidad({
      etapa: 'primaria',
      nivel: 1,
      titulo: 'Vieja',
      sesiones: sesiones1.map((t) => ({ titulo: t, descripcion: '', recursos: [], enlacesYNotas: '' })),
    })
    if (sesiones2) {
      await anadirCursoAUnidad(id, 2, 'blanco')
      for (const t of sesiones2) await anadirSesionPlan(id, 2, { titulo: t })
    }
    return id
  }

  it('una unidad por curso se comporta exactamente igual que antes', async () => {
    const id = await porCurso(['A', 'B'], ['C'])
    const u = await leer(id)
    expect((u as UnidadPrimaria).ambito).toBeUndefined()
    expect(sesionesDe(u, 1).map((s) => s.titulo)).toEqual(['A', 'B'])
    expect(sesionesDe(u, 2).map((s) => s.titulo)).toEqual(['C'])
    await guardarSesionPlan(id, 1, sesionesDe(u, 1)[0].id, { titulo: 'A2' })
    expect(sesionesDe(await leer(id), 2).map((s) => s.titulo)).toEqual(['C'])
  })

  it('con sesiones idénticas, todas pasan a comunes', async () => {
    const id = await porCurso(['A', 'B'], ['A', 'B'])
    expect(previaConversionCiclo(await leer(id))).toMatchObject({ identicas: true, comunes: 2 })
    await convertirEnUnidadDeCiclo(id)
    const u = await leer(id)
    expect((u as UnidadPrimaria).ambito).toBe('ciclo')
    expect(u.sesiones).toHaveLength(2)
    expect(sesionesDe(u, 2).every((s) => !s.adaptada)).toBe(true)
  })

  it('las diferencias se conservan como adaptaciones; deshacer lo repone', async () => {
    const id = await porCurso(['A', 'B'], ['A', 'B de 2º'])
    const antes = await leer(id)
    expect(previaConversionCiclo(antes)).toMatchObject({ adaptadas: { nivel: 2, sesiones: 1 } })
    const deshacer = await convertirEnUnidadDeCiclo(id)
    const u = await leer(id)
    expect(sesionesDe(u, 1).map((s) => s.titulo)).toEqual(['A', 'B'])
    expect(sesionesDe(u, 2).map((s) => s.titulo)).toEqual(['A', 'B de 2º'])
    expect(sesionesDe(u, 2)[1].adaptada).toBe(true)
    await deshacer()
    expect(await leer(id)).toEqual(antes)
  })

  it('con distinto número de sesiones se bloquea y dice por qué', async () => {
    const id = await porCurso(['A', 'B', 'C'], ['A'])
    expect(previaConversionCiclo(await leer(id))?.motivo).toMatch(/3 sesiones/)
    await expect(convertirEnUnidadDeCiclo(id)).rejects.toThrow(/iguala/)
  })

  it('una unidad de un solo curso gana el otro del ciclo', async () => {
    const id = await porCurso(['A'])
    await convertirEnUnidadDeCiclo(id)
    const u = await leer(id)
    expect(u.niveles).toEqual([1, 2])
    expect(sesionesDe(u, 2).map((s) => s.titulo)).toEqual(['A'])
  })
})
