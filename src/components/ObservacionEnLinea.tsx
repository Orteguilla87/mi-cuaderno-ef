import { Circle, Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { editarObservacion, eliminarObservacion } from '../db/observaciones'
import type { Observacion, SignoObservacion, TipoObservacion } from '../db/types'
import { formatoCorto } from '../lib/fechas'
import { useUI } from '../store/ui'
import { HojaConfirmar } from './HojaConfirmar'

/**
 * Edición de observaciones EN LA PROPIA LISTA, sin abrir otra pantalla ni
 * entrar en un modo «editar»: se toca el texto y ya es un campo.
 *
 * POR QUÉ UN COMPONENTE APARTE Y NO UNA PROP EN LA LISTA GENERAL: la timeline
 * de «Observaciones» y la vista de grupo enseñan las mismas observaciones en
 * pantallas que se proyectan o se recorren con el dedo, donde un toque que
 * abre un campo de texto es un accidente esperando. Un interruptor opcional se
 * enciende por descuido; un componente distinto, no. Además exige el contexto
 * de forma literal (`contexto="ficha-alumno"`), así que llevarlo a otra vista
 * no compila.
 */
export type ContextoEdicion = 'ficha-alumno'

const SIGNOS: {
  valor: SignoObservacion
  etiqueta: string
  Icono: typeof Plus
  clase: string
}[] = [
  { valor: '+', etiqueta: 'Positiva', Icono: Plus, clase: 'bg-lima-oscuro text-white' },
  { valor: 'neutro', etiqueta: 'Neutra', Icono: Circle, clase: 'bg-agua text-primario-oscuro' },
  { valor: '-', etiqueta: 'Negativa', Icono: Minus, clase: 'bg-acento text-white' },
]

const TIPOS: { valor: TipoObservacion; etiqueta: string }[] = [
  { valor: 'conducta', etiqueta: 'Conducta' },
  { valor: 'aprendizaje', etiqueta: 'Aprendizaje' },
  { valor: 'salud', etiqueta: 'Salud' },
  // Aparte de «Salud» a propósito: es la que se cruza con la etiqueta
  // «Lesionado» (`db/etiquetasAlumno.ts`). La observación es el registro
  // histórico; la etiqueta, el estado de hoy.
  { valor: 'lesion', etiqueta: 'Lesión' },
  { valor: 'otro', etiqueta: 'Otro' },
]

export function ListaObservacionesEnLinea({
  observaciones,
  contexto,
  grupoPropio,
  nombresGrupo,
}: {
  observaciones: Observacion[]
  /** Literal, no booleano: la edición en línea es de la ficha del alumno. */
  contexto: ContextoEdicion
  /**
   * El grupo de la ficha que se está mirando. Las observaciones de OTRO grupo
   * —las de la otra área de una persona con las fichas vinculadas— se ven, pero
   * en lectura: se editan desde la ficha de ese grupo y en ningún otro sitio.
   * Así el registro se toca donde se tomó, con su contexto delante.
   */
  grupoPropio: string
  /** id → nombre, para el distintivo de cada fila. */
  nombresGrupo: Map<string, string>
}) {
  if (contexto !== 'ficha-alumno') return null
  return (
    <ul className="space-y-2">
      {observaciones.map((o) =>
        o.grupoId === grupoPropio ? (
          <FilaObservacion key={o.id} observacion={o} />
        ) : (
          <FilaAjena key={o.id} observacion={o} grupo={nombresGrupo.get(o.grupoId)} />
        ),
      )}
    </ul>
  )
}

/**
 * Una observación de OTRA de las fichas de la misma persona: de la otra área.
 *
 * Se enseña porque el niño es uno y saber que en Lengua lleva tres semanas
 * revuelto explica lo que pasa en EF. No se edita ni se borra desde aquí —hay
 * que ir a la ficha de ese grupo— y, sobre todo, NO cuenta para el balance de
 * este grupo: los contadores salen de `contadoresPorAlumno(grupoId)`, que
 * consulta por grupo y no ve nada de esto.
 *
 * El distintivo es el nombre del grupo escrito, no un color: hay que poder leer
 * de dónde viene sin interpretar una tonalidad.
 */
function FilaAjena({ observacion: o, grupo }: { observacion: Observacion; grupo?: string }) {
  const signo = SIGNOS.find((s) => s.valor === o.signo)
  const tipo = TIPOS.find((t) => t.valor === o.tipo)

  return (
    <li className="tarjeta border-dashed py-3 opacity-90">
      <div className="flex items-center gap-2">
        {signo && (
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${signo.clase}`}
            aria-hidden
          >
            <signo.Icono size={16} strokeWidth={3} />
          </span>
        )}
        <span className="pildora bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
          {grupo ?? 'Otro grupo'}
        </span>
        <span className="cifra ml-auto shrink-0 text-sm texto-suave">{formatoCorto(o.fecha)}</span>
      </div>

      <p className="mt-2 px-1">{o.texto}</p>

      <p className="mt-2 text-xs texto-suave">
        {signo?.etiqueta}
        {tipo ? ` · ${tipo.etiqueta}` : ''} · Se edita desde la ficha de{' '}
        {grupo ?? 'ese grupo'}, y no cuenta en el balance de este.
      </p>
    </li>
  )
}

function FilaObservacion({ observacion: o }: { observacion: Observacion }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(o.texto)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  // Escape revierte: la salida del campo que dispara el guardado no puede
  // distinguir «he terminado» de «he cancelado», así que lo dice esta bandera.
  const cancelado = useRef(false)
  const area = useRef<HTMLTextAreaElement>(null)

  // Si la observación cambia por debajo (otra pestaña, una sincronización), el
  // borrador se pone al día mientras no se esté escribiendo en él.
  useEffect(() => {
    if (!editando) setBorrador(o.texto)
  }, [o.texto, editando])

  useEffect(() => {
    if (!editando) return
    const el = area.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editando])

  async function guardarTexto() {
    setEditando(false)
    if (cancelado.current) {
      cancelado.current = false
      setBorrador(o.texto)
      return
    }
    const texto = borrador.trim()
    if (texto === o.texto.trim()) return
    // Vaciar el texto no borra la observación: para eso está la papelera.
    if (!texto) {
      setBorrador(o.texto)
      return
    }
    const { deshacer } = await editarObservacion(o.id, { texto })
    mostrarAviso('Observación editada', deshacer)
  }

  async function cambiar(cambios: { signo?: SignoObservacion; tipo?: TipoObservacion }) {
    const { deshacer } = await editarObservacion(o.id, cambios)
    mostrarAviso(cambios.signo ? 'Signo cambiado' : 'Categoría cambiada', deshacer)
  }

  async function eliminar() {
    setConfirmandoBorrado(false)
    const { deshacer } = await eliminarObservacion(o.id)
    mostrarAviso('Observación eliminada', deshacer)
  }

  return (
    <li className="tarjeta py-3">
      <div className="flex items-center gap-2">
        {/* Signo: tres objetivos de 48 px, separados de la papelera por el
            hueco flexible del centro. No se pueden confundir de un dedazo. */}
        <div className="flex items-center gap-1" role="group" aria-label="Signo de la observación">
          {SIGNOS.map(({ valor, etiqueta, Icono, clase }) => (
            <button
              key={valor}
              onClick={() => void cambiar({ signo: valor })}
              aria-pressed={o.signo === valor}
              aria-label={etiqueta}
              className={
                'flex min-h-tap min-w-tap items-center justify-center rounded-xl transition ' +
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                (o.signo === valor ? 'bg-agua-claro dark:bg-noche-elevada' : '')
              }
            >
              <span
                className={
                  'flex h-7 w-7 items-center justify-center rounded-full ' +
                  (o.signo === valor ? clase : 'bg-agua-claro/60 text-tinta-tenue dark:bg-noche-elevada')
                }
              >
                <Icono size={16} strokeWidth={3} aria-hidden />
              </span>
            </button>
          ))}
        </div>

        <span className="cifra ml-auto shrink-0 text-sm texto-suave">{formatoCorto(o.fecha)}</span>

        <button
          onClick={() => setConfirmandoBorrado(true)}
          aria-label="Eliminar observación"
          className="flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl text-tinta-tenue transition
                     focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-acento/40"
        >
          <Trash2 size={18} aria-hidden />
        </button>
      </div>

      {editando ? (
        <textarea
          ref={area}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={() => void guardarTexto()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              cancelado.current = true
              e.currentTarget.blur()
            }
          }}
          aria-label="Texto de la observación"
          className="campo mt-2 h-24 resize-none py-2"
        />
      ) : (
        // El texto ENTERO es el objetivo, no un lápiz de 20 px al lado: en
        // móvil el propio párrafo es el área táctil más cómoda que hay.
        <button
          onClick={() => setEditando(true)}
          className="mt-2 w-full rounded-xl px-1 py-1 text-left transition
                     focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40"
        >
          {o.texto || <span className="texto-suave">Sin texto. Toca para escribirlo.</span>}
        </button>
      )}

      {/* Categoría: qué clase de observación es. Debajo del texto para que la
          fila de arriba no se llene de objetivos táctiles pegados. */}
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Categoría">
        {TIPOS.map(({ valor, etiqueta }) => (
          <button
            key={valor}
            onClick={() => void cambiar({ tipo: valor })}
            aria-pressed={o.tipo === valor}
            className={
              'pildora min-h-[40px] px-3 text-xs transition ' +
              (o.tipo === valor
                ? 'bg-primario text-white'
                : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
            }
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {editando && (
        <div className="mt-2 flex justify-end">
          {/* Guardar no hace falta —basta con salir del campo—, pero cancelar
              sí: en móvil no hay tecla Escape. */}
          <button
            // `onMouseDown`/`onTouchStart`: el `blur` del textarea llega antes
            // que el `click`, y para entonces ya se habría guardado.
            onMouseDown={() => {
              cancelado.current = true
            }}
            onTouchStart={() => {
              cancelado.current = true
            }}
            onClick={() => setEditando(false)}
            className="btn-suave px-4 text-xs"
          >
            Cancelar
          </button>
        </div>
      )}

      <HojaConfirmar
        abierta={confirmandoBorrado}
        titulo="Eliminar observación"
        descripcion={`¿Eliminar «${o.texto.slice(0, 60)}${o.texto.length > 60 ? '…' : ''}»? Se puede deshacer.`}
        textoConfirmar="Eliminar"
        onConfirmar={eliminar}
        onCerrar={() => setConfirmandoBorrado(false)}
      />
    </li>
  )
}
