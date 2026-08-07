/**
 * Inventario de material — lógica pura (sin Dexie, sin React).
 *
 * Aquí vive todo lo que se puede probar sin abrir una base: la limpieza de
 * campos opcionales, el orden, y la traducción token → clase de Tailwind. El
 * mismo reparto que `lib/webdav.ts` (puro) frente a `db/webdav.ts` (lo une con
 * la base).
 */

import type {
  ColorEtiqueta,
  EstadoMaterial,
  EtiquetaMaterial,
  GrupoEtiqueta,
  Material,
} from '../db/types'

export { normalizarTexto as normalizarNombre } from './texto'

// ——————————————————————— ausencia real ———————————————————————

/**
 * Borra las claves cuyo valor es `undefined`, `null` o cadena vacía, en vez de
 * guardarlas con un valor de relleno.
 *
 * Es LA pieza que sostiene la regla del módulo. Sin esto, un `cantidad:
 * undefined` sobrevive al `put` de Dexie, pero `JSON.stringify` lo tira al
 * empaquetar el backup y al volver puede reaparecer como otra cosa; y un
 * `cantidad: 0` puesto «por si acaso» convierte «no lo he contado» en «no
 * queda ninguno», que es justo la mentira que este inventario no puede contar.
 *
 * `0` sí se conserva: es una cantidad legítima cuando el usuario la escribe.
 */
export function limpiarOpcionales<T extends Record<string, unknown>>(registro: T): T {
  const limpio = { ...registro }
  for (const clave of Object.keys(limpio)) {
    const valor = limpio[clave]
    if (valor === undefined || valor === null || valor === '') delete limpio[clave]
  }
  return limpio
}

/**
 * Texto libre del formulario a número entero ≥ 0, o `undefined` si no hay
 * nada que leer. Nunca devuelve 0 por defecto.
 */
export function aCantidad(valor: string): number | undefined {
  const t = valor.trim()
  if (!t) return undefined
  const n = Number(t.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n)
}

// ——————————————————————— presentación ———————————————————————

export const ESTADOS: EstadoMaterial[] = ['bueno', 'regular', 'malo', 'fuera_de_uso']

export const ETIQUETA_ESTADO: Record<EstadoMaterial, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
  fuera_de_uso: 'Fuera de uso',
}

/**
 * Estado → token de §3.1. Ninguna familia de color nueva: `lima` es el positivo
 * de siempre, `aviso` es la mezcla lima/acento que ya usa el retraso en el pase
 * de lista, y «fuera de uso» va en neutro porque no es una alarma, es material
 * que ya no cuenta.
 */
export const COLOR_ESTADO: Record<EstadoMaterial, string> = {
  bueno: 'bg-lima/20 text-lima-oscuro dark:bg-lima/25 dark:text-lima',
  regular: 'bg-aviso-claro text-aviso-oscuro dark:bg-noche-elevada dark:text-aviso',
  malo: 'bg-acento/10 text-acento dark:bg-acento/15',
  fuera_de_uso: 'bg-agua-claro text-tinta-suave dark:bg-noche-elevada dark:text-noche-suave',
}

/** Único punto que traduce el token guardado en la etiqueta a clases reales. */
export const COLOR_ETIQUETA: Record<ColorEtiqueta, string> = {
  primario: 'bg-primario/10 text-primario dark:bg-primario/25 dark:text-agua',
  acento: 'bg-acento/10 text-acento dark:bg-acento/15',
  lima: 'bg-lima/20 text-lima-oscuro dark:bg-lima/25 dark:text-lima',
  aviso: 'bg-aviso-claro text-aviso-oscuro dark:bg-noche-elevada dark:text-aviso',
  agua: 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua',
}

export const COLORES_ETIQUETA = Object.keys(COLOR_ETIQUETA) as ColorEtiqueta[]

/** Sin color elegido, la etiqueta se pinta con el neutro de la app. */
export const COLOR_ETIQUETA_POR_DEFECTO = COLOR_ETIQUETA.agua

export function clasesEtiqueta(etiqueta: Pick<EtiquetaMaterial, 'color'>): string {
  return etiqueta.color ? COLOR_ETIQUETA[etiqueta.color] : COLOR_ETIQUETA_POR_DEFECTO
}

export const GRUPOS_ETIQUETA: GrupoEtiqueta[] = ['tamano', 'familia', 'ubicacion', 'otro']

