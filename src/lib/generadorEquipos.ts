/**
 * Motor puro del generador de equipos. Sin Dexie ni React: se testea con
 * Vitest pasando datos ya resueltos, y la capa `db/equipos.ts` es la que lo
 * conecta con la base y la UI.
 *
 * Nunca recibe `apoyos` ni `nivelMotriz` en crudo más allá de lo necesario
 * para calcular: `tieneApoyos` llega como booleano, jamás el texto.
 */

export interface AlumnoGenerable {
  id: string
  genero?: 'chico' | 'chica' | null
  nivelMotriz?: 1 | 2 | 3 | 4 | 5 | null
  tieneApoyos?: boolean
}

export type ModoGeneracion = 'aleatorio' | 'heterogeneo' | 'homogeneo'

export interface VinculoGenerable {
  alumnoA: string
  alumnoB: string
  tipo: 'separar' | 'juntar'
}

export interface OpcionesGeneracion {
  alumnos: AlumnoGenerable[]
  /** Tamaño de cada equipo, ya resuelto por `resolverTamanios`. */
  tamanios: number[]
  modo: ModoGeneracion
  equilibrarGenero?: boolean
  repartirApoyos?: boolean
  vinculos?: VinculoGenerable[]
  priorizarNuevos?: boolean
  /** Alineaciones pasadas del grupo: cada una es la lista de miembros por equipo. */
  historial?: string[][]
  /** alumnoId → índice de equipo en el que queda fijo (de un «Regenerar»). */
  fijados?: Record<string, number>
  /** Generador de aleatoriedad inyectable, para tests deterministas. */
  aleatorio?: () => number
}

export interface ResultadoGeneracion {
  equipos: string[][]
  /** Si un vínculo no se pudo respetar tras los reintentos, se explica aquí. */
  advertencia?: string
}

export type ComoRepartirSobra = 'repartir' | 'extra'

/**
 * Tamaños de cada equipo a partir del nº de alumnos y, o bien un número de
 * equipos, o bien un tamaño objetivo. `sobra` decide si el resto se reparte
 * entre los equipos existentes o forma un equipo adicional.
 */
export function resolverTamanios(
  nAlumnos: number,
  opciones: { porNumEquipos?: number; porTamano?: number; sobra: ComoRepartirSobra },
): number[] {
  const { porNumEquipos, porTamano, sobra } = opciones
  if (nAlumnos <= 0) return []

  if (porNumEquipos && porNumEquipos > 0) {
    const num = Math.min(porNumEquipos, nAlumnos)
    const base = Math.floor(nAlumnos / num)
    const resto = nAlumnos % num
    if (resto === 0) return Array(num).fill(base)
    if (sobra === 'repartir') {
      // Los primeros `resto` equipos absorben uno más: reparto lo más parejo posible.
      return Array.from({ length: num }, (_, i) => base + (i < resto ? 1 : 0))
    }
    return [...Array(num).fill(base), resto]
  }

  if (porTamano && porTamano > 0) {
    const numCompletos = Math.floor(nAlumnos / porTamano)
    const resto = nAlumnos % porTamano
    if (resto === 0) return Array(numCompletos).fill(porTamano)
    if (sobra === 'repartir') {
      // Sin equipo nuevo: el resto se reparte de uno en uno entre los primeros equipos.
      return Array.from({ length: numCompletos }, (_, i) => porTamano + (i < resto ? 1 : 0))
    }
    return [...Array(numCompletos).fill(porTamano), resto]
  }

  return [nAlumnos]
}

function mezclar<T>(lista: T[], aleatorio: () => number): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** Nivel medio para desempatar el ranking cuando no hay dato: ni favorece ni penaliza. */
const NIVEL_MEDIO = 3

function ordenarPorNivel(alumnos: AlumnoGenerable[], aleatorio: () => number): AlumnoGenerable[] {
  return mezclar(alumnos, aleatorio).sort(
    (a, b) => (b.nivelMotriz ?? NIVEL_MEDIO) - (a.nivelMotriz ?? NIVEL_MEDIO),
  )
}

