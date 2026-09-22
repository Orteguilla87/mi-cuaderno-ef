/**
 * Parser local de intenciones — lógica pura, determinista, sin red y sin Dexie.
 *
 * PRINCIPIO: la IA no ejecuta, ENRUTA. Y antes que la IA, esto. Las órdenes de
 * clase son regulares («cuarto A, Marta un positivo», «haz cuatro equipos»), así
 * que resolverlas aquí sale gratis: sin latencia, sin coste y, sobre todo, sin
 * conexión —que en la pista es lo normal—. La API solo entra cuando esto
 * devuelve `no_reconocido`.
 *
 * Aquí no se decide nada del dominio: cada intención nombra una función que ya
 * existe en la app y le pasa sus parámetros. El trabajo lo hace el código local.
 *
 * El texto que entra es el que ya viene SIN la mención del grupo
 * (`lib/grupoEnTexto.ts`), y el alumno se busca únicamente entre los del grupo
 * resuelto: la regla dura de acotado no se duplica, se recibe hecha.
 */

import type { Alumno, EstadoAsistencia, SignoObservacion, TipoColumna } from '../db/types'
import type { ModoGeneracion } from './generadorEquipos'
import { resolverFechaRelativa } from './pseudonimizacion'

export type Riesgo = 'sin_riesgo' | 'reversible' | 'sensible'

/** Una columna del cuaderno, reducida a lo que el parser necesita mirar. */
export interface ColumnaConocida {
  id: string
  titulo: string
  tipo: TipoColumna
}

export interface ContextoIntencion {
  alumnos: Alumno[]
  columnas: ColumnaConocida[]
  etapa: 'primaria' | 'infantil'
  /** El mismo `buscarAlumnoEnTexto` de siempre, inyectado para poder probarlo. */
  buscarAlumno: (texto: string, alumnos: Alumno[]) => { alumno: Alumno; puntuacion: number }[]
  /** Fecha de referencia. Los tests la fijan. */
  hoy?: string
}

export type Intencion =
  // ——— sin riesgo: se ejecutan directas, no escriben en la base ———
  | { accion: 'alumno_aleatorio'; riesgo: 'sin_riesgo'; resumen: string }
  | {
      accion: 'generar_equipos'
      riesgo: 'sin_riesgo'
      resumen: string
      porNumEquipos?: number
      porTamano?: number
      modo: ModoGeneracion
    }
  | { accion: 'marcador_abrir'; riesgo: 'sin_riesgo'; resumen: string; equipos?: number }
  | { accion: 'marcador_puntos'; riesgo: 'sin_riesgo'; resumen: string; equipo: number; delta: number }
  | { accion: 'abrir_vista'; riesgo: 'sin_riesgo'; resumen: string; ruta: string }
  // ——— escritura reversible: confirmación ligera y deshacer ———
  | {
      accion: 'pasar_lista'
      riesgo: 'reversible'
      resumen: string
      alumnoId: string
      fecha: string
      estado?: EstadoAsistencia
      chandal?: boolean
    }
  | {
      accion: 'contador_celda'
      riesgo: 'reversible'
      resumen: string
      alumnoId: string
      columnaId: string
      delta: number
    }
  | {
      accion: 'observacion'
      riesgo: 'reversible'
      resumen: string
      alumnoId: string
      fecha: string
      signo: SignoObservacion
      texto: string
    }
  | {
      accion: 'nota_celda'
      riesgo: 'reversible'
      resumen: string
      alumnoId: string
      columnaId: string
      valor: number
    }
  | {
      accion: 'etiqueta_lesionado'
      riesgo: 'reversible'
      resumen: string
      alumnoId: string
      hasta?: string
    }
  // ——— escritura sensible: tarjeta de confirmación obligatoria ———
  | {
      accion: 'crear_columna'
      riesgo: 'sensible'
      resumen: string
      titulo: string
      tipo: TipoColumna
      /** `true` si el tipo lo hemos supuesto nosotros: la tarjeta debe decirlo. */
      tipoPropuesto: boolean
    }

