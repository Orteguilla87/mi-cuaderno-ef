/**
 * Motor de cálculo de la nota de Primaria — Orden 130/2023, art. 6 y art. 19.
 *
 * La nota sube por tres escalones, y en cada uno pesa lo del escalón de abajo:
 *
 *   fila (con su criterio)  →  instrumento  →  unidad  →  trimestre
 *
 * Los criterios de evaluación NO reciben nota en ningún punto. Son el referente
 * de qué se evalúa y la base del informe de cobertura; la nota la producen los
 * instrumentos.
 *
 * Puro a propósito: recibe datos y devuelve números. Las consultas viven en
 * `db/notas.ts`. Así el motor se puede probar entero sin abrir una base.
 *
 * Regla transversal: lo que no se puede calcular se EXCLUYE y se renormaliza el
 * resto, nunca se cuenta como cero. Un alumno que faltó el día de la prueba no
 * ha sacado un cero; simplemente no hay evidencia. Cada exclusión queda anotada
 * en el log, porque una nota que sale de descartar cosas tiene que poder
 * explicarse alumno por alumno.
 */

import type {
  BandaSobre,
  CalificacionOficial,
  Columna,
  FilaInstrumento,
  Rubrica,
  Trimestre,
  UnidadDidactica,
  ValorCelda,
} from '../db/types'
import { TIPOS_CALIFICABLES } from '../db/types'

// ——————————————————————————— conversión oficial ———————————————————————————

/**
 * Bandas del art. 19 de la Orden 130/2023, en umbral inferior incluido:
 * <5 IN · 5–5,99 SU · 6–6,99 BI · 7–8,99 NT · ≥9 SB.
 *
 * Son las de la norma y no se editan. `Config.bandasOficiales`, que sí es
 * editable, pertenece al motor de evaluación final de M5 y es otra cosa.
 */
const BANDAS: { desde: number; oficial: CalificacionOficial }[] = [
  { desde: 9, oficial: 'SB' },
  { desde: 7, oficial: 'NT' },
  { desde: 6, oficial: 'BI' },
  { desde: 5, oficial: 'SU' },
  { desde: 0, oficial: 'IN' },
]

export function calificacionOficial(nota: number): CalificacionOficial {
  return BANDAS.find((b) => nota >= b.desde)?.oficial ?? 'IN'
}

export interface NotaOficial {
  /** Nota tal cual la da el motor, sin tocar. Trazable para una reclamación. */
  real: number
  /** Redondeo al entero más cercano (mitad hacia arriba). */
  redondeada: number
  /** Banda del art. 19, calculada sobre `redondeada` o sobre `real` según `modo`. */
  oficial: CalificacionOficial
}

/**
 * Nota real, su redondeo y la banda que le corresponde (§ Bloque 3.2,
 * `Config.bandaSobre`). Se muestran SIEMPRE las tres juntas en la UI: nunca
 * solo la oficial, para que el decimal quede trazable (Orden 130/2023, art. 20).
 */
export function notaOficial(nota: number, modo: BandaSobre): NotaOficial {
  const redondeada = Math.round(nota)
  return {
    real: nota,
    redondeada,
    oficial: calificacionOficial(modo === 'redondeada' ? redondeada : nota),
  }
}

// ——————————————————————————— log ———————————————————————————

export type MotivoExclusion =
  | 'sin_unidad'
  | 'tipo_no_califica'
  | 'es_calculo'
  | 'unidad_no_computa'
  | 'unidad_sin_trimestre'
  | 'unidad_sin_instrumentos'
  | 'sin_evidencia'
  | 'renormalizado'
  | 'sin_pesos'

export interface RegistroCalculo {
  nivel: 'fila' | 'instrumento' | 'unidad'
  motivo: MotivoExclusion
  /** Título de la columna, de la unidad o descriptor de la fila. */
  referencia: string
  detalle?: string
}

// ——————————————————————————— piezas ———————————————————————————

/** Lo que hace falta para calcular un instrumento. */
export interface Instrumento {
  columna: Columna
  filas: FilaInstrumento[]
  /** Solo si la columna es de rúbrica. */
  rubrica?: Rubrica
}

export interface Evaluable {
  unidad: UnidadDidactica
  instrumentos: Instrumento[]
}

export interface Resultado {
  valor: number | null
  log: RegistroCalculo[]
}

/**
 * Un instrumento califica si su tipo produce una nota. Las columnas de cálculo
 * quedan fuera aunque den un número: ya son la media de otras columnas de la
 * misma unidad, así que contarlas metería esas notas dos veces.
 */
