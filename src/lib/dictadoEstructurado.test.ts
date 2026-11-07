import { describe, expect, it } from 'vitest'
import { partirPorCurso, redactarComentario, sanearComentario, signoDeComentario } from './dictadoEstructurado'
import { emparejarNombre as emparejarAlumno } from './emparejarAlumno'
import { desempatarGrupo } from '../db/agente'
import type { Alumno, Grupo } from '../db/types'

/**
 * Convención fija del maestro: NOMBRE, CURSO, LO QUE HA HECHO. Lo que se sujeta
 * aquí es que el curso parta la frase, que el alumno se busque solo con el
 * nombre y solo dentro del grupo, y que el comentario salga limpio.
 */

function grupo(id: string, nombre: string, nivel: number, alias: string[] = []): Grupo {
  return { id, cursoEscolarId: 'c1', nombre, etapa: 'primaria', nivel, color: '#006A80', orden: 0, horario: [], alias }
}

function alumno(id: string, grupoId: string, nombre: string, apellidos: string, extra: Partial<Alumno> = {}): Alumno {
  return { id, grupoId, nombre, apellidos, alias: '', activo: true, ...extra } as Alumno
}

const cuartoA = grupo('g4a', '4ºA', 4, ['4A'])
const cuartoB = grupo('g4b', '4ºB', 4, ['4B'])
const quintoA = grupo('g5a', '5ºA', 5)
const GRUPOS = [cuartoA, cuartoB, quintoA]

const ALUMNOS = [
  alumno('a1', 'g4a', 'David', 'Sánchez Ruiz'),
  alumno('a2', 'g4a', 'Daniel', 'Ruiz Gómez'),
  alumno('a3', 'g4a', 'Álvaro', 'Gil Herrera'),
  alumno('a4', 'g4a', 'Yolanda', 'Vidal Pérez'),
  alumno('a5', 'g4a', 'Beatriz', 'Herrera Lago', { alias: 'Bea', aliasVoz: ['la Bea'] }),
  alumno('a6', 'g4a', 'Hugo', 'Cuartero Martín'),
  alumno('b1', 'g4b', 'Lucía', 'Martín Díaz'),
  alumno('b2', 'g4b', 'Lucía', 'Moreno Soto'),
  alumno('b3', 'g4b', 'David', 'López Vega'),
  alumno('c1', 'g5a', 'María de los Ángeles', 'Pérez Gil'),
  alumno('c2', 'g5a', 'Ángela', 'Ruiz Mora'),
]
const de = (g: Grupo) => ALUMNOS.filter((a) => a.grupoId === g.id)

describe('partirPorCurso', () => {
  it('«David de cuarto A ha ayudado…» → David de 4ºA, comentario «Ha ayudado…»', () => {
    const p = partirPorCurso('David de cuarto A ha ayudado a recoger el material', GRUPOS)!
    expect(p.nombre).toBe('David')
    expect(p.candidatos).toEqual([cuartoA])
    expect(redactarComentario(p.comentario)).toBe('Ha ayudado a recoger el material')

    const r = emparejarAlumno(p.nombre, de(cuartoA))
    expect(r.estado === 'unico' && r.alumno.id).toBe('a1')
  })

  it('«Lucía Martín del 4ºB no ha traído el chándal» → Lucía Martín, «No ha traído el chándal»', () => {
    const p = partirPorCurso('Lucía Martín del 4ºB no ha traído el chándal', GRUPOS)!
    expect(p.nombre).toBe('Lucía Martín')
    expect(p.candidatos).toEqual([cuartoB])
    expect(redactarComentario(p.comentario)).toBe('No ha traído el chándal')

    // Con otra Lucía en la misma clase, el apellido desempata.
    const r = emparejarAlumno(p.nombre, de(cuartoB))
    expect(r.estado === 'unico' && r.alumno.id).toBe('b1')
  })

  it('«María de los Ángeles de quinto ha…»: el «de» interno no corta el nombre', () => {
    const p = partirPorCurso('María de los Ángeles de quinto ha liderado el calentamiento', GRUPOS)!
    expect(p.nombre).toBe('María de los Ángeles')
    expect(p.candidatos).toEqual([quintoA])
    expect(redactarComentario(p.comentario)).toBe('Ha liderado el calentamiento')

    const r = emparejarAlumno(p.nombre, de(quintoA))
    expect(r.estado === 'unico' && r.alumno.id).toBe('c1')
  })

  it('también con área («de cuarto de lengua») y con número escrito pegado', () => {
    const lengua = grupo('g4l', '4ºA Lengua', 4, ['cuarto de lengua'])
    const p = partirPorCurso('Hugo de cuarto de lengua ha leído en voz alta', [...GRUPOS, lengua])!
    expect(p.nombre).toBe('Hugo')
    expect(p.candidatos).toEqual([lengua])
    expect(redactarComentario(p.comentario)).toBe('Ha leído en voz alta')

    const p2 = partirPorCurso('Álvaro del 4A, que ha corrido mucho', GRUPOS)!
    expect(p2.candidatos).toEqual([cuartoA])
    expect(redactarComentario(p2.comentario)).toBe('Ha corrido mucho')
  })

  it('sin «de/del + curso» no hay partición (y un «de» suelto no corta)', () => {
    expect(partirPorCurso('Pablo sin chándal', GRUPOS)).toBeNull()
    expect(partirPorCurso('Cuarto A, Ana ha ayudado', GRUPOS)).toBeNull()
    expect(partirPorCurso('María de los Ángeles ha ayudado', GRUPOS)).toBeNull()
    // «de 4» con un dígito suelto no es un curso.
    expect(partirPorCurso('David ha sacado nota de 4 en salto', GRUPOS)).toBeNull()
    // Sin nombre delante, o con una orden delante, no es la convención.
    expect(partirPorCurso('de cuarto A, Ana ha ayudado', GRUPOS)).toBeNull()
    expect(partirPorCurso('haz equipos de cuarto A', GRUPOS)).toBeNull()
    expect(partirPorCurso('cuántas faltas tiene David de cuarto A', GRUPOS)).toBeNull()
  })
})

