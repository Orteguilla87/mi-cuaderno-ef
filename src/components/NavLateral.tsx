import type { LucideIcon } from 'lucide-react'
import { ENTRADAS_MAS, PESTANAS } from '../lib/navegacion'
import { navegar } from '../lib/router'

/**
 * Barra lateral de escritorio (Bloque 6, `lg:` en adelante): sustituye a la
 * barra inferior + el botón «Más» por una única lista, ancho fijo de 15rem.
 * Mismo origen de rutas que `BottomNav`/`Mas.tsx` (`lib/navegacion.ts`).
 */
export function NavLateral({ ruta }: { ruta: string }) {
  const raiz = ruta.split('/')[1] || 'hoy'

  return (
    <aside className="fixed inset-y-0 left-0 z-nav hidden w-60 flex-col border-r border-borde bg-superficie p-3 lg:flex dark:border-noche-borde dark:bg-noche-superficie">
      <h1 className="px-2 pb-4 pt-1 text-xl font-bold tracking-tight text-primario dark:text-agua">
        Cuaderno EF
      </h1>

      <ul className="space-y-1">
        {PESTANAS.map(({ ruta: r, etiqueta, Icono, incluye }) => {
          const activa = r === `/${raiz}` || !!incluye?.includes(raiz)
          return (
            <li key={r}>
              <ItemNav activa={activa} onClick={() => navegar(r)} Icono={Icono} etiqueta={etiqueta} />
            </li>
          )
        })}
      </ul>

      <div className="my-3 border-t border-borde dark:border-noche-borde" />

      <ul className="space-y-1 overflow-y-auto">
        {ENTRADAS_MAS.map(({ ruta: r, titulo, Icono }) => {
          const seccion = r.slice(1)
          const activa = raiz === seccion
          return (
            <li key={r}>
              <ItemNav activa={activa} onClick={() => navegar(r)} Icono={Icono} etiqueta={titulo} />
            </li>
          )
        })}
      </ul>
    </aside>
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
      className={
        'flex min-h-tap w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ' +
        (activa
          ? 'bg-agua-claro text-primario dark:bg-primario dark:text-white'
          : 'texto-suave active:bg-agua-claro/60 dark:active:bg-noche-elevada')
      }
    >
      <Icono size={20} aria-hidden />
      {etiqueta}
    </button>
  )
}
