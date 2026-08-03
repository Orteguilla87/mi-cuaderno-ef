import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CloudDownload,
  CloudUpload,
  Download,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { CursoEscolarAjustes } from '../components/CursoEscolarAjustes'
import { Hoja } from '../components/Hoja'
import {
  diasDesdeBackup,
  DIAS_AVISO_BACKUP,
  exportarBackup,
  inspeccionarBackup,
  registrarBackupHecho,
  restaurarBackup,
  tocaAvisarDeBackup,
} from '../db/backup'
import { CONFIG_POR_DEFECTO, guardarConfig, useConfig } from '../db/config'
import { db } from '../db/db'
import { leerCursoActivo } from '../db/curso'
import { comprobarPin, definirPin, quitarPin } from '../db/pin'
import { guardarConfigSincro } from '../db/sincro'
import type { BandaSobre, BandasOficiales, ConfigSincro, ConfigWebdav, ModoMedia } from '../db/types'
import {
  bajarBackup,
  ErrorWebdav,
  estadoRemoto,
  guardarConfigWebdav,
  probarConexion,
  subirBackup,
  webdavConfigurado,
  type EstadoRemoto,
} from '../db/webdav'
import { ErrorBackup } from '../lib/backup'
import { crearDescarga, soportaCryptoSubtle } from '../lib/descargar'
import { errorIdSincro, firebaseConfigurado, nuevoIdSincro } from '../lib/firebase'
import { LONGITUD_MAX_PIN, LONGITUD_MIN_PIN, pinValido } from '../lib/pin'
import { useSincro } from '../store/sincro'
import { useUI } from '../store/ui'

/**
 * Interruptor de la sección «Servidor WebDAV» (Bloque 5). La sincronización
 * automática ya cubre pasar la copia entre dispositivos, así que se oculta;
 * el código de `SeccionWebdav` se conserva y con `true` vuelve a mostrarse.
 */
const WEBDAV_VISIBLE = false

