/**
 * Cliente WebDAV mínimo (Bloque 1). Transporta ficheros `.enc` YA cifrados por
 * M9: el servidor recibe bytes opacos y nunca la passphrase, así que la
 * garantía de §1.4 se mantiene aunque el servidor sea de un tercero.
 *
 * Solo se usan cuatro verbos: PROPFIND (listar), PUT (subir), GET (bajar) y
 * OPTIONS (probar la conexión). Nada de bibliotecas: `fetch` y poco más.
 *
 * Este módulo no sabe nada de Dexie ni de React; se puede probar entero
 * inyectando un `fetch` de mentira.
 */

import { aBase64, aBytes } from './cripto'

export type CodigoErrorWebdav =
  /** La URL no es válida o no es https. */
  | 'url'
  /** Usuario o contraseña rechazados (401/403). */
  | 'credenciales'
  /** La carpeta no existe en el servidor (404). */
  | 'no_encontrado'
  /** El servidor contestó, pero con un error inesperado. */
  | 'servidor'
  /**
   * No hubo respuesta. En un navegador esto casi siempre es CORS, no que el
   * servidor esté caído: hay que habilitarlo en el servidor.
   */
  | 'red'

export class ErrorWebdav extends Error {
  constructor(
    readonly codigo: CodigoErrorWebdav,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorWebdav'
  }
}

export interface CredencialesWebdav {
  /** URL de la carpeta remota, p. ej. https://nube.example/remote.php/dav/files/yo/cuaderno */
  url: string
  usuario: string
  password: string
}

// ——————————————————————————— utilidades puras ———————————————————————————

/**
 * Une una base con un nombre de fichero sin duplicar ni perder barras.
 * El nombre se escapa: los backups llevan solo [a-z0-9-.] pero no cuesta nada.
 */
export function unirRuta(base: string, nombre: string): string {
  const limpia = base.replace(/\/+$/, '')
  return `${limpia}/${encodeURIComponent(nombre)}`
}

/**
 * Solo https (o localhost para pruebas). Basic auth manda usuario y contraseña
 * en cada petición: sobre http viajarían en claro por la red del centro.
 */
export function validarUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ErrorWebdav('url', 'La dirección del servidor no es una URL válida.')
  }
  const esLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol !== 'https:' && !esLocal)
    throw new ErrorWebdav(
      'url',
      'La dirección debe empezar por https:// — con http, tu usuario y contraseña viajarían en claro.',
    )
}

/**
 * Cabecera Basic. Vía `aBytes` (UTF-8) en vez de `btoa` directo, porque `btoa`
 * revienta con cualquier acento en la contraseña.
 */
export function cabeceraAuth(usuario: string, password: string): string {
  return `Basic ${aBase64(aBytes(`${usuario}:${password}`))}`
}

/**
 * Saca los `href` de una respuesta PROPFIND.
 *
 * Con expresión regular y no con DOMParser a propósito: el prefijo de espacio
 * de nombres cambia de un servidor a otro (`d:`, `D:`, `lp1:`, ninguno), aquí
 * solo hacen falta los href, y así el parser se puede probar en Node sin DOM.
 */
export function hrefsDeRespuesta(xml: string): string[] {
  const hrefs: string[] = []
  const re = /<(?:[a-zA-Z0-9]+:)?href\s*>([^<]*)<\/(?:[a-zA-Z0-9]+:)?href\s*>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const valor = m[1].trim()
    if (valor) hrefs.push(valor)
  }
  return hrefs
}