export type Consulta =
  | { consulta: 'sesion_del_dia'; fecha: string }
  | { consulta: 'observaciones_alumno'; alumnoId: string }
  | { consulta: 'quien_falta'; fecha: string }
  | { consulta: 'quien_lesionado' }
  | { consulta: 'positivos_alumno'; alumnoId: string }
  | { consulta: 'material_del_dia'; fecha: string }
  | { consulta: 'progreso_unidad'; unidad?: string }

export type Resuelto =
  | { tipo: 'acciones'; acciones: Intencion[] }
  | { tipo: 'consulta'; consulta: Consulta; resumen: string }
  /** Se entendió, y por eso mismo no se hace: hay cosas que no van por voz. */
  | { tipo: 'rechazada'; motivo: string }
  | { tipo: 'no_reconocido' }

// ——————————————————— normalización ———————————————————

/** Minúsculas y sin tildes: lo dictado llega con acentuación irregular. */
function normal(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
}

/** «cuatro» y «4» son lo mismo cuando se dicta. */
function aNumero(palabra: string | undefined): number | undefined {
  if (!palabra) return undefined
  const n = Number(palabra.replace(',', '.'))
  if (Number.isFinite(n)) return n
  return NUMEROS[palabra]
}

const CIFRA = '(\\d+(?:[.,]\\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)'

// ——————————————————— 1. prohibidas por voz ———————————————————

/**
 * Lo que NO se hace por voz, por mucho que se entienda (2.3).
 *
 * No es una lista de cosas «difíciles»: es la lista de las que, mal entendidas,
 * destruyen trabajo o tocan la seguridad. Un «no» explicado vale más que un
 * «no te he entendido», porque el maestro sabe entonces dónde sí hacerlo.
 */
const PROHIBIDAS: { patron: RegExp; motivo: string }[] = [
  {
    patron: /\bvolca[rn]?\b|\bvuelca\b|\bvolcado\b/,
    motivo:
      'Volcar una unidad a la planificación no se hace por voz: ocupa clases del calendario y hay que ver la previa antes. Está en Planificador → Unidades.',
  },
  {
    patron: /\b(mover|mueve|elimina[rn]?|borra[rn]?|quita[rn]?)\b.{0,20}\bsesion(es)?\b/,
    motivo:
      'Mover o eliminar sesiones no se hace por voz: cambia la planificación del curso. Está en el Planificador, con su previa y su deshacer.',
  },
  {
    patron: /\b(elimina[rn]?|borra[rn]?|quita[rn]?)\b.{0,20}\b(grupo|clase|alumn[oa]s?|alumnad[oa]|datos|base)\b/,
    motivo: 'Eliminar grupos o alumnado no se hace por voz. Está en Grupos, donde se ve qué se borra.',
  },
  {
    patron: /\bsincroniz\w*|\bpassphrase\b|\bcontrasena\b|\bpin\b|\bexporta[rn]?\b|\bbackup\b|\bcopia de seguridad\b/,
    motivo:
      'La sincronización, el PIN y las copias de seguridad no se tocan por voz. Están en Ajustes.',
  },
]

/**
 * El motivo por el que una orden no se hace por voz, o `null`.
 *
 * Se consulta ANTES de resolver el grupo: «borra el grupo cuarto A» no puede
 * acabar en un selector de grupos preguntando cuál, porque la respuesta no es
 * ninguno.
 */
export function ordenProhibida(texto: string): string | null {
  const t = normal(texto)
  return PROHIBIDAS.find((p) => p.patron.test(t))?.motivo ?? null
}

// ——————————————————— 2. consultas de solo lectura ———————————————————

const VISTAS: { patron: RegExp; ruta: string; nombre: string }[] = [
  { patron: /\bcuaderno\b/, ruta: 'cuaderno', nombre: 'el Cuaderno' },
  { patron: /\bplanificador\b/, ruta: 'planificador', nombre: 'el Planificador' },
  { patron: /\bcalendario\b/, ruta: 'calendario', nombre: 'el Calendario' },
  { patron: /\bobservaciones\b/, ruta: 'observaciones', nombre: 'Observaciones' },
  { patron: /\binventario\b/, ruta: 'inventario', nombre: 'el Inventario' },
  { patron: /\bherramientas\b/, ruta: 'herramientas', nombre: 'Herramientas' },
  { patron: /\binformes?\b/, ruta: 'informes', nombre: 'Informes' },
  { patron: /\bjuegos\b/, ruta: 'juegos', nombre: 'el Banco de Juegos' },
  { patron: /\brubricas?\b/, ruta: 'rubricas', nombre: 'Rúbricas' },
  { patron: /\bajustes\b/, ruta: 'ajustes', nombre: 'Ajustes' },
  { patron: /\bgrupos\b/, ruta: 'grupos', nombre: 'Grupos' },
  { patron: /\bhoy\b/, ruta: 'hoy', nombre: 'Hoy' },
]

