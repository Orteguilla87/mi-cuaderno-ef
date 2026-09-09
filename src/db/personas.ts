import { db, nuevoId } from './db'
import type { Alumno, Id } from './types'

/**
 * La misma PERSONA en dos grupos distintos.
 *
 * El maestro da dos áreas al mismo grupo de niños y tiene dos grupos
 * independientes creados —«4º EF» y «4º Lengua»—. Son las mismas personas, pero
 * cada área lleva su cuaderno, su asistencia y sus notas. `Alumno.personaId`
 * dice que dos fichas son el mismo niño; no fusiona nada.
 *
 * ——— CÓMO SE COMPARTE: AL ESCRIBIR, NO AL LEER ———
 *
 * Cada ficha conserva su propia copia de los campos compartidos, y lo que hace
 * `escribirCompartido` es escribirlos en todas a la vez. Podría haberse hecho al
 * revés —guardarlos en una tabla `personas` y resolverlos al leer—, y sale peor:
 *
 *  - Ningún camino de lectura cambia. `etiquetasDe()`, el índice `*etiquetas`,
 *    `alumnosConEtiqueta()`, el generador de equipos, los informes y el backup
 *    siguen mirando el `Alumno` y no se enteran de que existen las personas.
 *  - DESVINCULAR NO TIENE QUE COPIAR NADA. Al quitar el `personaId`, las
 *    etiquetas ya están en las dos fichas, que es exactamente lo que se pide:
 *    se conservan como propias de cada una y no se borra ninguna.
 *  - Una ficha sin `personaId` recorre el mismo código que antes de que este
 *    módulo existiera.
 *
 * ——— REGLA DURA: NUNCA SE EMPAREJA SOLO ———
 *
 * Nada de aquí escribe un `personaId` por su cuenta. Dos alumnos pueden
 * llamarse igual, y el mismo alumno estar escrito distinto en cada lista
 * («José Luis» / «Jose L.»); emparejar por nombre mezclaría en silencio los
 * datos de dos niños distintos. `lib/vinculacion.ts` solo PROPONE; vincular lo
 * pide el usuario, ficha a ficha o en bloque, y siempre se puede deshacer.
 */

/**
 * Lo que es de la PERSONA y no del área. Lista cerrada, y única fuente:
 * `personas.test.ts` la usa para comprobar que no se cuela nada de evaluación.
 *
 *  - `etiquetas`: ACNEE, TDAH, lesionado… es la condición del niño, no de la
 *    asignatura.
 *  - `apoyos`: las pautas prácticas de adaptación; lo mismo.
 *  - `notasPrivadas`, `genero`, `nivelMotriz`: datos de la persona que costaría
 *    mantener a mano en dos sitios y que divergirían en cuanto se tocara uno.
 *
 * Fuera quedan a propósito `nombre`, `apellidos` y `alias` —cada lista escribe
 * el nombre a su manera, y el asistente de vinculación existe justo porque eso
 * pasa— y `activo`: darle de baja en un área no le da de baja en la otra.
 *
 * Y fuera queda TODO lo del área: calificaciones, asistencia, celdas del
 * Cuaderno, contadores y evaluaciones cuelgan de `Alumno.id`, no de la persona.
 */
export const CAMPOS_COMPARTIDOS = [
  'etiquetas',
  'apoyos',
  'notasPrivadas',
  'genero',
  'nivelMotriz',
] as const satisfies readonly (keyof Alumno)[]

export type CampoCompartido = (typeof CAMPOS_COMPARTIDOS)[number]

/** Los cambios que `escribirCompartido` acepta: solo campos de la persona. */
export type CambiosCompartidos = Partial<Pick<Alumno, CampoCompartido>>

/**
 * Todas las fichas de la misma persona, la propia incluida y ordenadas por
 * grupo para que la UI las enseñe siempre igual.
 *
 * Sin `personaId` devuelve solo la propia: una ficha no vinculada se comporta
 * exactamente como antes de que este módulo existiera.
 */
export async function fichasDe(alumno: Alumno): Promise<Alumno[]> {
  if (!alumno.personaId) return [alumno]
  const hermanas = await db.alumnos.where('personaId').equals(alumno.personaId).toArray()
  if (hermanas.length === 0) return [alumno]
  return hermanas.sort((a, b) => a.grupoId.localeCompare(b.grupoId))
}

/** Igual que `fichasDe`, partiendo del id. Devuelve vacío si la ficha ya no está. */
export async function fichasDeId(alumnoId: Id): Promise<Alumno[]> {
  const alumno = await db.alumnos.get(alumnoId)
  return alumno ? fichasDe(alumno) : []
}

