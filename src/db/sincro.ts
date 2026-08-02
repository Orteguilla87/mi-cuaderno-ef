/**
 * Sincronización automática — el motor.
 *
 * Une tres cosas que por separado ya existían: el cifrado de M9, el estado por
 * dispositivo de `lib/sincroEstado.ts` y las decisiones puras de `lib/sincro.ts`.
 * Lo único que añade es el «cuándo».
 *
 * Reglas que no se rompen:
 *
 * - Al servidor solo sube el `.enc` YA cifrado, con el mismo `empaquetar()` de
 *   siempre. Sincronizar no cambia el cifrado.
 * - Lo que baja entra por `inspeccionarBackup` → `restaurarBackup`, el mismo
 *   camino que un fichero elegido a mano. Un blob manipulado falla en AES-GCM.
 * - Si los dos lados avanzaron, NO se fusiona: se para y pregunta.
 */

import { exportarBackup, inspeccionarBackup, restaurarBackup, volcarTablas } from './backup'
import { guardarConfig, leerConfig } from './config'
import { db } from './db'
import type { ConfigSincro } from './types'
import { firebaseConfigurado, firestore, idSincroValido } from '../lib/firebase'
import {
  decidir,
  esperaTrasFallo,
  huella,
  nombreDispositivo,
  reensamblar,
  trocear,
  type MetaRemota,
} from '../lib/sincro'
import {
  guardarEstado,
  leerEstado,
  olvidarEstado,
  type EstadoSincro,
} from '../lib/sincroEstado'
import { useSincro, type EstadoUI } from '../store/sincro'

/** Margen tras la última escritura antes de subir: evita subir tecla a tecla. */
export const MS_DEBOUNCE = 8_000

/** Campos de config que son de este dispositivo y no del que subió la copia. */
const CONSERVAR = ['pin', 'apiKey', 'webdav', 'sincro'] as const

export function sincroConfigurada(sincro: ConfigSincro | undefined): sincro is ConfigSincro {
  return !!sincro && idSincroValido(sincro.id) && !!sincro.passphrase && firebaseConfigurado()
}

export async function guardarConfigSincro(sincro: ConfigSincro | undefined): Promise<void> {
  const anterior = (await leerConfig()).sincro
  await guardarConfig({ sincro })
  // Cambiar de carpeta invalida todo lo que este dispositivo creía saber de la
  // anterior: si no se olvidara, se compararía la versión de una carpeta con la
  // de otra y saldría cualquier cosa.
  if (anterior?.id !== sincro?.id) {
    olvidarEstado()
    conflictoVivo = null
    yaPendiente = false
    yaConflicto = false
  }
  await arrancar()
}

/**
 * Espejo en memoria del estado guardado. Existe solo por rendimiento: el hook
 * de escritura lo consulta una vez por fila y no puede permitirse un
 * `JSON.parse` de `localStorage` cada vez.
 *
 * Todo cambio de estado pasa por `actualizar()` para que el espejo no pueda
 * quedarse desfasado respecto a lo guardado.
 */
let yaPendiente = leerEstado().pendiente
let yaConflicto = leerEstado().conflicto

function actualizar(cambios: Partial<EstadoSincro>): EstadoSincro {
  const siguiente = guardarEstado(cambios)
  yaPendiente = siguiente.pendiente
  yaConflicto = siguiente.conflicto
  return siguiente
}

export class ErrorSincro extends Error {
  constructor(
    readonly codigo: 'red' | 'permisos' | 'passphrase' | 'otro',
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorSincro'
  }
}

// ——————————————————————————— acceso a Firestore ———————————————————————————

async function refs(id: string) {
  const [bd, { collection, doc }] = await Promise.all([
    firestore(),
    import('firebase/firestore'),
  ])
  const meta = doc(bd, 'sync', id)
  return { bd, meta, partes: collection(meta, 'partes') }
}

/**
 * Traduce los fallos de Firestore a algo que se pueda enseñar y sobre lo que se
 * pueda decidir si reintentar. `permission-denied` casi siempre significa que
 * las reglas de `firestore.rules` no están publicadas: reintentarlo mil veces
 * no lo va a arreglar, así que se distingue del corte de red.
 */
