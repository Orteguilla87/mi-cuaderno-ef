import { cicloDeCurso, cicloDeUnidad, idCriterioPrimaria, ordinalCiclo } from '../lib/ciclos'
import { estadoDia, trimestreDe, type CursoFechas } from '../lib/calendarioEscolar'
import { aISO, deISO, diaLectivo, formatoDiaCorto, sumarDias } from '../lib/fechas'
import { esEnlace } from '../lib/importarTexto'
import { criteriosDeGrupo } from './criterios'
import { db, nuevoId } from './db'
import { crearLote, deshacerLote, type LotePlan } from './lotes'
import {
  NIVEL_CICLO_INFANTIL,
  type ClaseCancelada,
  type CursoEscolar,
  type Columna,
  type Etapa,
  type FilaInstrumento,
  type Grupo,
  type JuegoEnSesion,
  type Plantilla,
  type Recurso,
  type Sesion,
  type SesionPlan,
  type Trimestre,
  type UnidadDidactica,
  type UnidadEnCurso,
  type UnidadPrimaria,
} from './types'

export type { UnidadEnCurso }

/** Lunes de la semana a la que pertenece una fecha. */
export function lunesDe(iso: string): string {
  const f = deISO(iso)
  const dow = f.getDay() // 0 domingo
  // El domingo pertenece a la semana que termina, no a la que empieza.
  const desplazamiento = dow === 0 ? -6 : 1 - dow
  return sumarDias(iso, desplazamiento)
}

/** Crea una sesión vacía para un hueco del horario y devuelve su id. */
export async function crearSesion(
  grupoId: string,
  fecha: string,
  datos: Partial<Sesion> = {},
): Promise<string> {
  const sesion: Sesion = {
    id: nuevoId(),
    grupoId,
    fecha,
    titulo: datos.titulo ?? '',
    udId: datos.udId,
    juegos: datos.juegos ?? [],
    notas: datos.notas ?? '',
    valoracion: datos.valoracion,
    recursos: datos.recursos ?? [],
    recursosNecesarios: datos.recursosNecesarios,
    comentarios: datos.comentarios,
    // Franja del horario que ocupa. Sin ella, dos clases del mismo grupo el
    // mismo día vuelven a ser indistinguibles (v24 en `db.ts`).
    franjaInicio: datos.franjaInicio,
  }
  await db.sesiones.add(sesion)
  // Planificar ese día es, por sí solo, restaurar la clase: si estaba cancelada
  // (`db.clasesCanceladas`), la excepción deja de tener sentido y se retira.
  await quitarCancelaciones(grupoId, fecha, sesion.franjaInicio)
  return sesion.id
}

/**
 * Retira las excepciones de «no hay clase» que tapan la franja que se acaba de
 * planificar — solo esa. Un grupo con dos clases ese día puede tener una
 * cancelada y la otra no, así que restaurar el día entero sería decidir por el
 * usuario: una excepción de día completo se conserva, estrechada a las demás
 * franjas.
 */
async function quitarCancelaciones(
  grupoId: string,
  fecha: string,
  franjaInicio?: string,
): Promise<void> {
  const previas = await db.clasesCanceladas.where('[grupoId+fecha]').equals([grupoId, fecha]).toArray()
  if (!previas.length) return

  // Sin franja conocida no hay nada que estrechar: se comporta como antes.
  if (franjaInicio === undefined) {
    await db.clasesCanceladas.bulkDelete(previas.map((c) => c.id))
    return
  }

  const grupo = await db.grupos.get(grupoId)
  const dow = diaLectivo(fecha)
  const otras = (grupo?.horario ?? [])
    .filter((f) => f.diaSemana === dow && f.horaInicio !== franjaInicio)
    .map((f) => f.horaInicio)

  const aBorrar = previas.filter((c) => c.horaInicio === undefined || c.horaInicio === franjaInicio)
  const aCrear: ClaseCancelada[] = []
  for (const c of aBorrar) {
    if (c.horaInicio !== undefined) continue // era de esta franja: desaparece y ya está
    for (const hora of otras)
      aCrear.push({ id: nuevoId(), grupoId, fecha, horaInicio: hora, creado: c.creado })
  }

  await db.transaction('rw', db.clasesCanceladas, async () => {
    await db.clasesCanceladas.bulkDelete(aBorrar.map((c) => c.id))
    if (aCrear.length) await db.clasesCanceladas.bulkAdd(aCrear)
  })
}

/**
 * Copia una sesión a otro grupo y fecha (§5 M3: duplicar a otro grupo o nivel).
 * No arrastra la valoración: es un juicio sobre cómo salió aquella clase, no
 * parte del plan.
 */
export async function duplicarSesion(
  sesionId: string,
  destino: { grupoId: string; fecha: string },
): Promise<string> {
  const origen = await db.sesiones.get(sesionId)
  if (!origen) throw new Error('La sesión de origen ya no existe')
  return crearSesion(destino.grupoId, destino.fecha, {
    titulo: origen.titulo,
    udId: origen.udId,
    juegos: origen.juegos,
    notas: origen.notas,
    recursos: origen.recursos,
    recursosNecesarios: origen.recursosNecesarios,
    comentarios: origen.comentarios,
  })
}

/**
 * Vuelca un contenido copiado sobre una sesión YA EXISTENTE, en cualquier
 * grupo (copiar/pegar suelto, distinto de «Duplicar»: aquí no se crea ninguna
 * sesión nueva, se sustituye el contenido de la que el usuario elija).
 */
export async function pegarEnSesion(
  sesionId: string,
  contenido: {
    titulo: string
    udId?: string
    juegos: JuegoEnSesion[]
    notas: string
    recursos: Recurso[]
    recursosNecesarios?: string
    comentarios?: string
  },
): Promise<() => Promise<void>> {
  const antes = await db.sesiones.get(sesionId)
  if (!antes) throw new Error('La sesión ya no existe')

  await db.sesiones.update(sesionId, {
    titulo: contenido.titulo,
    udId: contenido.udId,
    juegos: contenido.juegos,
    notas: contenido.notas,
    recursos: contenido.recursos,
    recursosNecesarios: contenido.recursosNecesarios,
    comentarios: contenido.comentarios,
  })
  return async () => void (await db.sesiones.put(antes))
}

/**
 * Cambia la fecha y/o el horario propio de una sesión. Si se cambia la fecha,
 * comprueba que el grupo no tenga ya otra sesión ese día: dos sesiones del
 * mismo grupo en la misma fecha rompería el resto del planificador (que
 * asume una por `[grupoId+fecha]`).
 */
export async function editarSesion(
  sesionId: string,
  cambios: { fecha?: string; horaInicio?: string; horaFin?: string },
): Promise<() => Promise<void>> {
  const antes = await db.sesiones.get(sesionId)
  if (!antes) throw new Error('La sesión ya no existe')

  if (cambios.fecha && cambios.fecha !== antes.fecha) {
    const ocupada = await db.sesiones
      .where('[grupoId+fecha]')
      .equals([antes.grupoId, cambios.fecha])
      .first()
    if (ocupada) throw new Error(`Este grupo ya tiene una sesión el ${cambios.fecha}.`)
  }

  await db.sesiones.update(sesionId, cambios)
  // Mover una sesión a un día cancelado lo reactiva: hay clase, la hay.
  if (cambios.fecha) await quitarCancelaciones(antes.grupoId, cambios.fecha)
  return async () => void (await db.sesiones.put(antes))
}

/* ————————————————— Eliminar una sesión de la planificación —————————————————
 *
 * Exactamente dos opciones, y ninguna crea sesiones, cambia el horario ni toca
 * el calendario:
 *  - «mover»: la sesión desaparece y su contenido, y el de las posteriores del
 *    grupo, avanza una sesión (a la siguiente que existe, en orden real). Nada
 *    se pierde, se pospone. El desplazamiento se detiene en la primera sesión
 *    VACÍA: a partir de ahí no hay nada que mover. Si no hay ninguna vacía por
 *    delante, el último contenido se queda sin ubicación y se avisa.
 *  - «eliminar»: la sesión desaparece con su contenido. Nada más se mueve.
 *
 * En los dos casos la clase de ese día queda marcada en `clasesCanceladas`: el
 * hueco sale del horario, y sin la marca Hoy y el Calendario volverían a
 * enseñarla vacía como si no se hubiera eliminado.
 *
 * Se mueve CONTENIDO, no sesiones: cada fila conserva su fecha, su franja y su
 * hora ajustada. Se mueve todo el contenido, comentarios y valoración
 * incluidos: son sesiones futuras.
 */

export type ModoEliminarClase = 'mover' | 'eliminar'

/** Una clase concreta, para enseñarla: fecha y franja. */
export interface ClaseEnPrevia {
  fecha: string
  franja: string
}

export interface MovimientoContenido {
  titulo: string
  unidad: string | null
  de: ClaseEnPrevia
  a: ClaseEnPrevia
}

export interface PreviaEliminarClase {
  modo: ModoEliminarClase
  eliminada: ClaseEnPrevia & { id: string; titulo: string; unidad: string | null; vacia: boolean }
  /** Solo en «mover»: qué contenido pasa a qué clase. */
  movimientos: MovimientoContenido[]
  /** Sesión vacía que recibe el último contenido y detiene el desplazamiento. */
  seDetieneEn: ClaseEnPrevia | null
  /** Contenido que se queda sin sesión donde ir. Nunca se crea una para él. */
  sinUbicacion: { titulo: string; unidad: string | null } | null
}

/** Franja que ocupa una sesión: la suya o, sin ella (antes de v24), la primera de su día. */
function franjaDe(s: Sesion, grupo: Grupo): string {
  if (s.franjaInicio !== undefined) return s.franjaInicio
  const dow = diaLectivo(s.fecha)
  const delDia = grupo.horario
    .filter((f) => f.diaSemana === dow)
    .map((f) => f.horaInicio)
    .sort((a, b) => a.localeCompare(b))
  return delDia[0] ?? ''
}

/** Lo que se mueve de una sesión a otra: todo menos lo que la hace ser esa clase. */
function contenidoDe(s: Sesion): Partial<Sesion> {
  const { id, grupoId, fecha, franjaInicio, horaInicio, horaFin, ...contenido } = s
  void [id, grupoId, fecha, franjaInicio, horaInicio, horaFin]
  return contenido
}

const tituloVisible = (s: Sesion) => s.titulo.trim() || 'Sesión sin título'

