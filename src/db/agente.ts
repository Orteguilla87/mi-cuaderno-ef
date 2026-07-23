import { db, nuevoId } from './db'
import { crearObservacion } from './observaciones'
import type { Alumno, AccionAgente, EstadoAsistencia, SignoObservacion } from './types'
import { resolverFechaRelativa } from '../lib/pseudonimizacion'

/** Catálogo cerrado de acciones (§6). */
export type AccionId =
  | 'registrar_observacion'
  | 'marcar_asistencia'
  | 'marcar_chandal'
  | 'calificar'
  | 'anadir_comentario_eval'
  | 'crear_nota_sesion'
  | 'consultar'
  | 'deshacer_ultima'

/** Acción ya resuelta a ids reales (en local), lista para confirmar y ejecutar. */
export interface AccionResuelta {
  accion: AccionId
  resumen: string
  alumnoId?: string
  grupoId?: string
  fecha: string
  payload: Record<string, unknown>
}

export type ResultadoInterpretar =
  | { tipo: 'accion'; accion: AccionResuelta }
  | { tipo: 'ambiguo'; candidatos: Alumno[]; textoOriginal: string }
  | { tipo: 'no_reconocido' }

/**
 * Fallback offline (§6): cubre las acciones 1–3 y la 8 (deshacer) por palabras
 * clave, sin llamar a ningún sitio. `alumnoForzado` se usa tras desambiguar con
 * chips.
 */
export function interpretarLocal(
  texto: string,
  alumnosActivos: Alumno[],
  buscarAlumno: (t: string, as: Alumno[]) => { alumno: Alumno; puntuacion: number }[],
  alumnoForzado?: Alumno,
): ResultadoInterpretar {
  const t = texto.toLowerCase()
  const fecha = resolverFechaRelativa(texto)

  if (/\bdeshac/.test(t)) {
    return {
      tipo: 'accion',
      accion: { accion: 'deshacer_ultima', resumen: 'Deshacer la última acción del agente', fecha, payload: {} },
    }
  }

  let alumno = alumnoForzado
  if (!alumno) {
    const candidatos = buscarAlumno(texto, alumnosActivos)
    if (candidatos.length === 0) return { tipo: 'no_reconocido' }
    const [mejor, segundo] = candidatos
    // Ambiguo si el segundo mejor va casi empatado con el primero.
    if (segundo && segundo.puntuacion > mejor.puntuacion - 0.12) {
      return { tipo: 'ambiguo', candidatos: candidatos.map((c) => c.alumno), textoOriginal: texto }
    }
    alumno = mejor.alumno
  }

  const nombre = alumno.alias || alumno.nombre

  if (/ch[aá]ndal/.test(t)) {
    const sinChandal = /\b(sin|no trae|no lleva|olvidad)/.test(t)
    return {
      tipo: 'accion',
      accion: {
        accion: 'marcar_chandal',
        resumen: `${nombre}: ${sinChandal ? 'sin' : 'con'} chándal (${fecha})`,
        alumnoId: alumno.id,
        fecha,
        payload: { chandal: !sinChandal },
      },
    }
  }

  const estado = estadoAsistenciaDeTexto(t)
  if (estado) {
    return {
      tipo: 'accion',
      accion: {
        accion: 'marcar_asistencia',
        resumen: `${nombre}: ${estado} (${fecha})`,
        alumnoId: alumno.id,
        fecha,
        payload: { estado },
      },
    }
  }

  // Sin patrón claro, se registra como observación con el texto tal cual.
  const signo: SignoObservacion = /\b(bien|genial|estupendo|ayuda|colabora)\b/.test(t)
    ? '+'
    : /\b(mal|pelea|molesta|falta al respeto|no trabaja)\b/.test(t)
      ? '-'
      : 'neutro'
  return {
    tipo: 'accion',
    accion: {
      accion: 'registrar_observacion',
      resumen: `Observación (${signo}) para ${nombre}: «${texto}»`,
      alumnoId: alumno.id,
      fecha,
      payload: { texto, signo, tipo: 'conducta' },
    },
  }
}

function estadoAsistenciaDeTexto(t: string): EstadoAsistencia | null {
  if (/justificad/.test(t)) return 'justificada'
  if (/\bretraso|tarde\b/.test(t)) return 'retraso'
  if (/\b(falta|ausente|no ha venido|no vino)\b/.test(t)) return 'falta'
  if (/\bpresente|ha venido|asisti[oó]\b/.test(t)) return 'presente'
  return null
}

/**
 * Pila de deshacer del agente, en memoria: dura mientras la app está abierta,
 * que es justo el alcance de «deshacer la última acción del agente» (§6).
 */
const pilaDeshacer: { logId: string; deshacer: () => Promise<void> }[] = []

export function apilarDeshacer(logId: string, deshacer: () => Promise<void>): void {
  pilaDeshacer.push({ logId, deshacer })
}

export async function deshacerUltimaDelAgente(): Promise<string | null> {
  const ultima = pilaDeshacer.pop()
  if (!ultima) return null
  await ultima.deshacer()
  await marcarDeshecha(ultima.logId)
  return ultima.logId
}

