import { ChevronLeft } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { IndicadorSincro } from './IndicadorSincro'
import { useOrigen, volver } from '../lib/router'

/**
 * Barra sólida en primario: es lo primero que se ve y lo que da identidad a la
 * app. En pista, además, un bloque de color grande ancla la vista mejor que un
 * título sobre fondo claro.
 */
export function Cabecera({
  titulo,
  tituloSlot,
  subtitulo,
  atras = false,
  acciones,
}: {
  titulo: string
  /**
   * Sustituye al `<h1>` cuando el título no es solo texto: dentro de un grupo
   * es un desplegable que lleva a los demás. `titulo` sigue haciendo falta —es
   * lo que se lee si el slot no se pasa, y el nombre accesible del que sí—.
   */
  tituloSlot?: ReactNode
  subtitulo?: ReactNode
  atras?: boolean
  acciones?: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  // `atras` dice que la pantalla ADMITE volver; la flecha solo sale si de verdad
  // se llegó desde otra vista de la app (Bloque F1). Desde el menú, la URL
  // directa o una recarga, `history.back()` no llevaría a ningún sitio de la app.
  const origen = useOrigen()
  const conAtras = atras && origen !== null

  // Publica su alto como `--alto-cabecera`: lo que hace scroll por debajo de
  // esta barra fija (la rejilla del Cuaderno) necesita saber cuánto le tapa.
  // Varía con el subtítulo, las acciones y el giro de pantalla.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const raiz = document.documentElement.style
    const publicar = () => raiz.setProperty('--alto-cabecera', `${el.offsetHeight}px`)
    publicar()
    const observador = new ResizeObserver(publicar)
    observador.observe(el)
    return () => {
      observador.disconnect()
      raiz.removeProperty('--alto-cabecera')
    }
  }, [])

  return (
    // En apaisado la cabecera se aprieta: es una barra fija sobre una pantalla
    // de 390 px de alto, y cada píxel que no gasta aquí lo gana la rejilla o
    // la lista de debajo.
    <header ref={ref} className="sticky top-0 z-20 bg-primario px-4 pb-4 pt-3 text-white shadow-lg shadow-primario/20 dark:bg-primario-oscuro apaisado:pb-2 apaisado:pt-2 lg:py-2">
      <div className="flex items-center gap-2">
        {conAtras && (
          <button
            onClick={volver}
            className="-ml-3 flex min-h-tap min-w-tap items-center justify-center rounded-full text-white/90 transition active:bg-white/15
                       focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
            aria-label="Volver"
          >
            <ChevronLeft size={28} aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {tituloSlot ?? (
            <h1 className="truncate text-2xl font-bold tracking-tight apaisado:text-xl lg:text-xl lg:leading-7">
              {titulo}
            </h1>
          )}
          {/* Escritorio (Bloque F2): el subtítulo va bajo el título, en pequeño,
              dentro de la misma barra de ≤64 px. Solo lectura (texto y badges). */}
          {subtitulo && <div className="hidden truncate text-xs leading-4 text-agua-claro lg:block">{subtitulo}</div>}
        </div>
        <IndicadorSincro />
        {acciones}
      </div>
      {subtitulo && <div className="mt-1.5 text-sm text-agua-claro apaisado:mt-0.5 lg:hidden">{subtitulo}</div>}
    </header>
  )
}

/** Botón pensado para vivir dentro de la Cabecera, sobre fondo primario. */
export function AccionCabecera({
  children,
  onClick,
  destacada = false,
}: {
  children: ReactNode
  onClick: () => void
  destacada?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        // `.btn` da estructura, foco y active:scale; aquí solo se añade el
        // color, porque vive sobre fondo primario y ninguna variante del
        // sistema (pensadas para fondo claro) tiene contraste ahí.
        'btn focus-visible:ring-offset-primario dark:focus-visible:ring-offset-primario-oscuro ' +
        (destacada
          ? 'bg-hueso text-primario-oscuro shadow-sm'
          : 'border border-white/35 text-white active:bg-white/15 focus-visible:ring-white/50')
      }
    >
      {children}
    </button>
  )
}
