/**
 * Sincronización automática — parte que toca la base local.
 *
 * Bloque 1: solo la configuración. El motor (detección de cambios, subida,
 * bajada y conflicto) llega en el Bloque 2.
 */

import { guardarConfig } from './config'
import type { ConfigSincro } from './types'
import { firebaseConfigurado, idSincroValido } from '../lib/firebase'

/** `true` si hay lo mínimo para sincronizar: ID válido, passphrase y proyecto dado de alta. */
export function sincroConfigurada(sincro: ConfigSincro | undefined): sincro is ConfigSincro {
  return !!sincro && idSincroValido(sincro.id) && !!sincro.passphrase && firebaseConfigurado()
}

export async function guardarConfigSincro(sincro: ConfigSincro | undefined): Promise<void> {
  await guardarConfig({ sincro })
}
