import { AlertTriangle, Check, Cloud, CloudOff, Download, KeyRound, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Hoja } from './Hoja'
import {
  adoptarPassphraseRemota,
  conflictoActual,
  descargarRemotaAFichero,
  divergenciaPassphrase,
  ejecutar,
  ErrorSincro,
  resolverConLoLocal,
  resolverConLoRemoto,
  sobrescribirNubeConLoLocal,
  type CodigoErrorSincro,
} from '../db/sincro'
import { Campo } from './Campo'
import { crearDescarga } from '../lib/descargar'
import { nombreFicheroBackup } from '../lib/backup'
import type { MetaRemota } from '../lib/sincro'
import { useSincro } from '../store/sincro'
import { useUI } from '../store/ui'

/**
 * Cuando todo está al día, un tic verde lo dice de un vistazo (Bloque 3); el
 * botón sigue sincronizando al tocarlo, pero ya no reclama atención. El resto de
 * estados mantiene su icono propio para que se distingan sin leer.
 */
const PINTA = {
  sincronizado: { Icono: Check, texto: 'Todo al día · toca para sincronizar' },
  sincronizando: { Icono: RefreshCw, texto: 'Sincronizando…' },
  conflicto: { Icono: AlertTriangle, texto: 'Conflicto de sincronización' },
  passphrase: { Icono: KeyRound, texto: 'La contraseña no abre los datos de la nube' },
  sin_conexion: { Icono: CloudOff, texto: 'Sin conexión: los cambios subirán solos' },
  error: { Icono: AlertTriangle, texto: 'Error de sincronización' },
  apagado: { Icono: Cloud, texto: '' },
} as const

/**
 * Botón de sincronizar de la cabecera. Vive dentro de `Cabecera` para aparecer
 * en todas las pantallas —Hoy incluida, arriba y a un dedo— sin que cada una
 * tenga que acordarse de ponerlo.
 *
 * Con la sincronización apagada no se renderiza nada: quien no la use no debe
 * ver ni rastro de ella.
 */
export function IndicadorSincro() {
  const { estado, detalle } = useSincro()
  const [hoja, setHoja] = useState(false)

  if (estado === 'apagado') return null

  const { Icono, texto } = PINTA[estado]
  // Conflicto, contraseña que no abre y error son los estados donde hay algo
  // que decidir; en el resto, tocar significa «mira el servidor ya, no esperes
  // al debounce».
  const problema = estado === 'conflicto' || estado === 'passphrase' || estado === 'error'
  // El tic «al día» va en lima (positivo); el resto de estados sin problema, en
  // blanco atenuado, para que solo el check destaque como confirmación.
  const colorIcono = problema ? 'text-white' : estado === 'sincronizado' ? 'text-lima' : 'text-white/75'

  return (
    <>
      <button
        onClick={() => (problema ? setHoja(true) : void ejecutar())}
        aria-label={detalle ?? texto}
        title={detalle ?? texto}
        className={
          'flex min-h-tap min-w-tap items-center justify-center rounded-full transition ' +
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 active:bg-white/15 ' +
          colorIcono
        }
      >
        <span className={problema ? 'rounded-full bg-acento p-1.5' : ''}>
          <Icono size={20} className={estado === 'sincronizando' ? 'animate-spin' : ''} aria-hidden />
        </span>
      </button>

      {hoja && <HojaSincro onCerrar={() => setHoja(false)} />}
    </>
  )
}

function fecha(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleString('es-ES') : 'desconocida'
}

/**
 * Qué se le dice al maestro según por qué falló. Cada frase termina en lo que
 * puede hacer él, que es lo único que le sirve; y todas dicen que no se ha
 * tocado nada, porque desde el Bloque 2 es verdad: un fallo deja el conflicto
 * exactamente como estaba.
 */
const MOTIVO: Record<CodigoErrorSincro, string> = {
  red: 'No hay conexión con el servidor. No se ha tocado nada: vuelve a elegir cuando tengas cobertura.',
  permisos:
    'El servidor ha rechazado la petición. Revisa en Ajustes que el identificador de sincronización es el correcto y que las reglas de seguridad están publicadas.',
  passphrase:
    'La contraseña de este dispositivo no abre los datos de la nube: se guardaron con otra distinta. No se ha tocado nada.',
  incompleta:
    'La copia del servidor llegó incompleta. No se ha tocado nada: vuelve a intentarlo en un momento.',
  otro: '',
}

