import type { Alumno, Grupo } from './types'
import type { AccionId } from './agente'
import { construirMapaTokens, pseudonimizarTexto, resolverFechaRelativa } from '../lib/pseudonimizacion'

/**
 * Única llamada de red de toda la app (§1.2, §6): `x-api-key` no sale del
 * dispositivo salvo hacia `api.anthropic.com`, y el cuerpo solo lleva texto
 * pseudonimizado + fecha + tokens de grupo. Nunca nombres reales ni contenido
 * de la base.
 */

export const CATALOGO_HERRAMIENTAS = [
  {
    name: 'registrar_observacion',
    description: 'Anota una observación de conducta, aprendizaje, salud u otro para un alumno.',
    input_schema: {
      type: 'object',
      properties: {
        alumnoToken: { type: 'string', description: 'Token [A1], [A2]… del alumno' },
        signo: { type: 'string', enum: ['+', '-', 'neutro'] },
        tipo: { type: 'string', enum: ['conducta', 'aprendizaje', 'salud', 'lesion', 'otro'] },
        texto: { type: 'string' },
      },
      required: ['alumnoToken', 'signo', 'texto'],
    },
  },
  {
    name: 'marcar_asistencia',
    description: 'Marca el estado de asistencia de un alumno en una fecha.',
    input_schema: {
      type: 'object',
      properties: {
        alumnoToken: { type: 'string' },
        estado: { type: 'string', enum: ['presente', 'falta', 'retraso', 'justificada'] },
      },
      required: ['alumnoToken', 'estado'],
    },
  },
  {
    name: 'marcar_chandal',
    description: 'Marca si un alumno trae o no el chándal en una fecha.',
    input_schema: {
      type: 'object',
      properties: { alumnoToken: { type: 'string' }, chandal: { type: 'boolean' } },
      required: ['alumnoToken', 'chandal'],
    },
  },
  {
    name: 'calificar',
    description: 'Pone una nota numérica a un alumno en una columna del cuaderno ya existente.',
    input_schema: {
      type: 'object',
      properties: {
        alumnoToken: { type: 'string' },
        columnaTitulo: { type: 'string', description: 'Título de la columna del cuaderno' },
        valor: { type: 'number' },
      },
      required: ['alumnoToken', 'columnaTitulo', 'valor'],
    },
  },
  {
    name: 'anadir_comentario_eval',
    description: 'Añade o sustituye el comentario de evaluación trimestral de un alumno.',
    input_schema: {
      type: 'object',
      properties: {
        alumnoToken: { type: 'string' },
        trimestre: { type: 'number', enum: [1, 2, 3] },
        comentario: { type: 'string' },
      },
      required: ['alumnoToken', 'trimestre', 'comentario'],
    },
  },
  {
    name: 'crear_nota_sesion',
    description: 'Añade una nota a la sesión de un grupo en una fecha.',
    input_schema: {
      type: 'object',
      properties: { grupoToken: { type: 'string' }, nota: { type: 'string' } },
      required: ['grupoToken', 'nota'],
    },
  },
  {
    name: 'consultar',
    description:
      'Clasifica una pregunta sobre datos ya guardados (asistencia, notas…). La app ejecuta la consulta en local; este tool solo dice qué se pregunta.',
    input_schema: {
      type: 'object',
      properties: {
        sobre: { type: 'string', enum: ['asistencia', 'chandal', 'observaciones', 'notas'] },
        alumnoToken: { type: 'string' },
      },
      required: ['sobre'],
    },
  },
  {
    name: 'deshacer_ultima',
    description: 'Deshace la última acción aplicada por el agente.',
    input_schema: { type: 'object', properties: {} },
  },
] as const

interface RespuestaClaude {
  content: { type: string; name?: string; input?: Record<string, unknown> }[]
}

/**
 * Envía el dictado pseudonimizado y devuelve la acción tal cual la clasificó
 * el modelo, con los tokens todavía sin resolver (eso lo hace la UI, en local).
 *
 * `alumnos` son SOLO los del grupo ya resuelto en local, y `texto` el dictado sin
 * la mención del grupo (`lib/grupoEnTexto.ts`). El acotado es lo que impide que
 * el modelo devuelva el token de un alumno de otra clase: sencillamente no
 * existe en el mapa, así que `resolverTokens` no lo encontraría. De paso viaja
 * menos —una veintena de tokens en vez de doscientos—, que es justo la dirección
 * correcta para §1.2.
 */
export async function interpretarConApi(
  texto: string,
  alumnos: Alumno[],
  grupos: Grupo[],
  config: { apiKey: string; modelo: string },
): Promise<{ accion: AccionId; input: Record<string, unknown>; textoEnviado: string } | null> {
  const mapa = construirMapaTokens(alumnos, grupos)
  const pseudo = pseudonimizarTexto(texto, mapa, alumnos, grupos)
  const fecha = resolverFechaRelativa(texto)

  const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.modelo,
      max_tokens: 512,
      system:
        'Eres el clasificador de un cuaderno docente. Solo recibes texto pseudonimizado (tokens [A1], [G1]…) y la fecha ya resuelta. Elige UNA herramienta del catálogo cerrado y rellena sus campos. No inventes tokens que no aparezcan en el texto.',
      messages: [{ role: 'user', content: `Fecha: ${fecha}\nTexto: ${pseudo}` }],
      tools: CATALOGO_HERRAMIENTAS,
      tool_choice: { type: 'any' },
    }),
  })

  if (!respuesta.ok) throw new Error(`API: ${respuesta.status}`)
  const datos: RespuestaClaude = await respuesta.json()
  const uso = datos.content.find((c) => c.type === 'tool_use')
  if (!uso?.name) return null
  return { accion: uso.name as AccionId, input: uso.input ?? {}, textoEnviado: pseudo }
}