/** Ejecuta la acción confirmada y devuelve la función de deshacer (en memoria, dura la sesión). */
export async function ejecutarAccion(a: AccionResuelta): Promise<() => Promise<void>> {
  switch (a.accion) {
    case 'deshacer_ultima':
      await deshacerUltimaDelAgente()
      return async () => {}

    case 'registrar_observacion': {
      const { deshacer } = await crearObservacion({
        alumnoId: a.alumnoId,
        grupoId: (await db.alumnos.get(a.alumnoId!))!.grupoId,
        tipo: (a.payload.tipo as 'conducta') ?? 'conducta',
        signo: a.payload.signo as SignoObservacion,
        texto: String(a.payload.texto ?? ''),
        tags: [],
        fecha: a.fecha,
      })
      return deshacer
    }

    case 'marcar_asistencia': {
      const previo = await db.asistencias
        .where('[alumnoId+fecha]')
        .equals([a.alumnoId!, a.fecha])
        .first()
      const estado = a.payload.estado as EstadoAsistencia
      if (previo) {
        const antes = { ...previo }
        await db.asistencias.update(previo.id, { estado })
        return async () => void (await db.asistencias.put(antes))
      }
      const nuevo = { id: nuevoId(), alumnoId: a.alumnoId!, fecha: a.fecha, estado, chandal: true }
      await db.asistencias.add(nuevo)
      return async () => void (await db.asistencias.delete(nuevo.id))
    }

    case 'marcar_chandal': {
      const previo = await db.asistencias
        .where('[alumnoId+fecha]')
        .equals([a.alumnoId!, a.fecha])
        .first()
      const chandal = a.payload.chandal as boolean
      if (previo) {
        const antes = { ...previo }
        await db.asistencias.update(previo.id, { chandal })
        return async () => void (await db.asistencias.put(antes))
      }
      const nuevo = { id: nuevoId(), alumnoId: a.alumnoId!, fecha: a.fecha, estado: 'presente' as const, chandal }
      await db.asistencias.add(nuevo)
      return async () => void (await db.asistencias.delete(nuevo.id))
    }

    case 'calificar': {
      const grupo = (await db.alumnos.get(a.alumnoId!))!.grupoId
      const trimestre = (a.payload.trimestre as 1 | 2 | 3) ?? 1
      const titulo = String(a.payload.columnaTitulo ?? '').toLowerCase()
      const columnas = await db.columnas.where('[grupoId+trimestre]').equals([grupo, trimestre]).toArray()
      const columna = columnas.find((c) => c.tipo === 'numero' && c.titulo.toLowerCase().includes(titulo))
      if (!columna) throw new Error(`No existe una columna numérica «${a.payload.columnaTitulo}» en el cuaderno de este trimestre.`)

      const previo = await db.valores.where('[columnaId+alumnoId]').equals([columna.id, a.alumnoId!]).first()
      const valor = Number(a.payload.valor)
      if (previo) {
        const antes = { ...previo }
        await db.valores.update(previo.id, { numero: valor, actualizado: Date.now() })
        return async () => void (await db.valores.put(antes))
      }
      const nuevo = { id: nuevoId(), columnaId: columna.id, alumnoId: a.alumnoId!, numero: valor, actualizado: Date.now() }
      await db.valores.add(nuevo)
      return async () => void (await db.valores.delete(nuevo.id))
    }

    case 'anadir_comentario_eval': {
      const trimestre = (a.payload.trimestre as 1 | 2 | 3) ?? 1
      const comentario = String(a.payload.comentario ?? '')
      const previo = await db.evalTrimestrales.where('[alumnoId+trimestre]').equals([a.alumnoId!, trimestre]).first()
      if (previo) {
        const antes = { ...previo }
        await db.evalTrimestrales.update(previo.id, { comentario })
        return async () => void (await db.evalTrimestrales.put(antes))
      }
      const nuevo = {
        id: nuevoId(),
        alumnoId: a.alumnoId!,
        trimestre,
        notaCalculada: 0,
        calificacionOficial: 'SU' as const,
        comentario,
        cerrado: false,
      }
      await db.evalTrimestrales.add(nuevo)
      return async () => void (await db.evalTrimestrales.delete(nuevo.id))
    }

    case 'crear_nota_sesion': {
      const nota = String(a.payload.nota ?? '')
      const previa = await db.sesiones.where('[grupoId+fecha]').equals([a.grupoId!, a.fecha]).first()
      if (previa) {
        const antes = { ...previa }
        await db.sesiones.update(previa.id, { notas: previa.notas ? `${previa.notas}\n${nota}` : nota })
        return async () => void (await db.sesiones.put(antes))
      }
      const nueva = { id: nuevoId(), grupoId: a.grupoId!, fecha: a.fecha, titulo: '', juegos: [], notas: nota, recursos: [] }
      await db.sesiones.add(nueva)
      return async () => void (await db.sesiones.delete(nueva.id))
    }

    case 'consultar':
      // Es de solo lectura: no hay nada que deshacer.
      return async () => {}

    default:
      throw new Error('Acción no reconocida.')
  }
}

/** Registra la acción aplicada en el log del agente (§9 M9: log con deshacer). */
export async function registrarEnLog(transcripcion: string, accion: AccionResuelta): Promise<string> {
  const entrada: AccionAgente = {
    id: nuevoId(),
    timestamp: Date.now(),
    transcripcion,
    accion: accion.accion,
    payload: { alumnoId: accion.alumnoId, fecha: accion.fecha, ...accion.payload },
    estado: 'aplicada',
  }
  await db.accionesAgente.add(entrada)
  return entrada.id
}

export async function marcarDeshecha(logId: string): Promise<void> {
  await db.accionesAgente.update(logId, { estado: 'deshecha' })
}
