/**
 * Sincronización automática — la parte que se puede razonar sola.
 *
 * Aquí no hay Firestore ni Dexie, igual que `lib/webdav.ts` no sabe nada de la
 * base: solo bytes y decisiones. Toda la lógica que importa —cuándo subir,
 * cuándo bajar y, sobre todo, cuándo pararse porque hay conflicto— vive en
 * funciones puras que se pueden probar sin red y sin navegador.
 */

import { aBase64 } from './cripto'

/**
 * Firestore admite 1 MiB por documento. Se trocea bastante por debajo para
 * dejar sitio a la envoltura del propio documento y no vivir en el límite.
 */
export const BYTES_POR_PARTE = 700_000

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
}

/** Lo que este dispositivo sabe de la última sincronización que le salió bien. */
export interface EstadoLocal {
  /** Última `version` remota que se descargó y aplicó, o que se subió desde aquí. */
  versionAplicada: number
  /** Hay cambios locales sin subir. */
  pendiente: boolean
}

export type Accion = 'nada' | 'subir' | 'bajar' | 'conflicto'

/**
 * El corazón de todo esto.
 *
 * `conflicto` es el caso que no se puede resolver solo: los dos lados avanzaron
 * desde la última sincronización aplicada, y elegir por el usuario significaría
 * tirar trabajo suyo sin preguntar. No se fusiona nunca —fusionar dos volcados
 * completos de la base no es «juntar», es inventar— así que la app se para y
 * enseña las dos fechas.
 */
export function decidir(meta: MetaRemota | null, local: EstadoLocal): Accion {
  // Carpeta vacía: lo que haya aquí es lo único que existe.
  if (!meta) return local.pendiente ? 'subir' : 'nada'

  const remotoAvanza = meta.version > local.versionAplicada
  if (remotoAvanza && local.pendiente) return 'conflicto'
  if (remotoAvanza) return 'bajar'
  return local.pendiente ? 'subir' : 'nada'
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