export const ETIQUETA_GRUPO: Record<GrupoEtiqueta, string> = {
  tamano: 'Tamaño',
  familia: 'Familia',
  ubicacion: 'Ubicación',
  otro: 'Otro',
}

/**
 * «12» · «12 (2 inservibles)» · cadena vacía si no hay cantidad.
 *
 * Vacío es vacío: la fila no pinta nada en su hueco, ni «—» ni 0. Que se vea
 * el blanco es lo que empuja a contarlo algún día.
 */
export function textoCantidad(material: Pick<Material, 'cantidad' | 'cantidadInservible'>): string {
  if (material.cantidad === undefined) return ''
  const inservibles = material.cantidadInservible
  if (inservibles === undefined || inservibles <= 0) return String(material.cantidad)
  return `${material.cantidad} (${inservibles} inservible${inservibles === 1 ? '' : 's'})`
}

// ——————————————————————— orden ———————————————————————

export type OrdenInventario = 'alfabetico' | 'cantidad' | 'estado'

export const ETIQUETA_ORDEN: Record<OrdenInventario, string> = {
  alfabetico: 'A-Z',
  cantidad: 'Cantidad',
  estado: 'Estado',
}

/** Bueno primero, fuera de uso al final; sin estado, al final del todo. */
const PESO_ESTADO: Record<EstadoMaterial, number> = {
  bueno: 0,
  regular: 1,
  malo: 2,
  fuera_de_uso: 3,
}

const alfabetico = (a: Material, b: Material) => a.nombre.localeCompare(b.nombre, 'es')

/**
 * Los materiales sin dato van SIEMPRE al final, ordenen por lo que ordenen: un
 * `undefined` no es «cero unidades» ni «el mejor estado», así que no puede
 * colarse entre los que sí tienen dato. Dentro de cada bloque, desempata el
 * alfabético para que la lista no baile entre renders.
 */
export function ordenarMateriales(materiales: Material[], orden: OrdenInventario): Material[] {
  const lista = [...materiales]
  switch (orden) {
    case 'cantidad':
      return lista.sort((a, b) => {
        if (a.cantidad === undefined || b.cantidad === undefined) {
          if (a.cantidad === b.cantidad) return alfabetico(a, b)
          return a.cantidad === undefined ? 1 : -1
        }
        return b.cantidad - a.cantidad || alfabetico(a, b)
      })
    case 'estado':
      return lista.sort((a, b) => {
        if (a.estado === undefined || b.estado === undefined) {
          if (a.estado === b.estado) return alfabetico(a, b)
          return a.estado === undefined ? 1 : -1
        }
        return PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado] || alfabetico(a, b)
      })
    case 'alfabetico':
    default:
      return lista.sort(alfabetico)
  }
}

// ——————————————————————— filtros ———————————————————————

export interface FiltroInventario {
  /** Todas deben estar presentes (AND), no cualquiera de ellas. */
  etiquetaIds: string[]
  estados: EstadoMaterial[]
}

export const FILTRO_VACIO: FiltroInventario = { etiquetaIds: [], estados: [] }

export function hayFiltros(filtro: FiltroInventario): boolean {
  return filtro.etiquetaIds.length > 0 || filtro.estados.length > 0
}

export function filtrar(materiales: Material[], filtro: FiltroInventario): Material[] {
  return materiales.filter((m) => {
    if (filtro.estados.length && (!m.estado || !filtro.estados.includes(m.estado))) return false
    return filtro.etiquetaIds.every((id) => m.etiquetaIds.includes(id))
  })
}

// ——————————————————————— validación: avisar, no bloquear ———————————————————————

/**
 * Avisos del formulario. Ninguno impide guardar (§ reglas transversales): son
 * texto que aparece al lado del campo, no un candado. El único campo de verdad
 * obligatorio es el nombre, y eso lo comprueba la propia pantalla.
 */
export function avisosMaterial(borrador: {
  cantidad?: number
  cantidadInservible?: number
}): string[] {
  const avisos: string[] = []
  const { cantidad, cantidadInservible } = borrador
  if (cantidadInservible !== undefined && cantidad === undefined)
    avisos.push('Hay unidades inservibles anotadas pero no hay cantidad total.')
  if (cantidad !== undefined && cantidadInservible !== undefined && cantidadInservible > cantidad)
    avisos.push(
      `Hay más inservibles (${cantidadInservible}) que unidades en total (${cantidad}). Se guarda igual.`,
    )
  return avisos
}
