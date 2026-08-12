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

import { ErrorBackup, exportarBackup, inspeccionarBackup, restaurarBackup, volcarTablas } from './backup'
import { guardarConfig, leerConfig } from './config'
import { db } from './db'
import type { ConfigSincro } from './types'
import { firebaseConfigurado, firestore, idSincroValido } from '../lib/firebase'
import {
  canarioCoincide,
  crearCanario,
  decidir,
  esperaTrasFallo,
  huella,
  nombreDispositivo,
  reensamblar,
  selloDeCanario,
  trocear,
  type MetaRemota,
} from '../lib/sincro'
import {
  guardarEstado,
  leerEstado,
  olvidarEstado,
  type EstadoSincro,
} from '../lib/sincroEstado'
import { marcadoSuprimido, sinMarcar } from './supresion'
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
  if (anterior?.id !== sincro?.id) olvidarSincro()
  // Cambiar la contraseña invalida el «ya comprobé que este canario abre»: el
  // canario es el mismo, pero la llave con la que se comprobó ya no.
  else if (anterior?.passphrase !== sincro?.passphrase) actualizar({ canarioOk: null })
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

/**
 * Borra todo lo que este dispositivo creía saber de una carpeta de
 * sincronización: lo guardado, el espejo en memoria y el conflicto vivo.
 *
 * Las tres cosas van juntas o no van: olvidar solo `localStorage` deja el
 * espejo diciendo «ya está marcado como pendiente», y a partir de ahí ninguna
 * escritura del maestro vuelve a marcarse.
 */
export function olvidarSincro(): void {
  olvidarEstado()
  conflictoVivo = null
  passphraseAjena = null
  yaPendiente = false
  yaConflicto = false
}

/**
 * Causas de fallo que el maestro necesita distinguir, porque la salida de cada
 * una es distinta: esperar (`red`), publicar las reglas (`permisos`), volver a
 * intentarlo (`incompleta`) o resolver la divergencia de contraseña
 * (`passphrase`). Un «no se pudo» genérico no le dice qué hacer.
 */
export type CodigoErrorSincro = 'red' | 'permisos' | 'passphrase' | 'incompleta' | 'otro'

export class ErrorSincro extends Error {
  constructor(
    readonly codigo: CodigoErrorSincro,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorSincro'
  }
}

// ——————————————————————————— acceso a Firestore ———————————————————————————

async function refs(id: string) {
  const [bd, fs] = await Promise.all([firestore(), import('firebase/firestore')])
  const meta = fs.doc(bd, 'sync', id)
  return { fs, meta, partes: fs.collection(meta, 'partes') }
}

/**
 * Traduce los fallos de Firestore a algo que se pueda enseñar y sobre lo que se
 * pueda decidir si reintentar. `permission-denied` casi siempre significa que
 * las reglas de `firestore.rules` no están publicadas: reintentarlo mil veces
 * no lo va a arreglar, así que se distingue del corte de red.
 */
function traducir(err: unknown): ErrorSincro {
  // Lo primero, lo ya clasificado: un fallo de descifrado sigue siendo un fallo
  // de descifrado aunque además se haya ido la cobertura, y meterlo en «red»
  // haría que la app prometiera reintentarlo solo, que es justo lo que no puede
  // arreglarlo.
  if (err instanceof ErrorSincro) return err
  if (err instanceof ErrorBackup && err.codigo === 'passphrase')
    return new ErrorSincro(
      'passphrase',
      'Los datos guardados en la nube se cifraron con otra contraseña, y con la de este dispositivo no se pueden abrir. No se ha tocado nada.',
    )
  if (err instanceof ErrorBackup) return new ErrorSincro('otro', err.message)

  const codigo = (err as { code?: string })?.code ?? ''
  if (codigo === 'permission-denied')
    return new ErrorSincro(
      'permisos',
      'Firestore ha rechazado la petición. Comprueba que las reglas de seguridad están publicadas en la consola de Firebase y que el identificador tiene al menos 24 caracteres.',
    )
  if (codigo === 'unavailable' || codigo === 'deadline-exceeded' || !navigator.onLine)
    return new ErrorSincro('red', 'Sin conexión con el servidor. Se reintentará solo.')
  return new ErrorSincro('otro', (err as Error)?.message ?? 'No se pudo sincronizar.')
}

