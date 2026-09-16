import type { Grupo } from '../db/types'
import { normalizarTexto } from './texto'

/**
 * Detección del grupo dentro del dictado, y RETIRADA de esa mención del texto.
 *
 * ——— POR QUÉ EXISTE ———
 *
 * El agente de voz buscaba al alumno sobre los ~200 alumnos activos de los nueve
 * grupos, y con el texto entero. Las dos cosas fallaban a la vez:
 *
 *  1. Sin acotar, un «Pablo» de 4ºA competía con el «Pablo» de 3ºB, y ganaba el
 *     que tuviera el nombre mejor escrito, no el de la clase que el maestro
 *     acababa de nombrar.
 *  2. Con el texto entero, «cuarto» y «tercero» son palabras de más de dos
 *     letras y entraban en el fuzzy de NOMBRES: con `threshold: 0.4` casan con
 *     apellidos como «Cuartero», y meten candidatos de otras clases justo en el
 *     top que decide la acción.
 *
 * Así que aquí se hacen las dos: se averigua de qué grupo habla, y se saca esa
 * mención del texto antes de que nadie busque un nombre en él.
 *
 * ——— LO QUE ESTE MÓDULO NO HACE ———
 *
 * No elige. Devuelve TODOS los grupos compatibles con lo dictado, porque «cuarto
 * A» puede ser 4ºA de EF y 4ºA de Lengua —dos grupos distintos con el mismo
 * alumnado—. Quién desempata y cómo es decisión de `db/agente.ts`, y si no hay
 * manera, pregunta. Aquí no se adivina.
 *
 * Módulo puro: ni `db` ni React, como `lib/etapas.ts`.
 */

export interface GrupoEnTexto {
  /** Grupos compatibles con la mención: 0 (no se dijo), 1, o varios (ambiguo). */
  candidatos: Grupo[]
  /**
   * El dictado SIN la mención del grupo. Es el único texto que puede llegar al
   * fuzzy de nombres y a `pseudonimizarTexto`.
   */
  textoSinGrupo: string
  /** Lo que se reconoció, tal cual lo escribió el maestro. Para enseñarlo. */
  mencion?: string
}

/**
 * Ordinales como se dicen y como se escriben. La clave es el nivel (1..6) y el
 * valor las formas que lo nombran, ya normalizadas (minúsculas, sin tildes).
 *
 * Las formas apocopadas («primer», «tercer») están porque se dicen: «tercer A».
 * Las numéricas cubren «4º», «4o», «4ª» y el «4» a secas, que es lo que sale al
 * dictar deprisa.
 */
const ORDINALES: Record<number, string[]> = {
  1: ['primero', 'primer', 'primera', '1o', '1a', '1'],
  2: ['segundo', 'segunda', '2o', '2a', '2'],
  3: ['tercero', 'tercer', 'tercera', '3o', '3a', '3'],
  4: ['cuarto', 'cuarta', '4o', '4a', '4'],
  5: ['quinto', 'quinta', '5o', '5a', '5'],
  6: ['sexto', 'sexta', '6o', '6a', '6'],
}

/**
 * `normalizarTexto` quita tildes pero no toca el indicador ordinal «º»/«ª», que
 * no es un diacrítico: «4ºA» sobreviviría entero y la letra de clase quedaría
 * pegada al número. Se convierte en un espacio —«4ºA» → «4 a»— para que «4ºA»,
 * «4 A» y «4A» acaben en la misma forma y la letra se vea suelta.
 */
