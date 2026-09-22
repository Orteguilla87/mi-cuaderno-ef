/**
 * Consultas de solo lectura del agente (§6, 2.5).
 *
 * REGLA DURA: se resuelven ÍNTEGRAMENTE en local contra Dexie. El modelo, como
 * mucho, clasifica la frase cuando el parser local no la reconoce; la respuesta
 * no la genera él ni pasa por ninguna API. Aquí no hay un solo `fetch`, y el
 * contenido de las observaciones, las notas y los datos del alumnado no sale
 * del dispositivo bajo ningún concepto.
 *
 * Tampoco se genera contenido nuevo —juegos, sesiones, textos—: esto solo
 * devuelve lo que ya está guardado.
 */

import { db } from './db'
import { getSesiones } from './sesiones'
import { contadoresPorAlumno } from './observaciones'
import { ETIQUETA_LESIONADO } from './etiquetasAlumno'
import type { Consulta } from '../lib/intenciones'
import { etiquetaDia } from '../lib/fechas'

export interface RespuestaConsulta {
  /** Breve, para leerla de un vistazo con el móvil en la mano. */
  texto: string
  /** Adónde ir si se quiere el detalle. Un toque (2.6). */
  enlace?: { ruta: string; etiqueta: string }
}

function nombre(a: { nombre: string; alias?: string }): string {
  return a.alias || a.nombre
}

/** Lista corta y legible: «Marta, Luis y Ana». */
function enumerar(nombres: string[]): string {
  if (nombres.length === 0) return ''
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export async function responder(
  consulta: Consulta,
  grupoId: string,
): Promise<RespuestaConsulta> {
  switch (consulta.consulta) {
    case 'sesion_del_dia': {
      const sesiones = await getSesiones({
        desde: consulta.fecha,
        hasta: consulta.fecha,
        grupoId,
      })
      if (sesiones.length === 0)
        return { texto: `No hay nada planificado para ${etiquetaDia(consulta.fecha)}.` }
      const titulos = sesiones.map((s) => s.sesion.titulo.trim() || 'Sesión sin título')
      return {
        texto: `${etiquetaDia(consulta.fecha)}: ${enumerar(titulos)}.`,
        enlace: { ruta: `sesiones/${sesiones[0].sesion.id}`, etiqueta: 'Abrir la sesión' },
      }
    }

    case 'material_del_dia': {
      const sesiones = await getSesiones({
        desde: consulta.fecha,
        hasta: consulta.fecha,
        grupoId,
      })
      const material = sesiones
        .map((s) => s.sesion.recursosNecesarios?.trim())
        .filter((m): m is string => !!m)
      if (material.length === 0)
        return { texto: `No hay material anotado para ${etiquetaDia(consulta.fecha)}.` }
      return {
        texto: `Material de ${etiquetaDia(consulta.fecha)}: ${material.join('; ')}.`,
        enlace: { ruta: `sesiones/${sesiones[0].sesion.id}`, etiqueta: 'Abrir la sesión' },
      }
    }

    case 'quien_falta': {
      const alumnos = (await db.alumnos.where('grupoId').equals(grupoId).toArray()).filter(
        (a) => a.activo,
      )
      const registros = await db.asistencias.where('fecha').equals(consulta.fecha).toArray()
      const porAlumno = new Map(registros.map((r) => [r.alumnoId, r]))
      const faltan = alumnos.filter((a) => {
        const estado = porAlumno.get(a.id)?.estado
        return estado === 'falta' || estado === 'justificada'
      })
      if (porAlumno.size === 0)
        return { texto: `Todavía no hay pase de lista de ${etiquetaDia(consulta.fecha)}.` }
      if (faltan.length === 0) return { texto: `No falta nadie ${etiquetaDia(consulta.fecha)}.` }
      return {
        texto: `Faltan ${faltan.length}: ${enumerar(faltan.map(nombre))}.`,
        enlace: { ruta: `asistencia/${grupoId}`, etiqueta: 'Abrir el pase de lista' },
      }
    }

    case 'quien_lesionado': {
      const alumnos = (await db.alumnos.where('grupoId').equals(grupoId).toArray()).filter(
        (a) => a.activo && (a.etiquetas ?? []).includes(ETIQUETA_LESIONADO),
      )
      if (alumnos.length === 0) return { texto: 'No hay nadie marcado como lesionado en el grupo.' }
      return {
        texto: `Lesionados: ${enumerar(alumnos.map(nombre))}.`,
        enlace: { ruta: `grupos/${grupoId}`, etiqueta: 'Abrir el grupo' },
      }
    }

    case 'positivos_alumno': {
      const alumno = await db.alumnos.get(consulta.alumnoId)
      if (!alumno) return { texto: 'No encuentro a ese alumno en el grupo.' }
      const contadores = (await contadoresPorAlumno(grupoId)).get(alumno.id) ?? {
        positivos: 0,
        negativos: 0,
      }
      return {
        texto: `${nombre(alumno)}: ${contadores.positivos} positivos y ${contadores.negativos} negativos.`,
        enlace: { ruta: `alumnos/${alumno.id}`, etiqueta: 'Abrir su ficha' },
      }
    }

    case 'observaciones_alumno': {
      const alumno = await db.alumnos.get(consulta.alumnoId)
      if (!alumno) return { texto: 'No encuentro a ese alumno en el grupo.' }
      const lista = (await db.observaciones.where('alumnoId').equals(alumno.id).toArray()).sort(
        (a, b) => b.fecha.localeCompare(a.fecha),
      )
      if (lista.length === 0) return { texto: `${nombre(alumno)} no tiene observaciones.` }
      // Las tres últimas: en la mano, más no se lee. El resto, en su ficha.
      const ultimas = lista
        .slice(0, 3)
        .map((o) => `${o.signo === 'neutro' ? '·' : o.signo} ${o.texto || '(sin texto)'}`)
      return {
        texto: `${nombre(alumno)}, ${lista.length} observaciones. Últimas:\n${ultimas.join('\n')}`,
        enlace: { ruta: `alumnos/${alumno.id}`, etiqueta: 'Abrir su ficha' },
      }
    }

    case 'progreso_unidad': {
      const sesiones = (await db.sesiones.where('grupoId').equals(grupoId).toArray()).filter(
        (s) => s.udId,
      )
      if (sesiones.length === 0)
        return { texto: 'Este grupo no tiene ninguna unidad volcada en su planificación.' }

      const unidades = await db.unidades.bulkGet([...new Set(sesiones.map((s) => s.udId!))])
      const buscada = consulta.unidad?.toLocaleLowerCase('es')
      const unidad = buscada
        ? unidades.find((u) => u?.titulo.toLocaleLowerCase('es').includes(buscada))
        : // Sin unidad dicha, la de la sesión con trabajo más reciente.
          unidades.find((u) => u?.id === [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.udId)
      if (!unidad) return { texto: 'No encuentro esa unidad en la planificación del grupo.' }

      const suyas = sesiones.filter((s) => s.udId === unidad.id).sort((a, b) => a.fecha.localeCompare(b.fecha))
      const hechas = suyas.filter((s) => s.titulo.trim() || s.notas.trim()).length
      return {
        texto: `${unidad.titulo}: ${hechas} de ${suyas.length} sesiones con trabajo anotado.`,
        enlace: { ruta: `planificador`, etiqueta: 'Abrir el Planificador' },
      }
    }
  }
}
