import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { resumirAsistencia } from '../db/asistencia'
import { db } from '../db/db'
import type { Alumno, Asistencia, Columna, Grupo, Observacion, Rubrica, Trimestre, ValorCelda } from '../db/types'
import { valorNormalizado } from '../db/cuaderno'
import { descargarArchivo } from './descargar'
import { formatoLargo } from './fechas'

/**
 * Generación de informes (§5 M7). Todo en local, sin red. `apoyos` de Alumno
 * NUNCA se lee aquí ni se incluye en ningún export (§1.6/§9).
 */

function nombreArchivo(base: string, ext: string): string {
  const fecha = new Date().toISOString().slice(0, 10)
  return `${base}_${fecha}.${ext}`
}

function nombreAlumno(a: Alumno): string {
  return a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre
}

// ——— Acta de grupo (PDF) ———

export async function generarActaGrupo(grupo: Grupo, alumnos: Alumno[]): Promise<void> {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(`Acta de grupo — ${grupo.nombre}`, 14, 16)
  doc.setFontSize(10)
  doc.text(`${alumnos.length} alumnos · generado ${formatoLargo(new Date().toISOString().slice(0, 10))}`, 14, 22)

  const filas: (string | number)[][] = []
  for (const a of alumnos) {
    const asis = await db.asistencias.where('alumnoId').equals(a.id).toArray()
    const r = resumirAsistencia(asis)
    filas.push([
      nombreAlumno(a),
      r.total === 0 ? '—' : `${r.pctAsistencia}%`,
      r.faltas,
      r.retrasos,
      r.justificadas,
      r.sinChandal,
    ])
  }

  autoTable(doc, {
    startY: 28,
    head: [['Alumno', '% asistencia', 'Faltas', 'Retrasos', 'Justif.', 'Sin chándal']],
    body: filas,
    headStyles: { fillColor: [0, 106, 128] },
    styles: { fontSize: 9 },
  })

  doc.save(nombreArchivo(`acta_${grupo.nombre}`, 'pdf'))
}

// ——— Informe individual (PDF) ———

export async function generarInformeIndividual(
  grupo: Grupo,
  alumno: Alumno,
  trimestre: Trimestre,
): Promise<void> {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(`Informe individual — ${nombreAlumno(alumno)}`, 14, 16)
  doc.setFontSize(10)
  doc.text(`${grupo.nombre} · ${trimestre}.º trimestre`, 14, 22)

  let y = 30

  const asis = await db.asistencias.where('alumnoId').equals(alumno.id).toArray()
  const r = resumirAsistencia(asis)
  doc.setFontSize(11)
  doc.text('Asistencia', 14, y)
  autoTable(doc, {
    startY: y + 3,
    head: [['% asistencia', 'Faltas', 'Retrasos', 'Justificadas', 'Racha chándal']],
    body: [[
      r.total === 0 ? '—' : `${r.pctAsistencia}%`,
      r.faltas,
      r.retrasos,
      r.justificadas,
      r.rachaChandal,
    ]],
    headStyles: { fillColor: [0, 106, 128] },
    styles: { fontSize: 9 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  const obs = (await db.observaciones.where('alumnoId').equals(alumno.id).toArray())
    .sort((a: Observacion, b: Observacion) => b.fecha.localeCompare(a.fecha))
    .slice(0, 10)
  doc.text('Observaciones recientes', 14, y)
  autoTable(doc, {
    startY: y + 3,
    head: [['Fecha', 'Tipo', 'Signo', 'Texto']],
    body: obs.map((o) => [o.fecha, o.tipo, o.signo, o.texto || '—']),
    headStyles: { fillColor: [0, 106, 128] },
    styles: { fontSize: 8 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  const columnas = await db.columnas
    .where('[grupoId+trimestre]')
    .equals([grupo.id, trimestre])
    .toArray()
  if (columnas.length > 0) {
    const valores = await db.valores
      .where('columnaId')
      .anyOf(columnas.map((c) => c.id))
      .and((v: ValorCelda) => v.alumnoId === alumno.id)
      .toArray()
    const rubricas = new Map<string, Rubrica>()
    for (const c of columnas) {
      if (c.rubricaId && !rubricas.has(c.rubricaId)) {
        const rub = await db.rubricas.get(c.rubricaId)
        if (rub) rubricas.set(c.rubricaId, rub)
      }
    }
    const porColumna = new Map(valores.map((v: ValorCelda) => [v.columnaId, v]))
    doc.text('Cuaderno', 14, y)
    autoTable(doc, {
      startY: y + 3,
      head: [['Columna', 'Valor (0–10)']],
      body: columnas.map((c: Columna) => {
        const n = valorNormalizado(c, porColumna.get(c.id), c.rubricaId ? rubricas.get(c.rubricaId) : undefined)
        return [c.titulo, n == null ? '—' : n.toFixed(1)]
      }),
      headStyles: { fillColor: [0, 106, 128] },
      styles: { fontSize: 9 },
    })
  }

  doc.save(nombreArchivo(`informe_${nombreAlumno(alumno)}`, 'pdf'))
}

// ——— Notas del cuaderno (XLSX) ———

export async function exportarNotasXLSX(
  grupo: Grupo,
  alumnos: Alumno[],
  trimestre: Trimestre,
): Promise<void> {
  const columnas = await db.columnas
    .where('[grupoId+trimestre]')
    .equals([grupo.id, trimestre])
    .toArray()
  columnas.sort((a: Columna, b: Columna) => a.orden - b.orden)

  const rubricas = new Map<string, Rubrica>()
  for (const c of columnas) {
    if (c.rubricaId && !rubricas.has(c.rubricaId)) {
      const rub = await db.rubricas.get(c.rubricaId)
      if (rub) rubricas.set(c.rubricaId, rub)
    }
  }
  const valores = await db.valores.where('columnaId').anyOf(columnas.map((c) => c.id)).toArray()
  const mapa = new Map(valores.map((v: ValorCelda) => [`${v.columnaId}|${v.alumnoId}`, v]))

  const filas = alumnos.map((a) => {
    const fila: Record<string, string | number> = { Alumno: nombreAlumno(a) }
    for (const c of columnas) {
      const v = mapa.get(`${c.id}|${a.id}`)
      const n = valorNormalizado(c, v, c.rubricaId ? rubricas.get(c.rubricaId) : undefined)
      fila[c.titulo] = n == null ? '' : Number(n.toFixed(1))
    }
    return fila
  })

  const hoja = XLSX.utils.json_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Notas')
  XLSX.writeFile(libro, nombreArchivo(`notas_${grupo.nombre}_T${trimestre}`, 'xlsx'))
}

// ——— Asistencia (CSV) ———

export async function exportarAsistenciaCSV(grupo: Grupo, alumnos: Alumno[]): Promise<void> {
  const filas: Record<string, string | number>[] = []
  for (const a of alumnos) {
    const asis: Asistencia[] = await db.asistencias.where('alumnoId').equals(a.id).toArray()
    for (const r of asis.sort((x, y) => x.fecha.localeCompare(y.fecha))) {
      filas.push({
        Alumno: nombreAlumno(a),
        Fecha: r.fecha,
        Estado: r.estado,
        Chandal: r.chandal ? 'sí' : 'no',
        Observacion: r.observacion ?? '',
      })
    }
  }
  const hoja = XLSX.utils.json_to_sheet(filas)
  const csv = XLSX.utils.sheet_to_csv(hoja)
  descargarArchivo('﻿' + csv, nombreArchivo(`asistencia_${grupo.nombre}`, 'csv'), 'text/csv;charset=utf-8')
}
