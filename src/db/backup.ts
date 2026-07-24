/**
 * M9 — copia de seguridad cifrada de toda la base local.
 *
 * El backup es el ÚNICO artefacto donde viajan los campos sensibles (`apoyos`,
 * `notasPrivadas`, `nivelMotriz`): va cifrado de extremo a extremo con una
 * passphrase que solo conoce el usuario, y su destino es su propio dispositivo.
 * Los informes exportables siguen sin incluirlos (§1.6).
 */

import { db, ESQUEMA_ACTUAL } from './db'
import { guardarConfig } from './config'
import { DURACION_SESION_MIN, sumarMinutos } from '../lib/horas'
import {
  abrir,
  empaquetar,
  ErrorBackup,
  leerCabecera,
  nombreFicheroBackup,
  type CabeceraBackup,
  type Tablas,
} from '../lib/backup'

export { ErrorBackup, leerCabecera, nombreFicheroBackup, type CabeceraBackup }

/** Aviso de M9: si la última copia tiene más días que esto, se avisa. */
export const DIAS_AVISO_BACKUP = 7

// ——————————————————————————— migraciones ———————————————————————————

/**
 * Migraciones del CONTENIDO de un backup, espejo de los `upgrade()` de
 * `db.ts`. Hacen falta aparte porque los de Dexie solo se disparan al abrir la
 * base con una versión mayor, y aquí lo que llega es un JSON suelto.
 *
 * Solo aparecen las versiones que tocan datos: las que únicamente añaden
 * tablas o índices no necesitan nada (las tablas ausentes se rellenan vacías).
 */
interface Migracion {
  /** Versión a la que deja los datos. */
  hasta: number
  aplicar: (t: Tablas) => void
}

type Fila = Record<string, unknown>

const filas = (t: Tablas, nombre: string): Fila[] => (t[nombre] ?? []) as Fila[]

export const MIGRACIONES: Migracion[] = [
  {
    // Espejo de db.ts v2: trimestres/festivos en el curso, y la franja horaria
    // pasa de `hora` suelta a `horaInicio` + `horaFin`.
    hasta: 2,
    aplicar: (t) => {
      for (const c of filas(t, 'cursos')) {
        c.trimestres ??= []
        c.festivos ??= []
      }
      for (const g of filas(t, 'grupos')) {
        if (!Array.isArray(g.horario)) {
          g.horario = []
          continue
        }
        g.horario = (g.horario as Fila[]).map((f) => {
          if (typeof f.hora !== 'string') return f
          const { hora, ...resto } = f
          return { ...resto, horaInicio: hora, horaFin: sumarMinutos(hora, DURACION_SESION_MIN) }
        })
      }
    },
  },
  {
    // Espejo de db.ts v3.
    hasta: 3,
    aplicar: (t) => {
      for (const s of filas(t, 'sesiones')) {
        s.recursos ??= []
        s.juegos ??= []
      }
    },
  },
  {
    // Espejo de db.ts v4: límites del curso deducidos del nombre.
    hasta: 4,
    aplicar: (t) => {
      for (const c of filas(t, 'cursos')) {
        const anio = Number(String(c.nombre).split('-')[0])
        if (Number.isFinite(anio)) {
          c.inicio ??= `${anio}-09-01`
          c.fin ??= `${anio + 1}-06-30`
        }
      }
    },
  },
  {
    // Espejo de db.ts v7+v8: la clave primaria de `criterios` cambió de `codigo`
    // a un id compuesto. La tabla nunca llegó a tener datos reales y los
    // criterios se resiembran solos al arrancar, así que se descarta.
    hasta: 8,
    aplicar: (t) => {
      if (t.criterios) t.criterios = []
    },
  },
  {
    // Espejo de db.ts v11: el PIN dejó de guardarse en claro.
    hasta: 11,
    aplicar: (t) => {
      for (const c of filas(t, 'config')) if (typeof c.pin === 'string') delete c.pin
    },
  },
]

/** Aplica en orden las migraciones pendientes entre `desde` y ESQUEMA_ACTUAL. */
export function migrarTablas(tablas: Tablas, desde: number): Tablas {
  const migradas: Tablas = { ...tablas }
  for (const m of MIGRACIONES) if (desde < m.hasta) m.aplicar(migradas)
  return migradas
}

// ——————————————————————————— exportación ———————————————————————————

function nombresDeTablas(): string[] {
  return db.tables.map((t) => t.name)
}

/** Volcado completo, tabla a tabla, sin filtrar ningún campo. */
export async function volcarTablas(): Promise<Tablas> {
  const tablas: Tablas = {}
  for (const tabla of db.tables) tablas[tabla.name] = await tabla.toArray()
  return tablas
}

export async function contarRegistros(): Promise<Record<string, number>> {
  const conteo: Record<string, number> = {}
  for (const tabla of db.tables) conteo[tabla.name] = await tabla.count()
  return conteo
}

