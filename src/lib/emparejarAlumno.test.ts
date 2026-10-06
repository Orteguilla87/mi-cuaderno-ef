import { describe, expect, it } from 'vitest'
import type { Alumno } from '../db/types'
import { canonico, emparejarAlumno, fragmentoParaAlias } from './emparejarAlumno'

function alumno(id: string, nombre: string, apellidos: string, extra: Partial<Alumno> = {}): Alumno {
  return { id, grupoId: 'g4a', nombre, apellidos, alias: '', activo: true, ...extra }
}

/** Un grupo de 4ºA con nombres corrientes; los casos de abajo salen de dictados reales. */
const GRUPO: Alumno[] = [
  alumno('pablo', 'Pablo', 'García López'),
  alumno('lucia', 'Lucía', 'Martín Ruiz'),
  alumno('ruben', 'Rubén', 'Iglesias Peña'),
  alumno('carmen', 'Carmen', 'Herrera Soto'),
  alumno('javier', 'Javier', 'Medina Prieto'),
  alumno('mateo', 'Mateo', 'Ibáñez Cuartero'),
  alumno('alba', 'Alba', 'Sanz Rey'),
  alumno('iker', 'Íker', 'Moreno Gómez'),
  alumno('vega', 'Vega', 'Santos Lozano'),
  alumno('yaiza', 'Yaiza', 'Hidalgo Mora'),
  alumno('valeria', 'Valeria', 'Molina Ortiz'),
  alumno('guille', 'Guillermo', 'Bravo Calvo', { alias: 'Guille' }),
]

function unico(texto: string, alumnos = GRUPO): string | undefined {
  const r = emparejarAlumno(texto, alumnos)
  return r.estado === 'unico' ? r.alumno.id : undefined
}

describe('canonico: forma fonética del español', () => {
  it.each([
    ['Yaisa', 'Yaiza'],
    ['Iker', 'Íker'],
    ['Billy', 'Villi'],
    ['Jenaro', 'Genaro'],
    ['Quique', 'Kike'],
    ['Hugo', 'Ugo'],
    ['Cecilia', 'Zezilia'],
    ['Ruben', 'Rubén'],
  ])('%s ≡ %s', (a, b) => {
    expect(canonico(a)).toBe(canonico(b))
  })

  it('«gu» ante e/i no se convierte en «j», y la g ante a/o/u sigue siendo g', () => {
    expect(canonico('Guille')).not.toBe(canonico('Jille'))
    expect(canonico('Gorge')).not.toBe(canonico('Jorge'))
  })
})

describe('emparejarAlumno', () => {
  it('encuentra al alumno por su nombre de pila', () => {
    expect(unico('Rubén no trae chándal')).toBe('ruben')
    expect(unico('Pablo, falta')).toBe('pablo')
    expect(unico('Íker ha llegado tarde')).toBe('iker')
  })

  it('tolera tildes, puntuación y variantes fonéticas', () => {
    expect(unico('Ruben no trae chandal')).toBe('ruben')
    expect(unico('Iker ha llegado tarde')).toBe('iker')
    expect(unico('Yaisa falta')).toBe('yaiza')
  })

  it('reconoce apellidos, nombre + apellido y el alias visible', () => {
    expect(unico('Herrera sin chándal')).toBe('carmen')
    expect(unico('Valeria Molina falta')).toBe('valeria')
    expect(unico('Guille muy bien en el calentamiento')).toBe('guille')
  })

  it('un nombre que no es de nadie no sugiere a nadie', () => {
    expect(emparejarAlumno('Bea muy bien en el calentamiento', GRUPO).estado).toBe('ninguno')
    expect(emparejarAlumno('Marcos presente', GRUPO).estado).toBe('ninguno')
    expect(emparejarAlumno('Bernabé no ha venido', GRUPO).estado).toBe('ninguno')
  })

  it('las palabras de la orden no compiten con los nombres', () => {
    // Antes «falta» traía a Alba y «trae»/«tarde» a Herrera.
    expect(emparejarAlumno('falta', GRUPO).estado).toBe('ninguno')
    expect(emparejarAlumno('no trae chándal y llega tarde', GRUPO).estado).toBe('ninguno')
  })

  it('dos alumnos que encajan igual salen los dos: no decide por el maestro', () => {
    const dosPablos = [...GRUPO, alumno('pablo2', 'Pablo', 'Vidal Cano')]
    const r = emparejarAlumno('Pablo falta', dosPablos)
    expect(r.estado).toBe('varios')
    expect(r.candidatos.map((c) => c.alumno.id).sort()).toEqual(['pablo', 'pablo2'])
  })

  it('el apellido desempata a dos con el mismo nombre', () => {
    const dosPablos = [...GRUPO, alumno('pablo2', 'Pablo', 'Vidal Cano')]
    expect(unico('Pablo Vidal falta', dosPablos)).toBe('pablo2')
  })

  it('un alumno de otro grupo con nombre idéntico nunca se devuelve', () => {
    // La regla dura: solo se busca en el grupo resuelto. El de 3ºB no está en
    // la lista que recibe el emparejador, así que no puede salir.
    const deTercero = alumno('ruben-3b', 'Rubén', 'Iglesias Peña', { grupoId: 'g3b' })
    const delGrupo = [...GRUPO, deTercero].filter((a) => a.grupoId === 'g4a')
    const r = emparejarAlumno('Rubén falta', delGrupo)
    expect(r.estado).toBe('unico')
    expect(r.candidatos.map((c) => c.alumno.id)).not.toContain('ruben-3b')
  })

  it('un alias corto solo vale idéntico', () => {
    const conLu = GRUPO.map((a) => (a.id === 'lucia' ? { ...a, alias: 'Lu' } : a))
    expect(unico('Lu necesita consigna corta', conLu)).toBe('lucia')
    expect(emparejarAlumno('lo necesita', conLu).estado).toBe('ninguno')
  })

  it('reconoce los alias de voz', () => {
    const conAlias = GRUPO.map((a) => (a.id === 'mateo' ? { ...a, aliasVoz: ['Peque'] } : a))
    expect(unico('Peque sin chándal', conAlias)).toBe('mateo')
    expect(emparejarAlumno('Peque sin chándal', GRUPO).estado).toBe('ninguno')
  })
})

describe('fragmentoParaAlias', () => {
  it('propone lo dictado para nombrarlo, no las palabras de la orden', () => {
    const vega = GRUPO.find((a) => a.id === 'vega')!
    expect(fragmentoParaAlias('Bea falta', vega)).toBe('Bea')
  })

  it('no propone lo que ya es un alias de voz', () => {
    const vega = { ...GRUPO.find((a) => a.id === 'vega')!, aliasVoz: ['Bea'] }
    expect(fragmentoParaAlias('Bea falta', vega)).toBeUndefined()
  })
})
