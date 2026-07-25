import { criteriosDeGrupo } from './criterios'
import { db, nuevoId } from './db'
import type {
  Columna,
  Etapa,
  Rubrica,
  TipoColumna,
  Trimestre,
  ValorCelda,
} from './types'
import { TIPOS_NUMERICOS } from './types'

/** Metadatos de cada tipo de columna, para poblar el selector y la rejilla. */
export const TIPOS_COLUMNA: {
  tipo: TipoColumna
  etiqueta: string
  descripcion: string
}[] = [
  { tipo: 'numero', etiqueta: 'Número', descripcion: 'Nota en una escala, p. ej. 0–10' },
  {
    tipo: 'positivo_negativo',
    etiqueta: 'Positivos y negativos',
    descripcion: 'Contadores + y − que se acumulan',
  },
  { tipo: 'caritas', etiqueta: 'Caritas', descripcion: 'Escala visual de 3 o 5 niveles' },
  { tipo: 'si_no', etiqueta: 'Lista de control', descripcion: 'Conseguido o no conseguido' },
  { tipo: 'rubrica', etiqueta: 'Rúbrica', descripcion: 'Varios criterios con niveles' },
  { tipo: 'texto', etiqueta: 'Texto', descripcion: 'Anotación libre por alumno' },
  {
    tipo: 'calculo',
    etiqueta: 'Cálculo',
    descripcion: 'Media ponderada de otras columnas',
  },
]

/**
 * Tipos a los que se puede aplicar un valor en bloque a todo el grupo: solo los
 * de valor único y simple. Rúbrica, texto, positivos/negativos y cálculo quedan
 * fuera.
 */
export const TIPOS_APLICABLES_GRUPO: TipoColumna[] = ['numero', 'caritas', 'si_no']

/**
 * Tipos disponibles según la etapa: Infantil no admite números (§6). El cálculo
 * produce una nota numérica, así que tampoco se ofrece en Infantil.
 */
export function tiposDisponibles(etapa: Etapa): typeof TIPOS_COLUMNA {
  if (etapa === 'infantil')
    return TIPOS_COLUMNA.filter((t) => !TIPOS_NUMERICOS.includes(t.tipo) && t.tipo !== 'calculo')
  return TIPOS_COLUMNA
}

export async function crearColumna(datos: {
  grupoId: string
  trimestre: Trimestre
  titulo: string
  tipo: TipoColumna
  udId?: string
  criterioCodigo?: string
  fecha?: string
  escala?: Columna['escala']
  caritas?: 3 | 5
  rubricaId?: string
  calculo?: Columna['calculo']
}): Promise<string> {
  const existentes = await db.columnas
    .where('[grupoId+trimestre]')
    .equals([datos.grupoId, datos.trimestre])
    .toArray()

  const columna: Columna = {
    id: nuevoId(),
    grupoId: datos.grupoId,
    trimestre: datos.trimestre,
    titulo: datos.titulo.trim(),
    tipo: datos.tipo,
    orden: existentes.length,
    fecha: datos.fecha,
    udId: datos.udId,
    criterioCodigo: datos.criterioCodigo,
    escala: datos.tipo === 'numero' ? (datos.escala ?? { min: 0, max: 10, decimales: 1 }) : undefined,
    caritas: datos.tipo === 'caritas' ? (datos.caritas ?? 3) : undefined,
    rubricaId: datos.tipo === 'rubrica' ? datos.rubricaId : undefined,
    calculo: datos.tipo === 'calculo' ? (datos.calculo ?? { componentes: [] }) : undefined,
  }
  await db.columnas.add(columna)
  return columna.id
}

/** Borra la columna y todos sus valores. Devuelve la función de deshacer. */
export async function eliminarColumna(columnaId: string): Promise<() => Promise<void>> {
  const columna = await db.columnas.get(columnaId)
  const valores = await db.valores.where('columnaId').equals(columnaId).toArray()
  if (!columna) return async () => {}

  await db.transaction('rw', [db.columnas, db.valores], async () => {
    await db.valores.bulkDelete(valores.map((v) => v.id))
    await db.columnas.delete(columnaId)
  })

  return async () => {
    await db.transaction('rw', [db.columnas, db.valores], async () => {
      await db.columnas.add(columna)
      await db.valores.bulkAdd(valores)
    })
  }
}

