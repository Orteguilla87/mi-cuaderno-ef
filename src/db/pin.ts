/** Almacenamiento del PIN (§1.7). Solo el hash llega a la base. */

import { guardarConfig, leerConfig } from './config'
import { hashearPin, pinValido, verificarPin } from '../lib/pin'

export async function hayPin(): Promise<boolean> {
  return !!(await leerConfig()).pin
}

export async function definirPin(pin: string): Promise<void> {
  if (!pinValido(pin)) throw new Error('El PIN debe tener entre 4 y 6 dígitos.')
  await guardarConfig({ pin: await hashearPin(pin) })
}

export async function comprobarPin(pin: string): Promise<boolean> {
  const guardado = (await leerConfig()).pin
  if (!guardado) return true
  return verificarPin(pin, guardado)
}

/** Quitar el PIN exige demostrar que se conoce. */
export async function quitarPin(pinActual: string): Promise<boolean> {
  if (!(await comprobarPin(pinActual))) return false
  await guardarConfig({ pin: undefined })
  return true
}
