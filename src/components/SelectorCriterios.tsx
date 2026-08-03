import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { criteriosDeGrupo } from '../db/criterios'
import type { Criterio } from '../db/types'
import { useLiveQuery } from 'dexie-react-hooks'

/**
 * Selector de criterios del decreto, siempre filtrado por el ciclo de un curso
 * (nunca los 46 de golpe). Agrupado por competencia específica, con el código
 * de un toque y el texto completo en `title` (desktop) o al expandir (mobile).
 *
 * Va plegado en un desplegable con el contador visible: en una unidad con 6–10
 * criterios, verlos todos desplegados de entrada sería más ruido que ayuda.
 */
export function SelectorCriterios({
  nivel,
  seleccionados,
  onCambio,
}: {
  /** Curso 1–6: determina el ciclo y por tanto qué criterios se ofrecen. */
  nivel: number
  seleccionados: string[]
  onCambio: (criterios: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const criterios = useLiveQuery(() => criteriosDeGrupo('primaria', nivel), [nivel])

  const porCompetencia = new Map<string, Criterio[]>()
  for (const c of criterios ?? []) {
    const lista = porCompetencia.get(c.competenciaCodigo) ?? []
    lista.push(c)
    porCompetencia.set(c.competenciaCodigo, lista)
  }

  function alternar(id: string) {
    onCambio(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id])
  }

  return (
    <div>
      <button
        type="button"
        className="desplegable w-full"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        <span className="flex-1 text-left">
          <span className="block text-sm font-bold">Criterios de evaluación</span>
          <span className="block text-xs texto-suave">
            {seleccionados.length === 0
              ? 'Ninguno seleccionado'
              : `${seleccionados.length} ${seleccionados.length === 1 ? 'criterio' : 'criterios'} seleccionados`}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={'shrink-0 transition-transform ' + (abierto ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {abierto && (
        <div className="mt-2 space-y-3 rounded-xl2 border border-borde bg-white p-3 dark:border-noche-borde dark:bg-noche-superficie">
          {(criterios ?? []).length === 0 && (
            <p className="text-sm texto-suave">Cargando criterios…</p>
          )}
          {[...porCompetencia.entries()].map(([competencia, lista]) => (
            <div key={competencia}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-primario dark:text-agua">
                {competencia}: {lista[0].competenciaTexto}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lista.map((c) => {
                  const activo = seleccionados.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.texto}
                      aria-pressed={activo}
                      onClick={() => alternar(c.id)}
                      className={
                        'pildora min-h-[36px] px-2.5 text-xs font-bold ' +
                        (activo
                          ? 'bg-primario text-white'
                          : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                      }
                    >
                      {c.codigo}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
