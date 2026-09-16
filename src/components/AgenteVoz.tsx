import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Mic, Pencil, Users, X } from 'lucide-react'
import { useState } from 'react'
import {
  apilarDeshacer,
  ejecutarAccion,
  interpretarLocal,
  registrarEnLog,
  resolverGrupo,
  type AccionResuelta,
  type ResultadoInterpretar,
} from '../db/agente'
import { interpretarConApi, resolverTokens } from '../db/agenteApi'
import { useConfig } from '../db/config'
import { db } from '../db/db'
import { gruposVisibles } from '../db/grupos'
import { resumirAsistencia } from '../db/asistencia'
import { buscarAlumnoEnTexto, construirMapaTokens } from '../lib/pseudonimizacion'
import { etiquetaDia } from '../lib/fechas'
import { useGrupoActivo } from '../store/grupoActivo'
import { useUI } from '../store/ui'
import { CampoArea } from './Campo'
import { Hoja } from './Hoja'
import { SelectorGrupo } from './SelectorGrupo'
import type { Alumno, Grupo } from '../db/types'

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

/**
 * La tarjeta de confirmación enseña SIEMPRE el grupo y el alumno resueltos, y los
 * dos se corrigen con un toque.
 *
 * El grupo está ahí porque su ausencia era justo lo que dejaba pasar el fallo:
 * el agente resolvía un alumno de otra clase, el resumen solo decía su nombre, y
 * como el nombre era plausible nadie lo veía hasta mucho después. Con el grupo
 * delante, un error de clase se ve antes de escribir nada.
 *
 * `grupo` sin resolver no es un estado de error: es la pregunta. Pasa cuando no
 * se dictó grupo y no hay ninguno abierto, o cuando «cuarto A» encaja con dos
 * áreas y ni el horario ni el contexto desempatan. Se enseña la misma tarjeta con
 * el selector abierto y «Confirmar» apagado, en vez de adivinar.
 */
type Fase =
  | { paso: 'dictado'; texto: string; error?: string }
  | {
      paso: 'confirmar'
      /** El dictado tal cual, para reeditar y para el log. */
      texto: string
      /** El dictado sin la mención del grupo: lo único que ve el fuzzy de nombres. */
      textoSinGrupo: string
      grupo?: Grupo
      /** Los grupos del selector: los candidatos ambiguos, o todos si no se dijo ninguno. */
      gruposOfrecidos: Grupo[]
      accion?: AccionResuelta
      /** Candidatos de alumno DENTRO del grupo, para los chips. */
      candidatosAlumno: Alumno[]
      eligiendoAlumno: boolean
      aviso?: string
    }
  | { paso: 'respuesta'; texto: string }