function traducir(err: unknown): ErrorSincro {
  const codigo = (err as { code?: string })?.code ?? ''
  if (codigo === 'permission-denied')
    return new ErrorSincro(
      'permisos',
      'Firestore ha rechazado la petición. Comprueba que las reglas de seguridad están publicadas en la consola de Firebase y que el identificador tiene al menos 24 caracteres.',
    )
  if (codigo === 'unavailable' || codigo === 'deadline-exceeded' || !navigator.onLine)
    return new ErrorSincro('red', 'Sin conexión con el servidor. Se reintentará solo.')
  if (err instanceof ErrorSincro) return err
  return new ErrorSincro('otro', (err as Error)?.message ?? 'No se pudo sincronizar.')
}

async function leerMeta(id: string): Promise<MetaRemota | null> {
  const [{ meta }, { getDoc }] = await Promise.all([refs(id), import('firebase/firestore')])
  const instantanea = await getDoc(meta)
  return instantanea.exists() ? (instantanea.data() as MetaRemota) : null
}

// ——————————————————————————— subida ———————————————————————————

async function subir(sincro: ConfigSincro, previa: MetaRemota | null): Promise<void> {
  const tablas = await volcarTablas()
  const claro = new TextEncoder().encode(JSON.stringify({ tablas }))
  const huellaActual = await huella(claro)

  // Nada cambió de verdad. No se puede detectar comparando el `.enc` porque
  // cada cifrado usa salt e IV nuevos y los bytes siempre difieren.
  if (huellaActual === leerEstado().huellaSubida) {
    actualizar({ pendiente: false })
    return
  }

  const { fichero, cabecera } = await exportarBackup(sincro.passphrase)
  const partes = trocear(fichero)

  const [{ meta, partes: coleccion }, fs] = await Promise.all([
    refs(sincro.id),
    import('firebase/firestore'),
  ])

  // Las partes ANTES que la meta: quien lea solo actúa cuando la meta lo dice,
  // así que nunca ve una copia a medio subir.
  await Promise.all(
    partes.map((parte, i) =>
      fs.setDoc(fs.doc(coleccion, String(i)), { datos: fs.Bytes.fromUint8Array(parte) }),
    ),
  )

  const version = (previa?.version ?? 0) + 1
  await fs.setDoc(meta, {
    version,
    partes: partes.length,
    bytes: fichero.length,
    esquema: cabecera.esquema,
    creado: cabecera.creado,
    dispositivo: nombreDispositivo(),
    actualizado: fs.serverTimestamp(),
  })

  // Poda de las partes que sobran si la copia encogió. Va después de la meta:
  // borrarlas antes dejaría un hueco visible para un lector concurrente.
  for (let i = partes.length; i < (previa?.partes ?? 0); i++)
    await fs.deleteDoc(fs.doc(coleccion, String(i)))

  actualizar({
    versionAplicada: version,
    huellaSubida: huellaActual,
    pendiente: false,
    fallosSeguidos: 0,
  })
  await registrarSubida()
}

/** La sincronización cuenta como copia hecha: apaga el aviso semanal de M9. */
async function registrarSubida(): Promise<void> {
  sinMarcar(() => guardarConfig({ ultimoBackup: new Date().toISOString() }))
}

// ——————————————————————————— bajada ———————————————————————————

async function descargar(sincro: ConfigSincro, meta: MetaRemota): Promise<Uint8Array<ArrayBuffer>> {
  const [{ partes: coleccion }, fs] = await Promise.all([
    refs(sincro.id),
    import('firebase/firestore'),
  ])
  const trozos = await Promise.all(
    Array.from({ length: meta.partes }, (_, i) => fs.getDoc(fs.doc(coleccion, String(i)))),
  )
  const bytes = trozos.map((t, i) => {
    const datos = t.data()?.datos as { toUint8Array(): Uint8Array } | undefined
    if (!datos) throw new ErrorSincro('otro', `Falta la parte ${i + 1} de ${meta.partes} de la copia remota.`)
    return datos.toUint8Array()
  })
  const entero = reensamblar(bytes)
  if (entero.length !== meta.bytes)
    throw new ErrorSincro(
      'otro',
      'La copia remota llegó incompleta. No se ha tocado nada; se reintentará.',
    )
  return entero
}

