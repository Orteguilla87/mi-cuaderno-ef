import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { asignar, crearEtiqueta, etiquetasDe } from './etiquetasAlumno'
import { contadoresPorAlumno, crearObservacion } from './observaciones'
import {
  CAMPOS_COMPARTIDOS,
  desvincular,
  escribirCompartido,
  fichasDe,
  otrasFichasDe,
  vincular,
} from './personas'
import type { Alumno } from './types'

/**
 * Las reglas duras de la vinculación entre fichas del mismo alumno:
 *
 *  1. Sin `personaId`, todo se comporta exactamente como antes.
 *  2. Lo de la PERSONA se comparte; lo del ÁREA no se cruza jamás.
 *  3. Nadie se vincula sin que el usuario lo pida.
 *  4. Desvincular no borra nada.
 */

const EF = 'g-ef'
const LENGUA = 'g-lengua'

function ficha(id: string, grupoId: string, extra: Partial<Alumno> = {}): Alumno {
  return {
    id,
    grupoId,
    nombre: 'Lucía',
    apellidos: 'Prieto',
    alias: 'Lucía',
    activo: true,
    ...extra,
  }
}

beforeEach(async () => {
  for (const grupoId of [EF, LENGUA])
    await db.grupos.put({
      id: grupoId,
      cursoEscolarId: 'curso1',
      nombre: grupoId === EF ? '4º EF' : '4º Lengua',
      etapa: 'primaria',
      nivel: 4,
      color: '#006A80',
      orden: 0,
      horario: [],
    })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('una ficha sin vincular se comporta como siempre', () => {
  it('`fichasDe` devuelve solo la suya', async () => {
    const sola = ficha('a1', EF)
    await db.alumnos.put(sola)
    expect(await fichasDe(sola)).toEqual([sola])
    expect(await otrasFichasDe(sola)).toEqual([])
  })

  it('poner una etiqueta escribe en una ficha y en ninguna más', async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA)])
    const etiqueta = await crearEtiqueta({ nombre: 'TDAH', abreviatura: 'TDA', colorId: 'agua' })

    await asignar('a1', etiqueta.id, true)

    expect((await db.alumnos.get('a1'))!.etiquetas).toEqual([etiqueta.id])
    expect((await db.alumnos.get('a2'))!.etiquetas).toBeUndefined()
  })

  it('quitar la última etiqueta deja el campo AUSENTE, no un array vacío', async () => {
    await db.alumnos.put(ficha('a1', EF))
    const etiqueta = await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua' })
    await asignar('a1', etiqueta.id, true)
    await asignar('a1', etiqueta.id, false)
    expect((await db.alumnos.get('a1'))!.etiquetas).toBeUndefined()
  })
})

describe('lo que es de la persona se comparte', () => {
  beforeEach(async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA)])
    await vincular('a1', ['a2'])
  })

  it('una etiqueta puesta en EF aparece en Lengua', async () => {
    const etiqueta = await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua' })
    await asignar('a1', etiqueta.id, true)

    const catalogo = [etiqueta]
    expect(etiquetasDe((await db.alumnos.get('a1'))!, catalogo)).toEqual([etiqueta])
    expect(etiquetasDe((await db.alumnos.get('a2'))!, catalogo)).toEqual([etiqueta])
  })

  it('retirarla desde Lengua la retira también de EF', async () => {
    const etiqueta = await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua' })
    await asignar('a1', etiqueta.id, true)

    await asignar('a2', etiqueta.id, false)

    expect((await db.alumnos.get('a1'))!.etiquetas).toBeUndefined()
    expect((await db.alumnos.get('a2'))!.etiquetas).toBeUndefined()
  })

  it('las pautas de apoyo y la nota privada viajan a las dos fichas', async () => {
    await escribirCompartido('a2', { apoyos: 'Consignas cortas', notasPrivadas: 'Ver con PT' })
    for (const id of ['a1', 'a2']) {
      const a = (await db.alumnos.get(id))!
      expect(a.apoyos).toBe('Consignas cortas')
      expect(a.notasPrivadas).toBe('Ver con PT')
    }
  })

  it('el nombre NO se comparte: cada lista lo escribe a su manera', async () => {
    await db.alumnos.update('a2', { nombre: 'Lucia', alias: 'Lu' })
    await escribirCompartido('a1', { apoyos: 'x' })
    expect((await db.alumnos.get('a2'))!.nombre).toBe('Lucia')
    expect((await db.alumnos.get('a2'))!.alias).toBe('Lu')
  })

  it('dar de baja en un área no da de baja en la otra', async () => {
    await db.alumnos.update('a1', { activo: false })
    expect((await db.alumnos.get('a2'))!.activo).toBe(true)
  })

  it('`CAMPOS_COMPARTIDOS` no deja entrar nada del área ni del grupo', () => {
    const prohibidos = ['id', 'grupoId', 'personaId', 'activo', 'nombre', 'apellidos', 'alias']
    for (const campo of prohibidos) expect(CAMPOS_COMPARTIDOS).not.toContain(campo)
  })
})