/** Orden de equipos en zigzag (serpiente): 0,1,2…N-1,N-1…2,1,0,0,1,2… */
function ordenSerpiente(numEquipos: number): number[] {
  const ida = Array.from({ length: numEquipos }, (_, i) => i)
  const vuelta = [...ida].reverse()
  return [...ida, ...vuelta]
}

/** Reparte una lista ya ordenada sobre equipos con hueco, siguiendo un orden de visita dado. */
function repartirRespetandoCapacidad(
  ordenados: string[],
  tamanios: number[],
  ocupacion: number[],
  ordenVisita: number[],
): string[][] {
  const equipos: string[][] = tamanios.map(() => [])
  let puntero = 0
  for (const id of ordenados) {
    // Busca, desde donde se quedó la ronda anterior, el próximo equipo con hueco.
    let vueltas = 0
    while (ocupacion[ordenVisita[puntero % ordenVisita.length]] >= tamanios[ordenVisita[puntero % ordenVisita.length]]) {
      puntero++
      vueltas++
      if (vueltas > ordenVisita.length) break // todos llenos (no debería pasar si suman bien)
    }
    const equipo = ordenVisita[puntero % ordenVisita.length]
    equipos[equipo].push(id)
    ocupacion[equipo]++
    puntero++
  }
  return equipos
}

function violaVinculo(
  equipoDe: Map<string, number>,
  vinculos: VinculoGenerable[],
  a: string,
  equipoA: number,
  b: string,
  equipoB: number,
): boolean {
  // Simula el intercambio a↔b y comprueba si algún vínculo quedaría roto.
  const de = new Map(equipoDe)
  de.set(a, equipoB)
  de.set(b, equipoA)
  for (const v of vinculos) {
    const ta = de.get(v.alumnoA)
    const tb = de.get(v.alumnoB)
    if (ta === undefined || tb === undefined) continue
    if (v.tipo === 'separar' && ta === tb) return true
    if (v.tipo === 'juntar' && ta !== tb) return true
  }
  return false
}

function intercambiar(equipos: string[][], equipoDe: Map<string, number>, a: string, b: string) {
  const ta = equipoDe.get(a)!
  const tb = equipoDe.get(b)!
  equipos[ta][equipos[ta].indexOf(a)] = b
  equipos[tb][equipos[tb].indexOf(b)] = a
  equipoDe.set(a, tb)
  equipoDe.set(b, ta)
}

/**
 * Restricción dura: recorre los vínculos y arregla el primero que encuentre
 * roto con un intercambio aleatorio acotado. Si tras `maxIntentos` sigue sin
 * poder, devuelve qué vínculo bloquea.
 */
function repararVinculos(
  equipos: string[][],
  equipoDe: Map<string, number>,
  vinculos: VinculoGenerable[],
  fijados: Set<string>,
  aleatorio: () => number,
  maxIntentos = 500,
): string | undefined {
  function primeraViolacion(): VinculoGenerable | undefined {
    return vinculos.find((v) => {
      const ta = equipoDe.get(v.alumnoA)
      const tb = equipoDe.get(v.alumnoB)
      if (ta === undefined || tb === undefined) return false
      return v.tipo === 'separar' ? ta === tb : ta !== tb
    })
  }

  for (let intento = 0; intento < maxIntentos; intento++) {
    const problema = primeraViolacion()
    if (!problema) return undefined

    const ta = equipoDe.get(problema.alumnoA)!
    if (problema.tipo === 'separar') {
      const candidatos = equipos.flatMap((eq, t) =>
        t === ta ? [] : eq.filter((id) => !fijados.has(id)),
      )
      if (candidatos.length === 0 || fijados.has(problema.alumnoB)) continue
      const c = candidatos[Math.floor(aleatorio() * candidatos.length)]
      intercambiar(equipos, equipoDe, problema.alumnoB, c)
    } else {
      const tb = equipoDe.get(problema.alumnoB)!
      if (fijados.has(problema.alumnoB) && fijados.has(problema.alumnoA)) continue
      const equipoDestino = fijados.has(problema.alumnoA) ? tb : ta
      const alumnoAMover = fijados.has(problema.alumnoA) ? problema.alumnoA : problema.alumnoB
      const otroEquipo = equipoDe.get(alumnoAMover)!
      const candidatos = equipos[equipoDestino].filter((id) => !fijados.has(id))
      if (candidatos.length === 0) continue
      const c = candidatos[Math.floor(aleatorio() * candidatos.length)]
      if (equipoDe.get(c) === otroEquipo) continue
      intercambiar(equipos, equipoDe, alumnoAMover, c)
    }
  }

  const problema = primeraViolacion()
  if (!problema) return undefined
  return `No se ha podido ${problema.tipo === 'separar' ? 'separar' : 'juntar'} a los alumnos del vínculo (demasiadas restricciones para el número de equipos).`
}

