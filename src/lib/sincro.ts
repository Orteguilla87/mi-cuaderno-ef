/**
 * Sincronización automática — la parte que se puede razonar sola.
 *
 * Aquí no hay Firestore ni Dexie, igual que `lib/webdav.ts` no sabe nada de la
 * base: solo bytes y decisiones. Toda la lógica que importa —cuándo subir,
 * cuándo bajar y, sobre todo, cuándo pararse porque hay conflicto— vive en
 * funciones puras que se pueden probar sin red y sin navegador.
 */

import {
  aBase64,
  aBytes,
  aTexto,
  aleatorios,
  BYTES_IV,
  BYTES_SALT,
  cifrar,
  deBase64,
  derivarClave,
  descifrar,
  ITERACIONES_PBKDF2,
} from './cripto'

/**
 * Firestore admite 1 MiB por documento. Se trocea bastante por debajo para
 * dejar sitio a la envoltura del propio documento y no vivir en el límite.
 */
export const BYTES_POR_PARTE = 700_000

/**
 * Prueba de que quien subió la copia usaba una contraseña concreta, sin
 * revelarla.
 *
 * Es un bloque AES-GCM de contenido conocido (`TESTIGO`) cifrado con la MISMA
 * clave que el `.enc`: PBKDF2-SHA256 con las mismas 600.000 iteraciones y una
 * sal propia. Quien tenga la contraseña lo abre; quien no, se enfrenta a
 * exactamente el mismo trabajo que ya le supondría atacar el `.enc` que está al
 * lado en el servidor. Por eso no empeora nada: no añade una vía más barata.
 *
 * Un hash a secas habría sido más corto, pero un hash rápido de la contraseña sí
 * habría regalado un oráculo barato; y con las mismas iteraciones no ahorraba
 * nada frente a esto.
 */
export interface Canario {
  /** Sal del PBKDF2, base64. Propia: nunca la del backup. */
  sal: string
  iv: string
  /** `TESTIGO` cifrado, con su sello de autenticación. Base64. */
  sello: string
  iteraciones: number
}

/** Contenido conocido del canario. Cambiarlo invalida los canarios ya subidos. */
export const TESTIGO = 'cuaderno-ef/sincro/v1'

export async function crearCanario(passphrase: string): Promise<Canario> {
  const sal = aleatorios(BYTES_SALT)
  const iv = aleatorios(BYTES_IV)
  const clave = await derivarClave(passphrase, sal, ITERACIONES_PBKDF2)
  const sello = await cifrar(clave, iv, aBytes(TESTIGO))
  return {
    sal: aBase64(sal),
    iv: aBase64(iv),
    sello: aBase64(sello),
    iteraciones: ITERACIONES_PBKDF2,
  }
}

/**
 * `true` si esta contraseña es la que cifró la copia del servidor.
 *
 * Sin canario devuelve `true`: las copias subidas por versiones anteriores de
 * la app no lo llevan, y bloquearlas sería inventarse una divergencia donde no
 * se sabe si la hay. Lo peor que pasa entonces es lo de antes: el fallo aparece
 * al descifrar.
 */
export async function canarioCoincide(
  canario: Canario | undefined,
  passphrase: string,
): Promise<boolean> {
  if (!canario?.sal || !canario.iv || !canario.sello) return true
  try {
    const clave = await derivarClave(passphrase, deBase64(canario.sal), canario.iteraciones)
    const claro = await descifrar(clave, deBase64(canario.iv), deBase64(canario.sello))
    return aTexto(claro) === TESTIGO
  } catch {
    // AES-GCM no distingue «clave mala» de «bytes tocados», y aquí las dos
    // llevan al mismo sitio: con esta contraseña no se va a poder abrir nada.
    return false
  }
}

/** Identidad del canario, para no volver a derivar la clave del ya comprobado. */
export function selloDeCanario(canario: Canario | undefined): string | null {
  return canario?.sello ?? null
}

/** Lo que se guarda en `sync/{id}`. Recuentos y fechas: ningún dato personal. */
export interface MetaRemota {
  /** Entero monótono. Se compara sin depender de que los relojes coincidan. */
  version: number
  /** Nº de documentos en `partes`. */
  partes: number
  bytes: number
  /** Esquema Dexie con el que se generó la copia. */
  esquema: number
  /** ISO 8601: cuándo se generó la copia (cabecera del `.enc`). */
  creado: string
  /** Nombre legible del dispositivo que la subió, para la tarjeta de conflicto. */
  dispositivo: string
  /**
   * Prueba de con qué contraseña se cifró. Opcional porque las copias subidas
   * antes de existir esto no lo llevan.
   */
  canario?: Canario
  /**
   * Registros por tabla de la copia. Es lo mismo que ya va en la cabecera en
   * claro del `.enc` —recuentos, sin nombres ni contenido— y está aquí para
   * poder enseñar QUÉ hay a cada lado de un conflicto sin descargar nada.
   * Opcional: las copias anteriores no lo llevan.
   */
  registros?: Record<string, number>
}

/**
 * Lo que hay dentro de una copia, en las cuatro cifras que le dicen algo a un
 * maestro. Se enseña a los dos lados de un conflicto: elegir entre dos fechas
 * es elegir a ciegas, porque lo que se descarta se borra entero.
 */
export interface ResumenCopia {
  grupos: number
  alumnos: number
  sesiones: number
  /** Todo lo evaluable y registrable: notas, asistencias, observaciones… */
  registros: number
}

/** Tablas que suman en `registros`: el trabajo del día a día. */
const TABLAS_DE_REGISTRO = [
  'asistencias',
  'observaciones',
  'calificaciones',
  'evalTrimestrales',
  'evalFinales',
  'registrosInfantil',
  'informesInfantil',
] as const

