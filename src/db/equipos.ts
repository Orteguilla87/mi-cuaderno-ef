import { leerAsistenciaGrupo } from './asistencia'
import { columnasDe, mediaDe, valoresDe } from './cuaderno'
import { db, nuevoId } from './db'
import type { Alumno, ConfigGeneracionEquipos, Equipo, EquipoGenerado, Trimestre, Vinculo } from './types'
import { filtrarPorPresentes, type AlumnoGenerable } from '../lib/generadorEquipos'
import { aISO } from '../lib/fechas'

/**
 * Puente entre el motor puro (`lib/generadorEquipos.ts`) y la base local.
 * `nivelMotriz` nunca sale de aquí como texto de `apoyos`: al motor solo le
 * llega el booleano `tieneApoyos`.
 */
export async function alumnosGenerables(
  grupoId: string,
  soloPresentes: boolean,
): Promise<{ alumnos: AlumnoGenerable[]; porId: Map<string, Alumno>; excluidos: number }> {
  const lista = (await db.alumnos.where('grupoId').equals(grupoId).toArray()).filter(
    (a) => a.activo,
  )
  const porId = new Map(lista.map((a) => [a.id, a]))

  let base: AlumnoGenerable[] = lista.map((a) => ({
    id: a.id,
    genero: a.genero,
    nivelMotriz: a.nivelMotriz,
    tieneApoyos: !!a.apoyos,
  }))

  let excluidos = 0
  if (soloPresentes) {
    const registros = await leerAsistenciaGrupo(lista.map((a) => a.id), aISO())
    const presentesHoy = new Set(
      [...registros.entries()]
        .filter(([, r]) => r.estado === 'presente' || r.estado === 'retraso')
        .map(([id]) => id),
    )
    // Si no hay pase de lista hoy, no se excluye a nadie: no hay dato de quién falta.
    if (registros.size > 0) {
      const previos = base.length
      base = filtrarPorPresentes(base, presentesHoy)
      excluidos = previos - base.length
    }
  }

  return { alumnos: base, porId, excluidos }
}

export async function vinculosDelGrupo(grupoId: string): Promise<Vinculo[]> {
  return db.vinculos.where('grupoId').equals(grupoId).toArray()
}

export async function crearVinculo(
  grupoId: string,
  alumnoA: string,
  alumnoB: string,
  tipo: Vinculo['tipo'],
): Promise<() => Promise<void>> {
  // Un mismo par no puede estar a la vez en 'separar' y 'juntar': el nuevo sustituye al anterior.
  const existentes = await db.vinculos
    .where('grupoId')
    .equals(grupoId)
    .filter(
      (v) =>
        (v.alumnoA === alumnoA && v.alumnoB === alumnoB) ||
        (v.alumnoA === alumnoB && v.alumnoB === alumnoA),
    )
    .toArray()

  const nuevo: Vinculo = { id: nuevoId(), grupoId, alumnoA, alumnoB, tipo }
  await db.transaction('rw', db.vinculos, async () => {
    await db.vinculos.bulkDelete(existentes.map((v) => v.id))
    await db.vinculos.add(nuevo)
  })

  return async () => {
    await db.transaction('rw', db.vinculos, async () => {
      await db.vinculos.delete(nuevo.id)
      await db.vinculos.bulkAdd(existentes)
    })
  }
}

export async function eliminarVinculo(id: string): Promise<() => Promise<void>> {
  const previo = await db.vinculos.get(id)
  if (!previo) return async () => {}
  await db.vinculos.delete(id)
  return async () => void (await db.vinculos.add(previo))
}

/** Alineaciones guardadas de un grupo, de más reciente a más antigua. */
export async function equiposGuardados(grupoId: string): Promise<Equipo[]> {
  const lista = await db.equipos.where('grupoId').equals(grupoId).toArray()
  return lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Miembros de cada equipo de alineaciones pasadas, para «priorizar compañeros nuevos». */
export async function historialEquipos(grupoId: string): Promise<string[][]> {
  const lista = await equiposGuardados(grupoId)
  return lista.flatMap((e) => e.equipos.map((eq) => eq.miembros))
}

export async function guardarEquipo(datos: {
  grupoId: string
  nombre: string
  udId?: string
  config: ConfigGeneracionEquipos
  equipos: EquipoGenerado[]
}): Promise<string> {
  const equipo: Equipo = {
    id: nuevoId(),
    grupoId: datos.grupoId,
    nombre: datos.nombre.trim() || 'Equipos sin nombre',
    fecha: aISO(),
    udId: datos.udId,
    config: datos.config,
    equipos: datos.equipos,
  }
  await db.equipos.add(equipo)
  return equipo.id
}

export async function eliminarEquipoGuardado(id: string): Promise<() => Promise<void>> {
  const previo = await db.equipos.get(id)
  if (!previo) return async () => {}
  await db.equipos.delete(id)
  return async () => void (await db.equipos.add(previo))
}

/**
 * Nivel 1–5 por quintiles según la media del alumno en el trimestre (§ tercero
 * del generador): solo Primaria, y el resultado es de partida, editable a mano
 * después. Sin datos suficientes, deja el nivel neutro (3).
 */
export async function sugerirNivelesDesdeMedia(
  grupoId: string,
  trimestre: Trimestre,
): Promise<Map<string, 1 | 2 | 3 | 4 | 5>> {
  const alumnos = (await db.alumnos.where('grupoId').equals(grupoId).toArray()).filter(
    (a) => a.activo,
  )
  const columnas = await columnasDe(grupoId, trimestre)
  const valores = await valoresDe(columnas.map((c) => c.id))
  const rubricas = new Map(
    (await db.rubricas.toArray()).map((r) => [r.id, r]),
  )

  const conMedia = alumnos.map((a) => ({
    id: a.id,
    media: columnas.length === 0 ? null : mediaDe(columnas, valores, a.id, rubricas).media,
  }))

  const resultado = new Map<string, 1 | 2 | 3 | 4 | 5>()
  const conDato = conMedia.filter((a) => a.media != null).sort((a, b) => b.media! - a.media!)
  const n = conDato.length
  conDato.forEach((a, i) => {
    const nivel = Math.min(5, Math.max(1, 5 - Math.floor((i * 5) / n))) as 1 | 2 | 3 | 4 | 5
    resultado.set(a.id, nivel)
  })
  for (const a of conMedia) if (!resultado.has(a.id)) resultado.set(a.id, 3)

  return resultado
}
