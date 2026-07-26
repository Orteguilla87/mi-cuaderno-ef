import * as XLSX from 'xlsx'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { Alumno, Columna, Grupo } from '../db/types'
import { exportarNotasXLSX } from './informes'

/**
 * §5 M7. El XLSX de notas debe salir en el mismo orden que la rejilla del
 * Cuaderno (mismos ítems, misma secuencia) e incluir las columnas de cálculo
 * ya resueltas — antes salían en blanco porque el export nunca llamaba a
 * `calcularColumna`, y el objeto keyed por título podía reordenar o
 * colisionar columnas con el mismo nombre.
 */

const grupo: Grupo = {
  id: 'g1',
  cursoEscolarId: 'c1',
  nombre: 'Prueba',
  etapa: 'primaria',
  nivel: 3,
  color: '#000',
  orden: 0,
  horario: [],
}

const alumnos: Alumno[] = [
  { id: 'a1', grupoId: 'g1', nombre: 'Ana', apellidos: 'García', alias: '', activo: true },
]

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('exportarNotasXLSX', () => {
  it('mantiene el orden de la rejilla y calcula las columnas de tipo cálculo', async () => {
    const columnas: Columna[] = [
      { id: 'c1', grupoId: 'g1', trimestre: 1, titulo: 'Salto', tipo: 'numero', orden: 0, escala: { min: 0, max: 10, decimales: 1 } },
      // Título duplicado a propósito: con `fila[c.titulo]` el segundo pisaba al primero.
      { id: 'c2', grupoId: 'g1', trimestre: 1, titulo: 'Nota', tipo: 'numero', orden: 1, escala: { min: 0, max: 10, decimales: 1 } },
      { id: 'c3', grupoId: 'g1', trimestre: 1, titulo: 'Nota', tipo: 'caritas', orden: 2, caritas: 3 },
      {
        id: 'c4',
        grupoId: 'g1',
        trimestre: 1,
        titulo: 'Media UD1',
        tipo: 'calculo',
        orden: 3,
        calculo: { componentes: [{ columnaId: 'c1', pesoPct: 50 }, { columnaId: 'c2', pesoPct: 50 }] },
      },
    ]
    await db.columnas.bulkAdd(columnas)
    await db.valores.bulkAdd([
      { id: 'v1', columnaId: 'c1', alumnoId: 'a1', numero: 8, actualizado: 0 },
      { id: 'v2', columnaId: 'c2', alumnoId: 'a1', numero: 6, actualizado: 0 },
      { id: 'v3', columnaId: 'c3', alumnoId: 'a1', carita: 2, actualizado: 0 },
    ])

    // En entorno Node (sin `document`), XLSX.writeFile escribe el fichero real
    // en disco: se lee de vuelta tal cual saldría de la app.
    const fecha = new Date().toISOString().slice(0, 10)
    const ruta = `notas_Prueba_T1_${fecha}.xlsx`
    let filas: unknown[][]
    try {
      await exportarNotasXLSX(grupo, alumnos, 1)
      expect(existsSync(ruta)).toBe(true)
      const libro = XLSX.read(readFileSync(ruta))
      filas = XLSX.utils.sheet_to_json(libro.Sheets['Notas'], { header: 1 }) as unknown[][]
    } finally {
      if (existsSync(ruta)) unlinkSync(ruta)
    }

    // Mismo orden que la rejilla: Alumno, Salto, Nota, Nota, Media UD1.
    expect(filas[0]).toEqual(['Alumno', 'Salto', 'Nota', 'Nota', 'Media UD1'])
    // Salto=8 (0-10 ya), Nota numero=6, Nota caritas 2/2*10=10, Media=(8+6)/2=7.
    expect(filas[1]).toEqual(['García, Ana', 8, 6, 10, 7])
  })
})