function motivo(e: unknown, respaldo: string): string {
  if (!(e instanceof ErrorSincro)) return respaldo
  return MOTIVO[e.codigo] || e.message || respaldo
}

/**
 * La contraseña de este dispositivo no es la que cifró lo que hay en la nube.
 *
 * Se detecta con el canario de la meta remota, sin descargar nada. Las dos
 * salidas son las únicas que existen de verdad: recordar la contraseña buena, o
 * aceptar que lo de la nube se queda ilegible y sustituirlo por lo de aquí. No
 * hay una tercera, y fingir que la hay sería peor que decirlo.
 */
function HojaPassphrase({ meta, onCerrar }: { meta: MetaRemota; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [confirmandoPisar, setConfirmandoPisar] = useState(false)

  async function adoptar() {
    setTrabajando(true)
    setError(null)
    try {
      await adoptarPassphraseRemota(passphrase)
      onCerrar()
    } catch (e) {
      setError(motivo(e, 'No se pudo comprobar esa contraseña.'))
      setTrabajando(false)
    }
  }

  async function pisarLaNube() {
    setTrabajando(true)
    try {
      await sobrescribirNubeConLoLocal()
      onCerrar()
    } catch (e) {
      mostrarAviso(motivo(e, 'No se pudo sustituir la copia de la nube. No se ha tocado nada.'))
      setTrabajando(false)
    }
  }

  return (
    <Hoja abierta titulo="La contraseña no abre los datos de la nube" onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-sm">
          Los datos guardados en la nube se protegieron con una contraseña distinta de la que tiene
          este dispositivo, así que desde aquí no se pueden abrir. No se ha perdido nada: lo de este
          dispositivo sigue intacto y lo de la nube también, solo que cada uno con su llave.
        </p>

        <div className="rounded-xl border border-borde p-3 dark:border-noche-borde">
          <div className="font-semibold">La copia de la nube ({meta.dispositivo})</div>
          <div className="text-sm texto-suave">
            Guardada el <span className="cifra">{fecha(meta.creado)}</span>
          </div>
        </div>

        <label className="block">
          <span className="etiqueta">Contraseña con la que se guardaron los datos de la nube</span>
          <Campo
            type="password"
            className="campo"
            valor={passphrase}
            onValor={(v) => {
              setPassphrase(v)
              setError(null)
            }}
            autoComplete="off"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm font-medium text-acento">
            {error}
          </p>
        )}

        <button
          className="btn-primario w-full"
          disabled={trabajando || !passphrase}
          onClick={() => void adoptar()}
        >
          {trabajando ? 'Comprobando…' : 'Usar esta contraseña en este dispositivo'}
        </button>
        <p className="text-xs texto-suave">
          Se comprueba antes de descargar nada. Si no es la correcta, no se cambia nada aquí.
        </p>

        {confirmandoPisar ? (
          <div className="space-y-3 rounded-xl border border-acento p-3">
            <p className="text-sm">
              Se sustituirá la copia de la nube por la de este dispositivo. Todo lo que el otro
              dispositivo hubiera guardado ahí y no esté aquí se pierde, y no hay forma de
              recuperarlo desde este dispositivo. Después, escribe la misma contraseña en los dos.
            </p>
            <button
              className="btn-peligro w-full"
              disabled={trabajando}
              onClick={() => void pisarLaNube()}
            >
              {trabajando ? 'Sustituyendo…' : 'Sí, sustituir la copia de la nube'}
            </button>
            <button className="btn-suave w-full" onClick={() => setConfirmandoPisar(false)}>
              Mejor no
            </button>
          </div>
        ) : (
          <button
            className="btn-suave w-full"
            disabled={trabajando}
            onClick={() => setConfirmandoPisar(true)}
          >
            No recuerdo esa contraseña
          </button>
        )}
      </div>
    </Hoja>
  )
}

