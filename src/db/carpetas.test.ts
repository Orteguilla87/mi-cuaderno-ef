import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  crearCarpeta,
  eliminarCarpeta,
  listarCarpetas,
  moverCarpeta,
  moverUnidadACarpeta,
  renombrarCarpeta,
} from './carpetas'
import { db } from './db'
import { crearUnidad } from './planificador'
import { agruparUnidades, buscarUnidades } from '../lib/organizarUnidades'
import type { UnidadDidactica } from './types'

afterEach(async () => {
  await db.delete()
  await db.open()
})

const unidad = (nivel: number, titulo: string, ambito: 'curso' | 'ciclo' = 'curso') =>
  crearUnidad({ etapa: 'primaria', nivel, titulo, trimestre: 1, ambito })

describe('carpetas de unidades', () => {
  it('se crean en orden y no admiten nombres repetidos ni vacíos', async () => {
    await crearCarpeta('Juegos populares')
    await crearCarpeta('Lluvia')
    expect((await listarCarpetas()).map((c) => c.nombre)).toEqual(['Juegos populares', 'Lluvia'])
    await expect(crearCarpeta('  juegos POPULARES ')).rejects.toThrow(/Ya hay/)
    await expect(crearCarpeta('   ')).rejects.toThrow()
  })

  it('renombrar y reordenar se deshacen', async () => {
    const { id: a } = await crearCarpeta('A')
    await crearCarpeta('B')
    const deshacerNombre = await renombrarCarpeta(a, 'Atletismo')
    expect((await db.carpetas.get(a))?.nombre).toBe('Atletismo')
    await deshacerNombre()
    expect((await db.carpetas.get(a))?.nombre).toBe('A')

    const deshacerOrden = await moverCarpeta(a, 1)
    expect((await listarCarpetas()).map((c) => c.nombre)).toEqual(['B', 'A'])
    await deshacerOrden!()
    expect((await listarCarpetas()).map((c) => c.nombre)).toEqual(['A', 'B'])
    expect(await moverCarpeta(a, -1)).toBeNull()
  })

  it('eliminar una carpeta NUNCA borra sus unidades, y se deshace', async () => {
    const { id: carpeta } = await crearCarpeta('Lluvia')
    const ud = await unidad(3, 'Juegos de interior')
    await moverUnidadACarpeta(ud, carpeta)
    const { unidades, deshacer } = await eliminarCarpeta(carpeta)
    expect(unidades).toBe(1)
    expect(await db.unidades.get(ud)).toBeDefined()
    expect((await db.unidades.get(ud))?.carpetaId).toBeUndefined()
    await deshacer()
    expect((await db.unidades.get(ud))?.carpetaId).toBe(carpeta)
    expect(await db.carpetas.get(carpeta)).toBeDefined()
  })

  it('guardar y sacar de una carpeta se deshace', async () => {
    const { id: carpeta } = await crearCarpeta('Lluvia')
    const ud = await unidad(3, 'X')
    const deshacer = await moverUnidadACarpeta(ud, carpeta)
    expect((await db.unidades.get(ud))?.carpetaId).toBe(carpeta)
    await deshacer()
    expect((await db.unidades.get(ud))?.carpetaId).toBeUndefined()
    await expect(moverUnidadACarpeta(ud, 'no-existe')).rejects.toThrow()
  })
})

describe('organizar el listado', () => {
  async function todas(): Promise<UnidadDidactica[]> {
    return db.unidades.toArray()
  }

  it('por curso, una unidad de ciclo sale en sus dos cursos', async () => {
    await unidad(3, 'Habilidades', 'ciclo')
    await unidad(5, 'Atletismo')
    const secciones = agruparUnidades(await todas(), 'curso', [])
    expect(secciones.map((s) => [s.titulo, s.unidades.map((u) => u.titulo)])).toEqual([
      ['3º de Primaria', ['Habilidades']],
      ['4º de Primaria', ['Habilidades']],
      ['5º de Primaria', ['Atletismo']],
    ])
  })

  it('por ciclo, cada unidad sale una vez', async () => {
    await unidad(3, 'Habilidades', 'ciclo')
    await unidad(4, 'Malabares')
    await unidad(1, 'Esquema corporal')
    const secciones = agruparUnidades(await todas(), 'ciclo', [])
    expect(secciones.map((s) => [s.clave, s.unidades.length])).toEqual([
      ['ciclo-1', 1],
      ['ciclo-2', 2],
    ])
  })

  it('por carpeta: carpetas en su orden (también vacías) y después «Sin carpeta»', async () => {
    const { id: lluvia } = await crearCarpeta('Lluvia')
    await crearCarpeta('Vacía')
    const a = await unidad(3, 'Interior')
    await unidad(3, 'Exterior')
    await moverUnidadACarpeta(a, lluvia)
    const secciones = agruparUnidades(await todas(), 'carpeta', await listarCarpetas())
    expect(secciones.map((s) => [s.titulo, s.unidades.map((u) => u.titulo)])).toEqual([
      ['Lluvia', ['Interior']],
      ['Vacía', []],
      ['Sin carpeta', ['Exterior']],
    ])
  })

  it('una unidad que apunta a una carpeta inexistente cae en «Sin carpeta»', async () => {
    const ud = await unidad(3, 'Huérfana')
    await db.unidades.update(ud, { carpetaId: 'borrada' })
    const secciones = agruparUnidades(await todas(), 'carpeta', [])
    expect(secciones).toEqual([
      expect.objectContaining({ clave: 'sin-carpeta', unidades: [expect.objectContaining({ id: ud })] }),
    ])
  })

  it('la búsqueda ignora acentos y mayúsculas y mira también las sesiones', async () => {
    await crearUnidad({
      etapa: 'primaria', nivel: 2, titulo: 'Expresión corporal', trimestre: 2,
      sesiones: [{ id: 's1', nivel: 2, orden: 0, titulo: 'Juego del pañuelo', notas: '', recursos: [] }],
    })
    await unidad(2, 'Atletismo')
    const lista = await todas()
    expect(buscarUnidades(lista, 'EXPRESION').map((u) => u.titulo)).toEqual(['Expresión corporal'])
    expect(buscarUnidades(lista, 'panuelo').map((u) => u.titulo)).toEqual(['Expresión corporal'])
    expect(buscarUnidades(lista, '  ')).toHaveLength(2)
  })
})
