/**
 * Formato de fichero de copia de seguridad (§1.4, M9).
 *
 * Este módulo no toca Dexie: recibe y devuelve tablas ya serializadas, para
 * poder probarlo sin base de datos.
 *
 * Disposición del fichero:
 *
 *   0..7    magia «CUAEF-BK» (ASCII)
 *   8..11   longitud de la cabecera, uint32 big-endian
 *   12..    cabecera JSON en claro (UTF-8)
 *   +16     salt del PBKDF2
 *   +12     IV del AES-GCM
 *   resto   cuerpo cifrado (incluye el sello de autenticación)
 *
 * La cabecera va EN CLARO a propósito: permite ver fecha, versión de esquema y
 * nº de registros antes de pedir la passphrase, para decidir si ese fichero es
 * el que se quiere restaurar. Por eso no lleva ningún dato personal — solo
 * recuentos. Y va como `additionalData` del AES-GCM, así que manipularla
 * invalida el descifrado: no se puede mentir en el recuento ni en la versión.
 */

import {
  aBytes,
  aTexto,
  aleatorios,
  BYTES_IV,
  BYTES_SALT,
  cifrar,
  derivarClave,
  descifrar,
  ITERACIONES_PBKDF2,
} from './cripto'

export const MAGIA = 'CUAEF-BK'
/** Versión del contenedor, independiente de la versión del esquema Dexie. */
export const FORMATO_BACKUP = 1
const BYTES_MAGIA = 8
const BYTES_LONGITUD = 4

export interface CabeceraBackup {
  formato: number
  app: 'cuaderno-ef'
  /** Versión del esquema Dexie con la que se generó. */
  esquema: number
  /** ISO 8601 UTC. */
  creado: string
  /** Nº de registros por tabla. Sin nombres, sin contenido. */
  registros: Record<string, number>
  kdf: { algoritmo: 'PBKDF2-SHA256'; iteraciones: number }
  cifrado: 'AES-GCM'
}

export type Tablas = Record<string, unknown[]>

export interface BackupAbierto {
  cabecera: CabeceraBackup
  tablas: Tablas
}

export type CodigoErrorBackup =
  /** No es un fichero de esta app, o está truncado. */
  | 'formato'
  /** Contenedor de una versión de formato que esta app no sabe leer. */
  | 'formato_futuro'
  /** Passphrase incorrecta o fichero manipulado: AES-GCM no distingue. */
  | 'passphrase'
  /** Descifró bien, pero el contenido no es un backup válido. */
  | 'contenido'
  /** Esquema Dexie posterior al de esta app: no se adivina, se rechaza. */
  | 'esquema_futuro'
  /** Tabla que esta versión de la app no conoce. */
  | 'tabla_desconocida'

export class ErrorBackup extends Error {
  constructor(
    readonly codigo: CodigoErrorBackup,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorBackup'
  }
}

function contar(tablas: Tablas): Record<string, number> {
  const registros: Record<string, number> = {}
  for (const [nombre, filas] of Object.entries(tablas)) registros[nombre] = filas.length
  return registros
}

/** Cabecera + salt + IV: todo lo que precede al cuerpo cifrado. */
function componerPrefijo(cabecera: CabeceraBackup): { prefijo: Uint8Array<ArrayBuffer>; aad: Uint8Array<ArrayBuffer> } {
  const json = aBytes(JSON.stringify(cabecera))
  const aad = new Uint8Array(BYTES_MAGIA + BYTES_LONGITUD + json.length)
  aad.set(aBytes(MAGIA), 0)
  new DataView(aad.buffer).setUint32(BYTES_MAGIA, json.length, false)
  aad.set(json, BYTES_MAGIA + BYTES_LONGITUD)
  return { prefijo: aad, aad }
}

export async function empaquetar(
  tablas: Tablas,
  passphrase: string,
  opciones: { esquema: number; creado?: Date; iteraciones?: number },
): Promise<{ fichero: Uint8Array<ArrayBuffer>; cabecera: CabeceraBackup }> {
  if (!passphrase) throw new ErrorBackup('passphrase', 'La contraseña no puede estar vacía.')

  const iteraciones = opciones.iteraciones ?? ITERACIONES_PBKDF2
  const cabecera: CabeceraBackup = {
    formato: FORMATO_BACKUP,
    app: 'cuaderno-ef',
    esquema: opciones.esquema,
    creado: (opciones.creado ?? new Date()).toISOString(),
    registros: contar(tablas),
    kdf: { algoritmo: 'PBKDF2-SHA256', iteraciones },
    cifrado: 'AES-GCM',
  }

  const { aad } = componerPrefijo(cabecera)
  const salt = aleatorios(BYTES_SALT)
  const iv = aleatorios(BYTES_IV)
  const clave = await derivarClave(passphrase, salt, iteraciones)
  const cuerpo = await cifrar(clave, iv, aBytes(JSON.stringify({ tablas })), aad)

  const fichero = new Uint8Array(aad.length + salt.length + iv.length + cuerpo.length)
  fichero.set(aad, 0)
  fichero.set(salt, aad.length)
  fichero.set(iv, aad.length + salt.length)
  fichero.set(cuerpo, aad.length + salt.length + iv.length)
  return { fichero, cabecera }
}