/**
 * `fecha` llega ya resuelta desde fuera: `resolverFechaRelativa` mira «mañana»
 * CON tilde, y aquí el texto viene normalizado sin ellas.
 */
function comoConsulta(t: string, ctx: ContextoIntencion, fecha: string): Resuelto | null {

  if (/\bque (toca|hay|tengo|damos|doy)\b|\bque clase\b/.test(t))
    return { tipo: 'consulta', consulta: { consulta: 'sesion_del_dia', fecha }, resumen: 'Qué toca' }

  if (/\bque material\b|\bque necesito\b|\bque hace falta\b/.test(t))
    return {
      tipo: 'consulta',
      consulta: { consulta: 'material_del_dia', fecha },
      resumen: 'Material necesario',
    }

  if (/\bquien (falta|ha faltado|no ha venido|no vino)\b|\bquienes faltan\b/.test(t))
    return { tipo: 'consulta', consulta: { consulta: 'quien_falta', fecha }, resumen: 'Quién falta' }

  if (/\bquien(es)? (esta|estan|hay)?\s*lesionad/.test(t) || /\blesionados\b/.test(t))
    return { tipo: 'consulta', consulta: { consulta: 'quien_lesionado' }, resumen: 'Quién está lesionado' }

  if (/\b(por|en) que sesion\b|\bpor donde voy\b|\bpor cual voy\b/.test(t)) {
    const m = /\b(?:de|en) (?:la unidad|la ud|ud)\s+(.+)$/.exec(t)
    return {
      tipo: 'consulta',
      consulta: { consulta: 'progreso_unidad', unidad: m?.[1]?.trim() },
      resumen: 'Por qué sesión voy',
    }
  }

  const alumno = () => unAlumno(t, ctx)

  if (/\bcuantos (positivos|negativos|puntos)\b|\bcuantas (observaciones|positivas|negativas)\b/.test(t)) {
    const a = alumno()
    if (!a) return null
    return {
      tipo: 'consulta',
      consulta: { consulta: 'positivos_alumno', alumnoId: a.id },
      resumen: `Positivos y negativos de ${nombreDe(a)}`,
    }
  }

  if (/\bobservaciones\b/.test(t) && /\b(muestra|ensename|ver|dame|cuales|lee)\b/.test(t)) {
    const a = alumno()
    if (!a) return null
    return {
      tipo: 'consulta',
      consulta: { consulta: 'observaciones_alumno', alumnoId: a.id },
      resumen: `Observaciones de ${nombreDe(a)}`,
    }
  }

  return null
}

// ——————————————————— 3. acciones sin alumno ———————————————————

