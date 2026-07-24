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
  /** Días sin clase (festivos y vacaciones): 'YYYY-MM-DD'. El pase de lista los salta. */
  festivos: string[]
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
  color: string // hex
  orden: number
  horario: FranjaHorario[]
}

export interface Alumno {
  id: Id
  grupoId: Id
  nombre: string
  apellidos: string
  alias: string
  activo: boolean
  /** Pautas prácticas de apoyo. NUNCA se exporta en informes; solo en backup cifrado. */
  apoyos?: string
  notasPrivadas?: string
  genero?: 'chico' | 'chica' | null
  /**
   * Nivel motriz 1–5 para el generador de equipos. PRIVADO: mismo tratamiento
   * que `apoyos` — nunca en informes, exportaciones ni modo pizarra.
   */
  nivelMotriz?: 1 | 2 | 3 | 4 | 5 | null
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
  color: string
  miembros: Id[]
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

export type EstadoAsistencia = 'presente' | 'falta' | 'retraso' | 'justificada'

export interface Asistencia {
  id: Id
  alumnoId: Id
  fecha: string
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

export type TipoObservacion = 'conducta' | 'aprendizaje' | 'salud' | 'otro'
export type SignoObservacion = '+' | '-' | 'neutro'

export interface Observacion {
  id: Id
  alumnoId?: Id // ausente => observación de grupo
  grupoId: Id
  fecha: string
  tipo: TipoObservacion
  signo: SignoObservacion
  texto: string
  tags: string[]
}

// ——— PRIMARIA ———

export interface UnidadDidactica {
  id: Id
  nivel: number
  trimestre: Trimestre
  titulo: string
  criterios: string[] // códigos D.61/2022
  /** Plantilla de la que salió, si se creó a partir de una. */
  plantillaId?: Id
}

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
  | 'caritas'
  | 'si_no'
  | 'rubrica'
  | 'texto'
  | 'calculo'

export const TIPOS_NUMERICOS: TipoColumna[] = ['numero']

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
  /** Unidad a la que pertenece: permite medias por unidad. */
  udId?: Id
  /** Criterio del decreto al que evalúa, si se quiere trazar. */
  criterioCodigo?: string
  // — tipo 'numero' —
  escala?: { min: number; max: number; decimales: 0 | 1 | 2 }
  // — tipo 'caritas' —
  caritas?: 3 | 5
  // — tipo 'rubrica' —
  rubricaId?: Id
  // — tipo 'calculo' —
  calculo?: { componentes: ComponenteCalculo[] }
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
 * Criterio de evaluación oficial. Se siembra desde `seeds/` con textos
 * PENDIENTE y el usuario los sustituye por los literales del decreto: la app
 * no inventa textos legales (§9).
 */
export interface Criterio {
  /**
   * Clave primaria compuesta: 'INF:I.1.1' · 'PRI:2:1.1'.
   *
   * El código del decreto NO basta: en Primaria «1.1» existe en los tres ciclos
   * con textos distintos (46 criterios, solo 17 códigos únicos). Usar el código
   * como clave los colapsaría y se perderían criterios sin avisar.
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

export interface Config {
  id: 'config' // singleton
  pesosTrimestres: [number, number, number]
  modoMedia: ModoMedia
  bandasOficiales: BandasOficiales
  /** Etiquetas de un toque en el registro de observaciones (§5 M4). */
  quickTagsObservacion: string[]
  /** Colores de peto del generador de equipos, en orden de asignación. */
  coloresPetos: string[]
  pin?: string
  apiKey?: string
  modeloAgente: string
  modoPista: boolean
  tema: 'claro' | 'oscuro' | 'sistema'
}

export type EstadoAccionAgente = 'aplicada' | 'deshecha'

export interface AccionAgente {
  id: Id
  timestamp: number
  transcripcion: string
  accion: string
  payload: unknown
  estado: EstadoAccionAgente
}