interface Troceado {
  cabecera: CabeceraBackup
  aad: Uint8Array<ArrayBuffer>
  salt: Uint8Array<ArrayBuffer>
  iv: Uint8Array<ArrayBuffer>
  cuerpo: Uint8Array<ArrayBuffer>
}

function trocear(fichero: Uint8Array<ArrayBuffer>): Troceado {
  if (fichero.length < BYTES_MAGIA + BYTES_LONGITUD)
    throw new ErrorBackup('formato', 'El fichero está vacío o incompleto.')
  if (aTexto(fichero.subarray(0, BYTES_MAGIA)) !== MAGIA)
    throw new ErrorBackup('formato', 'Este fichero no es una copia de Cuaderno EF.')

  const vista = new DataView(fichero.buffer, fichero.byteOffset, fichero.byteLength)
  const longitud = vista.getUint32(BYTES_MAGIA, false)
  const finCabecera = BYTES_MAGIA + BYTES_LONGITUD + longitud
  // Sin cuerpo cifrado no hay backup: el mínimo es salt + IV + sello (16 B).
  if (fichero.length < finCabecera + BYTES_SALT + BYTES_IV + 16)
    throw new ErrorBackup('formato', 'El fichero está incompleto o dañado.')

  let cabecera: CabeceraBackup
  try {
    cabecera = JSON.parse(aTexto(fichero.subarray(BYTES_MAGIA + BYTES_LONGITUD, finCabecera)))
  } catch {
    throw new ErrorBackup('formato', 'La cabecera del fichero está dañada.')
  }
  if (typeof cabecera?.esquema !== 'number' || typeof cabecera?.creado !== 'string')
    throw new ErrorBackup('formato', 'La cabecera del fichero no tiene el formato esperado.')
  if (cabecera.formato > FORMATO_BACKUP)
    throw new ErrorBackup(
      'formato_futuro',
      `La copia usa el formato ${cabecera.formato} y esta versión de la app solo entiende hasta el ${FORMATO_BACKUP}. Actualiza la app.`,
    )

  return {
    cabecera,
    aad: fichero.slice(0, finCabecera),
    salt: fichero.slice(finCabecera, finCabecera + BYTES_SALT),
    iv: fichero.slice(finCabecera + BYTES_SALT, finCabecera + BYTES_SALT + BYTES_IV),
    cuerpo: fichero.slice(finCabecera + BYTES_SALT + BYTES_IV),
  }
}

/**
 * Lee la cabecera sin descifrar nada. Sirve para enseñar el resumen del fichero
 * ANTES de pedir la passphrase.
 *
 * Ojo: por sí sola no demuestra nada — solo el descifrado la autentica.
 */
export function leerCabecera(fichero: Uint8Array<ArrayBuffer>): CabeceraBackup {
  return trocear(fichero).cabecera
}

export async function abrir(fichero: Uint8Array<ArrayBuffer>, passphrase: string): Promise<BackupAbierto> {
  const { cabecera, aad, salt, iv, cuerpo } = trocear(fichero)

  const clave = await derivarClave(passphrase, salt, cabecera.kdf?.iteraciones ?? ITERACIONES_PBKDF2)
  let claro: Uint8Array<ArrayBuffer>
  try {
    claro = await descifrar(clave, iv, cuerpo, aad)
  } catch {
    // AES-GCM no puede distinguir «clave mala» de «bytes tocados»: un único
    // mensaje honesto para ambos casos.
    throw new ErrorBackup(
      'passphrase',
      'No se pudo abrir la copia: la contraseña es incorrecta o el fichero está dañado.',
    )
  }

  let contenido: { tablas?: Tablas }
  try {
    contenido = JSON.parse(aTexto(claro))
  } catch {
    throw new ErrorBackup('contenido', 'La copia se descifró pero su contenido no es legible.')
  }
  const tablas = contenido?.tablas
  if (!tablas || typeof tablas !== 'object' || Array.isArray(tablas))
    throw new ErrorBackup('contenido', 'La copia no contiene tablas.')
  for (const [nombre, filas] of Object.entries(tablas))
    if (!Array.isArray(filas))
      throw new ErrorBackup('contenido', `La tabla «${nombre}» de la copia está dañada.`)

  return { cabecera, tablas }
}

/** `cuaderno-ef-2026-07-24.enc` — la fecha delante para que ordene solo. */
export function nombreFicheroBackup(fecha: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
  const hora = `${dos(fecha.getHours())}${dos(fecha.getMinutes())}`
  return `cuaderno-ef-${dia}-${hora}.enc`
}
