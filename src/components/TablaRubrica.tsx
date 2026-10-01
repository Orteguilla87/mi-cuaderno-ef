import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { guardarValor, valorNormalizado } from '../db/cuaderno'
import { useConfig } from '../db/config'
import type {
  Alumno,
  AnchoColumnaAlumno,
  Columna,
  CriterioRubrica,
  FilaInstrumento,
  Rubrica,
  ValorCelda,
} from '../db/types'
import {
  anteriorEnRubrica,
  progresoRubrica,
  siguienteEnRubrica,
  trasMarcarRubrica,
  type ModoAvanceRubrica,
  type PosicionRubrica,
} from '../lib/avanceCalificacion'
import { formatearNombre } from '../lib/nombres'
import { useAvanceCalificacion } from '../store/avanceCalificacion'
import { useUI } from '../store/ui'
import { notaInstrumento } from '../lib/notas'
import { Hoja } from './Hoja'
import { LineaPlegable } from './LineaPlegable'

type Cambios = Parameters<typeof guardarValor>[2]

/** Umbral a partir del cual una descripción de nivel se pliega (§ Bloque 7). */
const LONGITUD_DESCRIPCION_PLEGABLE = 80

const ANCHO_COLUMNA_ALUMNO_PX: Record<AnchoColumnaAlumno, number> = {
  estrecha: 120,
  media: 156,
  ancha: 196,
}

/**
 * Única vista para calificar una rúbrica (§ Bloque 7): alumnado × criterios,
 * con el texto completo de cada criterio en cabecera y la nota calculada de
 * cada alumno en la última columna — el mismo motor que certifica el
 * trimestre. Tocar un círculo abre las opciones de ESE criterio (con su
 * descripción, si la tiene): nada de ciclar tocando repetidamente, que
 * obligaba a contar toques para saber en qué nivel se iba a quedar.
 */