function normalizarParaGrupo(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[º°ᵒª]/g, ' ')
    .replace(/[.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Dígito + «o» ordinal opcional + letra de clase, todo pegado: «4A», «4ºB», «4oa». */
const DIGITO_Y_LETRA = /^(\d)\s*o?\s*([a-e])$/

/**
 * El (nivel, letra) que se deduce de una forma escrita del grupo —su nombre o
 * uno de sus alias—. Es la misma lectura que se hace del dictado, aplicada al
 * otro lado de la comparación: «4ºA EF», «4A» y «Cuarto A» tienen que dar todas
 * `{ nivel: 4, letra: 'a' }` o no habría con qué comparar.
 */
function nivelYLetraDeForma(forma: string): { nivel?: number; letra?: string } {
  const tokens = normalizarParaGrupo(forma).split(' ').filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const partido = tokens[i].match(DIGITO_Y_LETRA)
    const cabeza = partido ? partido[1] : tokens[i]
    const nivel = Number(
      Object.keys(ORDINALES).find((n) => ORDINALES[Number(n)].includes(cabeza)) ?? NaN,
    )
    if (!Number.isFinite(nivel)) continue
    const siguiente = tokens[i + 1]
    return { nivel, letra: partido?.[2] ?? (siguiente && LETRAS_CLASE.includes(siguiente) ? siguiente : undefined) }
  }
  return {}
}

const LETRAS_CLASE = ['a', 'b', 'c', 'd', 'e']

interface Mencion {
  nivel: number
  letra?: string
  /** Índices [inicio, fin) sobre el texto ORIGINAL, para poder retirarla. */
  desde: number
  hasta: number
}

/**
 * Palabras de relleno que el maestro mete entre el ordinal y la letra o el área
 * («cuarto DE lengua», «cuarto A DE EF»). Se tragan dentro de la mención para
 * que no queden sueltas en el texto que va al fuzzy de nombres.
 */
const RELLENO = ['de', 'del', 'la', 'el', 'los']

/**
 * Busca el ordinal en el texto y se lleva por delante lo que venga detrás
 * mientras siga formando parte del nombre del grupo: relleno, la letra de clase,
 * y una palabra de área si la hay.
 *
 * Se trabaja sobre las palabras del texto ORIGINAL y sus posiciones, no sobre el
 * normalizado, porque `textoSinGrupo` tiene que devolver el texto tal cual lo
 * dictó el maestro menos el tramo reconocido.
 */
function buscarMencion(texto: string, areas: Set<string>): Mencion | null {
  const palabras = [...texto.matchAll(/\S+/g)].map((m) => ({
    bruto: m[0],
    norm: normalizarParaGrupo(m[0]),
    desde: m.index,
    hasta: m.index + m[0].length,
  }))

  for (let i = 0; i < palabras.length; i++) {
    // «4A» llega pegado: se parte en ordinal + letra antes de comparar.
    const partido = palabras[i].norm.match(DIGITO_Y_LETRA)
    const cabeza = partido ? partido[1] : palabras[i].norm
    const nivel = Number(
      Object.keys(ORDINALES).find((n) => ORDINALES[Number(n)].includes(cabeza)) ?? NaN,
    )
    if (!Number.isFinite(nivel) || nivel === 0) continue

    let letra = partido?.[2]
    let hasta = palabras[i].hasta
    let j = i + 1

    // Relleno + letra de clase + área, mientras sigan encadenados.
    while (j < palabras.length) {
      const p = palabras[j].norm
      if (RELLENO.includes(p)) {
        j++
        continue
      }
      if (!letra && LETRAS_CLASE.includes(p)) {
        letra = p
        hasta = palabras[j].hasta
        j++
        continue
      }
      if (areas.has(p)) {
        hasta = palabras[j].hasta
        j++
        continue
      }
      break
    }

    // Un dígito suelto no basta: «le he puesto un 4» no nombra a ningún grupo.
    // Solo cuenta como mención si algo más lo acompaña —la letra de clase o una
    // palabra de área—. Los ordinales en palabra («cuarto») sí valen solos.
    if (/^\d$/.test(cabeza) && !letra && hasta === palabras[i].hasta) continue

    return { nivel, letra, desde: palabras[i].desde, hasta }
  }

  return null
}

/**
 * Las palabras que aparecen en los alias y nombres de los grupos y NO son ni
 * ordinal ni letra de clase: «ef», «lengua», «psico»… Sirven para que «cuarto de
 * lengua» se retire entero del texto y «lengua» no acabe buscándose como nombre
 * de alumno.
 */
function palabrasDeArea(grupos: Grupo[]): Set<string> {
  const todas = new Set<string>()
  const ordinales = new Set(Object.values(ORDINALES).flat())
  for (const g of grupos) {
    for (const forma of [g.nombre, ...(g.alias ?? [])]) {
      for (const p of normalizarParaGrupo(forma).split(' ')) {
        if (!p || ordinales.has(p) || LETRAS_CLASE.includes(p) || RELLENO.includes(p)) continue
        todas.add(p)
      }
    }
  }
  return todas
}

/** Si una de las formas del grupo (alias o nombre) es exactamente lo dictado. */
function coincidePorForma(grupo: Grupo, mencionNorm: string): boolean {
  return [grupo.nombre, ...(grupo.alias ?? [])].some(
    (forma) => normalizarParaGrupo(forma) === mencionNorm,
  )
}

/**
 * Si el grupo cuadra con el (nivel, letra) deducidos del ordinal. La letra se
 * saca del nombre del grupo: no hay campo para ella, y «4ºA» / «4 A» / «Cuarto A»
 * son todas la misma clase.
 */
function coincidePorNivel(grupo: Grupo, nivel: number, letra?: string): boolean {
  if (grupo.nivel !== nivel) return false
  if (!letra) return true
  return [grupo.nombre, ...(grupo.alias ?? [])].some(
    (forma) => nivelYLetraDeForma(forma).letra === letra,
  )
}

/**
 * Detecta de qué grupo habla el dictado y devuelve el texto sin esa mención.
 *
 * Sin mención reconocible: `candidatos` vacío y `textoSinGrupo` igual al texto
 * de entrada. Quien llama decide entonces con el contexto, y si no lo hay,
 * pregunta (§ tarjeta de confirmación). Nunca se resuelve un alumno con los
 * candidatos vacíos.
 */
export function detectarGrupoEnTexto(texto: string, grupos: Grupo[]): GrupoEnTexto {
  const mencion = buscarMencion(texto, palabrasDeArea(grupos))
  if (!mencion) return { candidatos: [], textoSinGrupo: texto }

  // Sin la puntuación de cierre: «Cuarto A,» se enseña como «Cuarto A».
  const bruto = texto.slice(mencion.desde, mencion.hasta).replace(/[\s,;:.]+$/, '')
  const mencionNorm = normalizarParaGrupo(bruto)

  // Alias y nombre primero: es lo que el usuario ha escrito para este grupo, y
  // manda sobre lo que se pueda deducir del ordinal.
  const porForma = grupos.filter((g) => coincidePorForma(g, mencionNorm))
  const candidatos = porForma.length
    ? porForma
    : grupos.filter((g) => coincidePorNivel(g, mencion.nivel, mencion.letra))

  const textoSinGrupo = (texto.slice(0, mencion.desde) + texto.slice(mencion.hasta))
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.]+/, '')
    .trim()

  return { candidatos, textoSinGrupo, mencion: bruto }
}
