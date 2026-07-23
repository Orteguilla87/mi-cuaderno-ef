import { useUI } from '../store/ui'

/** Snackbar con Deshacer: acompaña a toda escritura (§7). */
export function Snackbar() {
  const avisos = useUI((s) => s.avisos)
  const cerrarAviso = useUI((s) => s.cerrarAviso)

  if (avisos.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-3">
      {avisos.map((a) => (
        <div
          key={a.id}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-primario-oscuro px-4 py-3 text-white shadow-xl"
          role="status"
        >
          <span className="flex-1 text-sm font-medium">{a.texto}</span>
          {a.deshacer && (
            <button
              className="min-h-tap rounded-lg px-3 font-bold text-agua active:bg-white/15"
              onClick={async () => {
                cerrarAviso(a.id)
                await a.deshacer!()
              }}
            >
              Deshacer
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