function comoAccionDeGrupo(t: string): Intencion | null {
  if (/\b(alumno|alguien|uno|nombre) (aleatorio|al azar)\b|\bsortea\b|\bsorteo\b|\belige a (alguien|uno)\b|\bsaca a (alguien|uno)\b/.test(t))
    return { accion: 'alumno_aleatorio', riesgo: 'sin_riesgo', resumen: 'Sacar un alumno al azar' }

  const marcadorPuntos = new RegExp(`\\b(suma|sumar|resta|restar|quita|quitar|pon|ponle)\\b(?:\\s+${CIFRA})?\\s+puntos?\\b.*?\\bequipo\\s+${CIFRA}`).exec(t)
    ?? new RegExp(`${CIFRA}\\s+puntos?\\b.*?\\bequipo\\s+${CIFRA}`).exec(t)
  if (marcadorPuntos && /\bequipo\b/.test(t)) {
    const resta = /\b(resta|restar|quita|quitar)\b/.test(t)
    const cantidad = aNumero(marcadorPuntos[marcadorPuntos.length - 2]) ?? 1
    const equipo = aNumero(marcadorPuntos[marcadorPuntos.length - 1]) ?? 1
    const delta = resta ? -cantidad : cantidad
    return {
      accion: 'marcador_puntos',
      riesgo: 'sin_riesgo',
      resumen: `Equipo ${equipo}: ${delta > 0 ? '+' : ''}${delta}`,
      equipo,
      delta,
    }
  }

  if (/\bmarcador\b/.test(t)) {
    const n = aNumero(new RegExp(`${CIFRA}\\s+equipos?`).exec(t)?.[1])
    return {
      accion: 'marcador_abrir',
      riesgo: 'sin_riesgo',
      resumen: n ? `Marcador de ${n} equipos` : 'Abrir el marcador',
      equipos: n,
    }
  }

  if (/\bequipos?\b/.test(t) && /\b(haz|hacer|genera|generar|crea|crear|monta|montar|reparte|repartir|divide|dividir)\b/.test(t)) {
    const porTamano = aNumero(new RegExp(`equipos? de ${CIFRA}`).exec(t)?.[1])
    const porNumEquipos = porTamano ? undefined : aNumero(new RegExp(`${CIFRA}\\s+equipos?`).exec(t)?.[1])
    const modo: ModoGeneracion = /\bpor niveles?\b|\bhomogene/.test(t)
      ? 'homogeneo'
      : /\bequilibrad|\bheterogene|\bnivelad/.test(t)
        ? 'heterogeneo'
        : 'aleatorio'
    return {
      accion: 'generar_equipos',
      riesgo: 'sin_riesgo',
      resumen: porTamano
        ? `Equipos de ${porTamano}`
        : `${porNumEquipos ?? 2} equipos${modo === 'aleatorio' ? '' : modo === 'homogeneo' ? ' por niveles' : ' equilibrados'}`,
      porTamano,
      porNumEquipos: porTamano ? undefined : (porNumEquipos ?? 2),
      modo,
    }
  }

  if (/\b(abre|abrir|ve|vete|voy|llevame|lleva|muestra|ensename)\b/.test(t)) {
    const vista = VISTAS.find((v) => v.patron.test(t))
    if (vista)
      return {
        accion: 'abrir_vista',
        riesgo: 'sin_riesgo',
        resumen: `Abrir ${vista.nombre}`,
        ruta: vista.ruta,
      }
  }

  return null
}

// ——————————————————— 4. crear columna (sensible) ———————————————————

/**
 * Indicios del habla para el tipo de columna (2.4). Si no hay ninguno, el tipo
 * queda marcado como PROPUESTO y la tarjeta obliga a mirarlo: elegirlo en
 * silencio es lo que convierte un contador en una nota sin que nadie se entere.
 */
const INDICIOS_TIPO: { patron: RegExp; tipo: TipoColumna }[] = [
  { patron: /\bcontador\b|\bcuenta\b/, tipo: 'contador' },
  { patron: /\bpositivos? y negativos?\b|\bpositivos\b/, tipo: 'positivo_negativo' },
  { patron: /\bnota\b|\bnumero\b|\bnumerica\b|\bpuntuacion\b|\bcalificacion\b/, tipo: 'numero' },
  { patron: /\blista de control\b|\bconseguido\b|\bsi o no\b/, tipo: 'si_no' },
  { patron: /\bcaritas?\b/, tipo: 'caritas' },
  { patron: /\brubrica\b/, tipo: 'rubrica' },
  { patron: /\btexto\b|\banotacion\b/, tipo: 'texto' },
]

