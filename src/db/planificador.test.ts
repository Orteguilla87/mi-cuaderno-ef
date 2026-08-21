import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { aplicarUnidadAGrupo, importarUnidad } from './planificador'

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
