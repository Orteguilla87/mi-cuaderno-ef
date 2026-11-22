/**
 * Layout de ESCRITORIO por vista (Bloque F2). Solo `lg:` (el corte de la barra
 * lateral): el móvil no importa este módulo ni lo nota, y su ancho sigue
 * saliendo de las clases móviles de `<main>` en `App.tsx`. No hay aquí ningún
 * valor compartido con móvil.
 *
 * Dos tipos y cada vista declara el suyo, sin valor por defecto implícito:
 * - lectura: texto, listas y formularios. Contenido útil de 960 px, centrado.
 * - trabajo: rejillas y tiras. Ocupa el área de contenido, con 32 px a cada
 *   lado y tope útil de 1600 px.
 *
 * El «ancho útil» es el de dentro del padding: es lo que miden la cabecera y el
 * contenido, que van alineados porque la cabecera vive dentro de `<main>`.
 * Literales enteros, para que Tailwind los encuentre al escanear.
 */
export type LayoutEscritorio = 'lectura' | 'trabajo'

export const CLASES_LAYOUT_ESCRITORIO: Record<LayoutEscritorio, string> = {
  lectura: 'lg:max-w-[calc(960px+3rem)] lg:px-6',
  trabajo: 'lg:max-w-[calc(1600px+4rem)] lg:px-8',
}

/** Todas las secciones que enruta `Contenido` (App.tsx), una por una. */
export const LAYOUT_POR_SECCION = {
  // Trabajo
  cuaderno: 'trabajo',
  planificador: 'trabajo',
  calendario: 'trabajo',
  infantil: 'trabajo', // rejilla de registro, como el Cuaderno
  // Lectura
  hoy: 'lectura',
  grupos: 'lectura',
  rubricas: 'lectura',
  observaciones: 'lectura',
  cobertura: 'lectura',
  informes: 'lectura',
  'etiquetas-alumnado': 'lectura',
  'vincular-alumnado': 'lectura',
  inventario: 'lectura',
  herramientas: 'lectura',
  ajustes: 'lectura',
  // Subvistas y accesorias
  alumnos: 'lectura',
  asistencia: 'lectura',
  sesiones: 'lectura',
  juegos: 'lectura',
  equipos: 'lectura',
  mas: 'lectura',
  evaluacion: 'lectura',
} as const satisfies Record<string, LayoutEscritorio>

export type SeccionConLayout = keyof typeof LAYOUT_POR_SECCION

export function layoutDeRuta(ruta: string): LayoutEscritorio {
  const seccion = ruta.split('/')[1] || 'hoy'
  // Una ruta desconocida pinta Hoy (el `default` del switch de `Contenido`),
  // así que hereda el layout de Hoy.
  return (LAYOUT_POR_SECCION as Record<string, LayoutEscritorio>)[seccion] ?? LAYOUT_POR_SECCION.hoy
}

export function claseLayoutEscritorio(ruta: string): string {
  return CLASES_LAYOUT_ESCRITORIO[layoutDeRuta(ruta)]
}
