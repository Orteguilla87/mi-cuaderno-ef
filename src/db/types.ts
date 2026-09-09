/**
 * Modelo de datos — §3 de CLAUDE.md.
 * Todas las entidades viven en IndexedDB (Dexie). Nada sale del dispositivo.
 *
 * Convención de fechas: string ISO 'YYYY-MM-DD' (fecha local, sin zona horaria),
 * porque toda consulta del cuaderno es por día natural, no por instante.
 */

export type Id = string

export type Etapa = 'infantil' | 'primaria'
export type Trimestre = 1 | 2 | 3
export type CalificacionOficial = 'IN' | 'SU' | 'BI' | 'NT' | 'SB'

export interface Trimestre1a3 {
  n: Trimestre
  inicio: string // 'YYYY-MM-DD'
  fin: string // 'YYYY-MM-DD'
}

/** Rango de días sin clase con motivo (Navidad, Semana Santa…), § Bloque 7. */
export interface PeriodoNoLectivo {
  nombre: string
  inicio: string // 'YYYY-MM-DD'
  fin: string // 'YYYY-MM-DD'
}

export interface CursoEscolar {
  id: Id
  nombre: string // "2026-2027"
  activo: boolean
  /**
   * Límites del curso lectivo, 'YYYY-MM-DD'. El planificador no coloca sesiones
   * fuera de ellos. Se guardan explícitos y no se derivan de `trimestres`
   * porque planificar debe funcionar antes de tener los trimestres cargados.
   */
  inicio: string
  fin: string
  /** Tramos de evaluación. Vacío hasta que el usuario los fija en Ajustes. */
  trimestres: Trimestre1a3[]
  /** Días sueltos sin clase (festivos, no lectivos de centro): 'YYYY-MM-DD'. */
  festivos: string[]
  /** Rangos sin clase con nombre (vacaciones de Navidad, Semana Santa…). */
  periodosNoLectivos: PeriodoNoLectivo[]
  /**
   * El calendario se precargó con datos editables (CAM 2026-2027) que el
   * usuario aún no ha confirmado. Solo informa; nunca bloquea nada.
   */
  calendarioPendienteConfirmar?: boolean
}

export interface FranjaHorario {
  diaSemana: 1 | 2 | 3 | 4 | 5 // lunes..viernes
  horaInicio: string // 'HH:MM'
  horaFin: string // 'HH:MM'
}

export interface Grupo {
  id: Id
  cursoEscolarId: Id
  nombre: string // "3ºB", "Infantil 4A"
  etapa: Etapa
  nivel: number // primaria 1..6 · infantil 3..5 (edad)
  /**
   * Hex heredado de antes de que hubiera paleta (`lib/paleta.ts`). Se conserva
   * para no perder el valor original, pero lo que se pinta es `colorId`.
   */
  color: string // hex
  /**
   * Identificador de `lib/paleta.ts`. Se guarda el id y NUNCA el hex, para
   * poder reajustar un tono de la paleta sin migrar un solo registro.
   */
  colorId?: string
  orden: number
  horario: FranjaHorario[]
}

export interface Alumno {
  id: Id
  grupoId: Id
  /**
   * La PERSONA detrás de la ficha. Dos fichas con el mismo `personaId` son el
   * mismo niño en dos grupos distintos —el maestro le da dos áreas y cada una
   * tiene su grupo—, y comparten lo que es de la persona: sus etiquetas, sus
   * pautas de apoyo, su nota privada, su género y su nivel motriz
   * (`db/personas.ts`, `CAMPOS_COMPARTIDOS`).
   *
   * NO comparten nada del área: calificaciones, asistencia, celdas del Cuaderno
   * y contadores cuelgan de `id`, no de aquí.
   *
   * Opcional de verdad: la inmensa mayoría de las fichas no lo tienen y se
   * comportan exactamente como antes de que existiera. Nunca lo escribe la app
   * por su cuenta —dos alumnos pueden llamarse igual—: lo pone el usuario,
   * ficha a ficha, desde «Vincular alumnado».
   */
  personaId?: Id
  nombre: string
  apellidos: string
  alias: string
  activo: boolean
  /** Pautas prácticas de apoyo. NUNCA se exporta en informes; solo en backup cifrado. */
  apoyos?: string
  notasPrivadas?: string
  /**
   * Etiquetas de `EtiquetaAlumno`, por id. DATO DE CATEGORÍA ESPECIAL: mismo
   * trato que `apoyos` —nunca en informes, exportaciones ni agente de voz; solo
   * dentro del backup cifrado—, y además solo se pintan en el Cuaderno.
   *
   * Opcional de verdad: un alumno sin etiquetas no tiene el campo, no tiene un
   * array vacío. Indexado como multiEntry (`*etiquetas`).
   */
  etiquetas?: string[]
  /**
   * Cuándo CADUCA cada etiqueta puesta: `etiquetaId → milisegundos`. Es de la
   * ASIGNACIÓN, no de la etiqueta: la misma «Lesionado» dura tres semanas en un
   * niño y dos días en otro.
   *
   * Va aparte y no dentro de `etiquetas` para no tocar el índice multiEntry
   * `*etiquetas` ni ninguno de los caminos que lo leen. Una etiqueta puesta sin
   * entrada aquí es INDEFINIDA, que es lo normal.
   *
   * Pasada la fecha, la asignación se enseña atenuada y marcada como caducada,
   * pero NO se retira sola: es un dato del usuario, y quitarlo por su cuenta
   * borraría información que él no ha decidido borrar. Se retira o se prolonga
   * de un toque desde la ficha.
   *
   * Es un campo de la PERSONA (`db/personas.ts`): la lesión es del niño.
   */
  etiquetasHasta?: Record<string, number>
  genero?: 'chico' | 'chica' | null
  /**
   * Nivel motriz 1–5 para el generador de equipos. PRIVADO: mismo tratamiento
   * que `apoyos` — nunca en informes, exportaciones ni modo pizarra.
   */
  nivelMotriz?: 1 | 2 | 3 | 4 | 5 | null
}