function HojaSincro({ onCerrar }: { onCerrar: () => void }) {
  const { estado, detalle } = useSincro()
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const conflicto = conflictoActual()
  const divergencia = divergenciaPassphrase()
  const [trabajando, setTrabajando] = useState(false)
  const [descarga, setDescarga] = useState<{ url: string; nombre: string } | null>(null)

  /**
   * Elegida una de las dos copias, la hoja ya no tiene nada que ofrecer.
   *
   * Si falla, el motor deja el conflicto exactamente como estaba —no se ha
   * perdido nada— y lo que hace falta es decir POR QUÉ falló: esperar a que
   * vuelva la cobertura, reintentar, o caer en que las dos contraseñas no son
   * la misma no llevan al mismo sitio.
   */
  async function resolver(accion: () => Promise<void>) {
    setTrabajando(true)
    try {
      await accion()
      onCerrar()
    } catch (e) {
      mostrarAviso(motivo(e, 'No se pudo resolver el conflicto. No se ha tocado nada.'))
      setTrabajando(false)
    }
  }

  async function bajarAFichero() {
    setTrabajando(true)
    try {
      const { fichero, meta } = await descargarRemotaAFichero()
      setDescarga(crearDescarga(fichero, nombreFicheroBackup(new Date(meta.creado)), 'application/octet-stream'))
    } catch (e) {
      mostrarAviso(motivo(e, 'No se pudo descargar la otra copia.'))
    } finally {
      setTrabajando(false)
    }
  }

  if (estado === 'passphrase' && divergencia)
    return <HojaPassphrase meta={divergencia} onCerrar={onCerrar} />

  if (estado !== 'conflicto' || !conflicto)
    return (
      <Hoja abierta titulo="Sincronización" onCerrar={onCerrar}>
        <div className="space-y-3">
          <p className="text-sm">{detalle ?? PINTA[estado].texto}</p>
          <p className="text-xs texto-suave">
            Tus datos se guardan protegidos: solo tú puedes abrirlos. Si algo va mal, «Copia de
            seguridad» en Ajustes sigue disponible.
          </p>
          <button className="btn-suave w-full" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </Hoja>
    )

  return (
    <Hoja abierta titulo="Conflicto de sincronización" onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-sm">
          {conflicto.primeraVez
            ? 'Este dispositivo ya tenía datos antes de empezar a sincronizar, y ya había otra copia guardada. No se pueden juntar: hay que quedarse con una. Elige tú, que sabes cuál tiene el trabajo bueno.'
            : 'Los dos dispositivos han cambiado desde la última vez que se sincronizaron. No se pueden juntar: hay que quedarse con uno de los dos. Elige tú, que sabes cuál tiene el trabajo bueno.'}
        </p>

        <div className="rounded-xl border border-borde p-3 dark:border-noche-borde">
          <div className="font-semibold">Este dispositivo</div>
          <div className="text-sm texto-suave">
            {conflicto.primeraVez ? (
              <>
                <span className="cifra">{conflicto.resumenLocal.grupos}</span>{' '}
                {conflicto.resumenLocal.grupos === 1 ? 'grupo' : 'grupos'} y{' '}
                <span className="cifra">{conflicto.resumenLocal.alumnos}</span>{' '}
                {conflicto.resumenLocal.alumnos === 1 ? 'alumno' : 'alumnos'}, sin subir nunca.
              </>
            ) : conflicto.localDesde ? (
              <>
                Con cambios sin subir desde{' '}
                <span className="cifra">{fecha(conflicto.localDesde)}</span>
              </>
            ) : (
              'Con cambios sin subir.'
            )}
          </div>
        </div>

        <div className="rounded-xl border border-borde p-3 dark:border-noche-borde">
          <div className="font-semibold">La otra copia ({conflicto.meta.dispositivo})</div>
          <div className="text-sm texto-suave">
            Guardada el <span className="cifra">{fecha(conflicto.meta.creado)}</span>
          </div>
        </div>

        {descarga ? (
          <a
            href={descarga.url}
            download={descarga.nombre}
            className="btn-primario flex min-h-tap w-full items-center justify-center gap-2"
          >
            <Download size={18} aria-hidden /> Guardar {descarga.nombre}
          </a>
        ) : (
          <button className="btn-suave w-full" onClick={() => void bajarAFichero()} disabled={trabajando}>
            <Download size={18} aria-hidden />
            {trabajando ? 'Descargando…' : 'Guardar antes esa copia en un fichero'}
          </button>
        )}

        <button className="btn-primario w-full" disabled={trabajando} onClick={() => void resolver(resolverConLoLocal)}>
          Quedarme con la de este dispositivo
        </button>

        {/* Quedarse con la del servidor recarga la página al terminar, así que
            esta rama no llega a cerrar la hoja: se la lleva la recarga. */}
        <button className="btn-peligro w-full" disabled={trabajando} onClick={() => void resolver(resolverConLoRemoto)}>
          Quedarme con la otra copia
        </button>

        <p className="text-xs texto-suave">
          La que no elijas se pierde. Si dudas, guarda antes esa copia en un fichero: siempre podrás
          restaurarla desde Ajustes.
        </p>
      </div>
    </Hoja>
  )
}
