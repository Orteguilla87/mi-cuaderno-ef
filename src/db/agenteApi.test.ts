import { afterEach, describe, expect, it, vi } from 'vitest'
import { interpretarConApi } from './agenteApi'
import type { Alumno, Grupo } from './types'

/**
 * Lo que de verdad sale del dispositivo.
 *
 * Los tests de `lib/pseudonimizacion` prueban la sustitución; esto prueba el
 * CUERPO de la petición, que es lo único que viaja. La regla transversal es
 * dura: ni `apoyos`, ni el nivel motriz, ni las etiquetas de alumnado, ni un
 * solo nombre real, pase lo que pase en las capas de arriba.
 */

const GRUPO: Grupo = {
  id: 'g1',
  cursoEscolarId: 'c1',
  nombre: '4º A',
  etapa: 'primaria',
  nivel: 4,
  color: '#006A80',
  orden: 0,
  horario: [],
}

const ALUMNOS: Alumno[] = [
  {
    id: 'a1',
    grupoId: 'g1',
    nombre: 'Lucía',
    apellidos: 'Ramírez Soto',
    alias: 'Lu',
    activo: true,
    apoyos: 'Consigna corta y contacto visual',
    notasPrivadas: 'Habló la orientadora',
    nivelMotriz: 2,
    etiquetas: ['etq-alu-lesionado'],
  },
]

afterEach(() => vi.unstubAllGlobals())

describe('lo que viaja a la API', () => {
  it('no lleva nombres reales ni un solo dato reservado', async () => {
    let cuerpo = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, opciones: { body: string }) => {
        cuerpo = opciones.body
        return {
          ok: true,
          json: async () => ({ content: [{ type: 'tool_use', name: 'marcar_asistencia', input: {} }] }),
        }
      }),
    )

    await interpretarConApi('Lu falta hoy, lleva lesionada desde el lunes', ALUMNOS, [GRUPO], {
      apiKey: 'clave-de-prueba',
      modelo: 'claude-haiku-4-5-20251001',
    })

    for (const reservado of [
      'Lucía',
      'Ramírez',
      'Soto',
      'Consigna corta',
      'orientadora',
      'nivelMotriz',
      'apoyos',
      'etq-alu-lesionado',
      'notasPrivadas',
    ]) {
      expect(cuerpo, `«${reservado}» no puede salir del dispositivo`).not.toContain(reservado)
    }

    // Y lo que sí lleva: el texto con el token, y nada más del alumnado.
    expect(cuerpo).toContain('[A1]')
  })

  it('la clave va en la cabecera, nunca en el cuerpo', async () => {
    let cabeceras: Record<string, string> = {}
    let cuerpo = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, opciones: { body: string; headers: Record<string, string> }) => {
        cabeceras = opciones.headers
        cuerpo = opciones.body
        return { ok: true, json: async () => ({ content: [] }) }
      }),
    )

    await interpretarConApi('Lu falta', ALUMNOS, [GRUPO], {
      apiKey: 'clave-de-prueba',
      modelo: 'claude-haiku-4-5-20251001',
    })

    expect(cabeceras['x-api-key']).toBe('clave-de-prueba')
    expect(cuerpo).not.toContain('clave-de-prueba')
  })

  it('solo se habla con api.anthropic.com', async () => {
    const espia = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ content: [] }) }))
    vi.stubGlobal('fetch', espia)

    await interpretarConApi('Lu falta', ALUMNOS, [GRUPO], {
      apiKey: 'k',
      modelo: 'claude-haiku-4-5-20251001',
    })

    expect(espia).toHaveBeenCalledTimes(1)
    expect(espia.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')
  })
})