async function calcularEliminacion(sesionId: string, modo: ModoEliminarClase) {
  const sesion = await db.sesiones.get(sesionId)
  if (!sesion) throw new Error('La sesión ya no existe')
  const grupo = await db.grupos.get(sesion.grupoId)
  if (!grupo) throw new Error('El grupo ya no existe')
  const curso = await db.cursos.filter((c) => c.activo).first()
  const unidades = new Map((await db.unidades.toArray()).map((u) => [u.id, u.titulo]))
  const unidadDe = (s: Sesion) => (s.udId ? (unidades.get(s.udId) ?? null) : null)

  const franja = franjaDe(sesion, grupo)
  const movimientos: MovimientoContenido[] = []
  const despues: Sesion[] = []
  const tocadas: Sesion[] = []
  let seDetieneEn: ClaseEnPrevia | null = null
  let sinUbicacion: PreviaEliminarClase['sinUbicacion'] = null

  if (modo === 'mover' && !sesionVacia(sesion)) {
    if (!curso) throw new Error('No hay ningún curso escolar activo')
    const posteriores = sesionesEnOrden(
      await db.sesiones.where('grupoId').equals(sesion.grupoId).toArray(),
      grupo,
      curso,
      sesion.fecha,
      franja,
    ).filter((x) => x.sesion.id !== sesion.id && (x.sesion.fecha > sesion.fecha || x.franja > franja))

    // `enMano` es el contenido que busca sitio: primero el de la eliminada; al
    // caer sobre una sesión con contenido, el de esa pasa a buscar la siguiente.
    let enMano: Sesion | null = sesion
    let desde: ClaseEnPrevia = { fecha: sesion.fecha, franja }
    for (const { sesion: destino, franja: franjaDestino } of posteriores) {
      if (!enMano) break
      const a = { fecha: destino.fecha, franja: franjaDestino }
      movimientos.push({ titulo: tituloVisible(enMano), unidad: unidadDe(enMano), de: desde, a })
      tocadas.push(destino)
      despues.push({ ...sinContenido(destino), ...contenidoDe(enMano) })
      if (sesionVacia(destino)) {
        seDetieneEn = a
        enMano = null
      } else {
        enMano = destino
        desde = a
      }
    }
    if (enMano) sinUbicacion = { titulo: tituloVisible(enMano), unidad: unidadDe(enMano) }
  }

  // La clase del día queda cancelada, salvo que no salga del horario (sesión
  // movida a mano a un día sin franja) o que ya lo estuviera.
  let cancelacion: ClaseCancelada | null = null
  const enHorario = grupo.horario.some(
    (f) => f.diaSemana === diaLectivo(sesion.fecha) && f.horaInicio === franja,
  )
  if (enHorario) {
    const previas = await db.clasesCanceladas
      .where('[grupoId+fecha]')
      .equals([sesion.grupoId, sesion.fecha])
      .toArray()
    if (!previas.some((c) => c.horaInicio === undefined || c.horaInicio === franja))
      cancelacion = {
        id: nuevoId(),
        grupoId: sesion.grupoId,
        fecha: sesion.fecha,
        horaInicio: franja,
        creado: new Date().toISOString(),
      }
  }

  const previa: PreviaEliminarClase = {
    modo,
    eliminada: {
      id: sesion.id,
      fecha: sesion.fecha,
      franja,
      titulo: tituloVisible(sesion),
      unidad: unidadDe(sesion),
      vacia: sesionVacia(sesion),
    },
    movimientos,
    seDetieneEn,
    sinUbicacion,
  }
  return { sesion, grupo, previa, tocadas, despues, cancelacion }
}

/** Qué pasaría al eliminar, sin escribir nada. */
export async function previsualizarEliminarClase(
  sesionId: string,
  modo: ModoEliminarClase,
): Promise<PreviaEliminarClase> {
  return (await calcularEliminacion(sesionId, modo)).previa
}

/**
 * Elimina la sesión según `modo`, en una sola transacción, y devuelve el lote
 * con el estado exacto de antes para poder deshacerlo (`deshacerLote`).
 */
export async function eliminarClase(
  sesionId: string,
  modo: ModoEliminarClase,
): Promise<{ previa: PreviaEliminarClase; lote: LotePlan }> {
  const { sesion, grupo, previa, tocadas, despues, cancelacion } = await calcularEliminacion(
    sesionId,
    modo,
  )

  await db.transaction('rw', db.sesiones, db.clasesCanceladas, async () => {
    await db.sesiones.delete(sesion.id)
    if (despues.length) await db.sesiones.bulkPut(despues)
    if (cancelacion) await db.clasesCanceladas.add(cancelacion)
  })

  const cuando = `${formatoDiaCorto(sesion.fecha)}${previa.eliminada.franja ? ` · ${previa.eliminada.franja}` : ''}`
  const lote = crearLote({
    grupoId: grupo.id,
    tipo: modo === 'mover' ? 'eliminar-mover' : 'eliminar',
    descripcion:
      modo === 'mover'
        ? `Eliminar y mover a la derecha: ${cuando} en ${grupo.nombre}`
        : `Eliminar la sesión del ${cuando} en ${grupo.nombre}`,
    antes: { sesiones: [sesion, ...tocadas], cancelaciones: [] },
    despues: { sesiones: despues, cancelaciones: cancelacion ? [cancelacion] : [] },
  })
  return { previa, lote }
}

/** Guarda una sesión como plantilla reutilizable. */
export async function sesionAPlantilla(sesionId: string, titulo?: string): Promise<string> {
  const s = await db.sesiones.get(sesionId)
  if (!s) throw new Error('La sesión ya no existe')
  const grupo = await db.grupos.get(s.grupoId)
  const plantilla: Plantilla = {
    id: nuevoId(),
    tipo: 'sesion',
    titulo: titulo?.trim() || s.titulo || 'Sesión sin título',
    etapa: grupo?.etapa,
    juegos: s.juegos,
    notas: s.notas,
    recursos: s.recursos,
  }
  await db.plantillas.add(plantilla)
  return plantilla.id
}

/** Vuelca una plantilla de sesión sobre un hueco del horario. */
export async function aplicarPlantillaSesion(
  plantillaId: string,
  destino: { grupoId: string; fecha: string },
): Promise<string> {
  const p = await db.plantillas.get(plantillaId)
  if (!p || p.tipo !== 'sesion') throw new Error('Plantilla no encontrada')
  return crearSesion(destino.grupoId, destino.fecha, {
    titulo: p.titulo,
    juegos: p.juegos,
    notas: p.notas,
    recursos: p.recursos,
  })
}

/**
 * Crea una unidad. Solo el título es obligatorio: una UD sin trimestre, o que
 * no compute, es válida —no entra en la nota, pero sí en la cobertura de
 * criterios (Orden 130/2023, art. 6)—.
 *
 * La etapa se fija aquí y no se vuelve a tocar: cambiarla después dejaría los
 * criterios ya elegidos apuntando a otro decreto.
 */
export async function crearUnidad(
  datos: {
    titulo: string
    trimestre: 1 | 2 | 3 | null
    criterios?: string[]
    plantillaId?: string
    /** Plan de sesiones, cuando la unidad viene de una importación. */
    sesiones?: SesionPlan[]
  } & (
    | { etapa: 'primaria'; nivel: number; computa?: boolean; pesoTrimestre?: number }
    | { etapa: 'infantil' }
  ),
): Promise<string> {
  const comun = {
    id: nuevoId(),
    titulo: datos.titulo.trim(),
    trimestre: datos.trimestre,
    criterios: datos.criterios ?? [],
    plantillaId: datos.plantillaId,
    // Una unidad creada a mano nace sin plan: el campo se omite en vez de
    // guardarse como `[]`, para no distinguir «sin sesiones» de «vacía».
    ...(datos.sesiones?.length ? { sesiones: datos.sesiones } : {}),
  }

  // En Infantil no se escriben `computa` ni `pesosPorNivel`, ni siquiera vacíos:
  // no es que valgan cero, es que ahí no hay ponderación que valga.
  const ud: UnidadDidactica =
    datos.etapa === 'infantil'
      ? { ...comun, etapa: 'infantil', niveles: [NIVEL_CICLO_INFANTIL] }
      : {
          ...comun,
          etapa: 'primaria',
          // Se crea siempre con un solo curso: los demás se añaden luego, con
          // la comprobación de ciclo delante.
          niveles: [datos.nivel],
          computa: datos.computa ?? true,
          pesosPorNivel: { [datos.nivel]: datos.pesoTrimestre ?? 0 },
        }

  await db.unidades.add(ud)
  return ud.id
}

// ——— La unidad vista desde UN curso ———
//
// Una unidad abarca varios cursos del mismo ciclo, pero casi todo lo que la
// consume —el motor de notas, el reparto de pesos, el cuaderno— trabaja siempre
// desde UN grupo, y por tanto desde UN curso. En vez de enseñarles la lista y
// obligarlos a elegir, se les entrega la unidad ya PROYECTADA sobre ese curso:
// con su `nivel` y su `pesoTrimestre` resueltos.
//
// Es lo que mantiene el motor de `lib/notas.ts` sin enterarse del multi-curso:
// sigue viendo una unidad de un curso con un peso, exactamente como antes.

/** Proyecta una unidad de Primaria sobre uno de sus cursos. */
export function enCurso(unidad: UnidadPrimaria, nivel: number): UnidadEnCurso {
  return { ...unidad, nivel, pesoTrimestre: unidad.pesosPorNivel[nivel] ?? 0 }
}

/**
 * Unidades de Primaria que abarcan un curso, ya proyectadas sobre él.
 *
 * Por el índice multiEntry `niveles`: una unidad de 3.º y 4.º sale en los dos.
 * La etapa se filtra en memoria porque un multiEntry no puede formar parte de un
 * índice compuesto; da igual, son decenas de registros. Aun así el filtro hace
 * falta: el 3 de un grupo de Infantil son los 3 años y el de Primaria es 3.º.
 */
export async function unidadesDelCurso(nivel: number): Promise<UnidadEnCurso[]> {
  const lista = await db.unidades.where('niveles').equals(nivel).toArray()
  return lista
    .filter((u): u is UnidadPrimaria => u.etapa === 'primaria')
    .map((u) => enCurso(u, nivel))
}

// ——— Cursos de una unidad ———

/**
 * Comprueba la regla dura del multi-curso: misma etapa y MISMO CICLO.
 *
 * Los criterios de evaluación de Primaria se definen por ciclo, así que una
 * unidad que abarcara 3.º y 5.º tendría que sostener dos juegos de criterios
 * distintos a la vez, que es curricularmente incorrecto. Devuelve el motivo en
 * lenguaje llano, o `null` si el curso se puede añadir.
 */
export function motivoNoAdmiteCurso(unidad: UnidadDidactica, nivel: number): string | null {
  if (unidad.etapa === 'infantil')
    return 'En Infantil la unidad ya es del 2.º ciclo entero: 3, 4 y 5 años la comparten.'
  if (unidad.niveles.includes(nivel)) return `La unidad ya incluye ${nivel}º.`

  const cicloUnidad = cicloDeUnidad(unidad.niveles)
  const cicloNuevo = cicloDeCurso(nivel)
  if (cicloUnidad !== null && cicloUnidad !== cicloNuevo)
    return (
      `${nivel}º es de ${ordinalCiclo(cicloNuevo)} ciclo y la unidad es de ${ordinalCiclo(cicloUnidad)}. ` +
      'Los criterios de evaluación se definen por ciclo, así que no son los mismos y una unidad no ' +
      `puede sostener los dos a la vez. Cópiala a ${nivel}º en su lugar.`
    )
  return null
}