/** Mueve una columna una posición a izquierda o derecha. */
export async function moverColumna(columnaId: string, delta: number): Promise<void> {
  const columna = await db.columnas.get(columnaId)
  if (!columna) return
  const hermanas = (
    await db.columnas
      .where('[grupoId+trimestre]')
      .equals([columna.grupoId, columna.trimestre])
      .toArray()
  ).sort((a, b) => a.orden - b.orden)

  const i = hermanas.findIndex((c) => c.id === columnaId)
  const j = i + delta
  if (j < 0 || j >= hermanas.length) return
  ;[hermanas[i], hermanas[j]] = [hermanas[j], hermanas[i]]
  // Se reescriben todos los órdenes: es barato y evita huecos y empates.
  await db.transaction('rw', db.columnas, async () => {
    for (let k = 0; k < hermanas.length; k++) {
      await db.columnas.update(hermanas[k].id, { orden: k })
    }
  })
}

export async function columnasDe(grupoId: string, trimestre: Trimestre): Promise<Columna[]> {
  const lista = await db.columnas.where('[grupoId+trimestre]').equals([grupoId, trimestre]).toArray()
  return lista.sort((a, b) => a.orden - b.orden)
}

/** Valores de un conjunto de columnas, indexados por `columnaId|alumnoId`. */
export async function valoresDe(columnaIds: string[]): Promise<Map<string, ValorCelda>> {
  if (columnaIds.length === 0) return new Map()
  const lista = await db.valores.where('columnaId').anyOf(columnaIds).toArray()
  return new Map(lista.map((v) => [`${v.columnaId}|${v.alumnoId}`, v]))
}

/**
 * Escribe (o limpia) el valor de una celda. Devuelve la función de deshacer,
 * porque en la rejilla se toca muy rápido y equivocarse es lo normal.
 */
export async function guardarValor(
  columnaId: string,
  alumnoId: string,
  cambios: Partial<Omit<ValorCelda, 'id' | 'columnaId' | 'alumnoId' | 'actualizado'>>,
): Promise<() => Promise<void>> {
  const previo = await db.valores
    .where('[columnaId+alumnoId]')
    .equals([columnaId, alumnoId])
    .first()

  if (previo) {
    const antes = { ...previo }
    await db.valores.update(previo.id, { ...cambios, actualizado: Date.now() })
    return async () => void (await db.valores.put(antes))
  }

  const nuevo: ValorCelda = {
    id: nuevoId(),
    columnaId,
    alumnoId,
    ...cambios,
    actualizado: Date.now(),
  }
  await db.valores.add(nuevo)
  return async () => void (await db.valores.delete(nuevo.id))
}

/**
 * Aplica un mismo valor a toda una columna en un solo lote.
 *
 * Por defecto solo escribe en los alumnos que aún NO tienen valor; con
 * `sobrescribir`, también en los que ya lo tienen. Devuelve UNA función de
 * deshacer para todo el lote (mismo patrón que `eliminarColumna`): guarda el
 * estado previo de las celdas tocadas y lo restaura de una vez.
 */
export async function aplicarAGrupo(
  columnaId: string,
  alumnoIds: string[],
  cambios: Partial<Omit<ValorCelda, 'id' | 'columnaId' | 'alumnoId' | 'actualizado'>>,
  sobrescribir: boolean,
): Promise<{ aplicadas: number; deshacer: () => Promise<void> }> {
  const previos = await db.valores.where('columnaId').equals(columnaId).toArray()
  const previoPorAlumno = new Map(previos.map((v) => [v.alumnoId, v]))

  const nuevos: ValorCelda[] = []
  const actualizados: { id: string; antes: ValorCelda }[] = []

  for (const alumnoId of alumnoIds) {
    const previo = previoPorAlumno.get(alumnoId)
    if (previo) {
      if (!sobrescribir) continue
      actualizados.push({ id: previo.id, antes: { ...previo } })
    } else {
      nuevos.push({ id: nuevoId(), columnaId, alumnoId, ...cambios, actualizado: Date.now() })
    }
  }

  await db.transaction('rw', db.valores, async () => {
    if (nuevos.length) await db.valores.bulkAdd(nuevos)
    for (const { id } of actualizados) {
      await db.valores.update(id, { ...cambios, actualizado: Date.now() })
    }
  })

  const idsNuevos = nuevos.map((v) => v.id)
  const deshacer = async () => {
    await db.transaction('rw', db.valores, async () => {
      if (idsNuevos.length) await db.valores.bulkDelete(idsNuevos)
      for (const { antes } of actualizados) await db.valores.put(antes)
    })
  }

  return { aplicadas: nuevos.length + actualizados.length, deshacer }
}

/**
 * Cuántos alumnos recibirían el valor según el modo, para el resumen previo
 * («Se aplicará a N alumnos») sin tener que escribir nada.
 */