/** Acciones que van sobre UN alumno: las únicas que admite un comentario ya atribuido. */
const ACCIONES_DE_ALUMNO = new Set([
  'registrar_observacion',
  'marcar_asistencia',
  'marcar_chandal',
  'calificar',
  'anadir_comentario_eval',
])

/**
 * El catálogo para un comentario cuyo alumno ya está resuelto en local: las
 * mismas herramientas de alumno, sin `alumnoToken`. El modelo no tiene a quién
 * nombrar, y por eso no puede equivocarse de alumno.
 */
export const CATALOGO_COMENTARIO = CATALOGO_HERRAMIENTAS.filter((h) => ACCIONES_DE_ALUMNO.has(h.name)).map((h) => {
  const { alumnoToken: _fuera, ...properties } = h.input_schema.properties as Record<string, unknown>
  return {
    ...h,
    input_schema: {
      ...h.input_schema,
      properties,
      required: (h.input_schema as { required?: readonly string[] }).required?.filter((r) => r !== 'alumnoToken') ?? [],
    },
  }
})

/** Instrucciones del redactor de comentarios. Exportadas para poder sujetarlas en un test. */
export const SISTEMA_COMENTARIO =
  'Eres el redactor de un cuaderno docente. Recibes SOLO lo que un alumno ya identificado ha hecho, sin su nombre ni su grupo. ' +
  'Elige UNA herramienta del catálogo cerrado. Si redactas texto (texto o comentario), hazlo en tercera persona y SIN sujeto ' +
  '(«Ha ayudado a recoger el material»), breve y fiel a lo dicho. No incluyas nombres propios, ni marcadores como [A1] o [G1], ' +
  'ni el curso o grupo.'

/**
 * Clasifica y redacta el COMENTARIO de un dictado «nombre + curso + comentario»
 * (`lib/dictadoEstructurado.ts`). Solo viaja ese tramo, con los nombres de otros
 * alumnos que aparezcan en él ya pseudonimizados; el del alumno no va porque no
 * está en el tramo. Los tokens que devuelva el modelo se deshacen aquí, y el
 * texto final pasa además por `sanearComentario` en quien llama.
 */
export async function interpretarComentarioConApi(
  comentario: string,
  alumnosDelGrupo: Alumno[],
  grupo: Grupo,
  config: { apiKey: string; modelo: string },
): Promise<{ accion: AccionId; input: Record<string, unknown> } | null> {
  const mapa = construirMapaTokens(alumnosDelGrupo, [grupo])
  const pseudo = pseudonimizarTexto(comentario, mapa, alumnosDelGrupo, [grupo])
  const fecha = resolverFechaRelativa(comentario)

  const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.modelo,
      max_tokens: 512,
      system: SISTEMA_COMENTARIO,
      messages: [{ role: 'user', content: `Fecha: ${fecha}\nLo que ha hecho: ${pseudo}` }],
      tools: CATALOGO_COMENTARIO,
      tool_choice: { type: 'any' },
    }),
  })

  if (!respuesta.ok) throw new Error(`API: ${respuesta.status}`)
  const datos: RespuestaClaude = await respuesta.json()
  const uso = datos.content.find((c) => c.type === 'tool_use')
  if (!uso?.name || !ACCIONES_DE_ALUMNO.has(uso.name)) return null
  const input = { ...(uso.input ?? {}) }
  for (const campo of ['texto', 'comentario'] as const) {
    if (typeof input[campo] === 'string') input[campo] = despseudonimizar(input[campo] as string, mapa)
  }
  return { accion: uso.name as AccionId, input }
}

/** [A3] → el nombre real, en local. Un token desconocido se deja para que lo quite la salvaguarda. */
export function despseudonimizar(texto: string, mapa: ReturnType<typeof construirMapaTokens>): string {
  return texto.replace(/\[\s*([AG]\d+)\s*\]/g, (todo, token: string) => {
    const a = mapa.alumnoPorToken.get(token)
    if (a) return a.alias || a.nombre
    const g = mapa.grupoPorToken.get(token)
    return g ? g.nombre : todo
  })
}

/**
 * Resuelve los tokens de la respuesta del modelo a ids reales, en local.
 *
 * Con `textoEnviado`, un token de alumno que NO iba en ese texto se descarta:
 * el mapa trae a todo el grupo, pero solo están en el texto los que el
 * emparejador reconoció. Si el modelo devuelve otro, se lo ha inventado, y eso
 * no puede acabar como sugerencia: sin alumno, la UI pregunta.
 */
export function resolverTokens(
  input: Record<string, unknown>,
  mapa: ReturnType<typeof construirMapaTokens>,
  textoEnviado?: string,
): { alumno?: Alumno; grupo?: Grupo } {
  const crudo = typeof input.alumnoToken === 'string' ? input.alumnoToken.replace(/[[\]]/g, '') : undefined
  const alumnoToken = crudo && (textoEnviado === undefined || textoEnviado.includes(`[${crudo}]`)) ? crudo : undefined
  const grupoToken = typeof input.grupoToken === 'string' ? input.grupoToken.replace(/[[\]]/g, '') : undefined
  return {
    alumno: alumnoToken ? mapa.alumnoPorToken.get(alumnoToken) : undefined,
    grupo: grupoToken ? mapa.grupoPorToken.get(grupoToken) : undefined,
  }
}