export function TablaRubrica({
  columna,
  rubrica,
  filas,
  alumnos,
  valores,
  onCambiar,
  onCerrar,
}: {
  columna: Columna
  rubrica?: Rubrica
  filas: FilaInstrumento[]
  alumnos: Alumno[]
  valores: Map<string, ValorCelda>
  onCambiar: (columna: Columna, alumnoId: string, cambios: Cambios) => Promise<() => Promise<void>>
  onCerrar: () => void
}) {
  const config = useConfig()
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const avance = useAvanceCalificacion()
  const [editando, setEditando] = useState<(PosicionRubrica & { ancla: DOMRect }) | null>(null)
  const disparadorRef = useRef<HTMLButtonElement | null>(null)
  const tablaRef = useRef<HTMLTableElement>(null)

  if (!rubrica) return null
  const dims = { filas: alumnos.length, criterios: rubrica.criterios.length }

  const anchoColumnaAlumno = ANCHO_COLUMNA_ALUMNO_PX[config.anchoColumnaAlumno]

  /**
   * Abre el selector sobre otra celda. El ancla se mide en el DOM porque el
   * salto no viene de un toque: antes se trae la celda a la vista, que en
   * modo «siguiente alumno» suele quedar por debajo del borde.
   */
  function abrirCelda(pos: PosicionRubrica) {
    const boton = tablaRef.current?.querySelector<HTMLButtonElement>(
      `[data-celda="${pos.fila}:${pos.criterio}"]`,
    )
    if (!boton) return cerrarPopover()
    boton.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    disparadorRef.current = boton
    setEditando({ ...pos, ancla: boton.getBoundingClientRect() })
  }

  function elegirNivel(pos: PosicionRubrica, nivelId: string | undefined) {
    const alumnoId = alumnos[pos.fila].id
    const criterioId = rubrica!.criterios[pos.criterio].id
    const valor = valores.get(`${columna.id}|${alumnoId}`)
    const actual = valor?.rubrica?.[criterioId]
    const nuevo = { ...(valor?.rubrica ?? {}) }
    const quitando = nivelId === undefined || actual === nivelId
    if (quitando) delete nuevo[criterioId]
    else nuevo[criterioId] = nivelId
    // Se persiste en CADA marca, no al cerrar el recorrido: con el móvil en
    // la mano la pantalla puede bloquearse a mitad de la clase.
    void onCambiar(columna, alumnoId, { rubrica: nuevo })

    // Quitar una valoración es corregir, no calificar: no avanza.
    if (quitando) return cerrarPopover()
    const tras = trasMarcarRubrica(pos, dims, { activo: avance.activo, modo: avance.modoRubrica })
    if (tras.tipo === 'ir') return abrirCelda(tras.a)
    cerrarPopover()
    if (tras.tipo === 'fin')
      mostrarAviso(
        avance.modoRubrica === 'alumno'
          ? `Último alumno de «${rubrica!.criterios[pos.criterio].titulo}»: fin del recorrido`
          : `Último criterio de ${formatearNombre(alumnos[pos.fila], config.formatoNombre)}: fin del recorrido`,
      )
  }

  function cerrarPopover() {
    setEditando(null)
    disparadorRef.current?.focus()
  }

  // Media de cada criterio (pie de tabla): solo sobre quien tiene nivel
  // asignado. Contar a quien no se ha tocado todavía como un 0 acusaría de
  // suspenso a un criterio simplemente no evaluado aún.
  function mediaCriterio(criterioId: string): number | null {
    const puntuaciones = alumnos
      .map((a) => {
        const valor = valores.get(`${columna.id}|${a.id}`)
        const nivelId = valor?.rubrica?.[criterioId]
        return rubrica!.niveles.find((n) => n.id === nivelId)?.valor
      })
      .filter((v): v is number => v != null)
    if (puntuaciones.length === 0) return null
    return puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length
  }

  const editandoCriterio = editando ? rubrica.criterios[editando.criterio] : undefined
  const editandoAlumno = editando ? alumnos[editando.fila] : undefined
  // Atrás y «saltar» siguen el modo elegido; sin avance, recorren alumnos.
  const modoNavegacion: ModoAvanceRubrica = avance.activo ? avance.modoRubrica : 'alumno'

  return (
    <>
      <Hoja abierta titulo={columna.titulo} onCerrar={onCerrar}>
        <SelectorModoAvance
          activo={avance.activo}
          modo={avance.modoRubrica}
          onCambio={(m) => {
            if (m === 'no') return avance.fijarActivo(false)
            avance.fijarActivo(true)
            avance.fijarModoRubrica(m)
          }}
        />
        {/* Scroll propio en los dos ejes, como la rejilla del Cuaderno: sin
            él la fila de criterios no tiene contra qué quedarse fija. */}
        <div className="-mx-4 max-h-[60dvh] overflow-auto px-4 apaisado:max-h-[75dvh]">
          <table ref={tablaRef} className="w-max border-separate border-spacing-0">
            <caption className="sr-only">Rúbrica: alumnado por criterio, con la nota de cada uno</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  // El `!` gana al `style` en línea a propósito: girado, la
                  // columna de nombres se fija a 120 px pase lo que pase en
                  // Ajustes. Aquí solo hay un nombre truncado —los botones
                  // +/− son cosa del Cuaderno—, así que esos ~76 px de más
                  // solo servían para esconder un criterio.
                  className="sticky left-0 top-0 z-[3] border-b-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua apaisado:!w-[120px] apaisado:!min-w-[120px]"
                  style={{ minWidth: anchoColumnaAlumno, width: anchoColumnaAlumno }}
                >
                  Alumno
                </th>
                {rubrica.criterios.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    // Al girar, los criterios bajan de 140 a 112 px: con 4-6
                    // criterios es la diferencia entre verlos todos de un
                    // vistazo y tener que arrastrar la tabla para calificar.
                    className="min-w-[140px] max-w-[220px] border-b-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold leading-snug text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua sticky top-0 z-[2] apaisado:min-w-[112px] apaisado:max-w-[140px]"
                  >
                    {c.titulo}
                  </th>
                ))}
                <th
                  scope="col"
                  className="min-w-[72px] border-b-2 border-borde bg-agua-claro px-2 py-2 text-center text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua sticky top-0 z-[2]"
                >
                  Nota
                </th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map((a, fila) => {
                const valor = valores.get(`${columna.id}|${a.id}`)
                const resultado = notaInstrumento({ columna, filas, rubrica }, valor, valorNormalizado)
                const nombre = formatearNombre(a, config.formatoNombre)
                return (
                  <tr key={a.id} className={fila % 2 ? 'bg-agua-claro/30 dark:bg-noche-elevada/30' : ''}>
                    <th
                      scope="row"
                      className={
                        'sticky left-0 z-[1] border-b border-r border-borde px-2 py-2 text-left text-sm font-semibold dark:border-noche-borde apaisado:!w-[120px] apaisado:!min-w-[120px] ' +
                        (fila % 2
                          ? 'bg-[rgb(238,245,246)] dark:bg-noche-superficie'
                          : 'bg-superficie dark:bg-noche-superficie')
                      }
                      style={{ minWidth: anchoColumnaAlumno, width: anchoColumnaAlumno }}
                    >
                      <span className="block truncate">{nombre}</span>
                    </th>
                    {rubrica.criterios.map((c, ci) => {
                      const nivelId = valor?.rubrica?.[c.id]
                      const nivel = rubrica.niveles.find((n) => n.id === nivelId)
                      return (
                        <td key={c.id} className="border-b border-r border-borde p-0 dark:border-noche-borde">
                          <button
                            className="flex h-14 w-full items-center justify-center active:scale-95"
                            data-celda={`${fila}:${ci}`}
                            onClick={(e) => {
                              disparadorRef.current = e.currentTarget
                              setEditando({
                                fila,
                                criterio: ci,
                                ancla: e.currentTarget.getBoundingClientRect(),
                              })
                            }}
                            aria-haspopup="dialog"
                            aria-label={`${nombre}, ${c.titulo}: ${nivel ? `${nivel.etiqueta} (${nivel.valor})` : 'sin valorar'}`}
                          >
                            {nivel ? (
                              <span className="cifra flex h-9 w-9 items-center justify-center rounded-full bg-primario text-base font-bold text-white">
                                {nivel.valor}
                              </span>
                            ) : (
                              <span className="h-8 w-8 rounded-full border-2 border-dashed border-borde dark:border-noche-borde" />
                            )}
                          </button>
                        </td>
                      )
                    })}
                    <td className="border-b border-borde p-0 text-center dark:border-noche-borde">
                      <span className="cifra text-sm font-bold">
                        {resultado.valor == null ? '—' : resultado.valor.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] border-t-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua"
                >
                  Media
                </th>
                {rubrica.criterios.map((c) => {
                  const media = mediaCriterio(c.id)
                  return (
                    <td
                      key={c.id}
                      className="cifra border-t-2 border-r border-borde bg-agua-claro px-2 py-2 text-center text-sm font-bold text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua"
                    >
                      {media == null ? '—' : media.toFixed(1)}
                    </td>
                  )
                })}
                <td className="border-t-2 border-borde bg-agua-claro dark:border-noche-borde dark:bg-noche-elevada" />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs texto-suave">Toca un círculo para elegir el nivel de ese criterio.</p>
      </Hoja>

      {editando && editandoCriterio && editandoAlumno && (
        <SelectorNivel
          key={`${editando.fila}:${editando.criterio}`}
          niveles={rubrica.niveles}
          criterio={editandoCriterio}
          nivelActualId={valores.get(`${columna.id}|${editandoAlumno.id}`)?.rubrica?.[editandoCriterio.id]}
          ancla={editando.ancla}
          etiqueta={`${formatearNombre(editandoAlumno, config.formatoNombre)}, ${editandoCriterio.titulo}`}
          progreso={progresoRubrica(editando, dims, modoNavegacion)}
          onElegir={(nivelId) => elegirNivel(editando, nivelId)}
          onAnterior={(() => {
            const p = anteriorEnRubrica(editando, modoNavegacion)
            return p ? () => abrirCelda(p) : undefined
          })()}
          onSaltar={(() => {
            // Saltar no escribe nada: la celda se queda SIN dato, que no es un 0.
            const p = siguienteEnRubrica(editando, dims, modoNavegacion)
            return p ? () => abrirCelda(p) : undefined
          })()}
          onCerrar={cerrarPopover}
        />
      )}
    </>
  )
}

/**
 * Opciones de nivel de un criterio, ancladas al círculo tocado. Vive por
 * encima de la propia hoja de la tabla (`z-modal`, no `z-hoja`): si usara la
 * misma capa que la hoja, tocar fuera del panel cerraría la tabla entera en
 * vez de solo estas opciones.
 */
function SelectorNivel({
  niveles,
  criterio,
  nivelActualId,
  ancla,
  etiqueta,
  progreso,
  onElegir,
  onAnterior,
  onSaltar,
  onCerrar,
}: {
  niveles: Rubrica['niveles']
  criterio: CriterioRubrica
  nivelActualId: string | undefined
  ancla: DOMRect
  etiqueta: string
  progreso: { actual: number; total: number }
  onElegir: (nivelId: string | undefined) => void
  /** Ausentes en el borde: no se da la vuelta. */
  onAnterior?: () => void
  onSaltar?: () => void
  onCerrar: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current?.getBoundingClientRect()
    if (!panel) return
    const margen = 8
    let left = ancla.left + ancla.width / 2 - panel.width / 2
    left = Math.max(margen, Math.min(left, window.innerWidth - panel.width - margen))
    let top = ancla.bottom + 6
    if (top + panel.height > window.innerHeight - margen) top = ancla.top - panel.height - 6
    setCoord({ top: Math.max(margen, top), left })
  }, [ancla])

  useEffect(() => {
    const alPulsarTecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alPulsarTecla)
    return () => window.removeEventListener('keydown', alPulsarTecla)
  }, [onCerrar])

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])

  return (
    <>
      <button
        className="fixed inset-0 z-modal cursor-default"
        aria-label="Cerrar selector de nivel"
        onClick={onCerrar}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        style={{ top: coord?.top ?? 0, left: coord?.left ?? 0, visibility: coord ? 'visible' : 'hidden' }}
        className="fixed z-modal w-[min(92vw,320px)] space-y-1.5 rounded-xl2 border border-borde bg-superficie p-2 shadow-xl dark:border-noche-borde dark:bg-noche-superficie"
      >
        <div className="flex items-center gap-1">
          <button
            onClick={onAnterior}
            disabled={!onAnterior}
            aria-label="Anterior"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-primario disabled:opacity-30 dark:text-agua"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-xs font-semibold">{etiqueta}</p>
            <p className="cifra text-xs texto-suave">
              {progreso.actual} / {progreso.total}
            </p>
          </div>
          <button
            onClick={onSaltar}
            disabled={!onSaltar}
            aria-label="Saltar sin valorar"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-primario disabled:opacity-30 dark:text-agua"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>
        {niveles.map((n) => {
          const activo = n.id === nivelActualId
          const descripcion = criterio.descripciones?.[n.id]
          return (
            <button
              key={n.id}
              onClick={() => onElegir(n.id)}
              aria-pressed={activo}
              className={
                'flex w-full items-start gap-2 rounded-xl border-2 p-2 text-left transition active:scale-[0.99] ' +
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                (activo
                  ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
                  : 'border-borde hover:bg-agua-claro dark:border-noche-borde dark:hover:bg-noche-elevada')
              }
            >
              <span className="cifra flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primario text-sm font-bold text-white">
                {n.valor}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{n.etiqueta}</span>
                {descripcion &&
                  (descripcion.length > LONGITUD_DESCRIPCION_PLEGABLE ? (
                    <LineaPlegable texto={descripcion} textoClassName="text-xs texto-suave" />
                  ) : (
                    <span className="block text-xs texto-suave">{descripcion}</span>
                  ))}
              </span>
            </button>
          )
        })}
        {nivelActualId != null && (
          <button
            onClick={() => onElegir(undefined)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-tinta-tenue transition hover:bg-agua-claro
                       focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 dark:hover:bg-noche-elevada"
          >
            <X size={16} aria-hidden />
            Quitar valoración
          </button>
        )}
      </div>
    </>
  )
}

