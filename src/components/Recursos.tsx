import { Link2, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Recurso } from '../db/types'
import { Campo } from './Campo'
import { TituloSeccion } from './TituloSeccion'

/**
 * «Enlaces y notas» de una sesión: la misma lista, con los mismos campos, tanto
 * en la sesión real del calendario como en la sesión planificada dentro de una
 * unidad. Vive aquí y no en la pantalla de la sesión porque los dos sitios la
 * necesitan idéntica, en las dos etapas.
 */
export function Recursos({
  recursos,
  onCambio,
}: {
  recursos: Recurso[]
  onCambio: (r: Recurso[]) => void
}) {
  const [tipo, setTipo] = useState<Recurso['tipo']>('enlace')
  const [valor, setValor] = useState('')

  function anadir() {
    if (!valor.trim()) return
    onCambio([...recursos, { tipo, valor: valor.trim() }])
    setValor('')
  }

  return (
    <section>
      <TituloSeccion>Enlaces y notas</TituloSeccion>

      {recursos.length > 0 && (
        <ul className="mb-2 space-y-2">
          {recursos.map((r, i) => (
            <li
              key={`${r.tipo}-${i}`}
              className="flex items-center gap-2 rounded-xl border border-borde bg-superficie p-2 dark:border-noche-borde dark:bg-noche-superficie"
            >
              {r.tipo === 'enlace' ? (
                <Link2 size={16} className="shrink-0 text-primario" aria-hidden />
              ) : (
                <StickyNote size={16} className="shrink-0 text-primario" aria-hidden />
              )}
              {r.tipo === 'enlace' ? (
                <a
                  href={r.valor}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-primario underline dark:text-agua"
                >
                  {r.valor}
                </a>
              ) : (
                <span className="min-w-0 flex-1 text-sm">{r.valor}</span>
              )}
              <button
                onClick={() => onCambio(recursos.filter((_, j) => j !== i))}
                className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                aria-label="Quitar recurso"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <select
          className="campo w-28 shrink-0"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as Recurso['tipo'])}
          aria-label="Tipo de recurso"
        >
          <option value="enlace">Enlace</option>
          <option value="nota">Nota</option>
        </select>
        <Campo
          className="campo flex-1"
          valor={valor}
          onValor={setValor}
          onKeyDown={(e) => e.key === 'Enter' && anadir()}
          placeholder={tipo === 'enlace' ? 'https://…' : 'Recordar traer petos'}
          aria-label="Valor del recurso"
        />
        <button
          className="btn-suave px-3"
          onClick={anadir}
          disabled={!valor.trim()}
          aria-label="Añadir recurso"
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </section>
  )
}