/**
 * Añade un curso a la unidad. El punto de partida de sus sesiones se elige:
 * `'blanco'` o el curso del que copiar el plan. Nunca se copia en silencio.
 */
export async function anadirCursoAUnidad(
  udId: string,
  nivel: number,
  origen: 'blanco' | number,
): Promise<() => Promise<void>> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) throw new Error('La unidad ya no existe')

  const motivo = motivoNoAdmiteCurso(unidad, nivel)
  if (motivo) throw new Error(motivo)
  if (unidad.etapa !== 'primaria') throw new Error(SOLO_PRIMARIA)

  const copiadas =
    origen === 'blanco'
      ? []
      : sesionesDe(unidad, origen).map((s, i) => ({
          ...s,
          id: nuevoId(),
          nivel,
          orden: i,
          recursos: [...s.recursos],
        }))

  const nuevas = [...(unidad.sesiones ?? []), ...copiadas]
  await db.unidades.put({
    ...unidad,
    niveles: [...unidad.niveles, nivel].sort((a, b) => a - b),
    // El curso entra sin peso: el reparto del trimestre es suyo y se hace luego.
    pesosPorNivel: { ...unidad.pesosPorNivel, [nivel]: 0 },
    ...(nuevas.length ? { sesiones: nuevas } : {}),
  })

  return async () => void (await db.unidades.put(unidad))
}

/** Recuento para la confirmación de quitar un curso de la unidad. */
export interface ImpactoQuitarCurso {
  sesiones: number
  /** Celdas escritas en grupos de ese curso. Si hay alguna, se bloquea. */
  valores: number
  /** Clases ya colocadas en grupos de ese curso, que quedarán sin unidad. */
  sesionesColocadas: number
  esElUltimo: boolean
}

export async function impactoQuitarCurso(
  udId: string,
  nivel: number,
): Promise<ImpactoQuitarCurso | null> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) return null

  const gruposDelCurso = new Set(
    (await db.grupos.toArray())
      .filter((g) => g.etapa === unidad.etapa && g.nivel === nivel)
      .map((g) => g.id),
  )
  const columnas = (await db.columnas.where('udId').equals(udId).toArray()).filter((c) =>
    gruposDelCurso.has(c.grupoId),
  )
  const valores = columnas.length
    ? await db.valores.where('columnaId').anyOf(columnas.map((c) => c.id)).count()
    : 0
  const colocadas = (await db.sesiones.where('udId').equals(udId).toArray()).filter((s) =>
    gruposDelCurso.has(s.grupoId),
  )

  return {
    sesiones: sesionesDe(unidad, nivel).length,
    valores,
    sesionesColocadas: colocadas.length,
    esElUltimo: unidad.niveles.length <= 1,
  }
}

/**
 * Quita un curso de la unidad, con sus sesiones planificadas y su peso.
 *
 * Se bloquea si hay notas u observaciones puestas en grupos de ese curso
 * ligadas a la unidad: quitarlo las dejaría colgando de una unidad que ya no es
 * de su curso. Y no se puede quitar el último: una unidad sin curso no la
 * encuentra nadie.
 *
 * Las clases ya colocadas no se borran —nunca se destruye el registro de algo
 * que ocurrió—, solo pierden la unidad, igual que al mover.
 */
export async function quitarCursoDeUnidad(
  udId: string,
  nivel: number,
): Promise<() => Promise<void>> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) throw new Error('La unidad ya no existe')
  if (!unidad.niveles.includes(nivel)) throw new Error('Ese curso no está en la unidad')
  if (unidad.niveles.length <= 1)
    throw new Error('Es el único curso de la unidad. Si ya no la usas, archívala o elimínala.')

  const impacto = await impactoQuitarCurso(udId, nivel)
  if ((impacto?.valores ?? 0) > 0)
    throw new Error(
      `Hay notas u observaciones puestas en ${nivel}º con esta unidad. Quitar el curso las dejaría colgando: bórralas antes, o deja el curso donde está.`,
    )

  const { pesosPorNivel, ...resto } = unidad.etapa === 'primaria' ? unidad : { ...unidad, pesosPorNivel: {} }
  const pesosSinEl = Object.fromEntries(
    Object.entries(pesosPorNivel).filter(([n]) => Number(n) !== nivel),
  )

  // Los grupos se leen ANTES de la transacción: `db.grupos` no está en su
  // alcance, y meterlo solo para leer complicaría la de deshacer sin ganar nada.
  const gruposDelCurso = new Set(
    (await db.grupos.toArray())
      .filter((g) => g.etapa === unidad.etapa && g.nivel === nivel)
      .map((g) => g.id),
  )
  let colocadas: string[] = []

  await db.transaction('rw', [db.unidades, db.sesiones], async () => {
    colocadas = (await db.sesiones.where('udId').equals(udId).toArray())
      .filter((s) => gruposDelCurso.has(s.grupoId))
      .map((s) => s.id)
    for (const id of colocadas) await db.sesiones.update(id, { udId: undefined })

    const quedan = (unidad.sesiones ?? []).filter((s) => s.nivel !== nivel)
    await db.unidades.put({
      ...resto,
      pesosPorNivel: pesosSinEl,
      niveles: unidad.niveles.filter((n) => n !== nivel),
      ...(quedan.length ? { sesiones: quedan } : { sesiones: undefined }),
    } as UnidadDidactica)
  })

  return async () => {
    await db.transaction('rw', [db.unidades, db.sesiones], async () => {
      await db.unidades.put(unidad)
      for (const id of colocadas) await db.sesiones.update(id, { udId })
    })
  }
}

// ——— Copiar y mover una unidad a otro curso ———
//
// Solo Primaria. En Infantil la unidad ya es del 2.º ciclo entero —3, 4 y 5 años
// comparten los criterios del Decreto 36/2022—, así que no hay otro curso al que
// llevarla y ninguna de las dos acciones tiene sentido.

/** El error que sale cuando se intenta copiar o mover una unidad de Infantil. */
const SOLO_PRIMARIA =
  'Las unidades de Infantil son del 2.º ciclo entero: no hay otro curso al que llevarlas.'

export interface MapeoCriterios {
  /** Pares origen → destino que sí tienen equivalente. */
  mapeados: { origen: string; destino: string }[]
  /** Ids del origen sin equivalente en el ciclo destino. Se quedan fuera. */
  sinMapear: string[]
}

/**
 * Equivalencia de criterios entre ciclos de Primaria, por POSICIÓN.
 *
 * Los ids del Decreto 61/2022 son `EF.{ciclo}C.{codigo}`, así que la
 * equivalencia es literalmente cambiar el segmento del ciclo: `EF.2C.3.1` →
 * `EF.3C.3.1`. El código se lee de la base, nunca troceando la cadena: el id es
 * la clave primaria y el formato es del decreto, no nuestro.
 *
 * Si el id equivalente no existe en el ciclo destino, la sugerencia es VACÍA y
 * el criterio queda «sin mapear». No se busca el más parecido por texto: dos
 * criterios que se parecen no son el mismo criterio, y adivinarlo aquí
 * falsearía la trazabilidad curricular de toda la unidad.
 */
export async function mapearCriterios(
  ids: string[],
  nivelOrigen: number,
  nivelDestino: number,
): Promise<MapeoCriterios> {
  const cicloDestino = cicloDeCurso(nivelDestino)
  // Mismo ciclo: son los mismos criterios, no hay nada que remapear.
  if (cicloDeCurso(nivelOrigen) === cicloDestino)
    return { mapeados: ids.map((origen) => ({ origen, destino: origen })), sinMapear: [] }

  const validos = new Set((await criteriosDeGrupo('primaria', nivelDestino)).map((c) => c.id))
  const mapeados: { origen: string; destino: string }[] = []
  const sinMapear: string[] = []

  for (const origen of ids) {
    const criterio = await db.criterios.get(origen)
    const destino = criterio ? idCriterioPrimaria(cicloDestino, criterio.codigo) : undefined
    if (destino && validos.has(destino)) mapeados.push({ origen, destino })
    else sinMapear.push(origen)
  }

  return { mapeados, sinMapear }
}

/** Lo que hay que enseñar antes de confirmar una copia o un movimiento (§3.8). */
export interface ResumenCopia {
  titulo: string
  nivelOrigen: number
  cambiaDeCiclo: boolean
  /** Sesiones del plan, que se copian enteras. */
  sesionesPlan: number
  mapeados: { origen: string; destino: string }[]
  sinMapear: string[]
  /** Celdas escritas. Si hay alguna, mover se bloquea. */
  valores: number
  /** Clases ya colocadas que perderían la unidad al MOVER. Copiar no las toca. */
  sesionesColocadas: number
  /** Suma de pesos del trimestre destino sin contar esta unidad (§3.6). */
  pesoOcupadoDestino: number
}

export async function resumenCopia(udId: string, nivelDestino: number): Promise<ResumenCopia> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) throw new Error('La unidad de origen ya no existe')
  if (unidad.etapa === 'infantil') throw new Error(SOLO_PRIMARIA)

  // Todos los cursos de la unidad comparten ciclo, así que el primero decide.
  const nivelOrigen = unidad.niveles[0] ?? 1
  const { mapeados, sinMapear } = await mapearCriterios(unidad.criterios, nivelOrigen, nivelDestino)
  const impacto = await contarImpactoUnidad(udId)

  // El reparto del trimestre destino, sin esta unidad: si va al mismo curso y
  // trimestre, contarla sería sumarla dos veces.
  const hermanas =
    unidad.trimestre === null ? [] : await unidadesDe(nivelDestino, unidad.trimestre)
  const pesoOcupadoDestino = hermanas
    .filter((u) => u.id !== udId && u.computa)
    .reduce((s, u) => s + u.pesoTrimestre, 0)

  return {
    titulo: unidad.titulo,
    nivelOrigen,
    cambiaDeCiclo: cicloDeCurso(nivelOrigen) !== cicloDeCurso(nivelDestino),
    sesionesPlan: sesionesDe(unidad, nivelOrigen).length,
    mapeados,
    sinMapear,
    valores: impacto?.valores ?? 0,
    sesionesColocadas: impacto?.sesionesReales ?? 0,
    pesoOcupadoDestino,
  }
}

/**
 * Copia una unidad ENTERA a otro curso. La original se queda donde está.
 *
 * Se copia por *spread* de la unidad de origen, no reconstruyéndola campo a
 * campo: así, cuando la unidad gane campos nuevos, la copia los arrastra sola.
 * La versión anterior (`crearUnidad` con una lista escrita a mano) perdía en
 * silencio todo lo que no estuviera en esa lista —el plan de sesiones entero,
 * entre otras cosas— y por eso la copia llegaba solo con el título.
 *
 * NUNCA se copian alumnado, calificaciones, observaciones, asistencia ni las
 * fechas concretas de las sesiones ya colocadas: el plan viaja sin calendario,
 * como cuando se escribió. NUNCA se sobrescribe una unidad existente: siempre
 * se crea una nueva.
 *
 * Los instrumentos del cuaderno tampoco viajan: una `Columna` vive en un GRUPO
 * y un trimestre concretos, no en la unidad, y no hay forma no arbitraria de
 * decidir en qué grupos del curso destino recrearlos.
 */
