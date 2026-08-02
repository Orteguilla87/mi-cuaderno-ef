import { AlertTriangle, Check, Cloud, CloudOff, Download, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Hoja } from './Hoja'
import {
  conflictoActual,
  descargarRemotaAFichero,
  resolverConLoLocal,
  resolverConLoRemoto,
} from '../db/sincro'
import { crearDescarga } from '../lib/descargar'
import { nombreFicheroBackup } from '../lib/backup'
import { useSincro } from '../store/sincro'
import { useUI } from '../store/ui'

const PINTA = {
  sincronizado: { Icono: Check, texto: 'Sincronizado' },
  sincronizando: { Icono: RefreshCw, texto: 'Sincronizando…' },
  conflicto: { Icono: AlertTriangle, texto: 'Conflicto de sincronización' },
  sin_conexion: { Icono: CloudOff, texto: 'Sin conexión: los cambios subirán solos' },
  error: { Icono: AlertTriangle, texto: 'Error de sincronización' },
  apagado: { Icono: Cloud, texto: '' },
} as const

/**
 * Icono discreto en la cabecera. Vive dentro de `Cabecera` para aparecer en
 * todas las pantallas sin que cada una tenga que acordarse de ponerlo.
 *
 * Con la sincronización apagada no se renderiza nada: quien no la use no debe
 * ver ni rastro de ella.
 */
export function IndicadorSincro() {
  const { estado, detalle } = useSincro()
  const [hoja, setHoja] = useState(false)

  if (estado === 'apagado') return null

  const { Icono, texto } = PINTA[estado]
  const problema = estado === 'conflicto' || estado === 'error'

  return (
    <>
      <button
        onClick={() => setHoja(true)}
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
          Los dos dispositivos han cambiado desde la última vez que se sincronizaron. No se pueden
          juntar: hay que quedarse con uno de los dos. Elige tú, que sabes cuál tiene el trabajo
          bueno.
        </p>

        <div className="rounded-xl border border-borde p-3 dark:border-noche-borde">
          <div className="font-semibold">Este dispositivo</div>
          <div className="text-sm texto-suave">
            Con cambios sin subir. Última sincronización:{' '}
            <span className="cifra">{fecha(conflicto.localCreado)}</span>
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

        <button
          className="btn-primario w-full"
          disabled={trabajando}
          onClick={() => {
            setTrabajando(true)
            void resolverConLoLocal()
          }}
        >
          Quedarme con la de este dispositivo
        </button>

        <button
          className="btn-peligro w-full"
          disabled={trabajando}
          onClick={() => {
            setTrabajando(true)
            void resolverConLoRemoto()
          }}
        >
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
