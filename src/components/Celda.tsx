import { Check, ChevronLeft, ChevronRight, Delete, Minus, Plus, X } from 'lucide-react'
import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import type { ResultadoCalculo } from '../db/cuaderno'
import { aplicarAGrupo, contarDestinatarios, guardarValor } from '../db/cuaderno'
import type { Alumno, Columna, Rubrica, ValorCelda } from '../db/types'
import { useUI } from '../store/ui'
import { Campo, CampoArea } from './Campo'
import { Hoja } from './Hoja'

/**
 * Caritas por nivel. Se dibujan con SVG propio y no con emojis: los emojis
 * cambian de forma en cada plataforma y §3 los prohíbe como iconografía.
 */
export const CARITAS = [
  { etiqueta: 'Le cuesta', color: 'text-acento', boca: 'M 7 15 Q 10 12 13 15' },
  { etiqueta: 'Regular', color: 'text-aviso-oscuro', boca: 'M 7 14 L 13 14' },
  { etiqueta: 'Bien', color: 'text-lima-oscuro', boca: 'M 7 13 Q 10 16 13 13' },
] as const

const CARITAS_5 = [
  { etiqueta: 'Muy poco', color: 'text-acento', boca: 'M 7 15 Q 10 11 13 15' },
  { etiqueta: 'Poco', color: 'text-acento', boca: 'M 7 15 Q 10 13 13 15' },
  { etiqueta: 'Regular', color: 'text-aviso-oscuro', boca: 'M 7 14 L 13 14' },
  { etiqueta: 'Bien', color: 'text-lima-oscuro', boca: 'M 7 13 Q 10 15 13 13' },
  { etiqueta: 'Muy bien', color: 'text-lima-oscuro', boca: 'M 7 13 Q 10 17 13 13' },
] as const

export function escalaCaritas(niveles: 3 | 5) {
  return niveles === 5 ? CARITAS_5 : CARITAS
}

