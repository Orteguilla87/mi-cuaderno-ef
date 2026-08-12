/**
 * Supresión del marcado de cambios.
 *
 * La sincronización (§11) considera «el maestro ha cambiado algo» cualquier
 * escritura en Dexie, porque escucha los hooks de todas las tablas. Eso vale
 * para las escrituras del usuario, pero no para las del propio sistema: la
 * siembra de los criterios oficiales al arrancar, la restauración de una copia
 * bajada del servidor o el sello de `ultimoBackup` son consecuencia de la
 * sincronización, no motivo para ella. Marcarlas provocaba dos cosas malas:
 *
 * - un conflicto falso en cada arranque (el dispositivo creía tener trabajo sin
 *   subir sin que nadie hubiera tocado nada), y
 * - en el peor caso, un bucle: sincronizar escribe, escribir pide sincronizar.
 *
 * Vive en su propio módulo, y no dentro del motor de sincronización, para que
 * quien siembra (`db/criterios.ts`) pueda envolver sus escrituras sin arrastrar
 * consigo Firestore, el store de la UI y el resto del motor.
 *
 * Es un contador y no un booleano porque dos operaciones internas pueden
 * solaparse; con un booleano, la primera en terminar levantaría la supresión de
 * la que sigue en marcha.
 */

let suprimidas = 0

/**
 * Ejecuta `accion` sin que sus escrituras cuenten como cambio del usuario.
 *
 * El `finally` no es decorativo: si la acción lanza —una semilla que no valida,
 * una restauración que falla a medias— la supresión tiene que caer igual. Una
 * supresión que se queda puesta es peor que no tenerla, porque a partir de ahí
 * el trabajo real del maestro deja de marcarse y no se sube nunca.
 *
 * El ámbito es toda la aplicación mientras dure la acción: una escritura del
 * usuario que caiga justo dentro de esa ventana tampoco se marca. Se acepta
 * porque las operaciones internas son cortas y ocurren al arrancar o durante
 * una restauración, cuando la pantalla no está en manos de nadie; y porque el
 * motor revalida el contenido real (`huella`) antes de declarar un conflicto,
 * así que una marca perdida se recupera en la siguiente pasada.
 */
export async function sinMarcar<T>(accion: () => T | Promise<T>): Promise<T> {
  suprimidas++
  try {
    return await accion()
  } finally {
    suprimidas--
  }
}

/** `true` mientras haya alguna operación interna en marcha. */
export function marcadoSuprimido(): boolean {
  return suprimidas > 0
}
