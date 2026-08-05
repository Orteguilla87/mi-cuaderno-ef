import { TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { AgenteVoz } from './components/AgenteVoz'
import { BloqueoPin } from './components/BloqueoPin'
import { BottomNav } from './components/BottomNav'
import { LimiteError } from './components/LimiteError'
import { NavLateral } from './components/NavLateral'
import { Snackbar } from './components/Snackbar'
import { useConfig } from './db/config'
import { sembrarCriterios } from './db/criterios'
import { obtenerCursoActivo } from './db/curso'
import { arrancar as arrancarSincro } from './db/sincro'
import { MS_INACTIVIDAD } from './lib/pin'
import { segmentos, useRuta } from './lib/router'
import { useBloqueo } from './store/bloqueo'
import { useUI } from './store/ui'
import { Ajustes } from './pages/Ajustes'
import { AlumnoDetalle } from './pages/AlumnoDetalle'
import { Calendario } from './pages/Calendario'
import { Cobertura } from './pages/Cobertura'
import { Cuaderno } from './pages/Cuaderno'
import { EdicionMasivaAlumnos } from './pages/EdicionMasivaAlumnos'
import { EnConstruccion } from './pages/EnConstruccion'
import { EquiposGenerador } from './pages/EquiposGenerador'
import { GrupoDetalle } from './pages/GrupoDetalle'
import { Grupos } from './pages/Grupos'
import { Herramientas } from './pages/Herramientas'
import { Hoy } from './pages/Hoy'
import { Infantil } from './pages/Infantil'
import { Informes } from './pages/Informes'
import { Juegos } from './pages/Juegos'
import { Mas } from './pages/Mas'
import { Observaciones } from './pages/Observaciones'
import { PaseLista } from './pages/PaseLista'
import { Planificador } from './pages/Planificador'
import { Rubricas } from './pages/Rubricas'
import { SesionDetalle } from './pages/SesionDetalle'

// Secciones cuyo contenido es una rejilla que de verdad aprovecha el ancho de
// escritorio (Cuaderno, Infantil, Rúbricas): el resto son texto y formularios,
// que a `lg:max-w-7xl` se estiraban a una medida de lectura absurda.
const SECCIONES_ANCHO_COMPLETO = new Set(['cuaderno', 'infantil', 'rubricas', 'cobertura'])

function anchoCompleto(ruta: string): boolean {
  return SECCIONES_ANCHO_COMPLETO.has(segmentos(ruta)[0] ?? 'hoy')
}

/**
 * Banner fijo cuando la semilla de criterios oficiales no valida. No se puede
 * descartar a propósito: mientras la tabla esté a medias, los selectores de
 * criterio ofrecen menos de los que hay y el informe de cobertura miente.
 */
function AvisoSemilla() {
  const errorSemilla = useUI((s) => s.errorSemilla)
  if (!errorSemilla) return null

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl2 border-2 border-acento bg-acento/10 p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-bold">
        <TriangleAlert size={18} className="shrink-0 text-acento" aria-hidden />
        Los criterios oficiales no se han cargado bien
      </p>
      <p className="mt-1 texto-suave">
        La evaluación se apoya en ellos, así que puede faltar algún criterio en los selectores y en
        el informe de cobertura. Revisa <code>seeds/criterios_primaria.json</code>.
      </p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs texto-suave">
        {errorSemilla}
      </pre>
    </div>
  )
}

function Contenido({ ruta }: { ruta: string }) {
  const [seccion, param, param2] = segmentos(ruta)

  switch (seccion) {
    case 'grupos':
      return param ? <GrupoDetalle grupoId={param} /> : <Grupos />
    case 'alumnos':
      return param ? <AlumnoDetalle alumnoId={param} /> : <Grupos />
    // /asistencia/:grupoId[/:fecha] — sin fecha, hoy.
    case 'asistencia':
      return param ? <PaseLista grupoId={param} fecha={param2} /> : <Grupos />
    case 'cuaderno':
      return <Cuaderno grupoId={param} />
    case 'infantil':
      return param ? <Infantil grupoId={param} /> : <Grupos />
    case 'rubricas':
      return <Rubricas />
    case 'planificador':
      return <Planificador />
    case 'sesiones':
      return param ? <SesionDetalle sesionId={param} /> : <Planificador />
    case 'juegos':
      return <Juegos />
    // /observaciones[/:grupoId[/:alumnoId]]
    case 'observaciones':
      return <Observaciones grupoId={param} alumnoId={param2} />
    case 'mas':
      return <Mas />
    case 'ajustes':
      return <Ajustes />
    case 'evaluacion':
      return <EnConstruccion titulo="Evaluación final" fase="fases 4 y 5" atras />
    case 'cobertura':
      return <Cobertura />
    case 'informes':
      return <Informes />
    case 'calendario':
      return <Calendario />
    case 'herramientas':
      return <Herramientas />
    // /equipos/:grupoId[/datos | /sesion-:sesionId]
    case 'equipos': {
      if (!param) return <Grupos />
      if (param2 === 'datos') return <EdicionMasivaAlumnos grupoId={param} />
      const sesionId = param2?.startsWith('sesion-') ? param2.slice(7) : undefined
      return <EquiposGenerador grupoId={param} sesionId={sesionId} />
    }
    case 'hoy':
    default:
      return <Hoy />
  }
}

