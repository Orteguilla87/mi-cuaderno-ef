import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Mic, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import {
  apilarDeshacer,
  ejecutarAccion,
  interpretarLocal,
  registrarEnLog,
  type AccionResuelta,
  type ResultadoInterpretar,
} from '../db/agente'
import { interpretarConApi, resolverTokens } from '../db/agenteApi'
import { useConfig } from '../db/config'
import { db } from '../db/db'
import { resumirAsistencia } from '../db/asistencia'
import { buscarAlumnoEnTexto, construirMapaTokens } from '../lib/pseudonimizacion'
import { etiquetaDia } from '../lib/fechas'
import { useUI } from '../store/ui'
import { Hoja } from './Hoja'

/**
 * FAB global de voz (§5, §6). Dicta con el teclado nativo (nada de Web Speech
 * API): se abre la hoja, el campo se enfoca solo y el propio teclado de
 * Android trae el icono de micrófono.
 */
export function AgenteVoz() {
  const [abierta, setAbierta] = useState(false)
  const capasAbiertas = useUI((s) => s.capasAbiertas)
  // Con una hoja, la pizarra o el bloqueo por PIN encima, el FAB solo estorba
  // (tapaba justo lo que esas capas quieren que se vea o se pulse): se retira
  // en vez de disputar el z-index con ellas.
  const oculto = capasAbiertas > 0

  return (
    <>
      <button
        onClick={() => setAbierta(true)}
        style={{ height: 'var(--alto-fab)', width: 'var(--alto-fab)' }}
        className={
          'capa-fab fixed right-4 z-fab flex items-center justify-center rounded-full bg-acento text-white shadow-lg shadow-acento/30 transition-opacity active:scale-95 ' +
          (oculto ? 'pointer-events-none opacity-0' : 'opacity-100')
        }
        aria-label="Agente de voz"
        aria-hidden={oculto}
        tabIndex={oculto ? -1 : 0}
      >
        <Mic size={24} aria-hidden />
      </button>
      <HojaAgente abierta={abierta} onCerrar={() => setAbierta(false)} />
    </>
  )
}

type Fase =
  | { paso: 'dictado'; texto: string; error?: string }
  | { paso: 'ambiguo'; texto: string; candidatos: import('../db/types').Alumno[] }
  | { paso: 'confirmar'; accion: AccionResuelta; textoOriginal: string }
  | { paso: 'respuesta'; texto: string }

