import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'

/**
 * Barra de navegación por fecha: flechas anterior/siguiente y un botón central
 * que abre el selector nativo de fecha. Sirve tanto para moverse día a día como
 * semana a semana (según qué haga cada flecha), reutilizando el mismo diseño en
 * Hoy y en el Planificador.
 *
 * El botón central enseña SIEMPRE el rango real que se está viendo, nunca un
 * rótulo fijo: en el Planificador ponía «Semana actual» aunque estuvieras tres
 * semanas más allá, y entonces la cabecera mentía sobre lo que hay debajo.
 *
 * «Volver a hoy» va DEBAJO, en su propia línea, y no dentro de la fila: ahí
 * aparecía de la nada al cambiar de fecha y empujaba «siguiente» hacia la
 * izquierda, así que el segundo toque en el mismo sitio te devolvía a hoy en
 * vez de avanzar otro día.
 */
export function NavegadorFecha({
  etiqueta,
  valor,
  esHoy,
  etiquetaHoy = 'Volver a hoy',
  onAnterior,
  onSiguiente,
  onElegir,
  onHoy,
  ariaAnterior = 'Anterior',
  ariaSiguiente = 'Siguiente',
}: {
  etiqueta: string
  valor: string
  esHoy: boolean
  etiquetaHoy?: string
  onAnterior: () => void
  onSiguiente: () => void
  onElegir: (iso: string) => void
  onHoy: () => void
  ariaAnterior?: string
  ariaSiguiente?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button className="btn-suave px-3" onClick={onAnterior} aria-label={ariaAnterior}>
          <ChevronLeft size={20} aria-hidden />
        </button>
        <label className="btn-fantasma relative flex flex-1 cursor-pointer items-center justify-center gap-2">
          <Calendar size={18} aria-hidden />
          <span className="truncate">{etiqueta}</span>
          <input
            type="date"
            value={valor}
            onChange={(e) => e.target.value && onElegir(e.target.value)}
            aria-label="Elegir fecha"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button className="btn-suave px-3" onClick={onSiguiente} aria-label={ariaSiguiente}>
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {!esHoy && (
        <button className="btn-suave w-full" onClick={onHoy}>
          <RotateCcw size={18} aria-hidden />
          {etiquetaHoy}
        </button>
      )}
    </div>
  )
}
