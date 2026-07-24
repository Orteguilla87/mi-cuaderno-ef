import { describe, expect, it, vi } from 'vitest'
import {
  cabeceraAuth,
  ClienteWebdav,
  copiasDeHrefs,
  ErrorWebdav,
  fechaDeNombre,
  hayCopiaMasNueva,
  hrefsDeRespuesta,
  unirRuta,
  validarUrl,
} from './webdav'
import { empaquetar, leerCabecera, nombreFicheroBackup } from './backup'
import { datosEjemplo } from '../test/datosEjemplo'

const CREDS = {
  url: 'https://nube.example/dav/cuaderno',
  usuario: 'maestro',
  password: 'contraseña-larga',
}

/** Respuesta PROPFIND realista: prefijo `d:`, rutas completas y ruido ajeno. */
const PROPFIND_NEXTCLOUD = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/dav/cuaderno/</d:href></d:response>
  <d:response><d:href>/dav/cuaderno/cuaderno-ef-2026-07-20-0800.enc</d:href></d:response>
  <d:response><d:href>/dav/cuaderno/cuaderno-ef-2026-07-24-0905.enc</d:href></d:response>
  <d:response><d:href>/dav/cuaderno/fotos-excursion.zip</d:href></d:response>
</d:multistatus>`

describe('validarUrl', () => {
  it('acepta https y localhost', () => {
    expect(() => validarUrl('https://nube.example/dav')).not.toThrow()
    expect(() => validarUrl('http://localhost:8080/dav')).not.toThrow()
  })

  it('rechaza http remoto: Basic auth viajaría en claro', () => {
    expect(() => validarUrl('http://nube.example/dav')).toThrowError(
      expect.objectContaining({ codigo: 'url' }),
    )
  })

  it('rechaza una URL que no lo es', () => {
    expect(() => validarUrl('no-es-una-url')).toThrowError(
      expect.objectContaining({ codigo: 'url' }),
    )
  })
})

describe('cabeceraAuth', () => {
  it('codifica en UTF-8: una contraseña con acentos no revienta', () => {
    const cabecera = cabeceraAuth('maestro', 'contraseña-larga')
    expect(cabecera.startsWith('Basic ')).toBe(true)
    // btoa() a secas lanzaría con la «ñ»; comprobamos el descifrado de vuelta.
    const descodificada = new TextDecoder().decode(
      Uint8Array.from(atob(cabecera.slice(6)), (c) => c.charCodeAt(0)),
    )
    expect(descodificada).toBe('maestro:contraseña-larga')
  })
})

describe('unirRuta', () => {
  it('no duplica ni pierde barras', () => {
    expect(unirRuta('https://n.example/dav', 'a.enc')).toBe('https://n.example/dav/a.enc')
    expect(unirRuta('https://n.example/dav/', 'a.enc')).toBe('https://n.example/dav/a.enc')
    expect(unirRuta('https://n.example/dav///', 'a.enc')).toBe('https://n.example/dav/a.enc')
  })
})

describe('hrefsDeRespuesta', () => {
  it('lee los href sea cual sea el prefijo de espacio de nombres', () => {
    expect(hrefsDeRespuesta('<d:href>/a</d:href>')).toEqual(['/a'])
    expect(hrefsDeRespuesta('<D:href>/b</D:href>')).toEqual(['/b'])
    expect(hrefsDeRespuesta('<href>/c</href>')).toEqual(['/c'])
    expect(hrefsDeRespuesta('<lp1:href>/d</lp1:href>')).toEqual(['/d'])
  })

  it('devuelve vacío si no hay ninguno', () => {
    expect(hrefsDeRespuesta('<d:multistatus></d:multistatus>')).toEqual([])
  })
})

describe('fechaDeNombre', () => {
  it('entiende el nombre que genera la propia app', () => {
    const nombre = nombreFicheroBackup(new Date(2026, 6, 24, 9, 5))
    expect(fechaDeNombre(nombre)).toEqual(new Date(2026, 6, 24, 9, 5))
  })

  it('descarta lo que no sea un backup de esta app', () => {
    expect(fechaDeNombre('fotos.zip')).toBeNull()
    expect(fechaDeNombre('cuaderno-ef.enc')).toBeNull()
    expect(fechaDeNombre('otra-app-2026-07-24-0905.enc')).toBeNull()
  })
})

describe('copiasDeHrefs', () => {
  it('filtra lo ajeno y ordena de la más reciente a la más antigua', () => {
    const copias = copiasDeHrefs(hrefsDeRespuesta(PROPFIND_NEXTCLOUD))
    expect(copias.map((c) => c.nombre)).toEqual([
      'cuaderno-ef-2026-07-24-0905.enc',
      'cuaderno-ef-2026-07-20-0800.enc',
    ])
  })

  it('descodifica nombres escapados por el servidor', () => {
    const copias = copiasDeHrefs(['/dav/cuaderno-ef-2026-07-24-0905%2Eenc'])
    expect(copias[0]?.nombre).toBe('cuaderno-ef-2026-07-24-0905.enc')
  })
})

describe('hayCopiaMasNueva', () => {
  const copias = copiasDeHrefs(hrefsDeRespuesta(PROPFIND_NEXTCLOUD))

  it('avisa si nunca se hizo copia en este dispositivo', () => {
    expect(hayCopiaMasNueva(copias, undefined)).toBe(true)
  })

  it('avisa solo si la del servidor es posterior a la local', () => {
    expect(hayCopiaMasNueva(copias, new Date(2026, 6, 22).toISOString())).toBe(true)
    expect(hayCopiaMasNueva(copias, new Date(2026, 6, 25).toISOString())).toBe(false)
  })

  it('sin copias en el servidor no hay nada que avisar', () => {
    expect(hayCopiaMasNueva([], undefined)).toBe(false)
  })
})

describe('ClienteWebdav', () => {
  function respuesta(cuerpo: BodyInit, init: ResponseInit = {}) {
    return new Response(cuerpo, { status: 200, ...init })
  }

  it('manda Basic auth y Depth al listar', async () => {
    const hacerFetch = vi.fn().mockResolvedValue(respuesta(PROPFIND_NEXTCLOUD))
    const copias = await new ClienteWebdav(CREDS, hacerFetch).listar()

    expect(copias).toHaveLength(2)
    const [url, init] = hacerFetch.mock.calls[0]
    expect(url).toBe(CREDS.url)
    expect(init.method).toBe('PROPFIND')
    expect(init.headers.Depth).toBe('1')
    expect(init.headers.Authorization).toBe(cabeceraAuth(CREDS.usuario, CREDS.password))
  })

  it('sube exactamente los bytes cifrados, y siguen siendo un backup válido', async () => {
    const { fichero } = await empaquetar(datosEjemplo(), 'pista-mojada-2026', {
      esquema: 12,
      iteraciones: 1_000,
    })
    const hacerFetch = vi.fn().mockResolvedValue(respuesta(''))

    await new ClienteWebdav(CREDS, hacerFetch).subir('cuaderno-ef-2026-07-24-0905.enc', fichero)

    const [url, init] = hacerFetch.mock.calls[0]
    expect(url).toBe(`${CREDS.url}/cuaderno-ef-2026-07-24-0905.enc`)
    expect(init.method).toBe('PUT')

    // Lo enviado es byte a byte el fichero cifrado…
    const enviado = new Uint8Array(init.body)
    expect(Array.from(enviado)).toEqual(Array.from(fichero))
    // …y sigue siendo legible como backup, así que el round-trip no lo corrompe.
    expect(leerCabecera(enviado).app).toBe('cuaderno-ef')
  })

  it('lo que sube al servidor no contiene ningún nombre en claro', async () => {
    const { fichero } = await empaquetar(datosEjemplo(), 'pista-mojada-2026', {
      esquema: 12,
      iteraciones: 1_000,
    })
    const hacerFetch = vi.fn().mockResolvedValue(respuesta(''))
    await new ClienteWebdav(CREDS, hacerFetch).subir('c.enc', fichero)

    const enviado = new TextDecoder().decode(new Uint8Array(hacerFetch.mock.calls[0][1].body))
    for (const secreto of ['Lucía', 'Ramírez', 'apoyos', 'notasPrivadas'])
      expect(enviado).not.toContain(secreto)
  })

  it('baja el fichero tal cual', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const hacerFetch = vi.fn().mockResolvedValue(respuesta(bytes))
    const bajado = await new ClienteWebdav(CREDS, hacerFetch).bajar('c.enc')
    expect(Array.from(bajado)).toEqual([1, 2, 3, 4])
  })

  it('traduce 401 a un error de credenciales', async () => {
    const hacerFetch = vi.fn().mockResolvedValue(respuesta('', { status: 401 }))
    await expect(new ClienteWebdav(CREDS, hacerFetch).probar()).rejects.toThrowError(
      expect.objectContaining({ codigo: 'credenciales' }),
    )
  })

  it('traduce 404 a carpeta inexistente', async () => {
    const hacerFetch = vi.fn().mockResolvedValue(respuesta('', { status: 404 }))
    await expect(new ClienteWebdav(CREDS, hacerFetch).listar()).rejects.toThrowError(
      expect.objectContaining({ codigo: 'no_encontrado' }),
    )
  })

  it('un fetch que revienta (CORS) se explica como problema de red', async () => {
    const hacerFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await new ClienteWebdav(CREDS, hacerFetch).probar().catch((e) => e)
    expect(error).toBeInstanceOf(ErrorWebdav)
    expect(error.codigo).toBe('red')
    expect(error.message).toContain('CORS')
  })

  it('no se construye con una URL insegura', () => {
    expect(() => new ClienteWebdav({ ...CREDS, url: 'http://nube.example/dav' })).toThrowError(
      expect.objectContaining({ codigo: 'url' }),
    )
  })
})
