import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { contarGruposOcultos, crearGrupo, EtapaNoDisponible, gruposVisibles } from './grupos'
import { criteriosDeGrupo, sembrarCriterios } from './criterios'
import { db, nuevoId } from './db'
import {
  ETAPAS_DISPONIBLES,
  ETAPA_UNICA,
  INFANTIL_HABILITADO,
  etapaVisible,
  grupoVisible,
  nivelesDe,
} from '../lib/etapas'
import type { Etapa, Grupo } from './types'

/**
 * El interruptor de `lib/etapas.ts` esconde Infantil, y esconder no es borrar.
 * Estas pruebas fijan las dos mitades de esa promesa: por la puerta de alta no
 * entra un grupo de una etapa apagada, y los que ya estuvieran guardados dejan
 * de listarse SIN desaparecer de la base —que es lo que los mantiene dentro del
 * backup cifrado y de la sincronización—.
 *
 * Si algún día se enciende `INFANTIL_HABILITADO`, los tests se adaptan solos:
 * están escritos contra `ETAPAS_DISPONIBLES`, no contra la palabra «infantil».
 */

function grupoDe(etapa: Etapa): Omit<Grupo, 'id'> {
  return {
    cursoEscolarId: 'curso-1',
    nombre: etapa === 'infantil' ? 'Infantil 4A' : '3ºB',
    etapa,
    nivel: nivelesDe(etapa)[0],
    color: '#006A80',
    orden: 0,
    horario: [],
  }
}

afterEach(async () => {
  await db.grupos.clear()
})

describe('etapas disponibles', () => {
  it('con el interruptor apagado, Infantil no es una opción', () => {
    expect(INFANTIL_HABILITADO).toBe(false)
    expect(ETAPAS_DISPONIBLES).not.toContain('infantil')
    expect(etapaVisible('infantil')).toBe(false)
    expect(etapaVisible('primaria')).toBe(true)
  })

  it('con una sola etapa, la app no tiene nada que preguntar', () => {
    expect(ETAPA_UNICA).toBe('primaria')
  })

  it('los cursos de Infantil (3, 4 y 5 años) no se ofrecen en ningún selector', () => {
    // El selector de nivel pide sus opciones a `nivelesDe(etapa)`, y la única
    // etapa que puede llegarle es la disponible.
    const ofrecidos = ETAPAS_DISPONIBLES.flatMap(nivelesDe)
    expect(ofrecidos).toEqual([1, 2, 3, 4, 5, 6])
    expect(ofrecidos).not.toContain(0)
  })
})

describe('alta de grupo', () => {
  it('rechaza crear un grupo de una etapa oculta, venga por donde venga', async () => {
    await expect(crearGrupo(grupoDe('infantil'))).rejects.toBeInstanceOf(EtapaNoDisponible)
    expect(await db.grupos.count()).toBe(0)
  })

  it('crea un grupo de Primaria con normalidad', async () => {
    const grupo = await crearGrupo(grupoDe('primaria'))
    expect(grupo.id).toBeTruthy()
    expect(await db.grupos.count()).toBe(1)
  })
})

describe('grupos de una etapa oculta que ya estaban guardados', () => {
  /** Se siembra por debajo de `crearGrupo`, como si lo hubiera dejado una versión anterior. */
  async function sembrarInfantil(): Promise<string> {
    const id = nuevoId()
    await db.grupos.add({ ...grupoDe('infantil'), id })
    return id
  }

  it('no se listan', async () => {
    await sembrarInfantil()
    await crearGrupo(grupoDe('primaria'))
    const visibles = await gruposVisibles()
    expect(visibles).toHaveLength(1)
    expect(visibles[0].etapa).toBe('primaria')
  })

  it('siguen en la base: no se ha borrado nada', async () => {
    const id = await sembrarInfantil()
    expect(await db.grupos.count()).toBe(1)
    expect(await db.grupos.get(id)).toMatchObject({ etapa: 'infantil', nombre: 'Infantil 4A' })
    expect(grupoVisible({ etapa: 'infantil' })).toBe(false)
  })

  it('se pueden contar, para poder decir en Ajustes que siguen ahí', async () => {
    await sembrarInfantil()
    await sembrarInfantil()
    await crearGrupo(grupoDe('primaria'))
    expect(await contarGruposOcultos()).toBe(2)
  })
})

describe('selector de criterios', () => {
  it('con una sola etapa solo puede ofrecer criterios de Primaria', async () => {
    await sembrarCriterios()
    // `SelectorCriterios` no elige etapa: la recibe. Y las dos únicas
    // procedencias posibles son la etapa de un grupo visible o la del alta de
    // unidad, que arranca en `ETAPA_POR_DEFECTO`. Con el interruptor apagado,
    // ambas resuelven a Primaria, así que ninguna ruta alcanzable llega al
    // Decreto 36/2022.
    for (const etapa of ETAPAS_DISPONIBLES) {
      for (const nivel of nivelesDe(etapa)) {
        const criterios = await criteriosDeGrupo(etapa, nivel)
        expect(criterios.length).toBeGreaterThan(0)
        expect(criterios.every((c) => c.etapa === 'primaria')).toBe(true)
      }
    }
    await db.criterios.clear()
    await db.config.clear()
  })
})
