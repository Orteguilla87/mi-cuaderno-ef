import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarPlus, Clipboard, ClipboardX, Clock, Copy, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Hoja } from '../components/Hoja'
import { HojaConfirmar } from '../components/HojaConfirmar'
import { db } from '../db/db'
import {
  copiarPlanificacion,
  crearSesion,
  eliminarSesionesDeGrupo,
  generarCursoCompleto,
  pegarEnSesion,
  proximasClases,
  sesionesDeGrupo,
  type ResultadoCopia,
} from '../db/planificador'
import type { FranjaHorario, Grupo, Sesion } from '../db/types'
import { aISO, formatoDiaCorto } from '../lib/fechas'
import { navegar } from '../lib/router'
import { usePortapapeles } from '../store/portapapeles'
import { useUI } from '../store/ui'
import { EditorHorario } from './Grupos'

/**
 * Planificación de un grupo entero (§ petición del usuario): lo normal es
 * programar de un tirón todas las sesiones de 1ºA, y solo después retocar un
 * día suelto desde la vista semanal.
 */
export function PlanGrupo() {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [copiando, setCopiando] = useState(false)
  const [editandoHorario, setEditandoHorario] = useState(false)
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false)

  const grupos = useLiveQuery(async () => {
    const lista = await db.grupos.toArray()
    return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [])

  // Al entrar se elige el primer grupo: la vista sin grupo no aporta nada.
  useEffect(() => {
    if (!grupoId && grupos && grupos.length > 0) setGrupoId(grupos[0].id)
  }, [grupos, grupoId])

  const grupo = grupos?.find((g) => g.id === grupoId) ?? null
  const sesiones = useLiveQuery(
    async () => (grupoId ? sesionesDeGrupo(grupoId) : []),
    [grupoId],
  )
  const unidades = useLiveQuery(() => db.unidades.toArray(), [])
  const { sesionCopiada, copiar: copiarEnPortapapeles, limpiar: limpiarPortapapeles } = usePortapapeles()

  function copiarSesion(s: Sesion) {
    copiarEnPortapapeles({
      titulo: s.titulo,
      udId: s.udId,
      juegos: s.juegos,
      notas: s.notas,
      recursos: s.recursos,
      recursosNecesarios: s.recursosNecesarios,
      comentarios: s.comentarios,
      origenResumen: `${s.titulo || 'Sesión sin título'} · ${grupo?.nombre ?? ''}`,
    })
    mostrarAviso('Sesión copiada. Ve al grupo que quieras y pégala en la sesión que decidas.')
  }

  async function pegarEn(sesionId: string) {
    if (!sesionCopiada) return
    const deshacer = await pegarEnSesion(sesionId, sesionCopiada)
    mostrarAviso('Sesión pegada', deshacer)
  }

  async function anadirSiguiente() {
    if (!grupo) return
    const yaUsadas = new Set((sesiones ?? []).map((s) => s.fecha))
    // La siguiente clase libre a partir de hoy, no la siguiente fecha del calendario.
    const candidatas = await proximasClases(grupo, aISO(), (sesiones?.length ?? 0) + 20)
    const libre = candidatas.find((f) => !yaUsadas.has(f))
    if (!libre) return
    const id = await crearSesion(grupo.id, libre)
    navegar(`/sesiones/${id}`)
  }

  async function generarCurso() {
    if (!grupo) return
    const { resultado, deshacer } = await generarCursoCompleto(grupo.id)
    mostrarAviso(
      resultado.creadas === 0
        ? 'El curso ya estaba generado'
        : `${resultado.creadas} sesiones creadas de ${resultado.total} clases`,
      resultado.creadas > 0 ? deshacer : undefined,
    )
  }

  async function vaciar() {
    if (!grupo) return
    const { eliminadas, deshacer } = await eliminarSesionesDeGrupo(grupo.id)
    mostrarAviso(`${eliminadas} sesiones eliminadas`, deshacer)
  }

  if (grupos?.length === 0) {
    return (
      <div className="tarjeta text-center">
        <Users className="mx-auto text-tinta-tenue" size={32} aria-hidden />
        <p className="mt-2 text-base font-semibold">Todavía no hay grupos</p>
        <p className="mt-1 text-sm texto-suave">
          La planificación se construye sobre el horario de cada grupo.
        </p>
        <button className="btn-primario mt-4 w-full" onClick={() => navegar('/grupos')}>
          Ir a Grupos
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {grupos?.map((g) => (
          <button
            key={g.id}
            onClick={() => setGrupoId(g.id)}
            aria-pressed={grupoId === g.id}
            className={
              'pildora min-h-[40px] gap-1.5 px-3 ' +
              (grupoId === g.id
                ? 'bg-primario text-white'
                : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
            }
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: g.color }}
              aria-hidden
            />
            {g.nombre}
          </button>
        ))}
      </div>

      {grupo && (
        <>
          <div className="tarjeta flex items-center gap-3 py-3">
            <span
              className="h-10 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: grupo.color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-bold">{grupo.nombre}</span>
                <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
              </div>
              <p className="cifra mt-0.5 text-sm texto-suave">
                {sesiones?.length ?? 0}{' '}
                {(sesiones?.length ?? 0) === 1 ? 'sesión programada' : 'sesiones programadas'}
              </p>
            </div>
          </div>

          {grupo.horario.length === 0 ? (
            <div className="tarjeta text-center">
              <p className="text-base font-semibold">{grupo.nombre} no tiene horario</p>
              <p className="mt-1 text-sm texto-suave">
                Sin horario no se puede saber qué días tiene clase, así que no hay nada que
                planificar.
              </p>
              <button className="btn-primario mt-4 w-full" onClick={() => setEditandoHorario(true)}>
                <Clock size={18} aria-hidden />
                Poner horario
              </button>
            </div>
          ) : (
            <>
              <button className="btn-primario w-full" onClick={() => void generarCurso()}>
                <CalendarPlus size={18} aria-hidden />
                Generar curso completo
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button
                  className="btn-suave px-0 text-xs"
                  onClick={() => void anadirSiguiente()}
                >
                  + Sesión
                </button>
                <button
                  className="btn-suave px-0 text-xs"
                  onClick={() => setCopiando(true)}
                  disabled={(sesiones?.length ?? 0) === 0}
                >
                  <Copy size={16} aria-hidden />
                  Copiar a…
                </button>
                <button
                  className="btn-suave px-0 text-xs"
                  onClick={() => setEditandoHorario(true)}
                >
                  <Clock size={16} aria-hidden />
                  Horario
                </button>
              </div>
            </>
          )}

          {sesionCopiada && (
            <div className="panel-agua flex items-center gap-2 text-sm">
              <Clipboard size={16} className="shrink-0 text-primario dark:text-agua" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Copiado: <strong>{sesionCopiada.origenResumen}</strong>
              </span>
              <button
                onClick={limpiarPortapapeles}
                className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                aria-label="Descartar lo copiado"
              >
                <ClipboardX size={18} aria-hidden />
              </button>
            </div>
          )}

          {sesiones?.length === 0 ? (
            <div className="tarjeta text-center">
              <p className="text-base font-semibold">Sin sesiones programadas</p>
              <p className="mt-1 text-sm texto-suave">
                «Nueva sesión» las va colocando en las próximas clases del horario.
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {sesiones?.map((s, i) => (
                <li key={s.id} className="tarjeta flex items-center gap-1 py-2 pl-3 pr-2">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => navegar(`/sesiones/${s.id}`)}
                  >
                    <span className="cifra flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-agua-claro text-sm font-bold text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {s.titulo || 'Sesión sin título'}
                      </span>
                      <span className="cifra mt-0.5 block truncate text-sm texto-suave">
                        {formatoDiaCorto(s.fecha)}
                        {s.juegos.length > 0 && ` · ${s.juegos.length} juegos`}
                        {s.udId &&
                          ` · ${unidades?.find((u) => u.id === s.udId)?.titulo ?? 'unidad'}`}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => copiarSesion(s)}
                    className="flex min-h-tap min-w-tap shrink-0 items-center justify-center text-tinta-tenue"
                    aria-label={`Copiar sesión ${i + 1}`}
                  >
                    <Copy size={18} aria-hidden />
                  </button>
                  {sesionCopiada && (
                    <button
                      onClick={() => void pegarEn(s.id)}
                      className="flex min-h-tap min-w-tap shrink-0 items-center justify-center text-primario dark:text-agua"
                      aria-label={`Pegar en sesión ${i + 1}`}
                    >
                      <Clipboard size={18} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}

          {(sesiones?.length ?? 0) > 0 && (
            <button className="btn-peligro w-full" onClick={() => setConfirmandoVaciar(true)}>
              <Trash2 size={18} aria-hidden />
              Vaciar planificación de {grupo.nombre}
            </button>
          )}

          <HojaConfirmar
            abierta={confirmandoVaciar}
            titulo="Vaciar planificación"
            descripcion={`¿Eliminar las ${sesiones?.length ?? 0} sesiones de ${grupo.nombre}? Se puede deshacer.`}
            textoConfirmar="Vaciar"
            onConfirmar={vaciar}
            onCerrar={() => setConfirmandoVaciar(false)}
          />

          <HojaCopiarPlan
            abierta={copiando}
            origen={grupo}
            sesiones={sesiones ?? []}
            grupos={grupos ?? []}
            onCerrar={() => setCopiando(false)}
          />

          <HojaHorario
            abierta={editandoHorario}
            grupo={grupo}
            onCerrar={() => setEditandoHorario(false)}
          />
        </>
      )}
    </>
  )
}

/**
 * Horario del grupo editable sin salir del planificador: cambiarlo es lo que
 * determina qué sesiones se generan, así que tenerlo a mano aquí evita el viaje
 * a la ficha del grupo y vuelta.
 */
function HojaHorario({
  abierta,
  grupo,
  onCerrar,
}: {
  abierta: boolean
  grupo: Grupo
  onCerrar: () => void
}) {
  const [horario, setHorario] = useState<FranjaHorario[] | null>(null)
  const actual = horario ?? grupo.horario

  async function guardar() {
    await db.grupos.update(grupo.id, { horario: actual })
    setHorario(null)
    onCerrar()
  }

  return (
    <Hoja abierta={abierta} titulo={`Horario de ${grupo.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <EditorHorario horario={actual} onCambio={setHorario} />

        <p className="text-xs texto-suave">
          Cambiar el horario no mueve las sesiones ya creadas. Si cambias los días, vacía la
          planificación y vuelve a generarla.
        </p>

        <button className="btn-primario w-full" onClick={() => void guardar()}>
          Guardar horario
        </button>
      </div>
    </Hoja>
  )
}

/** Copia la planificación a uno o varios grupos a la vez. */
function HojaCopiarPlan({
  abierta,
  origen,
  sesiones,
  grupos,
  onCerrar,
}: {
  abierta: boolean
  origen: Grupo
  sesiones: Sesion[]
  grupos: Grupo[]
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [destinos, setDestinos] = useState<Set<string>>(new Set())
  const [desde, setDesde] = useState(aISO())
  const [resultados, setResultados] = useState<ResultadoCopia[] | null>(null)

  useEffect(() => {
    if (abierta) {
      setDestinos(new Set())
      setDesde(aISO())
      setResultados(null)
    }
  }, [abierta])

  const candidatos = grupos.filter((g) => g.id !== origen.id)

  function alternar(id: string) {
    setDestinos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  async function copiar() {
    const { resultados: res, deshacer } = await copiarPlanificacion({
      sesiones,
      destinos: [...destinos],
      desde,
    })
    setResultados(res)
    const total = res.reduce((n, r) => n + r.creadas, 0)
    mostrarAviso(`${total} sesiones copiadas`, async () => {
      await deshacer()
      setResultados(null)
    })
  }

  return (
    <Hoja abierta={abierta} titulo={`Copiar plan de ${origen.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          Se copian {sesiones.length}{' '}
          {sesiones.length === 1 ? 'sesión' : 'sesiones'} con su título, juegos, notas y recursos.
          Se colocan <strong>en orden</strong> sobre las clases del grupo de destino, saltando
          festivos y las clases que ya tengan sesión.
        </p>

        {candidatos.length === 0 ? (
          <div className="panel-agua text-sm">
            No hay otros grupos a los que copiar. Crea antes algún grupo más.
          </div>
        ) : (
          <>
            <div>
              <span className="etiqueta">Grupos de destino</span>
              <div className="space-y-2">
                {candidatos.map((g) => {
                  const activo = destinos.has(g.id)
                  return (
                    <button
                      key={g.id}
                      onClick={() => alternar(g.id)}
                      aria-pressed={activo}
                      className={
                        'flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ' +
                        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                        (activo
                          ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
                          : 'border-borde dark:border-noche-borde')
                      }
                    >
                      <span
                        className={
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ' +
                          (activo ? 'border-primario bg-primario text-white' : 'border-borde')
                        }
                        aria-hidden
                      >
                        {activo ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-bold">{g.nombre}</span>
                          <BadgeEtapa etapa={g.etapa} nivel={g.nivel} />
                        </span>
                        <span className="cifra block text-xs texto-suave">
                          {g.horario.length === 0
                            ? 'Sin horario: no se puede copiar'
                            : `${g.horario.length} clases por semana`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="etiqueta" htmlFor="copia-desde">
                Empezar en
              </label>
              <input
                id="copia-desde"
                type="date"
                className="campo cifra"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
              <p className="mt-1 text-xs texto-suave">
                La primera sesión cae en la primera clase de cada grupo a partir de esta fecha.
              </p>
            </div>

            {resultados && (
              <div className="panel-agua space-y-1 text-sm">
                {resultados.map((r) => (
                  <p key={r.grupoId}>
                    <strong>{r.nombreGrupo}:</strong> {r.creadas} copiadas
                    {r.omitidas > 0 && ` · ${r.omitidas} clases ya ocupadas`}
                    {r.sinHueco > 0 && ` · ${r.sinHueco} sin hueco en el curso`}
                  </p>
                ))}
              </div>
            )}

            <button
              className="btn-primario w-full"
              onClick={() => void copiar()}
              disabled={destinos.size === 0 || !!resultados}
            >
              {resultados
                ? 'Copiado'
                : `Copiar a ${destinos.size} ${destinos.size === 1 ? 'grupo' : 'grupos'}`}
            </button>
          </>
        )}
      </div>
    </Hoja>
  )
}
