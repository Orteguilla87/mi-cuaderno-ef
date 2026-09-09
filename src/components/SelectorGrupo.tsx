import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Grupo } from '../db/types'
import { BadgeEtapa } from './Badge'
import { variablesColor } from './SelectorColor'

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
  tono = 'claro',
}: {
  grupos: Grupo[]
  valor: string | null
  onCambio: (id: string) => void
  /**
   * `'cabecera'` lo pinta blanco sobre la barra primaria, donde es el TÍTULO de
   * la pantalla: tipografía de título, sin caja y sin borde. La lista
   * desplegada es la misma en los dos casos —fondo claro—, porque flota sobre
   * el contenido y no sobre la barra.
   *
   * Es una variante de tono, no un componente aparte: la lista de grupos, el
   * cierre al pulsar fuera, el Escape y el `role="listbox"` son los mismos, y
   * dos copias se separarían a la primera.
   */
  tono?: 'claro' | 'cabecera'
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
        className={
          tono === 'cabecera'
            ? 'flex w-full items-center gap-2 rounded-xl py-0.5 text-left text-white transition active:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50'
            : 'desplegable w-full'
        }
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Grupo: ${grupo?.nombre ?? 'ninguno'}. Cambiar de grupo`}
      >
        {grupo && (
          <span
            className="color-dato h-2.5 w-2.5 shrink-0 rounded-full"
            style={variablesColor(grupo.colorId ?? grupo.color)}
            aria-hidden
          />
        )}
        <span
          className={
            'min-w-0 flex-1 truncate text-left font-bold ' +
            (tono === 'cabecera' ? 'text-2xl tracking-tight apaisado:text-xl' : 'text-sm')
          }
        >
          {grupo?.nombre ?? 'Elige un grupo'}
        </span>
        {grupo && tono === 'claro' && <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />}
        <ChevronDown
          size={tono === 'cabecera' ? 22 : 18}
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
                  className="color-dato h-2.5 w-2.5 shrink-0 rounded-full"
                  style={variablesColor(g.colorId ?? g.color)}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.nombre}</span>
                {/* El grupo activo se marca con la palomita, no solo con el
                    fondo: el color no puede ser lo único que lo diga. */}
                {g.id === valor && (
                  <Check size={16} strokeWidth={3} className="shrink-0 text-primario dark:text-agua" aria-hidden />
                )}
                <BadgeEtapa etapa={g.etapa} nivel={g.nivel} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
