import type { LucideIcon } from 'lucide-react'
import { entradaActiva, entradaMenu, GRUPOS_LATERAL, raizDe, RUTA_AJUSTES } from '../lib/navegacion'
import { navegar } from '../lib/router'

/**
 * Barra lateral de escritorio (Bloque 6, `lg:` en adelante): sustituye a la
 * barra inferior + el botón «Más» por una única lista, ancho fijo de 15rem.
 * Mismo origen de rutas que `BottomNav`/`Mas.tsx` (`lib/navegacion.ts`).
 *
 * Bloque F1: agrupada por uso (`GRUPOS_LATERAL`), con Ajustes fijo abajo y UN
 * solo scroll —el de la barra entera, y solo si de verdad no cabe—. En
 * ventanas bajas (`bajo:`, <760 px de alto) las entradas se compactan a 36 px
 * para que las 15 quepan sin scroll en un portátil de 1536×695.
 *
 * Una sola entrada activa: `entradaActiva` decide cuál, nunca dos.
 */
export function NavLateral({ ruta }: { ruta: string }) {
  const activa = entradaActiva(raizDe(ruta))

  const item = (r: string) => {
    const e = entradaMenu(r)
    if (!e) return null
    return (
      <li key={r}>
        <ItemNav
          activa={activa === r}
          onClick={() => navegar(r, { raiz: true })}
          Icono={e.Icono}
          etiqueta={e.etiqueta}
        />
      </li>
    )
  }

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-y-0 left-0 z-nav hidden w-60 flex-col overflow-y-auto border-r border-borde bg-superficie p-3 lg:flex bajo:py-2 dark:border-noche-borde dark:bg-noche-superficie"
    >
      {/* No es un h1: cada página ya trae el suyo (Cabecera.tsx). Dos h1 a la
          vez rompen la jerarquía de encabezados en todo `lg:`. */}
      <p className="px-2 pb-3 pt-1 text-xl font-bold tracking-tight text-primario bajo:pb-1 bajo:pt-0 bajo:text-lg dark:text-agua">
        Cuaderno EF
      </p>

      {GRUPOS_LATERAL.map(({ titulo, rutas }) => (
        <section key={titulo} aria-label={titulo} className="pt-2 bajo:pt-1">
          {/* No es un encabezado: iría antes del h1 de la página y rompería la
              jerarquía. El nombre del grupo lo da el aria-label de la sección. */}
          <p aria-hidden className="px-3 pb-1 text-xs font-semibold texto-suave bajo:pb-0.5">
            {titulo}
          </p>
          <ul className="space-y-0.5">{rutas.map(item)}</ul>
        </section>
      ))}

      <ul className="mt-auto border-t border-borde pt-2 dark:border-noche-borde bajo:pt-1">
        {item(RUTA_AJUSTES)}
      </ul>
    </nav>
  )
}

function ItemNav({
  activa,
  onClick,
  Icono,
  etiqueta,
}: {
  activa: boolean
  onClick: () => void
  Icono: LucideIcon
  etiqueta: string
}) {
  return (
    <button
      onClick={onClick}
      aria-current={activa ? 'page' : undefined}
      title={etiqueta}
      className={
        'flex min-h-tap w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition bajo:min-h-[36px] ' +
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
        'dark:focus-visible:ring-agua/50 ' +
        (activa
          ? 'bg-agua-claro text-primario dark:bg-primario dark:text-white'
          : 'texto-suave hover:bg-agua-claro/60 active:bg-agua-claro/60 dark:hover:bg-noche-elevada dark:active:bg-noche-elevada')
      }
    >
      <Icono size={20} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
    </button>
  )
}
