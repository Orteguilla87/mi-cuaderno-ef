import { MoreHorizontal } from 'lucide-react'
import { PESTANAS, type Pestana } from '../lib/navegacion'
import { navegar } from '../lib/router'

/**
 * Navegación inferior de §5: Hoy · Cuaderno · Grupos · Planificador · Más.
 *
 * Iconos de `lucide-react` (§3), nunca emojis: el emoji cambia de forma y color
 * en cada plataforma y rompe la identidad de la app. Las cuatro primeras
 * pestañas vienen de `lib/navegacion.ts`, compartido con `NavLateral`
 * (Bloque 6): un solo origen de rutas para las dos presentaciones.
 */
const PESTANA_MAS: Pestana = {
  ruta: '/mas',
  etiqueta: 'Más',
  Icono: MoreHorizontal,
  // Todo lo que cuelga de «Más» deja la pestaña marcada, para que el usuario
  // sepa de dónde ha salido la pantalla en la que está.
  incluye: ['evaluacion', 'informes', 'calendario', 'herramientas', 'equipos', 'ajustes'],
}

export function BottomNav({ ruta }: { ruta: string }) {
  const raiz = ruta.split('/')[1] || 'hoy'

  return (
    <nav className="fixed inset-x-0 bottom-0 z-nav border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)] dark:border-noche-borde dark:bg-noche-superficie lg:hidden">
      <ul className="mx-auto flex max-w-lg px-1">
        {[...PESTANAS, PESTANA_MAS].map(({ ruta: r, etiqueta, Icono, incluye }) => {
          const activa = r === `/${raiz}` || !!incluye?.includes(raiz)
          return (
            <li key={r} className="flex-1">
              <button
                onClick={() => navegar(r)}
                aria-current={activa ? 'page' : undefined}
                className="flex min-h-tap w-full flex-col items-center gap-1 py-1.5"
              >
                <span
                  className={
                    'flex h-8 w-14 items-center justify-center rounded-full transition ' +
                    (activa
                      ? 'bg-agua-claro text-primario dark:bg-primario dark:text-white'
                      : 'text-tinta-suave dark:text-noche-suave')
                  }
                >
                  <Icono size={22} strokeWidth={activa ? 2.5 : 2} aria-hidden />
                </span>
                <span
                  className={
                    'text-[11px] font-bold leading-tight ' +
                    (activa ? 'text-primario dark:text-agua' : 'texto-suave')
                  }
                >
                  {etiqueta}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