/** Balance genérico ±1 por categoría (género o «tiene apoyos»), sin romper vínculos ya logrados. */
function repararBalance(
  equipos: string[][],
  equipoDe: Map<string, number>,
  categoriaDe: Map<string, string | null>,
  valores: string[],
  vinculos: VinculoGenerable[],
  fijados: Set<string>,
  maxVueltas = 300,
) {
  for (let vuelta = 0; vuelta < maxVueltas; vuelta++) {
    let cambiado = false
    for (const valor of valores) {
      const conteos = equipos.map((eq) => eq.filter((id) => categoriaDe.get(id) === valor).length)
      const max = Math.max(...conteos)
      const min = Math.min(...conteos)
      if (max - min <= 1) continue

      const tMax = conteos.indexOf(max)
      const tMin = conteos.indexOf(min)
      const donante = equipos[tMax].find((id) => !fijados.has(id) && categoriaDe.get(id) === valor)
      const receptor = equipos[tMin].find(
        (id) => !fijados.has(id) && categoriaDe.get(id) !== valor,
      )
      if (!donante || !receptor) continue
      if (violaVinculo(equipoDe, vinculos, donante, tMax, receptor, tMin)) continue

      intercambiar(equipos, equipoDe, donante, receptor)
      cambiado = true
    }
    if (!cambiado) break
  }
}

/** Best-effort: reduce coincidencias con equipos anteriores sin romper lo ya logrado. */
function priorizarNuevosCompaneros(
  equipos: string[][],
  equipoDe: Map<string, number>,
  historial: string[][],
  vinculos: VinculoGenerable[],
  fijados: Set<string>,
  aleatorio: () => number,
  maxIntentos = 200,
) {
  if (historial.length === 0) return

  const coincidencias = new Map<string, number>()
  const clave = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  for (const equipoPasado of historial) {
    for (let i = 0; i < equipoPasado.length; i++) {
      for (let j = i + 1; j < equipoPasado.length; j++) {
        const k = clave(equipoPasado[i], equipoPasado[j])
        coincidencias.set(k, (coincidencias.get(k) ?? 0) + 1)
      }
    }
  }

  const puntuacionEquipo = (t: number) => {
    let suma = 0
    const miembros = equipos[t]
    for (let i = 0; i < miembros.length; i++) {
      for (let j = i + 1; j < miembros.length; j++) {
        suma += coincidencias.get(clave(miembros[i], miembros[j])) ?? 0
      }
    }
    return suma
  }

  for (let intento = 0; intento < maxIntentos; intento++) {
    const ta = Math.floor(aleatorio() * equipos.length)
    let tb = Math.floor(aleatorio() * equipos.length)
    if (tb === ta) tb = (tb + 1) % equipos.length
    const candidatosA = equipos[ta].filter((id) => !fijados.has(id))
    const candidatosB = equipos[tb].filter((id) => !fijados.has(id))
    if (candidatosA.length === 0 || candidatosB.length === 0) continue

    const a = candidatosA[Math.floor(aleatorio() * candidatosA.length)]
    const b = candidatosB[Math.floor(aleatorio() * candidatosB.length)]
    if (violaVinculo(equipoDe, vinculos, a, ta, b, tb)) continue

    const antes = puntuacionEquipo(ta) + puntuacionEquipo(tb)
    intercambiar(equipos, equipoDe, a, b)
    const despues = puntuacionEquipo(ta) + puntuacionEquipo(tb)
    if (despues >= antes) intercambiar(equipos, equipoDe, a, b) // deshace si no mejora
  }
}