async function bajar(sincro: ConfigSincro, meta: MetaRemota): Promise<void> {
  const fichero = await descargar(sincro, meta)

  // Mismo camino que un fichero elegido a mano: primero la cabecera (que valida
  // el formato y la versión de esquema), y solo después la escritura.
  await inspeccionarBackup(fichero)
  await sinMarcar(() =>
    restaurarBackup(fichero, sincro.passphrase, { conservar: [...CONSERVAR] }),
  )

  actualizar({ versionAplicada: meta.version, huellaSubida: null, pendiente: false, fallosSeguidos: 0 })
  // Cambiaron todas las tablas: recargar es lo único que garantiza que cada
  // pantalla parta de cero, igual que hace la restauración manual.
  window.location.reload()
}

// ——————————————————————————— resolución de conflictos ———————————————————————————

export interface Conflicto {
  meta: MetaRemota
  /** Fecha de la última escritura local conocida, para poder compararlas. */
  localCreado: string | undefined
}

let conflictoVivo: Conflicto | null = null
export function conflictoActual(): Conflicto | null {
  return conflictoVivo
}

/** Descarta lo local y se queda con lo del servidor. */
export async function resolverConLoRemoto(): Promise<void> {
  const sincro = (await leerConfig()).sincro
  if (!sincroConfigurada(sincro) || !conflictoVivo) return
  const meta = conflictoVivo.meta
  conflictoVivo = null
  actualizar({ conflicto: false, pendiente: false })
  await bajar(sincro, meta)
}

/** Descarta lo del servidor y sube lo de aquí encima. */
export async function resolverConLoLocal(): Promise<void> {
  const sincro = (await leerConfig()).sincro
  if (!sincroConfigurada(sincro) || !conflictoVivo) return
  // La versión remota se adopta como base para que la subida quede por encima
  // de ella y el otro dispositivo la vea como más nueva.
  actualizar({ versionAplicada: conflictoVivo.meta.version, conflicto: false, pendiente: true })
  conflictoVivo = null
  await ejecutar()
}

/** Baja la copia del servidor a un fichero, sin tocar nada. */
export async function descargarRemotaAFichero(): Promise<{ fichero: Uint8Array<ArrayBuffer>; meta: MetaRemota }> {
  const sincro = (await leerConfig()).sincro
  if (!sincroConfigurada(sincro) || !conflictoVivo)
    throw new ErrorSincro('otro', 'No hay ninguna copia remota pendiente.')
  return { fichero: await descargar(sincro, conflictoVivo.meta), meta: conflictoVivo.meta }
}

// ——————————————————————————— detección de cambios locales ———————————————————————————

/**
 * Contador de supresión. Mientras es > 0, las escrituras no cuentan como
 * «cambió algo»: son de la propia sincronización (la restauración de una copia
 * bajada, o el sello de `ultimoBackup`) y marcarlas provocaría un bucle.
 */
let suprimidas = 0

async function sinMarcar<T>(accion: () => T | Promise<T>): Promise<T> {
  suprimidas++
  try {
    return await accion()
  } finally {
    suprimidas--
  }
}

let temporizador: number | undefined

function marcarCambio(): void {
  if (suprimidas > 0) return
  // `yaPendiente` y `yaConflicto` son el espejo en memoria de `localStorage`:
  // este hook se dispara una vez POR FILA, y sembrar los criterios oficiales
  // inserta miles de golpe.
  if (!yaPendiente) actualizar({ pendiente: true })
  if (yaConflicto) return // parado a la espera de que el usuario elija
  window.clearTimeout(temporizador)
  temporizador = window.setTimeout(() => void ejecutar(), MS_DEBOUNCE)
}

let hooksPuestos = false

function observarEscrituras(): void {
  if (hooksPuestos) return
  hooksPuestos = true
  // Mismo recorrido de tablas que `volcarTablas`: un único punto y ninguna
  // tabla nueva se queda sin vigilar por olvido.
  for (const tabla of db.tables) {
    tabla.hook('creating', marcarCambio)
    tabla.hook('updating', marcarCambio)
    tabla.hook('deleting', marcarCambio)
  }
}

// ——————————————————————————— ciclo ———————————————————————————

function estado(e: EstadoUI, detalle?: string): void {
  useSincro.getState().poner(e, detalle)
}

let enMarcha = false

