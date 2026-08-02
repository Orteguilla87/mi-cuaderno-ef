import { AlertTriangle, Cloud, CloudOff, Download, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Hoja } from './Hoja'
import {
  conflictoActual,
  descargarRemotaAFichero,
  ejecutar,
  resolverConLoLocal,
  resolverConLoRemoto,
} from '../db/sincro'
import { crearDescarga } from '../lib/descargar'
import { nombreFicheroBackup } from '../lib/backup'
import { useSincro } from '../store/sincro'
import { useUI } from '../store/ui'

/**
 * Las flechas en círculo son el gesto universal de «actualizar», y eso es lo
 * que el botón hace. Un tic diría «ya está», que es justo lo contrario de
 * invitar a tocarlo.
 */
const PINTA = {
  sincronizado: { Icono: RefreshCw, texto: 'Sincronizar ahora' },
  sincronizando: { Icono: RefreshCw, texto: 'Sincronizando…' },
  conflicto: { Icono: AlertTriangle, texto: 'Conflicto de sincronización' },
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
  // Conflicto y error son los únicos estados donde hay algo que decidir; en el
  // resto, tocar significa «mira el servidor ya, no esperes al debounce».
  const problema = estado === 'conflicto' || estado === 'error'

  return (
    <>
      <button
        onClick={() => (problema ? setHoja(true) : void ejecutar())}
        aria-label={detalle ?? texto}
        title={detalle ?? texto}
        className={
          'flex min-h-tap min-w-tap items-center justify-center rounded-full transition ' +
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 active:bg-white/15 ' +
          (problema ? 'text-white' : 'text-white/75')
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

function HojaSincro({ onCerrar }: { onCerrar: () => void }) {
  const { estado, detalle } = useSincro()
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const conflicto = conflictoActual()
  const [trabajando, setTrabajando] = useState(false)
  const [descarga, setDescarga] = useState<{ url: string; nombre: string } | null>(null)

  /** Elegida una de las dos copias, la hoja ya no tiene nada que ofrecer. */
  async function resolver(accion: () => Promise<void>) {
    setTrabajando(true)
    try {
      await accion()
      onCerrar()
    } catch {
      mostrarAviso('No se pudo resolver el conflicto. Se vuelve a intentar cuando quieras.')
      setTrabajando(false)
    }
  }

  async function bajarAFichero() {
    setTrabajando(true)
    try {
      const { fichero, meta } = await descargarRemotaAFichero()
      setDescarga(crearDescarga(fichero, nombreFicheroBackup(new Date(meta.creado)), 'application/octet-stream'))
    } catch {
      mostrarAviso('No se pudo descargar la copia del servidor.')
    } finally {
      setTrabajando(false)
    }
  }

  if (estado !== 'conflicto' || !conflicto)
    return (
      <Hoja abierta titulo="Sincronización" onCerrar={onCerrar}>
        <div className="space-y-3">
          <p className="text-sm">{detalle ?? PINTA[estado].texto}</p>
          <p className="text-xs texto-suave">
            La copia viaja siempre cifrada. Si algo va mal, «Backup ahora» en Ajustes sigue
            funcionando igual.
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
            ? 'Este dispositivo ya tenía datos antes de sincronizar, y en el servidor hay otra copia. No se pueden juntar: hay que quedarse con una. Elige tú, que sabes cuál tiene el trabajo bueno.'
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
          <div className="font-semibold">Servidor ({conflicto.meta.dispositivo})</div>
          <div className="text-sm texto-suave">
            Copia del <span className="cifra">{fecha(conflicto.meta.creado)}</span>
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
            {trabajando ? 'Descargando…' : 'Guardar antes la del servidor en un fichero'}
          </button>
        )}

        <button className="btn-primario w-full" disabled={trabajando} onClick={() => void resolver(resolverConLoLocal)}>
          Quedarme con la de este dispositivo
        </button>

        {/* Quedarse con la del servidor recarga la página al terminar, así que
            esta rama no llega a cerrar la hoja: se la lleva la recarga. */}
        <button className="btn-peligro w-full" disabled={trabajando} onClick={() => void resolver(resolverConLoRemoto)}>
          Quedarme con la del servidor
        </button>

        <p className="text-xs texto-suave">
          La que no elijas se pierde. Si dudas, guarda antes la del servidor en un fichero: siempre
          podrás restaurarla desde Ajustes.
        </p>
      </div>
    </Hoja>
  )
}
