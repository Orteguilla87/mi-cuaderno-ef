/**
 * Primitivas de cifrado (§1.4). Todo con la WebCrypto del propio navegador:
 * sin librerías de terceros, sin red y sin claves en el código.
 *
 * Aquí no se sabe nada de backups ni de la base: solo bytes.
 */

/** §1.4 exige ≥600.000 iteraciones. No bajar de aquí. */
export const ITERACIONES_PBKDF2 = 600_000
export const BYTES_SALT = 16
/** AES-GCM: 96 bits es el tamaño de nonce recomendado por la propia norma. */
export const BYTES_IV = 12

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

export function aBytes(texto: string): Uint8Array<ArrayBuffer> {
  return codificador.encode(texto)
}

export function aTexto(bytes: Uint8Array<ArrayBuffer>): string {
  return decodificador.decode(bytes)
}

/** Salt e IV nuevos en cada backup: reutilizarlos rompería AES-GCM. */
export function aleatorios(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function aBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  const s = atob(texto)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

async function materialDePassphrase(passphrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', aBytes(passphrase), 'PBKDF2', false, [
    'deriveKey',
    'deriveBits',
  ])
}

/** Clave AES-GCM de 256 bits derivada de la passphrase. */
export async function derivarClave(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iteraciones: number = ITERACIONES_PBKDF2,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    await materialDePassphrase(passphrase),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Bits derivados en crudo. Lo usa el hash del PIN, que no cifra nada. */
export async function derivarBits(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iteraciones: number = ITERACIONES_PBKDF2,
  bits = 256,
): Promise<Uint8Array<ArrayBuffer>> {
  const derivados = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    await materialDePassphrase(passphrase),
    bits,
  )
  return new Uint8Array<ArrayBuffer>(derivados)
}

/**
 * `aad` (datos autenticados sin cifrar) permite meter la cabecera en claro del
 * fichero dentro del sello de integridad: tocar la cabecera invalida el
 * descifrado igual que tocar el cuerpo.
 */
export async function cifrar(
  clave: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  datos: Uint8Array<ArrayBuffer>,
  aad?: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, ...(aad ? { additionalData: aad } : {}) },
    clave,
    datos,
  )
  return new Uint8Array<ArrayBuffer>(cifrado)
}

/** Lanza si la passphrase es incorrecta o si un solo byte fue manipulado. */
export async function descifrar(
  clave: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  datos: Uint8Array<ArrayBuffer>,
  aad?: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, ...(aad ? { additionalData: aad } : {}) },
    clave,
    datos,
  )
  return new Uint8Array<ArrayBuffer>(claro)
}

/** Comparación sin fugas por tiempo, para el hash del PIN. */
export function igualesEnTiempoConstante(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i]
  return diferencia === 0
}
