import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  asignar,
  crearEtiqueta,
  editarEtiqueta,
  etiquetasPuestasDe,
  ETIQUETA_LESIONADO,
  fijarCaducidad,
  etiquetas as leerEtiquetas,
  sembrarEtiquetas,
  tieneEtiqueta,
} from './etiquetasAlumno'
import type { Alumno } from './types'
import { finDelDia, isoDeMs } from '../lib/fechas'
import { ICONOS_ETIQUETA, iconoDe } from '../lib/iconosEtiqueta'

/**
 * Lo que distingue a «Lesionado» del resto de etiquetas: que se acaba.
 *
 * La regla dura aquí es que una asignación caducada se MARCA pero NUNCA se
 * retira sola. La puso el usuario, y quitarla por nuestra cuenta sería borrar
 * un dato que él no ha decidido borrar.
 */

const EF = 'g-ef'
const DIA = 24 * 60 * 60 * 1000

function ficha(id: string, extra: Partial<Alumno> = {}): Alumno {
  return {
    id,
    grupoId: EF,
    nombre: 'Lucía',
    apellidos: 'Prieto',
    alias: 'Lucía',
    activo: true,
    ...extra,
  }
}

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('la semilla', () => {
  it('planta «Lesionado» con la cruz y marcada como temporal', async () => {
    await sembrarEtiquetas()
    const lesionado = await db.etiquetasAlumno.get(ETIQUETA_LESIONADO)
    expect(lesionado?.nombre).toBe('Lesionado')
    expect(lesionado?.abreviatura).toBe('LES')
    expect(lesionado?.icono).toBe('cruz')
    expect(lesionado?.temporal).toBe(true)
  })

  it('el icono de la semilla existe en el catálogo', () => {
    // Si alguien renombra el icono en `lib/iconosEtiqueta.ts`, la semilla
    // quedaría apuntando a un id muerto y «Lesionado» volvería al punto liso.
    expect(ICONOS_ETIQUETA.map((i) => i.id)).toContain('cruz')
    expect(iconoDe('cruz')).toBeDefined()
  })

  it('es idempotente y no repuebla lo que el usuario borró', async () => {
    await sembrarEtiquetas()
    await sembrarEtiquetas()
    expect(await db.etiquetasAlumno.count()).toBe(1)

    await db.etiquetasAlumno.delete(ETIQUETA_LESIONADO)
    await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua-300' })
    await sembrarEtiquetas()
    expect(await db.etiquetasAlumno.get(ETIQUETA_LESIONADO)).toBeUndefined()
  })
})

describe('el icono es opcional', () => {
  it('sin icono no se guarda el campo, y se cae al punto de color', async () => {
    const e = await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua-300' })
    expect(e.icono).toBeUndefined()
    expect(iconoDe(e.icono)).toBeUndefined()
  })

  it('con icono, se resuelve al componente del catálogo', async () => {
    const e = await crearEtiqueta({
      nombre: 'Lesionado',
      abreviatura: 'LES',
      colorId: 'carmin-500',
      icono: 'cruz',
    })
    expect(iconoDe(e.icono)).toBeDefined()
  })

  it('un icono desconocido no rompe: vuelve al punto', () => {
    // Es lo que pasaría al restaurar una copia hecha con una versión que
    // tuviera más iconos que esta.
    expect(iconoDe('holograma')).toBeUndefined()
  })

  it('quitar el icono lo borra, no guarda una cadena vacía', async () => {
    const e = await crearEtiqueta({
      nombre: 'Lesionado',
      abreviatura: 'LES',
      colorId: 'carmin-500',
      icono: 'cruz',
    })
    await editarEtiqueta(e.id, { icono: '' })
    expect((await db.etiquetasAlumno.get(e.id))!.icono).toBeUndefined()
  })
})

