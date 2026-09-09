import { AlertTriangle, Bandage, BookOpen, Clock, Cross, Home, type LucideIcon } from 'lucide-react'

/**
 * Los iconos que puede llevar una etiqueta de alumnado.
 *
 * CATÁLOGO CERRADO, y pequeño a propósito. Un selector abierto sobre las ~1500
 * de `lucide-react` convierte cada alta en una decisión de diseño y acaba con
 * una etiqueta que nadie reconoce de un vistazo, que es justo lo único que un
 * icono tiene que hacer aquí. Todos salen del set que ya usa la app (§3).
 *
 * El icono es OPCIONAL: sin él, la etiqueta se pinta como siempre —punto de
 * color más abreviatura—. Con él, el icono sustituye al punto y se queda el
 * color, así que el significado sigue sin depender del color: se lee la forma,
 * y además la abreviatura sigue en el `title` y en el `aria-label`.
 *
 * Módulo puro: no importa `db` ni pinta nada, para que las cuatro copias de
 * `PuntoEtiquetas` puedan compartir la tabla sin compartir el componente
 * (`lib/etiquetasAlumno.test.ts` explica por qué el componente no se comparte).
 */

export interface IconoEtiqueta {
  id: string
  /** Cómo se llama en el selector. */
  nombre: string
  Icono: LucideIcon
}

export const ICONOS_ETIQUETA: IconoEtiqueta[] = [
  { id: 'cruz', nombre: 'Cruz', Icono: Cross },
  { id: 'vendaje', nombre: 'Vendaje', Icono: Bandage },
  { id: 'libro', nombre: 'Libro', Icono: BookOpen },
  { id: 'casa', nombre: 'Casa', Icono: Home },
  { id: 'reloj', nombre: 'Reloj', Icono: Clock },
  { id: 'aviso', nombre: 'Aviso', Icono: AlertTriangle },
]

/**
 * El icono de una etiqueta, o `undefined` si no lleva —o si lleva uno que ya no
 * está en el catálogo, que es lo que pasaría al restaurar una copia hecha con
 * una versión posterior—. En ese caso vuelve al punto de color, que siempre
 * funciona; no se rompe nada ni se pinta un hueco.
 */
export function iconoDe(id: string | undefined): LucideIcon | undefined {
  return id ? ICONOS_ETIQUETA.find((i) => i.id === id)?.Icono : undefined
}
