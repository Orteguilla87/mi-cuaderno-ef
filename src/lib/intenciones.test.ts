import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { interpretarIntenciones, type ContextoIntencion, type Intencion } from './intenciones'
import { buscarAlumnoEnTexto } from './pseudonimizacion'
import type { Alumno } from '../db/types'

/**
 * Todo lo de aquí tiene que resolverse SIN red. El espía sobre `fetch` no es
 * decorativo: es la prueba de que la API no se toca para las órdenes normales
 * (2.1) y de que ningún dato de alumnado sale del dispositivo (2.5).
 */
let espiaFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  espiaFetch = vi.fn(() => {
    throw new Error('el parser local no debe llamar a la red')
  })
  vi.stubGlobal('fetch', espiaFetch)
})

afterEach(() => {
  expect(espiaFetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

function alumno(id: string, nombre: string, apellidos: string): Alumno {
  return { id, grupoId: 'g1', nombre, apellidos, alias: '', activo: true }
}

const ALUMNOS = [
  alumno('a1', 'Marta', 'López Ruiz'),
  alumno('a2', 'Luis', 'Pérez Gil'),
  alumno('a3', 'Ana', 'Serrano Díaz'),
]

const ctx: ContextoIntencion = {
  alumnos: ALUMNOS,
  columnas: [
    { id: 'c1', titulo: 'Participación', tipo: 'contador' },
    { id: 'c2', titulo: 'Salto de altura', tipo: 'numero' },
  ],
  etapa: 'primaria',
  buscarAlumno: buscarAlumnoEnTexto,
  hoy: '2026-09-22',
}

/** Atajo: la única acción de un resultado que debe traer exactamente una. */
function accion(texto: string, contexto: ContextoIntencion = ctx): Intencion {
  const r = interpretarIntenciones(texto, contexto)
  expect(r.tipo).toBe('acciones')
  if (r.tipo !== 'acciones') throw new Error('no')
  expect(r.acciones).toHaveLength(1)
  return r.acciones[0]
}

describe('acciones sin riesgo', () => {
  it('alumno aleatorio', () => {
    expect(accion('saca a alguien al azar').accion).toBe('alumno_aleatorio')
    expect(accion('sorteo').accion).toBe('alumno_aleatorio')
  })

  it('equipos por número, por tamaño y por niveles', () => {
    const cuatro = accion('haz cuatro equipos')
    expect(cuatro).toMatchObject({ accion: 'generar_equipos', porNumEquipos: 4, modo: 'aleatorio' })

    const deCinco = accion('haz equipos de cinco')
    expect(deCinco).toMatchObject({ accion: 'generar_equipos', porTamano: 5 })

    expect(accion('genera 3 equipos equilibrados')).toMatchObject({ modo: 'heterogeneo' })
    expect(accion('genera 3 equipos por niveles')).toMatchObject({ modo: 'homogeneo' })
  })

  it('marcador: abrir y puntuar', () => {
    expect(accion('abre el marcador de 4 equipos')).toMatchObject({
      accion: 'marcador_abrir',
      equipos: 4,
    })
    expect(accion('suma dos puntos al equipo 3')).toMatchObject({
      accion: 'marcador_puntos',
      equipo: 3,
      delta: 2,
    })
    expect(accion('resta un punto al equipo 1')).toMatchObject({ equipo: 1, delta: -1 })
  })

  it('abrir una vista', () => {
    expect(accion('abre el cuaderno')).toMatchObject({ accion: 'abrir_vista', ruta: 'cuaderno' })
    expect(accion('ve al planificador')).toMatchObject({ ruta: 'planificador' })
  })
})

describe('escritura reversible', () => {
  it('pasar lista con sus cuatro estados y el chándal', () => {
    expect(accion('Marta falta')).toMatchObject({ accion: 'pasar_lista', alumnoId: 'a1', estado: 'falta' })
    expect(accion('Luis llega tarde')).toMatchObject({ estado: 'retraso', alumnoId: 'a2' })
    expect(accion('Ana justificada')).toMatchObject({ estado: 'justificada', alumnoId: 'a3' })
    expect(accion('Marta presente')).toMatchObject({ estado: 'presente' })
    expect(accion('Luis sin chándal')).toMatchObject({ accion: 'pasar_lista', chandal: false })
  })

  it('«un positivo» a secas va al contador de observaciones', () => {
    const a = accion('Marta un positivo')
    expect(a).toMatchObject({ accion: 'observacion', alumnoId: 'a1', signo: '+', texto: '' })
  })

  it('una observación con texto conserva el texto', () => {
    const a = accion('Ana un positivo ha ayudado a un compañero')
    expect(a).toMatchObject({ accion: 'observacion', signo: '+' })
    if (a.accion !== 'observacion') throw new Error('no')
    expect(a.texto).toContain('ha ayudado a un compañero')
  })

  it('nombrando una columna, el punto va a la celda del Cuaderno', () => {
    expect(accion('Marta un punto en participación')).toMatchObject({
      accion: 'contador_celda',
      alumnoId: 'a1',
      columnaId: 'c1',
      delta: 1,
    })
    expect(accion('Luis quita un punto en participación')).toMatchObject({ delta: -1 })
  })

  it('una nota numérica va a su columna', () => {
    expect(accion('Marta un 8 en salto de altura')).toMatchObject({
      accion: 'nota_celda',
      columnaId: 'c2',
      valor: 8,
    })
  })

  it('la etiqueta de lesionado', () => {
    expect(accion('Luis lesionado')).toMatchObject({
      accion: 'etiqueta_lesionado',
      alumnoId: 'a2',
    })
  })
})

describe('crear columna (sensible)', () => {
  it('sin decir el tipo, se propone uno y queda marcado como propuesta', () => {
    const a = accion('crea una columna de equilibrios')
    expect(a).toMatchObject({ accion: 'crear_columna', riesgo: 'sensible', tipoPropuesto: true })
    if (a.accion !== 'crear_columna') throw new Error('no')
    expect(a.titulo).toBe('equilibrios')
  })

  it('con indicio en el habla, se propone el tipo que toca y sin marca de duda', () => {
    expect(accion('crea una columna contador de participación')).toMatchObject({
      tipo: 'contador',
      tipoPropuesto: false,
    })
    expect(accion('crea una columna de nota de salto')).toMatchObject({ tipo: 'numero', tipoPropuesto: false })
  })

  it('en Infantil el tipo propuesto no es numérico', () => {
    const infantil = { ...ctx, etapa: 'infantil' as const }
    expect(accion('crea una columna de saltos', infantil)).toMatchObject({ tipo: 'si_no' })
  })

  it('no se vincula unidad ni criterios: solo el título', () => {
    const a = accion('crea una columna de equilibrios')
    expect(Object.keys(a)).toEqual(
      expect.not.arrayContaining(['udId', 'criterioCodigo', 'pesoUd']),
    )
  })
})

describe('consultas de solo lectura', () => {
  const consulta = (texto: string) => {
    const r = interpretarIntenciones(texto, ctx)
    expect(r.tipo).toBe('consulta')
    if (r.tipo !== 'consulta') throw new Error('no')
    return r.consulta
  }

  it('qué toca mañana', () => {
    expect(consulta('qué toca mañana')).toEqual({ consulta: 'sesion_del_dia', fecha: '2026-09-23' })
  })

  it('las seis restantes', () => {
    expect(consulta('muestra las observaciones de Marta')).toMatchObject({
      consulta: 'observaciones_alumno',
      alumnoId: 'a1',
    })
    expect(consulta('quién falta hoy')).toMatchObject({ consulta: 'quien_falta' })
    expect(consulta('quién está lesionado')).toMatchObject({ consulta: 'quien_lesionado' })
    expect(consulta('cuántos positivos lleva Ana')).toMatchObject({
      consulta: 'positivos_alumno',
      alumnoId: 'a3',
    })
    expect(consulta('qué material necesito mañana')).toMatchObject({
      consulta: 'material_del_dia',
      fecha: '2026-09-23',
    })
    expect(consulta('por qué sesión voy')).toMatchObject({ consulta: 'progreso_unidad' })
  })

  it('ninguna consulta devuelve texto que haya que generar', () => {
    const r = interpretarIntenciones('muestra las observaciones de Marta', ctx)
    if (r.tipo !== 'consulta') throw new Error('no')
    // El parser solo clasifica: la respuesta la arma `db/consultas.ts` en local.
    expect(Object.keys(r.consulta)).toEqual(['consulta', 'alumnoId'])
  })
})

describe('prohibidas por voz', () => {
  const rechaza = (texto: string) => {
    const r = interpretarIntenciones(texto, ctx)
    expect(r.tipo).toBe('rechazada')
    if (r.tipo !== 'rechazada') throw new Error('no')
    expect(r.motivo.length).toBeGreaterThan(20)
    return r.motivo
  }

  it('cada una se rechaza con su explicación', () => {
    expect(rechaza('vuelca la unidad 2 al grupo')).toMatch(/Planificador/)
    expect(rechaza('elimina la sesión del martes')).toMatch(/Planificador/)
    expect(rechaza('borra el grupo cuarto a')).toMatch(/Grupos/)
    expect(rechaza('mueve la sesión de mañana')).toMatch(/Planificador/)
    expect(rechaza('cambia el pin')).toMatch(/Ajustes/)
    expect(rechaza('exporta los datos')).toMatch(/Ajustes/)
    expect(rechaza('sincroniza ahora')).toMatch(/Ajustes/)
  })
})

describe('órdenes encadenadas', () => {
  it('dos órdenes en una frase salen como dos acciones', () => {
    const r = interpretarIntenciones('Marta un positivo y Luis un punto en participación', ctx)
    expect(r.tipo).toBe('acciones')
    if (r.tipo !== 'acciones') throw new Error('no')
    expect(r.acciones).toHaveLength(2)
    expect(r.acciones[0]).toMatchObject({ accion: 'observacion', alumnoId: 'a1' })
    expect(r.acciones[1]).toMatchObject({ accion: 'contador_celda', alumnoId: 'a2' })
  })

  it('una «y» dentro de una observación no la parte en dos', () => {
    const r = interpretarIntenciones('Ana un positivo ha ayudado y ha recogido el material', ctx)
    expect(r.tipo).toBe('acciones')
    if (r.tipo !== 'acciones') throw new Error('no')
    expect(r.acciones).toHaveLength(1)
  })
})

describe('lo que no entiende', () => {
  it('devuelve no_reconocido para que entre la IA, sin inventar nada', () => {
    expect(interpretarIntenciones('a ver qué tal ha ido la clase de hoy en general', ctx).tipo).toBe(
      'no_reconocido',
    )
  })
})