export function califica(columna: Columna): boolean {
  return TIPOS_CALIFICABLES.includes(columna.tipo)
}

/** Media ponderada 0–10, o `null` si ningún término tenía peso. */
function ponderar(terminos: { valor: number; peso: number }[]): number | null {
  let suma = 0
  let pesos = 0
  for (const t of terminos) {
    suma += t.valor * t.peso
    pesos += t.peso
  }
  return pesos === 0 ? null : suma / pesos
}

/**
 * Nota 0–10 de una fila: lo que el alumno ha demostrado en ella, o `null` si
 * no hay evidencia.
 *
 * En un instrumento simple la fila es el instrumento entero, así que su
 * evidencia es el valor de la celda. En una rúbrica, cada fila mira solo el
 * nivel elegido para SU criterio de la rúbrica.
 */
export function notaFila(
  instrumento: Instrumento,
  fila: FilaInstrumento,
  valor: ValorCelda | undefined,
  normalizar: (columna: Columna, valor: ValorCelda | undefined, rubrica?: Rubrica) => number | null,
): number | null {
  const { columna, rubrica } = instrumento
  if (!valor) return null

  if (columna.tipo !== 'rubrica' || !rubrica || !fila.criterioRubricaId) {
    return normalizar(columna, valor, rubrica)
  }

  const nivelId = valor.rubrica?.[fila.criterioRubricaId]
  const nivel = rubrica.niveles.find((n) => n.id === nivelId)
  if (!nivel) return null

  const valores = rubrica.niveles.map((n) => n.valor)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  if (max === min) return null
  return ((nivel.valor - min) / (max - min)) * 10
}

/**
 * Nota del instrumento: media ponderada de sus filas.
 *
 * `pesoFila` a null significa «reparte a partes iguales». El reparto se hace
 * entre las filas CON evidencia, no entre todas: si una rúbrica de tres
 * criterios solo tiene dos valorados, esos dos se reparten el peso entero en
 * vez de que el tercero arrastre la nota hacia abajo como si fuera un cero.
 */
export function notaInstrumento(
  instrumento: Instrumento,
  valor: ValorCelda | undefined,
  normalizar: (columna: Columna, valor: ValorCelda | undefined, rubrica?: Rubrica) => number | null,
): Resultado {
  const { columna, filas } = instrumento
  const log: RegistroCalculo[] = []

  const conEvidencia: { fila: FilaInstrumento; valor: number }[] = []
  for (const fila of filas) {
    const n = notaFila(instrumento, fila, valor, normalizar)
    if (n === null) {
      log.push({ nivel: 'fila', motivo: 'sin_evidencia', referencia: fila.descriptor })
      continue
    }
    conEvidencia.push({ fila, valor: n })
  }

  if (conEvidencia.length === 0) {
    log.push({ nivel: 'instrumento', motivo: 'sin_evidencia', referencia: columna.titulo })
    return { valor: null, log }
  }

  if (conEvidencia.length < filas.length) {
    log.push({
      nivel: 'instrumento',
      motivo: 'renormalizado',
      referencia: columna.titulo,
      detalle: `${conEvidencia.length} de ${filas.length} filas con evidencia`,
    })
  }

  // `pesoFila` null es «no lo he decidido», y un 0 explícito es «que no cuente»:
  // son cosas distintas y se tratan distinto.
  //
  // Los null valen lo que valen de media los que sí tienen peso, para que
  // mezclarlos no dispare la escala. Con un 70 y un null, tratar el null como 1
  // daría un reparto de 70 a 1, que nadie ha pedido; así queda 70 a 70. Si no
  // hay ningún peso explícito, todos valen igual y sale el reparto equitativo.
  const explicitos = conEvidencia
    .map(({ fila }) => fila.pesoFila)
    .filter((p): p is number => p !== null)
  const pesoPorDefecto =
    explicitos.length === 0 ? 1 : explicitos.reduce((a, b) => a + b, 0) / explicitos.length

  const terminos = conEvidencia.map(({ fila, valor: v }) => ({
    valor: v,
    peso: fila.pesoFila ?? pesoPorDefecto,
  }))

  const nota = ponderar(terminos)
  if (nota === null) {
    // Todas las filas con evidencia tenían peso 0: no hay forma de promediarlas.
    log.push({ nivel: 'instrumento', motivo: 'sin_pesos', referencia: columna.titulo })
  }
  return { valor: nota, log }
}

