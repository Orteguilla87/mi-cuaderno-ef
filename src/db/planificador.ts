import { cicloDeCurso, cicloDeUnidad, idCriterioPrimaria, ordinalCiclo } from '../lib/ciclos'
import { estadoDia, type CursoFechas } from '../lib/calendarioEscolar'
import { aISO, deISO, sumarDias } from '../lib/fechas'
import { esEnlace } from '../lib/importarTexto'
import { criteriosDeGrupo } from './criterios'
import { db, nuevoId } from './db'
import {
  NIVEL_CICLO_INFANTIL,
  type ClaseCancelada,
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
  }
  await db.sesiones.add(sesion)
  // Planificar ese día es, por sí solo, restaurar la clase: si estaba cancelada
  // (`db.clasesCanceladas`), la excepción deja de tener sentido y se retira.
  await quitarCancelaciones(grupoId, fecha)
  return sesion.id
}

/** Retira las excepciones de «no hay clase» de un grupo y fecha. */
async function quitarCancelaciones(grupoId: string, fecha: string): Promise<void> {
  const previas = await db.clasesCanceladas.where('[grupoId+fecha]').equals([grupoId, fecha]).toArray()
  if (previas.length) await db.clasesCanceladas.bulkDelete(previas.map((c) => c.id))
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

/**
 * Elimina una sesión. Tres desenlaces distintos para el hueco que deja, porque
 * borrar el contenido y quitar la clase del día NO son lo mismo (y confundirlos
 * era el motivo de que «eliminar» pareciera no hacer nada: el hueco se genera
 * del horario y volvía a salir vacío):
 *  - `cancelarHueco`: además de borrar la sesión, marca «ese día, ese grupo, no
 *    hay clase» en `db.clasesCanceladas`. El horario semanal no se toca.
 *  - `desplazarSiguientes`: las sesiones posteriores del mismo grupo se corren
 *    una posición hacia el hueco (misma lógica de secuencia que
 *    `copiarPlanificacion`: se avanza sobre las clases reales del grupo, no
 *    sobre fechas de calendario sueltas). Ahí el hueco debe seguir existiendo.
 *  - Ninguno de los dos: se vacía la planificación y el hueco queda libre.
 */
export async function eliminarSesion(
  sesionId: string,
  desplazarSiguientes: boolean,
  cancelarHueco = false,
): Promise<() => Promise<void>> {
  const sesion = await db.sesiones.get(sesionId)
  if (!sesion) throw new Error('La sesión ya no existe')

  if (!desplazarSiguientes) {
    if (!cancelarHueco) {
      await db.sesiones.delete(sesionId)
      return async () => void (await db.sesiones.add(sesion))
    }

    const cancelada: ClaseCancelada = {
      id: nuevoId(),
      grupoId: sesion.grupoId,
      fecha: sesion.fecha,
      creado: new Date().toISOString(),
    }
    await db.transaction('rw', [db.sesiones, db.clasesCanceladas], async () => {
      await db.sesiones.delete(sesionId)
      await db.clasesCanceladas.add(cancelada)
    })
    // Deshacer devuelve las dos cosas a la vez: la sesión y la clase del día.
    return async () => {
      await db.transaction('rw', [db.sesiones, db.clasesCanceladas], async () => {
        await db.clasesCanceladas.delete(cancelada.id)
        await db.sesiones.add(sesion)
      })
    }
  }

  const grupo = await db.grupos.get(sesion.grupoId)
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!grupo || !curso) throw new Error('Falta el grupo o el curso activo')

  const siguientes = (await db.sesiones.where('grupoId').equals(sesion.grupoId).toArray())
    .filter((s) => s.fecha > sesion.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // huecos[0] es la propia fecha que se libera; cada sesión posterior ocupa
  // la posición anterior de la secuencia, cerrando el hueco.
  const huecos = fechasDeClase(grupo, curso, sesion.fecha)
  const cambios = siguientes
    .map((s, i) => ({ id: s.id, fechaAntes: s.fecha, fechaDespues: huecos[i] }))
    .filter((c): c is { id: string; fechaAntes: string; fechaDespues: string } =>
      Boolean(c.fechaDespues && c.fechaDespues !== c.fechaAntes),
    )

  await db.transaction('rw', db.sesiones, async () => {
    await db.sesiones.delete(sesionId)
    for (const c of cambios) await db.sesiones.update(c.id, { fecha: c.fechaDespues })
  })

  return async () => {
    await db.transaction('rw', db.sesiones, async () => {
      for (const c of cambios) await db.sesiones.update(c.id, { fecha: c.fechaAntes })
      await db.sesiones.add(sesion)
    })
  }
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
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha))
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
  if (grupo.horario.length === 0) return []

  const dias = new Set(grupo.horario.map((f) => f.diaSemana))
  const arranque = desde && desde > curso.inicio ? desde : curso.inicio

  const fechas: string[] = []
  let fecha = arranque
  // Tope de seguridad por si las fechas del curso vinieran mal (fin < inicio).
  for (let i = 0; fecha <= curso.fin && i < 500; i++) {
    const estado = estadoDia(fecha, curso)
    if (estado.tipo === 'lectivo' && dias.has(estado.dia)) fechas.push(fecha)
    fecha = sumarDias(fecha, 1)
  }
  return fechas
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