export function contarDestinatarios(
  columnaId: string,
  alumnoIds: string[],
  valores: Map<string, ValorCelda>,
  sobrescribir: boolean,
): number {
  if (sobrescribir) return alumnoIds.length
  return alumnoIds.filter((id) => !valores.get(`${columnaId}|${id}`)).length
}

/**
 * Valor de una celda normalizado a 0–10, o `null` si no aplica.
 *
 * Es la pieza que permitirá promediar columnas de tipos distintos dentro de una
 * unidad: una carita, un «conseguido» y un 7 tienen que poder convivir en la
 * misma media. Los positivos/negativos y el texto NO se normalizan: un contador
 * no representa un logro sobre 10, y forzarlo daría medias engañosas.
 */
export function valorNormalizado(
  columna: Columna,
  valor: ValorCelda | undefined,
  rubrica?: Rubrica,
): number | null {
  if (!valor) return null

  switch (columna.tipo) {
    case 'numero': {
      if (valor.numero == null) return null
      const { min, max } = columna.escala ?? { min: 0, max: 10 }
      if (max === min) return null
      return ((valor.numero - min) / (max - min)) * 10
    }
    case 'caritas': {
      if (valor.carita == null) return null
      const niveles = columna.caritas ?? 3
      return (valor.carita / (niveles - 1)) * 10
    }
    case 'si_no':
      if (valor.marcado == null) return null
      return valor.marcado ? 10 : 0
    case 'rubrica': {
      if (!rubrica || !valor.rubrica) return null
      const valores = rubrica.niveles.map((n) => n.valor)
      const min = Math.min(...valores)
      const max = Math.max(...valores)
      if (max === min) return null

      let suma = 0
      let pesos = 0
      for (const criterio of rubrica.criterios) {
        const nivelId = valor.rubrica[criterio.id]
        const nivel = rubrica.niveles.find((n) => n.id === nivelId)
        if (!nivel) continue
        const peso = criterio.pesoPct > 0 ? criterio.pesoPct : 1
        suma += ((nivel.valor - min) / (max - min)) * 10 * peso
        pesos += peso
      }
      return pesos === 0 ? null : suma / pesos
    }
    default:
      // positivo_negativo, texto y calculo no se auto-normalizan aquí. El de
      // cálculo se resuelve con `calcularColumna`, que necesita el resto de
      // columnas y no cabe en esta firma.
      return null
  }
}

/**
 * Resultado de una columna calculada para un alumno.
 * `total` = componentes de la fórmula; `contadas` = los que tenían nota. La
 * media es parcial cuando `contadas < total`.
 */
export interface ResultadoCalculo {
  valor: number | null
  contadas: number
  total: number
}

/**
 * Valor 0–10 de una columna de cálculo para un alumno: media ponderada de sus
 * columnas componentes.
 *
 * Extiende el mismo motor que ya normaliza cualquier celda a 0–10
 * (`valorNormalizado`) y promedia con pesos como las rúbricas: NO es un sistema
 * de fórmulas paralelo.
 *
 * - Pesos normalizados siempre: se reparten proporcionalmente aunque no sumen
 *   100 (con todos a 0, pesan por igual). Misma regla que la media de rúbrica.
 * - Una nota ausente excluye ese componente y renormaliza el resto de pesos.
 * - Encadenado: un componente puede ser a su vez de tipo cálculo; se resuelve
 *   recursivamente, con memoización por columna·alumno y detección de ciclos
 *   (una referencia circular devuelve `null` en vez de colgar).
 */
export function calcularColumna(
  columna: Columna,
  columnasPorId: Map<string, Columna>,
  valores: Map<string, ValorCelda>,
  alumnoId: string,
  rubricas: Map<string, Rubrica>,
  memo: Map<string, ResultadoCalculo> = new Map(),
  enCurso: Set<string> = new Set(),
): ResultadoCalculo {
  const claveMemo = `${columna.id}|${alumnoId}`
  const cacheado = memo.get(claveMemo)
  if (cacheado) return cacheado

  const componentes = columna.calculo?.componentes ?? []
  const total = componentes.length

  // Ciclo: la columna se está resolviendo más arriba en la pila. Cortar aquí
  // evita la recursión infinita; el resultado inválido se propaga como null.
  if (enCurso.has(columna.id)) return { valor: null, contadas: 0, total }
  enCurso.add(columna.id)

  let suma = 0
  let pesos = 0
  let contadas = 0

  for (const comp of componentes) {
    const col = columnasPorId.get(comp.columnaId)
    if (!col) continue

    let normal: number | null
    if (col.tipo === 'calculo') {
      normal = calcularColumna(col, columnasPorId, valores, alumnoId, rubricas, memo, enCurso).valor
    } else {
      const v = valores.get(`${col.id}|${alumnoId}`)
      normal = valorNormalizado(col, v, col.rubricaId ? rubricas.get(col.rubricaId) : undefined)
    }
    if (normal == null) continue

    const peso = comp.pesoPct > 0 ? comp.pesoPct : 1
    suma += normal * peso
    pesos += peso
    contadas++
  }

  enCurso.delete(columna.id)
  const resultado: ResultadoCalculo = {
    valor: pesos === 0 ? null : suma / pesos,
    contadas,
    total,
  }
  memo.set(claveMemo, resultado)
  return resultado
}

