import { cicloDeCurso } from '../lib/ciclos'
import { estadoDia, type CursoFechas } from '../lib/calendarioEscolar'
import { aISO, deISO, sumarDias } from '../lib/fechas'
import { esEnlace } from '../lib/importarTexto'
import { db, nuevoId } from './db'
import {
  NIVEL_CICLO_INFANTIL,
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
  type UnidadPrimaria,
} from './types'

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
  return sesion.id
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
  return async () => void (await db.sesiones.put(antes))
}

/**
 * Elimina una sesión. Con `desplazarSiguientes`, las sesiones posteriores del
 * mismo grupo se corren una posición hacia el hueco que deja (misma lógica de
 * secuencia que `copiarPlanificacion`: se avanza sobre las clases reales del
 * grupo, no sobre fechas de calendario sueltas).
 */
export async function eliminarSesion(
  sesionId: string,
  desplazarSiguientes: boolean,
): Promise<() => Promise<void>> {
  const sesion = await db.sesiones.get(sesionId)
  if (!sesion) throw new Error('La sesión ya no existe')

  if (!desplazarSiguientes) {
    await db.sesiones.delete(sesionId)
    return async () => void (await db.sesiones.add(sesion))
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

  // En Infantil no se escriben `computa` ni `pesoTrimestre`, ni siquiera a 0:
  // no es que valgan cero, es que ahí no hay ponderación que valga.
  const ud: UnidadDidactica =
    datos.etapa === 'infantil'
      ? { ...comun, etapa: 'infantil', nivel: NIVEL_CICLO_INFANTIL }
      : {
          ...comun,
          etapa: 'primaria',
          nivel: datos.nivel,
          computa: datos.computa ?? true,
          pesoTrimestre: datos.pesoTrimestre ?? 0,
        }

  await db.unidades.add(ud)
  return ud.id
}

/**
 * Duplica una UD de Primaria a otro nivel, que es como se reutiliza entre
 * cursos. En Infantil no aplica: las unidades son del 2.º ciclo entero, así que
 * no hay otro nivel al que llevarlas.
 */
export async function duplicarUnidad(udId: string, nivel: number): Promise<string> {
  const origen = await db.unidades.get(udId)
  if (!origen) throw new Error('La unidad de origen ya no existe')
  if (origen.etapa === 'infantil')
    throw new Error(
      'Las unidades de Infantil son del ciclo completo: no hay otro nivel al que duplicarlas.',
    )
  return crearUnidad({
    etapa: 'primaria',
    titulo: origen.titulo,
    nivel,
    trimestre: origen.trimestre,
    // Los criterios NO se arrastran: son de un ciclo concreto y duplicar a otro
    // nivel puede cambiar de ciclo, con lo que apuntarían a criterios que no
    // aplican. El peso tampoco: el reparto es de cada curso.
    criterios: cicloDeCurso(origen.nivel) === cicloDeCurso(nivel) ? origen.criterios : [],
    computa: origen.computa,
    plantillaId: origen.plantillaId,
  })
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
export async function unidadesDe(nivel: number, trimestre: Trimestre): Promise<UnidadPrimaria[]> {
  const lista = await db.unidades.where('[etapa+nivel]').equals(['primaria', nivel]).toArray()
  return lista
    .filter((u): u is UnidadPrimaria => u.etapa === 'primaria' && u.trimestre === trimestre)
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
}

/** Unidades del curso de Primaria que no computan, para el listado informativo aparte. */
export async function unidadesQueNoComputan(nivel: number): Promise<UnidadPrimaria[]> {
  const lista = await db.unidades.where('[etapa+nivel]').equals(['primaria', nivel]).toArray()
  return lista
    .filter((u): u is UnidadPrimaria => u.etapa === 'primaria' && !u.computa)
    .sort((a, b) => (a.trimestre ?? 9) - (b.trimestre ?? 9) || a.titulo.localeCompare(b.titulo, 'es'))
}

/**
 * Escribe el reparto de pesos de un trimestre de una vez. Devuelve la función
 * de deshacer: repartir es fácil de hacer sin querer y el usuario debe poder
 * volver al reparto anterior de un toque, como en el resto del cuaderno.
 *
 * Se lee y se reescribe la unidad entera en vez de actualizar solo el campo
 * porque `pesoTrimestre` no existe en las unidades de Infantil: así el propio
 * tipo descarta las que no ponderan, en lugar de confiar en que quien llame
 * haya filtrado bien.
 */
export async function guardarPesosTrimestre(
  pesos: { udId: string; pesoTrimestre: number }[],
): Promise<() => Promise<void>> {
  const previos: { udId: string; pesoTrimestre: number }[] = []

  await db.transaction('rw', db.unidades, async () => {
    for (const { udId, pesoTrimestre } of pesos) {
      const unidad = await db.unidades.get(udId)
      if (!unidad || unidad.etapa !== 'primaria') continue
      previos.push({ udId, pesoTrimestre: unidad.pesoTrimestre })
      await db.unidades.put({ ...unidad, pesoTrimestre })
    }
  })

  return async () => {
    await db.transaction('rw', db.unidades, async () => {
      for (const { udId, pesoTrimestre } of previos) {
        const unidad = await db.unidades.get(udId)
        if (!unidad || unidad.etapa !== 'primaria') continue
        await db.unidades.put({ ...unidad, pesoTrimestre })
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
  const plan: SesionPlan[] = datos.sesiones.map((s, i) => {
    const material = s.recursos.map((r) => r.trim()).filter(Boolean).join(', ')
    const enlaces: Recurso[] = s.enlacesYNotas
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((valor) => ({ tipo: esEnlace(valor) ? 'enlace' : 'nota', valor }))

    return {
      id: nuevoId(),
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

  const plan = [...(ud.sesiones ?? [])].sort((a, b) => a.orden - b.orden)
  if (plan.length === 0)
    throw new Error('Esta unidad no tiene ninguna sesión planificada todavía.')

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