function HojaAgente({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const config = useConfig()
  const grupoActivoId = useGrupoActivo((s) => s.grupoId)
  const [fase, setFase] = useState<Fase>({ paso: 'dictado', texto: '' })
  // Cubre la llamada de red a la API y la escritura de confirmar(): sin esto
  // el botón sigue pulsable durante el `await` y un segundo toque duplica la
  // acción (doble observación, doble asistencia…).
  const [procesando, setProcesando] = useState(false)

  const alumnos = useLiveQuery(async () => (await db.alumnos.toArray()).filter((a) => a.activo), []) ?? []
  const grupos = useLiveQuery(() => gruposVisibles(), []) ?? []

  function cerrar() {
    setFase({ paso: 'dictado', texto: '' })
    onCerrar()
  }

  /**
   * REGLA DURA DE ACOTADO: el alumno se busca únicamente entre los activos de
   * este grupo. No hay ninguna rama que consulte a los demás, por muy parecido
   * que sea un nombre de otra clase.
   */
  function alumnosDe(grupo: Grupo): Alumno[] {
    return alumnos.filter((a) => a.grupoId === grupo.id)
  }

  /** Resuelve la acción dentro de un grupo ya elegido. Es lo que se repite al cambiar de grupo. */
  async function resolverEnGrupo(
    texto: string,
    textoSinGrupo: string,
    grupo: Grupo,
    gruposOfrecidos: Grupo[],
    alumnoForzado?: Alumno,
  ): Promise<Fase> {
    const delGrupo = alumnosDe(grupo)
    const base = { paso: 'confirmar' as const, texto, textoSinGrupo, grupo, gruposOfrecidos, eligiendoAlumno: false }
    let degradadoALocal = false

    if (config.apiKey && !alumnoForzado) {
      try {
        // Solo viaja el grupo resuelto y su alumnado: el modelo no puede
        // devolver el token de un alumno de otra clase porque no lo tiene.
        const r = await interpretarConApi(textoSinGrupo, delGrupo, [grupo], {
          apiKey: config.apiKey,
          modelo: config.modeloAgente,
        })
        if (r) {
          const mapa = construirMapaTokens(delGrupo, [grupo])
          const { alumno } = resolverTokens(r.input, mapa)
          if (r.accion === 'consultar') {
            return { paso: 'respuesta', texto: await responderConsulta(r.input, alumno) }
          }
          const resuelta = construirAccionDesdeApi(r.accion, r.input, grupo, alumno)
          if (resuelta) {
            return { ...base, accion: resuelta, candidatosAlumno: candidatosDe(textoSinGrupo, delGrupo) }
          }
        }
      } catch {
        // Sin red o fallo de la API: se cae al parser local (§6), avisando de
        // la degradación en vez de fallar en silencio.
        degradadoALocal = true
      }
    }

    const local: ResultadoInterpretar = interpretarLocal(
      textoSinGrupo,
      grupo,
      delGrupo,
      buscarAlumnoEnTexto,
      alumnoForzado,
    )
    const aviso = degradadoALocal
      ? 'Sin conexión con la API: interpretado con el reconocimiento local.'
      : undefined

    if (local.tipo === 'accion') return { ...base, accion: local.accion, candidatosAlumno: candidatosDe(textoSinGrupo, delGrupo), aviso }
    if (local.tipo === 'ambiguo') {
      return { ...base, candidatosAlumno: local.candidatos, eligiendoAlumno: true, aviso }
    }
    // Ni la API ni el parser han sacado nada: se vuelve al dictado con el motivo.
    return {
      paso: 'dictado',
      texto,
      error: degradadoALocal
        ? 'Sin conexión con la API. El reconocimiento local no ha entendido la acción.'
        : `No he identificado a nadie de ${grupo.nombre}. Prueba a ser más concreto o cambia de grupo.`,
    }
  }

  async function procesar(texto: string) {
    if (!texto.trim() || procesando) return
    setProcesando(true)
    try {
      const grupoActivo = grupos.find((g) => g.id === grupoActivoId)
      const { grupo, ambiguos, textoSinGrupo } = resolverGrupo(texto, grupos, grupoActivo)

      // Sin grupo (ni dictado ni de contexto) o con varios candidatos: se
      // pregunta. Ni se elige el más probable ni se busca al alumno todavía.
      if (!grupo) {
        setFase({
          paso: 'confirmar',
          texto,
          textoSinGrupo,
          gruposOfrecidos: ambiguos?.length ? ambiguos : grupos,
          candidatosAlumno: [],
          eligiendoAlumno: false,
        })
        return
      }

      setFase(await resolverEnGrupo(texto, textoSinGrupo, grupo, ambiguos?.length ? ambiguos : grupos))
    } finally {
      setProcesando(false)
    }
  }

  /** Cambiar de grupo rehace la resolución dentro del nuevo: el alumno anterior no se conserva. */
  async function elegirGrupo(grupoId: string) {
    if (fase.paso !== 'confirmar' || procesando) return
    const grupo = grupos.find((g) => g.id === grupoId)
    if (!grupo) return
    setProcesando(true)
    try {
      setFase(await resolverEnGrupo(fase.texto, fase.textoSinGrupo, grupo, fase.gruposOfrecidos))
    } finally {
      setProcesando(false)
    }
  }

  async function elegirAlumno(alumno: Alumno) {
    if (fase.paso !== 'confirmar' || !fase.grupo || procesando) return
    setProcesando(true)
    try {
      setFase(await resolverEnGrupo(fase.texto, fase.textoSinGrupo, fase.grupo, fase.gruposOfrecidos, alumno))
    } finally {
      setProcesando(false)
    }
  }

  async function confirmar() {
    if (fase.paso !== 'confirmar' || !fase.accion || procesando) return
    const { accion, texto } = fase
    setProcesando(true)
    try {
      const deshacer = await ejecutarAccion(accion)
      const logId = await registrarEnLog(texto, accion)
      apilarDeshacer(logId, deshacer)
      cerrar()
      mostrarAviso(accion.resumen, deshacer)
    } catch (e) {
      setFase({ paso: 'dictado', texto, error: e instanceof Error ? e.message : 'No se pudo aplicar.' })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Hoja abierta={abierta} titulo="Agente de voz" onCerrar={cerrar}>
      {fase.paso === 'dictado' && (
        <div className="space-y-3">
          <CampoArea
            className="campo h-28 resize-none py-2"
            valor={fase.texto}
            onValor={(v) => setFase({ paso: 'dictado', texto: v })}
            placeholder="Cuarto A, Ana ha ayudado a un compañero…"
            aria-label="Dictado para el agente de voz"
            aria-invalid={!!fase.error}
            aria-describedby={fase.error ? 'agente-error' : undefined}
            autoFocus
          />
          {fase.error && (
            <p id="agente-error" role="alert" className="text-sm font-semibold text-acento">
              {fase.error}
            </p>
          )}
          <p className="text-xs texto-suave">
            Di el grupo al principio («cuarto A», «3ºB»): el alumno se busca solo dentro de él.
          </p>
          {!config.apiKey && (
            <p className="text-xs texto-suave">
              Sin API key configurada: se usa el reconocimiento local (observación, asistencia,
              chándal, deshacer).
            </p>
          )}
          <button
            className="btn-primario w-full"
            onClick={() => void procesar(fase.texto)}
            disabled={!fase.texto.trim() || procesando}
          >
            {procesando ? 'Interpretando…' : 'Interpretar'}
          </button>
        </div>
      )}

      {fase.paso === 'confirmar' && (
        <div className="space-y-4">
          <div className="panel-agua space-y-3">
            <div>
              <span className="etiqueta flex items-center gap-1.5">
                <Users size={14} aria-hidden />
                Grupo
              </span>
              {fase.grupo ? (
                <SelectorGrupo
                  grupos={fase.gruposOfrecidos}
                  valor={fase.grupo.id}
                  onCambio={(id) => void elegirGrupo(id)}
                />
              ) : (
                // Sin grupo resuelto NO se preselecciona ninguno: un desplegable
                // con el primero puesto parecería una respuesta, y aquí lo que
                // hay es una pregunta.
                <>
                  <p role="alert" className="text-xs font-semibold text-acento">
                    {fase.gruposOfrecidos.length < grupos.length
                      ? 'Ese nombre encaja con más de un grupo. Elige cuál.'
                      : 'No has dicho de qué grupo es. Elige uno.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fase.gruposOfrecidos.map((g) => (
                      <button
                        key={g.id}
                        className="pildora min-h-[40px] bg-agua-claro px-3 text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                        onClick={() => void elegirGrupo(g.id)}
                        disabled={procesando}
                      >
                        {g.nombre}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {fase.accion && !fase.eligiendoAlumno && (
              <div className="border-t border-agua pt-3 dark:border-noche-elevada">
                <p className="text-sm font-bold">{fase.accion.resumen}</p>
                <p className="mt-1 text-xs texto-suave">{etiquetaDia(fase.accion.fecha)}</p>
                {fase.candidatosAlumno.length > 1 && (
                  <button
                    className="mt-2 text-xs font-semibold text-primario underline dark:text-agua"
                    onClick={() => setFase({ ...fase, eligiendoAlumno: true })}
                    disabled={procesando}
                  >
                    No es este alumno
                  </button>
                )}
              </div>
            )}

            {fase.grupo && fase.eligiendoAlumno && (
              <div className="border-t border-agua pt-3 dark:border-noche-elevada">
                <p className="text-sm texto-suave">¿A quién de {fase.grupo.nombre} te refieres?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(fase.candidatosAlumno.length ? fase.candidatosAlumno : alumnosDe(fase.grupo)).map((a) => (
                    <button
                      key={a.id}
                      className="pildora min-h-[40px] bg-agua-claro px-3 text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                      onClick={() => void elegirAlumno(a)}
                      disabled={procesando}
                    >
                      {a.alias || a.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {fase.aviso && <p className="text-xs texto-suave">{fase.aviso}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-suave"
              onClick={() => setFase({ paso: 'dictado', texto: fase.texto })}
              disabled={procesando}
            >
              <Pencil size={18} aria-hidden />
              Editar
            </button>
            <button
              className="btn-primario"
              onClick={() => void confirmar()}
              disabled={procesando || !fase.accion || fase.eligiendoAlumno}
            >
              <Check size={18} aria-hidden />
              {procesando ? 'Aplicando…' : 'Confirmar'}
            </button>
          </div>
          <button className="btn-peligro w-full" onClick={cerrar} disabled={procesando}>
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

/** Los otros nombres del grupo que se parecen a lo dictado, para el «no es este alumno». */
function candidatosDe(texto: string, delGrupo: Alumno[]): Alumno[] {
  return buscarAlumnoEnTexto(texto, delGrupo).map((c) => c.alumno)
}

function construirAccionDesdeApi(
  accion: import('../db/agente').AccionId,
  input: Record<string, unknown>,
  grupo: Grupo,
  alumno?: Alumno,
): AccionResuelta | null {
  const fecha = String(input.fecha ?? new Date().toISOString().slice(0, 10))
  const nombre = alumno ? alumno.alias || alumno.nombre : undefined
  // El grupo ya está resuelto en local y es el único del mapa: no se toma del
  // token, que además ya no viaja en el texto (se retiró la mención).
  const deAlumno = alumno ? { alumnoId: alumno.id, grupoId: grupo.id, fecha } : null

  switch (accion) {
    case 'registrar_observacion':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `Observación (${input.signo}) para ${nombre}: «${input.texto}»`,
        payload: input,
      }
    case 'marcar_asistencia':
      if (!deAlumno) return null
      return { accion, ...deAlumno, resumen: `${nombre}: ${input.estado}`, payload: input }
    case 'marcar_chandal':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `${nombre}: ${input.chandal ? 'con' : 'sin'} chándal`,
        payload: input,
      }
    case 'calificar':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `${nombre} · ${input.columnaTitulo}: ${input.valor}`,
        payload: input,
      }
    case 'anadir_comentario_eval':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `Comentario T${input.trimestre} de ${nombre}: «${input.comentario}»`,
        payload: input,
      }
    case 'crear_nota_sesion':
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
  alumno?: Alumno,
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