export async function copiarUnidad(
  udId: string,
  nivelDestino: number,
  opciones: { pesoTrimestre?: number; desdeNivel?: number } = {},
): Promise<{ id: string; deshacer: () => Promise<void> }> {
  const origen = await db.unidades.get(udId)
  if (!origen) throw new Error('La unidad de origen ya no existe')
  if (origen.etapa === 'infantil') throw new Error(SOLO_PRIMARIA)

  // La copia va a UN curso, así que se lleva el plan de UN curso de origen. Por
  // defecto el primero; con varios cursos, el que se elija.
  const desdeNivel = opciones.desdeNivel ?? origen.niveles[0] ?? 1
  const { mapeados, sinMapear } = await mapearCriterios(
    origen.criterios,
    desdeNivel,
    nivelDestino,
  )

  const plan = sesionesDe(origen, desdeNivel)
  const id = nuevoId()
  const copia: UnidadPrimaria = {
    ...origen,
    id,
    niveles: [nivelDestino],
    criterios: mapeados.map((m) => m.destino),
    // El peso NO se hereda: el reparto es de cada curso y el trimestre destino
    // tiene el suyo. Se pide al confirmar (§3.6).
    pesosPorNivel: { [nivelDestino]: opciones.pesoTrimestre ?? 0 },
    copiadaDe: udId,
    // Una copia nace visible aunque el original estuviera archivado: se copia
    // para usarla.
    archivada: false,
    ...(sinMapear.length ? { criteriosSinMapear: sinMapear } : { criteriosSinMapear: undefined }),
    // Ids nuevos por sesión: si compartieran id con las del origen, editar una
    // sería editar la otra en cuanto algo las buscara por id.
    ...(plan.length
      ? {
          sesiones: plan.map((s, i) => ({
            ...s,
            id: nuevoId(),
            nivel: nivelDestino,
            orden: i,
            recursos: [...s.recursos],
          })),
        }
      : { sesiones: undefined }),
  }

  await db.unidades.add(copia)
  return { id, deshacer: async () => void (await db.unidades.delete(id)) }
}

/**
 * Lleva una unidad a otro curso sin dejar copia.
 *
 * Se bloquea si tiene notas u observaciones puestas: moverla las dejaría
 * atribuidas a un curso que no es el suyo, y eso no se arregla después. En ese
 * caso la salida es copiar.
 *
 * Al cambiar de ciclo, los criterios se remapean por posición y los que no
 * encajan quedan anotados en `criteriosSinMapear`. Las FILAS de instrumento
 * cuyo criterio no exista en el ciclo destino se CONSERVAN con `criterioId` a
 * `null` —que ya significa «sin traza a ningún criterio»—: nunca se borra una
 * fila por un cambio de curso.
 *
 * Las clases ya colocadas en el calendario pierden `udId`: son clases de los
 * grupos del curso viejo, y mantenerlas atadas atribuiría una sesión de 3.º a
 * una unidad que ahora es de 5.º. Se cuentan en el resumen previo.
 */
export async function moverUnidad(
  udId: string,
  nivelDestino: number,
): Promise<() => Promise<void>> {
  const origen = await db.unidades.get(udId)
  if (!origen) throw new Error('La unidad de origen ya no existe')
  if (origen.etapa === 'infantil') throw new Error(SOLO_PRIMARIA)

  // Mover una unidad de varios cursos a UNO es ambiguo: no hay forma de saber
  // qué pasa con las sesiones de los otros. Se dice, en vez de decidirlo aquí.
  if (origen.niveles.length > 1)
    throw new Error(
      `«${origen.titulo}» abarca ${origen.niveles.length} cursos. Quita los que sobren antes de moverla, o cópiala al curso que quieras.`,
    )

  const impacto = await contarImpactoUnidad(udId)
  if ((impacto?.valores ?? 0) > 0)
    throw new Error(
      'La unidad tiene notas u observaciones puestas: moverla las dejaría atribuidas a otro curso. Cópiala en su lugar.',
    )

  const nivelOrigen = origen.niveles[0] ?? 1
  const { mapeados, sinMapear } = await mapearCriterios(
    origen.criterios,
    nivelOrigen,
    nivelDestino,
  )
  const validos = new Set((await criteriosDeGrupo('primaria', nivelDestino)).map((c) => c.id))

  let filasPrevias: FilaInstrumento[] = []
  let sesionesDesvinculadas: string[] = []

  await db.transaction('rw', [db.unidades, db.sesiones, db.columnas, db.filas], async () => {
    const columnas = await db.columnas.where('udId').equals(udId).toArray()
    const columnaIds = columnas.map((c) => c.id)
    const filas = columnaIds.length
      ? await db.filas.where('columnaId').anyOf(columnaIds).toArray()
      : []
    // Solo las que dejarían de encajar: las demás no se tocan, y así deshacer
    // no tiene que reponer filas que nunca cambiaron.
    filasPrevias = filas.filter((f) => f.criterioId && !validos.has(f.criterioId))
    for (const f of filasPrevias) await db.filas.update(f.id, { criterioId: null })

    sesionesDesvinculadas = (await db.sesiones.where('udId').equals(udId).toArray()).map((s) => s.id)
    for (const id of sesionesDesvinculadas) await db.sesiones.update(id, { udId: undefined })

    await db.unidades.put({
      ...origen,
      niveles: [nivelDestino],
      criterios: mapeados.map((m) => m.destino),
      // El reparto es de cada curso: al cambiar de curso, el peso vuelve a 0.
      pesosPorNivel: { [nivelDestino]: 0 },
      // Las sesiones del plan se van con la unidad, cambiando de curso con ella.
      ...(origen.sesiones?.length
        ? { sesiones: origen.sesiones.map((s) => ({ ...s, nivel: nivelDestino })) }
        : {}),
      ...(sinMapear.length ? { criteriosSinMapear: sinMapear } : { criteriosSinMapear: undefined }),
    })
  })

  return async () => {
    await db.transaction('rw', [db.unidades, db.sesiones, db.filas], async () => {
      await db.unidades.put(origen)
      for (const f of filasPrevias) await db.filas.update(f.id, { criterioId: f.criterioId })
      for (const id of sesionesDesvinculadas) await db.sesiones.update(id, { udId })
    })
  }
}

/** Da por revisados los criterios que no se pudieron mapear. */
export async function marcarCriteriosRevisados(udId: string): Promise<() => Promise<void>> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) throw new Error('La unidad ya no existe')
  const previos = unidad.criteriosSinMapear
  await db.unidades.put({ ...unidad, criteriosSinMapear: undefined })
  return async () => void (await db.unidades.put({ ...unidad, criteriosSinMapear: previos }))
}

// ——— El plan de sesiones de una unidad ———
//
// El plan vive embebido en `unidad.sesiones[]`, no en una tabla: se lee y se
// escribe siempre entero. Por eso todas estas funciones hacen lo mismo —leer la
// unidad, transformar el array, reescribirla— y por eso el deshacer es siempre
// «volver a poner el array de antes», sin reconstruir nada.
//
// `orden` es POSICIONAL, no un campo que el usuario escriba: cada escritura lo
// renumera desde 0 según la posición en el array. Así no hay huecos ni empates
// que hagan que la sesión 3 salga antes que la 2.
//
// Y es posicional DENTRO DE SU CURSO: las sesiones son propias de cada curso de
// la unidad, así que 3.º y 4.º tienen cada uno su sesión 1. Todas viven en el
// mismo array porque el plan se guarda entero con la unidad; el `nivel` de cada
// una es lo que las separa.

/** Sesiones de un curso concreto de la unidad, ordenadas. */
export function sesionesDe(unidad: UnidadDidactica, nivel: number): SesionPlan[] {
  return (unidad.sesiones ?? []).filter((s) => s.nivel === nivel).sort((a, b) => a.orden - b.orden)
}

/** Plan de UN curso de la unidad, listo para transformar. */
async function leerPlan(
  udId: string,
  nivel: number,
): Promise<{ unidad: UnidadDidactica; plan: SesionPlan[] }> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) throw new Error('La unidad ya no existe')
  if (!unidad.niveles.includes(nivel)) throw new Error('Ese curso no está en la unidad')
  return { unidad, plan: sesionesDe(unidad, nivel) }
}

/**
 * Escribe el plan de UN curso, renumerando `orden` por posición dentro de ese
 * curso y dejando intactas las sesiones de los demás.
 *
 * Se guarda el array anterior tal cual en vez de calcular la operación inversa:
 * es lo único que garantiza que deshacer un reordenamiento, un borrado o una
 * edición devuelva exactamente lo que había.
 */
async function escribirPlan(
  unidad: UnidadDidactica,
  nivel: number,
  plan: SesionPlan[],
): Promise<() => Promise<void>> {
  const previo = unidad.sesiones
  const otros = (unidad.sesiones ?? []).filter((s) => s.nivel !== nivel)
  const renumerado = plan.map((s, i) => ({ ...s, nivel, orden: i }))
  const completo = [...otros, ...renumerado]
  // Un plan vacío quita el campo en vez de guardarlo como `[]`: así «sin
  // sesiones» y «con el plan vaciado» son el mismo estado, como en `crearUnidad`.
  await db.unidades.put({
    ...unidad,
    ...(completo.length ? { sesiones: completo } : { sesiones: undefined }),
  } as UnidadDidactica)
  return async () => void (await db.unidades.put({ ...unidad, sesiones: previo } as UnidadDidactica))
}

/** Campos editables de una sesión del plan. Los mismos en las dos etapas. */
export type CambiosSesionPlan = Partial<Pick<SesionPlan, 'titulo' | 'notas' | 'recursos' | 'recursosNecesarios'>>

/** Añade una sesión vacía al final del plan. */
export async function anadirSesionPlan(
  udId: string,
  nivel: number,
  datos: CambiosSesionPlan = {},
): Promise<{ id: string; deshacer: () => Promise<void> }> {
  const { unidad, plan } = await leerPlan(udId, nivel)
  const nueva: SesionPlan = {
    id: nuevoId(),
    nivel,
    orden: plan.length,
    titulo: datos.titulo?.trim() ?? '',
    notas: datos.notas ?? '',
    recursos: datos.recursos ?? [],
    ...(datos.recursosNecesarios ? { recursosNecesarios: datos.recursosNecesarios } : {}),
  }
  const deshacer = await escribirPlan(unidad, nivel, [...plan, nueva])
  return { id: nueva.id, deshacer }
}

