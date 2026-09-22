import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, nuevoId } from './db'
import { responder } from './consultas'
import { ejecutarIntencion } from './acciones'
import { ETIQUETA_LESIONADO } from './etiquetasAlumno'
import type { Alumno, Grupo } from './types'

/**
 * Las consultas del agente se resuelven contra Dexie y NADA MÁS. El espía sobre
 * `fetch` lo prueba: si alguna respuesta se armara con el modelo, aquí saltaría.
 * Y con ella saldrían del dispositivo observaciones, notas y nombres, que es
 * justo lo que §1.2 no permite.
 */
let espiaFetch: ReturnType<typeof vi.fn>

const GRUPO: Grupo = {
  id: 'g1',
  cursoEscolarId: 'c1',
  nombre: '4º A',
  etapa: 'primaria',
  nivel: 4,
  color: '#006A80',
  orden: 0,
  horario: [],
}

function alumno(id: string, nombre: string): Alumno {
  return { id, grupoId: 'g1', nombre, apellidos: 'De Prueba', alias: '', activo: true }
}

const MARTA = alumno('a1', 'Marta')
const LUIS = alumno('a2', 'Luis')

beforeEach(async () => {
  espiaFetch = vi.fn(() => {
    throw new Error('una consulta local no puede llamar a la red')
  })
  vi.stubGlobal('fetch', espiaFetch)

  await db.open()
  await db.grupos.add(GRUPO)
  await db.alumnos.bulkAdd([MARTA, LUIS])
})

