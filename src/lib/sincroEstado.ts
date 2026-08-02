/**
 * Lo que este dispositivo concreto sabe de la sincronización.
 *
 * Vive en `localStorage` y NO en Dexie, a propósito y por dos razones:
 *
 * 1. No debe viajar dentro del backup. «Qué versión apliqué yo» es distinto en
 *    el móvil y en el PC; si viajara, al importar una copia del móvil el PC
 *    heredaría los marcadores del móvil y creería estar al día sin estarlo.
 * 2. Escribir aquí no despierta a los hooks de Dexie, así que llevar la cuenta
 *    de la sincronización no cuenta como «el usuario cambió algo» y no se monta
 *    un bucle de subidas.
 */

const CLAVE = 'cuaderno-ef.sincro'

export interface EstadoSincro {
  /** Última `version` remota aplicada aquí, o subida desde aquí. 0 = ninguna. */
  versionAplicada: number
  /** Huella del último volcado que se subió con éxito. */
  huellaSubida: string | null
  /** Hay cambios locales sin subir. */
  pendiente: boolean
  /**
   * ISO 8601 del momento en que empezaron los cambios que aún no han subido.
   *
   * Existe solo para la tarjeta de conflicto: sin esto, el lado local no tenía
   * ninguna fecha que enseñar (`ultimoBackup` puede no existir, por ejemplo
   * justo después de importar una copia) y la comparación —que es TODO lo que
   * la tarjeta ofrece— se quedaba en «desconocida» frente a una fecha real.
   */
  ultimaEscritura: string | null
  /** Fallos de red seguidos, para el retroceso exponencial del Bloque 3. */
  fallosSeguidos: number
  /**
   * ISO 8601 de la última vez que se sincronizó con éxito (subir, bajar o
   * confirmar que ya estaba al día). Es lo que se le enseña al maestro en
   * Ajustes; se guarda aquí para que sobreviva a la recarga tras bajar una copia.
   */
  ultimaSincro: string | null
  /**
   * Conflicto ya detectado y aún sin resolver. Se guarda para que no reaparezca
   * como sorpresa en cada arranque y para no seguir intentando subir encima.
   */
  conflicto: boolean
}

export const ESTADO_INICIAL: EstadoSincro = {
  versionAplicada: 0,
  huellaSubida: null,
  pendiente: false,
  ultimaEscritura: null,
  fallosSeguidos: 0,
  conflicto: false,
  ultimaSincro: null,
}

export function leerEstado(): EstadoSincro {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return { ...ESTADO_INICIAL }
    // Se mezcla con el inicial para que añadir un campo nuevo no rompa a quien
    // ya tenga el anterior guardado.
    return { ...ESTADO_INICIAL, ...(JSON.parse(crudo) as Partial<EstadoSincro>) }
  } catch {
    // localStorage bloqueado o JSON corrupto: se empieza de cero. Lo peor que
    // puede pasar es una subida de más, nunca una pérdida de datos.
    return { ...ESTADO_INICIAL }
  }
}

export function guardarEstado(cambios: Partial<EstadoSincro>): EstadoSincro {
  const siguiente = { ...leerEstado(), ...cambios }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(siguiente))
  } catch {
    // Sin localStorage la sincronización funciona igual dentro de la sesión;
    // solo se pierde la memoria entre recargas.
  }
  return siguiente
}

export function olvidarEstado(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    /* nada que hacer */
  }
}
