import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

/**
 * La migración v23 → v24 tal como la vive un dispositivo con datos.
 *
 * Un grupo puede tener DOS clases el mismo día en franjas separadas. Hasta la
 * v23 una sesión se identificaba solo por `grupoId+fecha`, así que las dos
 * franjas resolvían a la misma sesión y solo se veía una clase. La v24 añade
 * `Sesion.franjaInicio` y la rellena con la franja MÁS TEMPRANA del grupo ese
 * día de la semana, que es justo el hueco donde ya se pintaba: aditiva, sin
 * cambiar el comportamiento de nada de lo que ya había.
 *
 * Fichero propio porque tiene que abrir la base antes que nadie: los demás
 * tests de Dexie importan el singleton ya migrado.
 */
const ESQUEMA_V23 = {
  cursos: 'id, nombre, activo',
  grupos: 'id, cursoEscolarId, etapa, nivel, orden',
  alumnos: 'id, grupoId, apellidos, activo, [grupoId+activo], *etiquetas',
  asistencias: 'id, alumnoId, fecha, [alumnoId+fecha]',
  sesiones: 'id, grupoId, fecha, udId, [grupoId+fecha]',
  clasesCanceladas: 'id, grupoId, fecha, [grupoId+fecha]',
}

async function crearBaseV23() {
  const vieja = new Dexie('cuaderno-ef')
  vieja.version(23).stores(ESQUEMA_V23)
  await vieja.open()

  await vieja.table('grupos').bulkPut([
    {
      id: 'g1',
      cursoEscolarId: 'c',
      nombre: '3ºA',
      etapa: 'primaria',
      nivel: 3,
      color: '#006A80',
      orden: 0,
      // Desordenado a propósito: la migración se queda con la más temprana.
      horario: [
        { diaSemana: 2, horaInicio: '12:30', horaFin: '13:15' },
        { diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' },
        { diaSemana: 4, horaInicio: '09:15', horaFin: '10:00' },
      ],
    },
    { id: 'g2', cursoEscolarId: 'c', nombre: '4ºB', etapa: 'primaria', nivel: 4, color: '#006A80', orden: 1, horario: [] },
  ])

  const sesion = (id: string, grupoId: string, fecha: string) => ({
    id,
    grupoId,
    fecha,
    titulo: id,
    juegos: [],
    notas: '',
    recursos: [],
  })
  await vieja.table('sesiones').bulkPut([
    sesion('s-martes', 'g1', '2026-09-08'), // martes: dos franjas
    sesion('s-jueves', 'g1', '2026-09-10'), // jueves: una franja
    sesion('s-suelta', 'g1', '2026-09-09'), // miércoles: el grupo no tiene clase
    sesion('s-sinhorario', 'g2', '2026-09-08'), // grupo sin horario
  ])

  // Asistencia anterior a v24: no lleva franja, y no debe llevarla después.
  await vieja.table('asistencias').put({
    id: 'as1',
    alumnoId: 'a1',
    fecha: '2026-09-08',
    estado: 'presente',
    chandal: true,
  })

  vieja.close()
}

describe('migración v23 → v24 sobre una base con datos', () => {
  it('ancla cada sesión a su franja sin tocar la asistencia', async () => {
    await crearBaseV23()

    const { db, ESQUEMA_ACTUAL } = await import('./db')
    await db.open()
    // La base vieja ha subido hasta la última versión: se comprueba «al menos»
    // y no «igual», para que subir el esquema por otra cosa no rompa este test.
    expect(ESQUEMA_ACTUAL).toBeGreaterThanOrEqual(24)

    // La franja más temprana del día, que es donde ya se pintaba.
    expect((await db.sesiones.get('s-martes'))!.franjaInicio).toBe('10:00')
    // Un día con una sola franja: la suya, sin ambigüedad.
    expect((await db.sesiones.get('s-jueves'))!.franjaInicio).toBe('09:15')
    // Sin franja ese día, se queda sin campo: la sesión sigue viéndose por su
    // propia hora, como antes, y no se le inventa un sitio en el horario.
    expect((await db.sesiones.get('s-suelta'))!.franjaInicio).toBeUndefined()
    expect((await db.sesiones.get('s-sinhorario'))!.franjaInicio).toBeUndefined()

    // La asistencia NO se reescribe: «sin franja» ya significaba «la primera
    // clase del día». Cero riesgo de reatribuir mal un registro histórico.
    expect((await db.asistencias.get('as1'))!.franjaInicio).toBeUndefined()

    db.close()
  })
})