/** Filtro de «solo presentes hoy»: ningún ausente debe llegar al generador. */
export function filtrarPorPresentes(
  alumnos: AlumnoGenerable[],
  presentesIds: Set<string>,
): AlumnoGenerable[] {
  return alumnos.filter((a) => presentesIds.has(a.id))
}

export function generarEquipos(opciones: OpcionesGeneracion): ResultadoGeneracion {
  const {
    alumnos,
    tamanios,
    modo,
    equilibrarGenero = false,
    repartirApoyos = false,
    vinculos = [],
    priorizarNuevos = false,
    historial = [],
    fijados = {},
    aleatorio = Math.random,
  } = opciones

  const total = tamanios.reduce((n, t) => n + t, 0)
  if (alumnos.length !== total) {
    throw new Error(
      `resolverTamanios no cuadra: ${alumnos.length} alumnos para ${total} plazas.`,
    )
  }

  const equipos: string[][] = tamanios.map(() => [])
  const equipoDe = new Map<string, number>()
  const fijadosSet = new Set(Object.keys(fijados))

  // 1) Coloca primero a los fijados (de un «Regenerar»).
  const ocupacion = tamanios.map(() => 0)
  for (const [id, t] of Object.entries(fijados)) {
    equipos[t].push(id)
    equipoDe.set(id, t)
    ocupacion[t]++
  }

  const libres = alumnos.filter((a) => !fijadosSet.has(a.id))

  // 2) Reparto base según el modo, respetando la capacidad restante.
  if (modo === 'homogeneo') {
    const ranking = ordenarPorNivel(libres, aleatorio)
    let cursor = 0
    for (let t = 0; t < tamanios.length; t++) {
      const hueco = tamanios[t] - ocupacion[t]
      for (let k = 0; k < hueco && cursor < ranking.length; k++, cursor++) {
        equipos[t].push(ranking[cursor].id)
        equipoDe.set(ranking[cursor].id, t)
      }
    }
  } else {
    const ordenados =
      modo === 'heterogeneo' ? ordenarPorNivel(libres, aleatorio) : mezclar(libres, aleatorio)
    const orden = ordenSerpiente(tamanios.length)
    const asignados = repartirRespetandoCapacidad(
      ordenados.map((a) => a.id),
      tamanios,
      ocupacion,
      orden,
    )
    for (let t = 0; t < tamanios.length; t++) {
      for (const id of asignados[t]) {
        equipos[t].push(id)
        equipoDe.set(id, t)
      }
    }
  }

  // 3) Restricciones combinables, en orden de dureza.
  let advertencia: string | undefined
  if (vinculos.length > 0) {
    advertencia = repararVinculos(equipos, equipoDe, vinculos, fijadosSet, aleatorio)
  }

  if (equilibrarGenero) {
    const categoriaGenero = new Map(alumnos.map((a) => [a.id, a.genero ?? null]))
    repararBalance(equipos, equipoDe, categoriaGenero, ['chico', 'chica'], vinculos, fijadosSet)
  }

  if (repartirApoyos) {
    const categoriaApoyos = new Map(alumnos.map((a) => [a.id, a.tieneApoyos ? 'apoyo' : null]))
    repararBalance(equipos, equipoDe, categoriaApoyos, ['apoyo'], vinculos, fijadosSet)
  }

  if (priorizarNuevos) {
    priorizarNuevosCompaneros(equipos, equipoDe, historial, vinculos, fijadosSet, aleatorio)
  }

  return { equipos, advertencia }
}
