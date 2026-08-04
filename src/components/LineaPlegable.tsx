import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

/**
 * Una línea de texto truncada por CSS (no por longitud de caracteres, para
 * que se adapte al ancho real) con un chevron que la despliega. Pensada para
 * vivir junto a otro control seleccionable en la misma fila (p. ej. el
 * código de un criterio): el propio texto y el chevron son el único target
 * de "leer más", nunca de seleccionar.
 */
export function LineaPlegable({
  texto,
  abierto: abiertoControlado,
  onCambio,
  className = '',
  textoClassName = '',
  etiquetaContraer = 'Contraer texto',
  etiquetaExpandir = 'Ver texto completo',
}: {
  texto: string
  /** Modo controlado: si se pasa junto con `onCambio`, el estado vive fuera. */
  abierto?: boolean
  onCambio?: (abierto: boolean) => void
  className?: string
  textoClassName?: string
  etiquetaContraer?: string
  etiquetaExpandir?: string
}) {
  const [abiertoLocal, setAbiertoLocal] = useState(false)
  const abierto = abiertoControlado ?? abiertoLocal

  function alternar() {
    const siguiente = !abierto
    if (onCambio) onCambio(siguiente)
    else setAbiertoLocal(siguiente)
  }

  return (
    <div className={'flex min-w-0 items-start gap-1 ' + className}>
      <span className={'min-w-0 flex-1 ' + (abierto ? 'whitespace-pre-wrap' : 'truncate') + ' ' + textoClassName}>
        {texto}
      </span>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-label={abierto ? etiquetaContraer : etiquetaExpandir}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-tinta-tenue hover:bg-agua-claro dark:hover:bg-noche-elevada"
      >
        <ChevronDown
          size={16}
          className={'transition-transform ' + (abierto ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>
    </div>
  )
}