export function resumirRecuentos(recuentos: Record<string, number> | undefined): ResumenCopia | null {
  if (!recuentos) return null
  return {
    grupos: recuentos.grupos ?? 0,
    alumnos: recuentos.alumnos ?? 0,
    sesiones: recuentos.sesiones ?? 0,
    registros: TABLAS_DE_REGISTRO.reduce((n, t) => n + (recuentos[t] ?? 0), 0),
  }
}

/** Lo que este dispositivo sabe de la última sincronización que le salió bien. */
export interface EstadoLocal {
  /** Última `version` remota que se descargó y aplicó, o que se subió desde aquí. */
  versionAplicada: number
  /** Hay cambios locales sin subir. */
  pendiente: boolean
  /**
   * La base local tiene datos del maestro. Solo importa la primera vez: es lo
   * único que distingue un dispositivo nuevo y vacío —donde bajar sin preguntar
   * es lo correcto— de uno que ya tenía un curso entero dentro.
   */
  baseConDatos: boolean
}

export type Accion = 'nada' | 'subir' | 'bajar' | 'conflicto'

/**
 * El corazón de todo esto.
 *
 * `conflicto` es el caso que no se puede resolver solo: elegir por el usuario
 * significaría tirar trabajo suyo sin preguntar. No se fusiona nunca —fusionar
 * dos volcados completos de la base no es «juntar», es inventar— así que la app
 * se para y enseña las dos copias.
 */
export function decidir(meta: MetaRemota | null, local: EstadoLocal): Accion {
  const nuncaSincronizado = local.versionAplicada === 0

  // Carpeta vacía: lo que haya aquí es lo único que existe, así que no hay
  // nada con lo que chocar. El `baseConDatos` importa porque al estrenar la
  // sincronización nada está marcado como pendiente —esos datos se escribieron
  // antes de que el motor mirara— y sin esto la primera subida no ocurriría
  // hasta que el maestro tocase algo, dejándole creer que ya está a salvo.
  if (!meta) return local.pendiente || (nuncaSincronizado && local.baseConDatos) ? 'subir' : 'nada'

  // Primera sincronización de un dispositivo que YA tenía datos. No hay nada
  // «pendiente» porque todo eso se escribió antes de que existiera la
  // sincronización, así que el motor no lo vio pasar: sin esta regla se
  // sobrescribiría en silencio, y es el único momento en que se puede perder un
  // curso entero de una vez.
  if (nuncaSincronizado && local.baseConDatos) return 'conflicto'

  const remotoAvanza = meta.version > local.versionAplicada
  if (remotoAvanza && local.pendiente) return 'conflicto'
  if (remotoAvanza) return 'bajar'
  return local.pendiente ? 'subir' : 'nada'
}

// ——————————————————————————— reintentos ———————————————————————————

/**
 * Espera antes de reintentar, según cuántos fallos seguidos lleva.
 *
 * Un móvil en el porche pierde la cobertura a ratos: insistir cada pocos
 * segundos gasta batería y no arregla nada, así que la espera crece. El tope
 * existe porque el ciclo periódico de 5 min ya cubre el caso largo, y pasarse
 * de ahí solo alargaría la vuelta cuando la red por fin regresa.
 */
export const ESPERAS_REINTENTO = [30_000, 60_000, 120_000, 300_000] as const

export function esperaTrasFallo(fallosSeguidos: number): number {
  const i = Math.min(Math.max(fallosSeguidos, 1), ESPERAS_REINTENTO.length) - 1
  return ESPERAS_REINTENTO[i]
}

// ——————————————————————————— troceado ———————————————————————————

export function trocear(fichero: Uint8Array, tamano = BYTES_POR_PARTE): Uint8Array[] {
  if (tamano <= 0) throw new RangeError('El tamaño de parte debe ser positivo.')
  // Un fichero vacío no es un backup válido, pero devolver cero partes haría
  // que `reensamblar` no pudiera distinguirlo de «no hay nada subido».
  if (fichero.length === 0) return [new Uint8Array(0)]
  const partes: Uint8Array[] = []
  for (let i = 0; i < fichero.length; i += tamano) partes.push(fichero.subarray(i, i + tamano))
  return partes
}

export function reensamblar(partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = partes.reduce((n, p) => n + p.length, 0)
  const entero = new Uint8Array(total)
  let offset = 0
  for (const parte of partes) {
    entero.set(parte, offset)
    offset += parte.length
  }
  return entero
}

// ——————————————————————————— huella del contenido ———————————————————————————

/**
 * SHA-256 del volcado EN CLARO.
 *
 * Hace falta porque el `.enc` no sirve para comparar: cada cifrado usa salt e
 * IV nuevos, así que dos copias de datos idénticos dan bytes distintos. Sin
 * esto, cualquier escritura que no cambie nada de verdad (guardar un campo con
 * el mismo valor) provocaría una subida completa.
 *
 * No es un secreto ni viaja a ninguna parte: se queda en `localStorage`.
 */
export async function huella(claro: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', claro as BufferSource)
  return aBase64(new Uint8Array(digest) as Uint8Array<ArrayBuffer>)
}

// ——————————————————————————— nombre del dispositivo ———————————————————————————

/**
 * Etiqueta legible para saber de dónde vino una copia al resolver un conflicto
 * («el móvil» / «el PC»). Se deduce del user agent y es puramente informativa:
 * si falla, «Otro dispositivo» cumple igual.
 */
export function nombreDispositivo(ua: string = navigator.userAgent): string {
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone o iPad'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Otro dispositivo'
}
