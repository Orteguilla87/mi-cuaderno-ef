import { useUI } from '../store/ui'

/**
 * Aviso con Deshacer: acompaña a toda escritura (§7).
 *
 * Solo hay UNO a la vez (cola, no pila) y se coloca por encima del FAB de voz
 * con `.capa-aviso`, para que el micrófono no tape nunca el botón «Deshacer».
 */
export function Snackbar() {
  const aviso = useUI((s) => s.aviso)
  const cerrarAviso = useUI((s) => s.cerrarAviso)

  if (!aviso) return null

  return (
    <div className="capa-aviso pointer-events-none fixed inset-x-0 z-aviso flex justify-center px-3">
      <div
        // key: el aviso nuevo reemplaza al anterior, y al remontar se reinicia
        // la animación de entrada en vez de cambiar el texto en silencio.
        key={aviso.id}
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-primario-oscuro px-4 py-3 text-white shadow-xl"
        role="status"
      >
        <span className="flex-1 text-sm font-medium">{aviso.texto}</span>
        {aviso.deshacer && (
          <button
            className="min-h-tap rounded-lg px-3 font-bold text-agua active:bg-white/15"
            onClick={async () => {
              cerrarAviso(aviso.id)
              await aviso.deshacer!()
            }}
          >
            Deshacer
          </button>
        )}
      </div>
    </div>
  )
}