describe('grupo', () => {
  it('«David de cuarto ha…» con 4ºA y 4ºB: desempata por el grupo abierto o pregunta', () => {
    const p = partirPorCurso('David de cuarto ha ayudado a montar el circuito', GRUPOS)!
    expect(p.nombre).toBe('David')
    expect(p.candidatos).toEqual([cuartoA, cuartoB])

    // Sin contexto ni franja: pregunta con los dos, no elige.
    const sinContexto = desempatarGrupo(p.candidatos, undefined, { fecha: '2026-11-07', hora: '20:00' })
    expect(sinContexto.grupo).toBeUndefined()
    expect(sinContexto.ambiguos).toEqual([cuartoA, cuartoB])

    // Con 4ºB abierto en la app, es ese.
    expect(desempatarGrupo(p.candidatos, cuartoB).grupo).toBe(cuartoB)
  })

  it('un curso que no existe no se resuelve a ninguno: se pregunta', () => {
    const p = partirPorCurso('Ana de sexto ha ayudado', GRUPOS)!
    expect(p.candidatos).toEqual([])
    expect(desempatarGrupo(p.candidatos).grupo).toBeUndefined()
  })
})

describe('emparejamiento del tramo del nombre', () => {
  it('b/v y ll/y cambiadas siguen emparejando', () => {
    expect(emparejarAlumno(partirPorCurso('Llolanda de cuarto A ha estado atenta', GRUPOS)!.nombre, de(cuartoA)))
      .toMatchObject({ estado: 'unico', alumno: { id: 'a4' } })
    expect(emparejarAlumno(partirPorCurso('Albaro de cuarto A va muy bien', GRUPOS)!.nombre, de(cuartoA)))
      .toMatchObject({ estado: 'unico', alumno: { id: 'a3' } })
  })

  it('un nombre que no está en el grupo no sugiere a nadie (la UI enseña la lista)', () => {
    const p = partirPorCurso('Pablo de cuarto A ha llegado tarde', GRUPOS)!
    expect(emparejarAlumno(p.nombre, de(cuartoA)).estado).toBe('ninguno')
    // Lucía existe, pero en 4ºB: dentro de 4ºA no se la busca.
    expect(emparejarAlumno('Lucía Martín', de(cuartoA)).estado).toBe('ninguno')
  })

  it('dos candidatos próximos (Martín / Marín): se enseñan los dos, no se elige', () => {
    const conMarin = [...de(cuartoB), alumno('b9', 'g4b', 'Lucía', 'Marín Soto')]
    const r = emparejarAlumno('Lucía Martín', conMarin)
    expect(r.estado).toBe('varios')
    expect(r.candidatos.map((c) => c.alumno.id).sort()).toEqual(['b1', 'b9'])
  })

  it('el nombre de pila con dos alumnos que lo comparten: pregunta', () => {
    const r = emparejarAlumno('Lucía', de(cuartoB))
    expect(r.estado).toBe('varios')
  })

  it('el alias de voz y el artículo delante («la Bea») emparejan', () => {
    expect(emparejarAlumno('la Bea', de(cuartoA))).toMatchObject({ estado: 'unico', alumno: { id: 'a5' } })
  })

  it('el comentario ya no compite con el nombre: «Bea… ha molestado a Hugo» es Bea', () => {
    const p = partirPorCurso('Bea de cuarto A ha vuelto a molestar a Hugo', GRUPOS)!
    expect(emparejarAlumno(p.nombre, de(cuartoA))).toMatchObject({ estado: 'unico', alumno: { id: 'a5' } })
  })
})

