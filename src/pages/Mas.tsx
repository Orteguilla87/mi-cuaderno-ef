import {
  BarChart3,
  CalendarRange,
  ChevronRight,
  Dices,
  FileText,
  ListChecks,
  MessageSquareText,
  Settings,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Cabecera } from '../components/Cabecera'
import { navegar } from '../lib/router'

/**
 * §5: «Más» recoge lo que no cabe en las cuatro pestañas de uso diario.
 * Son pantallas de escritorio o de preparación, no de pista.
 */
const ENTRADAS: {
  ruta: string
  titulo: string
  descripcion: string
  Icono: LucideIcon
  disponible: boolean
}[] = [
  {
    ruta: '/rubricas',
    titulo: 'Rúbricas',
    descripcion: 'Banco de rúbricas reutilizables en el cuaderno',
    Icono: ListChecks,
    disponible: true,
  },
  {
    ruta: '/juegos',
    titulo: 'Banco de juegos',
    descripcion: 'Importar, buscar y filtrar juegos de EF',
    Icono: Dices,
    disponible: true,
  },
  {
    ruta: '/observaciones',
    titulo: 'Observaciones',
    descripcion: 'Timeline de todos los grupos, con filtros',
    Icono: MessageSquareText,
    disponible: true,
  },
  {
    ruta: '/evaluacion',
    titulo: 'Evaluación final',
    descripcion: 'Nota de curso, conversión oficial y comentarios',
    Icono: BarChart3,
    disponible: false,
  },
  {
    ruta: '/informes',
    titulo: 'Informes',
    descripcion: 'PDF, XLSX y CSV para pasar a Raíces',
    Icono: FileText,
    disponible: true,
  },
  {
    ruta: '/calendario',
    titulo: 'Calendario',
    descripcion: 'Horario, festivos, eventos y avisos',
    Icono: CalendarRange,
    disponible: false,
  },
  {
    ruta: '/herramientas',
    titulo: 'Herramientas',
    descripcion: 'Equipos, cronómetro, marcador y selector',
    Icono: Timer,
    disponible: true,
  },
  {
    ruta: '/ajustes',
    titulo: 'Ajustes',
    descripcion: 'Curso, evaluación, aspecto y copia de seguridad',
    Icono: Settings,
    disponible: true,
  },
]

export function Mas() {
  return (
    <>
      <Cabecera titulo="Más" />

      <ul className="space-y-3 p-4">
        {ENTRADAS.map(({ ruta, titulo, descripcion, Icono, disponible }) => (
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