describe('lo que es del área no se cruza nunca', () => {
  beforeEach(async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA)])
    await vincular('a1', ['a2'])
  })

  it('una observación de Lengua no altera el balance de EF', async () => {
    await crearObservacion({
      alumnoId: 'a2',
      grupoId: LENGUA,
      tipo: 'conducta',
      signo: '-',
      texto: 'Interrumpe',
      tags: [],
    })
    await crearObservacion({
      alumnoId: 'a1',
      grupoId: EF,
      tipo: 'conducta',
      signo: '+',
      texto: 'Recoge el material',
      tags: [],
    })

    expect(await contadoresPorAlumno(EF)).toEqual(
      new Map([['a1', { positivos: 1, negativos: 0 }]]),
    )
    expect(await contadoresPorAlumno(LENGUA)).toEqual(
      new Map([['a2', { positivos: 0, negativos: 1 }]]),
    )
  })

  it('la asistencia de un grupo no aparece en el otro', async () => {
    await db.asistencias.put({
      id: 'as1',
      alumnoId: 'a1',
      fecha: '2026-09-08',
      estado: 'falta',
      chandal: false,
    })
    expect(await db.asistencias.where('alumnoId').equals('a2').toArray()).toEqual([])
  })

  it('las calificaciones y las celdas del Cuaderno no se cruzan', async () => {
    await db.calificaciones.put({
      id: 'c1',
      alumnoId: 'a1',
      instrumentoId: 'i1',
      itemId: 'it1',
      valor: 7,
      trimestre: 1,
      fecha: '2026-09-08',
    })
    await db.valores.put({
      id: 'v1',
      columnaId: 'col1',
      alumnoId: 'a1',
      numero: 8,
      actualizado: Date.now(),
    })

    expect(await db.calificaciones.where('alumnoId').equals('a2').toArray()).toEqual([])
    expect(await db.valores.where('alumnoId').equals('a2').toArray()).toEqual([])
  })
})

describe('nadie se vincula sin que se lo pidan', () => {
  it('dos homónimos en grupos distintos siguen siendo dos personas', async () => {
    // Mismo nombre, misma escritura: sin una llamada explícita a `vincular`
    // nada les pone un `personaId`.
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA)])
    expect((await db.alumnos.get('a1'))!.personaId).toBeUndefined()
    expect((await db.alumnos.get('a2'))!.personaId).toBeUndefined()

    const etiqueta = await crearEtiqueta({ nombre: 'TDAH', abreviatura: 'TDA', colorId: 'agua' })
    await asignar('a1', etiqueta.id, true)
    expect((await db.alumnos.get('a2'))!.etiquetas).toBeUndefined()
  })

  it('vincular una tercera ficha a un par ya vinculado deja las tres juntas', async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA), ficha('a3', 'g-mus')])
    await vincular('a1', ['a2'])
    await vincular('a3', ['a2'])

    const personas = new Set(
      (await db.alumnos.bulkGet(['a1', 'a2', 'a3'])).map((a) => a!.personaId),
    )
    expect(personas.size).toBe(1)
    expect([...personas][0]).toBeDefined()
  })

  it('vincular manda con los valores de la ficha desde la que se confirma', async () => {
    await db.alumnos.bulkPut([
      ficha('a1', EF, { apoyos: 'Consignas cortas' }),
      ficha('a2', LENGUA, { apoyos: 'Otra cosa' }),
    ])
    await vincular('a1', ['a2'])
    expect((await db.alumnos.get('a2'))!.apoyos).toBe('Consignas cortas')
  })

  it('se puede deshacer entero', async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA, { apoyos: 'Otra cosa' })])
    const { deshacer } = await vincular('a1', ['a2'])
    await deshacer()

    const a2 = (await db.alumnos.get('a2'))!
    expect(a2.personaId).toBeUndefined()
    expect(a2.apoyos).toBe('Otra cosa')
  })
})