/** Guarda los cambios de una sesión del plan, sin moverla de sitio. */
export async function guardarSesionPlan(
  udId: string,
  nivel: number,
  sesionId: string,
  cambios: CambiosSesionPlan,
): Promise<() => Promise<void>> {
  const { unidad, plan } = await leerPlan(udId, nivel)
  if (!plan.some((s) => s.id === sesionId)) throw new Error('Esa sesión ya no está en el plan')

  return escribirPlan(
    unidad,
    nivel,
    plan.map((s) => {
      if (s.id !== sesionId) return s
      const material = cambios.recursosNecesarios?.trim()
      return {
        ...s,
        titulo: cambios.titulo?.trim() ?? s.titulo,
        notas: cambios.notas ?? s.notas,
        recursos: cambios.recursos ?? s.recursos,
        // El material vacío quita el campo, para no distinguir «sin material»
        // de «con la cadena vacía» al mostrarlo.
        ...(cambios.recursosNecesarios === undefined
          ? {}
          : material
            ? { recursosNecesarios: material }
            : { recursosNecesarios: undefined }),
      }
    }),
  )
}

/**
 * Duplica una sesión justo detrás de la original: el caso real es «la siguiente
 * es casi esta», y aparecer al final obligaría a subirla a mano.
 */
export async function duplicarSesionPlan(
  udId: string,
  nivel: number,
  sesionId: string,
): Promise<{ id: string; deshacer: () => Promise<void> }> {
  const { unidad, plan } = await leerPlan(udId, nivel)
  const i = plan.findIndex((s) => s.id === sesionId)
  if (i < 0) throw new Error('Esa sesión ya no está en el plan')

  const copia: SesionPlan = { ...plan[i], id: nuevoId(), recursos: [...plan[i].recursos] }
  const deshacer = await escribirPlan(unidad, nivel, [
    ...plan.slice(0, i + 1),
    copia,
    ...plan.slice(i + 1),
  ])
  return { id: copia.id, deshacer }
}

/**
 * Quita una sesión del plan.
 *
 * No arrastra nada: una `SesionPlan` no tiene calificaciones —las columnas del
 * cuaderno cuelgan de la UNIDAD, no de la sesión— y las sesiones ya
 * materializadas en un grupo son copias con vida propia, sin referencia de
 * vuelta al plan. Por eso basta una confirmación simple.
 */
export async function eliminarSesionPlan(
  udId: string,
  nivel: number,
  sesionId: string,
): Promise<() => Promise<void>> {
  const { unidad, plan } = await leerPlan(udId, nivel)
  if (!plan.some((s) => s.id === sesionId)) throw new Error('Esa sesión ya no está en el plan')
  return escribirPlan(
    unidad,
    nivel,
    plan.filter((s) => s.id !== sesionId),
  )
}

/**
 * Sube o baja una sesión una posición. Mismo patrón que `moverColumna` del
 * cuaderno: intercambio con la vecina y renumeración por posición.
 */
export async function moverSesionPlan(
  udId: string,
  nivel: number,
  sesionId: string,
  delta: 1 | -1,
): Promise<(() => Promise<void>) | null> {
  const { unidad, plan } = await leerPlan(udId, nivel)
  const i = plan.findIndex((s) => s.id === sesionId)
  if (i < 0) throw new Error('Esa sesión ya no está en el plan')

  const j = i + delta
  // En los extremos no es un error: el botón simplemente no tiene a dónde ir.
  if (j < 0 || j >= plan.length) return null

  const movido = [...plan]
  ;[movido[i], movido[j]] = [movido[j], movido[i]]
  return escribirPlan(unidad, nivel, movido)
}

/**
 * Lo que cuelga de una unidad, contado antes de ofrecer el borrado.
 *
 * `valores` es el número que manda: mientras haya una sola celda escrita, la
 * unidad no se puede borrar. En este esquema Primaria e Infantil comparten
 * `columnas` y `valores`, así que «calificaciones registradas» y «columnas de
 * observación con datos» son literalmente la misma cuenta.
 */
export interface ImpactoUnidad {
  etapa: Etapa
  titulo: string
  /** Sesiones escritas en el plan de la unidad. Se van con ella. */
  sesionesPlan: number
  /** Sesiones ya colocadas en un grupo y una fecha. Se conservan, desvinculadas. */
  sesionesReales: number
  /** Columnas del cuaderno vinculadas, de cualquier etapa. */
  columnas: number
  /** Columnas de Infantil, que se conservan desvinculadas (§1.5). */
  columnasInfantil: number
  /** Filas de instrumento de esas columnas. */
  filas: number
  /** Celdas con dato escrito. Si hay una sola, el borrado se bloquea. */
  valores: number
  /** Agrupamientos guardados. Se conservan, desvinculados. */
  equipos: number
}

/** Etapa de cada grupo, para saber qué columnas son de observación de Infantil. */
async function etapaPorGrupo(): Promise<Map<string, Etapa>> {
  const grupos = await db.grupos.toArray()
  return new Map(grupos.map((g) => [g.id, g.etapa]))
}

/**
 * Cuenta el impacto real de borrar una unidad, para poder enseñarlo antes de
 * preguntar. No escribe nada.
 */
export async function contarImpactoUnidad(udId: string): Promise<ImpactoUnidad | null> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) return null

  const [sesionesReales, columnas, equipos, etapas] = await Promise.all([
    db.sesiones.where('udId').equals(udId).count(),
    db.columnas.where('udId').equals(udId).toArray(),
    db.equipos.where('udId').equals(udId).count(),
    etapaPorGrupo(),
  ])

  const columnaIds = columnas.map((c) => c.id)
  const filas = columnaIds.length
    ? await db.filas.where('columnaId').anyOf(columnaIds).count()
    : 0
  const valores = columnaIds.length
    ? await db.valores.where('columnaId').anyOf(columnaIds).count()
    : 0

  return {
    etapa: unidad.etapa,
    titulo: unidad.titulo,
    sesionesPlan: unidad.sesiones?.length ?? 0,
    sesionesReales,
    columnas: columnas.length,
    columnasInfantil: columnas.filter((c) => etapas.get(c.grupoId) === 'infantil').length,
    filas,
    valores,
    equipos,
  }
}

/**
 * Borra una unidad. No hay papelera ni tombstones, así que la regla es que solo
 * muere lo que ES la unidad —su ficha y su plan de sesiones— y lo que existe
 * únicamente para ella y está vacío: sus columnas de Primaria con sus filas.
 *
 * Todo lo que sea registro de algo que ya ocurrió sobrevive con `udId` a
 * `undefined`: las sesiones ya colocadas (llevan valoración, notas y
 * comentarios de una clase que se dio), las columnas de observación de Infantil
 * (§1.5: la asociación con la unidad siempre fue opcional) y los agrupamientos.
 *
 * El banco de `rubricas` no se toca: no cuelga de la unidad, se comparte entre
 * unidades y cursos, y borrarlo aquí destruiría rúbricas ajenas.
 *
 * Lanza si queda alguna celda escrita. La comprobación se repite DENTRO de la
 * transacción a propósito: entre que la pantalla contó y el usuario confirmó,
 * la sincronización o el agente pueden haber escrito una nota.
 */
export async function eliminarUnidad(udId: string): Promise<() => Promise<void>> {
  const etapas = await etapaPorGrupo()

  // Lo que hará falta para deshacer, capturado antes de tocar nada.
  let unidadPrevia: UnidadDidactica | undefined
  let columnasBorradas: Columna[] = []
  let filasBorradas: FilaInstrumento[] = []
  let sesionesDesvinculadas: string[] = []
  let equiposDesvinculados: string[] = []
  let columnasDesvinculadas: { id: string; udId: string; pesoUd: number }[] = []

  await db.transaction(
    'rw',
    [db.unidades, db.sesiones, db.columnas, db.filas, db.valores, db.equipos],
    async () => {
      const unidad = await db.unidades.get(udId)
      if (!unidad) throw new Error('La unidad ya no existe')
      unidadPrevia = unidad

      const columnas = await db.columnas.where('udId').equals(udId).toArray()
      const columnaIds = columnas.map((c) => c.id)

      const valores = columnaIds.length
        ? await db.valores.where('columnaId').anyOf(columnaIds).count()
        : 0
      if (valores > 0)
        throw new Error(
          'La unidad tiene notas u observaciones puestas: bórralas antes, o archívala.',
        )

      // Infantil: la columna de observación se conserva, solo pierde la unidad.
      const aDesvincular = columnas.filter((c) => etapas.get(c.grupoId) === 'infantil')
      const aBorrar = columnas.filter((c) => etapas.get(c.grupoId) !== 'infantil')

      columnasDesvinculadas = aDesvincular.map((c) => ({
        id: c.id,
        udId: udId,
        pesoUd: c.pesoUd,
      }))
      for (const c of aDesvincular) {
        await db.columnas.update(c.id, { udId: undefined, pesoUd: 0 })
      }

      const idsABorrar = aBorrar.map((c) => c.id)
      filasBorradas = idsABorrar.length
        ? await db.filas.where('columnaId').anyOf(idsABorrar).toArray()
        : []
      columnasBorradas = aBorrar
      await db.filas.bulkDelete(filasBorradas.map((f) => f.id))
      await db.columnas.bulkDelete(idsABorrar)

      // Sesiones reales y equipos: nunca se destruyen, solo pierden la unidad.
      sesionesDesvinculadas = (await db.sesiones.where('udId').equals(udId).toArray()).map(
        (s) => s.id,
      )
      for (const id of sesionesDesvinculadas) {
        await db.sesiones.update(id, { udId: undefined })
      }

      equiposDesvinculados = (await db.equipos.where('udId').equals(udId).toArray()).map((e) => e.id)
      for (const id of equiposDesvinculados) {
        await db.equipos.update(id, { udId: undefined })
      }

      await db.unidades.delete(udId)
    },
  )

  return async () => {
    await db.transaction(
      'rw',
      [db.unidades, db.sesiones, db.columnas, db.filas, db.equipos],
      async () => {
        if (unidadPrevia) await db.unidades.put(unidadPrevia)
        if (columnasBorradas.length) await db.columnas.bulkAdd(columnasBorradas)
        if (filasBorradas.length) await db.filas.bulkAdd(filasBorradas)
        for (const c of columnasDesvinculadas) {
          await db.columnas.update(c.id, { udId: c.udId, pesoUd: c.pesoUd })
        }
        for (const id of sesionesDesvinculadas) {
          await db.sesiones.update(id, { udId })
        }
        for (const id of equiposDesvinculados) {
          await db.equipos.update(id, { udId })
        }
      },
    )
  }
}

/**
 * Archiva o desarchiva una unidad: la retira del listado activo sin destruir
 * nada. Es la salida para las que no se pueden borrar porque tienen notas
 * puestas, y también para las de cursos pasados que solo estorban.
 */
export async function archivarUnidad(
  udId: string,
  archivada: boolean,
): Promise<() => Promise<void>> {
  const unidad = await db.unidades.get(udId)
  if (!unidad) throw new Error('La unidad ya no existe')
  const previo = unidad.archivada ?? false

  await db.unidades.update(udId, { archivada })

  return async () => void (await db.unidades.update(udId, { archivada: previo }))
}

