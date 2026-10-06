import { RotateCcw, Shuffle, TableProperties, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { estadoCiclo, reiniciarCiclo, siguienteAleatorio, type EstadoSorteo } from '../db/aleatorio'
import { useCapaAbierta } from '../lib/capas'
import { verAlumnoEnCuaderno } from '../store/filaCuaderno'

/** Lo que espera el segundo toque de «Ver alumno» antes de volver a su estado. */
const ESPERA_CONFIRMACION_MS = 4000

/**
 * Sorteo «Alumno aleatorio» del Cuaderno (Bloque 4): a pantalla completa para
 * proyectar, con el mismo patrón que `Pizarra`. El ciclo vive en Dexie
 * (`db/aleatorio.ts`): sobrevive a recargas y a cerrar la app.
 */
export function SorteoAlumno({ grupoId, onCerrar }: { grupoId: string; onCerrar: () => void }) {
  const [estado, setEstado] = useState<EstadoSorteo | null>(null)
  const [soloPresentes, setSoloPresentes] = useState(false)
  /**
   * «Ver alumno» pide DOS toques. Esta pantalla se proyecta en la PDI, y el
   * Cuaderno enseña a toda la clase con sus notas y etiquetas: el primer toque
   * solo avisa de eso, y hace falta un segundo para salir. Además el botón es
   * pequeño, discreto y está en la esquina contraria a «Sortear».
   */
  const [confirmandoVer, setConfirmandoVer] = useState(false)
  useCapaAbierta(true)

  useEffect(() => {
    if (!confirmandoVer) return
    const t = window.setTimeout(() => setConfirmandoVer(false), ESPERA_CONFIRMACION_MS)
    return () => window.clearTimeout(t)
  }, [confirmandoVer])

  useEffect(() => {
    void estadoCiclo(grupoId).then(setEstado)
  }, [grupoId])

  async function sortear() {
    setConfirmandoVer(false)
    if (estado?.agotado) await reiniciarCiclo(grupoId)
    setEstado(await siguienteAleatorio(grupoId, { soloPresentes }))
  }

  function verAlumno() {
    const elegido = estado?.elegido
    if (!elegido) return
    if (!confirmandoVer) return setConfirmandoVer(true)
    onCerrar()
    verAlumnoEnCuaderno(grupoId, elegido.id)
  }

  async function reiniciar() {
    await reiniciarCiclo(grupoId)
    setEstado(await estadoCiclo(grupoId))
  }

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-primario-oscuro p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white dark:bg-noche-fondo">
      <button
        onClick={onCerrar}
        className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition
                   hover:bg-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        aria-label="Cerrar sorteo"
      >
        <X size={24} aria-hidden />
      </button>

      {estado?.elegido && !estado.agotado && (
        <button
          onClick={verAlumno}
          className={
            'absolute left-4 top-4 flex min-h-[48px] max-w-[70%] items-center gap-2 rounded-xl px-3 text-left text-sm transition ' +
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 ' +
            (confirmandoVer ? 'bg-white/20 font-semibold' : 'bg-transparent text-white/60 hover:text-white')
          }
          aria-label={
            confirmandoVer
              ? 'Confirmar: abrir el Cuaderno de toda la clase'
              : `Ver a ${estado.elegido.alias || estado.elegido.nombre} en el Cuaderno`
          }
        >
          <TableProperties size={18} aria-hidden className="shrink-0" />
          {confirmandoVer ? 'Abre el Cuaderno de toda la clase. Toca otra vez' : 'Ver alumno'}
        </button>
      )}

      <div className="mt-16 flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {estado?.hayAsistenciaHoy && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={soloPresentes}
              onChange={(e) => setSoloPresentes(e.target.checked)}
              className="h-5 w-5"
            />
            Solo presentes hoy
          </label>
        )}

        {estado?.agotado ? (
          <p className="text-2xl font-bold">
            Han salido todos ({estado.yaSalieron} de {estado.total})
          </p>
        ) : estado?.elegido ? (
          <p className="text-5xl font-bold">{estado.elegido.alias || estado.elegido.nombre}</p>
        ) : (
          <p className="text-xl texto-suave">Toca «Sortear» para empezar.</p>
        )}

        {estado && estado.total > 0 && (
          <p className="cifra text-lg text-agua">
            {estado.yaSalieron} de {estado.total}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          className="btn-primario flex w-full items-center justify-center gap-2 bg-white text-primario-oscuro"
          onClick={() => void sortear()}
          disabled={estado?.total === 0}
        >
          <Shuffle size={20} aria-hidden />
          {estado?.agotado ? 'Reiniciar y seguir' : 'Sortear'}
        </button>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-semibold transition
                     hover:bg-white/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
          onClick={() => void reiniciar()}
        >
          <RotateCcw size={18} aria-hidden />
          Reiniciar ciclo aleatorio
        </button>
      </div>
    </div>
  )
}