/** Las OTRAS fichas de la misma persona: las que no son esta. */
export async function otrasFichasDe(alumno: Alumno): Promise<Alumno[]> {
  return (await fichasDe(alumno)).filter((f) => f.id !== alumno.id)
}

/**
 * Escribe campos de la persona en TODAS sus fichas a la vez, y devuelve el
 * deshacer, que repone cada ficha tal como estaba.
 *
 * Es el único camino por el que se tocan los campos de `CAMPOS_COMPARTIDOS`:
 * usar `db.alumnos.update` para uno de ellos dejaría las fichas divergiendo en
 * silencio, que es justo lo que este módulo existe para evitar.
 */
export async function escribirCompartido(
  alumnoId: Id,
  cambios: CambiosCompartidos,
): Promise<{ deshacer: () => Promise<void> }> {
  let previas: Alumno[] = []

  await db.transaction('rw', [db.alumnos], async () => {
    previas = await fichasDeId(alumnoId)
    for (const ficha of previas) await db.alumnos.update(ficha.id, cambios)
  })

  return {
    deshacer: async () => {
      await db.transaction('rw', [db.alumnos], async () => {
        // `put` y no `update`: repone también los campos que el cambio dejó en
        // `undefined`, que un `update` parcial no sabría borrar.
        for (const previa of previas) await db.alumnos.put(previa)
      })
    },
  }
}

/**
 * Marca dos o más fichas como la misma persona.
 *
 * Al vincular hay que decidir con qué valores se queda la persona, porque cada
 * ficha traía los suyos. Manda la ficha `principal` —la que el usuario estaba
 * mirando cuando confirmó—, y sus campos compartidos se copian a las demás. La
 * alternativa, fusionar por unión, inventaría un estado que el usuario no ha
 * visto en ninguna de las dos pantallas.
 *
 * Devuelve el deshacer, que repone las fichas enteras: sin `personaId` y con
 * sus valores anteriores.
 */
export async function vincular(
  principalId: Id,
  otrosIds: Id[],
): Promise<{ personaId: Id; deshacer: () => Promise<void> }> {
  let previas: Alumno[] = []
  let personaId = ''

  await db.transaction('rw', [db.alumnos], async () => {
    const principal = await db.alumnos.get(principalId)
    if (!principal) throw new Error('La ficha ya no existe')

    // Si alguna de las implicadas ya era de una persona, se reutiliza ese id en
    // vez de crear otro: vincular una tercera ficha a un par ya vinculado tiene
    // que dejar las tres juntas, no dos personas distintas.
    const implicadas = [principal, ...(await db.alumnos.bulkGet(otrosIds))].filter(
      (a): a is Alumno => a !== undefined,
    )
    personaId = principal.personaId ?? implicadas.find((a) => a.personaId)?.personaId ?? nuevoId()

    // Las fichas que ya colgaban de esas personas también entran: si no, media
    // vinculación anterior se quedaría fuera y la persona saldría partida.
    const familia = new Map<string, Alumno>()
    for (const a of implicadas) familia.set(a.id, a)
    for (const a of implicadas) {
      if (!a.personaId) continue
      for (const h of await db.alumnos.where('personaId').equals(a.personaId).toArray())
        familia.set(h.id, h)
    }

    previas = [...familia.values()]
    const compartidos = valoresCompartidos(principal)
    for (const ficha of previas) await db.alumnos.update(ficha.id, { ...compartidos, personaId })
  })

  return {
    personaId,
    deshacer: async () => {
      await db.transaction('rw', [db.alumnos], async () => {
        for (const previa of previas) await db.alumnos.put(previa)
      })
    },
  }
}

/**
 * Quita el `personaId` de UNA ficha. Las demás siguen vinculadas entre sí.
 *
 * NO se borra nada: los campos compartidos se quedan en la ficha tal como
 * estaban, como propios suyos. Es lo que la UI avisa antes de confirmar.
 */
export async function desvincular(alumnoId: Id): Promise<{ deshacer: () => Promise<void> }> {
  const previa = await db.alumnos.get(alumnoId)
  if (!previa) throw new Error('La ficha ya no existe')
  await db.alumnos.update(alumnoId, { personaId: undefined })
  return { deshacer: async () => void (await db.alumnos.put(previa)) }
}

/** Los valores compartidos de una ficha, tal cual, para copiarlos a sus hermanas. */
function valoresCompartidos(alumno: Alumno): CambiosCompartidos {
  const valores: Record<string, unknown> = {}
  for (const campo of CAMPOS_COMPARTIDOS) valores[campo] = alumno[campo]
  return valores as CambiosCompartidos
}