/**
 * Unidades de un curso de PRIMARIA en un trimestre, ordenadas. Es la base de la
 * pantalla de reparto de pesos: la UD pertenece al CURSO, no al grupo, así que
 * 3ºA y 3ºB comparten unidades y comparten reparto.
 *
 * Solo Primaria, y por eso la consulta va por `[etapa+nivel]`: en Infantil no
 * hay reparto ninguno, y `nivel` a secas es ambiguo (3 es tanto 3.º de Primaria
 * como los 3 años).
 *
 * Las unidades sueltas (`trimestre: null`) no salen nunca por aquí, y no por un
 * filtro: IndexedDB no indexa los nulos, así que quedan fuera del índice por
 * construcción. Es justo lo que se quiere —no tienen trimestre en el que
 * repartirse—, pero conviene saberlo antes de añadir otra consulta por ese
 * índice y preguntarse dónde han ido.
 */
export async function unidadesDe(
  nivel: number,
  trimestre: Trimestre,
): Promise<UnidadEnCurso[]> {
  const lista = await unidadesDelCurso(nivel)
  return lista
    .filter((u) => u.trimestre === trimestre)
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
}

/** Unidades del curso de Primaria que no computan, para el listado informativo aparte. */
export async function unidadesQueNoComputan(nivel: number): Promise<UnidadEnCurso[]> {
  const lista = await unidadesDelCurso(nivel)
  return lista
    .filter((u) => !u.computa)
    .sort((a, b) => (a.trimestre ?? 9) - (b.trimestre ?? 9) || a.titulo.localeCompare(b.titulo, 'es'))
}

/**
 * Escribe el reparto de pesos de un trimestre de una vez. Devuelve la función
 * de deshacer: repartir es fácil de hacer sin querer y el usuario debe poder
 * volver al reparto anterior de un toque, como en el resto del cuaderno.
 *
 * Se lee y se reescribe la unidad entera en vez de actualizar solo el campo
 * porque `pesosPorNivel` no existe en las unidades de Infantil: así el propio
 * tipo descarta las que no ponderan, en lugar de confiar en que quien llame
 * haya filtrado bien.
 *
 * Lleva `nivel` porque el peso es POR CURSO: la misma unidad puede pesar 40 en
 * 3.º y 25 en 4.º, y escribir sin decir cuál pisaría el reparto del otro.
 */
export async function guardarPesosTrimestre(
  nivel: number,
  pesos: { udId: string; pesoTrimestre: number }[],
): Promise<() => Promise<void>> {
  const previos: { udId: string; pesoTrimestre: number }[] = []

  await db.transaction('rw', db.unidades, async () => {
    for (const { udId, pesoTrimestre } of pesos) {
      const unidad = await db.unidades.get(udId)
      if (!unidad || unidad.etapa !== 'primaria') continue
      previos.push({ udId, pesoTrimestre: unidad.pesosPorNivel[nivel] ?? 0 })
      await db.unidades.put({
        ...unidad,
        pesosPorNivel: { ...unidad.pesosPorNivel, [nivel]: pesoTrimestre },
      })
    }
  })

  return async () => {
    await db.transaction('rw', db.unidades, async () => {
      for (const { udId, pesoTrimestre } of previos) {
        const unidad = await db.unidades.get(udId)
        if (!unidad || unidad.etapa !== 'primaria') continue
        await db.unidades.put({
          ...unidad,
          pesosPorNivel: { ...unidad.pesosPorNivel, [nivel]: pesoTrimestre },
        })
      }
    })
  }
}

/**
 * Reparto a partes iguales sobre las unidades dadas. El sobrante de la división
 * entera va a las primeras (100 entre 3 → 34, 33, 33) para que la suma dé
 * exactamente 100 y el total salga en verde.
 */
export function repartirAPartesIguales(udIds: string[]): { udId: string; pesoTrimestre: number }[] {
  if (udIds.length === 0) return []
  const base = Math.floor(100 / udIds.length)
  const sobra = 100 - base * udIds.length
  return udIds.map((udId, i) => ({ udId, pesoTrimestre: base + (i < sobra ? 1 : 0) }))
}

export async function unidadAPlantilla(udId: string): Promise<string> {
  const ud = await db.unidades.get(udId)
  if (!ud) throw new Error('La unidad ya no existe')
  const sesiones = await db.sesiones.where('udId').equals(udId).toArray()
  const plantilla: Plantilla = {
    id: nuevoId(),
    tipo: 'ud',
    titulo: ud.titulo,
    criterios: ud.criterios,
    sesionesSugeridas: sesiones.map((s) => s.titulo).filter(Boolean),
  }
  await db.plantillas.add(plantilla)
  return plantilla.id
}

/** Fecha de hoy, o el lunes de la semana en curso si se pide la vista semanal. */
export function semanaActual(): string {
  return lunesDe(aISO())
}

/** Sesiones de un grupo en orden cronológico: la vista de «programar el curso». */
export async function sesionesDeGrupo(grupoId: string): Promise<Sesion[]> {
  const lista = await db.sesiones.where('grupoId').equals(grupoId).toArray()
  // Dentro del día, por franja: un grupo con dos clases el mismo día tiene que
  // listarlas en el orden en que ocurren, no en el que las devuelva el índice.
  return lista.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''),
  )
}

/**
 * TODAS las fechas en que un grupo tiene clase durante el curso: se recorre el
 * calendario entre `inicio` y `fin`, se conservan los días de la semana que
 * aparecen en su horario y se descartan festivos, periodos no lectivos y los
 * huecos fuera de todo trimestre (§ Bloque 7.2) — el mismo `estadoDia` que usa
 * «Hoy» y el Calendario, no una comprobación de festivos por su cuenta.
 *
 * Es la base tanto de generar el curso completo como de copiar planificaciones
 * entre grupos con horarios distintos.
 */
export function fechasDeClase(grupo: Grupo, curso: CursoFechas, desde?: string): string[] {
  const fechas: string[] = []
  for (const h of huecosDeClase(grupo, curso, desde))
    if (fechas[fechas.length - 1] !== h.fecha) fechas.push(h.fecha)
  return fechas
}

/** Una clase concreta del curso: su fecha y la franja del horario que ocupa. */
export interface HuecoDeClase {
  fecha: string
  franjaInicio: string
}

/**
 * Lo mismo que `fechasDeClase` pero SIN colapsar el día: un grupo con dos
 * franjas el mismo día da dos huecos, no uno. Es la unidad correcta para
 * generar el curso, copiar planificaciones o buscar la siguiente clase libre —
 * contar por fechas se comía la segunda clase del día.
 *
 * Orden: por fecha y, dentro del día, por hora.
 */
export function huecosDeClase(grupo: Grupo, curso: CursoFechas, desde?: string): HuecoDeClase[] {
  if (grupo.horario.length === 0) return []

  const porDia = new Map<number, string[]>()
  for (const f of grupo.horario) {
    const lista = porDia.get(f.diaSemana)
    if (lista) lista.push(f.horaInicio)
    else porDia.set(f.diaSemana, [f.horaInicio])
  }
  for (const lista of porDia.values()) lista.sort((a, b) => a.localeCompare(b))

  const arranque = desde && desde > curso.inicio ? desde : curso.inicio
  const huecos: HuecoDeClase[] = []
  let fecha = arranque
  // Tope de seguridad por si las fechas del curso vinieran mal (fin < inicio).
  for (let i = 0; fecha <= curso.fin && i < 500; i++) {
    const estado = estadoDia(fecha, curso)
    if (estado.tipo === 'lectivo')
      for (const franjaInicio of porDia.get(estado.dia) ?? []) huecos.push({ fecha, franjaInicio })
    fecha = sumarDias(fecha, 1)
  }
  return huecos
}

/** Próximas `cuantas` clases del grupo a partir de `desde`, dentro del curso. */
export async function proximasClases(
  grupo: Grupo,
  desde: string,
  cuantas: number,
): Promise<string[]> {
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!curso) return []
  return fechasDeClase(grupo, curso, desde).slice(0, cuantas)
}

/** Como `proximasClases`, pero una entrada por clase real y no por día. */
export async function proximosHuecos(
  grupo: Grupo,
  desde: string,
  cuantos: number,
): Promise<HuecoDeClase[]> {
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!curso) return []
  return huecosDeClase(grupo, curso, desde).slice(0, cuantos)
}

/**
 * Las clases ya ocupadas de un grupo, como claves `fecha|franja`. Una sesión
 * sin `franjaInicio` (anterior a v24) ocupa la primera franja de su día, que es
 * donde la pinta `db/sesiones.ts`: así «ocupado» significa lo mismo en los dos
 * sitios y generar el curso no crea una sesión encima de otra.
 */
export function clavesOcupadas(sesiones: Sesion[], grupo: Grupo): Set<string> {
  const primeraDelDia = new Map<number, string>()
  for (const f of grupo.horario) {
    const previa = primeraDelDia.get(f.diaSemana)
    if (previa === undefined || f.horaInicio < previa) primeraDelDia.set(f.diaSemana, f.horaInicio)
  }
  const claves = new Set<string>()
  for (const s of sesiones) {
    const dow = diaLectivo(s.fecha)
    const franja = s.franjaInicio ?? (dow === null ? undefined : primeraDelDia.get(dow))
    claves.add(`${s.fecha}|${franja ?? ''}`)
  }
  return claves
}

/** Clave de un hueco, en el mismo formato que `clavesOcupadas`. */
export const claveHueco = (h: HuecoDeClase): string => `${h.fecha}|${h.franjaInicio}`

export interface ResultadoGeneracion {
  creadas: number
  /** Clases que ya tenían sesión y se han respetado. */
  existentes: number
  /** Clases que el docente eliminó: no se vuelven a crear. */
  eliminadas: number
  total: number
}

/**
 * Genera el esqueleto del curso: una sesión vacía por cada clase real del grupo
 * entre el inicio y el fin del curso, saltando festivos y vacaciones.
 *
 * Es el ÚNICO sitio que crea sesiones a partir del horario. Nunca pisa una
 * sesión existente, y nunca resucita una clase que el docente eliminó (su
 * `ClaseCancelada`): regenerar tras añadir vacaciones o cambiar el horario no
 * devuelve lo que se quitó a propósito.
 */
export async function generarCursoCompleto(
  grupoId: string,
): Promise<{ resultado: ResultadoGeneracion; deshacer: () => Promise<void> }> {
  const grupo = await db.grupos.get(grupoId)
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!grupo || !curso) throw new Error('Falta el grupo o el curso activo')

  const huecos = huecosDeClase(grupo, curso)
  const ocupadas = clavesOcupadas(await db.sesiones.where('grupoId').equals(grupoId).toArray(), grupo)
  const canceladas = await db.clasesCanceladas.where('grupoId').equals(grupoId).toArray()
  // Misma regla que `tapa` en `db/sesiones.ts`: sin franja, cancela el día entero.
  const eliminada = (h: HuecoDeClase) =>
    canceladas.some(
      (c) => c.fecha === h.fecha && (c.horaInicio === undefined || c.horaInicio === h.franjaInicio),
    )
  const libres = huecos.filter((h) => !ocupadas.has(claveHueco(h)))
  const eliminadas = libres.filter(eliminada).length

  const nuevas: Sesion[] = libres
    .filter((h) => !eliminada(h))
    .map((h) => ({
      id: nuevoId(),
      grupoId,
      fecha: h.fecha,
      titulo: '',
      juegos: [],
      notas: '',
      recursos: [],
      franjaInicio: h.franjaInicio,
    }))

  await db.sesiones.bulkAdd(nuevas)
  const ids = nuevas.map((s) => s.id)

  return {
    resultado: {
      creadas: nuevas.length,
      existentes: huecos.length - libres.length,
      eliminadas,
      total: huecos.length,
    },
    deshacer: async () => void (await db.sesiones.bulkDelete(ids)),
  }
}

