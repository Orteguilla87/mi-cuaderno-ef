import { X } from 'lucide-react'
import { useState } from 'react'
import { useCapaAbierta } from '../lib/capas'

export interface EquipoPizarra {
  nombre: string
  color: string
  /** Nombres a mostrar, ya resueltos: la pizarra nunca ve ids ni ningún otro dato. */
  miembros: string[]
}

/**
 * Modo pizarra (§ generador de equipos): a pantalla completa para proyectar.
 * SOLO nombres. Nunca nivel, género ni apoyos: ni siquiera llegan como prop.
 */
export function Pizarra({
  equipos,
  onCerrar,
}: {
  equipos: EquipoPizarra[]
  onCerrar: () => void
}) {
  const [revelados, setRevelados] = useState<Set<number>>(new Set())
  useCapaAbierta(true)

  function revelar(i: number) {
    setRevelados((prev) => new Set(prev).add(i))
  }

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-primario-oscuro p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:bg-noche-fondo">
      <button
        onClick={onCerrar}
        className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white
                   focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        aria-label="Cerrar modo pizarra"
      >
        <X size={24} aria-hidden />
      </button>

      <div className="mt-16 grid flex-1 grid-cols-2 gap-4 overflow-y-auto">
        {equipos.map((e, i) => {
          const visible = revelados.has(i)
          return (
            <button
              key={i}
              onClick={() => revelar(i)}
              className="flex flex-col rounded-xl2 border-4 p-4 text-left transition
                         focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              style={{ borderColor: e.color, backgroundColor: visible ? `${e.color}22` : undefined }}
            >
              <span className="text-2xl font-bold" style={{ color: e.color }}>
                {e.nombre}
              </span>
              {visible ? (
                <ul className="mt-3 space-y-1.5">
                  {e.miembros.map((nombre) => (
                    <li key={nombre} className="text-lg font-semibold text-white">
                      {nombre}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="mt-3 text-lg font-semibold text-white/60">
                  Toca para revelar ({e.miembros.length})
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
