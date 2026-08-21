import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { aplicarUnidadAGrupo, importarUnidad } from './planificador'
import { analizarTexto } from '../lib/importarTexto'
import { textoMaterial } from '../lib/recursosTexto'

/**
 * El camino entero de una unidad real: pegar → analizar → importar → llevarla a
 * un grupo → preparar el material.
 *
 * Existe porque los tests de cada pieza pasaban y la cadena seguía rota: el
 * importador guardaba el material ya troceado y sin etiqueta, y «Preparar el
 * material» —que exigía etiqueta— devolvía una lista vacía. Ninguna prueba de
 * unidad podía verlo, porque el fallo estaba justo en la costura.
 */

// Programación tal como se escribe en Word: acentos, viñetas de Word, material
// bajo etiqueta, un enlace suelto, otro dentro de una frase, y una lista
// numerada de actividades dentro de una sesión.
const TEXTO = [
  'UD 4 — Habilidades con móvil: el balón',
  '',
  'Sesión 1: Nos hacemos amigos del balón',
  'Asamblea inicial: recordamos las normas del pabellón.',
  'Parte principal: desplazamientos libres botando con la mano dominante y, después,',
  'con la no dominante. Al oír el silbato, se para el bote y se sujeta el balón.',
  'Vuelta a la calma: estiramientos de muñeca y hombro.',
  'Material: 25 balones de baloncesto, 12 conos',
  '',
  'Sesión 2: El bote en movimiento',
  'Asamblea inicial: repaso de lo anterior.',
  'Parte principal: circuito de conos botando.',
  '1. Calentamiento articular',
  '2. Circuito lento',
  '3. Circuito con cambio de mano',
  'Vuelta a la calma: respiraciones.',
  'Material:',
  '• 25 balones de baloncesto',
  '• 20 conos',
  '• 4 aros',
  'https://ejemplo.org/video-bote',
  '',
  'Sesión 3: Diez pases',
  'El vídeo de https://ejemplo.org/diez-pases explica la progresión que seguimos.',
  'Parte principal: juego de los diez pases en campo reducido, equipos de cinco.',
  'Material: 6 balones, 8 petos',
  'Enlaces: https://ejemplo.org/reglas-diez-pases',
].join('\n')

const CURSO_ID = 'curso1'
const GRUPO_ID = 'g1'

beforeEach(async () => {
  await db.cursos.put({
    id: CURSO_ID,
    nombre: '2026-2027',
    activo: true,
    inicio: '2026-09-07',
    fin: '2027-06-18',
    trimestres: [
      { n: 1, inicio: '2026-09-07', fin: '2026-12-22' },
      { n: 2, inicio: '2027-01-11', fin: '2027-03-18' },
      { n: 3, inicio: '2027-03-30', fin: '2027-06-18' },
    ],
    festivos: ['2026-10-13'], // martes: se salta
    periodosNoLectivos: [],
  })
  await db.grupos.put({
    id: GRUPO_ID,
    cursoEscolarId: CURSO_ID,
    nombre: '4ºB',
    etapa: 'primaria',
    nivel: 4,
    color: '#006A80',
    orden: 0,
    horario: [{ diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' }],
  })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('una unidad real, de punta a punta', () => {
  it('analiza el texto sin inventar ni trocear de más', () => {
    const r = analizarTexto(TEXTO)

    expect(r.tituloUnidad).toBe('UD 4 — Habilidades con móvil: el balón')
    expect(r.ambiguo).toBe(false)
    expect(r.sesiones.map((s) => s.titulo)).toEqual([
      'Nos hacemos amigos del balón',
      'El bote en movimiento',
      'Diez pases',
    ])

    // La lista numerada de la sesión 2 es contenido, no tres sesiones más.
    expect(r.sesiones[1].descripcion).toContain('1. Calentamiento articular')
    expect(r.sesiones[1].descripcion).toContain('3. Circuito con cambio de mano')

    // Material: la lista en línea y la de viñetas de Word salen igual.
    expect(r.sesiones[0].recursos).toEqual(['25 balones de baloncesto', '12 conos'])
    expect(r.sesiones[1].recursos).toEqual(['25 balones de baloncesto', '20 conos', '4 aros'])

    // Enlace en línea propia: se mueve. Dentro de una frase: se copia y se deja.
    expect(r.sesiones[1].enlacesYNotas).toBe('https://ejemplo.org/video-bote')
    expect(r.sesiones[1].descripcion).not.toContain('http')
    expect(r.sesiones[2].descripcion).toContain('El vídeo de https://ejemplo.org/diez-pases')
    expect(r.sesiones[2].enlacesYNotas.split('\n')).toEqual([
      'https://ejemplo.org/diez-pases',
      'https://ejemplo.org/reglas-diez-pases',
    ])
  })

  it('guarda la unidad, la coloca en el grupo y devuelve el material listo para copiar', async () => {
    const r = analizarTexto(TEXTO)

    const { id } = await importarUnidad({
      etapa: 'primaria',
      nivel: 4,
      titulo: r.tituloUnidad!,
      sesiones: r.sesiones.map((s) => ({
        titulo: s.titulo!,
        descripcion: s.descripcion,
        recursos: s.recursos,
        enlacesYNotas: s.enlacesYNotas,
      })),
    })

    const ud = await db.unidades.get(id)
    expect(ud?.sesiones).toHaveLength(3)
    expect(ud?.trimestre).toBeNull()
    expect(ud?.sesiones?.[0].recursosNecesarios).toBe('25 balones de baloncesto, 12 conos')
    expect(ud?.sesiones?.[2].recursos).toEqual([
      { tipo: 'enlace', valor: 'https://ejemplo.org/diez-pases' },
      { tipo: 'enlace', valor: 'https://ejemplo.org/reglas-diez-pases' },
    ])

    const aplicada = await aplicarUnidadAGrupo({ udId: id, grupoId: GRUPO_ID, desde: '2026-10-06' })
    expect(aplicada).toMatchObject({ creadas: 3, omitidas: 0, sinHueco: 0 })

    const sesiones = (await db.sesiones.toArray()).sort((a, b) => a.fecha.localeCompare(b.fecha))
    // Martes seguidos saltando el festivo del 13.
    expect(sesiones.map((s) => s.fecha)).toEqual(['2026-10-06', '2026-10-20', '2026-10-27'])

    // La costura que estaba rota: el campo guardado por la importación no lleva
    // etiqueta, y aun así «Preparar el material» tiene que leerlo.
    const texto = textoMaterial(
      sesiones.map((s) => ({
        fecha: s.fecha,
        clases: [{ grupo: '4ºB', texto: s.recursosNecesarios }],
      })),
    )
    expect(texto).toContain('- 25 balones de baloncesto')
    expect(texto).toContain('- 8 petos')
    expect(texto).toContain('Total de la semana')
    expect(texto).not.toContain('#')
    expect(texto).not.toContain('|')
  })
})
