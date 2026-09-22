/**
 * Ejecución de las intenciones del parser local (§6, 2.3).
 *
 * Aquí no hay lógica de dominio nueva: cada caso llama a la función que ya
 * existe —la misma que usa la pantalla correspondiente— y devuelve su función
 * de deshacer. Eso es lo que significa «la IA enruta, no ejecuta»: si el
 * enrutado se equivoca, lo que se deshace es una llamada normal de la app.
 *
 * Las acciones sin riesgo (sorteo, equipos, marcador, navegar) no escriben en
 * la base y por eso no traen deshacer: traen `respuesta`, que es lo que se
 * enseña en pantalla.
 */

import { db, nuevoId } from './db'
import { crearObservacion } from './observaciones'
import { crearColumna, eliminarColumna, guardarValor } from './cuaderno'
import { obtenerCursoActivo } from './curso'
import { trimestreDe } from '../lib/calendarioEscolar'
import { aISO } from '../lib/fechas'
import { siguienteAleatorio } from './aleatorio'
import { alumnosGenerables, vinculosDelGrupo } from './equipos'
import { asignar, ETIQUETA_LESIONADO } from './etiquetasAlumno'
import { generarEquipos, resolverTamanios } from '../lib/generadorEquipos'
import { useMarcador } from '../store/marcador'
import { navegar } from '../lib/router'
import type { Intencion } from '../lib/intenciones'
import type { AccionAgente, EstadoAsistencia, Grupo } from './types'

export interface ResultadoEjecucion {
  /** Lo que se le enseña al maestro. Siempre hay algo que decir. */
  respuesta: string
  /** Ausente en las acciones que no escriben: no hay nada que deshacer. */
  deshacer?: () => Promise<void>
}

/** Crea o actualiza el registro de asistencia del día, devolviendo el deshacer. */
async function escribirAsistencia(
  alumnoId: string,
  fecha: string,
  cambios: { estado?: EstadoAsistencia; chandal?: boolean },
): Promise<() => Promise<void>> {
  const previo = await db.asistencias.where('[alumnoId+fecha]').equals([alumnoId, fecha]).first()
  if (previo) {
    const antes = { ...previo }
    await db.asistencias.update(previo.id, cambios)
    return async () => void (await db.asistencias.put(antes))
  }
  const nuevo = {
    id: nuevoId(),
    alumnoId,
    fecha,
    estado: cambios.estado ?? ('presente' as const),
    chandal: cambios.chandal ?? true,
  }
  await db.asistencias.add(nuevo)
  return async () => void (await db.asistencias.delete(nuevo.id))
}