function Carita({ boca, className }: { boca: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} width="26" height="26" aria-hidden>
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="8" r="1.1" fill="currentColor" />
      <circle cx="13" cy="8" r="1.1" fill="currentColor" />
      <path d={boca} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

type Cambios = Parameters<typeof guardarValor>[2]

/**
 * Clase base de toda celda pulsable de la rejilla: altura y centrado comunes.
 * El anillo de foco va `ring-inset`: la celda vive pegada a sus vecinas sin
 * espacio para un anillo exterior sin recortarse contra la siguiente.
 */
const CLASE_CELDA =
  'flex h-14 w-full items-center justify-center text-sm font-bold transition active:scale-95 ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primario/40'

/**
 * Celda de caritas con selector, en vez de ciclar por toque.
 *
 * Ciclar obligaba a tocar a ciegas hasta dar con la carita buscada. Ahora un
 * toque abre una hoja pequeña con TODAS las caritas visibles y se fija la que se
 * pulse. Se cierra sola al elegir, al tocar fuera o con Escape.
 *
 * El panel va en `position: fixed` anclado al rectángulo de la celda, no en
 * `absolute` dentro del `<td>`: la rejilla vive en un contenedor con
 * `overflow-x-auto` que recortaría un popover interno.
 */
function SelectorCaritas({
  escala,
  indice,
  etiquetaCelda,
  onElegir,
}: {
  escala: ReturnType<typeof escalaCaritas>
  indice: number | undefined
  etiquetaCelda: string
  onElegir: (indice: number | undefined) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const anclaRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null)

  const actual = indice != null ? escala[indice] : null

  // Posición: medida tras montar el panel y ajustada al viewport, para que una
  // celda del borde derecho no lo empuje fuera de pantalla.
  useLayoutEffect(() => {
    if (!abierto) return
    const ancla = anclaRef.current?.getBoundingClientRect()
    const panel = panelRef.current?.getBoundingClientRect()
    if (!ancla || !panel) return
    const margen = 8
    let left = ancla.left + ancla.width / 2 - panel.width / 2
    left = Math.max(margen, Math.min(left, window.innerWidth - panel.width - margen))
    // Debajo de la celda; si no cabe, encima.
    let top = ancla.bottom + 6
    if (top + panel.height > window.innerHeight - margen) top = ancla.top - panel.height - 6
    setCoord({ top: Math.max(margen, top), left })
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const alPulsarTecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    window.addEventListener('keydown', alPulsarTecla)
    return () => window.removeEventListener('keydown', alPulsarTecla)
  }, [abierto])

  // Foco inicial dentro del panel y restauración al anclaje al cerrar: es un
  // diálogo modal (aria-modal), así que debe comportarse como tal con teclado.
  useEffect(() => {
    if (!abierto) return
    const primera = panelRef.current?.querySelector<HTMLElement>('button')
    primera?.focus()
    return () => anclaRef.current?.focus()
  }, [abierto])

  function elegir(i: number | undefined) {
    onElegir(i)
    setAbierto(false)
  }

  return (
    <>
      <button
        ref={anclaRef}
        className={CLASE_CELDA}
        onClick={() => {
          setCoord(null)
          setAbierto(true)
        }}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`${etiquetaCelda}: ${actual?.etiqueta ?? 'sin valorar'}`}
      >
        {actual ? (
          <Carita boca={actual.boca} className={actual.color} />
        ) : (
          <span className="h-7 w-7 rounded-full border-2 border-dashed border-borde dark:border-noche-borde" />
        )}
      </button>

      {abierto && (
        <>
          {/* Fondo a pantalla completa: recoge el toque fuera para cerrar. */}
          <button
            className="fixed inset-0 z-fab cursor-default"
            aria-label="Cerrar selector"
            onClick={() => setAbierto(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={etiquetaCelda}
            style={{
              top: coord?.top ?? 0,
              left: coord?.left ?? 0,
              visibility: coord ? 'visible' : 'hidden',
            }}
            className="fixed z-hoja flex max-w-[92vw] flex-wrap items-start justify-center gap-1 rounded-xl2 border border-borde bg-superficie p-2 shadow-xl dark:border-noche-borde dark:bg-noche-superficie"
          >
            {escala.map((c, i) => {
              const activo = i === indice
              return (
                <button
                  key={i}
                  onClick={() => elegir(i)}
                  aria-pressed={activo}
                  className={
                    'opcion-carita flex min-h-tap min-w-tap flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition active:scale-95 ' +
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                    (activo
                      ? 'bg-agua-claro ring-2 ring-primario dark:bg-noche-elevada'
                      : 'hover:bg-agua-claro dark:hover:bg-noche-elevada')
                  }
                >
                  <Carita boca={c.boca} className={c.color} />
                  <span className="text-xs font-semibold leading-tight texto-suave">
                    {c.etiqueta}
                  </span>
                </button>
              )
            })}
            <button
              onClick={() => elegir(undefined)}
              className="opcion-carita flex min-h-tap min-w-tap flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-tinta-tenue transition active:scale-95
                         hover:bg-agua-claro focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 dark:hover:bg-noche-elevada"
            >
              <span className="flex h-[26px] w-[26px] items-center justify-center">
                <X size={20} aria-hidden />
              </span>
              <span className="text-xs font-semibold leading-tight">Sin valorar</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}

/**
 * Celda de la rejilla. Los tipos rápidos (lista de control, caritas y
 * positivos/negativos) se editan con un solo toque sobre la propia celda; los
 * que necesitan más pantalla abren el evaluador de columna.
 */
export function Celda({
  columna,
  alumno,
  valor,
  calculado,
  onCambiar,
  onAbrirEditor,
}: {
  columna: Columna
  alumno: Alumno
  valor?: ValorCelda
  /** Resultado de una columna de tipo 'calculo' o 'rubrica'; lo aporta la rejilla. */
  calculado?: ResultadoCalculo
  onCambiar: (cambios: Cambios) => void | Promise<void>
  onAbrirEditor: () => void
}) {
  const base = CLASE_CELDA
  const nombre = alumno.alias || alumno.nombre

  switch (columna.tipo) {
    case 'si_no': {
      const marcado = valor?.marcado
      return (
        <button
          className={base}
          onClick={() => void onCambiar({ marcado: marcado ? undefined : true })}
          aria-label={`${nombre}, ${columna.titulo}: ${marcado ? 'conseguido' : 'sin marcar'}`}
          aria-pressed={!!marcado}
        >
          {marcado ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lima-oscuro text-white">
              <Check size={18} strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <span className="h-8 w-8 rounded-full border-2 border-borde dark:border-noche-borde" />
          )}
        </button>
      )
    }

    case 'caritas':
      return (
        <SelectorCaritas
          escala={escalaCaritas(columna.caritas ?? 3)}
          indice={valor?.carita}
          etiquetaCelda={`${nombre}, ${columna.titulo}`}
          onElegir={(carita) => void onCambiar({ carita })}
        />
      )

    case 'positivo_negativo': {
      const pos = valor?.positivos ?? 0
      const neg = valor?.negativos ?? 0
      // La celda se parte en dos mitades para que sumar sea un solo toque.
      return (
        <div className="flex h-14 w-full">
          <button
            className="flex flex-1 flex-col items-center justify-center bg-acento/10 text-acento transition active:bg-acento/25
                       focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-acento/40"
            onClick={() => void onCambiar({ negativos: neg + 1 })}
            aria-label={`Sumar negativo a ${nombre} en ${columna.titulo}`}
          >
            <Minus size={12} strokeWidth={3} aria-hidden />
            <span className="cifra text-sm font-bold">{neg || ''}</span>
          </button>
          <button
            className="flex flex-1 flex-col items-center justify-center bg-lima/20 text-lima-oscuro transition active:bg-lima/40
                       focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primario/40 dark:text-lima"
            onClick={() => void onCambiar({ positivos: pos + 1 })}
            aria-label={`Sumar positivo a ${nombre} en ${columna.titulo}`}
          >
            <Plus size={12} strokeWidth={3} aria-hidden />
            <span className="cifra text-sm font-bold">{pos || ''}</span>
          </button>
        </div>
      )
    }

    case 'numero': {
      const n = valor?.numero
      const { min, max, decimales } = columna.escala ?? { min: 0, max: 10, decimales: 1 }
      // Color condicional: el suspenso salta a la vista (§5 M5).
      const suspenso = n != null && n < (min + max) / 2
      return (
        <button
          className={base + (suspenso ? ' text-acento' : '')}
          onClick={onAbrirEditor}
          aria-label={`${nombre}, ${columna.titulo}: ${n ?? 'sin nota'}`}
        >
          <span className="cifra text-lg">{n == null ? '·' : n.toFixed(decimales)}</span>
        </button>
      )
    }

    case 'rubrica': {
      // Nota ponderada de la rúbrica (§ Bloque 2), no el recuento de ítems
      // evaluados: `calculado` la aporta la rejilla con el mismo motor que
      // certifica el trimestre (notaInstrumento). Nunca se separa en columnas
      // sueltas: el toque abre el evaluador por alumno.
      const n = calculado?.valor ?? null
      const suspenso = n != null && n < 5
      const parcial = calculado != null && calculado.contadas < calculado.total && calculado.total > 0
      return (
        <button
          className={base + ' flex-col gap-0 ' + (suspenso ? 'text-acento' : '')}
          onClick={onAbrirEditor}
          aria-label={`${nombre}, ${columna.titulo}: ${n == null ? 'sin evaluar' : n.toFixed(1)}`}
        >
          <span className="cifra text-lg">{n == null ? '·' : n.toFixed(1)}</span>
          {parcial && (
            <span className="cifra text-xs font-semibold texto-suave">
              {calculado!.contadas}/{calculado!.total}
            </span>
          )}
        </button>
      )
    }

    case 'texto':
      return (
        <button
          className={base + ' px-1'}
          onClick={onAbrirEditor}
          aria-label={`${nombre}, ${columna.titulo}: ${valor?.texto || 'sin anotación'}`}
        >
          <span className="line-clamp-2 text-xs font-normal leading-tight">
            {valor?.texto || '·'}
          </span>
        </button>
      )

    case 'calculo': {
      // Solo lectura: la nota sale de otras columnas. Mismo color condicional
      // que 'numero' (suspenso < 5 sobre 10) y aviso de media parcial.
      const n = calculado?.valor ?? null
      const suspenso = n != null && n < 5
      const parcial =
        calculado != null && calculado.contadas < calculado.total && calculado.total > 0
      return (
        <div
          className={base + ' flex-col gap-0 ' + (suspenso ? 'text-acento' : '')}
          aria-label={`${nombre}, ${columna.titulo}: ${n == null ? 'sin datos' : n.toFixed(1)}`}
        >
          <span className="cifra text-lg">{n == null ? '·' : n.toFixed(1)}</span>
          {parcial && (
            <span className="cifra text-xs font-semibold texto-suave">
              {calculado!.contadas}/{calculado!.total}
            </span>
          )}
        </div>
      )
    }
  }
}

/**
 * Evaluador de columna: recorre la clase entera sin volver a la rejilla, que es
 * como se evalúa de verdad (§5 M5: «navegación por columna para evaluar a toda
 * la clase seguida»).
 */
export function EditorColumna({
  columna,
  alumnos,
  indice,
  valores,
  onIndice,
  onCerrar,
}: {
  columna: Columna
  alumnos: Alumno[]
  indice: number
  valores: Map<string, ValorCelda>
  onIndice: (i: number) => void
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const alumno = alumnos[indice]
  if (!alumno) return null

  const nombre = alumno.alias || alumno.nombre
  const valor = valores.get(`${columna.id}|${alumno.id}`)
  // El texto se autoguarda a cada pulsación (más abajo): un aviso por letra
  // sería ruido. La nota numérica es lo contrario — se toca deprisa y avanza
  // sola al siguiente alumno, así que es donde más falta hace poder deshacer
  // (guardarValor ya calcula esa función; antes se descartaba con `void`).
  const guardar = (cambios: Cambios) => void guardarValor(columna.id, alumno.id, cambios)
  const guardarConDeshacer = (cambios: Cambios, texto: string) => {
    void guardarValor(columna.id, alumno.id, cambios).then((deshacer) => {
      mostrarAviso(texto, deshacer)
    })
  }

  const avanzar = () => {
    if (indice + 1 < alumnos.length) onIndice(indice + 1)
    else onCerrar() // al terminar la clase se cierra solo
  }

  return (
    <Hoja abierta titulo={columna.titulo} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            className="btn-suave px-3"
            onClick={() => onIndice(Math.max(0, indice - 1))}
            disabled={indice === 0}
            aria-label="Alumno anterior"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-lg font-bold">
              {alumno.apellidos ? `${alumno.apellidos}, ${alumno.nombre}` : alumno.nombre}
            </p>
            <p className="cifra text-xs texto-suave">
              {indice + 1} de {alumnos.length}
            </p>
          </div>
          <button
            className="btn-suave px-3"
            onClick={() => onIndice(Math.min(alumnos.length - 1, indice + 1))}
            disabled={indice === alumnos.length - 1}
            aria-label="Alumno siguiente"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>

        {columna.tipo === 'numero' && (
          <TecladoNumerico
            escala={columna.escala ?? { min: 0, max: 10, decimales: 1 }}
            valor={valor?.numero}
            onValor={(numero) => {
              guardarConDeshacer({ numero }, `${nombre}: ${numero}`)
              avanzar()
            }}
            onLimpiar={() => guardarConDeshacer({ numero: undefined }, `${nombre}: nota borrada`)}
          />
        )}

        {columna.tipo === 'texto' && (
          <>
            <CampoArea
              className="campo h-32 resize-none py-2"
              valor={valor?.texto ?? ''}
              onValor={(v) => guardar({ texto: v })}
              placeholder="Anotación para este alumno"
              aria-label={`${nombre}, ${columna.titulo}`}
              autoFocus
            />
            {/* El texto ya se guarda en cada pulsación; este botón solo salta al
                siguiente alumno, para anotar a toda la clase seguida. */}
            <button className="btn-primario w-full" onClick={avanzar}>
              {indice + 1 < alumnos.length ? (
                <>
                  Guardar y siguiente
                  <ChevronRight size={18} aria-hidden />
                </>
              ) : (
                <>
                  <Check size={18} aria-hidden />
                  Hecho
                </>
              )}
            </button>
          </>
        )}

      </div>
    </Hoja>
  )
}

/**
 * Tabla de rúbrica: alumno × criterio, siempre así (nunca separada en
 * columnas de la rejilla). Cada celda muestra la NOTA del nivel (2, 4, 6…),
 * no solo su etiqueta, y se cicla tocando, igual que en la rejilla principal.
 */
export function TablaRubrica({
  columna,
  rubrica,
  alumnos,
  valores,
  onCambiar,
  onCerrar,
}: {
  columna: Columna
  rubrica?: Rubrica
  alumnos: Alumno[]
  valores: Map<string, ValorCelda>
  onCambiar: (columna: Columna, alumnoId: string, cambios: Cambios) => Promise<() => Promise<void>>
  onCerrar: () => void
}) {
  if (!rubrica) return null

  function ciclar(alumnoId: string, criterioId: string) {
    const valor = valores.get(`${columna.id}|${alumnoId}`)
    const nivelId = valor?.rubrica?.[criterioId]
    const indice = rubrica!.niveles.findIndex((n) => n.id === nivelId)
    const siguiente = indice + 1
    const nuevo = { ...(valor?.rubrica ?? {}) }
    if (siguiente >= rubrica!.niveles.length) delete nuevo[criterioId]
    else nuevo[criterioId] = rubrica!.niveles[siguiente].id
    void onCambiar(columna, alumnoId, { rubrica: nuevo })
  }

  return (
    <Hoja abierta titulo={columna.titulo} onCerrar={onCerrar}>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-max border-separate border-spacing-0">
          <caption className="sr-only">Rúbrica: alumnos por criterio</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[120px] border-b-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua"
              >
                Alumno
              </th>
              {rubrica.criterios.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="min-w-[72px] border-b-2 border-r border-borde bg-agua-claro px-1 py-2 text-xs font-bold leading-tight text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua"
                  title={c.titulo}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alumnos.map((a, fila) => (
              <tr key={a.id} className={fila % 2 ? 'bg-agua-claro/30 dark:bg-noche-elevada/30' : ''}>
                <th
                  scope="row"
                  className={
                    'sticky left-0 z-10 min-w-[120px] border-b border-r border-borde px-2 py-2 text-left text-sm font-semibold dark:border-noche-borde ' +
                    (fila % 2
                      ? 'bg-[rgb(238,245,246)] dark:bg-noche-superficie'
                      : 'bg-superficie dark:bg-noche-superficie')
                  }
                >
                  <span className="block max-w-[120px] truncate">
                    {a.alias || a.nombre}
                  </span>
                </th>
                {rubrica.criterios.map((c) => {
                  const valor = valores.get(`${columna.id}|${a.id}`)
                  const nivelId = valor?.rubrica?.[c.id]
                  const nivel = rubrica.niveles.find((n) => n.id === nivelId)
                  return (
                    <td
                      key={c.id}
                      className="border-b border-r border-borde p-0 dark:border-noche-borde"
                    >
                      <button
                        className="flex h-14 w-full items-center justify-center active:scale-95"
                        onClick={() => ciclar(a.id, c.id)}
                        aria-label={`${a.alias || a.nombre}, ${c.titulo}: ${nivel ? `${nivel.etiqueta} (${nivel.valor})` : 'sin valorar'}`}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs texto-suave">Toca una celda para pasar al siguiente nivel.</p>
    </Hoja>
  )
}

/** Teclado grande: se usa con una mano, de pie y con prisa. */
function TecladoNumerico({
  escala,
  valor,
  onValor,
  onLimpiar,
}: {
  escala: { min: number; max: number; decimales: 0 | 1 | 2 }
  valor?: number
  onValor: (n: number) => void
  onLimpiar: () => void
}) {
  const [buffer, setBuffer] = useState('')
  const mostrado = buffer || (valor != null ? String(valor) : '')
  const contenedorRef = useRef<HTMLDivElement>(null)

  // Foco al montar para capturar el teclado físico sin robarlo en cada tecla.
  useEffect(() => {
    contenedorRef.current?.focus()
  }, [])

  function pulsar(tecla: string) {
    if (tecla === ',') {
      if (escala.decimales === 0 || buffer.includes(',')) return
      setBuffer((b) => (b === '' ? '0,' : b + ','))
      return
    }
    setBuffer((b) => b + tecla)
  }

  function confirmar() {
    const n = Number(mostrado.replace(',', '.'))
    if (!Number.isFinite(n)) return
    // Se recorta a la escala en vez de rechazar: escribir 12 en una escala 0–10
    // casi siempre es un dedo torpe, no una nota de 12.
    const acotado = Math.min(escala.max, Math.max(escala.min, n))
    setBuffer('')
    onValor(Number(acotado.toFixed(escala.decimales)))
  }

  // En escritorio se teclea con el teclado físico: Enter guarda y salta al
  // siguiente alumno (vía onValor→avanzar), como el botón «Guardar». Los
  // dígitos y la coma alimentan el mismo buffer que los botones en pantalla.
  function alPulsarTecla(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (mostrado) confirmar()
    } else if (e.key === 'Backspace') {
      setBuffer((b) => b.slice(0, -1))
    } else if (/^[0-9]$/.test(e.key)) {
      pulsar(e.key)
    } else if (e.key === ',' || e.key === '.') {
      pulsar(',')
    }
  }

  return (
    <div
      ref={contenedorRef}
      onKeyDown={alPulsarTecla}
      tabIndex={0}
      className="rounded-xl2 outline-none focus-visible:ring-4 focus-visible:ring-primario/40"
    >
      <div className="mb-2 flex items-center justify-center rounded-xl border-2 border-borde py-3 dark:border-noche-borde">
        <span className="cifra text-3xl font-bold">{mostrado || '—'}</span>
        <span className="ml-2 text-sm texto-suave">
          / {escala.max}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((t) => (
          <button key={t} className="btn-suave h-14 text-xl" onClick={() => pulsar(t)}>
            {t}
          </button>
        ))}
        <button
          className="btn-suave h-14 text-xl"
          onClick={() => pulsar(',')}
          disabled={escala.decimales === 0}
        >
          ,
        </button>
        <button className="btn-suave h-14 text-xl" onClick={() => pulsar('0')}>
          0
        </button>
        <button
          className="btn-suave h-14"
          onClick={() => setBuffer((b) => b.slice(0, -1))}
          aria-label="Borrar último dígito"
        >
          <Delete size={20} aria-hidden />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          className="btn-peligro"
          onClick={() => {
            setBuffer('')
            onLimpiar()
          }}
        >
          <X size={18} aria-hidden />
          Vaciar
        </button>
        <button className="btn-primario" onClick={confirmar} disabled={!mostrado}>
          <Check size={18} aria-hidden />
          Guardar
        </button>
      </div>
    </div>
  )
}

/**
 * «Aplicar a todo el grupo»: pone el mismo valor en toda una columna de un solo
 * gesto. Por defecto solo a quien aún no tiene nota; sobrescribir a los demás es
 * una casilla aparte. Muestra el recuento antes de aplicar y deja deshacer el
 * lote entero con un toque (§7.2).
 */
export function HojaAplicarGrupo({
  columna,
  alumnos,
  valores,
  onCerrar,
}: {
  columna: Columna | null
  alumnos: Alumno[]
  valores: Map<string, ValorCelda>
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [sobrescribir, setSobrescribir] = useState(false)
  const [numero, setNumero] = useState('')
  const [carita, setCarita] = useState<number | null>(null)
  const [marcado, setMarcado] = useState<boolean | null>(null)

  // Reinicia al abrir una columna distinta.
  useEffect(() => {
    setSobrescribir(false)
    setNumero('')
    setCarita(null)
    setMarcado(null)
  }, [columna?.id])

  if (!columna) return null

  const ids = alumnos.map((a) => a.id)
  const destinatarios = contarDestinatarios(columna.id, ids, valores, sobrescribir)
  const conNota = ids.length - contarDestinatarios(columna.id, ids, valores, false)

  const escala = columna.tipo === 'numero' ? (columna.escala ?? { min: 0, max: 10, decimales: 1 }) : null
  const caritas = columna.tipo === 'caritas' ? escalaCaritas(columna.caritas ?? 3) : null

  // El valor elegido según el tipo; null si aún no hay valor que aplicar.
  const cambios: Cambios | null = (() => {
    if (columna.tipo === 'numero') {
      if (numero === '') return null
      const n = Number(numero.replace(',', '.'))
      if (!Number.isFinite(n)) return null
      const acotado = Math.min(escala!.max, Math.max(escala!.min, n))
      return { numero: Number(acotado.toFixed(escala!.decimales)) }
    }
    if (columna.tipo === 'caritas') return carita == null ? null : { carita }
    if (columna.tipo === 'si_no') return marcado == null ? null : { marcado }
    return null
  })()

  async function aplicar() {
    if (!cambios || destinatarios === 0) return
    const { aplicadas, deshacer } = await aplicarAGrupo(columna!.id, ids, cambios, sobrescribir)
    onCerrar()
    mostrarAviso(`Aplicado a ${aplicadas} ${aplicadas === 1 ? 'alumno' : 'alumnos'}`, deshacer)
  }

  return (
    <Hoja abierta={!!columna} titulo={`Aplicar a todo el grupo · ${columna.titulo}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        {columna.tipo === 'numero' && (
          <div>
            <label className="etiqueta" htmlFor="aplicar-numero">
              Nota para todos
            </label>
            <Campo
              id="aplicar-numero"
              type="number"
              inputMode="decimal"
              className="campo cifra text-center text-2xl"
              valor={numero}
              min={escala!.min}
              max={escala!.max}
              onValor={setNumero}
              autoFocus
            />
            <p className="mt-1 text-xs texto-suave">
              Entre {escala!.min} y {escala!.max}.
            </p>
          </div>
        )}

        {columna.tipo === 'caritas' && caritas && (
          <div>
            <span className="etiqueta">Carita para todos</span>
            <div className="flex flex-wrap gap-2">
              {caritas.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setCarita(i)}
                  aria-pressed={carita === i}
                  className={
                    'flex min-h-tap flex-col items-center gap-1 rounded-xl px-3 py-1.5 transition ' +
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                    (carita === i
                      ? 'bg-agua-claro ring-2 ring-primario dark:bg-noche-elevada'
                      : 'hover:bg-agua-claro dark:hover:bg-noche-elevada')
                  }
                >
                  <Carita boca={c.boca} className={c.color} />
                  <span className="text-xs font-semibold texto-suave">{c.etiqueta}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {columna.tipo === 'si_no' && (
          <div>
            <span className="etiqueta">Marca para todos</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMarcado(true)}
                className={marcado === true ? 'btn-primario' : 'btn-suave'}
              >
                <Check size={18} aria-hidden />
                Conseguido
              </button>
              <button
                onClick={() => setMarcado(false)}
                className={marcado === false ? 'btn-acento' : 'btn-suave'}
              >
                <X size={18} aria-hidden />
                No conseguido
              </button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-3">
          <button
            role="switch"
            aria-checked={sobrescribir}
            onClick={() => setSobrescribir((v) => !v)}
            className={
              'relative h-8 w-14 shrink-0 rounded-full transition ' +
              (sobrescribir ? 'bg-primario' : 'bg-borde dark:bg-noche-borde')
            }
          >
            <span
              className={
                'absolute top-1 h-6 w-6 rounded-full bg-white transition-all ' +
                (sobrescribir ? 'left-7' : 'left-1')
              }
            />
          </button>
          <span className="text-sm">
            <span className="font-semibold">Sobrescribir existentes</span>
            <span className="block texto-suave">
              {conNota} {conNota === 1 ? 'alumno ya tiene' : 'alumnos ya tienen'} nota en esta columna.
            </span>
          </span>
        </label>

        <div className="panel-agua text-sm">
          {destinatarios === 0
            ? 'No hay alumnos a los que aplicar. Marca «sobrescribir» para reemplazar los que ya tienen nota.'
            : `Se aplicará a ${destinatarios} ${destinatarios === 1 ? 'alumno' : 'alumnos'}.`}
        </div>

        <button
          className="btn-primario w-full"
          onClick={() => void aplicar()}
          disabled={!cambios || destinatarios === 0}
        >
          Aplicar a {destinatarios} {destinatarios === 1 ? 'alumno' : 'alumnos'}
        </button>
      </div>
    </Hoja>
  )
}