/**
 * Etiqueta de alumnado: TDAH, ACNEE, Compensatoria, lesionado…
 *
 * REGLA DURA: es un dato de categoría especial (salud, necesidades educativas).
 * Hereda entera la protección de `Alumno.apoyos` —nunca sale del dispositivo
 * salvo dentro del blob cifrado— y añade la suya: solo se pinta en las vistas
 * de gestión del maestro (Cuaderno, ficha del grupo, pase de lista y ficha del
 * alumno), nunca en nada proyectable. Lista exacta y vigilancia en
 * `lib/etiquetasAlumno.test.ts`.
 */
export interface EtiquetaAlumno {
  id: Id
  /** «TDAH», «ACNEE», «Lesionado». */
  nombre: string
  /**
   * 1–3 caracteres. Se pinta junto al punto de color en todas las vistas que
   * enseñan etiquetas: el color no es nunca el único portador del significado.
   */
  abreviatura: string
  /** Identificador de `lib/paleta.ts`. NUNCA un hex. */
  colorId: string
  /**
   * Identificador del catálogo cerrado de `lib/iconosEtiqueta.ts`. OPCIONAL:
   * sin él se pinta punto + abreviatura, como siempre; con él el icono
   * sustituye al punto y conserva el color. Un icono que ya no exista en el
   * catálogo vuelve al punto, no rompe nada.
   */
  icono?: string
  /**
   * Si la etiqueta describe algo TEMPORAL —una lesión— y por tanto al ponerla
   * se propone una fecha de fin. ACNEE o TDAH no lo son.
   *
   * Opcional con ausencia real: las etiquetas que ya existen no lo llevan y no
   * son temporales, que es exactamente lo que significa que falte. No hace
   * falta migración, y no se escribe un `false` que no dice nada.
   */
  temporal?: boolean
  creadoEn: number
}

export type TipoVinculo = 'separar' | 'juntar'

/** Restricción dura entre dos alumnos del mismo grupo para el generador de equipos. */
export interface Vinculo {
  id: Id
  grupoId: Id
  alumnoA: Id
  alumnoB: Id
  tipo: TipoVinculo
}

export type ModoGeneracion = 'aleatorio' | 'heterogeneo' | 'homogeneo'

/** Parámetros con los que se generó una alineación, para poder «Regenerar». */
export interface ConfigGeneracionEquipos {
  modo: ModoGeneracion
  soloPresentes: boolean
  equilibrarGenero: boolean
  respetarVinculos: boolean
  repartirApoyos: boolean
  priorizarNuevos: boolean
}

export interface EquipoGenerado {
  nombre: string
  /** Hex heredado. Lo que se pinta es `colorId`. */
  color: string
  /** Identificador de `lib/paleta.ts`. */
  colorId?: string
  miembros: Id[]
}

/**
 * «Este día, este grupo, no hay clase»: excepción puntual al horario semanal.
 *
 * El planificador se construye sobre `Grupo.horario`, así que borrar la sesión
 * de un día no quitaba la clase de las vistas: el hueco se genera del horario y
 * volvía a aparecer vacío. Esta tabla es la única forma de decir «ese día, ese
 * grupo, no» sin tocar el horario —que afectaría a TODAS las semanas—.
 *
 * No destruye nada: la asistencia y las observaciones de ese día siguen donde
 * estaban, y quitar la excepción devuelve la clase a su sitio.
 */
export interface ClaseCancelada {
  id: Id
  grupoId: Id
  fecha: string
  /**
   * Franja concreta, para un grupo con más de una clase ese día. Ausente
   * cancela todas las franjas de esa fecha.
   */
  horaInicio?: string
  /** ISO de cuándo se canceló, para poder explicarlo en la interfaz. */
  creado: string
}