export interface MediaAlumno {
  alumnoId: string
  media: number | null
  /** Columnas con valor que han entrado en la media. */
  contadas: number
}

/**
 * Media 0–10 de un alumno sobre un conjunto de columnas. Se usa tanto para el
 * total del trimestre como para la media por unidad didáctica.
 */
export function mediaDe(
  columnas: Columna[],
  valores: Map<string, ValorCelda>,
  alumnoId: string,
  rubricas: Map<string, Rubrica>,
): MediaAlumno {
  let suma = 0
  let contadas = 0
  for (const c of columnas) {
    // Las columnas de cálculo se saltan: ya son una media de otras columnas de
    // la unidad, así que promediarlas otra vez contaría esas notas dos veces.
    if (c.tipo === 'calculo') continue
    const v = valores.get(`${c.id}|${alumnoId}`)
    const n = valorNormalizado(c, v, c.rubricaId ? rubricas.get(c.rubricaId) : undefined)
    if (n == null) continue
    suma += n
    contadas++
  }
  return { alumnoId, media: contadas === 0 ? null : suma / contadas, contadas }
}

/** Agrupa las columnas por unidad didáctica, para las medias por UD. */
export function agruparPorUnidad(columnas: Columna[]): Map<string | null, Columna[]> {
  const mapa = new Map<string | null, Columna[]>()
  for (const c of columnas) {
    const clave = c.udId ?? null
    const lista = mapa.get(clave) ?? []
    lista.push(c)
    mapa.set(clave, lista)
  }
  return mapa
}

// ——— Rúbricas ———

/**
 * Niveles de logro por defecto: 5 tramos puntuados 2, 4, 6, 8 y 10.
 *
 * Los valores van sobre 10 a propósito, así la puntuación de la rúbrica se lee
 * directamente como nota y no hay que traducir nada mentalmente.
 */
const NIVELES_POR_DEFECTO: { etiqueta: string; valor: number }[] = [
  { etiqueta: 'No conseguido', valor: 2 },
  { etiqueta: 'En proceso', valor: 4 },
  { etiqueta: 'Conseguido', valor: 6 },
  { etiqueta: 'Notable', valor: 8 },
  { etiqueta: 'Excelente', valor: 10 },
]

/** Rúbrica nueva con una estructura de partida editable. */
export async function crearRubrica(titulo: string, etapa?: Etapa): Promise<string> {
  const niveles = NIVELES_POR_DEFECTO.map((n) => ({ ...n, id: nuevoId() }))
  const rubrica: Rubrica = {
    id: nuevoId(),
    titulo: titulo.trim() || 'Rúbrica sin título',
    etapa,
    niveles,
    criterios: [{ id: nuevoId(), titulo: 'Criterio 1', pesoPct: 100 }],
  }
  await db.rubricas.add(rubrica)
  return rubrica.id
}

export async function duplicarRubrica(rubricaId: string): Promise<string | null> {
  const origen = await db.rubricas.get(rubricaId)
  if (!origen) return null
  // Los ids de niveles y criterios se regeneran para que editarla no afecte a
  // los valores ya guardados con la rúbrica original.
  const mapaNiveles = new Map(origen.niveles.map((n) => [n.id, nuevoId()]))
  const copia: Rubrica = {
    id: nuevoId(),
    titulo: `${origen.titulo} (copia)`,
    etapa: origen.etapa,
    niveles: origen.niveles.map((n) => ({ ...n, id: mapaNiveles.get(n.id)! })),
    criterios: origen.criterios.map((c) => ({
      ...c,
      id: nuevoId(),
      descripciones: c.descripciones
        ? Object.fromEntries(
            Object.entries(c.descripciones).map(([nivelId, texto]) => [
              mapaNiveles.get(nivelId) ?? nivelId,
              texto,
            ]),
          )
        : undefined,
    })),
  }
  await db.rubricas.add(copia)
  return copia.id
}