export async function ejecutarIntencion(
  intencion: Intencion,
  grupo: Grupo,
): Promise<ResultadoEjecucion> {
  switch (intencion.accion) {
    // ——————————— sin riesgo ———————————

    case 'alumno_aleatorio': {
      const estado = await siguienteAleatorio(grupo.id, { soloPresentes: true })
      if (!estado.elegido)
        return {
          respuesta: estado.agotado
            ? 'Ya han salido todos los del grupo. Reinicia el ciclo en Herramientas.'
            : 'No hay a quién sacar en este grupo.',
        }
      const nombre = estado.elegido.alias || estado.elegido.nombre
      return { respuesta: `${nombre} (${estado.yaSalieron} de ${estado.total} del ciclo).` }
    }

    case 'generar_equipos': {
      const { alumnos, porId } = await alumnosGenerables(grupo.id, true)
      if (alumnos.length === 0) return { respuesta: 'No hay alumnado con el que hacer equipos.' }
      const tamanios = resolverTamanios(alumnos.length, {
        porNumEquipos: intencion.porNumEquipos,
        porTamano: intencion.porTamano,
        sobra: 'repartir',
      })
      const { equipos, advertencia } = generarEquipos({
        alumnos,
        tamanios,
        modo: intencion.modo,
        vinculos: await vinculosDelGrupo(grupo.id),
      })
      const lineas = equipos.map(
        (miembros, i) =>
          `Equipo ${i + 1}: ${miembros
            .map((id) => porId.get(id))
            .map((a) => (a ? a.alias || a.nombre : '?'))
            .join(', ')}`,
      )
      return { respuesta: [advertencia, ...lineas].filter(Boolean).join('\n') }
    }

    case 'marcador_abrir':
      useMarcador.getState().abrir(intencion.equipos)
      return { respuesta: intencion.resumen }

    case 'marcador_puntos': {
      const { equipos, abrir, sumar } = useMarcador.getState()
      // Puntuar con el marcador cerrado lo abre: la orden da por hecho que hay
      // partido, y lo que quiere ver el maestro es el tanteo.
      if (!useMarcador.getState().visible) abrir()
      const i = intencion.equipo - 1
      if (i < 0 || i >= equipos.length)
        return { respuesta: `No hay un equipo ${intencion.equipo} en el marcador.` }
      sumar(i, intencion.delta)
      const puntos = useMarcador.getState().equipos[i].puntos
      return { respuesta: `${equipos[i].nombre}: ${puntos} puntos.` }
    }

    case 'abrir_vista':
      navegar(intencion.ruta)
      return { respuesta: intencion.resumen }

    // ——————————— escritura reversible ———————————

    case 'pasar_lista': {
      const deshacer = await escribirAsistencia(intencion.alumnoId, intencion.fecha, {
        estado: intencion.estado,
        chandal: intencion.chandal,
      })
      return { respuesta: intencion.resumen, deshacer }
    }

    case 'observacion': {
      const { deshacer } = await crearObservacion({
        alumnoId: intencion.alumnoId,
        grupoId: grupo.id,
        tipo: 'conducta',
        signo: intencion.signo,
        texto: intencion.texto,
        tags: [],
        fecha: intencion.fecha,
      })
      return { respuesta: intencion.resumen, deshacer }
    }

    case 'contador_celda': {
      const previo = await db.valores
        .where('[columnaId+alumnoId]')
        .equals([intencion.columnaId, intencion.alumnoId])
        .first()
      // El contador cuenta desde lo que ya hubiera, no desde cero: sumar un
      // punto a quien lleva tres tiene que dejarlo en cuatro.
      const numero = Math.max(0, (previo?.numero ?? 0) + intencion.delta)
      const deshacer = await guardarValor(intencion.columnaId, intencion.alumnoId, { numero })
      return { respuesta: `${intencion.resumen} (queda en ${numero})`, deshacer }
    }

    case 'nota_celda': {
      const deshacer = await guardarValor(intencion.columnaId, intencion.alumnoId, {
        numero: intencion.valor,
      })
      return { respuesta: intencion.resumen, deshacer }
    }

    case 'etiqueta_lesionado': {
      const alumno = await db.alumnos.get(intencion.alumnoId)
      if (!alumno) return { respuesta: 'No encuentro a ese alumno.' }
      const antes = {
        etiquetas: alumno.etiquetas,
        etiquetasHasta: alumno.etiquetasHasta,
      }
      const hasta = intencion.hasta ? new Date(`${intencion.hasta}T23:59:59`).getTime() : undefined
      await asignar(intencion.alumnoId, ETIQUETA_LESIONADO, true, hasta)
      return {
        respuesta: intencion.resumen,
        deshacer: async () => void (await db.alumnos.update(intencion.alumnoId, antes)),
      }
    }

    // ——————————— escritura sensible ———————————

    case 'crear_columna': {
      // El trimestre no se pregunta: es el de hoy según el calendario del
      // curso. Crear una columna en el trimestre equivocado se ve enseguida en
      // el Cuaderno, y la alternativa —una pregunta más en la tarjeta— cuesta
      // más que arrastrarla.
      const curso = await obtenerCursoActivo()
      const trimestre = trimestreDe(aISO(), curso) ?? 1
      const id = await crearColumna({
        grupoId: grupo.id,
        trimestre,
        titulo: intencion.titulo,
        tipo: intencion.tipo,
      })
      return {
        respuesta: `Columna «${intencion.titulo}» creada en el trimestre ${trimestre}.`,
        // Deshacer «crear» es borrar: `eliminarColumna` se lleva también sus
        // filas y sus valores, que es justo lo que nació con ella.
        deshacer: async () => void (await eliminarColumna(id)),
      }
    }
  }
}

/**
 * Apunta en el log del agente una acción del parser local.
 *
 * No pasa por `registrarEnLog`, que está tipado contra el catálogo de las ocho
 * herramientas de la API: estas son otras diez y falsear el nombre dejaría un
 * log que miente sobre lo que se hizo.
 */
export async function registrarIntencion(
  transcripcion: string,
  intencion: Intencion,
): Promise<string> {
  const entrada: AccionAgente = {
    id: nuevoId(),
    timestamp: Date.now(),
    transcripcion,
    accion: intencion.accion,
    payload: { ...intencion, resumen: undefined },
    estado: 'aplicada',
  }
  await db.accionesAgente.add(entrada)
  return entrada.id
}
