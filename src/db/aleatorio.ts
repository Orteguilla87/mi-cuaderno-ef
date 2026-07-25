/**
 * Sorteo «Alumno aleatorio» del Cuaderno. Un ciclo por grupo: cada alumno
 * sale una vez antes de que pueda repetir, y el ciclo vive en Dexie para
 * sobrevivir a recargas y a cerrar la app.
 */

import { leerAsistenciaGrupo } from './asistencia'
import { db } from './db'
import type { Alumno } from './types'
import { aISO } from '../lib/fechas'

export interface EstadoSorteo {
  elegido: Alumno | null
  yaSalieron: number
  total: number
  agotado: boolean
  /** Solo tiene sentido ofrecer el filtro si hay pase de lista hecho hoy. */
  hayAsistenciaHoy: boolean
}

async function alumnosDelGrupo(grupoId: string): Promise<Alumno[]> {
  return (await db.alumnos.where('grupoId').equals(grupoId).toArray()).filter((a) => a.activo)
}

async function presentesHoy(alumnos: Alumno[]): Promise<{ ids: Set<string>; hayDatos: boolean }> {
  const registros = await leerAsistenciaGrupo(
    alumnos.map((a) => a.id),
    aISO(),
  )
  const ids = new Set(
    [...registros.entries()]
      .filter(([, r]) => r.estado === 'presente' || r.estado === 'retraso')
      .map(([id]) => id),
  )
  return { ids, hayDatos: registros.size > 0 }
}

/** Alumnos elegibles ahora mismo: activos, sin haber salido ya, y presentes si se pide. */
async function elegibles(
  grupoId: string,
  soloPresentes: boolean,
): Promise<{ candidatos: Alumno[]; alumnos: Alumno[]; yaSalieron: string[]; hayAsistenciaHoy: boolean }> {
  const alumnos = await alumnosDelGrupo(grupoId)
  const ciclo = await db.ciclosAleatorios.get(grupoId)
  const idsValidos = new Set(alumnos.map((a) => a.id))
  // Un alumno dado de baja o cambiado de grupo desaparece del ciclo al leerlo.
  const yaSalieron = (ciclo?.yaSalieron ?? []).filter((id) => idsValidos.has(id))

  const { ids: presentes, hayDatos } = await presentesHoy(alumnos)

  let candidatos = alumnos.filter((a) => !yaSalieron.includes(a.id))
  if (soloPresentes && hayDatos) candidatos = candidatos.filter((a) => presentes.has(a.id))

  return { candidatos, alumnos, yaSalieron, hayAsistenciaHoy: hayDatos }
}

/** Estado actual sin sortear: para pintar «7 de 24» al entrar en la pantalla. */
export async function estadoCiclo(grupoId: string): Promise<EstadoSorteo> {
  const { alumnos, yaSalieron, hayAsistenciaHoy } = await elegibles(grupoId, false)
  return {
    elegido: null,
    yaSalieron: yaSalieron.length,
    total: alumnos.length,
    agotado: alumnos.length > 0 && yaSalieron.length >= alumnos.length,
    hayAsistenciaHoy,
  }
}

/** Saca al siguiente alumno del ciclo y lo persiste. */
export async function siguienteAleatorio(
  grupoId: string,
  opciones: { soloPresentes: boolean },
): Promise<EstadoSorteo> {
  const { candidatos, alumnos, yaSalieron, hayAsistenciaHoy } = await elegibles(
    grupoId,
    opciones.soloPresentes,
  )

  if (candidatos.length === 0) {
    return {
      elegido: null,
      yaSalieron: yaSalieron.length,
      total: alumnos.length,
      agotado: alumnos.length > 0,
      hayAsistenciaHoy,
    }
  }

  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)]
  const nuevoYaSalieron = [...yaSalieron, elegido.id]
  await db.ciclosAleatorios.put({
    id: grupoId,
    grupoId,
    yaSalieron: nuevoYaSalieron,
    actualizado: new Date().toISOString(),
  })

  return {
    elegido,
    yaSalieron: nuevoYaSalieron.length,
    total: alumnos.length,
    agotado: nuevoYaSalieron.length >= alumnos.length,
    hayAsistenciaHoy,
  }
}

export async function reiniciarCiclo(grupoId: string): Promise<void> {
  await db.ciclosAleatorios.delete(grupoId)
}