/** Alineación de equipos guardada, reutilizable en 1 toque. */
export interface Equipo {
  id: Id
  grupoId: Id
  nombre: string
  fecha: string
  udId?: Id
  config: ConfigGeneracionEquipos
  equipos: EquipoGenerado[]
}

/** Ciclo del sorteo «Alumno aleatorio» del Cuaderno. Uno vivo por grupo (`id` = `grupoId`). */
export interface CicloAleatorio {
  id: Id
  grupoId: Id
  yaSalieron: Id[]
  actualizado: string
}

export type EstadoAsistencia = 'presente' | 'falta' | 'retraso' | 'justificada'

export interface Asistencia {
  id: Id
  alumnoId: Id
  fecha: string
  /**
   * Franja del horario a la que pertenece este pase de lista, por su
   * `horaInicio`. Existe porque un grupo puede tener DOS clases el mismo día en
   * franjas separadas: sin este campo ambas escribían sobre el mismo registro y
   * pasar lista en la segunda machacaba la primera.
   *
   * Ausente = «la primera franja del día», que es lo que significaban todos los
   * registros anteriores a este campo. Por eso la migración no reescribe nada:
   * el silencio ya es la respuesta correcta.
   */
  franjaInicio?: string
  estado: EstadoAsistencia
  chandal: boolean
  observacion?: string
}

export interface JuegoEnSesion {
  gameId: string
  nombre: string
}

/** Enlace o nota suelta ligada a una sesión o UD. Sin nubes de terceros (§9). */
export interface Recurso {
  tipo: 'enlace' | 'nota'
  valor: string
}

export interface Sesion {
  id: Id
  grupoId: Id
  fecha: string
  titulo: string
  udId?: Id
  juegos: JuegoEnSesion[]
  /** Descripción de la sesión (organización, variantes, qué vigilar…). */
  notas: string
  valoracion?: 1 | 2 | 3 | 4 | 5
  recursos: Recurso[]
  /** Material necesario para la sesión, en texto libre. */
  recursosNecesarios?: string
  /** Comentarios posteriores a la sesión (cómo fue, incidencias…). */
  comentarios?: string
  /** Hora distinta a la habitual del grupo ese día, si se ha cambiado para esta sesión. */
  horaInicio?: string
  horaFin?: string
  /**
   * Franja del horario del grupo que ocupa esta sesión, por su `horaInicio`.
   * Es IDENTIDAD, no presentación: `horaInicio` de arriba es un override de la
   * hora real y puede cambiar; esto no. Distingue las dos clases de un mismo
   * grupo el mismo día en franjas separadas.
   *
   * Ausente = primera franja del grupo ese día (lo que ya ocurría antes de que
   * el campo existiera).
   */
  franjaInicio?: string
  /**
   * Sesión del plan de la unidad (`SesionPlan.id`) de la que salió esta sesión
   * al volcar. Es el vínculo con el plan: sobrevive a que se reordenen las
   * sesiones DENTRO de la unidad, porque no guarda la posición sino la
   * identidad. Reordenar el plan después de volcar no descoloca lo programado.
   */
  sesionPlanId?: Id
  /**
   * Lote del volcado que la creó o la sobrescribió. Permite reconocer «lo que
   * entró de una vez» para deshacerlo o reemplazarlo entero.
   */
  loteVolcado?: Id
}

/**
 * Juego del banco. La estructura del JSON que aporta el usuario no se conoce de
 * antemano, así que solo `id` y `nombre` son obligatorios: el importador mapea
 * los alias habituales y guarda en `extra` todo campo que no reconozca, para no
 * perder información al importar.
 */
export interface Juego {
  id: Id
  nombre: string
  descripcion?: string
  material?: string[]
  espacio?: string
  agrupamiento?: string
  intensidad?: string
  /** Edades o cursos a los que se ajusta, tal cual venga en el origen. */
  edades?: string[]
  etiquetas: string[]
  /** Campos del JSON de origen que no corresponden a ninguno de los anteriores. */
  extra?: Record<string, unknown>
}

export type TipoPlantilla = 'sesion' | 'ud'

/**
 * Plantilla reutilizable entre niveles y grupos (§5 M3). Con 9 grupos, el
 * esqueleto escalable es lo que hace viable planificar.
 */
export interface Plantilla {
  id: Id
  tipo: TipoPlantilla
  titulo: string
  etapa?: Etapa
  // — solo tipo 'sesion' —
  juegos?: JuegoEnSesion[]
  notas?: string
  recursos?: Recurso[]
  // — solo tipo 'ud' —
  criterios?: string[]
  /** Títulos de las sesiones que compondrían la unidad. */
  sesionesSugeridas?: string[]
}

/**
 * `lesion` es aparte de `salud` a propósito: es la categoría que se cruza con
 * la etiqueta «Lesionado» (`db/etiquetasAlumno.ts`). La OBSERVACIÓN es el
 * registro histórico —qué pasó, cuándo, qué se hizo— y la ETIQUETA es el estado
 * de hoy. Son complementarias, y por eso al registrar una observación neutra de
 * lesión se OFRECE poner la etiqueta, nunca se pone sola.
 */