afterEach(async () => {
  expect(espiaFetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('consultas de solo lectura', () => {
  it('quién falta, con y sin pase de lista', async () => {
    const sinLista = await responder({ consulta: 'quien_falta', fecha: '2026-09-22' }, 'g1')
    expect(sinLista.texto).toMatch(/pase de lista/i)

    await db.asistencias.bulkAdd([
      { id: nuevoId(), alumnoId: 'a1', fecha: '2026-09-22', estado: 'falta', chandal: false },
      { id: nuevoId(), alumnoId: 'a2', fecha: '2026-09-22', estado: 'presente', chandal: true },
    ])
    const r = await responder({ consulta: 'quien_falta', fecha: '2026-09-22' }, 'g1')
    expect(r.texto).toContain('Marta')
    expect(r.texto).not.toContain('Luis')
    expect(r.enlace?.ruta).toBe('asistencia/g1')
  })

  it('quién está lesionado', async () => {
    expect((await responder({ consulta: 'quien_lesionado' }, 'g1')).texto).toMatch(/no hay nadie/i)
    await db.alumnos.update('a2', { etiquetas: [ETIQUETA_LESIONADO] })
    const r = await responder({ consulta: 'quien_lesionado' }, 'g1')
    expect(r.texto).toContain('Luis')
  })

  it('cuántos positivos lleva', async () => {
    await db.observaciones.bulkAdd([
      { id: nuevoId(), alumnoId: 'a1', grupoId: 'g1', fecha: '2026-09-21', tipo: 'conducta', signo: '+', texto: '', tags: [] },
      { id: nuevoId(), alumnoId: 'a1', grupoId: 'g1', fecha: '2026-09-22', tipo: 'conducta', signo: '+', texto: '', tags: [] },
      { id: nuevoId(), alumnoId: 'a1', grupoId: 'g1', fecha: '2026-09-22', tipo: 'conducta', signo: '-', texto: '', tags: [] },
    ])
    const r = await responder({ consulta: 'positivos_alumno', alumnoId: 'a1' }, 'g1')
    expect(r.texto).toContain('2 positivos')
    expect(r.texto).toContain('1 negativos')
  })

  it('las observaciones de un alumno, las últimas primero', async () => {
    await db.observaciones.bulkAdd([
      { id: nuevoId(), alumnoId: 'a1', grupoId: 'g1', fecha: '2026-09-10', tipo: 'conducta', signo: '+', texto: 'antigua', tags: [] },
      { id: nuevoId(), alumnoId: 'a1', grupoId: 'g1', fecha: '2026-09-22', tipo: 'conducta', signo: '-', texto: 'reciente', tags: [] },
    ])
    const r = await responder({ consulta: 'observaciones_alumno', alumnoId: 'a1' }, 'g1')
    expect(r.texto).toContain('2 observaciones')
    expect(r.texto.indexOf('reciente')).toBeLessThan(r.texto.indexOf('antigua'))
    expect(r.enlace?.ruta).toBe('alumnos/a1')
  })

  it('qué toca y qué material, del día que se pregunte', async () => {
    await db.cursos.add({
      id: 'c1',
      nombre: '2026-2027',
      activo: true,
      inicio: '2026-09-01',
      fin: '2027-06-30',
      trimestres: [{ n: 1, inicio: '2026-09-01', fin: '2026-12-22' }],
      festivos: [],
      periodosNoLectivos: [],
    })
    await db.sesiones.add({
      id: 's1',
      grupoId: 'g1',
      fecha: '2026-09-23',
      titulo: 'Saltos y giros',
      juegos: [],
      notas: '',
      recursos: [],
      recursosNecesarios: '12 aros, 6 picas',
    })

    const toca = await responder({ consulta: 'sesion_del_dia', fecha: '2026-09-23' }, 'g1')
    expect(toca.texto).toContain('Saltos y giros')
    expect(toca.enlace?.ruta).toBe('sesiones/s1')

    const material = await responder({ consulta: 'material_del_dia', fecha: '2026-09-23' }, 'g1')
    expect(material.texto).toContain('12 aros, 6 picas')
  })

  it('por qué sesión voy en una unidad', async () => {
    await db.unidades.add({
      id: 'u1',
      etapa: 'primaria',
      titulo: 'Habilidades con móvil',
      niveles: [4],
      trimestre: null,
      sesiones: [],
      criterios: [],
      computa: true,
      pesosPorNivel: {},
    })
    await db.sesiones.bulkAdd([
      { id: 's1', grupoId: 'g1', fecha: '2026-09-15', titulo: 'Bote', udId: 'u1', juegos: [], notas: '', recursos: [] },
      { id: 's2', grupoId: 'g1', fecha: '2026-09-22', titulo: '', udId: 'u1', juegos: [], notas: '', recursos: [] },
    ])
    const r = await responder({ consulta: 'progreso_unidad', unidad: 'habilidades' }, 'g1')
    expect(r.texto).toContain('1 de 2')
  })
})

describe('deshacer deja la base exactamente como estaba', () => {
  it('una observación', async () => {
    const antes = await db.observaciones.toArray()
    const r = await ejecutarIntencion(
      {
        accion: 'observacion',
        riesgo: 'reversible',
        resumen: 'Marta: positivo',
        alumnoId: 'a1',
        fecha: '2026-09-22',
        signo: '+',
        texto: 'ha ayudado',
      },
      GRUPO,
    )
    expect(await db.observaciones.count()).toBe(1)
    await r.deshacer!()
    expect(await db.observaciones.toArray()).toEqual(antes)
  })

  it('una asistencia que ya existía vuelve a su estado previo', async () => {
    const previo = {
      id: 'as1',
      alumnoId: 'a1',
      fecha: '2026-09-22',
      estado: 'presente' as const,
      chandal: true,
    }
    await db.asistencias.add(previo)

    const r = await ejecutarIntencion(
      {
        accion: 'pasar_lista',
        riesgo: 'reversible',
        resumen: 'Marta: falta',
        alumnoId: 'a1',
        fecha: '2026-09-22',
        estado: 'falta',
      },
      GRUPO,
    )
    expect((await db.asistencias.get('as1'))?.estado).toBe('falta')
    await r.deshacer!()
    expect(await db.asistencias.get('as1')).toEqual(previo)
  })

  it('crear una columna por voz se deshace con sus filas', async () => {
    await db.cursos.add({
      id: 'c1',
      nombre: '2026-2027',
      activo: true,
      inicio: '2026-09-01',
      fin: '2027-06-30',
      trimestres: [{ n: 1, inicio: '2026-09-01', fin: '2027-06-30' }],
      festivos: [],
      periodosNoLectivos: [],
    })
    const r = await ejecutarIntencion(
      {
        accion: 'crear_columna',
        riesgo: 'sensible',
        resumen: 'Nueva columna «Equilibrios»',
        titulo: 'Equilibrios',
        tipo: 'numero',
        tipoPropuesto: true,
      },
      GRUPO,
    )
    expect(await db.columnas.count()).toBe(1)
    await r.deshacer!()
    expect(await db.columnas.count()).toBe(0)
    expect(await db.filas.count()).toBe(0)
  })

  it('el contador suma sobre lo que ya había, y deshacer lo devuelve', async () => {
    const columnaId = 'col1'
    await db.valores.add({ id: 'v1', columnaId, alumnoId: 'a1', numero: 3, actualizado: 1 })
    const r = await ejecutarIntencion(
      {
        accion: 'contador_celda',
        riesgo: 'reversible',
        resumen: 'Marta · Participación: +1',
        alumnoId: 'a1',
        columnaId,
        delta: 1,
      },
      GRUPO,
    )
    expect((await db.valores.get('v1'))?.numero).toBe(4)
    await r.deshacer!()
    expect((await db.valores.get('v1'))?.numero).toBe(3)
  })
})