describe('temporal: cuáles proponen fecha de fin', () => {
  it('«Lesionado» sí y ACNEE no', async () => {
    await sembrarEtiquetas()
    const acnee = await crearEtiqueta({ nombre: 'ACNEE', abreviatura: 'ACN', colorId: 'agua-300' })

    expect((await db.etiquetasAlumno.get(ETIQUETA_LESIONADO))!.temporal).toBe(true)
    // Ausencia real: la que no es temporal no lleva un `false` que no dice nada.
    expect(acnee.temporal).toBeUndefined()
  })

  it('dejar de ser temporal borra el campo', async () => {
    await sembrarEtiquetas()
    await editarEtiqueta(ETIQUETA_LESIONADO, { temporal: false })
    expect((await db.etiquetasAlumno.get(ETIQUETA_LESIONADO))!.temporal).toBeUndefined()
  })
})

describe('la caducidad es de la asignación, no de la etiqueta', () => {
  it('dos alumnos con la misma etiqueta caducan cada uno lo suyo', async () => {
    await sembrarEtiquetas()
    await db.alumnos.bulkPut([ficha('a1'), ficha('a2')])
    const ahora = Date.now()

    await asignar('a1', ETIQUETA_LESIONADO, true, ahora + 3 * DIA)
    await asignar('a2', ETIQUETA_LESIONADO, true, ahora + 30 * DIA)

    expect((await db.alumnos.get('a1'))!.etiquetasHasta).toEqual({
      [ETIQUETA_LESIONADO]: ahora + 3 * DIA,
    })
    expect((await db.alumnos.get('a2'))!.etiquetasHasta).toEqual({
      [ETIQUETA_LESIONADO]: ahora + 30 * DIA,
    })
  })

  it('sin fecha, la asignación es indefinida y no hay campo', async () => {
    await sembrarEtiquetas()
    await db.alumnos.put(ficha('a1'))
    await asignar('a1', ETIQUETA_LESIONADO, true)
    expect((await db.alumnos.get('a1'))!.etiquetasHasta).toBeUndefined()
  })

  it('quitar la etiqueta se lleva su caducidad: nada huérfano', async () => {
    await sembrarEtiquetas()
    await db.alumnos.put(ficha('a1'))
    await asignar('a1', ETIQUETA_LESIONADO, true, Date.now() + DIA)
    await asignar('a1', ETIQUETA_LESIONADO, false)

    const a = (await db.alumnos.get('a1'))!
    expect(a.etiquetas).toBeUndefined()
    expect(a.etiquetasHasta).toBeUndefined()
  })
})

describe('caducada se marca, pero NUNCA se retira sola', () => {
  it('sigue puesta después de la fecha, y se enseña como caducada', async () => {
    await sembrarEtiquetas()
    await db.alumnos.put(ficha('a1'))
    const ayer = Date.now() - DIA
    await asignar('a1', ETIQUETA_LESIONADO, true, ayer)

    const alumno = (await db.alumnos.get('a1'))!
    const catalogo = await leerEtiquetas()

    // Sigue asignada en la base: nadie la ha tocado.
    expect(tieneEtiqueta(alumno, ETIQUETA_LESIONADO)).toBe(true)

    const [puesta] = etiquetasPuestasDe(alumno, catalogo)
    expect(puesta.caducada).toBe(true)
    expect(puesta.hasta).toBe(ayer)
  })

  it('antes de la fecha no está caducada', async () => {
    await sembrarEtiquetas()
    await db.alumnos.put(ficha('a1'))
    await asignar('a1', ETIQUETA_LESIONADO, true, Date.now() + DIA)

    const [puesta] = etiquetasPuestasDe((await db.alumnos.get('a1'))!, await leerEtiquetas())
    expect(puesta.caducada).toBe(false)
  })

  it('el último día cuenta entero: no caduca esa misma mañana', async () => {
    const hoy = isoDeMs(Date.now())
    const hasta = finDelDia(hoy)
    await sembrarEtiquetas()
    await db.alumnos.put(ficha('a1'))
    await asignar('a1', ETIQUETA_LESIONADO, true, hasta)

    const [puesta] = etiquetasPuestasDe((await db.alumnos.get('a1'))!, await leerEtiquetas())
    expect(puesta.caducada).toBe(false)
  })

  it('prolongarla la revive sin volver a asignarla', async () => {
    await sembrarEtiquetas()
    await db.alumnos.put(ficha('a1'))
    await asignar('a1', ETIQUETA_LESIONADO, true, Date.now() - DIA)

    await fijarCaducidad('a1', ETIQUETA_LESIONADO, Date.now() + 7 * DIA)

    const [puesta] = etiquetasPuestasDe((await db.alumnos.get('a1'))!, await leerEtiquetas())
    expect(puesta.caducada).toBe(false)
  })

  it('dejarla indefinida borra la fecha y deja de caducar', async () => {
    await sembrarEtiquetas()
    await db.alumnos.put(ficha('a1'))
    await asignar('a1', ETIQUETA_LESIONADO, true, Date.now() - DIA)

    await fijarCaducidad('a1', ETIQUETA_LESIONADO, undefined)

    const alumno = (await db.alumnos.get('a1'))!
    expect(alumno.etiquetasHasta).toBeUndefined()
    expect(etiquetasPuestasDe(alumno, await leerEtiquetas())[0].caducada).toBe(false)
  })
})

