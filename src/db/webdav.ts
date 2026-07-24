/**
 * Bloque 1 — el `.enc` de M9 va y viene de un servidor WebDAV propio.
 *
 * Regla que no se rompe: al servidor solo sube el fichero YA cifrado por M9.
 * La passphrase no viaja, no se guarda y no se deriva de las credenciales del
 * servidor. Quien controle el servidor obtiene bytes opacos.
 *
 * Lo que baja del servidor pasa exactamente por el mismo camino que un fichero
 * elegido a mano: `inspeccionarBackup` → confirmación → `restaurarBackup`. Un
 * fichero remoto manipulado falla en la verificación AES-GCM igual que uno
 * local, así que el servidor no puede colar datos.
 */

import { exportarBackup, registrarBackupHecho } from './backup'
import { guardarConfig, leerConfig } from './config'
import type { ConfigWebdav } from './types'
import {
  ClienteWebdav,
  ErrorWebdav,
  hayCopiaMasNueva,
  type CopiaRemota,
  type CredencialesWebdav,
} from '../lib/webdav'

export { ErrorWebdav, type CopiaRemota }

/** `true` si hay servidor configurado con lo mínimo para intentar hablarle. */
export function webdavConfigurado(webdav: ConfigWebdav | undefined): webdav is ConfigWebdav {
  return !!webdav?.url && !!webdav.usuario
}

function credenciales(webdav: ConfigWebdav): CredencialesWebdav {
  return { url: webdav.url, usuario: webdav.usuario, password: webdav.password }
}

async function clienteDesdeConfig(): Promise<ClienteWebdav> {
  const { webdav } = await leerConfig()
  if (!webdavConfigurado(webdav))
    throw new ErrorWebdav('url', 'No hay ningún servidor WebDAV configurado.')
  return new ClienteWebdav(credenciales(webdav))
}

/** Comprueba credenciales y carpeta. No transfiere ningún backup. */
export async function probarConexion(webdav: ConfigWebdav): Promise<void> {
  await new ClienteWebdav(credenciales(webdav)).probar()
}

export async function listarCopias(): Promise<CopiaRemota[]> {
  return (await clienteDesdeConfig()).listar()
}

/**
 * Cifra la base con la passphrase y sube el resultado. Es el mismo fichero que
 * genera «Backup ahora»: mismo formato, misma passphrase, misma cabecera.
 */
export async function subirBackup(passphrase: string): Promise<{ nombre: string }> {
  const cliente = await clienteDesdeConfig()
  const ahora = new Date()
  const { fichero, nombre } = await exportarBackup(passphrase, ahora)
  await cliente.subir(nombre, fichero)
  // Solo cuenta como copia hecha si el servidor la aceptó.
  await registrarBackupHecho(ahora)
  return { nombre }
}

/** Descarga una copia. NO la restaura: eso exige confirmación explícita (M9). */
export async function bajarBackup(nombre: string): Promise<Uint8Array<ArrayBuffer>> {
  return (await clienteDesdeConfig()).bajar(nombre)
}

export interface EstadoRemoto {
  copias: CopiaRemota[]
  /** Hay en el servidor una copia posterior a la última hecha aquí. */
  hayMasNueva: boolean
}

/**
 * Estado del servidor para pintarlo en Ajustes: qué copias hay y si alguna es
 * posterior a la última de este dispositivo (el aviso «el móvil va por delante
 * del PC»).
 */
export async function estadoRemoto(): Promise<EstadoRemoto> {
  const config = await leerConfig()
  const copias = await listarCopias()
  return { copias, hayMasNueva: hayCopiaMasNueva(copias, config.ultimoBackup) }
}

export async function guardarConfigWebdav(webdav: ConfigWebdav | undefined): Promise<void> {
  await guardarConfig({ webdav })
}
