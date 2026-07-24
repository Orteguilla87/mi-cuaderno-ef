/**
 * PIN de acceso (§1.7). Lógica pura: validación, hash y verificación.
 *
 * Lo que el PIN hace: impedir que quien coja el móvil desbloqueado abra la app
 * y vea nombres, observaciones y notas.
 * Lo que el PIN NO hace: cifrar la base local. IndexedDB sigue en claro en el
 * disco del dispositivo. Para proteger los datos ante un robo del aparato están
 * el cifrado del propio sistema y el backup cifrado.
 */

import type { PinGuardado } from '../db/types'
import {
  aBase64,
  aleatorios,
  BYTES_SALT,
  deBase64,
  derivarBits,
  igualesEnTiempoConstante,
  ITERACIONES_PBKDF2,
} from './cripto'

export const LONGITUD_MIN_PIN = 4
export const LONGITUD_MAX_PIN = 6
/** §1.7: bloqueo tras 5 min de inactividad. */
export const MS_INACTIVIDAD = 5 * 60 * 1000

export function pinValido(pin: string): boolean {
  return (
    pin.length >= LONGITUD_MIN_PIN && pin.length <= LONGITUD_MAX_PIN && /^[0-9]+$/.test(pin)
  )
}

/**
 * Un PIN de 4–6 dígitos son como mucho un millón de combinaciones: el único
 * freno real ante alguien que copie la base es el coste del PBKDF2, así que se
 * usan las mismas 600.000 iteraciones que en el backup.
 */
export async function hashearPin(
  pin: string,
  salt: Uint8Array<ArrayBuffer> = aleatorios(BYTES_SALT),
  iteraciones: number = ITERACIONES_PBKDF2,
): Promise<PinGuardado> {
  const bits = await derivarBits(pin, salt, iteraciones)
  return { salt: aBase64(salt), hash: aBase64(bits), iteraciones }
}

export async function verificarPin(pin: string, guardado: PinGuardado): Promise<boolean> {
  const recalculado = await derivarBits(pin, deBase64(guardado.salt), guardado.iteraciones)
  return igualesEnTiempoConstante(recalculado, deBase64(guardado.hash))
}