/**
 * Nota de la unidad: media de sus instrumentos ponderada por `pesoUd`,
 * renormalizando sobre los que el alumno tiene evaluados.
 *
 * Un instrumento sin `pesoUd` (0) no puede aportar nada, así que la unidad
 * cuyos instrumentos estén todos a 0 se queda sin nota y lo dice: es el caso
 * de quien creó las columnas y aún no ha repartido pesos.
 */
export function notaUd(
  evaluable: Evaluable,
  valorDe: (columnaId: string) => ValorCelda | undefined,
  normalizar: (columna: Columna, valor: ValorCelda | undefined, rubrica?: Rubrica) => number | null,
): Resultado {
  const { unidad, instrumentos } = evaluable
  const log: RegistroCalculo[] = []
  const terminos: { valor: number; peso: number }[] = []

  for (const instrumento of instrumentos) {
    const { columna } = instrumento
    if (columna.tipo === 'calculo') {
      log.push({ nivel: 'instrumento', motivo: 'es_calculo', referencia: columna.titulo })
      continue
    }
    if (!califica(columna)) {
      log.push({ nivel: 'instrumento', motivo: 'tipo_no_califica', referencia: columna.titulo })
      continue
    }

    const res = notaInstrumento(instrumento, valorDe(columna.id), normalizar)
    log.push(...res.log)
    if (res.valor === null) continue

    terminos.push({ valor: res.valor, peso: columna.pesoUd })
  }

  if (terminos.length === 0) {
    log.push({ nivel: 'unidad', motivo: 'sin_evidencia', referencia: unidad.titulo })
    return { valor: null, log }
  }

  const nota = ponderar(terminos)
  if (nota === null) {
    log.push({ nivel: 'unidad', motivo: 'sin_pesos', referencia: unidad.titulo })
  }
  return { valor: nota, log }
}

export interface ResultadoTrimestre {
  nota: number | null
  oficial: CalificacionOficial | null
  /** Nota de cada unidad que ha entrado, para poder enseñar el desglose. */
  porUnidad: { udId: string; titulo: string; nota: number; peso: number }[]
  log: RegistroCalculo[]
}

/**
 * Nota del trimestre: media de las unidades ponderada por `pesoTrimestre`,
 * renormalizando sobre las que el alumno tiene evaluadas.
 *
 * NUNCA entran: instrumentos sin unidad, de tipo que no califica o de cálculo
 * (los descarta `notaUd`), ni unidades que no computan, sin trimestre o sin un
 * solo instrumento calificable.
 */
export function notaTrimestre(
  evaluables: Evaluable[],
  trimestre: Trimestre,
  valorDe: (columnaId: string) => ValorCelda | undefined,
  normalizar: (columna: Columna, valor: ValorCelda | undefined, rubrica?: Rubrica) => number | null,
): ResultadoTrimestre {
  const log: RegistroCalculo[] = []
  const terminos: { valor: number; peso: number }[] = []
  const porUnidad: ResultadoTrimestre['porUnidad'] = []

  for (const evaluable of evaluables) {
    const { unidad, instrumentos } = evaluable

    if (!unidad.computa) {
      log.push({ nivel: 'unidad', motivo: 'unidad_no_computa', referencia: unidad.titulo })
      continue
    }
    if (unidad.trimestre === null) {
      log.push({ nivel: 'unidad', motivo: 'unidad_sin_trimestre', referencia: unidad.titulo })
      continue
    }
    if (unidad.trimestre !== trimestre) continue

    if (!instrumentos.some((i) => califica(i.columna) && i.columna.tipo !== 'calculo')) {
      log.push({ nivel: 'unidad', motivo: 'unidad_sin_instrumentos', referencia: unidad.titulo })
      continue
    }

    const res = notaUd(evaluable, valorDe, normalizar)
    log.push(...res.log)
    if (res.valor === null) continue

    terminos.push({ valor: res.valor, peso: unidad.pesoTrimestre })
    porUnidad.push({
      udId: unidad.id,
      titulo: unidad.titulo,
      nota: res.valor,
      peso: unidad.pesoTrimestre,
    })
  }

  if (terminos.length === 0) return { nota: null, oficial: null, porUnidad, log }

  const nota = ponderar(terminos)
  if (nota === null) {
    // Todas las unidades evaluadas tienen peso 0: falta repartir el trimestre.
    log.push({ nivel: 'unidad', motivo: 'sin_pesos', referencia: `${trimestre}.º trimestre` })
    return { nota: null, oficial: null, porUnidad, log }
  }

  return { nota, oficial: calificacionOficial(nota), porUnidad, log }
}
