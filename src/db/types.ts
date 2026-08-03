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

/**
 * Unidad didáctica. Es la unidad de calificación de la Orden 130/2023 (art. 6):
 * el peso vive en la UD dentro del trimestre, y en el instrumento dentro de la
 * UD. Los criterios NO reciben nota: son referente y trazabilidad de cobertura.
 *
 * Nada aquí es obligatorio salvo lo que afecta al cálculo: una UD sin trimestre
 * o con `computa` en falso es perfectamente válida, simplemente no entra en la
 * nota. Se avisa, no se bloquea.
 */
export interface UnidadDidactica {
  id: Id
  /** El curso, 1–6. Mismo significado que `Grupo.nivel`. */
  nivel: number
  /** `null` = unidad suelta, fuera de todo cálculo. */
  trimestre: Trimestre | null
  titulo: string
  /** Ids de `Criterio` ('EF.2C.1.1'), no códigos: el código se repite entre ciclos. */
  criterios: string[]
  /** Si es falso, la unidad no entra en la nota, pero sí en el informe de cobertura. */
  computa: boolean
  /** Peso de la unidad dentro de su trimestre, 0–100. Se ignora si `computa` es falso. */
  pesoTrimestre: number
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
 * Tipos que producen una nota y por tanto entran en el cálculo de la Orden 130
 * (§ motor de `lib/notas.ts`): todos los que `valorNormalizado` sabe llevar a
 * 0–10 por sí solos.
 *
 * Quedan fuera `texto` y `positivo_negativo` (un contador no es un logro sobre
 * 10) y también `calculo`, que ya es una media de otras columnas: incluirla
 * contaría esas notas dos veces.
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
  /** Colores de peto del generador de equipos, en orden de asignación. */
  coloresPetos: string[]
  pin?: PinGuardado
  apiKey?: string
  modeloAgente: string
  modoPista: boolean
  tema: 'claro' | 'oscuro' | 'sistema'
  /** ISO 8601 del último backup exportado. Alimenta el aviso semanal (M9). */
  ultimoBackup?: string
  /** Servidor WebDAV propio para llevar el `.enc` de un dispositivo a otro. */
  webdav?: ConfigWebdav
  /** Sincronización automática del mismo `.enc` vía Firestore. */
  sincro?: ConfigSincro
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
