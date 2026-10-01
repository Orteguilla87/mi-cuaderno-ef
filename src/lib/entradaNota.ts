/**
 * Entrada de una nota numérica desde el teclado físico (escritorio) o el
 * teclado en pantalla (móvil): qué se deja escribir y qué hace cada tecla.
 *
 * Lógica pura —ni React ni Dexie— para probar el flujo de «25 notas seguidas»
 * sin montar el evaluador.
 */

export interface EscalaNota {
  min: number
  max: number
  decimales: 0 | 1 | 2
}

/** El valor guardado tal como se edita: con coma decimal, sin ceros de relleno. */
export function textoDeNota(valor: number | undefined): string {
  return valor == null ? '' : String(valor).replace('.', ',')
}

/**
 * Lo tecleado, normalizado, o `null` si no es un paso válido hacia una nota de
 * la escala. Punto y coma valen lo mismo (teclado español). Un `null` no borra
 * nada: quien llama se queda con lo que ya había escrito.
 */
export function normalizarEntradaNota(bruto: string, escala: EscalaNota): string | null {
  const texto = bruto.replace(/\./g, ',').replace(/\s/g, '')
  if (texto === '') return ''
  const negativo = escala.min < 0 ? '-?' : ''
  const decimales = escala.decimales === 0 ? '' : `(,\\d{0,${escala.decimales}})?`
  if (!new RegExp(`^${negativo}\\d*${decimales}$`).test(texto)) return null
  if (texto === '-') return texto
  // «,5» es «0,5»: se completa en vez de rechazarlo.
  if (texto.startsWith(',')) return normalizarEntradaNota('0' + texto, escala)
  if (texto.startsWith('-,')) return normalizarEntradaNota('-0' + texto.slice(1), escala)
  const n = Number(texto.replace(',', '.'))
  if (!Number.isFinite(n) || n > escala.max) return null
  return texto
}

/** La nota que representa un texto ya completo, redondeada a la escala; `null` si no hay número. */
export function notaDeTexto(texto: string, escala: EscalaNota): number | null {
  if (texto === '' || texto === '-') return null
  const n = Number(texto.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  // Se recorta a la escala en vez de rechazar: un mínimo de 1 con un 0 tecleado
  // es un dedo torpe, no una nota fuera de rango.
  const acotado = Math.min(escala.max, Math.max(escala.min, n))
  return Number(acotado.toFixed(escala.decimales))
}

export interface TeclaNota {
  key: string
  shiftKey: boolean
  /** El cursor está al principio del campo, sin selección. */
  cursorInicio: boolean
  /** El cursor está al final del campo, sin selección. */
  cursorFin: boolean
}

/** Qué hacer tras guardar (o no) la celda. */
export type DestinoTecla =
  /** Enter: siguiente alumno si el avance automático está activo; si no, cerrar. */
  | { tipo: 'avanzar' }
  | { tipo: 'alumno'; delta: 1 | -1 }
  | { tipo: 'columna'; delta: 1 | -1 }
  | { tipo: 'cerrar' }
  | { tipo: 'quedarse' }

export interface DecisionTecla {
  /**
   * Lo que hay que escribir en la celda antes de moverse: `{ numero }` con la
   * nota, o `{ numero: undefined }` para dejarla SIN DATO (que no es un 0).
   * Ausente: no se toca la base.
   */
  guardar?: { numero: number | undefined }
  destino: DestinoTecla
}

/**
 * Decide qué hace una tecla sobre el campo de nota, o `null` si es una tecla
 * de escritura que el propio campo debe procesar.
 *
 * Cualquier movimiento guarda antes lo tecleado si cambió: navegar con flechas
 * no puede costar la nota que se acaba de escribir. Escape es la excepción: no
 * guarda, y la celda conserva el valor anterior.
 */
export function decidirTecla(
  tecla: TeclaNota,
  estado: { texto: string; valorPrevio: number | undefined; escala: EscalaNota },
): DecisionTecla | null {
  const { texto, valorPrevio, escala } = estado
  const vacio = texto === ''

  const pendiente = (): DecisionTecla['guardar'] => {
    const n = notaDeTexto(texto, escala)
    return n == null || n === valorPrevio ? undefined : { numero: n }
  }
  const con = (destino: DestinoTecla): DecisionTecla => {
    const guardar = pendiente()
    return guardar ? { guardar, destino } : { destino }
  }

  switch (tecla.key) {
    case 'Enter':
      return con({ tipo: 'avanzar' })
    case 'Tab':
      return con({ tipo: 'columna', delta: tecla.shiftKey ? -1 : 1 })
    case 'ArrowDown':
      return con({ tipo: 'alumno', delta: 1 })
    case 'ArrowUp':
      return con({ tipo: 'alumno', delta: -1 })
    case 'ArrowLeft':
      return vacio || tecla.cursorInicio ? con({ tipo: 'columna', delta: -1 }) : null
    case 'ArrowRight':
      return vacio || tecla.cursorFin ? con({ tipo: 'columna', delta: 1 }) : null
    case 'Escape':
      return { destino: { tipo: 'cerrar' } }
    case 'Backspace':
    case 'Delete':
      // Solo sobre el campo ya vacío: con texto, la tecla borra caracteres.
      if (!vacio) return null
      return valorPrevio == null
        ? { destino: { tipo: 'quedarse' } }
        : { guardar: { numero: undefined }, destino: { tipo: 'quedarse' } }
    default:
      return null
  }
}

/**
 * La columna vecina de la misma clase que admite este editor, en el orden de la
 * rejilla; `null` en el borde (no se da la vuelta, como el avance por alumno).
 */
export function columnaVecina<C extends { id: string; tipo: string }>(
  columnas: C[],
  idActual: string,
  delta: 1 | -1,
  tipo = 'numero',
): C | null {
  const i = columnas.findIndex((c) => c.id === idActual)
  if (i < 0) return null
  for (let j = i + delta; j >= 0 && j < columnas.length; j += delta)
    if (columnas[j].tipo === tipo) return columnas[j]
  return null
}

/**
 * En pantalla táctil manda el teclado propio, grande, y el campo no levanta el
 * del sistema (`inputMode: 'none'`). Con ratón el campo recibe el teclado
 * físico y el teclado en pantalla queda plegado.
 */
export function modoEntradaNota(tactil: boolean): {
  inputMode: 'none' | 'decimal'
  tecladoPantalla: boolean
} {
  return tactil
    ? { inputMode: 'none', tecladoPantalla: true }
    : { inputMode: 'decimal', tecladoPantalla: false }
}