export interface ResultadoGeneracion {
  creadas: number
  /** Clases que ya tenían sesión y se han respetado. */
  existentes: number
  total: number
}

/**
 * Genera el esqueleto del curso: una sesión vacía por cada clase real del grupo
 * entre el inicio y el fin del curso, saltando festivos y vacaciones.
 *
 * Nunca pisa una sesión existente: si ya hay algo ese día, se deja como está.
 * Así se puede volver a ejecutar tras añadir vacaciones o cambiar el horario.
 */
export async function generarCursoCompleto(
  grupoId: string,
): Promise<{ resultado: ResultadoGeneracion; deshacer: () => Promise<void> }> {
  const grupo = await db.grupos.get(grupoId)
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!grupo || !curso) throw new Error('Falta el grupo o el curso activo')

  const fechas = fechasDeClase(grupo, curso)
  const ocupadas = new Set(
    (await db.sesiones.where('grupoId').equals(grupoId).toArray()).map((s) => s.fecha),
  )

  const nuevas: Sesion[] = fechas
    .filter((f) => !ocupadas.has(f))
    .map((fecha) => ({
      id: nuevoId(),
      grupoId,
      fecha,
      titulo: '',
      juegos: [],
      notas: '',
      recursos: [],
    }))

  await db.sesiones.bulkAdd(nuevas)
  const ids = nuevas.map((s) => s.id)

  return {
    resultado: {
      creadas: nuevas.length,
      existentes: fechas.length - nuevas.length,
      total: fechas.length,
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
  creadas: number
  /** Clases del destino que ya tenían sesión y no se han tocado. */
  omitidas: number
  /** Faltaron fechas de clase para colocar todas las sesiones. */
  sinHueco: number
}

/**
 * Copia una planificación a uno o varios grupos de destino.
 *
 * Reglas, pensadas para que copiar nunca destruya trabajo hecho:
 *  · Las sesiones se colocan EN ORDEN sobre las clases del destino desde `desde`.
 *  · Una clase del destino que ya tenga sesión se salta, y la siguiente sesión
 *    del origen busca el siguiente hueco libre.
 *  · No se copia la valoración: es un juicio sobre cómo salió aquella clase.
 */
export async function copiarPlanificacion(opciones: {
  sesiones: Sesion[]
  destinos: string[]
  desde: string
}): Promise<{ resultados: ResultadoCopia[]; deshacer: () => Promise<void> }> {
  const { sesiones, destinos, desde } = opciones
  const ordenadas = [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const resultados: ResultadoCopia[] = []
  const creadas: Sesion[] = []

  for (const grupoId of destinos) {
    const grupo = await db.grupos.get(grupoId)
    if (!grupo) continue

    // Se piden más fechas que sesiones para tener margen ante huecos ocupados.
    const candidatas = await proximasClases(grupo, desde, ordenadas.length * 3 + 10)
    const ocupadas = new Set(
      (await db.sesiones.where('grupoId').equals(grupoId).toArray()).map((s) => s.fecha),
    )

    let omitidas = 0
    let indiceFecha = 0
    let colocadas = 0

    for (const origen of ordenadas) {
      // Avanza hasta la primera clase libre del destino.
      while (indiceFecha < candidatas.length && ocupadas.has(candidatas[indiceFecha])) {
        indiceFecha++
        omitidas++
      }
      if (indiceFecha >= candidatas.length) break

      const fecha = candidatas[indiceFecha++]
      creadas.push({
        id: nuevoId(),
        grupoId,
        fecha,
        titulo: origen.titulo,
        udId: origen.udId,
        juegos: origen.juegos,
        notas: origen.notas,
        recursos: origen.recursos,
        recursosNecesarios: origen.recursosNecesarios,
        comentarios: origen.comentarios,
      })
      ocupadas.add(fecha)
      colocadas++
    }

    resultados.push({
      grupoId,
      nombreGrupo: grupo.nombre,
      creadas: colocadas,
      omitidas,
      sinHueco: ordenadas.length - colocadas,
    })
  }

  await db.sesiones.bulkAdd(creadas)
  const ids = creadas.map((s) => s.id)
  return {
    resultados,
    deshacer: async () => void (await db.sesiones.bulkDelete(ids)),
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

/**
 * Materializa el plan de una unidad en sesiones reales de un grupo, a partir de
 * una fecha. Es el momento en que la programación deja de ser texto y ocupa
 * clases del calendario.
 *
 * Mismo reparto que `copiarPlanificacion`: se avanza sobre las clases REALES
 * del grupo (festivos y vacaciones ya descontados), y una clase que ya tenga
 * sesión se salta —nunca se pisa trabajo hecho— y la siguiente del plan busca
 * el hueco de después. Si se acaban las clases del curso, lo dice en vez de
 * amontonar sesiones el último día.
 */
export async function aplicarUnidadAGrupo(opciones: {
  udId: string
  grupoId: string
  desde: string
}): Promise<{
  creadas: number
  omitidas: number
  sinHueco: number
  deshacer: () => Promise<void>
}> {
  const { udId, grupoId, desde } = opciones
  const ud = await db.unidades.get(udId)
  if (!ud) throw new Error('La unidad ya no existe')

  const grupo = await db.grupos.get(grupoId)
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

  // Se piden más fechas que sesiones para tener margen ante huecos ocupados.
  const candidatas = await proximasClases(grupo, desde, plan.length * 3 + 10)
  const ocupadas = new Set(
    (await db.sesiones.where('grupoId').equals(grupoId).toArray()).map((s) => s.fecha),
  )

  const nuevas: Sesion[] = []
  let omitidas = 0
  let indiceFecha = 0

  for (const paso of plan) {
    while (indiceFecha < candidatas.length && ocupadas.has(candidatas[indiceFecha])) {
      indiceFecha++
      omitidas++
    }
    if (indiceFecha >= candidatas.length) break

    const fecha = candidatas[indiceFecha++]
    nuevas.push({
      id: nuevoId(),
      grupoId,
      fecha,
      titulo: paso.titulo,
      udId,
      juegos: [],
      notas: paso.notas,
      recursos: paso.recursos,
      recursosNecesarios: paso.recursosNecesarios,
    })
    ocupadas.add(fecha)
  }

  await db.sesiones.bulkAdd(nuevas)
  const ids = nuevas.map((s) => s.id)

  return {
    creadas: nuevas.length,
    omitidas,
    sinHueco: plan.length - nuevas.length,
    deshacer: async () => void (await db.sesiones.bulkDelete(ids)),
  }
}
