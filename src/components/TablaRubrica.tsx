import { X } from 'lucide-react'
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
import { formatearNombre } from '../lib/nombres'
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
  const [editando, setEditando] = useState<{
    alumnoId: string
    criterioId: string
    ancla: DOMRect
  } | null>(null)
  const disparadorRef = useRef<HTMLButtonElement | null>(null)

  if (!rubrica) return null

  const anchoColumnaAlumno = ANCHO_COLUMNA_ALUMNO_PX[config.anchoColumnaAlumno]

  function elegirNivel(alumnoId: string, criterioId: string, nivelId: string | undefined) {
    const valor = valores.get(`${columna.id}|${alumnoId}`)
    const actual = valor?.rubrica?.[criterioId]
    const nuevo = { ...(valor?.rubrica ?? {}) }
    if (nivelId === undefined || actual === nivelId) delete nuevo[criterioId]
    else nuevo[criterioId] = nivelId
    void onCambiar(columna, alumnoId, { rubrica: nuevo })
    cerrarPopover()
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

  const editandoCriterio = editando ? rubrica.criterios.find((c) => c.id === editando.criterioId) : undefined
  const editandoAlumno = editando ? alumnos.find((a) => a.id === editando.alumnoId) : undefined

  return (
    <>
      <Hoja abierta titulo={columna.titulo} onCerrar={onCerrar}>
        <div className="-mx-4 overflow-x-auto px-4 max-lg:landscape:max-h-[75dvh] max-lg:landscape:overflow-y-auto">
          <table className="w-max border-separate border-spacing-0">
            <caption className="sr-only">Rúbrica: alumnado por criterio, con la nota de cada uno</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-20 border-b-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua max-lg:landscape:top-0 lg:top-0"
                  style={{ minWidth: anchoColumnaAlumno, width: anchoColumnaAlumno }}
                >
                  Alumno
                </th>
                {rubrica.criterios.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className="min-w-[140px] max-w-[220px] border-b-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold leading-snug text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua max-lg:landscape:sticky max-lg:landscape:top-0 max-lg:landscape:z-10 lg:sticky lg:top-0 lg:z-10"
                  >
                    {c.titulo}
                  </th>
                ))}
                <th
                  scope="col"
                  className="min-w-[72px] border-b-2 border-borde bg-agua-claro px-2 py-2 text-center text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua max-lg:landscape:sticky max-lg:landscape:top-0 max-lg:landscape:z-10 lg:sticky lg:top-0 lg:z-10"
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
                        'sticky left-0 z-10 border-b border-r border-borde px-2 py-2 text-left text-sm font-semibold dark:border-noche-borde ' +
                        (fila % 2
                          ? 'bg-[rgb(238,245,246)] dark:bg-noche-superficie'
                          : 'bg-superficie dark:bg-noche-superficie')
                      }
                      style={{ minWidth: anchoColumnaAlumno, width: anchoColumnaAlumno }}
                    >
                      <span className="block truncate">{nombre}</span>
                    </th>
                    {rubrica.criterios.map((c) => {
                      const nivelId = valor?.rubrica?.[c.id]
                      const nivel = rubrica.niveles.find((n) => n.id === nivelId)
                      return (
                        <td key={c.id} className="border-b border-r border-borde p-0 dark:border-noche-borde">
                          <button
                            className="flex h-14 w-full items-center justify-center active:scale-95"
                            onClick={(e) => {
                              disparadorRef.current = e.currentTarget
                              setEditando({
                                alumnoId: a.id,
                                criterioId: c.id,
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
                  className="sticky left-0 border-t-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua"
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
          niveles={rubrica.niveles}
          criterio={editandoCriterio}
          nivelActualId={valores.get(`${columna.id}|${editando.alumnoId}`)?.rubrica?.[editando.criterioId]}
          ancla={editando.ancla}
          etiqueta={`${formatearNombre(editandoAlumno, config.formatoNombre)}, ${editandoCriterio.titulo}`}
          onElegir={(nivelId) => elegirNivel(editando.alumnoId, editando.criterioId, nivelId)}
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
  onElegir,
  onCerrar,
}: {
  niveles: Rubrica['niveles']
  criterio: CriterioRubrica
  nivelActualId: string | undefined
  ancla: DOMRect
  etiqueta: string
  onElegir: (nivelId: string | undefined) => void
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