export type TipoObservacion = 'conducta' | 'aprendizaje' | 'salud' | 'lesion' | 'otro'
export type SignoObservacion = '+' | '-' | 'neutro'

export interface Observacion {
  id: Id
  alumnoId?: Id // ausente => observación de grupo
  grupoId: Id
  /**
   * Día al que se refiere la observación. Es dato de REGISTRO, no de contenido:
   * no se edita en línea desde la lista, solo por el camino de siempre.
   */
  fecha: string
  tipo: TipoObservacion
  signo: SignoObservacion
  texto: string
  tags: string[]
  /**
   * Marca de la última edición del contenido, en milisegundos. Ausente en las
   * observaciones que nunca se han tocado desde que se crearon.
   */
  actualizadoEn?: number
}

// ——— UNIDADES ———

/**
 * El único «curso» de una unidad de Infantil. Los criterios del Decreto 36/2022
 * se fijan por ciclo completo —3, 4 y 5 años comparten los 56—, así que la
 * unidad es del ciclo y no de una edad: hay una sola bolsa de unidades para toda
 * la etapa, y las tres edades la comparten por construcción.
 *
 * Se guarda un 0 en vez de dejar el campo fuera porque `niveles` está indexado y
 * IndexedDB no indexa los nulos: con `null` las unidades de Infantil quedarían
 * fuera del índice y no se podrían consultar.
 */
export const NIVEL_CICLO_INFANTIL = 0

interface UnidadBase {
  id: Id
  /**
   * Cursos que abarca la unidad. Siempre de la misma etapa y del MISMO CICLO:
   * los criterios de Primaria se definen por ciclo, y una unidad de 3.º y 5.º
   * tendría que sostener dos juegos de criterios a la vez. En Infantil es
   * siempre `[NIVEL_CICLO_INFANTIL]`, porque la unidad ya es del ciclo entero.
   *
   * Indexado como multiEntry (`*niveles`): una unidad de 3.º y 4.º sale en las
   * consultas de los dos cursos.
   */
  niveles: number[]
  /** `null` = unidad suelta, fuera de todo cálculo. */
  trimestre: Trimestre | null
  titulo: string
  /**
   * Ids de `Criterio` ('EF.2C.1.1' en Primaria, 'INF:I.1.1' en Infantil), no
   * códigos: el código se repite entre ciclos.
   *
   * Es un vínculo desnudo: no lleva peso, ni porcentaje, ni instrumento. En
   * Infantil, además, el ORDEN NO SIGNIFICA NADA —se renderiza siempre ordenado
   * por código—; son referencia curricular y nada más.
   */
  criterios: string[]
  /** Plantilla de la que salió, si se creó a partir de una. */
  plantillaId?: Id
  /** Unidad de la que se copió. Solo trazabilidad: nada del cálculo depende de él. */
  copiadaDe?: Id
  /**
   * Ids de criterio del origen que no tenían equivalente en el ciclo destino al
   * copiar o mover la unidad.
   *
   * No se inventa una equivalencia ni se busca «el más parecido»: el criterio
   * se queda fuera y se anota aquí. Mientras la lista tenga contenido, la unidad
   * enseña que le falta revisión; se vacía cuando el usuario la da por revisada.
   */
  criteriosSinMapear?: string[]
  /**
   * Retira la unidad del listado activo sin destruir nada.
   *
   * Es la salida para las unidades que ya no se usan pero cuyo borrado sería
   * pérdida irreversible —las que tienen notas u observaciones puestas—, y
   * también para las de cursos pasados que simplemente estorban. `undefined` es
   * «no archivada»: el campo es opcional y no indexado a propósito, así que las
   * unidades que ya existían no necesitan migración ni cambian de
   * comportamiento, y el filtro se hace en memoria (son decenas, no miles).
   */
  archivada?: boolean
  /**
   * Plan de sesiones de la unidad, en orden y todavía sin grupo ni fecha.
   *
   * Existe porque una `Sesion` no puede existir sin `grupoId` y `fecha` (el
   * índice `[grupoId+fecha]` es único), y la programación se escribe mucho antes
   * de saber en qué clases va a caer. Al llevar la unidad a un grupo, cada
   * `SesionPlan` se materializa en una `Sesion` con `udId` puesto.
   *
   * No es una tabla nueva a propósito: el plan se lee y se escribe siempre
   * entero con su unidad, no se consulta por índice, y así el backup cifrado y
   * la sincronización lo llevan sin tocar nada.
   */
  sesiones?: SesionPlan[]
}

/**
 * Una sesión planificada dentro de la unidad. Mismos campos que la `Sesion`
 * real salvo lo que depende del calendario (fecha, hora, valoración) y de haber
 * ocurrido ya (comentarios): eso solo tiene sentido cuando la clase existe.
 */