// ——— Copiar/pegar estructura de columnas (Bloque 3) ———

export interface ResultadoValidacionPegado {
  /** false si la etapa de origen y destino no coinciden: no se pega nada. */
  permitido: boolean
  motivo?: string
  /** Columnas que sí se pegarían. */
  aPegar: Columna[]
  /** Títulos de las columnas apartadas por tener un criterio que no existe en el ciclo destino. */
  criteriosNoEncajan: string[]
}

/**
 * Valida qué se podría pegar sin escribir nada: para el resumen previo
 * («Se crearán N columnas») y para el propio `pegarColumnas`.
 *
 * REGLA DURA: Infantil y Primaria no comparten columnas (§ petición del
 * usuario): la evaluación de Infantil es cualitativa y sus columnas no
 * admiten números, así que mezclar etapas no tiene sentido y se bloquea del
 * todo, sin pegar ni una.
 */
export async function validarPegado(
  columnas: Columna[],
  etapaOrigen: Etapa,
  etapaDestino: Etapa,
  nivelDestino: number,
): Promise<ResultadoValidacionPegado> {
  if (etapaOrigen !== etapaDestino) {
    return {
      permitido: false,
      motivo: `No se puede pegar de ${etapaOrigen === 'infantil' ? 'Infantil' : 'Primaria'} a ${etapaDestino === 'infantil' ? 'Infantil' : 'Primaria'}: la evaluación de Infantil es cualitativa y no comparte estructura con Primaria.`,
      aPegar: [],
      criteriosNoEncajan: [],
    }
  }

  const validos = new Set((await criteriosDeGrupo(etapaDestino, nivelDestino)).map((c) => c.codigo))
  const aPegar: Columna[] = []
  const criteriosNoEncajan: string[] = []
  for (const c of columnas) {
    if (c.criterioCodigo && !validos.has(c.criterioCodigo)) {
      criteriosNoEncajan.push(c.titulo)
      continue
    }
    aPegar.push(c)
  }

  return { permitido: true, aPegar, criteriosNoEncajan }
}

export interface ResultadoPegado {
  creadas: number
  criteriosNoEncajan: string[]
  motivo?: string
  deshacer: () => Promise<void>
}

/**
 * Pega una estructura de columnas copiada en otro grupo/trimestre. Solo
 * estructura — nunca se leen ni se copian `db.valores` (las calificaciones no
 * se pegan jamás).
 *
 * Las columnas de tipo 'calculo' remapean `componentes.columnaId` al id nuevo
 * de la columna del propio lote; un componente que apunte fuera del lote (p.
 * ej. al copiar una sola columna de cálculo) se descarta, porque su
 * referencia no existiría en el destino. `udId` se deja fuera: la unidad
 * didáctica está ligada a un nivel y trimestre concretos, distintos del
 * destino.
 */
export async function pegarColumnas(
  grupoId: string,
  trimestre: Trimestre,
  columnas: Columna[],
  etapaOrigen: Etapa,
  etapaDestino: Etapa,
  nivelDestino: number,
): Promise<ResultadoPegado> {
  const validacion = await validarPegado(columnas, etapaOrigen, etapaDestino, nivelDestino)
  if (!validacion.permitido) {
    return { creadas: 0, criteriosNoEncajan: [], motivo: validacion.motivo, deshacer: async () => {} }
  }

  const existentes = await db.columnas
    .where('[grupoId+trimestre]')
    .equals([grupoId, trimestre])
    .toArray()
  let orden = existentes.length

  const mapaIds = new Map(validacion.aPegar.map((c) => [c.id, nuevoId()]))
  const nuevas: Columna[] = validacion.aPegar.map((c) => ({
    ...c,
    id: mapaIds.get(c.id)!,
    grupoId,
    trimestre,
    orden: orden++,
    udId: undefined,
    calculo: c.calculo
      ? {
          componentes: c.calculo.componentes
            .filter((comp) => mapaIds.has(comp.columnaId))
            .map((comp) => ({ ...comp, columnaId: mapaIds.get(comp.columnaId)! })),
        }
      : undefined,
  }))

  if (nuevas.length > 0) await db.columnas.bulkAdd(nuevas)

  const idsCreadas = nuevas.map((c) => c.id)
  return {
    creadas: nuevas.length,
    criteriosNoEncajan: validacion.criteriosNoEncajan,
    deshacer: async () => void (await db.columnas.bulkDelete(idsCreadas)),
  }
}
