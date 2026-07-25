import { RotateCcw, Shuffle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { estadoCiclo, reiniciarCiclo, siguienteAleatorio, type EstadoSorteo } from '../db/aleatorio'
import { useCapaAbierta } from '../lib/capas'

/**
 * Sorteo «Alumno aleatorio» del Cuaderno (Bloque 4): a pantalla completa para
 * proyectar, con el mismo patrón que `Pizarra`. El ciclo vive en Dexie
 * (`db/aleatorio.ts`): sobrevive a recargas y a cerrar la app.
 */
export function SorteoAlumno({ grupoId, onCerrar }: { grupoId: string; onCerrar: () => void }) {
  const [estado, setEstado] = useState<EstadoSorteo | null>(null)
  const [soloPresentes, setSoloPresentes] = useState(false)
  useCapaAbierta(true)

  useEffect(() => {
    void estadoCiclo(grupoId).then(setEstado)
  }, [grupoId])

  async function sortear() {
    if (estado?.agotado) await reiniciarCiclo(grupoId)
    setEstado(await siguienteAleatorio(grupoId, { soloPresentes }))
  }

  async function reiniciar() {
    await reiniciarCiclo(grupoId)
    setEstado(await estadoCiclo(grupoId))
  }

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-primario-oscuro p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white dark:bg-noche-fondo">
      <button
        onClick={onCerrar}
        className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
        aria-label="Cerrar sorteo"
      >
        <X size={24} aria-hidden />
      </button>

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
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-3 font-semibold"
          onClick={() => void reiniciar()}
        >
          <RotateCcw size={18} aria-hidden />
          Reiniciar ciclo aleatorio
        </button>
      </div>
    </div>
  )
}