/**
 * Qué hacer tras marcar un nivel (2.1). Visible en la propia vista, porque se
 * cambia según cómo se esté calificando ese día; y recordado entre sesiones.
 */
function SelectorModoAvance({
  activo,
  modo,
  onCambio,
}: {
  activo: boolean
  modo: ModoAvanceRubrica
  onCambio: (m: ModoAvanceRubrica | 'no') => void
}) {
  const actual = activo ? modo : 'no'
  const opciones: { valor: ModoAvanceRubrica | 'no'; etiqueta: string }[] = [
    { valor: 'criterio', etiqueta: 'Siguiente criterio' },
    { valor: 'alumno', etiqueta: 'Siguiente alumno' },
    { valor: 'no', etiqueta: 'No avanzar' },
  ]
  return (
    <div className="mb-3">
      <span className="etiqueta">Tras marcar</span>
      <div role="radiogroup" aria-label="Tras marcar un nivel" className="grid grid-cols-3 gap-1.5">
        {opciones.map((o) => (
          <button
            key={o.valor}
            role="radio"
            aria-checked={actual === o.valor}
            onClick={() => onCambio(o.valor)}
            className={
              'min-h-tap rounded-xl px-2 text-xs font-semibold transition ' +
              (actual === o.valor
                ? 'bg-primario text-white'
                : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
            }
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}
