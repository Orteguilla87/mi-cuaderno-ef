import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

/**
 * La migración v14 → v15 tal como la vive un dispositivo con datos: se crea una
 * base con el esquema viejo, se llena, se cierra y se abre con el modelo nuevo.
 *
 * El `upgrade()` de la v15 no solo añade campos: CREA la fila de cada
 * instrumento. Si fallara, el usuario abriría la app un lunes con todo el
 * trimestre evaluado y sin una sola nota calculada.
 *
 * Va en un fichero propio porque tiene que abrir la base antes que nadie: los
 * demás tests de Dexie importan el singleton ya en la v15.
 */

/** El esquema tal como quedó en la v14, con sus tablas y sus índices. */
const ESQUEMA_V14 = {
  cursos: 'id, nombre, activo',
  grupos: 'id, cursoEscolarId, etapa, nivel, orden',
  alumnos: 'id, grupoId, apellidos, activo, [grupoId+activo]',
  asistencias: 'id, alumnoId, fecha, [alumnoId+fecha]',
  sesiones: 'id, grupoId, fecha, udId, [grupoId+fecha]',
  observaciones: 'id, alumnoId, grupoId, fecha, tipo, [grupoId+fecha]',
  unidades: 'id, nivel, trimestre, [nivel+trimestre]',
  instrumentos: 'id, udId, tipo',
  calificaciones: 'id, alumnoId, instrumentoId, itemId, trimestre, [alumnoId+trimestre], [alumnoId+itemId]',
  evalTrimestrales: 'id, alumnoId, trimestre, [alumnoId+trimestre]',
  evalFinales: 'id, alumnoId',
  registrosInfantil: 'id, alumnoId, criterioCodigo, momento, [alumnoId+momento], [alumnoId+criterioCodigo+momento]',
  informesInfantil: 'id, alumnoId, trimestre, [alumnoId+trimestre]',
  comentarios: 'id, categoria, etapa',
  juegos: 'id, nombre, *etiquetas',
  plantillas: 'id, tipo, etapa, [tipo+etapa]',
  columnas: 'id, grupoId, trimestre, udId, orden, [grupoId+trimestre]',
  rubricas: 'id, titulo, etapa',
  valores: 'id, columnaId, alumnoId, [columnaId+alumnoId]',
  criterios: 'id, etapa, ciclo, areaCodigo, [etapa+ciclo], [etapa+areaCodigo]',
  vinculos: 'id, grupoId, alumnoA, alumnoB, [grupoId+alumnoA], [grupoId+alumnoB]',
  equipos: 'id, grupoId, fecha, udId',
  ciclosAleatorios: 'id, grupoId',
  config: 'id',
  accionesAgente: 'id, timestamp, estado',
}

async function crearBaseV14() {
  const vieja = new Dexie('cuaderno-ef')
  vieja.version(14).stores(ESQUEMA_V14)
  await vieja.open()

  await vieja.table('grupos').bulkPut([
    { id: 'g5', cursoEscolarId: 'c', nombre: '5ºA', etapa: 'primaria', nivel: 5, color: '#006A80', orden: 0, horario: [] },
    { id: 'g1', cursoEscolarId: 'c', nombre: '1ºA', etapa: 'primaria', nivel: 1, color: '#006A80', orden: 1, horario: [] },
  ])
  await vieja.table('unidades').bulkPut([
    { id: 'u5', nivel: 5, trimestre: 2, titulo: 'Balonmano', criterios: ['2.2', '3.2'] },
    { id: 'u1', nivel: 1, trimestre: 1, titulo: 'Nos movemos', criterios: ['2.2'] },
  ])
  await vieja.table('rubricas').put({
    id: 'rub',
    titulo: 'Juego real',
    niveles: [{ id: 'n1', etiqueta: 'Conseguido', valor: 10 }],
    criterios: [
      { id: 'rc1', titulo: 'Ocupa su espacio', pesoPct: 60 },
      { id: 'rc2', titulo: 'Pasa al desmarcado', pesoPct: 40 },
    ],
  })
  await vieja.table('columnas').bulkPut([
    { id: 'col-num', grupoId: 'g5', trimestre: 2, titulo: 'Torneo', tipo: 'numero', orden: 0, udId: 'u5', criterioCodigo: '2.2', escala: { min: 0, max: 10, decimales: 1 } },
    { id: 'col-rub', grupoId: 'g5', trimestre: 2, titulo: 'Juego real', tipo: 'rubrica', orden: 1, udId: 'u5', rubricaId: 'rub' },
    { id: 'col-1', grupoId: 'g1', trimestre: 1, titulo: 'Desplazamientos', tipo: 'caritas', orden: 0, udId: 'u1', criterioCodigo: '2.2', caritas: 3 },
  ])

  vieja.close()
}

describe('migración v14 → v15 sobre una base con datos', () => {
  it('sube el esquema, rellena los campos nuevos y crea las filas que faltaban', async () => {
    await crearBaseV14()

    // Se importa aquí, después de crear la base vieja: el singleton se abre al
    // primer uso, y abrirlo antes se saltaría el escenario que se quiere probar.
    const { db, ESQUEMA_ACTUAL } = await import('./db')
    await db.open()
    expect(ESQUEMA_ACTUAL).toBe(15)

    // — unidades: valores por defecto y criterios con su ciclo dentro —
    const u5 = await db.unidades.get('u5')
    expect(u5).toMatchObject({ computa: true, pesoTrimestre: 0, trimestre: 2 })
    // El mismo «2.2» de 5º y de 1º eran indistinguibles antes; ahora no.
    expect(u5!.criterios).toEqual(['EF.3C.2.2', 'EF.3C.3.2'])
    expect((await db.unidades.get('u1'))!.criterios).toEqual(['EF.1C.2.2'])

    // — columnas: peso a 0, «aún sin repartir» —
    expect((await db.columnas.get('col-num'))!.pesoUd).toBe(0)

    // — filas: una por instrumento simple, con el criterio heredado resuelto —
    const simple = await db.filas.where('columnaId').equals('col-num').toArray()
    expect(simple).toHaveLength(1)
    expect(simple[0]).toMatchObject({ descriptor: 'Torneo', criterioId: 'EF.3C.2.2', pesoFila: null })

    const deOtroCiclo = await db.filas.where('columnaId').equals('col-1').toArray()
    expect(deOtroCiclo[0].criterioId).toBe('EF.1C.2.2')

    // — filas: una por criterio de rúbrica, con su peso y su enlace al banco —
    const rubrica = (await db.filas.where('columnaId').equals('col-rub').toArray()).sort(
      (a, b) => a.orden - b.orden,
    )
    expect(rubrica.map((f) => [f.descriptor, f.pesoFila, f.criterioRubricaId])).toEqual([
      ['Ocupa su espacio', 60, 'rc1'],
      ['Pasa al desmarcado', 40, 'rc2'],
    ])
    expect(rubrica.every((f) => f.criterioId === null)).toBe(true)

    await db.delete()
  })
})