/** Vacía la planificación de un grupo. Devuelve la función de deshacer. */
export async function eliminarSesionesDeGrupo(
  grupoId: string,
): Promise<{ eliminadas: number; deshacer: () => Promise<void> }> {
  const previas = await db.sesiones.where('grupoId').equals(grupoId).toArray()
  await db.sesiones.bulkDelete(previas.map((s) => s.id))
  return {
    eliminadas: previas.length,
    deshacer: async () => void (await db.sesiones.bulkAdd(previas)),
  }
}

export interface ResultadoCopia {
  grupoId: string
  nombreGrupo: string
  colocadas: number
  /** Sesiones del destino que ya tenían contenido y no se han tocado. */
  omitidas: number
  /** Faltaron sesiones vacías en el destino para colocarlas todas. */
  sinHueco: number
}

/**
 * Copia una planificación a uno o varios grupos de destino.
 *
 * Reglas, pensadas para que copiar nunca destruya trabajo hecho:
 *  · Solo RELLENA sesiones que ya existen en el destino: no crea ninguna (eso
 *    es cosa de «Generar curso completo»), así que no resucita una clase que el
 *    docente eliminó.
 *  · Las sesiones se colocan EN ORDEN sobre las sesiones del destino desde
 *    `desde`. Una con contenido se salta, y la siguiente del origen busca la
 *    siguiente vacía.
 *  · No se copia la valoración: es un juicio sobre cómo salió aquella clase.
 */
export async function copiarPlanificacion(opciones: {
  sesiones: Sesion[]
  destinos: string[]
  desde: string
}): Promise<{ resultados: ResultadoCopia[]; deshacer: () => Promise<void> }> {
  const { sesiones, destinos, desde } = opciones
  const ordenadas = [...sesiones].sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) || (a.franjaInicio ?? '').localeCompare(b.franjaInicio ?? ''),
  )
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!curso) throw new Error('No hay ningún curso escolar activo')

  const resultados: ResultadoCopia[] = []
  const antes: Sesion[] = []
  const despues: Sesion[] = []

  for (const grupoId of destinos) {
    const grupo = await db.grupos.get(grupoId)
    if (!grupo) continue

    const destino = sesionesEnOrden(
      await db.sesiones.where('grupoId').equals(grupoId).toArray(),
      grupo,
      curso,
      desde,
    )

    let omitidas = 0
    let j = 0
    let colocadas = 0

    for (const origen of ordenadas) {
      // Avanza hasta la primera sesión vacía del destino.
      while (j < destino.length && !sesionVacia(destino[j].sesion)) {
        j++
        omitidas++
      }
      if (j >= destino.length) break

      const hueco = destino[j++].sesion
      antes.push(hueco)
      despues.push({
        ...sinContenido(hueco),
        titulo: origen.titulo,
        udId: origen.udId,
        juegos: origen.juegos,
        notas: origen.notas,
        recursos: origen.recursos,
        recursosNecesarios: origen.recursosNecesarios,
        comentarios: origen.comentarios,
      })
      colocadas++
    }

    resultados.push({
      grupoId,
      nombreGrupo: grupo.nombre,
      colocadas,
      omitidas,
      sinHueco: ordenadas.length - colocadas,
    })
  }

  await db.transaction('rw', db.sesiones, () => db.sesiones.bulkPut(despues))
  return {
    resultados,
    deshacer: async () => void (await db.transaction('rw', db.sesiones, () => db.sesiones.bulkPut(antes))),
  }
}

// ——— Importar una unidad desde texto pegado (§ Bloque 2) ———

/** Una sesión ya revisada en el preview de importación, lista para guardarse. */
export interface SesionImportada {
  titulo: string
  descripcion: string
  /** Ítems de material, tal como quedaron en los chips del preview. */
  recursos: string[]
  /** Una línea por enlace o nota. */
  enlacesYNotas: string
}

/**
 * Crea la unidad con su plan de sesiones a partir de lo confirmado en el
 * preview. La unidad nace SIN trimestre y sin criterios: el texto pegado no los
 * trae, y ponerlos por defecto sería meter en el reparto de pesos una unidad
 * que el usuario todavía no ha colocado. Se completan luego, a mano.
 *
 * No recibe grupo ni fechas: las sesiones se quedan en el plan hasta que la
 * unidad se lleva a un grupo (`aplicarUnidadAGrupo`).
 */
export async function importarUnidad(
  datos: {
    titulo: string
    sesiones: SesionImportada[]
  } & ({ etapa: 'primaria'; nivel: number } | { etapa: 'infantil' }),
): Promise<{ id: string; deshacer: () => Promise<void> }> {
  // Una importación trae UN curso: el plan nace entero en él, y los demás
  // cursos se añaden después con `anadirCursoAUnidad`.
  const nivelUnico = datos.etapa === 'infantil' ? NIVEL_CICLO_INFANTIL : datos.nivel
  const plan: SesionPlan[] = datos.sesiones.map((s, i) => {
    const material = s.recursos.map((r) => r.trim()).filter(Boolean).join(', ')
    const enlaces: Recurso[] = s.enlacesYNotas
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((valor) => ({ tipo: esEnlace(valor) ? 'enlace' : 'nota', valor }))

    return {
      id: nuevoId(),
      nivel: nivelUnico,
      orden: i,
      titulo: s.titulo.trim(),
      notas: s.descripcion,
      recursos: enlaces,
      ...(material ? { recursosNecesarios: material } : {}),
    }
  })

  const id =
    datos.etapa === 'infantil'
      ? await crearUnidad({
          etapa: 'infantil',
          titulo: datos.titulo,
          trimestre: null,
          sesiones: plan,
        })
      : await crearUnidad({
          etapa: 'primaria',
          titulo: datos.titulo,
          nivel: datos.nivel,
          trimestre: null,
          sesiones: plan,
        })

  return { id, deshacer: async () => void (await db.unidades.delete(id)) }
}
/* ————————————————— Volcado de una unidad a un grupo —————————————————
 *
 * Volcar es el momento en que la programación escrita deja de ser texto y ocupa
 * clases del calendario.
 *
 * REGLA DURA: el volcado solo RELLENA sesiones que ya existen en la
 * planificación del grupo. Nunca crea sesiones, nunca resucita una eliminada y
 * nunca toca el horario ni las clases canceladas. Crear sesiones es cosa de
 * «Generar curso completo», y de nadie más. El fallo que motivó la regla:
 * recorrer los huecos del HORARIO en vez de las sesiones hacía reaparecer, al
 * volcar, las clases que el docente había eliminado.
 *
 * POR QUÉ HAY PREVIA: colocar sesiones puede pisar trabajo ya programado. La
 * previa dice, hueco a hueco, qué va a pasar antes de escribir nada, y el
 * volcado se aplica sobre esa misma lista. Cambiar de modo recalcula la previa,
 * no ejecuta nada.
 */

/** Qué hacer con un hueco que ya tiene sesión con contenido. */
export type ModoVolcado = 'saltar' | 'sobrescribir'

/**
 * Una sesión «vacía» es el esqueleto que deja `generarCursoCompleto`: existe
 * para que la clase aparezca en el calendario, pero no contiene trabajo. Volcar
 * encima no destruye nada, así que se RELLENA incluso en modo «saltar».
 *
 * Este era el fallo de fondo: con el curso generado de antemano todos los
 * huecos contaban como ocupados, y la unidad solo caía en los que la migración
 * v24 no había marcado —las segundas franjas del día—: una sesión por semana.
 */
export function sesionVacia(s: Sesion): boolean {
  return (
    !s.titulo.trim() &&
    !s.notas.trim() &&
    s.juegos.length === 0 &&
    s.recursos.length === 0 &&
    !s.recursosNecesarios?.trim() &&
    !s.comentarios?.trim() &&
    s.valoracion === undefined &&
    !s.udId
  )
}

/**
 * La misma sesión sin nada de contenido: conserva solo lo que la hace ser ESA
 * clase —grupo, fecha, franja y la hora ajustada de ese día—. Rellenar,
 * sustituir o mover contenido parte siempre de aquí, para que la clase siga
 * siendo la misma fila y en el mismo sitio.
 */
export function sinContenido(s: Sesion): Sesion {
  return {
    id: s.id,
    grupoId: s.grupoId,
    fecha: s.fecha,
    titulo: '',
    juegos: [],
    notas: '',
    recursos: [],
    ...(s.franjaInicio !== undefined ? { franjaInicio: s.franjaInicio } : {}),
    ...(s.horaInicio !== undefined ? { horaInicio: s.horaInicio } : {}),
    ...(s.horaFin !== undefined ? { horaFin: s.horaFin } : {}),
  }
}

/** Una sesión existente con la franja que ocupa, ya resuelta. */
export interface SesionEnOrden {
  sesion: Sesion
  /** `franjaInicio`, o la primera clase de su día si no la tiene (antes de v24). */
  franja: string
}

/**
 * Las sesiones EXISTENTES de un grupo, en orden cronológico real (fecha y, dentro
 * del día, franja), desde el día y la franja elegidos. Solo días lectivos: una
 * sesión que se quedó en un festivo nuevo no es una clase que rellenar.
 *
 * Es la secuencia de destinos del volcado y de copiar planificaciones. Parte de
 * las sesiones y no del horario, así que respeta por construcción toda sesión
 * eliminada: lo que no existe no está en la lista.
 */
export function sesionesEnOrden(
  sesiones: Sesion[],
  grupo: Grupo,
  curso: CursoFechas,
  desde: string,
  franjaDesde?: string,
): SesionEnOrden[] {
  // Una sesión sin franja ocupa la primera clase de su día: las MISMAS claves
  // que `clavesOcupadas`.
  const primeraDelDia = new Map<number, string>()
  for (const f of grupo.horario) {
    const previa = primeraDelDia.get(f.diaSemana)
    if (previa === undefined || f.horaInicio < previa) primeraDelDia.set(f.diaSemana, f.horaInicio)
  }
  return sesiones
    .map((sesion) => {
      const dow = diaLectivo(sesion.fecha)
      const franja = sesion.franjaInicio ?? (dow === null ? undefined : primeraDelDia.get(dow)) ?? ''
      return { sesion, franja }
    })
    .filter(
      ({ sesion, franja }) =>
        sesion.fecha > desde || (sesion.fecha === desde && (!franjaDesde || franja >= franjaDesde)),
    )
    .filter(({ sesion }) => estadoDia(sesion.fecha, curso).tipo === 'lectivo')
    .sort((a, b) => a.sesion.fecha.localeCompare(b.sesion.fecha) || a.franja.localeCompare(b.franja))
}

