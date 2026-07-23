import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, Plus, Circle, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { db } from '../db/db'
import { buscarObservaciones } from '../db/observaciones'
import type { SignoObservacion, TipoObservacion } from '../db/types'
import { etiquetaDia } from '../lib/fechas'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

const TIPOS: (TipoObservacion | 'todos')[] = ['todos', 'conducta', 'aprendizaje', 'salud', 'otro']

const ASPECTO_SIGNO: Record<SignoObservacion, { Icono: typeof Plus; clase: string }> = {
  '+': { Icono: Plus, clase: 'bg-lima-oscuro text-white' },
  neutro: { Icono: Circle, clase: 'bg-agua text-primario-oscuro' },
  '-': { Icono: Minus, clase: 'bg-acento text-white' },
}

export function Observaciones({ grupoId, alumnoId }: { grupoId?: string; alumnoId?: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [tipo, setTipo] = useState<TipoObservacion | 'todos'>('todos')
  const [signo, setSigno] = useState<SignoObservacion | 'todos'>('todos')
  const [texto, setTexto] = useState('')

  const grupos = useLiveQuery(() => db.grupos.toArray(), [])
  const alumnos = useLiveQuery(() => db.alumnos.toArray(), [])

  const lista = useLiveQuery(
    () =>
      buscarObservaciones({
        grupoId,
        alumnoId,
        tipo: tipo === 'todos' ? undefined : tipo,
        signo: signo === 'todos' ? undefined : signo,
        texto,
      }),
    [grupoId, alumnoId, tipo, signo, texto],
  )

  const nombreAlumno = (id?: string) => {
    if (!id) return 'Todo el grupo'
    const a = alumnos?.find((x) => x.id === id)
    return a ? a.alias || `${a.nombre} ${a.apellidos}`.trim() : 'Alumno dado de baja'
  }
  const nombreGrupo = (id: string) => grupos?.find((g) => g.id === id)?.nombre ?? '—'

  const contexto = alumnoId
    ? nombreAlumno(alumnoId)
    : grupoId
      ? nombreGrupo(grupoId)
      : 'Todos los grupos'

  async function borrar(id: string) {
    const previa = await db.observaciones.get(id)
    if (!previa) return
    await db.observaciones.delete(id)
    mostrarAviso('Observación eliminada', async () => {
      await db.observaciones.add(previa)
    })
  }

  return (
    <>
      <Cabecera titulo="Observaciones" atras={!!grupoId || !!alumnoId} subtitulo={contexto} />

      <div className="space-y-4 p-4">
        <div className="tarjeta space-y-3 py-3">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              className="campo pl-10"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar en texto y etiquetas"
              aria-label="Buscar observaciones"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {TIPOS.map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
                className={
                  'pildora min-h-[40px] px-3 ' +
                  (tipo === t
                    ? 'bg-primario text-white'
                    : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                }
              >
                {t === 'todos' ? 'Todos' : t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(['todos', '+', 'neutro', '-'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSigno(s)}
                aria-pressed={signo === s}
                className={(signo === s ? 'btn-primario' : 'btn-suave') + ' px-0 text-xs'}
              >
                {s === 'todos' ? 'Todos' : s === 'neutro' ? 'Neutro' : s === '+' ? 'Positivo' : 'Negativo'}
              </button>
            ))}
          </div>
        </div>

        {lista?.length === 0 && (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Sin observaciones</p>
            <p className="mt-1 text-sm texto-suave">
              {texto || tipo !== 'todos' || signo !== 'todos'
                ? 'Ningún registro coincide con el filtro.'
                : 'Regístralas desde la ficha del grupo con los botones + y −.'}
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {lista?.map((o) => {
            const { Icono, clase } = ASPECTO_SIGNO[o.signo]
            return (
              <li key={o.id} className="tarjeta py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${clase}`}
                    aria-label={o.signo === '+' ? 'Positivo' : o.signo === '-' ? 'Negativo' : 'Neutro'}
                  >
                    <Icono size={16} strokeWidth={3} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <button
                      className="block w-full truncate text-left text-base font-bold"
                      onClick={() => o.alumnoId && navegar(`/alumnos/${o.alumnoId}`)}
                    >
                      {nombreAlumno(o.alumnoId)}
                    </button>
                    <div className="cifra text-xs texto-suave">
                      {etiquetaDia(o.fecha)} · {nombreGrupo(o.grupoId)} · {o.tipo}
                    </div>
                    {o.texto && <p className="mt-1 text-sm">{o.texto}</p>}
                    {o.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {o.tags.map((t) => (
                          <span
                            key={t}
                            className="pildora bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => void borrar(o.id)}
                    className="flex min-h-tap min-w-tap shrink-0 items-center justify-center text-tinta-tenue"
                    aria-label="Eliminar observación"
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
