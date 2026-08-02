import { aISO, deISO, diaLectivo, sumarDias, type DiaSemana } from './fechas'

/**
 * Parser de días no lectivos pegados a mano.
 *
 * El calendario oficial suele venir en PDF, así que la vía realista es copiar
 * las fechas y pegarlas. Se acepta lo que sale de copiar de cualquier sitio:
 * una fecha por línea, separadas por comas o puntos y coma, y rangos escritos
 * de varias formas («23/12/2026 - 7/1/2027», «23/12 a 7/1», «del 1 al 5 de mayo»
 * no: eso ya es lenguaje natural y no se intenta adivinar).
 *
 * Formatos de fecha admitidos: d/m/aaaa · d-m-aaaa · d.m.aaaa · aaaa-mm-dd · d/m
 * (sin año: se deduce del curso).
 */

const SEPARADOR_RANGO = /\s*(?:-{1,2}|–|—|\ba\b|\bhasta\b|\bal\b)\s*/i

export interface ResultadoCalendario {
  /** Días no lectivos, ISO, ordenados y sin repetir. Sin sábados ni domingos. */
  fechas: string[]
  /** Fragmentos que no se han sabido interpretar, para avisar al usuario. */
  noReconocidos: string[]
  /** Fechas válidas pero fuera del curso: se descartan y se informa. */
  fueraDeCurso: string[]
  /** Fines de semana omitidos al expandir rangos (nunca son lectivos). */
  finesDeSemanaOmitidos: number
}

/**
 * Convierte un fragmento en fecha ISO, o `null` si no se reconoce.
 * `anioReferencia` completa las fechas escritas sin año.
 */
export function parsearFecha(texto: string, curso?: { inicio: string; fin: string }): string | null {
  const limpio = texto.trim()
  if (!limpio) return null

  // aaaa-mm-dd
  const iso = limpio.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return construir(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  // d/m/aaaa · d-m-aaaa · d.m.aaaa
  const conAnio = limpio.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (conAnio) {
    let anio = Number(conAnio[3])
    if (anio < 100) anio += 2000 // «27» → 2027
    return construir(anio, Number(conAnio[2]), Number(conAnio[1]))
  }

  // d/m sin año: se deduce del curso, que cruza el cambio de año.
  const sinAnio = limpio.match(/^(\d{1,2})[/\-.](\d{1,2})$/)
  if (sinAnio && curso) {
    const dia = Number(sinAnio[1])
    const mes = Number(sinAnio[2])
    const anioIni = Number(curso.inicio.slice(0, 4))
    const anioFin = Number(curso.fin.slice(0, 4))
    // Septiembre–diciembre caen en el primer año; enero–agosto, en el segundo.
    const candidato = construir(mes >= 9 ? anioIni : anioFin, mes, dia)
    return candidato
  }

  return null
}

function construir(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const f = new Date(anio, mes - 1, dia)
  // Rechaza fechas imposibles (31 de febrero se desbordaría a marzo).
  if (f.getFullYear() !== anio || f.getMonth() !== mes - 1 || f.getDate() !== dia) return null
  return aISO(f)
}

function esFinDeSemana(iso: string): boolean {
  const d = deISO(iso).getDay()
  return d === 0 || d === 6
}

export function parsearCalendario(
  texto: string,
  curso: { inicio: string; fin: string },
): ResultadoCalendario {
  const fechas = new Set<string>()
  const noReconocidos: string[] = []
  const fueraDeCurso: string[] = []
  let finesDeSemanaOmitidos = 0

  const fragmentos = texto
    .split(/[\n,;]+/)
    .map((f) => f.trim())
    .filter(Boolean)

  const registrar = (iso: string) => {
    if (esFinDeSemana(iso)) {
      finesDeSemanaOmitidos++
      return
    }
    if (iso < curso.inicio || iso > curso.fin) {
      fueraDeCurso.push(iso)
      return
    }
    fechas.add(iso)
  }

  for (const fragmento of fragmentos) {
    const partes = fragmento.split(SEPARADOR_RANGO).filter(Boolean)

    if (partes.length === 2) {
      const desde = parsearFecha(partes[0], curso)
      const hasta = parsearFecha(partes[1], curso)
      if (desde && hasta && desde <= hasta) {
        let f = desde
        // Tope por si alguien pega un rango absurdo.
        for (let i = 0; f <= hasta && i < 500; i++) {
          registrar(f)
          f = sumarDias(f, 1)
        }
        continue
      }
    }

    const suelta = parsearFecha(fragmento, curso)
    if (suelta) registrar(suelta)
    else noReconocidos.push(fragmento)
  }

  return {
    fechas: [...fechas].sort(),
    noReconocidos,
    fueraDeCurso,
    finesDeSemanaOmitidos,
  }
}

/**
 * Qué es un día concreto para el calendario del curso. Es la ÚNICA fuente de
 * verdad de «¿toca clase hoy?»: la usan tanto «Hoy» como el Calendario, para no
 * repartir por dos sitios la comprobación de festivos, límites y trimestres.
 */
export type EstadoDia =
  | { tipo: 'lectivo'; dia: DiaSemana }
  | { tipo: 'finDeSemana' }
  | { tipo: 'antesDeCurso' }
  | { tipo: 'despuesDeCurso' }
  | { tipo: 'festivo' }
  /** Dentro del curso pero fuera de todo trimestre: Navidad, Semana Santa… */
  | { tipo: 'vacaciones' }

/** Curso mínimo que necesita `estadoDia`: solo fechas, ni ids ni el resto. */
export interface CursoFechas {
  inicio: string
  fin: string
  festivos: string[]
  trimestres: { inicio: string; fin: string }[]
}

/**
 * Clasifica una fecha ISO respecto al curso. Orden de decisión pensado para que
 * el motivo que se enseña sea el más informativo:
 *  1. Fin de semana: nunca hay clase, gane lo que gane el resto.
 *  2. Antes / después del curso: aún no ha empezado o ya terminó.
 *  3. Festivo explícito (incluye los rangos de vacaciones pegados a mano).
 *  4. Con trimestres cargados, un día lectivo fuera de todos ellos es vacaciones
 *     (el hueco entre trimestres). Sin trimestres, este paso no aplica.
 *  5. Si no, día lectivo.
 */
export function estadoDia(iso: string, curso: CursoFechas): EstadoDia {
  const dia = diaLectivo(iso)
  if (dia === null) return { tipo: 'finDeSemana' }
  if (iso < curso.inicio) return { tipo: 'antesDeCurso' }
  if (iso > curso.fin) return { tipo: 'despuesDeCurso' }
  if (curso.festivos.includes(iso)) return { tipo: 'festivo' }
  if (curso.trimestres.length > 0 && !curso.trimestres.some((t) => iso >= t.inicio && iso <= t.fin))
    return { tipo: 'vacaciones' }
  return { tipo: 'lectivo', dia }
}

/** Atajo: ¿toca clase este día? Azúcar sobre `estadoDia` para condiciones sueltas. */
export function esDiaLectivo(iso: string, curso: CursoFechas): boolean {
  return estadoDia(iso, curso).tipo === 'lectivo'
}
