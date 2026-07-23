import { describe, expect, it } from 'vitest'
import {
  filtrarPorPresentes,
  generarEquipos,
  resolverTamanios,
  type AlumnoGenerable,
} from './generadorEquipos'

/** RNG determinista para que los tests no dependan de Math.random. */
function rngDeterminista(semilla: number): () => number {
  let s = semilla
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function alumno(id: string, extra: Partial<AlumnoGenerable> = {}): AlumnoGenerable {
  return { id, ...extra }
}

describe('resolverTamanios', () => {
  it('reparte el resto entre los equipos cuando se pide "repartir"', () => {
    expect(resolverTamanios(10, { porNumEquipos: 3, sobra: 'repartir' })).toEqual([4, 3, 3])
  })

  it('crea un equipo extra con el resto cuando se pide "extra"', () => {
    expect(resolverTamanios(10, { porNumEquipos: 3, sobra: 'extra' })).toEqual([3, 3, 3, 1])
  })

  it('por tamaño de equipo calcula el número de equipos necesario', () => {
    expect(resolverTamanios(11, { porTamano: 4, sobra: 'extra' })).toEqual([4, 4, 3])
  })
})

describe('la serpiente minimiza la diferencia de nivel entre equipos', () => {
  it('deja medias de nivel muy próximas con 18 alumnos y niveles variados', () => {
    const niveles = [5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 5] as const
    const alumnos = niveles.map((n, i) => alumno(`a${i}`, { nivelMotriz: n }))
    const tamanios = resolverTamanios(alumnos.length, { porNumEquipos: 3, sobra: 'repartir' })

    const { equipos } = generarEquipos({
      alumnos,
      tamanios,
      modo: 'heterogeneo',
      aleatorio: rngDeterminista(7),
    })

    const nivelDe = new Map(alumnos.map((a) => [a.id, a.nivelMotriz ?? 3]))
    const medias = equipos.map(
      (eq) => eq.reduce((suma, id) => suma + nivelDe.get(id)!, 0) / eq.length,
    )
    const diferencia = Math.max(...medias) - Math.min(...medias)

    // Con reparto aleatorio la diferencia esperable ronda ~1; la serpiente
    // debe quedar muy por debajo de eso.
    expect(diferencia).toBeLessThanOrEqual(0.4)
  })
})

describe('vínculos separar/juntar', () => {
  it('separar nunca coloca a los dos en el mismo equipo', () => {
    const alumnos = Array.from({ length: 12 }, (_, i) => alumno(`a${i}`))
    const tamanios = resolverTamanios(12, { porNumEquipos: 4, sobra: 'repartir' })

    const { equipos, advertencia } = generarEquipos({
      alumnos,
      tamanios,
      modo: 'aleatorio',
      vinculos: [{ alumnoA: 'a0', alumnoB: 'a1', tipo: 'separar' }],
      aleatorio: rngDeterminista(3),
    })

    expect(advertencia).toBeUndefined()
    const equipoDe = (id: string) => equipos.findIndex((eq) => eq.includes(id))
    expect(equipoDe('a0')).not.toBe(equipoDe('a1'))
  })

  it('juntar siempre los une en el mismo equipo', () => {
    const alumnos = Array.from({ length: 12 }, (_, i) => alumno(`a${i}`))
    const tamanios = resolverTamanios(12, { porNumEquipos: 4, sobra: 'repartir' })

    const { equipos, advertencia } = generarEquipos({
      alumnos,
      tamanios,
      modo: 'aleatorio',
      vinculos: [{ alumnoA: 'a2', alumnoB: 'a9', tipo: 'juntar' }],
      aleatorio: rngDeterminista(11),
    })

    expect(advertencia).toBeUndefined()
    const equipoDe = (id: string) => equipos.findIndex((eq) => eq.includes(id))
    expect(equipoDe('a2')).toBe(equipoDe('a9'))
  })

  it('combina varios vínculos separar y juntar a la vez', () => {
    const alumnos = Array.from({ length: 16 }, (_, i) => alumno(`a${i}`))
    const tamanios = resolverTamanios(16, { porNumEquipos: 4, sobra: 'repartir' })

    const { equipos, advertencia } = generarEquipos({
      alumnos,
      tamanios,
      modo: 'heterogeneo',
      vinculos: [
        { alumnoA: 'a0', alumnoB: 'a1', tipo: 'separar' },
        { alumnoA: 'a2', alumnoB: 'a3', tipo: 'separar' },
        { alumnoA: 'a4', alumnoB: 'a5', tipo: 'juntar' },
      ],
      aleatorio: rngDeterminista(42),
    })

    expect(advertencia).toBeUndefined()
    const equipoDe = (id: string) => equipos.findIndex((eq) => eq.includes(id))
    expect(equipoDe('a0')).not.toBe(equipoDe('a1'))
    expect(equipoDe('a2')).not.toBe(equipoDe('a3'))
    expect(equipoDe('a4')).toBe(equipoDe('a5'))
  })
})

describe('equilibrio de género', () => {
  it('la diferencia de chicos/chicas entre equipos no supera 1', () => {
    const alumnos = [
      ...Array.from({ length: 9 }, (_, i) => alumno(`chico${i}`, { genero: 'chico' as const })),
      ...Array.from({ length: 7 }, (_, i) => alumno(`chica${i}`, { genero: 'chica' as const })),
    ]
    const tamanios = resolverTamanios(alumnos.length, { porNumEquipos: 4, sobra: 'repartir' })

    const { equipos } = generarEquipos({
      alumnos,
      tamanios,
      modo: 'aleatorio',
      equilibrarGenero: true,
      aleatorio: rngDeterminista(5),
    })

    const chicosPorEquipo = equipos.map((eq) => eq.filter((id) => id.startsWith('chico')).length)
    const chicasPorEquipo = equipos.map((eq) => eq.filter((id) => id.startsWith('chica')).length)
    expect(Math.max(...chicosPorEquipo) - Math.min(...chicosPorEquipo)).toBeLessThanOrEqual(1)
    expect(Math.max(...chicasPorEquipo) - Math.min(...chicasPorEquipo)).toBeLessThanOrEqual(1)
  })
})

describe('filtrarPorPresentes', () => {
  it('ningún ausente aparece en la lista filtrada', () => {
    const alumnos = Array.from({ length: 6 }, (_, i) => alumno(`a${i}`))
    const presentes = new Set(['a0', 'a2', 'a4'])

    const resultado = filtrarPorPresentes(alumnos, presentes)

    expect(resultado.map((a) => a.id).sort()).toEqual(['a0', 'a2', 'a4'])
    expect(resultado.some((a) => a.id === 'a1' || a.id === 'a3' || a.id === 'a5')).toBe(false)
  })
})
