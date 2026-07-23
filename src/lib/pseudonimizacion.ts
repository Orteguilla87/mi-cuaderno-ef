import Fuse from 'fuse.js'
import type { Alumno, Grupo } from '../db/types'
import { aISO, deISO, diaLectivo, sumarDias } from './fechas'

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

/** Sustituye menciones de nombre/alias y de grupo por sus tokens `[A1]`/`[G1]`. */
export function pseudonimizarTexto(texto: string, mapa: MapaTokens, alumnos: Alumno[], grupos: Grupo[]): string {
  let salida = texto

  const porLongitud = (a: string, b: string) => b.length - a.length
  const nombresAlumno = alumnos
    .flatMap((a) => [a.alias, a.nombre, `${a.nombre} ${a.apellidos}`.trim()].filter(Boolean))
    .sort(porLongitud)
  for (const nombre of nombresAlumno) {
    const alumno = alumnos.find((a) => a.alias === nombre || a.nombre === nombre || `${a.nombre} ${a.apellidos}`.trim() === nombre)
    if (!alumno) continue
    const token = mapa.tokenPorAlumno.get(alumno.id)
    if (!token) continue
    salida = reemplazarPalabra(salida, nombre, `[${token}]`)
  }

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

function reemplazarPalabra(texto: string, buscado: string, reemplazo: string): string {
  if (!buscado.trim()) return texto
  const re = new RegExp(`\\b${escaparRegex(buscado)}\\b`, 'gi')
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

export interface CandidatoAlumno {
  alumno: Alumno
  puntuacion: number
}

/**
 * Fuzzy local de nombres (§6): busca al alumno mencionado en el texto entre
 * los activos. Si hay varios candidatos con puntuación parecida, la UI debe
 * desambiguar con chips en vez de adivinar.
 */
export function buscarAlumnoEnTexto(texto: string, alumnos: Alumno[]): CandidatoAlumno[] {
  const fuse = new Fuse(alumnos, {
    keys: [
      { name: 'alias', weight: 2 },
      { name: 'nombre', weight: 2 },
      { name: 'apellidos', weight: 1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
  })

  const palabras = texto.split(/\s+/).filter((p) => p.length > 2)
  const puntuados = new Map<string, number>()
  for (const palabra of palabras) {
    for (const r of fuse.search(palabra)) {
      const score = 1 - (r.score ?? 1)
      const previo = puntuados.get(r.item.id) ?? 0
      if (score > previo) puntuados.set(r.item.id, score)
    }
  }

  return [...puntuados.entries()]
    .map(([id, puntuacion]) => ({ alumno: alumnos.find((a) => a.id === id)!, puntuacion }))
    .sort((a, b) => b.puntuacion - a.puntuacion)
    .slice(0, 4)
}

/** El día de la fecha, para elegir el grupo que toca en ese momento (contexto del agente). */
export function grupoQueTocaEn(grupos: Grupo[], fecha: string): Grupo | undefined {
  const dia = diaLectivo(fecha)
  if (dia === null) return undefined
  return grupos.find((g) => g.horario.some((f) => f.diaSemana === dia))
}
