import { describe, expect, it } from 'vitest'
import type { Alumno, Grupo } from '../db/types'
import { buscarAlumnoEnTexto, construirMapaTokens, pseudonimizarTexto } from './pseudonimizacion'
import { detectarGrupoEnTexto } from './grupoEnTexto'

/**
 * §1.2 y §6: a la API de Anthropic solo viaja texto pseudonimizado. Los nombres
 * se sustituyen por tokens `[A1]`, y NADA MÁS del alumno acompaña al viaje: ni
 * `apoyos`, ni `notasPrivadas`, ni `nivelMotriz`, ni las etiquetas.
 *
 * Hasta ahora eso era cierto por construcción y por costumbre, sin un test que
 * lo sujetara. Basta con que alguien añada un campo al mapa de tokens «para dar
 * contexto al modelo» para que datos de salud salgan del dispositivo.
 */

const alumnos: Alumno[] = [
  {
    id: 'a1',
    grupoId: 'g1',
    nombre: 'Lucía',
    apellidos: 'Ramírez',
    alias: 'Lu',
    activo: true,
    apoyos: 'Consigna corta',
    notasPrivadas: 'Informe de la orientadora',
    nivelMotriz: 2,
    etiquetas: ['et-tdah'],
  },
]

const grupos: Grupo[] = [
  {
    id: 'g1',
    cursoEscolarId: 'c1',
    nombre: '3ºB',
    etapa: 'primaria',
    nivel: 3,
    color: '#006A80',
    colorId: 'teal-500',
    orden: 0,
    horario: [],
  },
]

describe('lo que se manda a la API', () => {
  const mapa = construirMapaTokens(alumnos, grupos)

  it('sustituye nombre, apellidos y alias por el token del alumno', () => {
    const texto = pseudonimizarTexto('Lucía Ramírez ha olvidado el chándal', mapa, alumnos, grupos)
    expect(texto).not.toContain('Lucía')
    expect(texto).not.toContain('Ramírez')
    expect(texto).toContain('[A1]')
  })

  it('sustituye también el nombre del grupo', () => {
    const texto = pseudonimizarTexto('Hoy 3ºB ha trabajado bien', mapa, alumnos, grupos)
    expect(texto).not.toContain('3ºB')
    expect(texto).toContain('[G1]')
  })

  it('el mapa de tokens no arrastra ningún dato sensible al prompt', () => {
    // El mapa guarda el alumno entero para poder resolver de vuelta EN LOCAL;
    // lo que importa es que nada de eso acabe en el texto que sale.
    const partes: string[] = []
    for (const token of mapa.alumnoPorToken.keys()) partes.push(token)
    for (const token of mapa.grupoPorToken.keys()) partes.push(token)
    const enviado = partes.join(' ')
    for (const secreto of ['Consigna corta', 'orientadora', 'et-tdah', 'Lucía', 'Ramírez']) {
      expect(enviado, `«${secreto}» no puede viajar a la API`).not.toContain(secreto)
    }
  })

  it('un texto que mencione lo sensible se pseudonimiza igual, sin añadirlo', () => {
    const texto = pseudonimizarTexto('Lu necesita consigna corta', mapa, alumnos, grupos)
    expect(texto).toContain('[A1]')
    // No se «enriquece» el texto con lo que la app sabe del alumno: sale lo que
    // el maestro escribió, con el nombre tapado, y nada más.
    expect(texto).not.toContain('TDAH')
    expect(texto).not.toContain('nivelMotriz')
    expect(texto).not.toContain('apoyos')
  })
})

/**
 * El fallo que arregla esto: el agente resolvía a veces un alumno de otra clase.
 * La búsqueda recorría los ~200 alumnos de los nueve grupos, y encima con el
 * texto entero, así que «cuarto» y «tercero» puntuaban contra los apellidos.
 */
describe('acotado al grupo dictado', () => {
  const pabloDeCuarto: Alumno = {
    id: 'a-4a',
    grupoId: 'g4a',
    nombre: 'Pablo',
    apellidos: 'Mena',
    alias: 'Pablo',
    activo: true,
  }
  // Mismo nombre y un apellido que el fuzzy adora: «Cuartero» casa con «cuarto».
  const pabloDeTercero: Alumno = {
    id: 'a-3b',
    grupoId: 'g3b',
    nombre: 'Pablo',
    apellidos: 'Cuartero',
    alias: 'Pablo',
    activo: true,
  }

  const cuartoA: Grupo = { ...grupos[0], id: 'g4a', nombre: '4ºA', nivel: 4, alias: ['4A'] }
  const terceroB: Grupo = { ...grupos[0], id: 'g3b', nombre: '3ºB', nivel: 3 }

  const dictado = 'cuarto A, Pablo sin chándal'

  it('nunca devuelve un alumno de otro grupo, por parecido que sea el nombre', () => {
    const { candidatos, textoSinGrupo } = detectarGrupoEnTexto(dictado, [cuartoA, terceroB])
    expect(candidatos).toEqual([cuartoA])

    // La regla dura: se busca SOLO entre los del grupo resuelto.
    const delGrupo = [pabloDeCuarto, pabloDeTercero].filter((a) => a.grupoId === candidatos[0].id)
    const encontrados = buscarAlumnoEnTexto(textoSinGrupo, delGrupo)

    expect(encontrados.map((c) => c.alumno.id)).toEqual(['a-4a'])
    expect(encontrados.map((c) => c.alumno.id)).not.toContain('a-3b')
  })

  it('la palabra del ordinal no participa en el emparejamiento del nombre', () => {
    const todos = [pabloDeCuarto, pabloDeTercero]
    // Con el texto entero, «cuarto» arrastra a «Pablo Cuartero» al resultado…
    const conMencion = buscarAlumnoEnTexto(dictado, todos).map((c) => c.alumno.id)
    expect(conMencion).toContain('a-3b')

    // …y retirada la mención, ya no hay nada que lo traiga.
    const { textoSinGrupo } = detectarGrupoEnTexto(dictado, [cuartoA, terceroB])
    expect(textoSinGrupo).toBe('Pablo sin chándal')
  })

  it('a la API solo viaja el alumnado del grupo resuelto', () => {
    const mapaAcotado = construirMapaTokens([pabloDeCuarto], [cuartoA])
    expect([...mapaAcotado.alumnoPorToken.values()].map((a) => a.id)).toEqual(['a-4a'])
    // Sin token para el de tercero, el modelo no puede devolverlo aunque quiera.
    expect(mapaAcotado.tokenPorAlumno.has('a-3b')).toBe(false)
  })
})
