import type { Alumno, Grupo } from './types'
import type { AccionId } from './agente'
import { construirMapaTokens, pseudonimizarTexto, resolverFechaRelativa } from '../lib/pseudonimizacion'

/**
 * Única llamada de red de toda la app (§1.2, §6): `x-api-key` no sale del
 * dispositivo salvo hacia `api.anthropic.com`, y el cuerpo solo lleva texto
 * pseudonimizado + fecha + tokens de grupo. Nunca nombres reales ni contenido
 * de la base.
 */

const CATALOGO_HERRAMIENTAS = [
  {
    name: 'registrar_observacion',
    description: 'Anota una observación de conducta, aprendizaje, salud u otro para un alumno.',
    input_schema: {
      type: 'object',
      properties: {
        alumnoToken: { type: 'string', description: 'Token [A1], [A2]… del alumno' },
        signo: { type: 'string', enum: ['+', '-', 'neutro'] },
        tipo: { type: 'string', enum: ['conducta', 'aprendizaje', 'salud', 'otro'] },
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
 */
export async function interpretarConApi(
  texto: string,
  alumnos: Alumno[],
  grupos: Grupo[],
  config: { apiKey: string; modelo: string },
): Promise<{ accion: AccionId; input: Record<string, unknown> } | null> {
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
  return { accion: uso.name as AccionId, input: uso.input ?? {} }
}

/** Resuelve los tokens de la respuesta del modelo a ids reales, en local. */
export function resolverTokens(
  input: Record<string, unknown>,
  mapa: ReturnType<typeof construirMapaTokens>,
): { alumno?: Alumno; grupo?: Grupo } {
  const alumnoToken = typeof input.alumnoToken === 'string' ? input.alumnoToken.replace(/[[\]]/g, '') : undefined
  const grupoToken = typeof input.grupoToken === 'string' ? input.grupoToken.replace(/[[\]]/g, '') : undefined
  return {
    alumno: alumnoToken ? mapa.alumnoPorToken.get(alumnoToken) : undefined,
    grupo: grupoToken ? mapa.grupoPorToken.get(grupoToken) : undefined,
  }
}