/** `cuaderno-ef-2026-07-24-0905.enc` → Date. `null` si no encaja el patrón. */
export function fechaDeNombre(nombre: string): Date | null {
  const m = /^cuaderno-ef-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.enc$/.exec(nombre)
  if (!m) return null
  const [, a, mes, d, h, min] = m
  const fecha = new Date(Number(a), Number(mes) - 1, Number(d), Number(h), Number(min))
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

export interface CopiaRemota {
  nombre: string
  fecha: Date
}

/**
 * Convierte los href de un PROPFIND en la lista de copias, de la más reciente
 * a la más antigua. Descarta lo que no sea un backup de esta app: en esa
 * carpeta puede haber cualquier otra cosa del usuario.
 */
export function copiasDeHrefs(hrefs: string[]): CopiaRemota[] {
  const copias: CopiaRemota[] = []
  for (const href of hrefs) {
    // El href puede ser una ruta completa del servidor; solo interesa el final.
    const ultimo = href.replace(/\/+$/, '').split('/').pop() ?? ''
    let nombre: string
    try {
      nombre = decodeURIComponent(ultimo)
    } catch {
      nombre = ultimo
    }
    const fecha = fechaDeNombre(nombre)
    if (fecha) copias.push({ nombre, fecha })
  }
  return copias.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

/**
 * ¿Hay en el servidor una copia posterior a la última hecha en este
 * dispositivo? Es el aviso de «el móvil tiene datos más nuevos que el PC».
 */
export function hayCopiaMasNueva(
  copias: CopiaRemota[],
  ultimoBackupLocal: string | undefined,
): boolean {
  const masNueva = copias[0]
  if (!masNueva) return false
  if (!ultimoBackupLocal) return true
  const local = new Date(ultimoBackupLocal)
  if (Number.isNaN(local.getTime())) return true
  return masNueva.fecha.getTime() > local.getTime()
}

// ——————————————————————————— cliente ———————————————————————————

function traducirEstado(estado: number, contexto: string): ErrorWebdav {
  if (estado === 401 || estado === 403)
    return new ErrorWebdav('credenciales', 'Usuario o contraseña incorrectos.')
  if (estado === 404)
    return new ErrorWebdav('no_encontrado', 'No existe esa carpeta en el servidor.')
  return new ErrorWebdav('servidor', `El servidor respondió ${estado} al ${contexto}.`)
}

/**
 * Un fallo de `fetch` sin respuesta, en un navegador, casi nunca es «servidor
 * caído»: es CORS. Merece un mensaje que diga qué hacer, porque el usuario no
 * lo va a deducir de «Failed to fetch».
 */
function errorDeRed(): ErrorWebdav {
  return new ErrorWebdav(
    'red',
    'No se pudo contactar con el servidor. Comprueba la dirección y que el servidor permita el acceso desde esta app (CORS).',
  )
}

export class ClienteWebdav {
  constructor(
    private readonly credenciales: CredencialesWebdav,
    private readonly hacerFetch: typeof fetch = fetch,
  ) {
    validarUrl(credenciales.url)
  }

  private cabeceras(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: cabeceraAuth(this.credenciales.usuario, this.credenciales.password),
      ...extra,
    }
  }

  private async pedir(url: string, init: RequestInit, contexto: string): Promise<Response> {
    let respuesta: Response
    try {
      respuesta = await this.hacerFetch(url, init)
    } catch {
      throw errorDeRed()
    }
    if (!respuesta.ok) throw traducirEstado(respuesta.status, contexto)
    return respuesta
  }

  /** Comprueba credenciales y carpeta sin transferir ningún backup. */
  async probar(): Promise<void> {
    await this.pedir(
      this.credenciales.url,
      { method: 'PROPFIND', headers: this.cabeceras({ Depth: '0' }) },
      'conectar',
    )
  }

  async listar(): Promise<CopiaRemota[]> {
    const respuesta = await this.pedir(
      this.credenciales.url,
      { method: 'PROPFIND', headers: this.cabeceras({ Depth: '1' }) },
      'listar las copias',
    )
    return copiasDeHrefs(hrefsDeRespuesta(await respuesta.text()))
  }

  async subir(nombre: string, fichero: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.pedir(
      unirRuta(this.credenciales.url, nombre),
      {
        method: 'PUT',
        headers: this.cabeceras({ 'Content-Type': 'application/octet-stream' }),
        // `slice()` para pasar un ArrayBuffer propio y exacto: el buffer de la
        // vista puede ser mayor que los bytes del fichero.
        body: fichero.slice().buffer,
      },
      'subir la copia',
    )
  }

  async bajar(nombre: string): Promise<Uint8Array<ArrayBuffer>> {
    const respuesta = await this.pedir(
      unirRuta(this.credenciales.url, nombre),
      { method: 'GET', headers: this.cabeceras() },
      'descargar la copia',
    )
    return new Uint8Array<ArrayBuffer>(await respuesta.arrayBuffer())
  }
}