function HojaAgente({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const config = useConfig()
  const [fase, setFase] = useState<Fase>({ paso: 'dictado', texto: '' })

  const alumnos = useLiveQuery(async () => (await db.alumnos.toArray()).filter((a) => a.activo), []) ?? []
  const grupos = useLiveQuery(() => db.grupos.toArray(), []) ?? []

  function cerrar() {
    setFase({ paso: 'dictado', texto: '' })
    onCerrar()
  }

  async function procesar(texto: string) {
    if (!texto.trim()) return

    if (config.apiKey) {
      try {
        const r = await interpretarConApi(texto, alumnos, grupos, {
          apiKey: config.apiKey,
          modelo: config.modeloAgente,
        })
        if (r) {
          const mapa = construirMapaTokens(alumnos, grupos)
          const { alumno, grupo } = resolverTokens(r.input, mapa)
          if (r.accion === 'consultar') {
            setFase({ paso: 'respuesta', texto: await responderConsulta(r.input, alumno) })
            return
          }
          const resuelta = construirAccionDesdeApi(r.accion, r.input, alumno, grupo)
          if (resuelta) {
            setFase({ paso: 'confirmar', accion: resuelta, textoOriginal: texto })
            return
          }
        }
      } catch {
        // Sin red o fallo de la API: se cae al parser local (§6).
      }
    }

    const local: ResultadoInterpretar = interpretarLocal(texto, alumnos, buscarAlumnoEnTexto)
    if (local.tipo === 'ambiguo') {
      setFase({ paso: 'ambiguo', texto, candidatos: local.candidatos })
    } else if (local.tipo === 'accion') {
      setFase({ paso: 'confirmar', accion: local.accion, textoOriginal: texto })
    } else {
      setFase({ paso: 'dictado', texto, error: 'No he entendido la acción. Prueba a ser más concreto.' })
    }
  }

  function elegirCandidato(alumno: import('../db/types').Alumno) {
    if (fase.paso !== 'ambiguo') return
    const local = interpretarLocal(fase.texto, alumnos, buscarAlumnoEnTexto, alumno)
    if (local.tipo === 'accion') setFase({ paso: 'confirmar', accion: local.accion, textoOriginal: fase.texto })
  }

  async function confirmar() {
    if (fase.paso !== 'confirmar') return
    const { accion, textoOriginal } = fase
    try {
      const deshacer = await ejecutarAccion(accion)
      const logId = await registrarEnLog(textoOriginal, accion)
      apilarDeshacer(logId, deshacer)
      cerrar()
      mostrarAviso(accion.resumen, deshacer)
    } catch (e) {
      setFase({ paso: 'dictado', texto: textoOriginal, error: e instanceof Error ? e.message : 'No se pudo aplicar.' })
    }
  }

  return (
    <Hoja abierta={abierta} titulo="Agente de voz" onCerrar={cerrar}>
      {fase.paso === 'dictado' && (
        <div className="space-y-3">
          <textarea
            className="campo h-28 resize-none py-2"
            value={fase.texto}
            onChange={(e) => setFase({ paso: 'dictado', texto: e.target.value })}
            placeholder="Ana ha ayudado a un compañero, Luis sin chándal…"
            autoFocus
          />
          {fase.error && <p className="text-sm font-semibold text-acento">{fase.error}</p>}
          {!config.apiKey && (
            <p className="text-xs texto-suave">
              Sin API key configurada: se usa el reconocimiento local (observación, asistencia,
              chándal, deshacer).
            </p>
          )}
          <button
            className="btn-primario w-full"
            onClick={() => void procesar(fase.texto)}
            disabled={!fase.texto.trim()}
          >
            Interpretar
          </button>
        </div>
      )}

      {fase.paso === 'ambiguo' && (
        <div className="space-y-3">
          <p className="text-sm texto-suave">¿A quién te refieres?</p>
          <div className="flex flex-wrap gap-2">
            {fase.candidatos.map((a) => (
              <button
                key={a.id}
                className="pildora min-h-[40px] bg-agua-claro px-3 text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                onClick={() => elegirCandidato(a)}
              >
                {a.alias || a.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {fase.paso === 'confirmar' && (
        <div className="space-y-4">
          <div className="panel-agua">
            <p className="text-sm font-bold">{fase.accion.resumen}</p>
            <p className="mt-1 text-xs texto-suave">{etiquetaDia(fase.accion.fecha)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-suave"
              onClick={() => setFase({ paso: 'dictado', texto: fase.textoOriginal })}
            >
              <Pencil size={18} aria-hidden />
              Editar
            </button>
            <button className="btn-primario" onClick={() => void confirmar()}>
              <Check size={18} aria-hidden />
              Confirmar
            </button>
          </div>
          <button className="btn w-full text-acento" onClick={cerrar}>
            <X size={18} aria-hidden />
            Cancelar
          </button>
        </div>
      )}

      {fase.paso === 'respuesta' && (
        <div className="space-y-4">
          <div className="panel-agua text-sm">{fase.texto}</div>
          <button className="btn-primario w-full" onClick={cerrar}>
            Cerrar
          </button>
        </div>
      )}
    </Hoja>
  )
}

function construirAccionDesdeApi(
  accion: import('../db/agente').AccionId,
  input: Record<string, unknown>,
  alumno?: import('../db/types').Alumno,
  grupo?: import('../db/types').Grupo,
): AccionResuelta | null {
  const fecha = String(input.fecha ?? new Date().toISOString().slice(0, 10))
  const nombre = alumno ? alumno.alias || alumno.nombre : undefined

  switch (accion) {
    case 'registrar_observacion':
      if (!alumno) return null
      return {
        accion,
        alumnoId: alumno.id,
        fecha,
        resumen: `Observación (${input.signo}) para ${nombre}: «${input.texto}»`,
        payload: input,
      }
    case 'marcar_asistencia':
      if (!alumno) return null
      return { accion, alumnoId: alumno.id, fecha, resumen: `${nombre}: ${input.estado}`, payload: input }
    case 'marcar_chandal':
      if (!alumno) return null
      return {
        accion,
        alumnoId: alumno.id,
        fecha,
        resumen: `${nombre}: ${input.chandal ? 'con' : 'sin'} chándal`,
        payload: input,
      }
    case 'calificar':
      if (!alumno) return null
      return {
        accion,
        alumnoId: alumno.id,
        fecha,
        resumen: `${nombre} · ${input.columnaTitulo}: ${input.valor}`,
        payload: input,
      }
    case 'anadir_comentario_eval':
      if (!alumno) return null
      return {
        accion,
        alumnoId: alumno.id,
        fecha,
        resumen: `Comentario T${input.trimestre} de ${nombre}: «${input.comentario}»`,
        payload: input,
      }
    case 'crear_nota_sesion':
      if (!grupo) return null
      return {
        accion,
        grupoId: grupo.id,
        fecha,
        resumen: `Nota de sesión en ${grupo.nombre}: «${input.nota}»`,
        payload: input,
      }
    case 'deshacer_ultima':
      return { accion, fecha, resumen: 'Deshacer la última acción del agente', payload: {} }
    default:
      return null
  }
}

async function responderConsulta(
  input: Record<string, unknown>,
  alumno?: import('../db/types').Alumno,
): Promise<string> {
  if (!alumno) return 'No he identificado de quién preguntas.'
  const nombre = alumno.alias || alumno.nombre

  if (input.sobre === 'asistencia' || input.sobre === 'chandal') {
    const registros = await db.asistencias.where('alumnoId').equals(alumno.id).toArray()
    const r = resumirAsistencia(registros)
    return input.sobre === 'chandal'
      ? `${nombre} lleva ${r.rachaChandal} sesiones seguidas con chándal (${r.sinChandal} veces sin él en total).`
      : `${nombre}: ${r.pctAsistencia}% de asistencia, ${r.faltas} faltas, ${r.retrasos} retrasos.`
  }

  if (input.sobre === 'observaciones') {
    const lista = await db.observaciones.where('alumnoId').equals(alumno.id).toArray()
    const positivos = lista.filter((o) => o.signo === '+').length
    const negativos = lista.filter((o) => o.signo === '-').length
    return `${nombre} tiene ${positivos} observaciones positivas y ${negativos} negativas registradas.`
  }

  return `Todavía no puedo consultar «${input.sobre}» de ${nombre}.`
}
