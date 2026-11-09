import type { CarpetaUnidades, UnidadDidactica } from '../db/types'
import { cicloDeCurso, cursosDelCiclo, ordinalCiclo } from './ciclos'

/**
 * Cómo se ordena el listado de unidades para encontrarlas.
 *
 * Es puro: recibe las unidades ya filtradas (etapa, archivadas) y devuelve
 * secciones. Nada se guarda: cambiar de modo solo cambia cómo se ve la lista.
 */
export type ModoOrganizar = 'curso' | 'ciclo' | 'carpeta'

export interface SeccionUnidades {
  /** Estable entre renders, para plegar y desplegar. */
  clave: string
  titulo: string
  unidades: UnidadDidactica[]
  /** Solo en modo carpeta: la carpeta de la sección, o `null` para «Sin carpeta». */
  carpetaId?: string | null
}

/** Sin acentos ni mayúsculas: «educacion» encuentra «Educación». */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

/**
 * Unidades cuyo título o alguna sesión del plan contiene todas las palabras
 * buscadas. Las sesiones cuentan porque a menudo se recuerda el juego, no el
 * nombre de la unidad.
 */
export function buscarUnidades(unidades: UnidadDidactica[], texto: string): UnidadDidactica[] {
  const palabras = normalizarBusqueda(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return unidades
  return unidades.filter((u) => {
    const pajar = normalizarBusqueda(
      [
        u.titulo,
        ...(u.sesiones ?? []).flatMap((s) => [
          s.titulo,
          ...Object.values(s.adaptaciones ?? {}).map((a) => a.titulo),
        ]),
      ].join(' \n '),
    )
    return palabras.every((p) => pajar.includes(p))
  })
}

const INFANTIL: SeccionUnidades['clave'] = 'infantil'

/**
 * Agrupa las unidades en secciones según el modo. Las secciones vacías no se
 * devuelven, salvo las carpetas: una carpeta recién creada tiene que verse para
 * poder meter algo en ella.
 *
 * Por CURSO, una unidad de varios cursos sale en cada uno de ellos: vale para
 * todos, y es donde se la va a buscar. Por CICLO sale una sola vez.
 */
export function agruparUnidades(
  unidades: UnidadDidactica[],
  modo: ModoOrganizar,
  carpetas: CarpetaUnidades[],
): SeccionUnidades[] {
  const infantil = unidades.filter((u) => u.etapa === 'infantil')
  const primaria = unidades.filter((u) => u.etapa === 'primaria')
  const seccionInfantil: SeccionUnidades[] = infantil.length
    ? [{ clave: INFANTIL, titulo: 'Infantil · 2.º ciclo', unidades: infantil }]
    : []

  if (modo === 'curso') {
    const cursos = [...new Set(primaria.flatMap((u) => u.niveles))].sort((a, b) => a - b)
    return [
      ...seccionInfantil,
      ...cursos.map((n) => ({
        clave: `curso-${n}`,
        titulo: `${n}º de Primaria`,
        unidades: primaria.filter((u) => u.niveles.includes(n)),
      })),
    ]
  }

  if (modo === 'ciclo') {
    const ciclos = ([1, 2, 3] as const).filter((c) =>
      primaria.some((u) => cicloDeCurso(u.niveles[0] ?? 1) === c),
    )
    return [
      ...seccionInfantil,
      ...ciclos.map((c) => {
        const [a, b] = cursosDelCiclo(c)
        return {
          clave: `ciclo-${c}`,
          titulo: `${ordinalCiclo(c)} ciclo · ${a}º y ${b}º`,
          unidades: primaria.filter((u) => cicloDeCurso(u.niveles[0] ?? 1) === c),
        }
      }),
    ]
  }

  // Por carpeta. Una unidad que apunta a una carpeta que ya no existe (p. ej.
  // tras restaurar una copia parcial) cae en «Sin carpeta»: nunca se pierde.
  const existentes = new Set(carpetas.map((c) => c.id))
  const sinCarpeta = unidades.filter((u) => !u.carpetaId || !existentes.has(u.carpetaId))
  return [
    ...carpetas.map((c) => ({
      clave: `carpeta-${c.id}`,
      titulo: c.nombre,
      carpetaId: c.id,
      unidades: unidades.filter((u) => u.carpetaId === c.id),
    })),
    ...(sinCarpeta.length
      ? [{ clave: 'sin-carpeta', titulo: 'Sin carpeta', carpetaId: null, unidades: sinCarpeta }]
      : []),
  ]
}