export interface BackupGenerado {
  fichero: Uint8Array<ArrayBuffer>
  nombre: string
  cabecera: CabeceraBackup
}

export async function exportarBackup(
  passphrase: string,
  ahora: Date = new Date(),
): Promise<BackupGenerado> {
  const tablas = await volcarTablas()
  const { fichero, cabecera } = await empaquetar(tablas, passphrase, {
    esquema: ESQUEMA_ACTUAL,
    creado: ahora,
  })
  return { fichero, nombre: nombreFicheroBackup(ahora), cabecera }
}

/** Se llama cuando el fichero ya está en manos del usuario, no antes. */
export async function registrarBackupHecho(cuando: Date = new Date()): Promise<void> {
  await guardarConfig({ ultimoBackup: cuando.toISOString() })
}

/** Días transcurridos desde la última copia; `null` si nunca se hizo ninguna. */
export function diasDesdeBackup(ultimoBackup: string | undefined, ahora = new Date()): number | null {
  if (!ultimoBackup) return null
  const fecha = new Date(ultimoBackup)
  if (Number.isNaN(fecha.getTime())) return null
  return Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000)
}

export function tocaAvisarDeBackup(ultimoBackup: string | undefined, ahora = new Date()): boolean {
  const dias = diasDesdeBackup(ultimoBackup, ahora)
  return dias === null || dias >= DIAS_AVISO_BACKUP
}

// ——————————————————————————— importación ———————————————————————————

export interface Cotejo {
  cabecera: CabeceraBackup
  /** Registros por tabla en la copia, ya migrados al esquema actual. */
  copia: Record<string, number>
  /** Registros por tabla ahora mismo en el dispositivo. */
  actual: Record<string, number>
  /** Versión del esquema de la copia frente a la de la app. */
  migra: boolean
}

/**
 * Lee la cabecera sin descifrar y la coteja con lo que hay en el dispositivo,
 * para que la pantalla pueda pedir confirmación con datos reales delante.
 */
export async function inspeccionarBackup(fichero: Uint8Array<ArrayBuffer>): Promise<Cotejo> {
  const cabecera = leerCabecera(fichero)
  comprobarEsquema(cabecera)
  return {
    cabecera,
    copia: cabecera.registros ?? {},
    actual: await contarRegistros(),
    migra: cabecera.esquema < ESQUEMA_ACTUAL,
  }
}

function comprobarEsquema(cabecera: CabeceraBackup): void {
  if (cabecera.esquema > ESQUEMA_ACTUAL)
    throw new ErrorBackup(
      'esquema_futuro',
      `La copia se hizo con una versión más nueva de la app (esquema ${cabecera.esquema}; esta entiende hasta el ${ESQUEMA_ACTUAL}). Actualiza la app antes de restaurarla.`,
    )
}

export interface ResultadoImport {
  cabecera: CabeceraBackup
  /** Registros escritos por tabla. */
  escritos: Record<string, number>
  migrado: boolean
}

/**
 * Restaura una copia. O entra entera o no entra nada: el borrado y la escritura
 * van en una única transacción Dexie, así que un fallo a mitad deja la base
 * exactamente como estaba.
 */
export async function restaurarBackup(
  fichero: Uint8Array<ArrayBuffer>,
  passphrase: string,
): Promise<ResultadoImport> {
  // 1. Descifrar. Si la passphrase falla o el fichero está tocado, se sale aquí
  //    sin haber mirado siquiera la base local.
  const { cabecera, tablas } = await abrir(fichero, passphrase)

  // 2. Versión. Posterior a la de la app → se rechaza; anterior → se migra.
  comprobarEsquema(cabecera)
  const migrado = cabecera.esquema < ESQUEMA_ACTUAL
  const migradas = migrarTablas(tablas, cabecera.esquema)

  // 3. Toda tabla de la copia debe existir aquí. Si no, algo no cuadra y es
  //    mejor no escribir nada que perder datos a medias.
  const conocidas = new Set(nombresDeTablas())
  for (const nombre of Object.keys(migradas))
    if (!conocidas.has(nombre))
      throw new ErrorBackup(
        'tabla_desconocida',
        `La copia contiene la tabla «${nombre}», que esta versión de la app no reconoce.`,
      )

  // 4. Sustitución atómica.
  const escritos: Record<string, number> = {}
  await db.transaction('rw', db.tables, async () => {
    for (const tabla of db.tables) await tabla.clear()
    for (const tabla of db.tables) {
      const filas = migradas[tabla.name]
      if (!filas?.length) {
        escritos[tabla.name] = 0
        continue
      }
      // `bulkAdd` sin `allKeys`: cualquier fila inválida (sin clave primaria,
      // por ejemplo) lanza y Dexie revierte la transacción entera.
      await tabla.bulkAdd(filas as never[])
      escritos[tabla.name] = filas.length
    }
  })

  return { cabecera, escritos, migrado }
}