describe('crear al vuelo desde la ficha del alumno', () => {
  it('la etiqueta creada queda en el catálogo, para todo el alumnado', async () => {
    await db.alumnos.bulkPut([ficha('a1'), ficha('a2')])

    // Lo que hace la ficha: crear en el catálogo y ponérsela solo a ese alumno.
    const nueva = await crearEtiqueta({
      nombre: 'Compensatoria',
      abreviatura: 'COM',
      colorId: 'agua-300',
    })
    await asignar('a1', nueva.id, true)

    // Disponible para cualquiera, aunque solo la lleve uno.
    expect((await leerEtiquetas()).map((e) => e.id)).toContain(nueva.id)
    expect(tieneEtiqueta((await db.alumnos.get('a1'))!, nueva.id)).toBe(true)
    expect(tieneEtiqueta((await db.alumnos.get('a2'))!, nueva.id)).toBe(false)

    // Y ponérsela al segundo no crea nada nuevo.
    await asignar('a2', nueva.id, true)
    expect(await db.etiquetasAlumno.count()).toBe(1)
  })
})

/**
 * El régimen de visibilidad de «Lesionado» es el de cualquier otra etiqueta, y
 * quien lo vigila sobre la fuente es `lib/etiquetasAlumno.test.ts`. Aquí solo se
 * comprueba lo propio de esta: que su id no se cuela en ninguna vista
 * proyectable ni en ninguna ruta de exportación por la puerta de atrás.
 */
describe('«Lesionado» no se escapa por su id', () => {
  const RAIZ = join(import.meta.dirname, '..')
  const PROHIBIDAS = [
    join(RAIZ, 'pages', 'EquiposGenerador.tsx'),
    join(RAIZ, 'pages', 'Herramientas.tsx'),
    join(RAIZ, 'components', 'SorteoAlumno.tsx'),
    join(RAIZ, 'components', 'Marcador.tsx'),
    join(RAIZ, 'components', 'Pizarra.tsx'),
    join(RAIZ, 'lib', 'informes.ts'),
    join(RAIZ, 'lib', 'pseudonimizacion.ts'),
    join(RAIZ, 'db', 'agenteApi.ts'),
    join(RAIZ, 'db', 'equipos.ts'),
  ]

  it.each(PROHIBIDAS)('%s no nombra la etiqueta «Lesionado»', (ruta) => {
    const fuente = readFileSync(ruta, 'utf-8')
    expect(fuente).not.toContain('ETIQUETA_LESIONADO')
    expect(fuente.toLowerCase()).not.toContain('lesionado')
  })

  it('el pase de lista SÍ puede filtrarlos: es pantalla de trabajo', () => {
    const fuente = readFileSync(join(RAIZ, 'pages', 'PaseLista.tsx'), 'utf-8')
    expect(fuente).toContain('ETIQUETA_LESIONADO')
  })
})
