import { useEffect } from 'react'
import { AgenteVoz } from './components/AgenteVoz'
import { BottomNav } from './components/BottomNav'
import { LimiteError } from './components/LimiteError'
import { Snackbar } from './components/Snackbar'
import { useConfig } from './db/config'
import { sembrarCriterios } from './db/criterios'
import { obtenerCursoActivo } from './db/curso'
import { segmentos, useRuta } from './lib/router'
import { Ajustes } from './pages/Ajustes'
import { AlumnoDetalle } from './pages/AlumnoDetalle'
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
      return <Cuaderno />
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
    case 'informes':
      return <Informes />
    case 'calendario':
      return <EnConstruccion titulo="Calendario" fase="fase 8" atras />
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
  useEffect(() => {
    void obtenerCursoActivo()
    void sembrarCriterios()
  }, [])

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      {/* key: al cambiar de ruta se reintenta el render en vez de quedarse el error pegado. */}
      <LimiteError key={ruta}>
        <Contenido ruta={ruta} />
      </LimiteError>
      <AgenteVoz />
      <BottomNav ruta={ruta} />
      <Snackbar />
    </div>
  )
}
