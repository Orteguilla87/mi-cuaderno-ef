import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, ESQUEMA_ACTUAL } from './db'
import {
  contarRegistros,
  inspeccionarBackup,
  migrarTablas,
  restaurarBackup,
  exportarBackup,
  registrarBackupHecho,
  diasDesdeBackup,
  tocaAvisarDeBackup,
  DIAS_AVISO_BACKUP,
} from './backup'
import { leerConfig } from './config'
import { empaquetar, type Tablas } from '../lib/backup'
import { datosEjemplo, ID_ALUMNO, ID_CURSO, ID_GRUPO } from '../test/datosEjemplo'

const CLAVE = 'pista-mojada-2026'
const RAPIDO = { iteraciones: 1_000 }

async function vaciarBase() {
  await db.transaction('rw', db.tables, async () => {
    for (const tabla of db.tables) await tabla.clear()
  })
}

beforeEach(vaciarBase)
afterEach(vaciarBase)

describe('exportarBackup / restaurarBackup — ida y vuelta contra Dexie real', () => {
  it('exporta lo que hay en la base y lo restaura idéntico', async () => {
    const datos = datosEjemplo()
    await db.transaction('rw', db.tables, async () => {
      for (const tabla of db.tables) {
        const filas = datos[tabla.name]
        if (filas?.length) await tabla.bulkAdd(filas as never[])
      }
    })

    const { fichero, cabecera } = await exportarBackup(CLAVE)
    expect(cabecera.esquema).toBe(ESQUEMA_ACTUAL)
    expect(cabecera.registros.alumnos).toBe(3)

    await vaciarBase()
    expect(await db.alumnos.count()).toBe(0)

    const resultado = await restaurarBackup(fichero, CLAVE)
    expect(resultado.migrado).toBe(false)
    expect(resultado.escritos.alumnos).toBe(3)

    const alumna = await db.alumnos.get(ID_ALUMNO)
    expect(alumna?.apoyos).toBeTruthy()
    expect(alumna?.nivelMotriz).toBe(4)
    expect(await db.cursos.get(ID_CURSO)).toMatchObject({ nombre: '2026-2027' })
  })
})

describe('opción `conservar` — lo que no debe viajar entre dispositivos', () => {
  const PIN_LOCAL = { salt: 'sal-de-aqui', hash: 'hash-de-aqui', iteraciones: 1000 }
  const SINCRO_LOCAL = { id: 'a'.repeat(26), passphrase: 'la-de-aqui' }

  /** Copia de OTRO dispositivo: trae su propio PIN y su propia sincronización. */
  async function copiaAjena() {
    const datos = datosEjemplo()
    datos.config = [
      {
        id: 'config',
        pin: { salt: 'sal-ajena', hash: 'hash-ajeno', iteraciones: 1000 },
        sincro: { id: 'b'.repeat(26), passphrase: 'la-de-alli' },
        apiKey: 'sk-ant-ajena',
        modoPista: true,
      },
    ]
    return (await empaquetar(datos, CLAVE, { esquema: ESQUEMA_ACTUAL, ...RAPIDO })).fichero
  }

  beforeEach(async () => {
    await db.config.put({
      ...(await leerConfig()),
      id: 'config',
      pin: PIN_LOCAL,
      sincro: SINCRO_LOCAL,
      apiKey: 'sk-ant-de-aqui',
    })
  })

  it('sin la opción, la restauración manual trae la config de la copia tal cual', async () => {
    await restaurarBackup(await copiaAjena(), CLAVE)
    const config = await leerConfig()
    expect(config.pin?.hash).toBe('hash-ajeno')
    expect(config.sincro?.id).toBe('b'.repeat(26))
  })

  it('con la opción, el PIN y la sincronización siguen siendo los de este dispositivo', async () => {
    await restaurarBackup(await copiaAjena(), CLAVE, {
      conservar: ['pin', 'apiKey', 'webdav', 'sincro'],
    })
    const config = await leerConfig()
    expect(config.pin).toEqual(PIN_LOCAL)
    expect(config.sincro).toEqual(SINCRO_LOCAL)
    expect(config.apiKey).toBe('sk-ant-de-aqui')
    // Lo que NO se conserva sí entra: la copia manda en todo lo demás.
    expect(config.modoPista).toBe(true)
  })

  it('conservar un campo que aquí no existe lo deja ausente, no lo hereda', async () => {
    // Sin WebDAV local: heredar el del otro dispositivo sería colar
    // credenciales ajenas sin que nadie las haya escrito aquí.
    await restaurarBackup(await copiaAjena(), CLAVE, { conservar: ['webdav'] })
    expect((await leerConfig()).webdav).toBeUndefined()
  })

  it('si la copia no traía config, se conserva igual en vez de quedarse sin PIN', async () => {
    const datos = datosEjemplo()
    delete datos.config
    const { fichero } = await empaquetar(datos, CLAVE, { esquema: ESQUEMA_ACTUAL, ...RAPIDO })

    await restaurarBackup(fichero, CLAVE, { conservar: ['pin', 'sincro'] })
    const config = await leerConfig()
    expect(config.pin).toEqual(PIN_LOCAL)
    expect(config.sincro).toEqual(SINCRO_LOCAL)
  })
})

