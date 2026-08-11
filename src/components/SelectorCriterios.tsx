import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { criteriosDeGrupo } from '../db/criterios'
import type { Criterio, Etapa } from '../db/types'
import { useLiveQuery } from 'dexie-react-hooks'
import { LineaPlegable } from './LineaPlegable'

/**
 * Selector de criterios del decreto. La fuente la elige la ETAPA, nunca el
 * usuario: en Primaria, los del ciclo del curso (nunca los 46 de golpe); en
 * Infantil, los 56 del 2.º ciclo del Decreto 36/2022, que son los mismos para
 * 3, 4 y 5 años y por eso no se filtran por curso.
 *
 * Todo plegado por defecto, 1 elemento = 1 línea: la competencia con su texto
 * truncado y desplegable, y debajo sus criterios igual. El código del
 * criterio (p. ej. «1.1.») es lo único seleccionable — desplegar el texto no
 * marca ni desmarca nada, son dos botones independientes en la misma fila.
 *
 * Va plegado en un desplegable con el contador visible: en una unidad con 6–10
 * criterios, verlos todos desplegados de entrada sería más ruido que ayuda.
 *
 * El vínculo es desnudo: seleccionado o no. Ni peso, ni porcentaje, ni
 * instrumento — ni en Infantil, donde no existe ponderación ninguna, ni en
 * Primaria, donde el peso vive en la columna y en la fila, no aquí.
 */
export function SelectorCriterios({
  etapa,
  nivel,
  seleccionados,
  onCambio,
}: {
  etapa: Etapa
  /** Curso 1–6: determina el ciclo en Primaria. En Infantil se ignora. */
  nivel: number
  seleccionados: string[]
  onCambio: (criterios: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  // En Infantil se piden las tres áreas: la I es la de Psicomotricidad y va
  // abierta, pero las otras dos deben poder usarse.
  const criterios = useLiveQuery(
    () => criteriosDeGrupo(etapa, nivel, etapa === 'primaria'),
    [etapa, nivel],
  )

  function alternar(id: string) {
    onCambio(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id])
  }

  const lista = criterios ?? []

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
          {lista.length === 0 && <p className="text-sm texto-suave">Cargando criterios…</p>}

          {etapa === 'infantil' ? (
            <PorAreas criterios={lista} seleccionados={seleccionados} onAlternar={alternar} />
          ) : (
            <PorCompetencias criterios={lista} seleccionados={seleccionados} onAlternar={alternar} />
          )}
        </div>
      )}
    </div>
  )
}

/** Agrupa conservando el orden de llegada, que ya viene ordenado por código. */
function agrupar(lista: Criterio[], clave: (c: Criterio) => string): Map<string, Criterio[]> {
  const mapa = new Map<string, Criterio[]>()
  for (const c of lista) {
    const k = clave(c)
    const previa = mapa.get(k) ?? []
    previa.push(c)
    mapa.set(k, previa)
  }
  return mapa
}

/**
 * Infantil: área → competencia específica → criterios. El área hace falta
 * porque los 56 criterios del 2.º ciclo se reparten en tres, y verlos seguidos
 * sin esa separación no dice nada.
 */
function PorAreas({
  criterios,
  seleccionados,
  onAlternar,
}: {
  criterios: Criterio[]
  seleccionados: string[]
  onAlternar: (id: string) => void
}) {
  const porArea = agrupar(criterios, (c) => c.areaCodigo ?? '')

  return (
    <div className="space-y-2">
      {[...porArea.entries()].map(([codigo, deLaArea]) => (
        <Area
          key={codigo}
          codigo={codigo}
          nombre={deLaArea[0].areaNombre ?? ''}
          // El Área I es la de Psicomotricidad: abierta de entrada, sin que eso
          // impida usar las otras dos.
          abiertaPorDefecto={!!deLaArea[0].principal}
          criterios={deLaArea}
          seleccionados={seleccionados}
          onAlternar={onAlternar}
        />
      ))}
    </div>
  )
}

function Area({
  codigo,
  nombre,
  abiertaPorDefecto,
  criterios,
  seleccionados,
  onAlternar,
}: {
  codigo: string
  nombre: string
  abiertaPorDefecto: boolean
  criterios: Criterio[]
  seleccionados: string[]
  onAlternar: (id: string) => void
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto)
  const marcados = criterios.filter((c) => seleccionados.includes(c.id)).length

  return (
    <div className="rounded-xl border border-borde dark:border-noche-borde">
      <button
        type="button"
        className="desplegable w-full border-0 bg-agua-claro dark:bg-noche-elevada"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
      >
        <span className="flex-1 text-left">
          <span className="block text-sm font-bold">
            Área {codigo}. {nombre}
          </span>
          <span className="block text-xs texto-suave">
            {marcados > 0
              ? `${marcados} de ${criterios.length} seleccionados`
              : `${criterios.length} criterios`}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={'shrink-0 transition-transform ' + (abierta ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {abierta && (
        <div className="space-y-3 p-3">
          <PorCompetencias
            criterios={criterios}
            seleccionados={seleccionados}
            onAlternar={onAlternar}
          />
        </div>
      )}
    </div>
  )
}

/** El nivel común a las dos etapas: competencia específica y sus criterios. */
function PorCompetencias({
  criterios,
  seleccionados,
  onAlternar,
}: {
  criterios: Criterio[]
  seleccionados: string[]
  onAlternar: (id: string) => void
}) {
  const porCompetencia = agrupar(criterios, (c) => c.competenciaCodigo)

  return (
    <>
      {[...porCompetencia.entries()].map(([competencia, lista]) => (
        <div key={competencia} className="space-y-1.5">
          <LineaPlegable
            texto={`${competencia}: ${lista[0].competenciaTexto}`}
            textoClassName="text-xs font-bold uppercase tracking-wide text-primario dark:text-agua"
            etiquetaExpandir={`Ver texto completo de ${competencia}`}
            etiquetaContraer={`Contraer texto de ${competencia}`}
          />
          <ul className="space-y-1">
            {lista.map((c) => {
              const activo = seleccionados.includes(c.id)
              return (
                <li key={c.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={activo}
                    aria-label={`${activo ? 'Quitar' : 'Añadir'} criterio ${c.codigo}`}
                    onClick={() => onAlternar(c.id)}
                    className={
                      'pildora min-h-[36px] shrink-0 px-2.5 text-xs font-bold ' +
                      (activo
                        ? 'bg-primario text-white'
                        : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                    }
                  >
                    {c.codigo}
                  </button>
                  <LineaPlegable
                    texto={c.texto}
                    className="flex-1"
                    textoClassName="text-sm"
                    etiquetaExpandir={`Ver texto completo del criterio ${c.codigo}`}
                    etiquetaContraer={`Contraer texto del criterio ${c.codigo}`}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </>
  )
}