async function leerMeta(id: string): Promise<MetaRemota | null> {
  const { fs, meta } = await refs(id)
  const instantanea = await fs.getDoc(meta)
  return instantanea.exists() ? (instantanea.data() as MetaRemota) : null
}

// ——————————————————————————— subida ———————————————————————————

/**
 * Huella del contenido local ahora mismo.
 *
 * Es la única medida honesta de «¿ha cambiado algo de verdad?». El `.enc` no
 * sirve —cada cifrado usa salt e IV nuevos— y el marcador `pendiente` es solo
 * un proxy: lo pone cualquier escritura, la haya provocado el maestro o no.
 */
async function huellaLocal(): Promise<string> {
  const tablas = await volcarTablas()
  return huella(new TextEncoder().encode(JSON.stringify({ tablas })))
}

async function subir(
  sincro: ConfigSincro,
  previa: MetaRemota | null,
  opciones: { forzar?: boolean } = {},
): Promise<void> {
  const huellaActual = await huellaLocal()

  // Nada cambió de verdad. No se puede detectar comparando el `.enc` porque
  // cada cifrado usa salt e IV nuevos y los bytes siempre difieren.
  //
  // `forzar` lo salta al resolver un conflicto: ahí el contenido local puede ser
  // idéntico al que se subió la última vez y aun así hay que subirlo, porque lo
  // que el maestro está diciendo es «pisa lo del servidor con esto».
  if (!opciones.forzar && huellaActual === leerEstado().huellaSubida) {
    actualizar({ pendiente: false, ultimaEscritura: null })
    return
  }

  const { fichero, cabecera } = await exportarBackup(sincro.passphrase)
  const partes = trocear(fichero)

  const { fs, meta, partes: coleccion } = await refs(sincro.id)

  // Las partes ANTES que la meta: quien lea solo actúa cuando la meta lo dice,
  // así que nunca ve una copia a medio subir.
  await Promise.all(
    partes.map((parte, i) =>
      fs.setDoc(fs.doc(coleccion, String(i)), { datos: fs.Bytes.fromUint8Array(parte) }),
    ),
  )

  // El canario va en la meta y no dentro del `.enc`: hay que poder comprobar la
  // contraseña SIN descargar ni descifrar la copia entera.
  const canario = await crearCanario(sincro.passphrase)
  const version = (previa?.version ?? 0) + 1
  await fs.setDoc(meta, {
    version,
    partes: partes.length,
    bytes: fichero.length,
    esquema: cabecera.esquema,
    creado: cabecera.creado,
    dispositivo: nombreDispositivo(),
    actualizado: fs.serverTimestamp(),
    canario,
  })
  // Lo que acaba de subir este dispositivo lo abre este dispositivo: no hace
  // falta volver a derivar la clave en la siguiente pasada para comprobarlo.
  actualizar({ canarioOk: canario.sello })

  // Poda de las partes que sobran si la copia encogió. Va después de la meta:
  // borrarlas antes dejaría un hueco visible para un lector concurrente.
  for (let i = partes.length; i < (previa?.partes ?? 0); i++)
    await fs.deleteDoc(fs.doc(coleccion, String(i)))

  // El sello de `ultimoBackup` va ANTES de fijar la huella, y no después: es
  // una escritura más en la base, así que hecha luego dejaría la huella
  // guardada describiendo un contenido que ya no es el de aquí, y la
  // revalidación de `ejecutar()` vería divergencia donde solo hay una fecha.
  await registrarSubida()
  actualizar({
    versionAplicada: version,
    huellaSubida: await huellaLocal(),
    pendiente: false,
    ultimaEscritura: null,
    fallosSeguidos: 0,
  })
}

/**
 * La sincronización cuenta como copia hecha: apaga el aviso semanal de M9.
 *
 * El `return` no sobra: sin él, la supresión se levantaba cuando le venía bien
 * al planificador de promesas, y cualquier cambio del maestro hecho en ese
 * hueco —justo después de subir— se perdía sin marcar y no volvía a subirse.
 */
function registrarSubida(): Promise<void> {
  return sinMarcar(() => guardarConfig({ ultimoBackup: new Date().toISOString() }))
}

// ——————————————————————————— bajada ———————————————————————————

