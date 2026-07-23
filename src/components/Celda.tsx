import { Check, ChevronLeft, ChevronRight, Delete, Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { guardarValor } from '../db/cuaderno'
import type { Alumno, Columna, Rubrica, ValorCelda } from '../db/types'
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
 * Celda de la rejilla. Los tipos rápidos (lista de control, caritas y
 * positivos/negativos) se editan con un solo toque sobre la propia celda; los
 * que necesitan más pantalla abren el evaluador de columna.
 */
export function Celda({
  columna,
  alumno,
  valor,
  rubrica,
  onCambiar,
  onAbrirEditor,
}: {
  columna: Columna
  alumno: Alumno
  valor?: ValorCelda
  rubrica?: Rubrica
  onCambiar: (cambios: Cambios) => void | Promise<void>
  onAbrirEditor: () => void
}) {
  const base =
    'flex h-14 w-full items-center justify-center text-sm font-bold transition active:scale-95'
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

    case 'caritas': {
      const escala = escalaCaritas(columna.caritas ?? 3)
      const i = valor?.carita
      const actual = i != null ? escala[i] : null
      return (
        <button
          className={base}
          // Ciclo: sin valor → 0 → 1 → … → último → sin valor.
          onClick={() => {
            const siguiente = i == null ? 0 : i + 1
            void onCambiar({ carita: siguiente >= escala.length ? undefined : siguiente })
          }}
          aria-label={`${nombre}, ${columna.titulo}: ${actual?.etiqueta ?? 'sin valorar'}`}
        >
          {actual ? (
            <Carita boca={actual.boca} className={actual.color} />
          ) : (
            <span className="h-7 w-7 rounded-full border-2 border-dashed border-borde dark:border-noche-borde" />
          )}
        </button>
      )
    }

    case 'positivo_negativo': {
      const pos = valor?.positivos ?? 0
      const neg = valor?.negativos ?? 0
      // La celda se parte en dos mitades para que sumar sea un solo toque.
      return (
        <div className="flex h-14 w-full">
          <button
            className="flex flex-1 flex-col items-center justify-center bg-acento/10 text-acento active:bg-acento/25"
            onClick={() => void onCambiar({ negativos: neg + 1 })}
            aria-label={`Sumar negativo a ${nombre} en ${columna.titulo}`}
          >
            <Minus size={12} strokeWidth={3} aria-hidden />
            <span className="cifra text-sm font-bold">{neg || ''}</span>
          </button>
          <button
            className="flex flex-1 flex-col items-center justify-center bg-lima/20 text-lima-oscuro active:bg-lima/40 dark:text-lima"
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
      // Siempre se abre en tabla (alumno × criterio): nunca se separa en
      // columnas sueltas de la rejilla, así que la celda es solo un resumen.
      const puestos = rubrica
        ? rubrica.criterios.filter((c) => valor?.rubrica?.[c.id]).length
        : 0
      const total = rubrica?.criterios.length ?? 0
      return (
        <button
          className={base}
          onClick={onAbrirEditor}
          aria-label={`${nombre}, ${columna.titulo}: ${puestos} de ${total} criterios`}
        >
          <span className="cifra text-xs">
            {puestos === 0 ? '·' : `${puestos}/${total}`}
          </span>
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
          <span className="line-clamp-2 text-[11px] font-normal leading-tight">
            {valor?.texto || '·'}
          </span>
        </button>
      )
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
  const alumno = alumnos[indice]
  if (!alumno) return null

  const valor = valores.get(`${columna.id}|${alumno.id}`)
  const guardar = (cambios: Cambios) => void guardarValor(columna.id, alumno.id, cambios)

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
              guardar({ numero })
              avanzar()
            }}
            onLimpiar={() => guardar({ numero: undefined })}
          />
        )}

        {columna.tipo === 'texto' && (
          <textarea
            className="campo h-32 resize-none py-2"
            value={valor?.texto ?? ''}
            onChange={(e) => guardar({ texto: e.target.value })}
            placeholder="Anotación para este alumno"
            autoFocus
          />
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
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[120px] border-b-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua">
                Alumno
              </th>
              {rubrica.criterios.map((c) => (
                <th
                  key={c.id}
                  className="min-w-[72px] border-b-2 border-r border-borde bg-agua-claro px-1 py-2 text-[11px] font-bold leading-tight text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua"
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

  return (
    <div>
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
