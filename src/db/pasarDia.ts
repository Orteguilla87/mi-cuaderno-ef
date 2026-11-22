import { cicloDeCurso, ordinalCiclo } from '../lib/ciclos'
import { formatoDiaCorto } from '../lib/fechas'
import { db, nuevoId } from './db'
import { gruposVisiblesDelCurso } from './grupos'
import { crearLote, type LotePlan } from './lotes'
import {
  contenidoDe,
  desplazarContenido,
  sesionesEnOrden,
  sesionVacia,
  sinContenido,
  type ClaseEnPrevia,
  type MovimientoContenido,
} from './planificador'
import type { ContenidoSinClase, Grupo, Sesion } from './types'

/* ——————————— Pasar programación al siguiente día (global) ———————————
 *
 * Se pierde un día de clase —excursión, huelga, evento— y TODA la programación
 * tiene que correrse, en todos los grupos a la vez. Es un bucle sobre «Mover a
 * la derecha» (`desplazarContenido`), con k = clases del grupo ese día:
 *  - las k sesiones del día quedan VACÍAS (siguen existiendo: no se cancela la
 *    clase, se libera);
 *  - su contenido y el de las siguientes avanzan k posiciones en la secuencia
 *    de sesiones del grupo (fecha y franja, solo días lectivos);
 *  - el desplazamiento se para en la primera sesión vacía, y si hacen falta
 *    varias, en las primeras que se encuentren.
 *
 * Si se acaba el curso antes, lo que no cabe NO se borra ni se crea una sesión
 * para ello. El maestro elige por grupo: dejar ese grupo como está o aparcar lo
 * que sobra en la bandeja «Sin clase asignada» (`contenidoSinClase`).
 *
 * Se mueve CONTENIDO, no sesiones: cada fila conserva fecha, franja y hora.
 * Nada fuera del Planificador apunta a una sesión por su id —Cuaderno, equipos,
 * asistencia y observaciones van por fecha—, así que no hay nada más que mover.
 */

export type ModoDesborde = 'cancelar' | 'bandeja'

export interface PreviaGrupoPasarDia {
  grupoId: string
  nombre: string
  /** Clases del grupo ese día. */
  k: number
  /** De ellas, cuántas tenían contenido: lo que de verdad se corre. */
  conContenido: number
  movimientos: MovimientoContenido[]
  /** Sesiones vacías que absorben el desplazamiento, en orden. */
  seDetieneEn: ClaseEnPrevia[]
  /** Contenido que no cabe antes de fin de curso. */
  sinUbicacion: { titulo: string; unidad: string | null; de: ClaseEnPrevia }[]
  /** Solo si desborda: qué se hace con lo que no cabe. */
  desborde: ModoDesborde | null
  /** `false` si el grupo se queda como está (desmarcado o desborde cancelado). */
  seAplica: boolean
}

export interface PreviaPasarDia {
  fecha: string
  grupos: PreviaGrupoPasarDia[]
  /** Avisos de grupos del mismo ciclo que dejan de ir a la par. No bloquean. */
  desalineados: string[]
}

/** Lo que se escribiría: interno, para no calcular dos veces. */
interface Calculo {
  previa: PreviaPasarDia
  antes: Sesion[]
  despues: Sesion[]
  sinClase: ContenidoSinClase[]
  aplicados: string[]
}

const tituloVisible = (s: Sesion) => s.titulo.trim() || 'Sesión sin título'

/**
 * Grupos que tienen alguna sesión ese día, en el orden de la app. Son los que la
 * acción marca por defecto. Un día no lectivo no tiene ninguno.
 */
export async function gruposConClaseEn(fecha: string): Promise<Grupo[]> {
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!curso) return []
  const grupos = await gruposVisiblesDelCurso(curso.id)
  const delDia = await db.sesiones.where('fecha').equals(fecha).toArray()
  return grupos.filter(
    (g) => sesionesEnOrden(delDia.filter((s) => s.grupoId === g.id), g, curso, fecha).length > 0,
  )
}

