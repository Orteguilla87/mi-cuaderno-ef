/**
 * Vitest corre en Node, sin IndexedDB. `db.ts` importa Dexie a nivel de módulo,
 * así que hace falta un IndexedDB de mentira ANTES de que ningún test importe
 * `../db/db`.
 */
import 'fake-indexeddb/auto'
