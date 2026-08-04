import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck2, CalendarX2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db } from '../db/db'
import { leerCursoActivo } from '../db/curso'
import {
  eliminarSesionesNoLectivas,
  reubicarSesionesNoLectivas,
  sesionesEnDiasNoLectivos,
} from '../db/sesiones'
import type { CursoEscolar, PeriodoNoLectivo, Trimestre } from '../db/types'
import { parsearCalendario, type ResultadoCalendario } from '../lib/calendarioEscolar'
import { formatoLargo } from '../lib/fechas'
import { useUI } from '../store/ui'
import { Campo, CampoArea } from './Campo'
import { Hoja } from './Hoja'

const NUMEROS_TRIMESTRE: Trimestre[] = [1, 2, 3]

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

  const trimestreDe = (n: Trimestre) => curso.trimestres.find((t) => t.n === n)

  function actualizarTrimestre(n: Trimestre, campo: 'inicio' | 'fin', valor: string) {
    const trimestres = NUMEROS_TRIMESTRE.map((num) => {
      const actual = trimestreDe(num) ?? { n: num, inicio: '', fin: '' }
      return num === n ? { ...actual, [campo]: valor } : actual
    })
    actualizar({ trimestres })
  }

  return (
    <div className="space-y-4">
      {curso.calendarioPendienteConfirmar && (
        <div className="aviso flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1">
            Calendario precargado de la Comunidad de Madrid para 2026-2027, pendiente de confirmar
            con tu centro.
          </span>
          <button
            className="btn-suave shrink-0 text-xs"
            onClick={() => actualizar({ calendarioPendienteConfirmar: false })}
          >
            <CalendarCheck2 size={16} aria-hidden />
            Confirmar
          </button>
        </div>
      )}

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
        <span className="etiqueta">Trimestres</span>
        <div className="space-y-3">
          {NUMEROS_TRIMESTRE.map((n) => {
            const t = trimestreDe(n)
            return (
              // Etiqueta encima y las dos fechas en su propia fila (§ Bloque 5
              // aplicado aquí también): un input de fecha nativo no encoge lo
              // bastante para caber tres en una fila a 360px sin desbordar.
              <div key={n}>
                <span className="cifra mb-1 block text-xs font-bold texto-suave">{n}.º trimestre</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="campo cifra"
                    aria-label={`Inicio del ${n}.º trimestre`}
                    value={t?.inicio ?? ''}
                    onChange={(e) => actualizarTrimestre(n, 'inicio', e.target.value)}
                  />
                  <input
                    type="date"
                    className="campo cifra"
                    aria-label={`Fin del ${n}.º trimestre`}
                    value={t?.fin ?? ''}
                    onChange={(e) => actualizarTrimestre(n, 'fin', e.target.value)}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-1 text-xs texto-suave">
          El trimestre de una sesión se deduce de su fecha. Un hueco entre trimestres (Navidad,
          Semana Santa…) cuenta como no lectivo aunque no le pongas un periodo con nombre abajo.
        </p>
      </div>

      <PeriodosNoLectivosEditor curso={curso} />

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

      <SesionesNoLectivasAviso />

      <HojaPegarCalendario
        abierta={pegando}
        curso={curso}
        onCerrar={() => setPegando(false)}
      />
    </div>
  )
}

/**
 * Sesiones ya guardadas cuya fecha cayó en festivo o periodo tras configurar
 * el calendario (§ Bloque 8.4): nunca se tocan solas. Se listan aquí y el
 * usuario decide, en bloque, reubicarlas a la siguiente clase libre o
 * eliminarlas.
 */
function SesionesNoLectivasAviso() {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const huerfanas = useLiveQuery(() => sesionesEnDiasNoLectivos(), [])

  if (!huerfanas || huerfanas.length === 0) return null

  async function reubicarTodas() {
    const ids = (huerfanas ?? []).map((h) => h.sesion.id)
    const { reubicadas, sinHueco, deshacer } = await reubicarSesionesNoLectivas(ids)
    mostrarAviso(
      sinHueco > 0
        ? `${reubicadas} reubicadas, ${sinHueco} sin hueco libre`
        : `${reubicadas} sesiones reubicadas`,
      deshacer,
    )
  }

  async function eliminarTodas() {
    const ids = (huerfanas ?? []).map((h) => h.sesion.id)
    const { eliminadas, deshacer } = await eliminarSesionesNoLectivas(ids)
    mostrarAviso(`${eliminadas} sesiones eliminadas`, deshacer)
  }

  return (
    <div className="aviso-fuerte space-y-2">
      <p className="font-bold">
        {huerfanas.length} {huerfanas.length === 1 ? 'sesión guardada cae' : 'sesiones guardadas caen'}{' '}
        en día no lectivo
      </p>
      <p>
        El calendario cambió después de crearlas. Siguen guardadas tal cual; tú decides qué hacer.
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {huerfanas.map(({ sesion, grupo, estado }) => (
          <li
            key={sesion.id}
            className="rounded-xl border border-acento/30 bg-white px-3 py-2 text-sm dark:bg-noche-superficie"
          >
            <span className="cifra font-semibold">{formatoLargo(sesion.fecha)}</span>
            {' · '}
            {grupo?.nombre ?? 'Grupo eliminado'}
            {sesion.titulo && ` · ${sesion.titulo}`}
            <span className="block text-xs texto-suave">
              {estado.tipo === 'periodo' ? estado.nombre : estado.tipo === 'festivo' ? 'Día festivo' : 'Vacaciones'}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-suave" onClick={() => void reubicarTodas()}>
          Reubicar todas
        </button>
        <button className="btn-peligro" onClick={() => void eliminarTodas()}>
          Eliminar todas
        </button>
      </div>
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
          <CampoArea
            id="cal-texto"
            className="campo h-36 resize-none py-2 text-sm"
            valor={texto}
            onValor={analizar}
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

/**
 * Rangos con nombre (Navidad, Semana Santa…), distintos de los días sueltos de
 * arriba: un periodo entero se marca con un solo motivo en vez de listar cada
 * día por separado (§ Bloque 7.1).
 */
function PeriodosNoLectivosEditor({ curso }: { curso: CursoEscolar }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nombre, setNombre] = useState('')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')

  const periodos = [...curso.periodosNoLectivos].sort((a, b) => a.inicio.localeCompare(b.inicio))
  const rangoInvalido = !!inicio && !!fin && fin < inicio

  async function anadir() {
    if (!nombre.trim() || !inicio || !fin || rangoInvalido) return
    const nuevo: PeriodoNoLectivo = { nombre: nombre.trim(), inicio, fin }
    await db.cursos.update(curso.id, { periodosNoLectivos: [...curso.periodosNoLectivos, nuevo] })
    setNombre('')
    setInicio('')
    setFin('')
  }

  async function quitar(indice: number) {
    const previos = curso.periodosNoLectivos
    const quitado = periodos[indice]
    const nuevos = previos.filter((p) => p !== quitado)
    await db.cursos.update(curso.id, { periodosNoLectivos: nuevos })
    mostrarAviso(`«${quitado.nombre}» quitado`, async () => {
      await db.cursos.update(curso.id, { periodosNoLectivos: previos })
    })
  }

  return (
    <div>
      <span className="etiqueta">Periodos no lectivos ({periodos.length})</span>

      {periodos.length === 0 ? (
        <p className="mb-2 text-sm texto-suave">
          Sin periodos con nombre todavía. Añade Navidad, Semana Santa o los que marque tu centro.
        </p>
      ) : (
        <ul className="mb-2 space-y-1">
          {periodos.map((p, i) => (
            <li
              key={`${p.nombre}-${p.inicio}`}
              className="flex items-center gap-2 rounded-xl border border-borde bg-white px-3 py-2 text-sm dark:border-noche-borde dark:bg-noche-superficie"
            >
              <CalendarX2 size={16} className="shrink-0 text-aviso-oscuro" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.nombre}</span>
                <span className="cifra block text-xs texto-suave">
                  {formatoLargo(p.inicio)} – {formatoLargo(p.fin)}
                </span>
              </span>
              <button
                onClick={() => void quitar(i)}
                className="flex min-h-tap min-w-tap items-center justify-center rounded-xl text-tinta-tenue
                           focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40"
                aria-label={`Quitar ${p.nombre}`}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Campo
          className="campo"
          valor={nombre}
          onValor={setNombre}
          placeholder="Vacaciones de Navidad"
          aria-label="Nombre del periodo"
        />
        {/* Las dos fechas en su propia fila y el botón debajo, a todo lo
            ancho (igual que los trimestres): tres controles de fecha nativos
            no caben en una sola fila a 360px sin desbordar. */}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            className="campo cifra"
            value={inicio}
            min={curso.inicio}
            max={curso.fin}
            onChange={(e) => setInicio(e.target.value)}
            aria-label="Inicio del periodo"
          />
          <input
            type="date"
            className="campo cifra"
            value={fin}
            min={curso.inicio}
            max={curso.fin}
            onChange={(e) => setFin(e.target.value)}
            aria-label="Fin del periodo"
          />
        </div>
        {rangoInvalido && (
          <p className="text-sm font-semibold text-acento">El fin debe ser posterior al inicio.</p>
        )}
        <button
          className="btn-suave w-full"
          onClick={() => void anadir()}
          disabled={!nombre.trim() || !inicio || !fin || rangoInvalido}
        >
          <Plus size={18} aria-hidden />
          Añadir periodo
        </button>
      </div>
    </div>
  )
}