/** Una pasada completa: mira el servidor, decide y actúa. */
export async function ejecutar(): Promise<void> {
  if (enMarcha) return
  const sincro = (await leerConfig()).sincro
  if (!sincroConfigurada(sincro)) return estado('apagado')
  if (leerEstado().conflicto && conflictoVivo) return estado('conflicto')
  if (!navigator.onLine) return estado('sin_conexion')

  enMarcha = true
  estado('sincronizando')
  try {
    const meta = await leerMeta(sincro.id)
    const local = leerEstado()
    switch (decidir(meta, local)) {
      case 'subir':
        await subir(sincro, meta)
        break
      case 'bajar':
        await bajar(sincro, meta!)
        break
      case 'conflicto': {
        conflictoVivo = { meta: meta!, localCreado: (await leerConfig()).ultimoBackup }
        actualizar({ conflicto: true })
        estado('conflicto')
        return
      }
      case 'nada':
        break
    }
    window.clearTimeout(reintento)
    estado('sincronizado')
  } catch (err) {
    const traducido = traducir(err)
    const { fallosSeguidos } = actualizar({ fallosSeguidos: leerEstado().fallosSeguidos + 1 })
    estado(traducido.codigo === 'red' ? 'sin_conexion' : 'error', traducido.message)
    // Un fallo de permisos no se arregla insistiendo: hay que publicar las
    // reglas. Se deja para el ciclo periódico en vez de martillear el servidor.
    if (traducido.codigo !== 'permisos') programarReintento(esperaTrasFallo(fallosSeguidos))
  } finally {
    enMarcha = false
  }
}

// ——————————————————————————— Bloque 3: red ———————————————————————————

/** Ciclo de fondo. Solo hace algo si de verdad hay algo que subir o reintentar. */
export const MS_CICLO = 5 * 60_000

let reintento: number | undefined

function programarReintento(ms: number): void {
  window.clearTimeout(reintento)
  reintento = window.setTimeout(() => void ejecutar(), ms)
}

/** Sin trabajo pendiente no se toca la red: ni un `getDoc` de más. */
function hayTrabajo(): boolean {
  const { pendiente, fallosSeguidos, conflicto } = leerEstado()
  return !conflicto && (pendiente || fallosSeguidos > 0)
}

let escuchandoRed = false

function observarRed(): void {
  if (escuchandoRed) return
  escuchandoRed = true

  // Volver la red es la señal buena: se reintenta al momento, sin esperar al
  // ciclo. Los cambios hechos sin cobertura ya están en cola (`pendiente`).
  window.addEventListener('online', () => {
    actualizar({ fallosSeguidos: 0 })
    void ejecutar()
  })

  // Perderla no es un error: se dice y ya. Lo local sigue funcionando entero.
  window.addEventListener('offline', () => {
    window.clearTimeout(reintento)
    estado('sin_conexion')
  })

  // Volver a la app tras un rato en el bolsillo: los temporizadores de una
  // pestaña en segundo plano se estiran o se paran, así que conviene mirar.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && hayTrabajo()) void ejecutar()
  })

  window.setInterval(() => {
    if (!hayTrabajo() || !navigator.onLine || document.hidden) return
    void ejecutar()
  }, MS_CICLO)
}

let escuchando: (() => void) | null = null

/**
 * Se llama al arrancar la app y cada vez que cambia la configuración de
 * sincronización. Es idempotente.
 */
export async function arrancar(): Promise<void> {
  const sincro = (await leerConfig()).sincro
  escuchando?.()
  escuchando = null

  if (!sincroConfigurada(sincro)) return estado('apagado')

  observarEscrituras()
  observarRed()
  await ejecutar()

  // `onSnapshot` sobre el documento de meta —unos pocos campos— es una conexión
  // viva, no un sondeo: el otro dispositivo aparece al momento y sin preguntar
  // cada pocos segundos.
  const [{ meta }, { onSnapshot }] = await Promise.all([
    refs(sincro.id),
    import('firebase/firestore'),
  ])
  escuchando = onSnapshot(
    meta,
    (instantanea) => {
      const remota = instantanea.data() as MetaRemota | undefined
      if (remota && remota.version > leerEstado().versionAplicada) void ejecutar()
    },
    () => {
      /* la reconexión la lleva el propio SDK; el ciclo del Bloque 3 cubre el resto */
    },
  )
}