export function Ajustes() {
  const config = useConfig()
  const curso = useLiveQuery(() => leerCursoActivo(), [])
  const estadoSincro = useSincro((s) => s.estado)

  return (
    <>
      <Cabecera titulo="Ajustes" subtitulo={curso ? `Curso ${curso.nombre}` : undefined} atras />

      <div className="space-y-4 p-4">
        <Seccion
          titulo="Curso escolar"
          ayuda="El planificador genera las sesiones entre estas fechas, saltando los días no lectivos."
        >
          <CursoEscolarAjustes />
        </Seccion>

        <Seccion titulo="Aspecto">
          <Fila
            etiqueta="Modo pista"
            ayuda="Alto contraste y botones grandes para el sol directo."
            control={
              <Interruptor
                activo={config.modoPista}
                onCambio={(v) => guardarConfig({ modoPista: v })}
                etiqueta="Modo pista"
              />
            }
          />
          <div>
            <span className="etiqueta">Tema</span>
            <div className="grid grid-cols-3 gap-2">
              {(['sistema', 'claro', 'oscuro'] as const).map((t) => (
                <button
                  key={t}
                  className={config.tema === t ? 'btn-primario' : 'btn-suave'}
                  onClick={() => guardarConfig({ tema: t })}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </Seccion>

        <Seccion
          titulo="Etiquetas de observaciones"
          ayuda="Las etiquetas rápidas que aparecen al registrar una observación. Borrar una etiqueta no toca las observaciones ya guardadas: conservan su texto tal cual."
        >
          <EtiquetasObservacion etiquetas={config.quickTagsObservacion} />
        </Seccion>

        <Seccion
          titulo="Generador de equipos"
          ayuda="Colores de peto por defecto, en el orden en que se asignan a los equipos."
        >
          <ColoresPetos coloresPetos={config.coloresPetos} />
        </Seccion>

        <Seccion
          titulo="Evaluación"
          ayuda="Se aplica a Primaria. Infantil usa solo escala cualitativa."
        >
          <div>
            <span className="etiqueta">Media de la nota final</span>
            <div className="space-y-2">
              {(
                [
                  ['aritmetica', 'Aritmética', 'Media simple de los tres trimestres.'],
                  ['ponderada', 'Ponderada', 'Cada trimestre pesa lo que indiques abajo.'],
                  ['continua', 'Continua', 'Nota del 3.º trimestre ajustada por la tendencia.'],
                ] as [ModoMedia, string, string][]
              ).map(([valor, titulo, ayuda]) => (
                <button
                  key={valor}
                  onClick={() => guardarConfig({ modoMedia: valor })}
                  className={
                    'w-full rounded-xl border p-3 text-left ' +
                    (config.modoMedia === valor
                      ? 'border-primario bg-primario/10'
                      : 'border-borde dark:border-noche-borde')
                  }
                >
                  <div className="font-semibold">{titulo}</div>
                  <div className="text-sm texto-suave">{ayuda}</div>
                </button>
              ))}
            </div>
          </div>

          {config.modoMedia === 'ponderada' && (
            <div>
              <span className="etiqueta">Pesos por trimestre (%)</span>
              <div className="flex gap-2">
                {config.pesosTrimestres.map((peso, i) => (
                  <label key={i} className="flex-1">
                    <span className="mb-1 block text-center text-xs texto-suave">{i + 1}.º</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="campo text-center"
                      value={peso}
                      onChange={(e) => {
                        const pesos = [...config.pesosTrimestres] as [number, number, number]
                        pesos[i] = Number(e.target.value)
                        void guardarConfig({ pesosTrimestres: pesos })
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs texto-suave">
                Suman {config.pesosTrimestres.reduce((a, b) => a + b, 0)}%.
              </p>
            </div>
          )}

          <div>
            <span className="etiqueta">Redondeo de la nota del trimestre</span>
            <div className="space-y-2">
              {(
                [
                  [
                    'redondeada',
                    'Redondear y mirar la banda',
                    'La nota se redondea primero y la banda del art. 19 se aplica sobre el entero: 7,51 → 8 → NT.',
                  ],
                  [
                    'real',
                    'Mirar la banda sobre la nota real',
                    'La banda se aplica directamente sobre la nota sin redondear: 6,6 → BI.',
                  ],
                ] as [BandaSobre, string, string][]
              ).map(([valor, titulo, ayuda]) => (
                <button
                  key={valor}
                  onClick={() => guardarConfig({ bandaSobre: valor })}
                  className={
                    'w-full rounded-xl border p-3 text-left ' +
                    (config.bandaSobre === valor
                      ? 'border-primario bg-primario/10'
                      : 'border-borde dark:border-noche-borde')
                  }
                >
                  <div className="font-semibold">{titulo}</div>
                  <div className="text-sm texto-suave">{ayuda}</div>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs texto-suave">
              La nota real siempre se enseña junto a la redondeada y la oficial: el decimal queda
              trazable para una reclamación (art. 20).
            </p>
          </div>

          <EditorBandas
            bandas={config.bandasOficiales}
            onCambio={(bandas) => guardarConfig({ bandasOficiales: bandas })}
          />
        </Seccion>

        <Seccion
          titulo="Agente de voz"
          ayuda="Solo se envía texto pseudonimizado a la API de Anthropic: nunca nombres ni datos de la base."
        >
          <ClaveApi />
          <div>
            <label className="etiqueta" htmlFor="modelo">
              Modelo
            </label>
            <input
              id="modelo"
              className="campo"
              value={config.modeloAgente}
              onChange={(e) => guardarConfig({ modeloAgente: e.target.value })}
            />
            <p className="mt-1 text-xs texto-suave">
              Los identificadores cambian con el tiempo; por eso es editable.
            </p>
          </div>
        </Seccion>

        <Seccion titulo="Datos">
          <Estadisticas />
        </Seccion>

        <Seccion
          titulo="Copia de seguridad"
          ayuda="El único sitio donde viajan los apoyos y las notas privadas: cifrada, y solo entre tus propios dispositivos."
          aviso={tocaAvisarDeBackup(config.ultimoBackup)}
        >
          <SeccionBackup config={config} />
        </Seccion>

        <Seccion
          titulo="Sincronización automática"
          ayuda="Opcional. Tus cambios se guardan y se actualizan solos en todos tus dispositivos."
          aviso={estadoSincro === 'conflicto' || estadoSincro === 'error'}
        >
          <SeccionSincro sincro={config.sincro} />
        </Seccion>

        {/* «Servidor WebDAV» oculto de Ajustes (Bloque 5): la sincronización
            automática lo cubre, así que se retira de la vista. El código y los
            datos siguen intactos; poner WEBDAV_VISIBLE a true lo devuelve. */}
        {WEBDAV_VISIBLE && (
          <Seccion
            titulo="Servidor WebDAV"
            ayuda="Opcional. Sirve para llevar la copia cifrada del móvil al PC sin cables. Solo viaja el fichero .enc: el servidor nunca ve tus datos."
          >
            <SeccionWebdav webdav={config.webdav} />
          </Seccion>
        )}

        <Seccion
          titulo="PIN de acceso"
          ayuda="Bloquea la pantalla tras 5 minutos sin uso. No cifra los datos del dispositivo: para eso está la copia de seguridad."
        >
          <SeccionPin tienePin={!!config.pin} />
        </Seccion>
      </div>
    </>
  )
}

/**
 * Etiquetas rápidas de observaciones (§5 M4), editables desde datos en Config
 * en vez de una lista fija en código. Cada Observacion guarda sus propias
 * `tags` como texto suelto en el momento de crearla, así que borrar o renombrar
 * una etiqueta aquí nunca toca observaciones ya guardadas.
 */
function EtiquetasObservacion({ etiquetas }: { etiquetas: string[] }) {
  const [nueva, setNueva] = useState('')

  function cambiar(i: number, valor: string) {
    const siguiente = [...etiquetas]
    siguiente[i] = valor
    void guardarConfig({ quickTagsObservacion: siguiente })
  }

  function alSalir(i: number) {
    if (etiquetas[i].trim() === '') eliminar(i)
  }

  function eliminar(i: number) {
    void guardarConfig({ quickTagsObservacion: etiquetas.filter((_, j) => j !== i) })
  }

  function anadir() {
    const texto = nueva.trim()
    if (!texto || etiquetas.includes(texto)) return
    void guardarConfig({ quickTagsObservacion: [...etiquetas, texto] })
    setNueva('')
  }

  return (
    <div className="space-y-2">
      {etiquetas.length > 0 && (
        <ul className="space-y-2">
          {etiquetas.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                className="campo flex-1"
                value={t}
                onChange={(e) => cambiar(i, e.target.value)}
                onBlur={() => alSalir(i)}
                aria-label={`Etiqueta ${i + 1}`}
              />
              <button
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acento/15 text-acento"
                onClick={() => eliminar(i)}
                aria-label={`Eliminar etiqueta «${t}»`}
              >
                <Trash2 size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          className="campo flex-1"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              anadir()
            }
          }}
          placeholder="Nueva etiqueta"
          aria-label="Nueva etiqueta"
        />
        <button className="btn-suave" onClick={anadir}>
          Añadir
        </button>
      </div>
      <button
        className="btn-fantasma"
        onClick={() => void guardarConfig({ quickTagsObservacion: CONFIG_POR_DEFECTO.quickTagsObservacion })}
      >
        Restaurar por defecto
      </button>
    </div>
  )
}

function ColoresPetos({ coloresPetos }: { coloresPetos: string[] }) {
  function cambiar(i: number, valor: string) {
    const nuevo = [...coloresPetos]
    nuevo[i] = valor
    void guardarConfig({ coloresPetos: nuevo })
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {coloresPetos.map((c, i) => (
          <label key={i} className="flex flex-col items-center gap-1">
            <input
              type="color"
              value={c}
              onChange={(e) => cambiar(i, e.target.value)}
              className="h-12 w-full cursor-pointer rounded-xl border border-borde dark:border-noche-borde"
              aria-label={`Color de peto ${i + 1}`}
            />
          </label>
        ))}
      </div>
      <button
        className="btn-fantasma"
        onClick={() => void guardarConfig({ coloresPetos: CONFIG_POR_DEFECTO.coloresPetos })}
      >
        Restaurar por defecto
      </button>
    </div>
  )
}

/**
 * Cerrada por defecto: Ajustes tiene nueve secciones y casi nunca hacen falta
 * todas a la vez. El mismo gesto de `TarjetaClase`/`TarjetaSesionSemana` en
 * Hoy — cabecera pulsable con `aria-expanded` y un chevron que rota — para no
 * inventar un segundo lenguaje de «abrir/cerrar» en la misma app.
 *
 * `aviso` pinta un punto en `--accent` sobre el título aunque esté cerrada: lo
 * usan «Copia de seguridad» (recordatorio de M9) y «Sincronización» (conflicto
 * o error), donde algo con la sección plegada seguiría necesitando avisar.
 */
function Seccion({
  titulo,
  ayuda,
  aviso = false,
  children,
}: {
  titulo: string
  ayuda?: string
  aviso?: boolean
  children: React.ReactNode
}) {
  const [abierta, setAbierta] = useState(false)
  return (
    <section>
      <button className="desplegable w-full" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
        <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <h2 className="truncate text-base font-bold">{titulo}</h2>
          {aviso && <span className="h-2 w-2 shrink-0 rounded-full bg-acento" aria-label="Requiere atención" />}
        </span>
        <ChevronDown
          size={18}
          className={'shrink-0 transition-transform ' + (abierta ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {abierta && (
        <div className="tarjeta mt-2 space-y-4 py-4">
          {ayuda && <p className="text-sm texto-suave">{ayuda}</p>}
          {children}
        </div>
      )}
    </section>
  )
}

function Fila({
  etiqueta,
  ayuda,
  control,
}: {
  etiqueta: string
  ayuda?: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{etiqueta}</div>
        {ayuda && <div className="text-sm texto-suave">{ayuda}</div>}
      </div>
      {control}
    </div>
  )
}

function Interruptor({
  activo,
  onCambio,
  etiqueta,
}: {
  activo: boolean
  onCambio: (v: boolean) => void
  etiqueta: string
}) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambio(!activo)}
      className={
        'relative h-8 w-14 shrink-0 rounded-full transition ' +
        (activo ? 'bg-primario' : 'bg-borde dark:bg-noche-borde')
      }
    >
      <span
        className={
          'absolute top-1 h-6 w-6 rounded-full bg-white transition-all ' +
          (activo ? 'left-7' : 'left-1')
        }
      />
    </button>
  )
}

function EditorBandas({
  bandas,
  onCambio,
}: {
  bandas: BandasOficiales
  onCambio: (b: BandasOficiales) => void
}) {
  const claves: (keyof BandasOficiales)[] = ['SU', 'BI', 'NT', 'SB']

  return (
    <div>
      <span className="etiqueta">Bandas de calificación oficial</span>
      <p className="mb-2 text-xs texto-suave">
        Nota mínima para cada calificación. Por debajo de {bandas.SU} es IN.
      </p>
      <div className="flex gap-2">
        {claves.map((c) => (
          <label key={c} className="flex-1">
            <span className="mb-1 block text-center text-xs font-bold texto-suave">{c}</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              className="campo text-center"
              value={bandas[c]}
              onChange={(e) => onCambio({ ...bandas, [c]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

/** La API key solo se guarda en local (§1.3). Se muestra enmascarada por defecto. */
function ClaveApi() {
  const config = useConfig()
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="etiqueta" htmlFor="api-key">
        API key de Anthropic
      </label>
      <div className="flex gap-2">
        <input
          id="api-key"
          type={visible ? 'text' : 'password'}
          className="campo flex-1"
          value={config.apiKey ?? ''}
          onChange={(e) => guardarConfig({ apiKey: e.target.value })}
          placeholder="sk-ant-..."
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn-suave" onClick={() => setVisible((v) => !v)}>
          {visible ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      <p className="mt-1 text-xs texto-suave">
        Se guarda solo en este dispositivo. Sin clave, el agente funcionará con el parser local
        sin conexión.
      </p>
    </div>
  )
}

function Estadisticas() {
  const datos = useLiveQuery(async () => ({
    grupos: await db.grupos.count(),
    alumnos: await db.alumnos.filter((a) => a.activo).count(),
    asistencias: await db.asistencias.count(),
    observaciones: await db.observaciones.count(),
  }))

  if (!datos) return null

  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      {[
        ['Grupos', datos.grupos],
        ['Alumnos', datos.alumnos],
        ['Registros de asistencia', datos.asistencias],
        ['Observaciones', datos.observaciones],
      ].map(([etiqueta, valor]) => (
        <div key={String(etiqueta)} className="rounded-xl bg-agua-claro p-2 dark:bg-noche-elevada">
          <dt className="text-xs texto-suave">{etiqueta}</dt>
          <dd className="cifra text-lg font-bold">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

// ——————————————————————————— M9: copia de seguridad ———————————————————————————

type Cotejo = Awaited<ReturnType<typeof inspeccionarBackup>>

function SeccionBackup({ config }: { config: ReturnType<typeof useConfig> }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const inputRef = useRef<HTMLInputElement>(null)

  const [hojaExportar, setHojaExportar] = useState(false)
  const [hojaSubir, setHojaSubir] = useState(false)
  const [hojaRemota, setHojaRemota] = useState(false)
  const [pasoImport, setPasoImport] = useState<{ fichero: Uint8Array<ArrayBuffer>; cotejo: Cotejo } | null>(null)
  const [errorImport, setErrorImport] = useState<string | null>(null)
  const [restaurando, setRestaurando] = useState(false)

  const hayServidor = webdavConfigurado(config.webdav)

  /**
   * Una copia bajada del servidor entra por el MISMO camino que un fichero
   * elegido a mano: inspeccionar → cotejo → confirmar. El servidor no tiene
   * ninguna vía rápida.
   */
  async function usarFichero(fichero: Uint8Array<ArrayBuffer>) {
    setErrorImport(null)
    try {
      setPasoImport({ fichero, cotejo: await inspeccionarBackup(fichero) })
    } catch (err) {
      setErrorImport(err instanceof ErrorBackup ? err.message : 'No se pudo leer el fichero.')
    }
  }

  const dias = diasDesdeBackup(config.ultimoBackup)
  const avisar = tocaAvisarDeBackup(config.ultimoBackup)

  async function elegirFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo fichero si hace falta
    if (!archivo) return
    await usarFichero(new Uint8Array<ArrayBuffer>(await archivo.arrayBuffer()))
  }

  async function confirmarImport(passphrase: string) {
    if (!pasoImport) return
    setRestaurando(true)
    setErrorImport(null)
    try {
      await restaurarBackup(pasoImport.fichero, passphrase)
      // Cambiaron todas las tablas: recargar es lo único que garantiza que cada
      // pantalla (curso activo, config reactiva, rutas…) parte de cero.
      window.location.reload()
    } catch (err) {
      setErrorImport(err instanceof ErrorBackup ? err.message : 'No se pudo restaurar la copia.')
      setRestaurando(false)
    }
  }

  return (
    <div className="space-y-3">
      {avisar && (
        <div className="aviso flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {dias === null
              ? 'Todavía no has hecho ninguna copia de seguridad.'
              : `Han pasado ${dias} días desde la última copia (aviso a partir de ${DIAS_AVISO_BACKUP}).`}
          </span>
        </div>
      )}

      {config.ultimoBackup && (
        <p className="text-sm texto-suave">
          Última copia: <span className="cifra">{new Date(config.ultimoBackup).toLocaleString('es-ES')}</span>
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button className="btn-primario flex-1" onClick={() => setHojaExportar(true)}>
          <Download size={18} aria-hidden /> Backup ahora
        </button>
        <button className="btn-suave flex-1" onClick={() => inputRef.current?.click()}>
          <Upload size={18} aria-hidden /> Restaurar copia
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".enc"
          className="hidden"
          onChange={elegirFichero}
          aria-label="Fichero de copia de seguridad cifrada"
        />
      </div>

      {hayServidor && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-suave flex-1" onClick={() => setHojaSubir(true)}>
            <CloudUpload size={18} aria-hidden /> Subir al servidor
          </button>
          <button className="btn-suave flex-1" onClick={() => setHojaRemota(true)}>
            <CloudDownload size={18} aria-hidden /> Copias del servidor
          </button>
        </div>
      )}

      {errorImport && !pasoImport && (
        <p role="alert" className="text-sm font-medium text-acento">
          {errorImport}
        </p>
      )}

      {hojaExportar && (
        <HojaPassphrase
          titulo="Backup ahora"
          explicacion="Elige una contraseña para cifrar la copia. Sin ella, nadie —ni tú— podrá abrirla: apúntala en un sitio seguro, fuera de este dispositivo."
          textoBoton="Cifrar copia"
          textoTrabajando="Cifrando…"
          accion={prepararDescargaBackup}
          onCerrar={() => setHojaExportar(false)}
          onListo={() => setHojaExportar(false)}
          renderResultado={(resultado) => (
            <ResultadoDescargaBackup
              resultado={resultado}
              onDescargado={() => {
                void registrarBackupHecho()
                mostrarAviso(
                  'Copia guardada. Sin la contraseña, nadie —ni tú— puede abrirla: apúntala en un sitio seguro.',
                )
              }}
              onListo={() => setHojaExportar(false)}
            />
          )}
        />
      )}

      {hojaSubir && (
        <HojaPassphrase
          titulo="Subir al servidor"
          explicacion="La copia se cifra AQUÍ antes de salir: el servidor solo recibe un fichero que no puede abrir. Usa la misma contraseña en todos tus dispositivos para poder restaurarla en cualquiera."
          textoBoton="Cifrar y subir"
          textoTrabajando="Cifrando y subiendo…"
          accion={async (passphrase) => {
            await subirBackup(passphrase)
          }}
          onCerrar={() => setHojaSubir(false)}
          onListo={() => {
            setHojaSubir(false)
            mostrarAviso('Copia subida al servidor.')
          }}
        />
      )}

      {hojaRemota && (
        <HojaCopiasRemotas
          onCerrar={() => setHojaRemota(false)}
          onElegida={async (fichero) => {
            setHojaRemota(false)
            await usarFichero(fichero)
          }}
        />
      )}

      {pasoImport && (
        <HojaConfirmarImport
          cotejo={pasoImport.cotejo}
          error={errorImport}
          restaurando={restaurando}
          onCancelar={() => {
            setPasoImport(null)
            setErrorImport(null)
          }}
          onConfirmar={confirmarImport}
        />
      )}
    </div>
  )
}

/**
 * Pide la passphrase (dos veces) y ejecuta la acción que se le pase. La usan
 * tanto «Backup ahora» como «Subir al servidor»: mismo fichero, mismo cifrado,
 * solo cambia el destino.
 *
 * `renderResultado`, si se pasa, sustituye el cierre automático: en vez de
 * llamar a `onListo` nada más terminar `accion`, se muestra lo que devuelva
 * (por ejemplo el enlace de descarga real, para que el toque del usuario
 * sobre ÉL sea el gesto que dispara la descarga, no un `.click()` disparado
 * por código bastante después de que el usuario tocó otro botón).
 */
function HojaPassphrase<T = void>({
  titulo,
  explicacion,
  textoBoton,
  textoTrabajando,
  accion,
  onCerrar,
  onListo,
  renderResultado,
}: {
  titulo: string
  explicacion: string
  textoBoton: string
  textoTrabajando: string
  accion: (passphrase: string) => Promise<T>
  onCerrar: () => void
  onListo: () => void
  renderResultado?: (resultado: T) => React.ReactNode
}) {
  const [passphrase, setPassphrase] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState<T | null>(null)

  useEffect(() => {
    return () => {
      const conRevocar = resultado as { revocar?: () => void } | null
      conRevocar?.revocar?.()
    }
  }, [resultado])

  async function ejecutar() {
    setError(null)
    if (passphrase.length < 8)
      return setError('Usa al menos 8 caracteres: es lo único que protege tus datos.')
    if (passphrase !== repetir) return setError('Las dos contraseñas no coinciden.')
    if (!soportaCryptoSubtle())
      return setError('Este navegador no permite cifrar aquí: hace falta https (o localhost).')

    setTrabajando(true)
    try {
      const r = await accion(passphrase)
      if (renderResultado) setResultado(r)
      else onListo()
    } catch (err) {
      setError(
        err instanceof ErrorWebdav || err instanceof ErrorBackup
          ? err.message
          : 'No se pudo completar la operación.',
      )
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Hoja abierta titulo={titulo} onCerrar={onCerrar}>
      {resultado !== null && renderResultado ? (
        renderResultado(resultado)
      ) : (
        <div className="space-y-3">
          <p className="text-sm texto-suave">{explicacion}</p>
          <label className="block">
            <span className="etiqueta">Contraseña</span>
            <input
              type="password"
              className="campo"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="etiqueta">Repite la contraseña</span>
            <input
              type="password"
              className="campo"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && (
          <p role="alert" className="text-sm font-medium text-acento">
            {error}
          </p>
        )}
          <button className="btn-primario w-full" onClick={() => void ejecutar()} disabled={trabajando}>
            {trabajando ? textoTrabajando : textoBoton}
          </button>
        </div>
      )}
    </Hoja>
  )
}

/** Cifra el backup y prepara su descarga; no la dispara (eso lo hace el enlace que ve el usuario). */
async function prepararDescargaBackup(
  passphrase: string,
): Promise<{ url: string; nombre: string; revocar: () => void }> {
  const { fichero, nombre } = await exportarBackup(passphrase)
  return crearDescarga(fichero, nombre, 'application/octet-stream')
}

/** Enlace de descarga real: el toque del usuario aquí ES el gesto que la dispara. */
function ResultadoDescargaBackup({
  resultado,
  onDescargado,
  onListo,
}: {
  resultado: { url: string; nombre: string }
  onDescargado: () => void
  onListo: () => void
}) {
  const [descargado, setDescargado] = useState(false)
  return (
    <div className="space-y-3">
      <p className="text-sm texto-suave">
        Copia cifrada. Toca para guardarla en el dispositivo — en Android, mantener pulsado también
        ofrece «Descargar enlace».
      </p>
      <a
        href={resultado.url}
        download={resultado.nombre}
        className="btn-primario flex min-h-tap w-full items-center justify-center gap-2"
        onClick={() => {
          if (descargado) return
          setDescargado(true)
          onDescargado()
        }}
      >
        <Download size={18} aria-hidden /> Guardar {resultado.nombre}
      </a>
      {descargado && (
        <p className="text-sm font-medium text-lima-oscuro dark:text-lima">Descarga iniciada.</p>
      )}
      <button className="btn-suave w-full" onClick={onListo}>
        Listo
      </button>
    </div>
  )
}

function HojaConfirmarImport({
  cotejo,
  error,
  restaurando,
  onCancelar,
  onConfirmar,
}: {
  cotejo: Cotejo
  error: string | null
  restaurando: boolean
  onCancelar: () => void
  onConfirmar: (passphrase: string) => void
}) {
  const [passphrase, setPassphrase] = useState('')
  const tablas = Array.from(
    new Set([...Object.keys(cotejo.copia), ...Object.keys(cotejo.actual)]),
  ).sort()

  return (
    <Hoja abierta titulo="Restaurar copia" onCerrar={onCancelar}>
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-acento/40 bg-acento/10 p-3 text-sm text-acento">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Esto sustituye TODOS los datos actuales del dispositivo por los de la copia. No se
            puede deshacer.
          </span>
        </div>

        <p className="text-sm">
          <span className="texto-suave">Copia del </span>
          <span className="cifra font-semibold">
            {new Date(cotejo.cabecera.creado).toLocaleString('es-ES')}
          </span>
        </p>

        {cotejo.migra && (
          <p className="aviso text-xs">
            La copia es de una versión anterior de la app: se actualizará automáticamente al
            restaurarla.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-borde dark:border-noche-borde">
          <table className="w-full text-xs">
            <caption className="sr-only">Cotejo de registros entre la copia y los datos actuales</caption>
            <thead className="bg-agua-claro dark:bg-noche-elevada">
              <tr>
                <th scope="col" className="p-1.5 text-left font-semibold">
                  Tabla
                </th>
                <th scope="col" className="p-1.5 text-right font-semibold">
                  Copia
                </th>
                <th scope="col" className="p-1.5 text-right font-semibold">
                  Actual
                </th>
              </tr>
            </thead>
            <tbody>
              {tablas.map((t) => (
                <tr key={t} className="border-t border-borde dark:border-noche-borde">
                  <td className="p-1.5">{t}</td>
                  <td className="cifra p-1.5 text-right">{cotejo.copia[t] ?? 0}</td>
                  <td className="cifra p-1.5 text-right">{cotejo.actual[t] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="block">
          <span className="etiqueta">Contraseña de la copia</span>
          <input
            type="password"
            className="campo"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="off"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm font-medium text-acento">
            {error}
          </p>
        )}

        <button
          className="btn-acento w-full"
          onClick={() => onConfirmar(passphrase)}
          disabled={restaurando || !passphrase}
        >
          {restaurando ? 'Restaurando…' : 'Restaurar y sustituir todo'}
        </button>
      </div>
    </Hoja>
  )
}

/** Lista las copias del servidor y baja la elegida. No restaura nada por sí sola. */
function HojaCopiasRemotas({
  onCerrar,
  onElegida,
}: {
  onCerrar: () => void
  onElegida: (fichero: Uint8Array<ArrayBuffer>) => void
}) {
  const [estado, setEstado] = useState<EstadoRemoto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bajando, setBajando] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    estadoRemoto()
      .then((e) => !cancelado && setEstado(e))
      .catch(
        (err) =>
          !cancelado &&
          setError(err instanceof ErrorWebdav ? err.message : 'No se pudo consultar el servidor.'),
      )
    return () => {
      cancelado = true
    }
  }, [])

  async function elegir(nombre: string) {
    setError(null)
    setBajando(nombre)
    try {
      onElegida(await bajarBackup(nombre))
    } catch (err) {
      setError(err instanceof ErrorWebdav ? err.message : 'No se pudo descargar la copia.')
    } finally {
      setBajando(null)
    }
  }

  return (
    <Hoja abierta titulo="Copias del servidor" onCerrar={onCerrar}>
      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-sm font-medium text-acento">
            {error}
          </p>
        )}

        {!estado && !error && <p className="text-sm texto-suave">Consultando el servidor…</p>}

        {estado?.hayMasNueva && (
          <p className="aviso text-xs">
            En el servidor hay una copia más reciente que la última hecha en este dispositivo.
          </p>
        )}

        {estado?.copias.length === 0 && (
          <p className="text-sm texto-suave">
            No hay ninguna copia de Cuaderno EF en esa carpeta todavía.
          </p>
        )}

        <ul className="space-y-2">
          {estado?.copias.map((c) => (
            <li key={c.nombre}>
              <button
                className="tarjeta-pulsable flex w-full items-center gap-3 text-left"
                onClick={() => void elegir(c.nombre)}
                disabled={bajando !== null}
              >
                <CloudDownload size={20} className="shrink-0 text-primario dark:text-agua" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="cifra block font-semibold">
                    {c.fecha.toLocaleString('es-ES')}
                  </span>
                  <span className="block text-xs texto-suave">
                    {bajando === c.nombre ? 'Descargando…' : c.nombre}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="text-xs texto-suave">
          Al elegir una copia se descarga y se muestra el resumen antes de sustituir nada.
        </p>
      </div>
    </Hoja>
  )
}

// ——————————————————————— sincronización automática ———————————————————————

function SeccionSincro({ sincro }: { sincro: ConfigSincro | undefined }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const ultimaSincro = useSincro((s) => s.ultimaSincro)
  const [borrador, setBorrador] = useState<ConfigSincro>(sincro ?? { id: '', passphrase: '' })
  const [verId, setVerId] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `useConfig` devuelve los valores por defecto mientras Dexie carga, así que
  // en el primer render `sincro` es `undefined` y el borrador nacería vacío: al
  // recargar la página se verían los dos campos en blanco pese a estar
  // guardados. Se rellena en cuanto llega el valor real.
  useEffect(() => {
    if (sincro) setBorrador(sincro)
  }, [sincro?.id, sincro?.passphrase])

  const listo = firebaseConfigurado()

  function guardar() {
    const problema = errorIdSincro(borrador.id.trim())
    if (problema) return setError(problema)
    if (borrador.passphrase.length < 8)
      return setError('La contraseña de cifrado necesita al menos 8 caracteres, y ha de ser la misma en todos tus dispositivos.')
    setError(null)
    void guardarConfigSincro({ id: borrador.id.trim(), passphrase: borrador.passphrase })
    mostrarAviso('Sincronización guardada.')
  }

  if (!listo)
    return (
      <div className="aviso flex items-start gap-2 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Falta dar de alta el proyecto de Firebase en el código de la app (
          <span className="cifra">src/lib/firebase.ts</span>). Hasta entonces esta sección no puede
          hacer nada.
        </span>
      </div>
    )

  return (
    <div className="space-y-3">
      {sincro && (
        <p className="text-sm texto-suave">
          Última sincronización:{' '}
          <span className="cifra font-semibold text-tinta dark:text-noche-texto">
            {ultimaSincro ? new Date(ultimaSincro).toLocaleString('es-ES') : 'aún sin sincronizar'}
          </span>
        </p>
      )}

      <label className="block">
        <span className="etiqueta">Identificador de sincronización</span>
        <input
          className="campo font-mono text-sm"
          type={verId ? 'text' : 'password'}
          value={borrador.id}
          onChange={(e) => setBorrador((b) => ({ ...b, id: e.target.value }))}
          placeholder="Genera uno y cópialo en el otro dispositivo"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="mt-2 flex gap-2">
          <button
            className="btn-suave flex-1"
            onClick={() => {
              setBorrador((b) => ({ ...b, id: nuevoIdSincro() }))
              setVerId(true)
              setError(null)
            }}
          >
            <RefreshCw size={18} aria-hidden /> Generar uno
          </button>
          <button className="btn-suave flex-1" onClick={() => setVerId(!verId)}>
            {verId ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            {verId ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        <p className="mt-1 text-xs texto-suave">
          Es la llave de tu carpeta: quien lo sepa entra, quien no lo sepa ni siquiera puede
          buscarla. Mejor uno generado que una palabra pensada por ti. El mismo en cada dispositivo.
        </p>
      </label>

      <label className="block">
        <span className="etiqueta">Contraseña de cifrado</span>
        <input
          type="password"
          className="campo"
          value={borrador.passphrase}
          onChange={(e) => setBorrador((b) => ({ ...b, passphrase: e.target.value }))}
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs texto-suave">
          La misma que usas en «Backup ahora», y la misma en los dos dispositivos: si no coincide,
          la copia del otro no se puede abrir.
        </p>
      </label>

      {error && (
        <p role="alert" className="text-sm font-medium text-acento">
          {error}
        </p>
      )}

      <button className="btn-primario w-full" onClick={guardar}>
        Guardar sincronización
      </button>

      {sincro && (
        <button
          className="btn-peligro w-full"
          onClick={() => {
            void guardarConfigSincro(undefined)
            setBorrador({ id: '', passphrase: '' })
            setError(null)
            mostrarAviso('Sincronización desactivada. El backup manual sigue disponible.')
          }}
        >
          <Trash2 size={18} aria-hidden /> Quitar sincronización
        </button>
      )}

      <div className="aviso flex items-start gap-2 text-xs">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Solo tú puedes abrir tus datos, con esta contraseña. Se queda guardada en este dispositivo
          para no tener que pedírtela cada vez. El PIN bloquea la pantalla, no el dispositivo: quien
          lo tenga desbloqueado puede ver la contraseña.
        </span>
      </div>
    </div>
  )
}

// ——————————————————————————— Bloque 1: servidor WebDAV ———————————————————————————

function SeccionWebdav({ webdav }: { webdav: ConfigWebdav | undefined }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [borrador, setBorrador] = useState<ConfigWebdav>(
    webdav ?? { url: '', usuario: '', password: '' },
  )
  const [probando, setProbando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  async function probar() {
    setResultado(null)
    setProbando(true)
    try {
      await probarConexion(borrador)
      await guardarConfigWebdav(borrador)
      setResultado({ ok: true, texto: 'Conexión correcta. Servidor guardado.' })
    } catch (err) {
      setResultado({
        ok: false,
        texto: err instanceof ErrorWebdav ? err.message : 'No se pudo conectar.',
      })
    } finally {
      setProbando(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="etiqueta">Dirección de la carpeta</span>
        <input
          className="campo"
          value={borrador.url}
          onChange={(e) => setBorrador({ ...borrador, url: e.target.value })}
          placeholder="https://nube.example/remote.php/dav/files/usuario/cuaderno"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="flex gap-2">
        <label className="block flex-1">
          <span className="etiqueta">Usuario</span>
          <input
            className="campo"
            value={borrador.usuario}
            onChange={(e) => setBorrador({ ...borrador, usuario: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="block flex-1">
          <span className="etiqueta">Contraseña</span>
          <input
            type="password"
            className="campo"
            value={borrador.password}
            onChange={(e) => setBorrador({ ...borrador, password: e.target.value })}
            autoComplete="off"
          />
        </label>
      </div>

      <button className="btn-primario w-full" onClick={() => void probar()} disabled={probando}>
        {probando ? 'Probando…' : 'Probar conexión y guardar'}
      </button>

      {resultado && (
        <p
          className={
            'text-sm font-medium ' + (resultado.ok ? 'text-lima-oscuro' : 'text-acento')
          }
        >
          {resultado.texto}
        </p>
      )}

      {webdav && (
        <button
          className="btn-peligro w-full"
          onClick={() => {
            void guardarConfigWebdav(undefined)
            setBorrador({ url: '', usuario: '', password: '' })
            setResultado(null)
            mostrarAviso('Servidor quitado.')
          }}
        >
          <Trash2 size={18} aria-hidden /> Quitar servidor
        </button>
      )}

      <div className="aviso flex items-start gap-2 text-xs">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Al servidor solo sube el fichero ya cifrado: no puede leer tus datos ni conoce la
          contraseña de la copia. Esa contraseña es distinta de la de este servidor y no se guarda
          en ningún sitio. La del servidor sí se guarda en este dispositivo, sin cifrar.
        </span>
      </div>
    </div>
  )
}

// ——————————————————————————— M9: PIN de acceso ———————————————————————————

function SeccionPin({ tienePin }: { tienePin: boolean }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [hoja, setHoja] = useState<'activar' | 'cambiar' | 'desactivar' | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {tienePin ? (
          <>
            <Check size={18} className="shrink-0 text-lima-oscuro" aria-hidden />
            <span className="font-semibold">PIN activado</span>
          </>
        ) : (
          <>
            <ShieldAlert size={18} className="shrink-0 texto-suave" aria-hidden />
            <span className="texto-suave">
              Sin PIN: cualquiera con el móvil desbloqueado puede abrir la app.
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {!tienePin && (
          <button className="btn-primario flex-1" onClick={() => setHoja('activar')}>
            <Lock size={18} aria-hidden /> Activar PIN
          </button>
        )}
        {tienePin && (
          <>
            <button className="btn-suave flex-1" onClick={() => setHoja('cambiar')}>
              Cambiar PIN
            </button>
            <button className="btn-peligro flex-1" onClick={() => setHoja('desactivar')}>
              <Trash2 size={18} aria-hidden /> Desactivar
            </button>
          </>
        )}
      </div>

      {(hoja === 'activar' || hoja === 'cambiar') && (
        <HojaDefinirPin
          pideActual={hoja === 'cambiar'}
          onCerrar={() => setHoja(null)}
          onListo={() => {
            const era = hoja
            setHoja(null)
            mostrarAviso(
              era === 'cambiar'
                ? 'PIN cambiado.'
                : 'PIN activado. Se pedirá al abrir la app y tras 5 min de inactividad.',
            )
          }}
        />
      )}

      {hoja === 'desactivar' && (
        <HojaDesactivarPin
          onCerrar={() => setHoja(null)}
          onListo={() => {
            setHoja(null)
            mostrarAviso('PIN desactivado.')
          }}
        />
      )}
    </div>
  )
}

function CampoPin({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string
  valor: string
  onCambio: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={LONGITUD_MAX_PIN}
        className="campo cifra text-center text-xl tracking-[0.5em]"
        value={valor}
        onChange={(e) => onCambio(e.target.value.replace(/[^0-9]/g, '').slice(0, LONGITUD_MAX_PIN))}
      />
    </label>
  )
}

function HojaDefinirPin({
  pideActual,
  onCerrar,
  onListo,
}: {
  pideActual: boolean
  onCerrar: () => void
  onListo: () => void
}) {
  const [actual, setActual] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError(null)
    if (pideActual && !(await comprobarPin(actual))) return setError('El PIN actual no es correcto.')
    if (!pinValido(nuevo))
      return setError(
        `El PIN debe tener entre ${LONGITUD_MIN_PIN} y ${LONGITUD_MAX_PIN} dígitos.`,
      )
    if (nuevo !== repetir) return setError('Los dos PIN no coinciden.')

    setGuardando(true)
    try {
      await definirPin(nuevo)
      onListo()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta titulo={pideActual ? 'Cambiar PIN' : 'Activar PIN'} onCerrar={onCerrar}>
      <div className="space-y-3">
        {pideActual && <CampoPin etiqueta="PIN actual" valor={actual} onCambio={setActual} />}
        <CampoPin etiqueta="PIN nuevo (4 a 6 dígitos)" valor={nuevo} onCambio={setNuevo} />
        <CampoPin etiqueta="Repite el PIN nuevo" valor={repetir} onCambio={setRepetir} />
        {error && (
          <p role="alert" className="text-sm font-medium text-acento">
            {error}
          </p>
        )}
        <button className="btn-primario w-full" onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar PIN'}
        </button>
      </div>
    </Hoja>
  )
}

function HojaDesactivarPin({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [comprobando, setComprobando] = useState(false)

  async function confirmar() {
    setError(null)
    setComprobando(true)
    try {
      if (!(await quitarPin(pin))) {
        setError('PIN incorrecto.')
        return
      }
      onListo()
    } finally {
      setComprobando(false)
    }
  }

  return (
    <Hoja abierta titulo="Desactivar PIN" onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-sm texto-suave">Introduce el PIN actual para desactivarlo.</p>
        <CampoPin etiqueta="PIN actual" valor={pin} onCambio={setPin} />
        {error && (
          <p role="alert" className="text-sm font-medium text-acento">
            {error}
          </p>
        )}
        <button className="btn-peligro w-full" onClick={() => void confirmar()} disabled={comprobando}>
          {comprobando ? 'Comprobando…' : 'Desactivar PIN'}
        </button>
      </div>
    </Hoja>
  )
}
