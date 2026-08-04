import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Config } from './types'

export const CONFIG_POR_DEFECTO: Config = {
  id: 'config',
  pesosTrimestres: [30, 30, 40],
  modoMedia: 'ponderada',
  bandasOficiales: { SU: 5, BI: 6, NT: 7, SB: 9 },
  bandaSobre: 'redondeada',
  modeloAgente: 'claude-haiku-4-5-20251001',
  modoPista: false,
  tema: 'sistema',
  quickTagsObservacion: ['esfuerzo', 'ayuda a otros', 'material', 'juego limpio', 'desconecta'],
  // Rojo (--accent), azul (--primary), amarillo (peto, único tono nuevo) y
  // verde (--positive): colores reales de petos de gimnasio.
  coloresPetos: ['#CE184B', '#006A80', '#B48C00', '#ABB200'],
  formatoNombre: 'apellidos-nombre',
  anchoColumnaAlumno: 'ancha',
}

export async function leerConfig(): Promise<Config> {
  const guardada = await db.config.get('config')
  return guardada ? { ...CONFIG_POR_DEFECTO, ...guardada } : CONFIG_POR_DEFECTO
}

// Cola de escritura: sin ella, dos `guardarConfig` disparados en rápida
// sucesión (p. ej. tecleando rápido) pueden leer el mismo `actual` antes de
// que el primero termine de escribir, y el segundo `put` pisa los cambios
// del primero — pérdida de caracteres.
let colaEscritura: Promise<void> = Promise.resolve()

export function guardarConfig(cambios: Partial<Config>): Promise<void> {
  colaEscritura = colaEscritura.then(async () => {
    const actual = await leerConfig()
    await db.config.put({ ...actual, ...cambios, id: 'config' })
  })
  return colaEscritura
}

/** Config reactiva. Devuelve los valores por defecto mientras carga. */
export function useConfig(): Config {
  return (
    useLiveQuery(async () => {
      const guardada = await db.config.get('config')
      return guardada ? { ...CONFIG_POR_DEFECTO, ...guardada } : CONFIG_POR_DEFECTO
    }, []) ?? CONFIG_POR_DEFECTO
  )
}
