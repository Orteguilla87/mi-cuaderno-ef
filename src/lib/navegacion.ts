import {
  // BarChart3, // lo usaba «Evaluación final», oculta en el Bloque 5 (más abajo)
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileText,
  Link2,
  ListChecks,
  MessageSquareText,
  Package,
  Settings,
  Tags,
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
  // Rúbricas y Observaciones NO van en `incluye`: tienen entrada propia en
  // `ENTRADAS_MAS`, y meterlas aquí marcaba dos entradas a la vez en la barra
  // lateral (Bloque F1).
  { ruta: '/cuaderno', etiqueta: 'Cuaderno', Icono: Table2 },
  {
    ruta: '/grupos',
    etiqueta: 'Grupos',
    Icono: Users,
    // 'infantil' sale de la lista mientras la etapa esté apagada (lib/etapas.ts).
    // Devolverlo aquí es todo lo que hace falta para que la pestaña vuelva a
    // marcarse activa en el registro de Infantil.
    incluye: ['alumnos', 'asistencia'],
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
    ruta: '/etiquetas-alumnado',
    titulo: 'Etiquetas de alumnado',
    descripcion: 'Puntos de color en tus pantallas; nunca salen del dispositivo',
    Icono: Tags,
    disponible: true,
  },
  {
    ruta: '/vincular-alumnado',
    titulo: 'Vincular alumnado',
    descripcion: 'La misma persona en dos grupos: comparte etiquetas y apoyos, no las notas',
    Icono: Link2,
    disponible: true,
  },
  {
    ruta: '/inventario',
    titulo: 'Inventario',
    descripcion: 'Qué material hay en el centro, cuánto y en qué estado',
    Icono: Package,
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

// ——— Sección activa, grupos de la barra lateral y título (Bloque F1) ———

/** Primer segmento de la ruta: '/grupos/abc' → 'grupos'. Vacía → 'hoy'. */
export function raizDe(ruta: string): string {
  return ruta.split('/')[1] || 'hoy'
}

/** Pestaña de la barra (móvil) o de la lista lateral a la que pertenece `raiz`, si alguna. */
export function pestanaDe(raiz: string): Pestana | undefined {
  return PESTANAS.find((p) => p.ruta === `/${raiz}` || !!p.incluye?.includes(raiz))
}

/** Secciones que, sin entrada propia, cuelgan de una entrada de `ENTRADAS_MAS`. */
const INCLUYE_MAS: Record<string, string[]> = {
  '/herramientas': ['equipos'],
}

/**
 * Ruta de la ÚNICA entrada del menú de escritorio que corresponde a `raiz`, o
 * `undefined` si ninguna (p. ej. /mas). Primero las pestañas, luego «Más»:
 * nunca dos a la vez.
 */
export function entradaActiva(raiz: string): string | undefined {
  const p = pestanaDe(raiz)
  if (p) return p.ruta
  const e = ENTRADAS_MAS.find(
    (x) => x.ruta === `/${raiz}` || !!INCLUYE_MAS[x.ruta]?.includes(raiz),
  )
  return e?.ruta
}

/** En la barra inferior, «Más» va activo solo si la ruta no es de una pestaña. */
export function masActivo(raiz: string): boolean {
  return !pestanaDe(raiz)
}

/** Grupos de la barra lateral de escritorio. Ajustes va aparte, fijo abajo. */
export const GRUPOS_LATERAL: { titulo: string; rutas: string[] }[] = [
  { titulo: 'Día a día', rutas: ['/hoy', '/cuaderno', '/grupos', '/planificador'] },
  { titulo: 'Evaluación', rutas: ['/rubricas', '/observaciones', '/cobertura', '/informes'] },
  { titulo: 'Alumnado', rutas: ['/etiquetas-alumnado', '/vincular-alumnado'] },
  { titulo: 'Aula', rutas: ['/inventario', '/calendario', '/herramientas'] },
]
export const RUTA_AJUSTES = '/ajustes'

/** Icono y etiqueta de cualquier ruta del menú, venga de PESTANAS o de ENTRADAS_MAS. */
export function entradaMenu(ruta: string): { etiqueta: string; Icono: LucideIcon } | undefined {
  const p = PESTANAS.find((x) => x.ruta === ruta)
  if (p) return { etiqueta: p.etiqueta, Icono: p.Icono }
  const e = ENTRADAS_MAS.find((x) => x.ruta === ruta)
  return e && { etiqueta: e.titulo, Icono: e.Icono }
}

/** Vistas sin entrada en el menú que también merecen su título de pestaña. */
const TITULOS_SUELTOS: Record<string, string> = {
  mas: 'Más',
  alumnos: 'Alumno',
  asistencia: 'Pase de lista',
  sesiones: 'Sesión',
  juegos: 'Banco de juegos',
  equipos: 'Equipos',
  infantil: 'Infantil',
  evaluacion: 'Evaluación final',
}

/** Título de la pestaña del navegador: «<Vista> · Cuaderno EF». */
export function tituloDeRuta(ruta: string): string {
  const raiz = raizDe(ruta)
  const segundo = ruta.split('/')[2]
  let vista: string | undefined
  if (raiz === 'grupos' && segundo) vista = 'Grupo'
  else if (raiz === 'planificador' && segundo === 'importar') vista = 'Importar unidad'
  else if (raiz === 'inventario' && segundo === 'etiquetas') vista = 'Etiquetas de material'
  else if (raiz === 'inventario' && segundo === 'importar') vista = 'Importar inventario'
  else vista = TITULOS_SUELTOS[raiz] ?? entradaMenu(`/${raiz}`)?.etiqueta
  return vista ? `${vista} · Cuaderno EF` : 'Cuaderno EF'
}
