import { Check, ChevronLeft, ChevronRight, Table2 } from 'lucide-react'
import { valorNormalizado } from '../db/cuaderno'
import type { Alumno, Columna, FilaInstrumento, Rubrica, ValorCelda } from '../db/types'
import { notaInstrumento } from '../lib/notas'
import { Hoja } from './Hoja'

type Cambios = { rubrica?: Record<string, string> }

/**
 * Evaluación de una rúbrica, alumno a alumno (§ Bloque 2.2): cada fila con
 * TODOS sus niveles desplegados como botones — nada de submenú oculto—, la
 * nota del instrumento en vivo (mismo motor que certifica el trimestre) y
 * navegación entre alumnos sin cerrar la hoja, como en `EditorColumna`.
 */
export function EvaluadorRubrica({
  columna,
  rubrica,
  filas,
  alumnos,
  indice,
  valores,
  onCambiar,
  onIndice,
  onCerrar,
  onVerTabla,
}: {
  columna: Columna
  rubrica: Rubrica | undefined
  filas: FilaInstrumento[]
  alumnos: Alumno[]
  indice: number
  valores: Map<string, ValorCelda>
  onCambiar: (
    columna: Columna,
    alumnoId: string,
    cambios: Cambios,
  ) => Promise<() => Promise<void>> | void
  onIndice: (i: number) => void
  onCerrar: () => void
  /** Abre la tabla alumno × criterio, para quien prefiera esa vista. */
  onVerTabla: () => void
}) {
  const alumno = alumnos[indice]
  if (!alumno || !rubrica) return null

  const nombre = alumno.alias || alumno.nombre
  const valor = valores.get(`${columna.id}|${alumno.id}`)
  const filasOrdenadas = [...filas].sort((a, b) => a.orden - b.orden)

  const resultado = notaInstrumento(
    { columna, filas: filasOrdenadas, rubrica },
    valor,
    valorNormalizado,
  )
  const evaluadas = filasOrdenadas.filter(
    (f) => f.criterioRubricaId && valor?.rubrica?.[f.criterioRubricaId],
  ).length

  function elegirNivel(fila: FilaInstrumento, nivelId: string) {
    if (!fila.criterioRubricaId) return
    const actual = valor?.rubrica?.[fila.criterioRubricaId]
    const nuevo = { ...(valor?.rubrica ?? {}) }
    if (actual === nivelId) delete nuevo[fila.criterioRubricaId]
    else nuevo[fila.criterioRubricaId] = nivelId
    void onCambiar(columna, alumno.id, { rubrica: nuevo })
  }

  function avanzar() {
    if (indice + 1 < alumnos.length) onIndice(indice + 1)
    else onCerrar() // al terminar la clase se cierra sola, como EditorColumna
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

        <div className="panel-agua flex items-center justify-between text-sm">
          <span className="font-semibold">
            {evaluadas}/{filasOrdenadas.length} filas evaluadas
          </span>
          <span className="cifra text-lg font-bold" aria-label={`Nota de ${nombre}`}>
            {resultado.valor == null ? '—' : resultado.valor.toFixed(2)}
          </span>
        </div>

        <ul className="space-y-3">
          {filasOrdenadas.map((fila) => {
            const nivelIdActual = fila.criterioRubricaId
              ? valor?.rubrica?.[fila.criterioRubricaId]
              : undefined
            return (
              <li key={fila.id} className="tarjeta space-y-2 py-3">
                <p className="font-semibold">{fila.descriptor}</p>
                <div className="grid grid-cols-2 gap-2">
                  {rubrica.niveles.map((n) => {
                    const activo = n.id === nivelIdActual
                    return (
                      <button
                        key={n.id}
                        onClick={() => elegirNivel(fila, n.id)}
                        aria-pressed={activo}
                        className={
                          'flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2.5 text-sm font-semibold transition active:scale-95 ' +
                          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                          (activo
                            ? 'border-primario bg-primario text-white'
                            : 'border-borde bg-white text-tinta hover:bg-agua-claro dark:border-noche-borde dark:bg-noche-superficie dark:text-noche-texto dark:hover:bg-noche-elevada')
                        }
                      >
                        <span className="cifra text-base font-bold">{n.valor}</span>
                        <span className="text-center text-xs leading-tight">{n.etiqueta}</span>
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>

        <button className="btn-suave w-full" onClick={onVerTabla}>
          <Table2 size={18} aria-hidden />
          Ver tabla alumno × criterio
        </button>

        <button className="btn-primario w-full" onClick={avanzar}>
          {indice + 1 < alumnos.length ? (
            <>
              Siguiente alumno
              <ChevronRight size={18} aria-hidden />
            </>
          ) : (
            <>
              <Check size={18} aria-hidden />
              Hecho
            </>
          )}
        </button>
      </div>
    </Hoja>
  )
}