describe('desvincular no borra nada', () => {
  it('las etiquetas se conservan como propias de cada ficha', async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA)])
    await vincular('a1', ['a2'])
    const etiqueta = await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua' })
    await asignar('a1', etiqueta.id, true)
    await escribirCompartido('a1', { apoyos: 'Consignas cortas' })

    await desvincular('a2')

    const a1 = (await db.alumnos.get('a1'))!
    const a2 = (await db.alumnos.get('a2'))!
    expect(a2.personaId).toBeUndefined()
    expect(a2.etiquetas).toEqual([etiqueta.id])
    expect(a2.apoyos).toBe('Consignas cortas')
    expect(a1.etiquetas).toEqual([etiqueta.id])
  })

  it('y a partir de ahí cada una va por su lado', async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA)])
    await vincular('a1', ['a2'])
    const etiqueta = await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua' })
    await asignar('a1', etiqueta.id, true)

    await desvincular('a2')
    await asignar('a1', etiqueta.id, false)

    expect((await db.alumnos.get('a1'))!.etiquetas).toBeUndefined()
    expect((await db.alumnos.get('a2'))!.etiquetas).toEqual([etiqueta.id])
  })

  it('se puede deshacer', async () => {
    await db.alumnos.bulkPut([ficha('a1', EF), ficha('a2', LENGUA)])
    await vincular('a1', ['a2'])
    const { deshacer } = await desvincular('a2')
    await deshacer()
    expect((await db.alumnos.get('a2'))!.personaId).toBe((await db.alumnos.get('a1'))!.personaId)
  })
})

/**
 * El régimen de las observaciones de OTRA área se comprueba sobre la fuente,
 * por el mismo motivo que en `lib/etiquetasAlumno.test.ts`: el proyecto no
 * monta React en los tests (§2), y lo que hay que fijar es estructural —qué
 * componente pinta cada fila y qué puede llamar cada uno—, no un píxel.
 */
describe('las observaciones de otra área se ven pero no se editan', () => {
  const RAIZ = join(import.meta.dirname, '..')
  const fuente = readFileSync(join(RAIZ, 'components', 'ObservacionEnLinea.tsx'), 'utf-8')
  // Solo el cuerpo de `FilaAjena`: hasta la siguiente declaración de primer
  // nivel. Sin recortar, el trozo se comería `FilaObservacion`, que sí edita.
  const desde = fuente.indexOf('function FilaAjena')
  const hasta = fuente.indexOf('\nfunction ', desde + 1)
  const filaAjena = fuente.slice(desde, hasta === -1 ? undefined : hasta)

  it('las de otro grupo van por un componente distinto, no por una prop', () => {
    // Un booleano «editable» se pone al revés por descuido; dos componentes
    // distintos, no. La lista decide por `o.grupoId === grupoPropio`.
    expect(fuente).toContain('o.grupoId === grupoPropio')
    expect(fuente).toContain('<FilaAjena')
  })

  it('la fila ajena no puede editar ni eliminar: no llama a nada que escriba', () => {
    expect(filaAjena).not.toContain('editarObservacion')
    expect(filaAjena).not.toContain('eliminarObservacion')
    expect(filaAjena).not.toContain('<textarea')
  })

  it('la fila ajena dice de qué grupo viene, y con palabras', () => {
    // El distintivo no puede ser solo un color: hay que poder leerlo.
    expect(filaAjena).toContain('{grupo ?? ')
  })

  it('la ficha lista las observaciones de TODAS las fichas de la persona', () => {
    const ficha = readFileSync(join(RAIZ, 'pages', 'AlumnoDetalle.tsx'), 'utf-8')
    expect(ficha).toContain("db.observaciones.where('alumnoId').anyOf(ids)")
    expect(ficha).toContain('grupoPropio={alumno.grupoId}')
  })

  it('el balance sigue saliendo por grupo, no por persona', () => {
    // Si esto cambiara a `alumnoId`, una observación de Lengua movería el
    // contador de EF. El test de arriba lo comprueba además con datos.
    const observaciones = readFileSync(join(RAIZ, 'db', 'observaciones.ts'), 'utf-8')
    const contadores = observaciones.slice(observaciones.indexOf('export async function contadoresPorAlumno'))
    expect(contadores).toContain("where('grupoId').equals(grupoId)")
  })
})
