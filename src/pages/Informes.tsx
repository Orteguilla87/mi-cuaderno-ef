import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { db } from '../db/db'
import { buscarObservaciones } from '../db/observaciones'
import type { Trimestre } from '../db/types'
import {
  exportarAsistenciaCSV,
  exportarNotasXLSX,
  generarActaGrupo,
  generarInformeIndividual,
} from '../lib/informes'
import { useUI } from '../store/ui'

export function Informes() {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [trimestre, setTrimestre] = useState<Trimestre>(1)
  const [alumnoId, setAlumnoId] = useState('')
  const [generando, setGenerando] = useState<string | null>(null)

  const grupos = useLiveQuery(async () => {
    const lista = await db.grupos.toArray()
    return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [])
  const grupo = grupos?.find((g) => g.id === grupoId) ?? grupos?.[0] ?? null

  const alumnos = useLiveQuery(async () => {
    if (!grupo) return []
    const lista = await db.alumnos.where('grupoId').equals(grupo.id).toArray()
    return lista
      .filter((a) => a.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  }, [grupo?.id])

  const alumno = alumnos?.find((a) => a.id === alumnoId) ?? alumnos?.[0]

  async function conAviso(accion: string, tarea: () => Promise<void>) {
    setGenerando(accion)
    try {
      await tarea()
      mostrarAviso('Generado. Revisa las descargas del navegador.')
    } catch {
      mostrarAviso('No se ha podido generar el informe.')
    } finally {
      setGenerando(null)
    }
  }

  if (!grupos) return null

  return (
    <>
      <Cabecera titulo="Informes" atras subtitulo="PDF, XLSX y CSV — todo en local" />

      <div className="space-y-4 p-4">
        {grupos.length === 0 ? (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Todavía no hay grupos</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {grupos.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGrupoId(g.id)}
                  aria-pressed={grupo?.id === g.id}
                  className={
                    'pildora min-h-[40px] gap-1.5 px-3 ' +
                    (grupo?.id === g.id
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

            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTrimestre(t)}
                  className={(trimestre === t ? 'btn-primario' : 'btn-suave') + ' px-0 text-sm'}
                >
                  {t}.º trimestre
                </button>
              ))}
            </div>

            {grupo && (
              <section>
                <h2 className="text-lg font-bold">Grupo</h2>
                <div className="linea-pista mb-2 mt-1.5" aria-hidden />
                <button
                  className="btn-suave w-full"
                  disabled={!!generando}
                  onClick={() =>
                    void conAviso('acta', () => generarActaGrupo(grupo, alumnos ?? []))
                  }
                >
                  <FileText size={18} aria-hidden />
                  Acta de grupo (PDF)
                </button>
              </section>
            )}

            {grupo && (alumnos?.length ?? 0) > 0 && (
              <section>
                <h2 className="text-lg font-bold">Alumno</h2>
                <div className="linea-pista mb-2 mt-1.5" aria-hidden />
                <select
                  className="campo mb-2"
                  value={alumno?.id ?? ''}
                  onChange={(e) => setAlumnoId(e.target.value)}
                >
                  {alumnos?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-suave w-full"
                  disabled={!!generando || !alumno}
                  onClick={() =>
                    alumno &&
                    void conAviso('individual', () =>
                      generarInformeIndividual(grupo, alumno, trimestre),
                    )
                  }
                >
                  <FileText size={18} aria-hidden />
                  Informe individual (PDF)
                </button>
              </section>
            )}

            {grupo && (
              <section>
                <h2 className="text-lg font-bold">Exportar datos</h2>
                <div className="linea-pista mb-2 mt-1.5" aria-hidden />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn-suave"
                    disabled={!!generando}
                    onClick={() =>
                      void conAviso('notas', () => exportarNotasXLSX(grupo, alumnos ?? [], trimestre))
                    }
                  >
                    <FileSpreadsheet size={18} aria-hidden />
                    Notas (XLSX)
                  </button>
                  <button
                    className="btn-suave"
                    disabled={!!generando}
                    onClick={() =>
                      void conAviso('asistencia', () => exportarAsistenciaCSV(grupo, alumnos ?? []))
                    }
                  >
                    <Download size={18} aria-hidden />
                    Asistencia (CSV)
                  </button>
                </div>
                <p className="mt-2 text-xs texto-suave">
                  Las notas del cuaderno salen del {trimestre}.º trimestre seleccionado arriba. La
                  asistencia exporta el curso completo.
                </p>
              </section>
            )}

            {grupo && (alumnos?.length ?? 0) > 0 && (
              <ComentariosGrupo grupoId={grupo.id} alumnos={alumnos ?? []} />
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * Borrador de comentario por alumno para pegar en Raíces (§5 M7). Se genera a
 * partir de las observaciones registradas y se copia con un toque; no se
 * guarda en la base — el motor de nota trimestral con su propio banco de
 * comentarios llega en la fase de evaluación.
 */
function ComentariosGrupo({
  grupoId,
  alumnos,
}: {
  grupoId: string
  alumnos: import('../db/types').Alumno[]
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [borradores, setBorradores] = useState<Map<string, string>>(new Map())

  async function generar() {
    const nuevo = new Map<string, string>()
    for (const a of alumnos) {
      const obs = await buscarObservaciones({ grupoId, alumnoId: a.id })
      const positivas = obs.filter((o) => o.signo === '+' && o.texto)
      const negativas = obs.filter((o) => o.signo === '-' && o.texto)
      const partes: string[] = []
      if (positivas.length) partes.push(positivas.map((o) => o.texto).join('. '))
      if (negativas.length) partes.push(`A mejorar: ${negativas.map((o) => o.texto).join('. ')}`)
      nuevo.set(a.id, partes.join(' ') || 'Sin observaciones registradas este curso.')
    }
    setBorradores(nuevo)
  }

  async function copiar(alumnoId: string) {
    const texto = borradores.get(alumnoId) ?? ''
    await navigator.clipboard.writeText(texto)
    mostrarAviso('Comentario copiado')
  }

  return (
    <section>
      <h2 className="text-lg font-bold">Comentarios para Raíces</h2>
      <div className="linea-pista mb-2 mt-1.5" aria-hidden />

      {borradores.size === 0 ? (
        <button className="btn-suave w-full" onClick={() => void generar()}>
          Generar borradores desde las observaciones
        </button>
      ) : (
        <ul className="space-y-2">
          {alumnos.map((a) => (
            <li key={a.id} className="tarjeta space-y-2 py-3">
              <p className="text-sm font-bold">
                {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
              </p>
              <textarea
                className="campo h-20 resize-none py-2 text-sm"
                value={borradores.get(a.id) ?? ''}
                onChange={(e) =>
                  setBorradores((prev) => new Map(prev).set(a.id, e.target.value))
                }
              />
              <button className="btn-suave w-full" onClick={() => void copiar(a.id)}>
                <Copy size={16} aria-hidden />
                Copiar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
