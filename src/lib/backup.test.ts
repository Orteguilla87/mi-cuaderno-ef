import { describe, expect, it } from 'vitest'
import {
  abrir,
  empaquetar,
  ErrorBackup,
  FORMATO_BACKUP,
  leerCabecera,
  MAGIA,
  nombreFicheroBackup,
} from './backup'
import { ITERACIONES_PBKDF2 } from './cripto'
import { datosEjemplo, ID_ALUMNO } from '../test/datosEjemplo'

const CLAVE = 'pista-mojada-2026'
/** Los tests no miden la fuerza del KDF, solo el formato: 1.000 basta y son rápidas. */
const RAPIDO = { esquema: 11, iteraciones: 1_000 }

describe('parámetros de cifrado', () => {
  it('usa al menos 600.000 iteraciones por defecto (§1.4)', () => {
    expect(ITERACIONES_PBKDF2).toBeGreaterThanOrEqual(600_000)
  })

  it('con los parámetros por defecto sella la cabecera con las iteraciones reales', async () => {
    const { cabecera } = await empaquetar({ cursos: [] }, CLAVE, { esquema: 11 })
    expect(cabecera.kdf).toEqual({ algoritmo: 'PBKDF2-SHA256', iteraciones: ITERACIONES_PBKDF2 })
    expect(cabecera.cifrado).toBe('AES-GCM')
  })
})

describe('ida y vuelta', () => {
  it('recupera las 24 tablas idénticas, incluidos los campos sensibles', async () => {
    const datos = datosEjemplo()
    const { fichero } = await empaquetar(datos, CLAVE, RAPIDO)
    const { tablas } = await abrir(fichero, CLAVE)

    expect(Object.keys(tablas).sort()).toEqual(Object.keys(datos).sort())
    expect(tablas).toEqual(datos)

    const alumna = (tablas.alumnos as Record<string, unknown>[]).find((a) => a.id === ID_ALUMNO)!
    expect(alumna.apoyos).toBe(datos.alumnos[0]!['apoyos' as never])
    expect(alumna.notasPrivadas).toBeTruthy()
    expect(alumna.nivelMotriz).toBe(4)
  })

  it('con la passphrase por defecto (600k iteraciones) también cierra el círculo', async () => {
    const datos = datosEjemplo()
    const { fichero } = await empaquetar(datos, CLAVE, { esquema: 11 })
    const { tablas, cabecera } = await abrir(fichero, CLAVE)
    expect(tablas.alumnos).toEqual(datos.alumnos)
    expect(cabecera.kdf.iteraciones).toBe(ITERACIONES_PBKDF2)
  })

  it('salt e IV son distintos en cada backup: dos copias iguales dan ficheros distintos', async () => {
    const datos = datosEjemplo()
    const creado = new Date('2026-07-24T10:00:00Z')
    const a = await empaquetar(datos, CLAVE, { ...RAPIDO, creado })
    const b = await empaquetar(datos, CLAVE, { ...RAPIDO, creado })
    expect(a.cabecera).toEqual(b.cabecera) // misma cabecera…
    expect(Array.from(a.fichero)).not.toEqual(Array.from(b.fichero)) // …y distinto cuerpo
  })
})

describe('cabecera en claro', () => {
  it('se lee sin passphrase y trae fecha, esquema y recuentos', async () => {
    const datos = datosEjemplo()
    const creado = new Date('2026-07-24T08:30:00Z')
    const { fichero } = await empaquetar(datos, CLAVE, { ...RAPIDO, creado })

    const cabecera = leerCabecera(fichero)
    expect(cabecera.formato).toBe(FORMATO_BACKUP)
    expect(cabecera.app).toBe('cuaderno-ef')
    expect(cabecera.esquema).toBe(11)
    expect(cabecera.creado).toBe(creado.toISOString())
    expect(cabecera.registros.alumnos).toBe(3)
    expect(cabecera.registros.asistencias).toBe(2)
  })

  it('no filtra ningún dato personal', async () => {
    const { fichero } = await empaquetar(datosEjemplo(), CLAVE, RAPIDO)
    const enClaro = new TextDecoder().decode(fichero)
    for (const secreto of ['Lucía', 'Ramírez', 'Óscar', 'apoyos', 'notasPrivadas', 'nivelMotriz'])
      expect(enClaro).not.toContain(secreto)
    expect(enClaro.startsWith(MAGIA)).toBe(true)
  })

  it('rechaza un contenedor de formato posterior sin intentar descifrarlo', async () => {
    const { fichero } = await empaquetar({ cursos: [] }, CLAVE, RAPIDO)
    // Se reescribe la cabecera declarando un formato futuro.
    const cabecera = leerCabecera(fichero)
    const json = new TextEncoder().encode(
      JSON.stringify({ ...cabecera, formato: FORMATO_BACKUP + 1 }),
    )
    const falso = new Uint8Array(8 + 4 + json.length)
    falso.set(new TextEncoder().encode(MAGIA), 0)
    new DataView(falso.buffer).setUint32(8, json.length, false)
    falso.set(json, 12)
    const completo = new Uint8Array(falso.length + 100)
    completo.set(falso, 0)

    expect(() => leerCabecera(completo)).toThrowError(
      expect.objectContaining({ codigo: 'formato_futuro' }),
    )
  })
})