async function calcular(
  fecha: string,
  grupoIds: string[],
  desbordes: Record<string, ModoDesborde>,
): Promise<Calculo> {
  const curso = await db.cursos.filter((c) => c.activo).first()
  if (!curso) throw new Error('No hay ningún curso escolar activo')
  const unidades = new Map((await db.unidades.toArray()).map((u) => [u.id, u.titulo]))
  const unidadDe = (s: Sesion) => (s.udId ? (unidades.get(s.udId) ?? null) : null)
  const marcados = new Set(grupoIds)
  // Todos los del día, marcados o no: los desmarcados cuentan para avisar de
  // que un grupo del mismo ciclo se queda atrás.
  const candidatos = await gruposConClaseEn(fecha)

  const previaGrupos: PreviaGrupoPasarDia[] = []
  const antes: Sesion[] = []
  const despues: Sesion[] = []
  const sinClase: ContenidoSinClase[] = []
  const aplicados: string[] = []
  /** Hasta dónde llega el desplazamiento de cada grupo, para la desalineación. */
  const alcance = new Map<string, string | null>()

  for (const grupo of candidatos) {
    const enOrden = sesionesEnOrden(
      await db.sesiones.where('grupoId').equals(grupo.id).toArray(),
      grupo,
      curso,
      fecha,
    )
    const delDia = enOrden.filter((x) => x.sesion.fecha === fecha)
    const posteriores = enOrden.filter((x) => x.sesion.fecha > fecha)
    const r = desplazarContenido(delDia, posteriores, unidadDe)
    const desborda = r.sinUbicacion.length > 0
    const desborde = desborda ? (desbordes[grupo.id] ?? 'cancelar') : null
    const seAplica =
      marcados.has(grupo.id) && desborde !== 'cancelar' && delDia.some((x) => !sesionVacia(x.sesion))

    previaGrupos.push({
      grupoId: grupo.id,
      nombre: grupo.nombre,
      k: delDia.length,
      conContenido: delDia.filter((x) => !sesionVacia(x.sesion)).length,
      movimientos: r.movimientos,
      seDetieneEn: r.seDetieneEn,
      sinUbicacion: r.sinUbicacion.map((x) => ({
        titulo: tituloVisible(x.sesion),
        unidad: unidadDe(x.sesion),
        de: x.de,
      })),
      desborde,
      seAplica,
    })

    if (!marcados.has(grupo.id)) continue
    alcance.set(
      grupo.id,
      !seAplica ? null : desborda ? curso.fin : (r.seDetieneEn[r.seDetieneEn.length - 1]?.fecha ?? null),
    )
    if (!seAplica) continue

    aplicados.push(grupo.id)
    for (const { sesion } of delDia) {
      if (sesionVacia(sesion)) continue
      antes.push(sesion)
      despues.push(sinContenido(sesion))
    }
    antes.push(...r.tocadas)
    despues.push(...r.despues)
    const creado = new Date().toISOString()
    for (const x of r.sinUbicacion)
      sinClase.push({ id: nuevoId(), grupoId: grupo.id, contenido: contenidoDe(x.sesion), origen: x.de, creado })
  }

  // Grupos del mismo ciclo (o Infantil entero) que dejan de ir a la par porque
  // uno se para antes, desborda, o se queda sin correr.
  const desalineados: string[] = []
  const porCiclo = new Map<string, Grupo[]>()
  for (const g of candidatos) {
    const clave = g.etapa === 'infantil' ? 'infantil' : `c${cicloDeCurso(g.nivel)}`
    porCiclo.set(clave, [...(porCiclo.get(clave) ?? []), g])
  }
  for (const [clave, grupos] of porCiclo) {
    if (grupos.length < 2) continue
    const textos = grupos.map((g) => {
      const a = marcados.has(g.id) ? alcance.get(g.id) : null
      return { g, a: a ?? null, texto: a ? `${g.nombre} hasta el ${formatoDiaCorto(a)}` : `${g.nombre} no se corre` }
    })
    if (new Set(textos.map((t) => t.a)).size < 2) continue
    const nombreCiclo =
      clave === 'infantil' ? 'Infantil' : `${ordinalCiclo(Number(clave.slice(1)) as 1 | 2 | 3)} ciclo`
    desalineados.push(
      `${nombreCiclo}: ${textos.map((t) => t.texto).join('; ')}. A partir de ahí no van a la par.`,
    )
  }

  return { previa: { fecha, grupos: previaGrupos, desalineados }, antes, despues, sinClase, aplicados }
}

/** Qué pasaría, sin escribir nada. */
export async function previsualizarPasarDia(
  fecha: string,
  grupoIds: string[],
  desbordes: Record<string, ModoDesborde> = {},
): Promise<PreviaPasarDia> {
  return (await calcular(fecha, grupoIds, desbordes)).previa
}

/**
 * Aplica el paso en UNA transacción para todos los grupos y devuelve un único
 * lote con el estado exacto de antes: deshacerlo repone todos los grupos.
 */
export async function pasarProgramacionDia(
  fecha: string,
  grupoIds: string[],
  desbordes: Record<string, ModoDesborde> = {},
): Promise<{ previa: PreviaPasarDia; lote: LotePlan | null }> {
  const { previa, antes, despues, sinClase, aplicados } = await calcular(fecha, grupoIds, desbordes)
  if (!aplicados.length) return { previa, lote: null }

  await db.transaction('rw', db.sesiones, db.contenidoSinClase, async () => {
    await db.sesiones.bulkPut(despues)
    if (sinClase.length) await db.contenidoSinClase.bulkAdd(sinClase)
  })

  const n = aplicados.length
  const lote = crearLote({
    grupoId: aplicados[0],
    grupoIds: aplicados,
    tipo: 'pasar-dia',
    descripcion: `Pasar programación del ${formatoDiaCorto(fecha)} (${n} ${n === 1 ? 'grupo' : 'grupos'})`,
    antes: { sesiones: antes, cancelaciones: [], sinClase: [] },
    despues: { sesiones: despues, cancelaciones: [], sinClase },
  })
  return { previa, lote }
}
