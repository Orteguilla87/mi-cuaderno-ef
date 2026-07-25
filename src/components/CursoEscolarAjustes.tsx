import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarX2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db } from '../db/db'
import { leerCursoActivo } from '../db/curso'
import { parsearCalendario, type ResultadoCalendario } from '../lib/calendarioEscolar'
import { formatoLargo } from '../lib/fechas'
import { useUI } from '../store/ui'
import { Hoja } from './Hoja'

/**
 * Fechas del curso y días no lectivos. El planificador los necesita para generar
 * el esqueleto del año: sin ellos colocaría sesiones en Navidad.
 */
export function CursoEscolarAjustes() {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [pegando, setPegando] = useState(false)
  const [nuevoDia, setNuevoDia] = useState('')

  const curso = useLiveQuery(() => leerCursoActivo(), [])
  if (!curso) return null

  const actualizar = (cambios: Parameters<typeof db.cursos.update>[1]) =>
    void db.cursos.update(curso.id, cambios)

  const festivos = [...curso.festivos].sort()

  async function anadirDia() {
    if (!nuevoDia || curso!.festivos.includes(nuevoDia)) {
      setNuevoDia('')
      return
    }
    await db.cursos.update(curso!.id, { festivos: [...curso!.festivos, nuevoDia].sort() })
    setNuevoDia('')
  }

  async function quitarDia(fecha: string) {
    const previos = curso!.festivos
    await db.cursos.update(curso!.id, { festivos: previos.filter((f) => f !== fecha) })
    mostrarAviso(`${formatoLargo(fecha)} vuelve a ser lectivo`, async () => {
      await db.cursos.update(curso!.id, { festivos: previos })
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="etiqueta" htmlFor="curso-inicio">
            Inicio del curso
          </label>
          <input
            id="curso-inicio"
            type="date"
            className="campo cifra"
            value={curso.inicio}
            onChange={(e) => actualizar({ inicio: e.target.value })}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="curso-fin">
            Fin del curso
          </label>
          <input
            id="curso-fin"
            type="date"
            className="campo cifra"
            value={curso.fin}
            onChange={(e) => actualizar({ fin: e.target.value })}
          />
        </div>
      </div>

      {curso.fin <= curso.inicio && (
        <p className="text-sm font-semibold text-acento">
          El fin del curso debe ser posterior al inicio.
        </p>
      )}

      <div>
        <div className="flex items-center justify-between">
          <span className="etiqueta mb-0">
            Días no lectivos ({festivos.length})
          </span>
          <button className="btn-fantasma h-9 px-2 text-sm" onClick={() => setPegando(true)}>
            Pegar calendario
          </button>
        </div>

        <div className="mt-2 flex gap-2">
          <input
            type="date"
            className="campo cifra flex-1"
            value={nuevoDia}
            min={curso.inicio}
            max={curso.fin}
            onChange={(e) => setNuevoDia(e.target.value)}
            aria-label="Añadir día no lectivo"
          />
          <button className="btn-suave px-3" onClick={() => void anadirDia()} disabled={!nuevoDia}>
            <Plus size={18} aria-hidden />
          </button>
        </div>

        {festivos.length === 0 ? (
          <p className="mt-2 text-sm texto-suave">
            Sin días no lectivos. Pega el calendario del centro o añádelos uno a uno.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {festivos.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2 rounded-xl border border-borde bg-superficie px-3 py-2 text-sm dark:border-noche-borde dark:bg-noche-superficie"
              >
                <CalendarX2 size={16} className="shrink-0 text-aviso-oscuro" aria-hidden />
                <span className="cifra flex-1 truncate">{formatoLargo(f)}</span>
                <button
                  onClick={() => void quitarDia(f)}
                  className="flex min-h-tap min-w-tap items-center justify-center rounded-xl text-tinta-tenue
                             focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40"
                  aria-label={`Quitar ${f}`}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <HojaPegarCalendario
        abierta={pegando}
        curso={curso}
        onCerrar={() => setPegando(false)}
      />
    </div>
  )
}

function HojaPegarCalendario({
  abierta,
  curso,
  onCerrar,
}: {
  abierta: boolean
  curso: { id: string; inicio: string; fin: string; festivos: string[] }
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<ResultadoCalendario | null>(null)

  function analizar(valor: string) {
    setTexto(valor)
    setPrevia(valor.trim() ? parsearCalendario(valor, curso) : null)
  }

  async function aplicar(modo: 'anadir' | 'reemplazar') {
    if (!previa) return
    const previos = curso.festivos
    const nuevos =
      modo === 'reemplazar'
        ? previa.fechas
        : [...new Set([...previos, ...previa.fechas])].sort()

    await db.cursos.update(curso.id, { festivos: nuevos })
    setTexto('')
    setPrevia(null)
    onCerrar()
    mostrarAviso(`${nuevos.length} días no lectivos guardados`, async () => {
      await db.cursos.update(curso.id, { festivos: previos })
    })
  }

  return (
    <Hoja abierta={abierta} titulo="Pegar calendario escolar" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="cal-texto">
            Fechas y periodos
          </label>
          <textarea
            id="cal-texto"
            className="campo h-36 resize-none py-2 text-sm"
            value={texto}
            onChange={(e) => analizar(e.target.value)}
            placeholder={'23/12/2026 - 07/01/2027\n29/03/2027 a 02/04/2027\n12/10/2026\n01/05'}
          />
          <p className="mt-1 text-xs texto-suave">
            Una por línea o separadas por comas. Los periodos admiten «-», «a» o «hasta». Los
            sábados y domingos se descartan solos.
          </p>
        </div>

        {previa && (
          <div className="panel-agua space-y-1 text-sm">
            <p className="font-bold">{previa.fechas.length} días no lectivos detectados</p>
            {previa.finesDeSemanaOmitidos > 0 && (
              <p className="texto-suave">
                {previa.finesDeSemanaOmitidos} fines de semana omitidos.
              </p>
            )}
            {previa.fueraDeCurso.length > 0 && (
              <p className="texto-suave">
                {previa.fueraDeCurso.length} fuera del curso, descartados.
              </p>
            )}
            {previa.noReconocidos.length > 0 && (
              <p className="font-semibold text-acento">
                No entendidos: {previa.noReconocidos.slice(0, 3).join(' · ')}
                {previa.noReconocidos.length > 3 && ` y ${previa.noReconocidos.length - 3} más`}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn-suave"
            onClick={() => void aplicar('anadir')}
            disabled={!previa || previa.fechas.length === 0}
          >
            Añadir
          </button>
          <button
            className="btn-primario"
            onClick={() => void aplicar('reemplazar')}
            disabled={!previa || previa.fechas.length === 0}
          >
            Reemplazar
          </button>
        </div>
      </div>
    </Hoja>
  )
}