export interface SesionPlan {
  id: Id
  /**
   * Curso de la unidad al que pertenece esta sesión. Las sesiones son PROPIAS de
   * cada curso: la misma unidad se desarrolla distinto en 3.º y en 4.º.
   */
  nivel: number
  /** Posición dentro de las sesiones de SU curso, no del plan entero. */
  orden: number
  titulo: string
  /** Descripción de la sesión. Mismo campo que `Sesion.notas`. */
  notas: string
  /** «Enlaces y notas». Mismo campo que `Sesion.recursos`. */
  recursos: Recurso[]
  /** Material necesario, en texto libre. Mismo campo que `Sesion.recursosNecesarios`. */
  recursosNecesarios?: string
}

/**
 * Unidad didáctica de Primaria. Es la unidad de calificación de la Orden
 * 130/2023 (art. 6): el peso vive en la UD dentro del trimestre, y en el
 * instrumento dentro de la UD. Los criterios NO reciben nota: son referente y
 * trazabilidad de cobertura.
 *
 * Nada aquí es obligatorio salvo lo que afecta al cálculo: una UD sin trimestre
 * o con `computa` en falso es perfectamente válida, simplemente no entra en la
 * nota. Se avisa, no se bloquea.
 */
export interface UnidadPrimaria extends UnidadBase {
  etapa: 'primaria'
  /** Si es falso, la unidad no entra en la nota, pero sí en el informe de cobertura. Compartido. */
  computa: boolean
  /**
   * Peso de la unidad dentro de su trimestre, 0–100, POR CURSO: el grupo y el
   * reparto del trimestre son distintos en 3.º y en 4.º, así que un peso único
   * no significaría lo mismo en los dos. Se ignora si `computa` es falso.
   *
   * Un curso ausente del mapa pesa 0, que es lo mismo que no haberlo repartido.
   */
  pesosPorNivel: Record<number, number>
}

/**
 * Unidad de programación de Infantil (situación de aprendizaje). NO tiene
 * ponderación en el trimestre, ni instrumentos ponderados, ni rúbrica
 * calificable, ni ningún campo numérico de evaluación: esos campos no existen
 * en el tipo, así que no se muestran, no se persisten y el compilador impide
 * que lleguen al motor de notas.
 */
export interface UnidadInfantil extends UnidadBase {
  etapa: 'infantil'
  /**
   * Siempre `[NIVEL_CICLO_INFANTIL]`: la unidad es del 2.º ciclo entero y las
   * tres edades la comparten. Es `number[]` y no la tupla literal a propósito:
   * el tipo estrecho obligaba a un aserto en cada `includes` y `filter` que
   * recorre los cursos de una unidad sin saber su etapa.
   */
  niveles: number[]
}

export type UnidadDidactica = UnidadPrimaria | UnidadInfantil

/**
 * Una unidad de Primaria resuelta desde UNO de sus cursos, con su `nivel` y su
 * `pesoTrimestre` ya elegidos.
 *
 * Existe porque casi todo lo que consume una unidad —el motor de notas, el
 * reparto de pesos, el cuaderno— trabaja siempre desde un grupo, y por tanto
 * desde un curso. Proyectarla en el borde deja al motor viendo lo de siempre:
 * una unidad de un curso con un peso, sin enterarse del multi-curso.
 */
export type UnidadEnCurso = UnidadPrimaria & { nivel: number; pesoTrimestre: number }

/** Lo que ve el motor de notas: una unidad ya resuelta desde su curso. */
export type UnidadCalificable = UnidadEnCurso | UnidadInfantil

// ——— CUADERNO: columnas flexibles de evaluación ———

/**
 * Instrumentos disponibles como columna del cuaderno.
 *
 * `numero` es el único tipo numérico: los grupos de Infantil no lo ofrecen,
 * para respetar el espíritu de §6 (sin números) sin renunciar a la flexibilidad.
 */
export type TipoColumna =
  | 'numero'
  | 'positivo_negativo'
  | 'contador'
  | 'caritas'
  | 'si_no'
  | 'rubrica'
  | 'texto'
  | 'calculo'

export const TIPOS_NUMERICOS: TipoColumna[] = ['numero']

/**
 * Tipos que producen una nota y por tanto entran en el cálculo de la Orden 130
 * (§ motor de `lib/notas.ts`): todos los que `valorNormalizado` sabe llevar a
 * 0–10 por sí solos.
 *
 * Quedan fuera `texto`, `positivo_negativo` y `contador` (un contador no es un
 * logro sobre 10: es un registro de aula) y también `calculo`, que ya es una
 * media de otras columnas: incluirla contaría esas notas dos veces.
 */
export const TIPOS_CALIFICABLES: TipoColumna[] = ['numero', 'caritas', 'si_no', 'rubrica']

