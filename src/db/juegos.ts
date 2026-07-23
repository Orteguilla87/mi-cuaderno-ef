import Fuse from 'fuse.js'
import { db, nuevoId } from './db'
import type { Juego } from './types'

/**
 * Importador del Banco de Juegos.
 *
 * La estructura del JSON de origen no se conoce de antemano, así que en lugar
 * de exigir un formato se mapean los alias habituales (castellano e inglés) y
 * TODO campo no reconocido se conserva en `extra`. Importar nunca debe perder
 * información: si el mapeo se queda corto, el dato sigue ahí.
 */
const ALIAS: Record<keyof typeof CAMPOS, string[]> = {
  nombre: ['nombre', 'name', 'titulo', 'título', 'title'],
  descripcion: ['descripcion', 'descripción', 'description', 'desc', 'explicacion', 'explicación', 'desarrollo'],
  material: ['material', 'materiales', 'materials', 'equipment'],
  espacio: ['espacio', 'space', 'lugar', 'instalacion', 'instalación'],
  agrupamiento: ['agrupamiento', 'agrupacion', 'agrupación', 'grouping', 'organizacion', 'organización'],
  intensidad: ['intensidad', 'intensity', 'esfuerzo'],
  edades: ['edades', 'edad', 'ages', 'age', 'curso', 'cursos', 'nivel', 'niveles'],
  etiquetas: ['etiquetas', 'tags', 'categorias', 'categorías', 'categoria', 'categoría', 'tipo', 'tipos'],
}

const CAMPOS = {
  nombre: '',
  descripcion: '',
  material: '',
  espacio: '',
  agrupamiento: '',
  intensidad: '',
  edades: '',
  etiquetas: '',
}

/** Índice alias→campo, en minúsculas y sin acentos, para tolerar variantes. */
const INDICE_ALIAS = new Map<string, keyof typeof CAMPOS>()
for (const [campo, alias] of Object.entries(ALIAS)) {
  for (const a of alias) INDICE_ALIAS.set(normalizar(a), campo as keyof typeof CAMPOS)
}

function normalizar(s: string): string {
  // \p{Diacritic} evita escribir el rango de combinantes a mano: mismo efecto,
  // sin caracteres invisibles en el fuente.
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Cualquier escalar a texto; los arrays se aplanan a lista de textos. */
function aLista(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean)
  if (typeof valor === 'string') {
    // Admite "aros, conos; picas" en un solo campo.
    return valor
      .split(/[,;·|]/)
      .map((v) => v.trim())
      .filter(Boolean)
  }
  if (valor == null) return []
  return [String(valor)]
}

function aTexto(valor: unknown): string | undefined {
  if (valor == null) return undefined
  if (Array.isArray(valor)) return valor.join(', ')
  const s = String(valor).trim()
  return s || undefined
}

export interface ResultadoImportacion {
  juegos: Juego[]
  /** Claves del origen que no se reconocieron (se guardan en `extra`). */
  camposNoReconocidos: string[]
  /** Entradas descartadas por no tener nombre. */
  descartados: number
}

/**
 * Convierte el JSON pegado en juegos. Acepta un array suelto, `{ GAMES: [...] }`
 * o `{ juegos: [...] }`. No escribe en la base: primero se muestra la vista
 * previa y solo entonces se confirma (§7: nada de escrituras a ciegas).
 */
export function analizarJuegos(json: string): ResultadoImportacion {
  const datos = JSON.parse(json)
  const bruto: unknown[] = Array.isArray(datos)
    ? datos
    : (datos?.GAMES ?? datos?.games ?? datos?.juegos ?? datos?.data ?? [])

  if (!Array.isArray(bruto)) {
    throw new Error('El JSON no contiene una lista de juegos reconocible.')
  }

  const noReconocidos = new Set<string>()
  const juegos: Juego[] = []
  let descartados = 0

  for (const entrada of bruto) {
    if (typeof entrada !== 'object' || entrada === null) {
      descartados++
      continue
    }

    const origen = entrada as Record<string, unknown>
    const mapeado: Partial<Record<keyof typeof CAMPOS, unknown>> = {}
    const extra: Record<string, unknown> = {}

    for (const [clave, valor] of Object.entries(origen)) {
      const campo = INDICE_ALIAS.get(normalizar(clave))
      if (campo && mapeado[campo] === undefined) {
        mapeado[campo] = valor
      } else if (!campo) {
        // `id` del origen se conserva como extra: el id interno es propio.
        extra[clave] = valor
        noReconocidos.add(clave)
      }
    }

    const nombre = aTexto(mapeado.nombre)
    if (!nombre) {
      descartados++
      continue
    }

    juegos.push({
      id: nuevoId(),
      nombre,
      descripcion: aTexto(mapeado.descripcion),
      material: aLista(mapeado.material),
      espacio: aTexto(mapeado.espacio),
      agrupamiento: aTexto(mapeado.agrupamiento),
      intensidad: aTexto(mapeado.intensidad),
      edades: aLista(mapeado.edades),
      etiquetas: aLista(mapeado.etiquetas),
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    })
  }

  return { juegos, camposNoReconocidos: [...noReconocidos], descartados }
}

/** Sustituye el banco entero. Devuelve la función de deshacer. */
export async function reemplazarBanco(juegos: Juego[]): Promise<() => Promise<void>> {
  const previos = await db.juegos.toArray()
  await db.transaction('rw', db.juegos, async () => {
    await db.juegos.clear()
    await db.juegos.bulkAdd(juegos)
  })
  return async () => {
    await db.transaction('rw', db.juegos, async () => {
      await db.juegos.clear()
      await db.juegos.bulkAdd(previos)
    })
  }
}

/** Añade sin borrar lo existente. Devuelve la función de deshacer. */
export async function anadirAlBanco(juegos: Juego[]): Promise<() => Promise<void>> {
  await db.juegos.bulkAdd(juegos)
  const ids = juegos.map((j) => j.id)
  return async () => void (await db.juegos.bulkDelete(ids))
}

/**
 * Búsqueda difusa (§2: Fuse.js). Tolera erratas y acentos, que es lo que hace
 * falta buscando con una mano en mitad de la pista.
 */
export function buscarJuegos(juegos: Juego[], consulta: string): Juego[] {
  const q = consulta.trim()
  if (!q) return juegos

  const fuse = new Fuse(juegos, {
    keys: [
      { name: 'nombre', weight: 3 },
      { name: 'etiquetas', weight: 2 },
      { name: 'descripcion', weight: 1 },
      { name: 'material', weight: 1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
  })
  return fuse.search(q).map((r) => r.item)
}

/** Valores presentes en el banco para poblar los filtros. */
export function facetas(juegos: Juego[]): { etiquetas: string[]; espacios: string[] } {
  const etiquetas = new Set<string>()
  const espacios = new Set<string>()
  for (const j of juegos) {
    j.etiquetas.forEach((t) => etiquetas.add(t))
    if (j.espacio) espacios.add(j.espacio)
  }
  const ordenar = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'es'))
  return { etiquetas: ordenar(etiquetas), espacios: ordenar(espacios) }
}
