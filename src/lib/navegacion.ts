import {
  // BarChart3, // lo usaba «Evaluación final», oculta en el Bloque 5 (más abajo)
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileText,
  ListChecks,
  MessageSquareText,
  Settings,
  Table2,
  Target,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * Rutas de la navegación principal (§5): Hoy · Cuaderno · Grupos ·
 * Planificador. Un solo origen para la barra inferior (móvil) y la barra
 * lateral (escritorio, Bloque 6), para que no haya dos listas que mantener
 * sincronizadas.
 */
export interface Pestana {
  ruta: string
  etiqueta: string
  Icono: LucideIcon
  /** Secciones que, sin ser la pestaña, la mantienen marcada como activa. */
  incluye?: string[]
}

export const PESTANAS: Pestana[] = [
  { ruta: '/hoy', etiqueta: 'Hoy', Icono: CalendarDays },
  { ruta: '/cuaderno', etiqueta: 'Cuaderno', Icono: Table2, incluye: ['rubricas'] },
  {
    ruta: '/grupos',
    etiqueta: 'Grupos',
    Icono: Users,
    incluye: ['alumnos', 'asistencia', 'observaciones', 'infantil'],
  },
  {
    ruta: '/planificador',
    etiqueta: 'Planificador',
    Icono: ClipboardList,
    incluye: ['sesiones', 'juegos'],
  },
]

/** Todo lo que en móvil cuelga de «Más» (`Mas.tsx`) — mismo origen para la barra lateral. */
export interface EntradaMas {
  ruta: string
  titulo: string
  descripcion: string
  Icono: LucideIcon
  disponible: boolean
}

// Banco de juegos oculto de la navegación (Bloque 6): sigue accesible desde
// «Añadir del banco» en la sesión (SesionDetalle.tsx monta <Juegos> inline,
// sin pasar por esta lista) y en /juegos directamente. Código, ruta y datos
// intactos — solo se quita la entrada de aquí.
export const ENTRADAS_MAS: EntradaMas[] = [
  {
    ruta: '/rubricas',
    titulo: 'Rúbricas',
    descripcion: 'Banco de rúbricas reutilizables en el cuaderno',
    Icono: ListChecks,
    disponible: true,
  },
  {
    ruta: '/observaciones',
    titulo: 'Observaciones',
    descripcion: 'Timeline de todos los grupos, con filtros',
    Icono: MessageSquareText,
    disponible: true,
  },
  // «Evaluación final» oculta de la navegación (Bloque 5): igual que el Banco de
  // Juegos, se quita solo la entrada de esta lista. La ruta /evaluacion, su
  // componente y sus datos siguen intactos; basta con devolver la entrada aquí
  // para que vuelva a aparecer en «Más» y en la barra lateral.
  // {
  //   ruta: '/evaluacion',
  //   titulo: 'Evaluación final',
  //   descripcion: 'Nota de curso, conversión oficial y comentarios',
  //   Icono: BarChart3,
  //   disponible: false,
  // },
  {
    ruta: '/cobertura',
    titulo: 'Cobertura de criterios',
    descripcion: 'Qué criterios del decreto se han evaluado y cuáles faltan',
    Icono: Target,
    disponible: true,
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
    descripcion: 'Mes y semana del curso, con las sesiones de cada día',
    Icono: CalendarRange,
    disponible: true,
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
