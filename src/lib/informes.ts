import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { resumirAsistencia } from '../db/asistencia'
import { db } from '../db/db'
import type { Alumno, Asistencia, Columna, Grupo, Observacion, Rubrica, Sesion, Trimestre, ValorCelda } from '../db/types'
import { calcularColumna, valorNormalizado, type ResultadoCalculo } from '../db/cuaderno'
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
  const columnasPorId = new Map(columnas.map((c) => [c.id, c]))
  const valores = await db.valores.where('columnaId').anyOf(columnas.map((c) => c.id)).toArray()
  const mapa = new Map(valores.map((v: ValorCelda) => [`${v.columnaId}|${v.alumnoId}`, v]))

  // Array de arrays (no objeto por título): dos columnas pueden compartir
  // título, y una clave de objeto numérica se reordenaría sola en el JSON,
  // rompiendo la correspondencia con el orden real de la rejilla.
  const cabecera = ['Alumno', ...columnas.map((c) => c.titulo)]
  const filas = alumnos.map((a) => {
    const memo = new Map<string, ResultadoCalculo>()
    const valoresFila = columnas.map((c) => {
      const n =
        c.tipo === 'calculo'
          ? calcularColumna(c, columnasPorId, mapa, a.id, rubricas, memo).valor
          : valorNormalizado(c, mapa.get(`${c.id}|${a.id}`), c.rubricaId ? rubricas.get(c.rubricaId) : undefined)
      return n == null ? '' : Number(n.toFixed(1))
    })
    return [nombreAlumno(a), ...valoresFila]
  })

  const hoja = XLSX.utils.aoa_to_sheet([cabecera, ...filas])
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

// ——— Plan del día (PDF) ———

export interface PlanClase {
  grupo: Grupo
  /** Ausente en una sesión movida a un día sin franja de horario propia. */
  horaInicio?: string
  horaFin?: string
  sesion?: Sesion
}

/**
 * Plan del día para dejárselo a un sustituto. Solo planificación: no recibe
 * alumnado ni lee `apoyos`/observaciones, así que no puede filtrarse nada
 * personal (§1.6/§9).
 */
export async function generarPlanDelDia(fecha: string, clases: PlanClase[]): Promise<void> {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Planificación del día', 14, 16)
  doc.setFontSize(10)
  doc.text(formatoLargo(fecha), 14, 22)

  const idsJuegos = new Set<string>()
  for (const c of clases) {
    for (const j of c.sesion?.juegos ?? []) idsJuegos.add(j.gameId)
  }
  const juegos = idsJuegos.size > 0 ? await db.juegos.bulkGet([...idsJuegos]) : []
  const descripcionPorId = new Map(
    juegos.filter((j): j is NonNullable<typeof j> => !!j).map((j) => [j.id, j.descripcion]),
  )

  let y = 30
  const clasesOrdenadas = [...clases].sort((a, b) =>
    (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''),
  )

  for (const c of clasesOrdenadas) {
    if (y > 260) {
      doc.addPage()
      y = 20
    }

    const hora = c.horaInicio && c.horaFin ? `${c.horaInicio}–${c.horaFin}` : 'Sin hora fija'
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`${hora} · ${c.grupo.nombre}`, 14, y)
    doc.setFont('helvetica', 'normal')
    y += 6

    if (c.sesion?.titulo) {
      doc.setFontSize(10)
      doc.text(c.sesion.titulo, 14, y)
      y += 5
    }

    if (!c.sesion) {
      doc.setFontSize(9)
      doc.setTextColor(120)
      doc.text('Sin planificación', 14, y)
      doc.setTextColor(0)
      y += 8
      continue
    }

    const campos: { etiqueta: string; texto: string }[] = []
    if (c.sesion.juegos.length > 0) {
      campos.push({
        etiqueta: 'Juegos',
        texto: c.sesion.juegos
          .map((j) => {
            const desc = descripcionPorId.get(j.gameId)
            return desc ? `${j.nombre} — ${desc}` : j.nombre
          })
          .join('\n'),
      })
    }
    if (c.sesion.notas) campos.push({ etiqueta: 'Notas', texto: c.sesion.notas })
    if (c.sesion.recursosNecesarios)
      campos.push({ etiqueta: 'Recursos necesarios', texto: c.sesion.recursosNecesarios })
    if (c.sesion.recursos.length > 0)
      campos.push({
        etiqueta: 'Enlaces y notas',
        texto: c.sesion.recursos.map((r) => r.valor).join(' · '),
      })
    if (c.sesion.comentarios) campos.push({ etiqueta: 'Comentarios', texto: c.sesion.comentarios })

    if (campos.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(120)
      doc.text('Sin más detalle', 14, y)
      doc.setTextColor(0)
      y += 8
      continue
    }

    doc.setFontSize(9)
    for (const campo of campos) {
      const lineas = doc.splitTextToSize(`${campo.etiqueta}: ${campo.texto}`, 180)
      if (y + lineas.length * 4.5 > 280) {
        doc.addPage()
        y = 20
      }
      doc.text(lineas, 14, y)
      y += lineas.length * 4.5 + 2
    }
    y += 4
  }

  doc.save(nombreArchivo('plan_del_dia', 'pdf'))
}
