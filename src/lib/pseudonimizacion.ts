import type { Alumno, Grupo } from '../db/types'
import { candidatosAlumno, coincidencias, type CandidatoAlumno } from './emparejarAlumno'
import { aISO, deISO, diaLectivo, sumarDias } from './fechas'

export type { CandidatoAlumno }

/**
 * Nada de nombres ni contenido de la base viaja a la API sin pasar por aquí
 * (§1.2, §6). Los alumnos y grupos se sustituyen por tokens `[A1]`/`[G1]`
 * antes de construir el prompt; la respuesta del modelo solo trae tokens, que
 * se resuelven de vuelta en local con el mismo mapa.
 */

export interface MapaTokens {
  alumnoPorToken: Map<string, Alumno>
  grupoPorToken: Map<string, Grupo>
  tokenPorAlumno: Map<string, string>
  tokenPorGrupo: Map<string, string>
}

export function construirMapaTokens(alumnos: Alumno[], grupos: Grupo[]): MapaTokens {
  const alumnoPorToken = new Map<string, Alumno>()
  const tokenPorAlumno = new Map<string, string>()
  alumnos.forEach((a, i) => {
    const t = `A${i + 1}`
    alumnoPorToken.set(t, a)
    tokenPorAlumno.set(a.id, t)
  })

  const grupoPorToken = new Map<string, Grupo>()
  const tokenPorGrupo = new Map<string, string>()
  grupos.forEach((g, i) => {
    const t = `G${i + 1}`
    grupoPorToken.set(t, g)
    tokenPorGrupo.set(g.id, t)
  })

  return { alumnoPorToken, grupoPorToken, tokenPorAlumno, tokenPorGrupo }
}

/**
 * Sustituye las menciones de alumno y de grupo por sus tokens `[A1]`/`[G1]`.
 *
 * Los alumnos se localizan con el MISMO emparejador que decide a quién se
 * refiere el dictado (`lib/emparejarAlumno.ts`): solo se tokeniza a quien supera
 * su umbral, y por tramos del texto, no con `\b`. El `\b` de JavaScript no
 * reconoce las letras acentuadas como letras, así que «Íker» o «Álvaro» al
 * principio de frase no casaban y viajaban EN CLARO a la API (§1.2).
 */
export function pseudonimizarTexto(texto: string, mapa: MapaTokens, alumnos: Alumno[], grupos: Grupo[]): string {
  // Tramos sin solaparse, del más fiable al menos: una misma mención no puede
  // convertirse en dos tokens.
  const tramos: { inicio: number; fin: number; token: string }[] = []
  for (const c of coincidencias(texto, alumnos)) {
    const token = mapa.tokenPorAlumno.get(c.alumno.id)
    if (!token) continue
    if (tramos.some((t) => c.inicio < t.fin && t.inicio < c.fin)) continue
    tramos.push({ inicio: c.inicio, fin: c.fin, token })
  }
  let salida = texto
  for (const t of [...tramos].sort((a, b) => b.inicio - a.inicio)) {
    salida = `${salida.slice(0, t.inicio)}[${t.token}]${salida.slice(t.fin)}`
  }

  const porLongitud = (a: string, b: string) => b.length - a.length
  const nombresGrupo = grupos.map((g) => g.nombre).sort(porLongitud)
  for (const nombre of nombresGrupo) {
    const grupo = grupos.find((g) => g.nombre === nombre)
    if (!grupo) continue
    const token = mapa.tokenPorGrupo.get(grupo.id)
    if (!token) continue
    salida = reemplazarPalabra(salida, nombre, `[${token}]`)
  }

  return salida
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Como `\b…\b`, pero contando las letras acentuadas como letras. */
function reemplazarPalabra(texto: string, buscado: string, reemplazo: string): string {
  if (!buscado.trim()) return texto
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(buscado)}(?![\\p{L}\\p{N}])`, 'giu')
  return texto.replace(re, reemplazo)
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * Resuelve fechas relativas en local antes de enviar nada: «hoy», «ayer»,
 * «mañana», o el nombre de un día de la semana (el más próximo hacia atrás).
 * Si no hay ninguna mención, devuelve hoy.
 */
export function resolverFechaRelativa(texto: string, hoy = aISO()): string {
  const t = texto.toLowerCase()
  if (/\bayer\b/.test(t)) return sumarDias(hoy, -1)
  if (/\bmañana\b/.test(t)) return sumarDias(hoy, 1)
  if (/\bhoy\b/.test(t)) return hoy

  for (let i = 0; i < DIAS_SEMANA.length; i++) {
    if (new RegExp(`\\b${DIAS_SEMANA[i]}\\b`).test(t)) {
      let f = hoy
      for (let paso = 0; paso < 7; paso++) {
        if (deISO(f).getDay() === i) return f
        f = sumarDias(f, -1)
      }
    }
  }
  return hoy
}

/**
 * Fuzzy local de nombres (§6): los alumnos mencionados en el texto, de más a
 * menos parecido, SOLO los que superan el umbral de `lib/emparejarAlumno.ts`.
 * Vacío si nadie se parece lo bastante: entonces la UI enseña la lista del
 * grupo, no al «menos malo». Para decidir entre ellos, `decidir()` del mismo
 * módulo (empate dentro de `MARGEN` → se pregunta con chips).
 *
 * ——— INVARIANTE: `alumnos` YA VIENE ACOTADO AL GRUPO ———
 *
 * Quien llama pasa SOLO los alumnos activos del grupo que se dictó (o del grupo
 * del contexto). Nunca la base entera. Esta función no puede devolver un alumno
 * de otra clase porque no lo ve, y esa es exactamente la garantía que se quiere:
 * con los ~200 alumnos de los nueve grupos delante, un «Pablo» de 3ºB ganaba al
 * «Pablo» de 4ºA por tener el nombre mejor escrito, y nadie lo notaba porque no
 * había empate que disparara los chips.
 *
 * `texto` es el dictado SIN la mención del grupo (`lib/grupoEnTexto.ts`): si no,
 * «cuarto» y «tercero» competirían con los nombres y casarían con apellidos
 * tipo «Cuartero».
 */
export function buscarAlumnoEnTexto(texto: string, alumnos: Alumno[]): CandidatoAlumno[] {
  return candidatosAlumno(texto, alumnos)
}

/**
 * El grupo que está en clase en esa fecha y hora, según el horario.
 *
 * Es el desempate de «cuarto A» cuando hay dos grupos que se llaman así —4ºA de
 * EF y 4ºA de Lengua, mismo alumnado, áreas distintas—: a las 10:15 de un martes
 * solo uno de los dos está en la pista. Devuelve `undefined` si no hay
 * exactamente uno, porque con cero o con dos no hay nada que deducir y hay que
 * preguntar: el sistema no elige por el maestro.
 */
export function grupoPorFranja(grupos: Grupo[], fecha: string, hora: string): Grupo | undefined {
  const dia = diaLectivo(fecha)
  if (dia === null) return undefined
  const enClase = grupos.filter((g) =>
    g.horario.some((f) => f.diaSemana === dia && f.horaInicio <= hora && hora < f.horaFin),
  )
  return enClase.length === 1 ? enClase[0] : undefined
}
