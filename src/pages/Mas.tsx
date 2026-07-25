import { ChevronRight } from 'lucide-react'
import { Cabecera } from '../components/Cabecera'
import { ENTRADAS_MAS } from '../lib/navegacion'
import { navegar } from '../lib/router'

/**
 * §5: «Más» recoge lo que no cabe en las cuatro pestañas de uso diario.
 * Son pantallas de escritorio o de preparación, no de pista.
 */
export function Mas() {
  return (
    <>
      <Cabecera titulo="Más" />

      <ul className="space-y-3 p-4">
        {ENTRADAS_MAS.map(({ ruta, titulo, descripcion, Icono, disponible }) => (
          <li key={ruta}>
            <button
              onClick={() => navegar(ruta)}
              className="tarjeta-pulsable flex w-full items-center gap-3 text-left"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-agua-claro text-primario dark:bg-noche-elevada dark:text-agua">
                <Icono size={22} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-bold">{titulo}</span>
                  {!disponible && (
                    <span className="pildora bg-agua-medio text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                      Pronto
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm texto-suave">{descripcion}</span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-tinta-tenue" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
