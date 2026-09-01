import { db, nuevoId } from './db'
import { ETAPAS_DISPONIBLES, grupoVisible } from '../lib/etapas'
import type { FranjaHorario, Grupo } from './types'

/**
 * Alta y listado de grupos, en un sitio en vez de repartidos por las vistas.
 *
 * Existe por el interruptor de `lib/etapas.ts`: con Infantil apagado hay que
 * garantizar dos cosas, y una vista de React no es sitio para garantizar nada.
 *
 *  1. Que no se pueda crear un grupo de una etapa que no está disponible, sea
 *     cual sea la ruta que lleve hasta aquí.
 *  2. Que los grupos de las etapas ocultas no se listen —pero sigan en la base
 *     con todos sus datos, y sigan viajando en el backup y la sincronización—.
 */

export class EtapaNoDisponible extends Error {
  constructor(etapa: string) {
    super(
      `La etapa «${etapa}» no está disponible en esta instalación. ` +
        'Se activa con INFANTIL_HABILITADO en src/lib/etapas.ts.',
    )
    this.name = 'EtapaNoDisponible'
  }
}

export type DatosNuevoGrupo = Omit<Grupo, 'id'>

/**
 * Crea un grupo. Lanza si su etapa está oculta: es la única puerta de alta, y
 * el test de `db/grupos.test.ts` se apoya en ella.
 */
export async function crearGrupo(datos: DatosNuevoGrupo): Promise<Grupo> {
  if (!ETAPAS_DISPONIBLES.includes(datos.etapa)) throw new EtapaNoDisponible(datos.etapa)
  const grupo: Grupo = { ...datos, id: nuevoId() }
  await db.grupos.add(grupo)
  return grupo
}

/** Los grupos que la interfaz puede enseñar, ordenados como en la pantalla Grupos. */
export async function gruposVisibles(): Promise<Grupo[]> {
  const lista = (await db.grupos.toArray()).filter(grupoVisible)
  return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Los del curso escolar activo, que es lo que lista la pantalla Grupos. */
export async function gruposVisiblesDelCurso(cursoEscolarId: string): Promise<Grupo[]> {
  return (await gruposVisibles()).filter((g) => g.cursoEscolarId === cursoEscolarId)
}

/**
 * Cuántos grupos hay guardados de etapas ocultas. Se enseña en Ajustes para que
 * quede claro que siguen ahí y no se han perdido.
 */
export async function contarGruposOcultos(): Promise<number> {
  return (await db.grupos.toArray()).filter((g) => !grupoVisible(g)).length
}

/** Horario vacío: azúcar para las altas, que siempre empiezan sin franjas. */
export const SIN_HORARIO: FranjaHorario[] = []