/**
 * Una columna que entra en un cálculo, con su peso. Los pesos se normalizan al
 * promediar (no tienen por qué sumar 100), igual que los pesos de rúbrica.
 */
export interface ComponenteCalculo {
  columnaId: Id
  pesoPct: number
}

export interface Columna {
  id: Id
  grupoId: Id
  trimestre: Trimestre
  titulo: string
  tipo: TipoColumna
  orden: number
  /** Fecha a la que corresponde la evaluación, si aplica. */
  fecha?: string
  /** Unidad a la que pertenece. Sin ella la columna existe, pero no computa. */
  udId?: Id
  /** Peso del instrumento dentro de su unidad, 0–100. Solo cuenta si hay `udId`. */
  pesoUd: number
  /**
   * LEGADO. Los criterios de un instrumento son la unión de los `criterioId` de
   * sus filas (`FilaInstrumento`); este campo se conserva para no perder lo que
   * ya había, pero no es fuente de verdad y la UI no lo ofrece.
   */
  criterioCodigo?: string
  // — tipo 'numero' —
  escala?: { min: number; max: number; decimales: 0 | 1 | 2 }
  // — tipo 'caritas' —
  caritas?: 3 | 5
  /**
   * — tipo 'contador' — cuánto suma o resta cada pulsación. Ausente = 1.
   * El valor de la celda no tiene tope por arriba ni por abajo.
   */
  paso?: number
  // — tipo 'rubrica' —
  rubricaId?: Id
  // — tipo 'calculo' —
  calculo?: { componentes: ComponenteCalculo[] }
}

/**
 * Fila de un instrumento: lo que de verdad se evalúa y lo que ata la nota a un
 * criterio oficial.
 *
 * Un instrumento simple (una nota única) tiene UNA fila. Una rúbrica tiene N,
 * cada una espejo de un criterio de la `Rubrica` y con SU propio criterio del
 * decreto, distinto del de sus hermanas: ese es el caso normal.
 *
 * El criterio oficial y el peso viven aquí, en la columna, y no en el banco de
 * rúbricas, para que una misma rúbrica pueda reutilizarse en ciclos distintos
 * (los criterios de 1.er ciclo no son los de 3.º aunque compartan código).
 */
export interface FilaInstrumento {
  id: Id
  columnaId: Id
  orden: number
  descriptor: string
  /** Id de `Criterio`. `null` = fila sin trazar a ningún criterio. */
  criterioId: string | null
  /** Peso dentro del instrumento. `null` = reparto equitativo con sus hermanas. */
  pesoFila: number | null
  /** Criterio de la `Rubrica` del que es espejo, cuando la columna es de rúbrica. */
  criterioRubricaId?: Id
}

export interface NivelRubrica {
  id: Id
  etiqueta: string // «Conseguido», «Excelente»…
  valor: number // para poder promediar después
}

export interface CriterioRubrica {
  id: Id
  titulo: string
  pesoPct: number
  /** Descriptor de este criterio en cada nivel: nivelId → texto. */
  descripciones?: Record<string, string>
  /**
   * Código del criterio del decreto SIN ciclo («2.2»), tal como venía en la
   * referencia del indicador importado («2.2.a · …»).
   *
   * No es el vínculo: el vínculo es `FilaInstrumento.criterioId` y vive en la
   * columna, porque el mismo «2.2» es un criterio distinto en cada ciclo. Esto
   * es solo la pista con la que la columna SUGIERE el criterio una vez sabe de
   * qué curso es el grupo. Nunca se liga nada en silencio a partir de aquí.
   */
  codigo?: string
  /** Letra del indicador dentro del criterio («a» en «2.2.a»), informativa. */
  letra?: string
}

/** Rúbrica reutilizable entre columnas y grupos (banco propio). */
export interface Rubrica {
  id: Id
  titulo: string
  etapa?: Etapa
  niveles: NivelRubrica[]
  criterios: CriterioRubrica[]
}

/**
 * Valor de una celda. Solo se rellena el campo del tipo de su columna; se
 * guardan en campos distintos en vez de un `valor: unknown` para que el tipo
 * siga siendo comprobable y las migraciones futuras sean explícitas.
 */
export interface ValorCelda {
  id: Id
  columnaId: Id
  alumnoId: Id
  numero?: number
  positivos?: number
  negativos?: number
  /**
   * — tipo 'contador' — entero con signo. AUSENTE Y CERO SON DISTINTOS:
   * ausente = la celda no se ha usado; 0 = se sumó y se restó lo mismo. Por eso
   * nunca se escribe un 0 por defecto y «borrar» vuelve a ausente, no a 0.
   */
  contador?: number
  /** Índice de la carita elegida, 0 = la peor. */
  carita?: number
  marcado?: boolean
  texto?: string
  /** criterioId → nivelId, para columnas de rúbrica. */
  rubrica?: Record<string, string>
  actualizado: number
}

export type TipoInstrumento = 'rubrica' | 'lista_control' | 'nota_directa'

