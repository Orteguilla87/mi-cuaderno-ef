import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Grupo } from '../db/types'
import { BadgeEtapa } from './Badge'

/**
 * Desplegable de grupo (§ Bloque 6.2): sustituye a las píldoras sueltas, que en
 * Cuaderno y Planificador solo dejaban ver 2-3 grupos sin desbordar. Respeta
 * EXACTAMENTE el orden que trae `grupos` — quien llama ya lo ordena por
 * `Grupo.orden`, el mismo que se arrastra en Grupos.
 */
export function SelectorGrupo({
  grupos,
  valor,
  onCambio,
}: {
  grupos: Grupo[]
  valor: string | null
  onCambio: (id: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const grupo = grupos.find((g) => g.id === valor) ?? grupos[0]

  useEffect(() => {
    if (!abierto) return
    const alPulsarFuera = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false)
    }
    const alPulsarTecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    window.addEventListener('mousedown', alPulsarFuera)
    window.addEventListener('keydown', alPulsarTecla)
    return () => {
      window.removeEventListener('mousedown', alPulsarFuera)
      window.removeEventListener('keydown', alPulsarTecla)
    }
  }, [abierto])

  if (grupos.length === 0) return null

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        className="desplegable w-full"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
      >
        {grupo && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: grupo.color }}
            aria-hidden
          />
        )}
        <span className="min-w-0 flex-1 truncate text-left text-sm font-bold">
          {grupo?.nombre ?? 'Elige un grupo'}
        </span>
        {grupo && <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />}
        <ChevronDown
          size={18}
          className={'shrink-0 transition-transform ' + (abierto ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {abierto && (
        <ul
          role="listbox"
          aria-label="Grupo"
          className="absolute left-0 right-0 top-full z-hoja mt-1 max-h-72 overflow-y-auto rounded-xl2 border border-borde bg-superficie p-1.5 shadow-xl dark:border-noche-borde dark:bg-noche-superficie"
        >
          {grupos.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                role="option"
                aria-selected={g.id === valor}
                onClick={() => {
                  onCambio(g.id)
                  setAbierto(false)
                }}
                className={
                  'flex min-h-tap w-full items-center gap-2 rounded-xl px-2.5 text-left transition ' +
                  (g.id === valor
                    ? 'bg-agua-claro dark:bg-noche-elevada'
                    : 'hover:bg-agua-claro dark:hover:bg-noche-elevada')
                }
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.nombre}</span>
                <BadgeEtapa etapa={g.etapa} nivel={g.nivel} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