async function descargar(sincro: ConfigSincro, meta: MetaRemota): Promise<Uint8Array<ArrayBuffer>> {
  const { fs, partes: coleccion } = await refs(sincro.id)
  const trozos = await Promise.all(
    Array.from({ length: meta.partes }, (_, i) => fs.getDoc(fs.doc(coleccion, String(i)))),
  )
  const bytes = trozos.map((t, i) => {
    const datos = t.data()?.datos as { toUint8Array(): Uint8Array } | undefined
    if (!datos)
      throw new ErrorSincro(
        'incompleta',
        `Falta el trozo ${i + 1} de ${meta.partes} de la copia del servidor. No se ha tocado nada.`,
      )
    return datos.toUint8Array()
  })
  const entero = reensamblar(bytes)
  if (entero.length !== meta.bytes)
    throw new ErrorSincro(
      'incompleta',
      'La copia del servidor llegó incompleta. No se ha tocado nada; puedes volver a intentarlo.',
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

  // La huella se recalcula, no se anula: acabamos de quedar en sincronía con el
  // servidor, así que este es el contenido de referencia contra el que medir si
  // más adelante ha cambiado algo de verdad. (No coincide con la huella que
  // calculó quien subió la copia, porque `conservar` deja aquí los campos de
  // config de este dispositivo; da igual: solo se compara contra huellas
  // locales.) Dejarla en `null` cegaba la revalidación de `ejecutar()` justo
  // después de bajar, que es cuando más falta hace.
  // Toda la limpieza de estado va AQUÍ, cuando la copia ya está dentro. Hecha
  // antes —como hacía la resolución de conflictos— un fallo a mitad dejaba el
  // dispositivo sin la marca de trabajo pendiente y con el conflicto sin
  // resolver: perdía la única pista de que había algo que subir.
  conflictoVivo = null
  actualizar({
    versionAplicada: meta.version,
    huellaSubida: await huellaLocal(),
    pendiente: false,
    ultimaEscritura: null,
    fallosSeguidos: 0,
    conflicto: false,
  })
  // Sellar ANTES de recargar: la marca queda en localStorage y sobrevive al
  // reinicio, así que al volver a arrancar se enseña la fecha correcta.
  marcarSincronizadoAhora()
  // Cambiaron todas las tablas: recargar es lo único que garantiza que cada
  // pantalla parta de cero, igual que hace la restauración manual.
  window.location.reload()
}

// ——————————————————————————— ¿hay algo aquí? ———————————————————————————

/**
 * `true` si esta base tiene trabajo del maestro dentro.
 *
 * Bastan los grupos: alumnos, sesiones, asistencias y notas cuelgan todos de
 * ellos, así que sin grupos no hay nada que perder. Contar todas las tablas no
 * serviría — `criterios` y `config` se siembran solas al arrancar y nunca están
 * vacías, así que darían «con datos» hasta en un dispositivo recién instalado.
 */
async function baseConDatos(): Promise<boolean> {
  return (await db.grupos.count()) > 0
}

async function resumenLocal(): Promise<{ grupos: number; alumnos: number }> {
  return { grupos: await db.grupos.count(), alumnos: await db.alumnos.count() }
}

// ——————————————————————— divergencia de contraseña ———————————————————————

/**
 * La contraseña de este dispositivo no abre lo que hay en la nube.
 *
 * Pasa porque la contraseña se teclea en cada dispositivo (Ajustes) y nadie la
 * cotejaba nunca: subir funcionaba desde los dos, pero bajar solo funcionaba en
 * el que había cifrado. La divergencia no converge sola —al restaurar se
 * conserva a propósito el bloque `sincro` de este dispositivo— así que hay que
 * verla y resolverla a mano.
 */
let passphraseAjena: MetaRemota | null = null

export function divergenciaPassphrase(): MetaRemota | null {
  return passphraseAjena
}

/**
 * Comprueba el canario de la copia remota contra la contraseña de aquí.
 *
 * El resultado se recuerda por sello: repetir 600.000 iteraciones de PBKDF2 en
 * cada pasada, cada cinco minutos y en un móvil, sería gastar batería para
 * volver a confirmar lo mismo.
 */
async function contrasenaAbreLaNube(sincro: ConfigSincro, meta: MetaRemota): Promise<boolean> {
  const sello = selloDeCanario(meta.canario)
  if (sello && sello === leerEstado().canarioOk) return true
  const coincide = await canarioCoincide(meta.canario, sincro.passphrase)
  actualizar({ canarioOk: coincide ? sello : null })
  return coincide
}

/**
 * Adopta la contraseña con la que se cifró la copia de la nube.
 *
 * Se valida ANTES de tocar nada y contra el canario, no descargando el blob
 * entero: si no es esa, no se ha gastado ni una descarga ni se ha sustituido la
 * contraseña local. Nunca se cambia en silencio.
 */
export async function adoptarPassphraseRemota(passphrase: string): Promise<void> {
  const config = await leerConfig()
  const sincro = config.sincro
  if (!sincroConfigurada(sincro) || !passphraseAjena)
    throw new ErrorSincro('otro', 'No hay ninguna copia remota que abrir.')
  if (!passphrase) throw new ErrorSincro('passphrase', 'Escribe la contraseña.')

  if (!(await canarioCoincide(passphraseAjena.canario, passphrase)))
    throw new ErrorSincro(
      'passphrase',
      'Esa contraseña tampoco abre los datos de la nube. No se ha cambiado nada.',
    )

  await sinMarcar(() => guardarConfig({ sincro: { ...sincro, passphrase } }))
  actualizar({ canarioOk: selloDeCanario(passphraseAjena.canario) })
  passphraseAjena = null
  await ejecutar()
}

/**
 * Pisa la nube con lo de este dispositivo, cifrado con la contraseña de aquí.
 *
 * Es la única salida cuando la contraseña remota no se recuerda: lo que hay en
 * la nube no se puede abrir desde aquí, ni ahora ni nunca, así que o se queda
 * ahí sin servir a nadie o se sustituye. Lo pide el maestro explícitamente,
 * avisado de que la copia de la nube se pierde.
 */
export async function sobrescribirNubeConLoLocal(): Promise<void> {
  const sincro = (await leerConfig()).sincro
  if (!sincroConfigurada(sincro) || !passphraseAjena)
    throw new ErrorSincro('otro', 'No hay ninguna copia remota que sustituir.')
  const previa = passphraseAjena
  const antes = leerEstado()

  return conCerrojo(async () => {
    try {
      // La versión remota se adopta como base para que esta subida quede por
      // encima y el otro dispositivo la vea como más nueva.
      actualizar({ versionAplicada: previa.version })
      await subir(sincro, previa, { forzar: true })
      passphraseAjena = null
      marcarSincronizadoAhora()
      estado('sincronizado')
    } catch (err) {
      // Misma regla que en el conflicto: si falla, el estado vuelve al de antes
      // y el aviso sigue en pie.
      actualizar(antes)
      passphraseAjena = previa
      const traducido = traducir(err)
      estado('passphrase', traducido.message)
      throw traducido
    }
  })
}

// ——————————————————————————— resolución de conflictos ———————————————————————————

export interface Conflicto {
  meta: MetaRemota
  /**
   * Desde cuándo hay trabajo local sin subir. Es la mitad local de la única
   * comparación que la tarjeta de conflicto puede ofrecer, así que se cae a
   * `ultimoBackup` antes que quedarse sin fecha.
   */
  localDesde: string | undefined
  /**
   * Este dispositivo nunca sincronizó y ya tenía datos. La tarjeta necesita
   * saberlo porque aquí no hay dos fechas que comparar: hay una base entera
   * que jamás se ha subido, y lo que dice algo es cuánto hay dentro.
   */
  primeraVez: boolean
  resumenLocal: { grupos: number; alumnos: number }
}

let conflictoVivo: Conflicto | null = null
export function conflictoActual(): Conflicto | null {
  return conflictoVivo
}

/**
 * Ejecuta una resolución de conflicto sin dejar el estado a medias.
 *
 * Regla: **no se limpia nada hasta que la resolución ha terminado bien**. Si
 * falla —se fue la cobertura, la copia llegó incompleta, la contraseña no
 * abre— el estado vuelve exactamente al que había, el conflicto sigue vivo y
 * el maestro puede volver a elegir. Lo contrario, que era lo que hacía antes
 * `resolverConLoRemoto`, borraba la marca de trabajo local sin subirlo a
 * ninguna parte y dejaba el conflicto sin resolver: lo peor de los dos mundos.
 */
async function resolver(accion: (sincro: ConfigSincro, conflicto: Conflicto) => Promise<void>): Promise<void> {
  const sincro = (await leerConfig()).sincro
  if (!sincroConfigurada(sincro) || !conflictoVivo) return
  const conflicto = conflictoVivo
  const antes = leerEstado()

  return conCerrojo(async () => {
    try {
      await accion(sincro, conflicto)
    } catch (err) {
      // `actualizar` con el estado entero: se restaura tal cual estaba, campo a
      // campo, sin depender de acordarse de cuáles tocó la acción fallida.
      actualizar(antes)
      conflictoVivo = conflicto
      const traducido = traducir(err)
      estado('conflicto', traducido.message)
      throw traducido
    }
  })
}

/** Descarta lo local y se queda con lo del servidor. */
export async function resolverConLoRemoto(): Promise<void> {
  // `bajar` limpia el conflicto al final, cuando la copia ya está dentro.
  return resolver((sincro, conflicto) => bajar(sincro, conflicto.meta))
}

/** Descarta lo del servidor y sube lo de aquí encima. */
export async function resolverConLoLocal(): Promise<void> {
  return resolver(async (sincro, conflicto) => {
    // La versión remota se adopta como base para que la subida quede por encima
    // de ella y el otro dispositivo la vea como más nueva.
    actualizar({ versionAplicada: conflicto.meta.version })
    // `forzar`: el contenido local puede coincidir con el de la última subida y
    // aun así hay que subirlo, porque el servidor ha avanzado por encima.
    await subir(sincro, conflicto.meta, { forzar: true })
    conflictoVivo = null
    actualizar({ conflicto: false })
    marcarSincronizadoAhora()
    estado('sincronizado')
  })
}

/** Baja la copia del servidor a un fichero, sin tocar nada. */
export async function descargarRemotaAFichero(): Promise<{ fichero: Uint8Array<ArrayBuffer>; meta: MetaRemota }> {
  const sincro = (await leerConfig()).sincro
  if (!sincroConfigurada(sincro) || !conflictoVivo)
    throw new ErrorSincro('otro', 'No hay ninguna copia remota pendiente.')
  const meta = conflictoVivo.meta
  try {
    return { fichero: await descargar(sincro, meta), meta }
  } catch (err) {
    throw traducir(err)
  }
}

// ——————————————————————————— detección de cambios locales ———————————————————————————

let temporizador: number | undefined

function marcarCambio(): void {
  // Las escrituras internas —siembra de criterios, restauración de una copia
  // bajada, sello de `ultimoBackup`— no son trabajo del maestro. El contador
  // vive en `db/supresion.ts` para que quien siembra pueda envolverlas sin
  // importar este módulo entero.
  if (marcadoSuprimido()) return
  // `yaPendiente` y `yaConflicto` son el espejo en memoria de `localStorage`:
  // este hook se dispara una vez POR FILA, y sembrar los criterios oficiales
  // inserta miles de golpe.
  // La marca de tiempo se pone al ENTRAR en «pendiente», no en cada fila: lo
  // que interesa contarle al usuario es desde cuándo tiene trabajo sin subir.
  if (!yaPendiente) actualizar({ pendiente: true, ultimaEscritura: new Date().toISOString() })
  if (yaConflicto) return // parado a la espera de que el usuario elija
  window.clearTimeout(temporizador)
  temporizador = window.setTimeout(() => void ejecutar(), MS_DEBOUNCE)
}

let hooksPuestos = false

/** Exportada solo para poder probar el marcado sin montar la app entera. */
export function observarEscrituras(): void {
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

/**
 * Sella «ahora» como última sincronización con éxito, en el estado persistido y
 * en el store visible. Se llama al terminar una pasada que no falló —subir,
 * bajar o confirmar que ya estaba al día—; sobrevive a la recarga tras bajar
 * porque queda también en `localStorage`.
 */
function marcarSincronizadoAhora(): void {
  const iso = new Date().toISOString()
  actualizar({ ultimaSincro: iso })
  useSincro.setState({ ultimaSincro: iso })
}

let enMarcha = false

/**
 * Cerrojo de una sola pasada. Se echa ANTES del primer `await`, no después:
 * puesto más abajo no cerraba nada —dos llamadas podían colarse las dos— y una
 * subida propia despierta al `onSnapshot`, que vuelve a entrar antes de que el
 * marcador local se haya actualizado. El resultado era la app peleándose
 * consigo misma y declarando un conflicto contra su propia copia recién subida.
 *
 * Lo comparten la pasada automática y las resoluciones de conflicto: sin eso,
 * el ciclo de fondo podía arrancar justo mientras el maestro estaba resolviendo.
 */
async function conCerrojo<T>(accion: () => Promise<T>): Promise<T> {
  if (enMarcha)
    throw new ErrorSincro(
      'otro',
      'Hay una sincronización en marcha. Espera un momento y vuelve a intentarlo.',
    )
  enMarcha = true
  try {
    return await accion()
  } finally {
    enMarcha = false
  }
}

/** Una pasada completa: mira el servidor, decide y actúa. */
export async function ejecutar(): Promise<void> {
  if (enMarcha) return
  enMarcha = true
  try {
    const sincro = (await leerConfig()).sincro
    if (!sincroConfigurada(sincro)) return estado('apagado')
    if (leerEstado().conflicto && conflictoVivo) return estado('conflicto')
    if (!navigator.onLine) return estado('sin_conexion')

    estado('sincronizando')
    const meta = await leerMeta(sincro.id)

    // Antes de decidir nada: ¿abre siquiera esta contraseña lo que hay ahí?
    // Bajar sería descargar y reensamblar medio megabyte para estrellarse al
    // descifrarlo, y subir encima borraría del servidor unos datos que aquí no
    // se pueden ni leer. Las dos salidas las tiene que elegir el maestro.
    if (meta && !(await contrasenaAbreLaNube(sincro, meta))) {
      passphraseAjena = meta
      return estado('passphrase')
    }
    passphraseAjena = null

    const guardado = leerEstado()
    const local = { ...guardado, baseConDatos: await baseConDatos() }
    switch (decidir(meta, local)) {
      case 'subir':
        await subir(sincro, meta)
        break
      case 'bajar':
        await bajar(sincro, meta!)
        break
      case 'conflicto': {
        // Antes de parar la app y pedirle al maestro que elija, comprobar que
        // hay algo real que elegir. `pendiente` es un proxy —lo pone cualquier
        // escritura— y además se lee DESPUÉS del viaje de red a `leerMeta()`,
        // así que una escritura ocurrida durante esa ida y vuelta también entra
        // aquí. La huella no miente: si el contenido local es idéntico al del
        // último punto de sincronía, no ha divergido nada y esto es un simple
        // «el servidor va por delante», que se resuelve bajando.
        //
        // Se revalida así, y no capturando el estado antes del `await`, porque
        // esa foto tendría el defecto contrario y mucho peor: una escritura
        // real llegada durante el viaje de red no aparecería en ella, y se
        // bajaría la copia remota encima, perdiéndola sin avisar.
        if (guardado.huellaSubida && (await huellaLocal()) === guardado.huellaSubida) {
          actualizar({ pendiente: false, ultimaEscritura: null })
          await bajar(sincro, meta!)
          break
        }
        conflictoVivo = {
          meta: meta!,
          localDesde: guardado.ultimaEscritura ?? (await leerConfig()).ultimoBackup,
          primeraVez: guardado.versionAplicada === 0,
          resumenLocal: await resumenLocal(),
        }
        actualizar({ conflicto: true })
        estado('conflicto')
        return
      }
      case 'nada':
        break
    }
    window.clearTimeout(reintento)
    marcarSincronizadoAhora()
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

  // Al abrir la app, la fecha de la última sincronización vive en localStorage:
  // se lleva al store para poder mostrarla en Ajustes antes de la primera pasada.
  useSincro.setState({ ultimaSincro: leerEstado().ultimaSincro ?? undefined })

  observarEscrituras()
  observarRed()
  await ejecutar()

  // `onSnapshot` sobre el documento de meta —unos pocos campos— es una conexión
  // viva, no un sondeo: el otro dispositivo aparece al momento y sin preguntar
  // cada pocos segundos.
  const { fs, meta } = await refs(sincro.id)
  escuchando = fs.onSnapshot(
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
