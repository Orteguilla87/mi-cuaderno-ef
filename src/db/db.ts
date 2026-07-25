import Dexie, { type EntityTable } from 'dexie'
import { DURACION_SESION_MIN, sumarMinutos } from '../lib/horas'
import type {
  AccionAgente,
  Alumno,
  Asistencia,
  Calificacion,
  CicloAleatorio,
  Columna,
  Criterio,
  ComentarioBanco,
  Config,
  CursoEscolar,
  Equipo,
  EvalFinal,
  EvalTrimestral,
  Grupo,
  InformeInfantil,
  InstrumentoEval,
  Juego,
  Observacion,
  Plantilla,
  RegistroInfantil,
  Rubrica,
  Sesion,
  UnidadDidactica,
  ValorCelda,
  Vinculo,
} from './types'

/**
 * Base local. Migraciones versionadas: NUNCA modificar un `version()` ya
 * publicado; añadir siempre uno nuevo con su `upgrade()` si hace falta.
 */
class CuadernoDB extends Dexie {
  cursos!: EntityTable<CursoEscolar, 'id'>
  grupos!: EntityTable<Grupo, 'id'>
  alumnos!: EntityTable<Alumno, 'id'>
  asistencias!: EntityTable<Asistencia, 'id'>
  sesiones!: EntityTable<Sesion, 'id'>
  observaciones!: EntityTable<Observacion, 'id'>
  unidades!: EntityTable<UnidadDidactica, 'id'>
  instrumentos!: EntityTable<InstrumentoEval, 'id'>
  calificaciones!: EntityTable<Calificacion, 'id'>
  evalTrimestrales!: EntityTable<EvalTrimestral, 'id'>
  evalFinales!: EntityTable<EvalFinal, 'id'>
  registrosInfantil!: EntityTable<RegistroInfantil, 'id'>
  informesInfantil!: EntityTable<InformeInfantil, 'id'>
  comentarios!: EntityTable<ComentarioBanco, 'id'>
  juegos!: EntityTable<Juego, 'id'>
  plantillas!: EntityTable<Plantilla, 'id'>
  columnas!: EntityTable<Columna, 'id'>
  rubricas!: EntityTable<Rubrica, 'id'>
  valores!: EntityTable<ValorCelda, 'id'>
  criterios!: EntityTable<Criterio, 'id'>
  vinculos!: EntityTable<Vinculo, 'id'>
  equipos!: EntityTable<Equipo, 'id'>
  ciclosAleatorios!: EntityTable<CicloAleatorio, 'id'>
  config!: EntityTable<Config, 'id'>
  accionesAgente!: EntityTable<AccionAgente, 'id'>

