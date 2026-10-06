import * as XLSX from 'xlsx'
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { Alumno, Grupo } from '../db/types'
import { exportarNotasXLSX } from './informes'

/**
 * REGLA DURA: las notas de celda del Cuaderno (`NotaCelda`) NO salen en ninguna
 * exportación ni entran en ningún cálculo. Solo la vista Cuaderno, el backup
 * cifrado y la sincronización (que es ese mismo backup).
 *
 * Rutas de exportación revisadas a mano al crear la tabla (v26) — ninguna lee
 * notas de celda:
 *   · lib/informes.ts   — acta de grupo (PDF), informe individual (PDF), notas
 *                         (XLSX), asistencia (CSV), plan del día (PDF)
 *   · pages/Informes.tsx — copiar comentarios para Raíces (portapapeles)
 *   · lib/inventario.ts  — inventario (XLSX y CSV)
 *   · lib/descargar.ts   — la descarga en sí; no lee la base
 *
 * Para que siga siendo así sin depender de la memoria de nadie, dos guardas:
 *  1. Se exporta de verdad el XLSX con una nota sembrada y se busca dentro (es
 *     el único formato que Node puede escribir y releer; PDF y CSV necesitan
 *     `document`).
 *  2. LISTA BLANCA sobre la fuente: solo estos ficheros pueden nombrar la
 *     tabla o el tipo. Una exportación, un informe o el motor de cálculo que
 *     empiece a leerla hace fallar este test, y hay que venir aquí a
 *     justificarlo. Además, solo backup y sincronización pueden recorrer
 *     `db.tables` (la vía por la que una tabla entra sin nombrarla).
 */

const RAIZ = join(__dirname, '..')

const PUEDEN_NOMBRARLA = [
  'components/NotaCelda.tsx',
  'db/cuaderno.ts', // borrado en cascada con la columna
  'db/db.ts',
  'db/notasCelda.ts',
  'db/planificador.ts', // borrado en cascada con la unidad
  'db/types.ts',
  'lib/gestoCelda.ts',
  'pages/Cuaderno.tsx',
  'pages/GrupoDetalle.tsx', // borrado en cascada con el grupo
  'test/datosEjemplo.ts',
]

const PUEDEN_RECORRER_TABLAS = ['db/backup.ts', 'db/db.ts', 'db/sincro.ts']

function fuentes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return fuentes(ruta)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : []
  })
}

const relativa = (ruta: string) => relative(RAIZ, ruta).replace(/\\/g, '/')

describe('las notas de celda no salen del Cuaderno', () => {
  it('solo los ficheros de la lista blanca nombran la tabla o el tipo', () => {
    const nombran = fuentes(RAIZ)
      .filter((r) => /notas?Celda/i.test(readFileSync(r, 'utf-8')))
      .map(relativa)
      .sort()
    expect(nombran).toEqual(PUEDEN_NOMBRARLA)
  })

  it('solo backup y sincronización recorren todas las tablas', () => {
    const recorren = fuentes(RAIZ)
      .filter((r) => /db\.tables\b|\bdb\.table\(/.test(readFileSync(r, 'utf-8')))
      .map(relativa)
      .sort()
    expect(recorren).toEqual(PUEDEN_RECORRER_TABLAS)
  })

  it('ni el motor de cálculo ni las exportaciones están en la lista', () => {
    for (const prohibido of [
      'lib/informes.ts',
      'lib/inventario.ts',
      'lib/notas.ts',
      'lib/calculoColumna.ts',
      'db/notas.ts',
      'pages/Informes.tsx',
    ])
      expect(PUEDEN_NOMBRARLA).not.toContain(prohibido)
  })
})

describe('exportación real', () => {
  afterEach(async () => {
    await db.delete()
    await db.open()
  })

  it('el XLSX de notas no lleva la nota de la celda', async () => {
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
    await db.alumnos.bulkAdd(alumnos)
    await db.columnas.add({
      id: 'c1',
      grupoId: 'g1',
      trimestre: 1,
      titulo: 'Salto',
      tipo: 'numero',
      orden: 0,
      pesoUd: 0,
      escala: { min: 0, max: 10, decimales: 1 },
    })
    await db.valores.add({ id: 'v1', columnaId: 'c1', alumnoId: 'a1', numero: 8, actualizado: 0 })
    // Nota en una celda con valor y en otra sin él.
    await db.notasCelda.bulkAdd([
      { columnaId: 'c1', alumnoId: 'a1', texto: 'SECRETO-NOTA-CELDA lesionada', actualizadoEn: 0 },
    ])

    const fecha = new Date().toISOString().slice(0, 10)
    const ruta = `notas_Prueba_T1_${fecha}.xlsx`
    let contenido: string
    try {
      await exportarNotasXLSX(grupo, alumnos, 1)
      const libro = XLSX.read(readFileSync(ruta))
      contenido = JSON.stringify(
        libro.SheetNames.map((n) => XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1 })),
      )
    } finally {
      if (existsSync(ruta)) unlinkSync(ruta)
    }

    expect(contenido).toContain('García')
    expect(contenido).not.toContain('SECRETO-NOTA-CELDA')
    expect(contenido).not.toContain('lesionada')
  })
})