function comoCrearColumna(original: string, t: string, ctx: ContextoIntencion): Intencion | null {
  if (!/\b(crea|crear|nueva|nuevo|anade|anadir|agrega|mete)\b/.test(t)) return null
  if (!/\bcolumna\b/.test(t)) return null

  // El título se toma del texto ORIGINAL, no del normalizado: es lo que se va a
  // leer en la cabecera del cuaderno y las tildes importan.
  const m = /columna\s+(?:de\s+|llamada\s+|para\s+|titulada\s+)?(.+)$/i.exec(original.trim())
  const titulo = (m?.[1] ?? '').replace(/^["«']|["»'.]$/g, '').trim()
  if (!titulo) return null

  const indicio = INDICIOS_TIPO.find((i) => i.patron.test(t))
  // Infantil no admite tipos numéricos (§6): ahí la propuesta por defecto es
  // la lista de control, no una nota.
  const porDefecto: TipoColumna = ctx.etapa === 'infantil' ? 'si_no' : 'numero'

  return {
    accion: 'crear_columna',
    riesgo: 'sensible',
    resumen: `Nueva columna «${titulo}»`,
    titulo,
    tipo: indicio?.tipo ?? porDefecto,
    tipoPropuesto: !indicio,
  }
}

// ——————————————————— 5. acciones sobre un alumno ———————————————————

function nombreDe(a: Alumno): string {
  return a.alias || a.nombre
}

/** El alumno del fragmento, solo si uno destaca sobre el segundo. */
function unAlumno(texto: string, ctx: ContextoIntencion): Alumno | null {
  const candidatos = ctx.buscarAlumno(texto, ctx.alumnos)
  if (candidatos.length === 0) return null
  const [mejor, segundo] = candidatos
  if (segundo && segundo.puntuacion > mejor.puntuacion - 0.12) return null
  return mejor.alumno
}

/** La columna cuyo título se menciona, si solo hay una que encaje. */
function unaColumna(t: string, columnas: ColumnaConocida[], tipos?: TipoColumna[]): ColumnaConocida | null {
  const elegibles = tipos ? columnas.filter((c) => tipos.includes(c.tipo)) : columnas
  const encajan = elegibles.filter((c) => c.titulo.trim() !== '' && t.includes(normal(c.titulo)))
  return encajan.length === 1 ? encajan[0] : null
}

function estadoDeTexto(t: string): EstadoAsistencia | null {
  if (/\bjustificad/.test(t)) return 'justificada'
  if (/\bretraso\b|\btarde\b|\bllega tarde\b/.test(t)) return 'retraso'
  if (/\bfalta\b|\bausente\b|\bno ha venido\b|\bno vino\b/.test(t)) return 'falta'
  if (/\bpresente\b|\bha venido\b|\basistio\b/.test(t)) return 'presente'
  return null
}

function comoAccionDeAlumno(
  original: string,
  t: string,
  ctx: ContextoIntencion,
  fecha: string,
): Intencion | null {
  const alumno = unAlumno(original, ctx)
  if (!alumno) return null
  const nombre = nombreDe(alumno)

  if (/\blesionad/.test(t)) {
    const hasta = /\bhasta\b|\bdurante\b/.test(t) ? resolverFechaRelativa(t, fecha) : undefined
    return {
      accion: 'etiqueta_lesionado',
      riesgo: 'reversible',
      resumen: `${nombre}: lesionado${hasta && hasta !== fecha ? ` hasta el ${hasta}` : ''}`,
      alumnoId: alumno.id,
      hasta: hasta !== fecha ? hasta : undefined,
    }
  }

  if (/\bchandal\b/.test(t)) {
    const sin = /\b(sin|no trae|no lleva|olvid)/.test(t)
    return {
      accion: 'pasar_lista',
      riesgo: 'reversible',
      resumen: `${nombre}: ${sin ? 'sin' : 'con'} chándal`,
      alumnoId: alumno.id,
      fecha,
      chandal: !sin,
    }
  }

  const estado = estadoDeTexto(t)
  if (estado)
    return {
      accion: 'pasar_lista',
      riesgo: 'reversible',
      resumen: `${nombre}: ${estado}`,
      alumnoId: alumno.id,
      fecha,
      estado,
    }

  // «un punto en participación» → celda del cuaderno. «un positivo» a secas →
  // contador de observaciones. Lo que decide es si se nombra una columna.
  const enColumna = /\ben\b|\bde\b/.test(t)
    ? unaColumna(t, ctx.columnas, ['contador', 'positivo_negativo'])
    : null
  if (enColumna && new RegExp(`\\b(punto|puntos|suma|sumar|resta|restar|quita|mas|menos)\\b`).test(t)) {
    const resta = /\b(resta|restar|quita|quitar|menos|negativo)\b/.test(t)
    const cantidad = aNumero(new RegExp(`${CIFRA}\\s+puntos?`).exec(t)?.[1]) ?? 1
    return {
      accion: 'contador_celda',
      riesgo: 'reversible',
      resumen: `${nombre} · ${enColumna.titulo}: ${resta ? '−' : '+'}${cantidad}`,
      alumnoId: alumno.id,
      columnaId: enColumna.id,
      delta: resta ? -cantidad : cantidad,
    }
  }

  const columnaNota = unaColumna(t, ctx.columnas, ['numero'])
  const nota = aNumero(new RegExp(`${CIFRA}\\s+en\\b`).exec(t)?.[1])
  if (columnaNota && nota !== undefined) {
    return {
      accion: 'nota_celda',
      riesgo: 'reversible',
      resumen: `${nombre} · ${columnaNota.titulo}: ${nota}`,
      alumnoId: alumno.id,
      columnaId: columnaNota.id,
      valor: nota,
    }
  }

  const positivo = /\bun positivo\b|\bpositivo\b|\bmuy bien\b/.test(t)
  const negativo = /\bun negativo\b|\bnegativo\b/.test(t)
  if (positivo || negativo) {
    // El texto de la observación es lo dictado sin el nombre ni la etiqueta; si
    // no queda nada, es el contador puro y la observación va sin texto.
    const texto = original
      .replace(new RegExp(nombre, 'i'), '')
      .replace(/\b(un |una )?(positivo|negativo)\b/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return {
      accion: 'observacion',
      riesgo: 'reversible',
      resumen: `${nombre}: ${positivo ? 'positivo' : 'negativo'}${texto ? ` — «${texto}»` : ''}`,
      alumnoId: alumno.id,
      fecha,
      signo: positivo ? '+' : '-',
      texto,
    }
  }

  if (/\bobservacion\b|\banota\b|\bapunta\b/.test(t)) {
    const texto = original.replace(new RegExp(nombre, 'i'), '').replace(/\b(observacion|anota|apunta)\b/i, '').trim()
    return {
      accion: 'observacion',
      riesgo: 'reversible',
      resumen: `${nombre}: observación — «${texto}»`,
      alumnoId: alumno.id,
      fecha,
      signo: 'neutro',
      texto,
    }
  }

  return null
}

// ——————————————————— entrada ———————————————————

/** Una orden suelta, ya sin encadenar. */
function unaIntencion(original: string, ctx: ContextoIntencion, fecha: string): Intencion | null {
  const t = normal(original)
  if (!t) return null
  return (
    comoAccionDeGrupo(t) ??
    comoCrearColumna(original, t, ctx) ??
    comoAccionDeAlumno(original, t, ctx, fecha)
  )
}

/**
 * Trocea una frase con varias órdenes: «Marta positivo y Luis un punto».
 *
 * Se intenta SIEMPRE el troceo antes que la frase entera, porque una frase con
 * dos órdenes resuelve por la primera y la segunda se perdería en silencio. Solo
 * cuenta como encadenada si TODOS los trozos resuelven por su cuenta: así
 * «Ana ha ayudado y ha recogido el material» —una sola observación con una «y»
 * dentro— no se parte en dos.
 */
function trocear(texto: string): string[] {
  return texto
    .split(/\s+y\s+|\s*;\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function interpretarIntenciones(texto: string, ctx: ContextoIntencion): Resuelto {
  const original = texto.trim()
  if (!original) return { tipo: 'no_reconocido' }

  const t = normal(original)
  const fecha = resolverFechaRelativa(original, ctx.hoy)

  const prohibida = ordenProhibida(original)
  if (prohibida) return { tipo: 'rechazada', motivo: prohibida }

  const consulta = comoConsulta(t, ctx, fecha)
  if (consulta) return consulta

  const trozos = trocear(original)
  if (trozos.length > 1) {
    const intenciones = trozos.map((p) => unaIntencion(p, ctx, fecha))
    if (intenciones.every((i): i is Intencion => i !== null))
      return { tipo: 'acciones', acciones: intenciones }
  }

  const una = unaIntencion(original, ctx, fecha)
  return una ? { tipo: 'acciones', acciones: [una] } : { tipo: 'no_reconocido' }
}