/** Qué le ocurre a una sesión existente en este volcado. */
export interface PasoVolcado {
  fecha: string
  franjaInicio: string
  /** Sesión del plan que se coloca aquí; `null` si la sesión se salta. */
  plan: { id: string; orden: number; titulo: string } | null
  /** La sesión que ya ocupa esa clase. Siempre existe: el volcado no crea. */
  previa: { id: string; titulo: string; vacia: boolean; deLaUnidad: boolean }
  accion: 'rellenar' | 'sustituir' | 'saltar'
}

export interface PreviaVolcado {
  modo: ModoVolcado
  /** Todos los huecos tocados o saltados, en orden cronológico real. */
  pasos: PasoVolcado[]
  /** Sesiones del plan que se colocan. */
  colocadas: number
  /** Huecos saltados por tener trabajo (solo en modo «saltar»). */
  saltadas: number
  /** Sesiones que se pierden en modo «sobrescribir». Nunca en silencio. */
  sustituidas: { fecha: string; franjaInicio: string; titulo: string }[]
  /**
   * Sesiones del plan que se quedan fuera: no hay más sesiones existentes en el
   * grupo donde ponerlas. Aviso, no bloqueo: no se crean huecos para que quepan.
   */
  sinHueco: number
  /** Sesiones existentes del grupo desde el punto de inicio: el techo del volcado. */
  huecosDisponibles: number
  /** Periodos no lectivos que el volcado atraviesa, por nombre. */
  periodosCruzados: string[]
  /** Trimestres que abarca el volcado. Más de uno = la unidad los cruza. */
  trimestresCruzados: Trimestre[]
  /** Sesiones de esta unidad ya colocadas en el grupo antes de volcar. */
  volcadoPrevio: number
  /** Total de sesiones del plan de ese curso. */
  totalPlan: number
  primeraFecha: string | null
  ultimaFecha: string | null
}

export interface OpcionesVolcado {
  udId: string
  grupoId: string
  /** Día en que empieza la unidad. */
  desde: string
  /** Franja de ese día en que empieza. Sin ella, la primera clase de ese día. */
  franjaInicio?: string
  modo: ModoVolcado
  /**
   * Retira el volcado anterior de esta unidad en este grupo antes de colocar,
   * en vez de dejar dos copias conviviendo.
   */
  reemplazarPrevio?: boolean
}

/** Contexto común de la previa y de la aplicación: se lee una sola vez. */
async function contextoVolcado(op: OpcionesVolcado) {
  const ud = await db.unidades.get(op.udId)
  if (!ud) throw new Error('La unidad ya no existe')

  const grupo = await db.grupos.get(op.grupoId)
  if (!grupo) throw new Error('El grupo ya no existe')
  if (grupo.etapa !== ud.etapa)
    throw new Error('La unidad es de otra etapa: sus criterios son de otro decreto.')
  if (!ud.niveles.includes(grupo.nivel))
    throw new Error('La unidad no abarca el curso de este grupo.')

  // Solo las sesiones DEL CURSO del grupo: una unidad multi-curso no vuelca las
  // sesiones de 3.º en un grupo de 4.º.
  const plan = sesionesDe(ud, grupo.nivel)
  if (plan.length === 0)
    throw new Error(`${grupo.nivel}º de esta unidad no tiene ninguna sesión planificada todavía.`)

  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!curso) throw new Error('No hay ningún curso escolar activo')

  const sesiones = await db.sesiones.where('grupoId').equals(op.grupoId).toArray()

  return { ud, grupo, plan, curso, sesiones }
}
// `deshacerLote` se reexporta para que las vistas no tengan que conocer dos módulos.
export { deshacerLote }

/**
 * Calcula el volcado sin escribir nada. Recorre los huecos REALES del horario
 * en orden cronológico desde el día y la franja elegidos: si un día tiene dos
 * clases se ocupan las dos antes de pasar al siguiente. Nunca una por semana.
 */
export async function previsualizarVolcado(op: OpcionesVolcado): Promise<PreviaVolcado> {
  const { grupo, plan, curso, sesiones } = await contextoVolcado(op)
  return calcularPrevia(op, grupo, plan, curso, sesiones)
}

function calcularPrevia(
  op: OpcionesVolcado,
  grupo: Grupo,
  plan: SesionPlan[],
  curso: CursoEscolar,
  sesiones: Sesion[],
): PreviaVolcado {
  const volcadoPrevio = sesiones.filter((s) => s.udId === op.udId).length
  // Reemplazar el volcado anterior VACÍA esas sesiones —no las borra—: a efectos
  // de reparto son clases libres.
  const seVacia = (s: Sesion) => !!op.reemplazarPrevio && s.udId === op.udId

  // La secuencia de destinos son las sesiones que YA existen, desde el día y la
  // franja elegidos. Nunca el horario: una clase eliminada no está aquí.
  const destinos = sesionesEnOrden(sesiones, grupo, curso, op.desde, op.franjaInicio)

  const pasos: PasoVolcado[] = []
  const sustituidas: PreviaVolcado['sustituidas'] = []
  let saltadas = 0
  let i = 0

  for (const { sesion, franja } of destinos) {
    if (i >= plan.length) break
    const clase = { fecha: sesion.fecha, franjaInicio: franja }
    const anterior = {
      id: sesion.id,
      titulo: sesion.titulo.trim() || 'Sesión sin título',
      vacia: seVacia(sesion) || sesionVacia(sesion),
      deLaUnidad: sesion.udId === op.udId,
    }

    // Una sesión vacía no es trabajo: se rellena siempre. Una con contenido solo
    // se pisa en modo «sobrescribir».
    if (!anterior.vacia && op.modo === 'saltar') {
      pasos.push({ ...clase, plan: null, previa: anterior, accion: 'saltar' })
      saltadas++
      continue
    }

    const paso = plan[i++]
    const accion: PasoVolcado['accion'] = anterior.vacia ? 'rellenar' : 'sustituir'
    if (accion === 'sustituir')
      sustituidas.push({ ...clase, titulo: anterior.titulo })
    pasos.push({
      ...clase,
      plan: { id: paso.id, orden: paso.orden, titulo: paso.titulo },
      previa: anterior,
      accion,
    })
  }

  const colocados = pasos.filter((p) => p.plan)
  const primeraFecha = colocados[0]?.fecha ?? null
  const ultimaFecha = colocados[colocados.length - 1]?.fecha ?? null

  const periodosCruzados =
    primeraFecha && ultimaFecha
      ? (curso.periodosNoLectivos ?? [])
          .filter((p) => p.inicio >= primeraFecha && p.inicio <= ultimaFecha)
          .map((p) => p.nombre)
      : []
  const trimestresCruzados = [
    ...new Set(
      colocados.map((p) => trimestreDe(p.fecha, curso)).filter((t): t is Trimestre => t !== null),
    ),
  ]

  return {
    modo: op.modo,
    pasos,
    colocadas: colocados.length,
    saltadas,
    sustituidas,
    sinHueco: plan.length - colocados.length,
    huecosDisponibles: destinos.length,
    periodosCruzados,
    trimestresCruzados,
    volcadoPrevio,
    totalPlan: plan.length,
    primeraFecha,
    ultimaFecha,
  }
}

/**
 * Aplica el volcado que describe la previa, en una sola transacción y bajo una
 * marca de lote (`Sesion.loteVolcado`).
 *
 * Solo escribe en `db.sesiones`, y solo sobre filas que ya existían: rellena,
 * sustituye o —al reemplazar un volcado previo— vacía. Ni crea ni borra filas,
 * ni toca el horario ni las clases canceladas.
 *
 * `deshacer` revierte el lote ENTERO devolviendo cada fila tocada a su estado
 * anterior exacto. Sin esto, sobrescribir sería pérdida irreversible de trabajo
 * programado.
 */
export async function aplicarVolcado(op: OpcionesVolcado): Promise<{
  previa: PreviaVolcado
  loteId: string
  lote: LotePlan
  deshacer: () => Promise<void>
}> {
  const { ud, grupo, plan, curso, sesiones } = await contextoVolcado(op)
  const previa = calcularPrevia(op, grupo, plan, curso, sesiones)
  const loteId = nuevoId()
  const porId = new Map(sesiones.map((s) => [s.id, s]))

  // Estado nuevo de cada fila tocada. Primero se vacía el volcado anterior, si
  // se reemplaza; después, cada paso con sesión del plan escribe encima.
  const nuevas = new Map<string, Sesion>()
  if (op.reemplazarPrevio)
    for (const s of sesiones) if (s.udId === op.udId) nuevas.set(s.id, sinContenido(s))

  for (const paso of previa.pasos) {
    if (!paso.plan) continue
    const original = porId.get(paso.previa.id)!
    const delPlan = plan.find((s) => s.id === paso.plan!.id)!
    nuevas.set(original.id, {
      ...sinContenido(original),
      titulo: delPlan.titulo,
      udId: op.udId,
      sesionPlanId: delPlan.id,
      loteVolcado: loteId,
      notas: delPlan.notas,
      recursos: delPlan.recursos,
      ...(delPlan.recursosNecesarios !== undefined
        ? { recursosNecesarios: delPlan.recursosNecesarios }
        : {}),
    })
  }

  // Estado anterior EXACTO de todo lo que el lote toca: es lo que repone deshacer.
  const antes = [...nuevas.keys()].map((id) => porId.get(id)!)

  await db.transaction('rw', db.sesiones, async () => {
    for (const s of nuevas.values()) await db.sesiones.put(s)
  })

  const lote = crearLote({
    grupoId: grupo.id,
    tipo: 'volcado',
    descripcion: `Llevar «${ud.titulo}» a ${grupo.nombre}`,
    antes: { sesiones: antes, cancelaciones: [] },
    despues: { sesiones: [...nuevas.values()], cancelaciones: [] },
  })
  return { previa, loteId, lote, deshacer: () => deshacerLote(lote) }
}

/**
 * Atajo: volcar sin pisar trabajo hecho y sin previa. Lo usan el agente de voz
 * y los flujos automáticos. Por dentro es `aplicarVolcado` en modo «saltar»,
 * así que no hay una segunda implementación del reparto.
 */
export async function aplicarUnidadAGrupo(opciones: {
  udId: string
  grupoId: string
  desde: string
  franjaInicio?: string
}): Promise<{
  colocadas: number
  omitidas: number
  sinHueco: number
  deshacer: () => Promise<void>
}> {
  const { previa, deshacer } = await aplicarVolcado({ ...opciones, modo: 'saltar' })
  return {
    colocadas: previa.colocadas,
    omitidas: previa.saltadas,
    sinHueco: previa.sinHueco,
    deshacer,
  }
}