describe('passphrase incorrecta', () => {
  it('falla limpiamente y no toca la base local', async () => {
    await db.cursos.add(datosEjemplo().cursos[0] as never)
    const antes = await contarRegistros()

    const { fichero } = await empaquetar(datosEjemplo(), CLAVE, { esquema: ESQUEMA_ACTUAL, ...RAPIDO })
    await expect(restaurarBackup(fichero, 'contraseña-equivocada')).rejects.toThrowError(
      expect.objectContaining({ codigo: 'passphrase' }),
    )

    expect(await contarRegistros()).toEqual(antes)
  })
})

describe('import de un esquema anterior', () => {
  it('migra el horario (v2) y rellena recursos/juegos (v3) al restaurar', async () => {
    // Backup "antiguo": franja con `hora` suelta, curso sin trimestres/festivos,
    // sesión sin `recursos`/`juegos`. Tal cual saldría de un esquema v1.
    const tablasAntiguas: Tablas = {
      cursos: [{ id: ID_CURSO, nombre: '2025-2026', activo: true }],
      grupos: [
        {
          id: ID_GRUPO,
          cursoEscolarId: ID_CURSO,
          nombre: '3ºB',
          etapa: 'primaria',
          nivel: 3,
          color: '#006A80',
          orden: 1,
          horario: [{ diaSemana: 1, hora: '09:00' }],
        },
      ],
      sesiones: [{ id: 'sesion-1', grupoId: ID_GRUPO, fecha: '2025-09-15', titulo: 'Primera sesión' }],
    }

    const { fichero } = await empaquetar(tablasAntiguas, CLAVE, { esquema: 1, ...RAPIDO })

    const cotejo = await inspeccionarBackup(fichero)
    expect(cotejo.migra).toBe(true)
    expect(cotejo.cabecera.esquema).toBe(1)

    const resultado = await restaurarBackup(fichero, CLAVE)
    expect(resultado.migrado).toBe(true)

    const curso = await db.cursos.get(ID_CURSO)
    expect(curso?.trimestres).toEqual([])
    expect(curso?.festivos).toEqual([])
    // v4: límites deducidos del nombre "2025-2026".
    expect(curso?.inicio).toBe('2025-09-01')
    expect(curso?.fin).toBe('2026-06-30')

    const grupo = await db.grupos.get(ID_GRUPO)
    expect(grupo?.horario).toEqual([{ diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' }])

    const sesion = await db.sesiones.get('sesion-1')
    expect(sesion?.recursos).toEqual([])
    expect(sesion?.juegos).toEqual([])
  })

  it('mismo resultado vía migrarTablas() en aislado, sin pasar por Dexie', () => {
    const migradas = migrarTablas(
      { grupos: [{ id: 'g', horario: [{ diaSemana: 2, hora: '10:15' }] }] },
      1,
    )
    expect(migradas.grupos![0]).toEqual({
      id: 'g',
      horario: [{ diaSemana: 2, horaInicio: '10:15', horaFin: '11:00' }],
    })
  })
})

describe('esquema posterior al de la app', () => {
  it('rechaza el import sin intentar adivinar nada', async () => {
    const { fichero } = await empaquetar({ cursos: [] }, CLAVE, {
      esquema: ESQUEMA_ACTUAL + 1,
      ...RAPIDO,
    })
    await expect(restaurarBackup(fichero, CLAVE)).rejects.toThrowError(
      expect.objectContaining({ codigo: 'esquema_futuro' }),
    )
    await expect(inspeccionarBackup(fichero)).rejects.toThrowError(
      expect.objectContaining({ codigo: 'esquema_futuro' }),
    )
  })
})

describe('import fallido a mitad — atomicidad', () => {
  it('si una tabla revienta a mitad de la transacción, la base local queda intacta', async () => {
    // Estado actual: un curso y un grupo ya guardados.
    const datos = datosEjemplo()
    await db.cursos.add(datos.cursos[0] as never)
    await db.grupos.add(datos.grupos[0] as never)
    const antes = await contarRegistros()
    expect(antes.cursos).toBe(1)
    expect(antes.grupos).toBe(1)

    // Backup con dos alumnos que comparten id: `bulkAdd` debe reventar en la
    // tabla `alumnos`, que Dexie declara ANTES que `criterios` o `vinculos`
    // pero después de `cursos`/`grupos` — así se comprueba que el rollback
    // deshace también el `clear()` de las tablas anteriores.
    const tablasRotas: Tablas = {
      cursos: [{ id: 'otro-curso', nombre: '2030-2031', activo: true, inicio: '2030-09-01', fin: '2031-06-30', trimestres: [], festivos: [] }],
      alumnos: [
        { id: 'dup', grupoId: ID_GRUPO, nombre: 'A', apellidos: 'Uno', alias: 'A', activo: true },
        { id: 'dup', grupoId: ID_GRUPO, nombre: 'B', apellidos: 'Dos', alias: 'B', activo: true },
      ],
    }
    const { fichero } = await empaquetar(tablasRotas, CLAVE, { esquema: ESQUEMA_ACTUAL, ...RAPIDO })

    await expect(restaurarBackup(fichero, CLAVE)).rejects.toThrow()

    // Ni se ha vaciado `cursos`/`grupos`, ni ha entrado el `otro-curso` del backup roto.
    expect(await contarRegistros()).toEqual(antes)
    expect(await db.cursos.get('otro-curso')).toBeUndefined()
    expect((await db.cursos.toArray())[0]?.id).toBe(ID_CURSO)
  })
})

describe('tabla desconocida en el backup', () => {
  it('se rechaza en vez de escribir parcialmente', async () => {
    await db.cursos.add(datosEjemplo().cursos[0] as never)
    const antes = await contarRegistros()

    const { fichero } = await empaquetar(
      { cursos: [], tablaInventada: [{ id: 'x' }] },
      CLAVE,
      { esquema: ESQUEMA_ACTUAL, ...RAPIDO },
    )
    await expect(restaurarBackup(fichero, CLAVE)).rejects.toThrowError(
      expect.objectContaining({ codigo: 'tabla_desconocida' }),
    )
    expect(await contarRegistros()).toEqual(antes)
  })
})

describe('recordatorio semanal', () => {
  it('avisa si nunca hubo backup, y dentro/fuera de la ventana de 7 días', () => {
    expect(tocaAvisarDeBackup(undefined)).toBe(true)

    const ahora = new Date('2026-07-24T12:00:00Z')
    const hace3dias = new Date('2026-07-21T12:00:00Z').toISOString()
    const hace8dias = new Date('2026-07-16T12:00:00Z').toISOString()

    expect(diasDesdeBackup(hace3dias, ahora)).toBe(3)
    expect(tocaAvisarDeBackup(hace3dias, ahora)).toBe(false)
    expect(diasDesdeBackup(hace8dias, ahora)).toBe(DIAS_AVISO_BACKUP + 1)
    expect(tocaAvisarDeBackup(hace8dias, ahora)).toBe(true)
  })

  it('registrarBackupHecho() actualiza la config y silencia el aviso', async () => {
    expect(tocaAvisarDeBackup((await leerConfig()).ultimoBackup)).toBe(true)
    const ahora = new Date()
    await registrarBackupHecho(ahora)
    const config = await leerConfig()
    expect(config.ultimoBackup).toBe(ahora.toISOString())
    expect(tocaAvisarDeBackup(config.ultimoBackup)).toBe(false)
  })
})