export interface ItemInstrumento {
  id: Id
  descripcion: string
  criterioCodigo: string
  pesoPct: number
}

export interface InstrumentoEval {
  id: Id
  udId: Id
  tipo: TipoInstrumento
  items: ItemInstrumento[]
  escala: { min: number; max: number }
}

export interface Calificacion {
  id: Id
  alumnoId: Id
  instrumentoId: Id
  itemId: Id
  valor: number
  trimestre: Trimestre
  fecha: string
}

export interface EvalTrimestral {
  id: Id
  alumnoId: Id
  trimestre: Trimestre
  notaCalculada: number
  notaDocente?: number
  calificacionOficial: CalificacionOficial
  comentario: string
  cerrado: boolean
}

export interface EvalFinal {
  id: Id
  alumnoId: Id
  notaCalculada: number
  notaDocente?: number
  calificacionOficial: CalificacionOficial
  comentario: string
}

// ——— INFANTIL ———

/**
 * Criterio de evaluación oficial, con los literales de los Decretos 36/2022
 * (Infantil) y 61/2022 (Primaria) tal como los aporta el usuario: la app no
 * inventa textos legales (§9).
 *
 * Es tabla de solo lectura: se resiembra en cada arranque desde `seeds/` y
 * nada de la app la escribe. Los criterios no reciben nota (Orden 130/2023);
 * son el referente de las filas de instrumento y la base de la cobertura.
 */
export interface Criterio {
  /**
   * Clave primaria. En Primaria es el id del propio decreto ('EF.2C.1.1'); en
   * Infantil se compone aquí ('INF:I.1.1').
   *
   * El código NO basta: en Primaria «1.1» existe en los tres ciclos con textos
   * distintos (46 criterios, solo 17 códigos únicos). Usarlo como clave los
   * colapsaría y se perderían criterios sin avisar.
   */
  id: string
  codigo: string
  etapa: Etapa
  competenciaCodigo: string
  competenciaTexto: string
  texto: string
  // — Infantil —
  areaCodigo?: string
  areaNombre?: string
  /** Área I «Crecimiento en armonía»: la que se evalúa desde Psicomotricidad. */
  principal?: boolean
  // — Primaria —
  ciclo?: 1 | 2 | 3
  cursos?: number[]
}

export type NivelLogro = 'iniciado' | 'en_proceso' | 'conseguido'

export interface RegistroInfantil {
  id: Id
  alumnoId: Id
  criterioCodigo: string
  momento: 1 | 2 | 3
  nivel: NivelLogro
  observacion?: string
}

export interface InformeInfantil {
  id: Id
  alumnoId: Id
  trimestre: Trimestre
  comentario: string
}

// ——— COMÚN ———

export interface ComentarioBanco {
  id: Id
  texto: string // admite placeholder {nombre}
  categoria: string
  etapa: Etapa
}

export type ModoMedia = 'aritmetica' | 'ponderada' | 'continua'

/** Umbral inferior (incluido) de cada calificación oficial, sobre 0–10. */
export interface BandasOficiales {
  SU: number
  BI: number
  NT: number
  SB: number
}

/**
 * Sobre qué número se aplican las bandas del art. 19 (§ Bloque 3.2):
 * `redondeada` — se redondea la nota primero y la banda se mira sobre el
 * entero (7,51 → 8 → NT); `real` — la banda se mira directamente sobre la
 * nota sin redondear (6,6 → BI). La nota real se enseña siempre, sea cual
 * sea el modo: el decimal tiene que quedar trazable para una reclamación
 * (Orden 130/2023, art. 20).
 */
export type BandaSobre = 'redondeada' | 'real'

/**
 * PIN de acceso (§1.7). Solo se guarda el hash: el PIN en claro no se almacena
 * en ningún sitio. Con 4–6 dígitos el espacio es diminuto, así que el coste del
 * PBKDF2 es la única defensa real — de ahí que se guarden las iteraciones.
 */
export interface PinGuardado {
  /** base64 */
  salt: string
  /** base64 */
  hash: string
  iteraciones: number
}

/**
 * Servidor WebDAV propio del usuario (Bloque 1). Solo transporta ficheros
 * `.enc` ya cifrados: el servidor nunca ve datos legibles ni la passphrase.
 *
 * La contraseña se guarda en local igual que `apiKey` (§1.3) y, como toda la
 * base, sin cifrar: el PIN no protege el disco. Se avisa en Ajustes.
 */
export interface ConfigWebdav {
  /** URL de la carpeta remota. Siempre https (salvo localhost). */
  url: string
  usuario: string
  password: string
}

