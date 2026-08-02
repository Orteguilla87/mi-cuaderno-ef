/**
 * Bloque 1 — alta de Firebase como transporte del `.enc` de M9.
 *
 * Firestore hace aquí exactamente el mismo papel que el WebDAV de §10: lleva de
 * un dispositivo a otro un fichero YA cifrado. No ve datos legibles, no ve la
 * passphrase y no puede colar nada — un blob manipulado falla en la
 * verificación AES-GCM al importarlo, igual que uno bajado del WebDAV.
 *
 * Dos decisiones que conviene no deshacer:
 *
 * 1. El SDK se importa de forma DINÁMICA. Son ~90 kB gz que no tienen por qué
 *    entrar en el arranque: un dispositivo sin ID de sincronización configurado
 *    no llega a descargarlos nunca, y la app sigue arrancando y funcionando
 *    entera sin red (§9).
 * 2. Solo `initializeApp` y `getFirestore`. Nada de Analytics: sería telemetría,
 *    y §1.1 la prohíbe.
 *
 * El bloque `firebaseConfig` no es un secreto —viaja dentro del bundle que se
 * publica en GitHub Pages, no hay forma de esconderlo— y por eso no protege
 * nada por sí mismo. Quien protege los datos son las reglas de `firestore.rules`
 * (hace falta conocer el ID de sincronización) y, por debajo, el cifrado.
 */

import type { Firestore } from 'firebase/firestore'

/**
 * Copiado literal de la consola de Firebase, menos `measurementId`: ese campo
 * es solo de Analytics, y Analytics aquí no existe.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBSdhTZXeVv2OlZKzFGHehivxWO7NGU5Pw',
  authDomain: 'cuadernoef.firebaseapp.com',
  projectId: 'cuadernoef',
  storageBucket: 'cuadernoef.firebasestorage.app',
  messagingSenderId: '500260665589',
  appId: '1:500260665589:web:99bd77bcab458209ca6dbc',
}

/** Red de seguridad por si alguna vez se despublica el bloque de arriba. */
export function firebaseConfigurado(): boolean {
  return Object.values(firebaseConfig).every(Boolean)
}

let instancia: Promise<Firestore> | null = null

/** Firestore, inicializado como mucho una vez por sesión. */
export function firestore(): Promise<Firestore> {
  instancia ??= (async () => {
    const [{ getApp, getApps, initializeApp }, { getFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
    ])
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    return getFirestore(app)
  })()
  return instancia
}

// ——————————————————————— ID de sincronización ———————————————————————

/**
 * El ID de sincronización ES la credencial: no hay cuentas ni sesiones, así que
 * lo único que impide a un tercero leer o escribir en la carpeta es no saberlo.
 * De ahí el mínimo de 24 caracteres, que es la misma condición que comprueba
 * `firestore.rules`: si se cambia una, hay que cambiar la otra.
 *
 * El alfabeto es el de base64url porque es lo que un id de documento de
 * Firestore admite sin escapar y lo que se puede teclear en un móvil sin pelearse.
 */
export const LONGITUD_MIN_ID_SINCRO = 24
export const LONGITUD_MAX_ID_SINCRO = 64
const ALFABETO_ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

export function idSincroValido(id: string): boolean {
  return new RegExp(`^[A-Za-z0-9_-]{${LONGITUD_MIN_ID_SINCRO},${LONGITUD_MAX_ID_SINCRO}}$`).test(id)
}

/** Motivo concreto del rechazo, para poder decirlo en la UI en vez de un «no vale». */
export function errorIdSincro(id: string): string | null {
  if (!id) return 'Escribe un identificador o genera uno.'
  if (id.length < LONGITUD_MIN_ID_SINCRO)
    return `Demasiado corto: ${id.length} de ${LONGITUD_MIN_ID_SINCRO} caracteres mínimos. Es lo único que impide que otro entre en tu carpeta.`
  if (id.length > LONGITUD_MAX_ID_SINCRO)
    return `Demasiado largo: máximo ${LONGITUD_MAX_ID_SINCRO} caracteres.`
  if (!idSincroValido(id)) return 'Solo se admiten letras sin tilde, números, guion y guion bajo.'
  return null
}

/** 26 caracteres del alfabeto de arriba: 156 bits, imposible de acertar probando. */
export function nuevoIdSincro(longitud = 26): string {
  // 256 es múltiplo de 64, así que el módulo no sesga ningún carácter.
  const bytes = crypto.getRandomValues(new Uint8Array(longitud))
  return Array.from(bytes, (b) => ALFABETO_ID[b & 63]).join('')
}
