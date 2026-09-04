import { Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { CampoArea } from './Campo'
import { TextoMarkdown } from './TextoMarkdown'

/**
 * Campo de texto largo que se LEE formateado y se EDITA en crudo.
 *
 * La descripción de una sesión trae la jerarquía en markdown. En un textarea
 * plano eso se ve como un montón de `###` y `**`, que es peor que el texto
 * denso que venía a arreglar. Y renderizarla siempre impediría corregirla.
 *
 * De ahí los dos modos, con el de lectura por defecto: en la pista solo se lee,
 * y la edición es un acto deliberado —un botón, no un roce— para que un toque
 * accidental con el móvil en la mano no abra el teclado encima del texto. En
 * edición se ve el markdown tal cual, que es lo único honrado: lo que se teclea
 * es lo que se guarda.
 */
interface Props {
  id: string
  etiqueta: string
  valor: string
  onValor: (v: string) => void
  placeholder?: string
  /** Clase de altura del textarea en edición. */
  alto?: string
}

export function CampoTexto({ id, etiqueta, valor, onValor, placeholder, alto = 'h-64' }: Props) {
  const [editando, setEditando] = useState(false)
  const vacio = !valor.trim()

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="etiqueta mb-0" htmlFor={id}>
          {etiqueta}
        </label>
        <button
          className="btn-fantasma min-h-0 px-2 py-1 text-xs"
          onClick={() => setEditando((v) => !v)}
          aria-expanded={editando}
          aria-controls={id}
        >
          {editando ? <Check size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
          {editando ? 'Hecho' : 'Editar'}
        </button>
      </div>

      {editando ? (
        <CampoArea
          id={id}
          className={`campo ${alto} resize-none py-2 font-mono text-sm leading-6`}
          valor={valor}
          onValor={onValor}
          placeholder={placeholder}
        />
      ) : vacio ? (
        <button
          id={id}
          className="w-full rounded-xl border border-dashed border-borde px-3 py-4 text-left text-sm texto-suave dark:border-noche-borde"
          onClick={() => setEditando(true)}
        >
          {placeholder ?? 'Sin texto. Toca «Editar» para escribirlo.'}
        </button>
      ) : (
        <div id={id} className="rounded-xl2 border border-borde bg-white p-3 dark:border-noche-borde dark:bg-noche-superficie">
          <TextoMarkdown texto={valor} />
        </div>
      )}
    </div>
  )
}