describe('integridad', () => {
  it('un solo byte cambiado en el cuerpo invalida la copia', async () => {
    const { fichero } = await empaquetar(datosEjemplo(), CLAVE, RAPIDO)
    const tocado = fichero.slice()
    // Último byte: cae dentro del sello de autenticación de AES-GCM.
    tocado[tocado.length - 1] ^= 0x01

    await expect(abrir(tocado, CLAVE)).rejects.toThrowError(
      expect.objectContaining({ codigo: 'passphrase' }),
    )
  })

  it('un byte cambiado a mitad del texto cifrado también falla', async () => {
    const { fichero } = await empaquetar(datosEjemplo(), CLAVE, RAPIDO)
    const tocado = fichero.slice()
    tocado[Math.floor(tocado.length * 0.75)] ^= 0xff
    await expect(abrir(tocado, CLAVE)).rejects.toThrow(ErrorBackup)
  })

  it('manipular la cabecera en claro invalida el descifrado (va autenticada)', async () => {
    const datos = datosEjemplo()
    const { fichero } = await empaquetar(datos, CLAVE, RAPIDO)

    // Se falsea el recuento de alumnos manteniendo la longitud de la cabecera:
    // «"alumnos":3» → «"alumnos":9».
    const texto = new TextDecoder('latin1').decode(fichero)
    const posicion = texto.indexOf('"alumnos":3')
    expect(posicion).toBeGreaterThan(0)
    const tocado = fichero.slice()
    tocado[posicion + '"alumnos":'.length] = '9'.charCodeAt(0)

    // La cabecera mentirosa se lee (va en claro)…
    expect(leerCabecera(tocado).registros.alumnos).toBe(9)
    // …pero no se puede abrir: el sello no cuadra.
    await expect(abrir(tocado, CLAVE)).rejects.toThrowError(
      expect.objectContaining({ codigo: 'passphrase' }),
    )
  })

  it('rechaza un fichero que no es de la app', async () => {
    const basura = new TextEncoder().encode('esto no es un backup, es un CSV cualquiera')
    expect(() => leerCabecera(basura)).toThrowError(expect.objectContaining({ codigo: 'formato' }))
  })

  it('rechaza un fichero truncado', async () => {
    const { fichero } = await empaquetar(datosEjemplo(), CLAVE, RAPIDO)
    expect(() => leerCabecera(fichero.slice(0, 40))).toThrowError(
      expect.objectContaining({ codigo: 'formato' }),
    )
  })
})

describe('passphrase', () => {
  it('la incorrecta falla con un error claro y no devuelve nada', async () => {
    const { fichero } = await empaquetar(datosEjemplo(), CLAVE, RAPIDO)
    await expect(abrir(fichero, 'pista-mojada-2027')).rejects.toThrowError(
      expect.objectContaining({ codigo: 'passphrase' }),
    )
    await expect(abrir(fichero, '')).rejects.toThrow(ErrorBackup)
  })

  it('no se permite empaquetar sin passphrase', async () => {
    await expect(empaquetar({ cursos: [] }, '', RAPIDO)).rejects.toThrow(ErrorBackup)
  })
})

describe('nombre de fichero', () => {
  it('lleva la fecha delante y extensión .enc', () => {
    const nombre = nombreFicheroBackup(new Date(2026, 6, 24, 9, 5))
    expect(nombre).toBe('cuaderno-ef-2026-07-24-0905.enc')
  })
})
