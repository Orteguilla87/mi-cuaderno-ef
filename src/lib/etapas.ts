/**
 * Qué etapas existen para esta app, en un solo sitio.
 *
 * El maestro que usa este cuaderno da Educación Física de 1.º a 6.º de
 * Primaria y no imparte Infantil. Toda la etapa —el selector al crear un
 * grupo, la página de registro cualitativo, el filtro del planificador, los
 * badges, la terminología del Decreto 36/2022— se apaga desde aquí.
 *
 * SE OCULTA, NO SE BORRA. El código de Infantil, sus tablas Dexie, sus tipos,
 * sus tests y `seeds/criterios_infantil.json` siguen enteros, y también las
 * reglas duras que impiden mezclar las dos etapas (no pegar columnas de una en
 * otra, no meter una unidad de Infantil en el motor de notas, no copiar
 * estructuras entre etapas). Si algún curso cambia el destino, basta con poner
 * `INFANTIL_HABILITADO = true` y todo vuelve, protecciones incluidas.
 *
 * Los grupos de Infantil que ya existan en la base NO se borran: dejan de
 * listarse (`grupoVisible`) y siguen viajando en el backup cifrado y en la
 * sincronización.
 *
 * Punto de verdad único: ningún componente escribe `INFANTIL_HABILITADO` a
 * mano. Se consumen `ETAPAS_DISPONIBLES`, `ETAPA_UNICA`, `grupoVisible` y
 * `nivelesDe`.
 *
 * Módulo puro: no importa `db` ni React, como `lib/literales.ts`.
 */

import type { Etapa, Grupo } from '../db/types'

/** El único interruptor. Ponerlo a `true` devuelve Infantil entero. */
export const INFANTIL_HABILITADO = false

/** Etapas que el usuario puede elegir. Con el interruptor apagado, solo una. */
export const ETAPAS_DISPONIBLES: Etapa[] = INFANTIL_HABILITADO
  ? ['primaria', 'infantil']
  : ['primaria']

/**
 * La etapa cuando no hay elección posible, o `null` si hay más de una.
 *
 * Es lo que consulta la interfaz para no preguntar lo que no tiene respuesta:
 * si solo hay una etapa, la app no habla de «etapa» en ningún sitio.
 */
export const ETAPA_UNICA: Etapa | null =
  ETAPAS_DISPONIBLES.length === 1 ? ETAPAS_DISPONIBLES[0] : null

/** La etapa por defecto de cualquier alta. */
export const ETAPA_POR_DEFECTO: Etapa = ETAPAS_DISPONIBLES[0]

export function etapaVisible(etapa: Etapa): boolean {
  return ETAPAS_DISPONIBLES.includes(etapa)
}

/**
 * Si el grupo se lista. Un grupo de Infantil con el interruptor apagado sigue
 * en la base, con todos sus datos: solo deja de aparecer.
 */
export function grupoVisible(grupo: Pick<Grupo, 'etapa'>): boolean {
  return etapaVisible(grupo.etapa)
}

/** Cursos de Primaria (1.º–6.º) y edades de Infantil (3, 4 y 5 años). */
export function nivelesDe(etapa: Etapa): number[] {
  return etapa === 'primaria' ? [1, 2, 3, 4, 5, 6] : [3, 4, 5]
}

/** «Curso» en Primaria, «Edad» en Infantil: el rótulo del selector de nivel. */
export function rotuloNivel(etapa: Etapa): string {
  return etapa === 'primaria' ? 'Curso' : 'Edad'
}

/** «3º» · «4 años». */
export function textoNivel(etapa: Etapa, nivel: number): string {
  return etapa === 'primaria' ? `${nivel}º` : `${nivel} años`
}
