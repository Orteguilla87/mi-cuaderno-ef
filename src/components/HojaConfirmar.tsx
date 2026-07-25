import type { ReactNode } from 'react'
import { Hoja } from './Hoja'

/**
 * Confirmación de una acción destructiva, como hoja propia y no como
 * `window.confirm()` nativo: el diálogo del navegador es bloqueante, no
 * respeta el sistema visual y en una PWA de iOS deja ver el origen.
 */
export function HojaConfirmar({
  abierta,
  titulo,
  descripcion,
  textoConfirmar = 'Eliminar',
  onConfirmar,
  onCerrar,
}: {
  abierta: boolean
  titulo: string
  descripcion: ReactNode
  textoConfirmar?: string
  onConfirmar: () => void | Promise<void>
  onCerrar: () => void
}) {
  return (
    <Hoja abierta={abierta} titulo={titulo} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">{descripcion}</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-suave" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            className="btn-peligro"
            onClick={() => {
              onCerrar()
              void onConfirmar()
            }}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </Hoja>
  )
}