describe('sanearComentario', () => {
  const bea = ALUMNOS.find((a) => a.id === 'a5')!
  const maria = ALUMNOS.find((a) => a.id === 'c1')!

  it('nunca deja nombre, apellidos, alias, alias de voz, curso ni marcadores', () => {
    const contaminados = [
      'Beatriz ha ayudado a recoger el material',
      'Bea de cuarto A ha ayudado a recoger el material',
      'La Bea ha ayudado a recoger el material',
      '[A5] ha ayudado a recoger el material [G1]',
      'Beatriz Herrera, del 4ºA, ha ayudado a recoger el material',
      'Ha ayudado a recoger el material (4A)',
    ]
    for (const t of contaminados) {
      const s = sanearComentario(t, { alumno: bea, grupo: cuartoA, mencion: 'cuarto A' })
      expect(s).toMatch(/ha ayudado a recoger el material/i)
      expect(s).not.toMatch(/beatriz|\bbea\b|herrera|cuarto|4\s*º?\s*a\b|\[|\]/i)
    }
  })

  it('no se lleva las partículas de un nombre compuesto', () => {
    expect(sanearComentario('María de los Ángeles ha ayudado a los de su equipo', { alumno: maria })).toBe(
      'Ha ayudado a los de su equipo',
    )
  })

  it('deja intactos los nombres de OTROS alumnos y el resto del texto', () => {
    expect(sanearComentario('Ha vuelto a molestar a Hugo', { alumno: bea, grupo: cuartoA })).toBe(
      'Ha vuelto a molestar a Hugo',
    )
  })
})

describe('signo del comentario', () => {
  it('positivo, negativo o neutro por palabras clave', () => {
    expect(signoDeComentario('Ha ayudado a recoger el material')).toBe('+')
    expect(signoDeComentario('No ha traído el chándal')).toBe('-')
    expect(signoDeComentario('Ha vuelto a molestar a Hugo')).toBe('-')
    expect(signoDeComentario('Ha ido al baño')).toBe('neutro')
  })
})

describe('IA: solo recibe el tramo del comentario', () => {
  it('no viaja ni el nombre del alumno ni el grupo; lo devuelto se despseudonimiza y se sanea', async () => {
    const { interpretarComentarioConApi, SISTEMA_COMENTARIO } = await import('../db/agenteApi')
    const bea = ALUMNOS.find((a) => a.id === 'a5')!
    const p = partirPorCurso('Bea de cuarto A ha vuelto a molestar a Hugo', GRUPOS)!
    let cuerpo = ''
    const original = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      cuerpo = init.body
      const enviado = JSON.parse(init.body).messages[0].content as string
      const token = /\[A\d+\]/.exec(enviado)![0]
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'registrar_observacion',
              // El modelo «desobedece»: mete marcador, nombre y curso.
              input: { signo: '-', texto: `[A5] Bea de cuarto A ha molestado a ${token}` },
            },
          ],
        }),
      }
    }) as unknown as typeof fetch
    try {
      const r = await interpretarComentarioConApi(p.comentario, de(cuartoA), cuartoA, { apiKey: 'k', modelo: 'm' })
      expect(cuerpo).not.toMatch(/Bea|Beatriz|cuarto|4ºA|Hugo/)
      expect(cuerpo).toContain(JSON.stringify(SISTEMA_COMENTARIO).slice(1, 40))
      const final = sanearComentario(String(r!.input.texto), { alumno: bea, grupo: cuartoA, mencion: p.mencion })
      expect(final).toBe('Ha molestado a Hugo')
    } finally {
      globalThis.fetch = original
    }
  })
})