export default function App() {
  const ruta = useRuta()
  const config = useConfig()
  const hayPin = !!config.pin
  const { bloqueado, bloquear, desbloquear } = useBloqueo()
  const capasAbiertas = useUI((s) => s.capasAbiertas)
  const fijarErrorSemilla = useUI((s) => s.fijarErrorSemilla)

  // Bloquea el scroll del fondo mientras haya una hoja/pantalla completa
  // abierta (§B7): un único punto de cambio sobre el contador que ya usa el
  // FAB de voz para retirarse, en vez de que cada hoja gestione su propio
  // `overflow` y se desincronicen al anidarse.
  useEffect(() => {
    document.body.style.overflow = capasAbiertas > 0 ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [capasAbiertas])

  // Tema y modo pista se aplican en <html> para que alcancen también a los portales.
  useEffect(() => {
    const raiz = document.documentElement
    const oscuro =
      config.tema === 'oscuro' ||
      (config.tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    raiz.classList.toggle('dark', oscuro)
    raiz.classList.toggle('pista', config.modoPista)
  }, [config.tema, config.modoPista])

  // Garantiza que existe un curso escolar activo desde el primer arranque, y
  // vuelca los criterios oficiales de los decretos (idempotente).
  //
  // Si la semilla no valida, el fallo se enseña y se deja enseñado: los
  // criterios son la referencia legal de toda la evaluación, y seguir con la
  // tabla a medias significaría selectores incompletos y una cobertura que
  // miente. Nunca en silencio.
  useEffect(() => {
    void obtenerCursoActivo()
    void sembrarCriterios().then(
      () => fijarErrorSemilla(null),
      (e: unknown) => {
        console.error('No se han podido sembrar los criterios oficiales', e)
        fijarErrorSemilla(e instanceof Error ? e.message : String(e))
      },
    )
  }, [fijarErrorSemilla])

  // Sincronización automática. Sin identificador configurado no hace nada y ni
  // siquiera descarga el SDK de Firebase.
  useEffect(() => {
    void arrancarSincro()
  }, [])

  // §1.7: bloquea en cuanto se sabe que hay PIN (arranque o al activarlo).
  useEffect(() => {
    if (hayPin) bloquear()
  }, [hayPin, bloquear])

  // §1.7: bloquea tras 5 min sin tocar la pantalla ni el teclado.
  useEffect(() => {
    if (!hayPin) return
    let temporizador: number
    const reiniciar = () => {
      window.clearTimeout(temporizador)
      temporizador = window.setTimeout(bloquear, MS_INACTIVIDAD)
    }
    const eventos = ['pointerdown', 'keydown'] as const
    for (const e of eventos) window.addEventListener(e, reiniciar)
    reiniciar()
    return () => {
      window.clearTimeout(temporizador)
      for (const e of eventos) window.removeEventListener(e, reiniciar)
    }
  }, [hayPin, bloquear])

  return (
    <div className="min-h-dvh lg:pl-60">
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-modal focus-visible:rounded-xl focus-visible:bg-primario focus-visible:px-4 focus-visible:py-2 focus-visible:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40"
      >
        Saltar al contenido
      </a>
      <NavLateral ruta={ruta} />
      <main
        id="contenido"
        className={
          // En apaisado NINGUNA sección se encajona en la medida de lectura de
          // vertical: el ancho es justo lo que sobra al girar, y dejar 200 px
          // de margen a cada lado es exactamente «estirar la vista vertical».
          // Lo que evita la línea de texto kilométrica no es el margen, son
          // las rejillas a dos columnas de cada pantalla.
          'carril-fab mx-auto max-w-lg md:max-w-3xl apaisado:max-w-none lg:px-6 ' +
          (anchoCompleto(ruta) ? 'lg:max-w-7xl' : 'lg:max-w-4xl')
        }
      >
        <AvisoSemilla />
        {/* key: al cambiar de ruta se reintenta el render en vez de quedarse el error pegado. */}
        <LimiteError key={ruta}>
          <Contenido ruta={ruta} />
        </LimiteError>
      </main>
      <AgenteVoz />
      <BottomNav ruta={ruta} />
      <Snackbar />
      {hayPin && bloqueado && <BloqueoPin onDesbloqueo={desbloquear} />}
    </div>
  )
}