  constructor() {
    super('cuaderno-ef')

    this.version(1).stores({
      cursos: 'id, nombre, activo',
      grupos: 'id, cursoEscolarId, etapa, nivel, orden',
      alumnos: 'id, grupoId, apellidos, activo, [grupoId+activo]',
      asistencias: 'id, alumnoId, fecha, [alumnoId+fecha]',
      sesiones: 'id, grupoId, fecha, [grupoId+fecha]',
      observaciones: 'id, alumnoId, grupoId, fecha, tipo, [grupoId+fecha]',
      unidades: 'id, nivel, trimestre, [nivel+trimestre]',
      instrumentos: 'id, udId, tipo',
      calificaciones:
        'id, alumnoId, instrumentoId, itemId, trimestre, [alumnoId+trimestre], [alumnoId+itemId]',
      evalTrimestrales: 'id, alumnoId, trimestre, [alumnoId+trimestre]',
      evalFinales: 'id, alumnoId',
      registrosInfantil:
        'id, alumnoId, criterioCodigo, momento, [alumnoId+momento], [alumnoId+criterioCodigo+momento]',
      informesInfantil: 'id, alumnoId, trimestre, [alumnoId+trimestre]',
      comentarios: 'id, categoria, etapa',
      config: 'id',
      accionesAgente: 'id, timestamp, estado',
    })

    /**
     * v2 — alineación con §4 de CLAUDE.md antes de construir la Fase 2:
     *  · `CursoEscolar` gana `trimestres[]` y `festivos[]` (los necesita el pase
     *    de lista para saltar días sin clase y situar la nota en su trimestre).
     *  · `FranjaHorario.hora` → `horaInicio` + `horaFin`, porque «Hoy» debe saber
     *    qué grupo toca AHORA, y para eso hace falta el final de la franja.
     *
     * Los índices no cambian: ambos campos viven dentro de objetos no indexados,
     * así que basta con reescribir los registros.
     */
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('cursos')
          .toCollection()
          .modify((c) => {
            c.trimestres ??= []
            c.festivos ??= []
          })

        await tx
          .table('grupos')
          .toCollection()
          .modify((g) => {
            if (!Array.isArray(g.horario)) {
              g.horario = []
              return
            }
            g.horario = g.horario.map((f: Record<string, unknown>) => {
              if (typeof f.hora !== 'string') return f
              // Una franja de EF dura una sesión lectiva: 45 min es el supuesto
              // razonable, y el usuario puede ajustarlo en la ficha del grupo.
              const { hora, ...resto } = f
              return {
                ...resto,
                horaInicio: hora,
                horaFin: sumarMinutos(hora, DURACION_SESION_MIN),
              }
            })
          })
      })

    /**
     * v3 — Fase 3. Tablas nuevas (banco de juegos y plantillas) y los campos de
     * §4 que faltaban en `Sesion` y `UnidadDidactica`.
     *
     * `recursos` se rellena a [] en las sesiones ya existentes: el código lo
     * recorre siempre, y un `undefined` reventaría el render.
     */
    this.version(3)
      .stores({
        juegos: 'id, nombre, *etiquetas',
        plantillas: 'id, tipo, etapa, [tipo+etapa]',
        // `udId` pasa a estar indexado: el planificador lista las sesiones de
        // una unidad, y sin índice sería un recorrido completo de la tabla.
        sesiones: 'id, grupoId, fecha, udId, [grupoId+fecha]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('sesiones')
          .toCollection()
          .modify((s) => {
            s.recursos ??= []
            s.juegos ??= []
          })
      })

    /**
     * v4 — límites del curso lectivo. El planificador los necesita para no
     * colocar sesiones en agosto; los cursos ya creados los reciben por defecto
     * (1 sept – 30 jun) deducidos de su propio nombre.
     */
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('cursos')
          .toCollection()
          .modify((c) => {
            const anio = Number(String(c.nombre).split('-')[0])
            if (Number.isFinite(anio)) {
              c.inicio ??= `${anio}-09-01`
              c.fin ??= `${anio + 1}-06-30`
            }
          })
      })

    /**
     * v5 — Cuaderno con columnas flexibles.
     *
     * Sustituye en la práctica a `instrumentos`/`calificaciones`, que colgaban
     * de una unidad didáctica y solo admitían tres tipos fijos. Aquellas tablas
     * se conservan (aún vacías) para no romper nada; se retirarán cuando el
     * motor de evaluación de la fase 4 quede cerrado sobre el modelo nuevo.
     */
    this.version(5).stores({
      columnas: 'id, grupoId, trimestre, udId, orden, [grupoId+trimestre]',
      rubricas: 'id, titulo, etapa',
      valores: 'id, columnaId, alumnoId, [columnaId+alumnoId]',
    })

    /** v6 — primer intento de tabla de criterios, con el código como clave. */
    this.version(6).stores({
      criterios: 'codigo, etapa, areaCodigo, [etapa+areaCodigo]',
    })

    /**
     * v7 y v8 — corrección de la clave primaria de `criterios`.
     *
     * El código del decreto no es único: en Primaria «1.1» aparece en los tres
     * ciclos con textos distintos, así que la v6 habría fundido 46 criterios en
     * 17. Se pasa a una clave compuesta ('PRI:2:1.1').
     *
     * Cambiar la clave primaria de una tabla obliga a borrarla y recrearla, y
     * Dexie no permite ambas cosas en la misma versión: de ahí las dos. La
     * tabla nunca llegó a tener datos, así que no se pierde nada.
     */
    this.version(7).stores({ criterios: null })
    this.version(8).stores({
      criterios: 'id, etapa, ciclo, areaCodigo, [etapa+ciclo], [etapa+areaCodigo]',
    })

    /**
     * v9 — Generador de equipos: vínculos entre alumnos (separar/juntar) y
     * alineaciones guardadas. `genero`/`nivelMotriz` de Alumno son campos
     * nuevos sin índice, así que no necesitan `upgrade()`.
     */
    this.version(9).stores({
      vinculos: 'id, grupoId, alumnoA, alumnoB, [grupoId+alumnoA], [grupoId+alumnoB]',
      equipos: 'id, grupoId, fecha, udId',
    })

    /**
     * v10 — columnas calculadas. El campo `calculo` (componentes + pesos) vive
     * dentro de `Columna`, no indexado, así que basta con declarar la versión;
     * las columnas ya existentes lo tienen `undefined` y no son de tipo cálculo.
     */
    this.version(10).stores({})

    /**
     * v11 — M9. `Config.pin` pasa de ser el PIN en claro (`string`, nunca usado:
     * no había pantalla de bloqueo) a `{salt, hash, iteraciones}`. Se descarta
     * cualquier valor antiguo en vez de intentar convertirlo: guardar el PIN en
     * claro fue siempre un error, y no hay nada que conservar.
     */
    this.version(11)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('config')
          .toCollection()
          .modify((c) => {
            if (typeof c.pin === 'string') delete c.pin
          })
      })

    /**
     * v12 — Bloque 1. `Config.webdav` (servidor propio al que subir el `.enc`)
     * vive dentro del singleton de config, sin índice: basta con declarar la
     * versión. Los datos existentes son válidos tal cual, así que no hay
     * `upgrade()` ni migración espejo en `db/backup.ts`.
     */
    this.version(12).stores({})

    /**
     * v13 — Bloque 4. Ciclo persistente del sorteo «Alumno aleatorio» del
     * Cuaderno: un registro vivo por grupo (`id` = `grupoId`), para que
     * sobreviva a recargas y a cerrar la app.
     */
    this.version(13).stores({
      ciclosAleatorios: 'id, grupoId',
    })
  }
}

/**
 * Versión del esquema con la que se sella cada backup. Debe coincidir SIEMPRE
 * con el último `version()` de arriba: al añadir uno nuevo, súbela y añade su
 * migración en `src/db/backup.ts` si el cambio afecta a los datos.
 */
export const ESQUEMA_ACTUAL = 13

export const db = new CuadernoDB()

/** Identificador local: no necesita ser global, solo único en el dispositivo. */
export function nuevoId(): string {
  return crypto.randomUUID()
}