/**
 * Sincronización automática vía Firestore (Bloque 1). El `id` es la credencial:
 * quien lo conoce accede a la carpeta, quien no, no puede ni enumerarla.
 *
 * La `passphrase` se guarda aquí porque es la única forma de cifrar y descifrar
 * sin preguntar nada, que es justo lo que hace automática la sincronización. Es
 * la misma contraseña del backup manual y recibe el mismo trato que `apiKey` o
 * la contraseña del WebDAV (§1.3): local, nunca en el repo, nunca en la red. Y
 * la misma advertencia que el resto: el PIN no cifra el disco, así que quien
 * tenga este dispositivo desbloqueado la tiene. Se avisa en Ajustes.
 */
export interface ConfigSincro {
  id: string
  passphrase: string
}

export interface Config {
  id: 'config' // singleton
  pesosTrimestres: [number, number, number]
  modoMedia: ModoMedia
  bandasOficiales: BandasOficiales
  /** Sobre qué nota se aplican las bandas del art. 19: la redondeada o la real. */
  bandaSobre: BandaSobre
  /** Etiquetas de un toque en el registro de observaciones (§5 M4). */
  quickTagsObservacion: string[]
  /** Colores de peto del generador de equipos, en orden de asignación (hex heredado). */
  coloresPetos: string[]
  /** Los mismos, como identificadores de `lib/paleta.ts`. Es lo que se pinta. */
  coloresPetosIds?: string[]
  pin?: PinGuardado
  apiKey?: string
  modeloAgente: string
  modoPista: boolean
  tema: 'claro' | 'oscuro' | 'sistema'
  /** ISO 8601 del último backup exportado. Alimenta el aviso semanal (M9). */
  ultimoBackup?: string
  /**
   * Versión de la semilla de criterios ya volcada en esta base. Mientras
   * coincida con `VERSION_SEMILLA_CRITERIOS`, el arranque no escribe ni una
   * fila de criterios. Va en la base y no en `localStorage` para viajar dentro
   * del backup, igual que los criterios que describe.
   */
  semillaCriterios?: number
  /** Servidor WebDAV propio para llevar el `.enc` de un dispositivo a otro. */
  webdav?: ConfigWebdav
  /** Sincronización automática del mismo `.enc` vía Firestore. */
  sincro?: ConfigSincro
  /** Cómo se muestra el nombre del alumnado en el Cuaderno. */
  formatoNombre: FormatoNombre
  /** Ancho de la columna de alumnado del Cuaderno, congelada en los tres. */
  anchoColumnaAlumno: AnchoColumnaAlumno
}

export type FormatoNombre = 'apellidos-nombre' | 'nombre-apellidos' | 'solo-nombre'
export type AnchoColumnaAlumno = 'estrecha' | 'media' | 'ancha'

export type EstadoAccionAgente = 'aplicada' | 'deshecha'

export interface AccionAgente {
  id: Id
  timestamp: number
  transcripcion: string
  accion: string
  payload: unknown
  estado: EstadoAccionAgente
}

// ——————————————————————— Inventario de material ———————————————————————
//
// Catálogo del centro, TRANSVERSAL a las etapas: no lleva `etapa` a propósito.
// Un aro es el mismo aro en Psicomotricidad y en 6º; lo que cambia es si es
// apto para 3-5 años, y eso se dice con una etiqueta (`apto-infantil`), no
// partiendo el catálogo en dos.
//
// Regla que atraviesa todo el módulo: `cantidad` y `estado` admiten AUSENCIA
// REAL. Un inventario de centro llega medio hecho, y «no lo he contado» no es
// lo mismo que «hay cero». La clave sencillamente no existe en el registro:
// nunca se rellena con 0, con '' ni con un valor por defecto.

export type EstadoMaterial = 'bueno' | 'regular' | 'malo' | 'fuera_de_uso'

export interface Material {
  id: Id
  nombre: string
  /** Minúsculas, sin tildes y sin dobles espacios: dedupe y búsqueda. */
  nombreNormalizado: string
  /** Entero ≥ 0. Ausente = no contado, NO cero. */
  cantidad?: number
  /** De las `cantidad` unidades, cuántas no sirven. Ausente = no consta. */
  cantidadInservible?: number
  estado?: EstadoMaterial
  etiquetaIds: Id[]
  /** Texto libre: almacén, porche, caseta… */
  ubicacion?: string
  notas?: string
  creadoEn: number
  actualizadoEn: number
}

/** Solo agrupa visualmente en la pantalla de etiquetas. */
export type GrupoEtiqueta = 'tamano' | 'familia' | 'ubicacion' | 'otro'

/**
 * Nombre de token de §3.1, nunca un hex. El mapa a clases de Tailwind vive en
 * `lib/inventario.ts`, que es el único sitio que traduce token → clase.
 */
export type ColorEtiqueta = 'primario' | 'acento' | 'lima' | 'aviso' | 'agua'

export interface EtiquetaMaterial {
  id: Id
  nombre: string
  nombreNormalizado: string
  grupo?: GrupoEtiqueta
  color?: ColorEtiqueta
  /** Etiquetas del sistema: no se borran ni se renombran. */
  reservada?: boolean
  creadoEn: number
}
