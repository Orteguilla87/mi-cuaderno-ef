import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Mic, Pencil, Undo2, Users, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  apilarDeshacer,
  deshacerDelLog,
  ejecutarAccion,
  pendientesDeDeshacer,
  interpretarLocal,
  registrarEnLog,
  desempatarGrupo,
  resolverGrupo,
  type AccionResuelta,
  type ResultadoInterpretar,
} from '../db/agente'
import { interpretarComentarioConApi, interpretarConApi, resolverTokens } from '../db/agenteApi'
import { useConfig } from '../db/config'
import { db } from '../db/db'
import { gruposVisibles } from '../db/grupos'
import { resumirAsistencia } from '../db/asistencia'
import { responder } from '../db/consultas'
import { ejecutarIntencion, registrarIntencion } from '../db/acciones'
import { columnasDe, TIPOS_COLUMNA, tiposDisponibles } from '../db/cuaderno'
import { obtenerCursoActivo } from '../db/curso'
import { trimestreDe } from '../lib/calendarioEscolar'
import { aISO } from '../lib/fechas'
import {
  interpretarIntenciones,
  ordenProhibida,
  type ColumnaConocida,
  type Intencion,
} from '../lib/intenciones'
import { canonico, emparejarAlumno, emparejarNombre, fragmentoParaAlias } from '../lib/emparejarAlumno'
import {
  partirPorCurso,
  redactarComentario,
  sanearComentario,
  signoDeComentario,
} from '../lib/dictadoEstructurado'
import { buscarAlumnoEnTexto, construirMapaTokens, resolverFechaRelativa } from '../lib/pseudonimizacion'
import { navegar } from '../lib/router'
import { etiquetaDia } from '../lib/fechas'
import { useGrupoActivo } from '../store/grupoActivo'
import { useUI } from '../store/ui'
import { BotonDictado } from './BotonDictado'
import { CampoArea } from './Campo'
import { Hoja } from './Hoja'
import { SelectorGrupo } from './SelectorGrupo'
import type { Alumno, Etapa, Grupo, SignoObservacion, TipoColumna } from '../db/types'

/**
 * FAB global de voz (§5, §6). La captura es propia, con la Web Speech API del
 * navegador (`lib/dictado.ts`): un toque en el FAB abre la hoja y otro en
 * «Dictar» empieza a escuchar.
 *
 * Antes se dictaba con el teclado de Android, que pedía tres toques para una
 * orden. El dictado de Gboard ya mandaba el audio a Google, así que transcribir
 * con el navegador no añade exposición real y ahorra dos toques. Donde no haya
 * `SpeechRecognition` —Safari, Firefox— el campo de texto sigue siendo la vía,
 * y el teclado trae su micrófono como siempre.
 */
export function AgenteVoz() {
  const [abierta, setAbierta] = useState(false)
  const capasAbiertas = useUI((s) => s.capasAbiertas)
  // Con una hoja, la pizarra o el bloqueo por PIN encima, el FAB solo estorba
  // (tapaba justo lo que esas capas quieren que se vea o se pulse): se retira
  // en vez de disputar el z-index con ellas.
  const oculto = capasAbiertas > 0

  return (
    <>
      <button
        onClick={() => setAbierta(true)}
        style={{ height: 'var(--alto-fab)', width: 'var(--alto-fab)' }}
        className={
          'capa-fab fixed right-4 z-fab flex items-center justify-center rounded-full bg-acento text-white shadow-lg shadow-acento/30 transition-opacity active:scale-95 ' +
          (oculto ? 'pointer-events-none opacity-0' : 'opacity-100')
        }
        aria-label="Agente de voz"
        aria-hidden={oculto}
        tabIndex={oculto ? -1 : 0}
      >
        <Mic size={24} aria-hidden />
      </button>
      <HojaAgente abierta={abierta} onCerrar={() => setAbierta(false)} />
    </>
  )
}

/**
 * La tarjeta de confirmación enseña SIEMPRE el grupo y el alumno resueltos, y los
 * dos se corrigen con un toque.
 *
 * El grupo está ahí porque su ausencia era justo lo que dejaba pasar el fallo:
 * el agente resolvía un alumno de otra clase, el resumen solo decía su nombre, y
 * como el nombre era plausible nadie lo veía hasta mucho después. Con el grupo
 * delante, un error de clase se ve antes de escribir nada.
 *
 * `grupo` sin resolver no es un estado de error: es la pregunta. Pasa cuando no
 * se dictó grupo y no hay ninguno abierto, o cuando «cuarto A» encaja con dos
 * áreas y ni el horario ni el contexto desempatan. Se enseña la misma tarjeta con
 * el selector abierto y «Confirmar» apagado, en vez de adivinar.
 */
type Fase =
  | { paso: 'dictado'; texto: string; error?: string }
  | {
      paso: 'confirmar'
      /** El dictado tal cual, para reeditar y para el log. */
      texto: string
      /** El dictado sin la mención del grupo: lo único que ve el fuzzy de nombres. */
      textoSinGrupo: string
      grupo?: Grupo
      /** Los grupos del selector: los candidatos ambiguos, o todos si no se dijo ninguno. */
      gruposOfrecidos: Grupo[]
      accion?: AccionResuelta
      /** Lo que resolvió el parser local. Puede traer varias (órdenes encadenadas). */
      intenciones?: Intencion[]
      /** Índices que el maestro ha descartado de la lista de arriba. */
      descartadas?: number[]
      /** La orden admite varias lecturas: se elige una antes de poder confirmar. */
      aclaracion?: { pregunta: string; opciones: Intencion[] }
      /** Quién lo resolvió: se enseña para saber si hubo llamada o no. */
      origen?: 'local' | 'ia'
      /** Candidatos de alumno DENTRO del grupo, para los chips. */
      candidatosAlumno: Alumno[]
      eligiendoAlumno: boolean
      aviso?: string
      /** No se dictó grupo: se usa el abierto en la app. Se dice, para que se vea. */
      grupoPorContexto?: boolean
      /**
       * Tras elegir a mano un alumno que el emparejador no reconoció: lo que se
       * dictó para nombrarlo, que se OFRECE guardar como alias de voz. Nunca se
       * guarda sin el toque del maestro.
       */
      aliasPropuesto?: { alumno: Alumno; texto: string; guardado: boolean }
      /**
       * Dictado con la convención «nombre + de/del curso + comentario»: los tres
       * tramos ya partidos. Si está, el alumno se busca SOLO con `nombre`.
       */
      estructura?: Estructura
      /** El alumno resuelto, para enseñarlo aparte en la tarjeta. */
      alumnoResuelto?: Alumno
      /** El comentario final, ya saneado; editable antes de confirmar. */
      comentario?: string
    }
  | { paso: 'respuesta'; texto: string; enlace?: { ruta: string; etiqueta: string } }
  /** Se entendió y por eso no se hace: hay cosas que no van por voz (2.3). */
  | { paso: 'rechazada'; motivo: string }

function HojaAgente({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const config = useConfig()
  const grupoActivoId = useGrupoActivo((s) => s.grupoId)
  const [fase, setFase] = useState<Fase>({ paso: 'dictado', texto: '' })
  // Cubre la llamada de red a la API y la escritura de confirmar(): sin esto
  // el botón sigue pulsable durante el `await` y un segundo toque duplica la
  // acción (doble observación, doble asistencia…).
  const [procesando, setProcesando] = useState(false)
  /**
   * Lo que había escrito antes de la pulsación de micrófono en curso. Los
   * parciales del motor se reescriben enteros en cada evento, así que sin esta
   * base cada corrección del motor borraría lo ya dictado o lo duplicaría.
   */
  const baseDictado = useRef('')
  /** Con el micro abierto el campo es de solo lectura: lo que se ve es lo que se oye. */
  const [escuchando, setEscuchando] = useState(false)

  const alumnos = useLiveQuery(async () => (await db.alumnos.toArray()).filter((a) => a.activo), []) ?? []
  const grupos = useLiveQuery(() => gruposVisibles(), []) ?? []

  /** Se relee al abrir la hoja y tras cada escritura: la pila vive en memoria. */
  const [deshacibles, setDeshacibles] = useState(() => pendientesDeDeshacer())

  useEffect(() => {
    if (abierta) setDeshacibles(pendientesDeDeshacer())
  }, [abierta])

  async function deshacerUna(logId: string, resumen: string) {
    setProcesando(true)
    try {
      await deshacerDelLog(logId)
      setDeshacibles(pendientesDeDeshacer())
      mostrarAviso(`Deshecho: ${resumen}`)
    } finally {
      setProcesando(false)
    }
  }

  function cerrar() {
    setDeshacibles(pendientesDeDeshacer())
    baseDictado.current = ''
    setFase({ paso: 'dictado', texto: '' })
    onCerrar()
  }

  /**
   * REGLA DURA DE ACOTADO: el alumno se busca únicamente entre los activos de
   * este grupo. No hay ninguna rama que consulte a los demás, por muy parecido
   * que sea un nombre de otra clase.
   */
  function alumnosDe(grupo: Grupo): Alumno[] {
    return alumnos.filter((a) => a.grupoId === grupo.id)
  }

  /** Resuelve la acción dentro de un grupo ya elegido. Es lo que se repite al cambiar de grupo. */
  async function resolverEnGrupo(
    texto: string,
    textoSinGrupo: string,
    grupo: Grupo,
    gruposOfrecidos: Grupo[],
    alumnoForzado?: Alumno,
  ): Promise<Fase> {
    const delGrupo = alumnosDe(grupo)
    const base = { paso: 'confirmar' as const, texto, textoSinGrupo, grupo, gruposOfrecidos, eligiendoAlumno: false }
    let degradadoALocal = false

    // ——— 2.1 EL PARSER LOCAL VA PRIMERO ———
    // Las órdenes de clase son regulares, y resolverlas aquí no cuesta ni
    // latencia, ni dinero, ni conexión. La API solo entra cuando esto no sabe.
    if (!alumnoForzado) {
      const resuelto = interpretarIntenciones(textoSinGrupo, {
        alumnos: delGrupo,
        columnas: await columnasDelGrupo(grupo.id),
        etapa: grupo.etapa,
        buscarAlumno: buscarAlumnoEnTexto,
        grupoDictado: textoSinGrupo.trim() !== texto.trim(),
      })
      if (resuelto.tipo === 'rechazada') return { paso: 'rechazada', motivo: resuelto.motivo }
      if (resuelto.tipo === 'aclarar')
        return {
          ...base,
          aclaracion: { pregunta: resuelto.pregunta, opciones: resuelto.opciones },
          origen: 'local',
          candidatosAlumno: [],
        }
      if (resuelto.tipo === 'consulta') {
        // La respuesta se arma en local contra Dexie: ni la genera el modelo ni
        // pasa por ninguna API (2.5).
        const r = await responder(resuelto.consulta, grupo.id)
        return { paso: 'respuesta', texto: r.texto, enlace: r.enlace }
      }
      if (resuelto.tipo === 'acciones')
        return {
          ...base,
          intenciones: resuelto.acciones,
          descartadas: [],
          origen: 'local',
          candidatosAlumno: candidatosDe(textoSinGrupo, delGrupo),
        }
    }

    if (config.apiKey && !alumnoForzado) {
      try {
        // Solo viaja el grupo resuelto y su alumnado: el modelo no puede
        // devolver el token de un alumno de otra clase porque no lo tiene.
        const r = await interpretarConApi(textoSinGrupo, delGrupo, [grupo], {
          apiKey: config.apiKey,
          modelo: config.modeloAgente,
        })
        if (r) {
          const mapa = construirMapaTokens(delGrupo, [grupo])
          const { alumno } = resolverTokens(r.input, mapa, r.textoEnviado)
          if (r.accion === 'consultar') {
            return { paso: 'respuesta', texto: await responderConsulta(r.input, alumno) }
          }
          const resuelta = construirAccionDesdeApi(r.accion, r.input, grupo, alumno)
          if (resuelta) {
            // El modelo clasifica, pero no desempata nombres: si el emparejador
            // ve a varios casi iguales, se pregunta aunque la API traiga uno.
            const local = emparejarAlumno(textoSinGrupo, delGrupo)
            const preguntar = !!resuelta.alumnoId && local.estado === 'varios'
            return {
              ...base,
              accion: resuelta,
              origen: 'ia',
              candidatosAlumno: preguntar ? local.candidatos.map((c) => c.alumno) : candidatosDe(textoSinGrupo, delGrupo),
              eligiendoAlumno: preguntar,
            }
          }
        }
      } catch {
        // Sin red o fallo de la API: se cae al parser local (§6), avisando de
        // la degradación en vez de fallar en silencio.
        degradadoALocal = true
      }
    }

    const local: ResultadoInterpretar = interpretarLocal(
      textoSinGrupo,
      grupo,
      delGrupo,
      buscarAlumnoEnTexto,
      alumnoForzado,
    )
    const aviso = degradadoALocal
      ? 'Sin conexión con la API: interpretado con el reconocimiento local.'
      : undefined

    if (local.tipo === 'accion') return { ...base, accion: local.accion, candidatosAlumno: candidatosDe(textoSinGrupo, delGrupo), aviso }
    if (local.tipo === 'ambiguo') {
      return { ...base, candidatosAlumno: local.candidatos, eligiendoAlumno: true, aviso }
    }
    // Ni la API ni el parser han sacado nada: se vuelve al dictado con el motivo.
    return {
      paso: 'dictado',
      texto,
      error: degradadoALocal
        ? 'Sin conexión con la API. El reconocimiento local no ha entendido la acción.'
        : `No he identificado a nadie de ${grupo.nombre}. Prueba a ser más concreto o cambia de grupo.`,
    }
  }

  /**
   * Vía «nombre + curso + comentario». El alumno se empareja SOLO con el tramo
   * del nombre y SOLO dentro de `grupo`; la acción y el texto salen SOLO del
   * comentario. Todo texto que se vaya a enseñar pasa por `sanearComentario`.
   */
  async function resolverEstructurado(
    texto: string,
    est: Estructura,
    grupo: Grupo,
    gruposOfrecidos: Grupo[],
    alumnoForzado?: Alumno,
  ): Promise<Fase> {
    const delGrupo = alumnosDe(grupo)
    const emparejado = emparejarNombre(est.nombre, delGrupo)
    const base = {
      paso: 'confirmar' as const,
      texto,
      textoSinGrupo: est.nombre,
      grupo,
      gruposOfrecidos,
      estructura: est,
      eligiendoAlumno: false,
      candidatosAlumno: emparejado.candidatos.map((c) => c.alumno),
    }

    const alumno = alumnoForzado ?? (emparejado.estado === 'unico' ? emparejado.alumno : undefined)
    if (!alumno) {
      // Nadie supera el umbral → lista entera del grupo (candidatos vacíos).
      // Varios próximos → se enseñan esos. Nunca se elige por el maestro.
      return {
        ...base,
        eligiendoAlumno: true,
        comentario: sanearComentario(redactarComentario(est.comentario), { grupo, mencion: est.mencion }),
      }
    }

    const limpio = (t: string) => sanearComentario(redactarComentario(t), { alumno, grupo, mencion: est.mencion })
    const comentario = limpio(est.comentario)
    const conAlumno = { ...base, alumnoResuelto: alumno, comentario }
    if (!comentario)
      return {
        paso: 'dictado',
        texto,
        error: `Entendido: ${nombreCompleto(alumno)} de ${grupo.nombre}. Falta decir qué ha hecho después del curso.`,
      }

    // ——— Local primero: chándal, asistencia, positivo, contador, nota ———
    const resuelto = interpretarIntenciones(est.comentario, {
      alumnos: [alumno],
      columnas: await columnasDelGrupo(grupo.id),
      etapa: grupo.etapa,
      buscarAlumno: () => [{ alumno, puntuacion: 1 }],
      grupoDictado: true,
    })
    if (resuelto.tipo === 'rechazada') return { paso: 'rechazada', motivo: resuelto.motivo }
    // Solo valen acciones sobre ESTE alumno: un comentario no crea equipos ni columnas.
    if (
      resuelto.tipo === 'acciones' &&
      resuelto.acciones.every((x) => 'alumnoId' in x && x.alumnoId === alumno.id)
    ) {
      const acciones = resuelto.acciones.map((x) =>
        x.accion === 'observacion' ? { ...x, texto: limpio(x.texto) || comentario } : x,
      )
      const conObs = acciones.find((x) => x.accion === 'observacion')
      return {
        ...conAlumno,
        comentario: conObs && conObs.accion === 'observacion' ? conObs.texto : comentario,
        intenciones: acciones,
        descartadas: [],
        origen: 'local',
      }
    }

    // ——— IA: solo recibe el tramo del comentario ———
    let degradado = false
    if (config.apiKey) {
      try {
        const r = await interpretarComentarioConApi(est.comentario, delGrupo, grupo, {
          apiKey: config.apiKey,
          modelo: config.modeloAgente,
        })
        if (r) {
          for (const campo of ['texto', 'comentario'] as const)
            if (typeof r.input[campo] === 'string') r.input[campo] = limpio(r.input[campo] as string)
          const accion = construirAccionDesdeApi(r.accion, r.input, grupo, alumno)
          if (accion) {
            const redactado = (r.input.texto ?? r.input.comentario) as string | undefined
            return { ...conAlumno, accion, origen: 'ia', comentario: redactado || comentario }
          }
        }
      } catch {
        degradado = true
      }
    }

    // ——— Sin IA o sin acción clara: observación con el comentario tal cual ———
    const signo = signoDeComentario(comentario)
    return {
      ...conAlumno,
      intenciones: [
        {
          accion: 'observacion',
          riesgo: 'reversible',
          resumen: resumenObservacion(alumno, signo, comentario),
          alumnoId: alumno.id,
          fecha: resolverFechaRelativa(texto),
          signo,
          texto: comentario,
        },
      ],
      descartadas: [],
      origen: 'local',
      aviso: degradado ? 'Sin conexión con la API: interpretado con el reconocimiento local.' : undefined,
    }
  }

  async function procesar(texto: string) {
    if (!texto.trim() || procesando) return
    setProcesando(true)
    try {
      // Lo prohibido se corta antes de resolver el grupo: «borra el grupo
      // cuarto A» no puede acabar en un selector preguntando cuál.
      const prohibida = ordenProhibida(texto)
      if (prohibida) {
        setFase({ paso: 'rechazada', motivo: prohibida })
        return
      }

      const grupoActivo = grupos.find((g) => g.id === grupoActivoId)

      // Convención «nombre + de/del curso + lo que ha hecho»: el curso parte la
      // frase y cada trozo va a lo suyo (`lib/dictadoEstructurado.ts`).
      const partido = partirPorCurso(texto, grupos)
      if (partido) {
        const estructura = { nombre: partido.nombre, mencion: partido.mencion, comentario: partido.comentario }
        const d = desempatarGrupo(partido.candidatos, grupoActivo)
        if (!d.grupo) {
          setFase({
            paso: 'confirmar',
            texto,
            textoSinGrupo: partido.nombre,
            gruposOfrecidos: d.ambiguos?.length ? d.ambiguos : grupos,
            candidatosAlumno: [],
            eligiendoAlumno: false,
            estructura,
          })
          return
        }
        setFase(await resolverEstructurado(texto, estructura, d.grupo, d.ambiguos?.length ? d.ambiguos : grupos))
        return
      }

      const { grupo, ambiguos, textoSinGrupo } = resolverGrupo(texto, grupos, grupoActivo)

      // Sin grupo (ni dictado ni de contexto) o con varios candidatos: se
      // pregunta. Ni se elige el más probable ni se busca al alumno todavía.
      if (!grupo) {
        setFase({
          paso: 'confirmar',
          texto,
          textoSinGrupo,
          gruposOfrecidos: ambiguos?.length ? ambiguos : grupos,
          candidatosAlumno: [],
          eligiendoAlumno: false,
        })
        return
      }

      const siguiente = await resolverEnGrupo(texto, textoSinGrupo, grupo, ambiguos?.length ? ambiguos : grupos)
      // Sin mención de grupo en el dictado, el grupo es el abierto en la app.
      const porContexto = siguiente.paso === 'confirmar' && textoSinGrupo.trim() === texto.trim()
      setFase(porContexto ? { ...siguiente, grupoPorContexto: true } : siguiente)
    } finally {
      setProcesando(false)
    }
  }

  /** Cambiar de grupo rehace la resolución dentro del nuevo: el alumno anterior no se conserva. */
  async function elegirGrupo(grupoId: string) {
    if (fase.paso !== 'confirmar' || procesando) return
    const grupo = grupos.find((g) => g.id === grupoId)
    if (!grupo) return
    setProcesando(true)
    try {
      setFase(
        fase.estructura
          ? await resolverEstructurado(fase.texto, fase.estructura, grupo, fase.gruposOfrecidos)
          : await resolverEnGrupo(fase.texto, fase.textoSinGrupo, grupo, fase.gruposOfrecidos),
      )
    } finally {
      setProcesando(false)
    }
  }

  async function elegirAlumno(alumno: Alumno) {
    if (fase.paso !== 'confirmar' || !fase.grupo || procesando) return
    setProcesando(true)
    try {
      const { texto, textoSinGrupo, grupo, gruposOfrecidos, grupoPorContexto, estructura } = fase
      const siguiente = estructura
        ? await resolverEstructurado(texto, estructura, grupo, gruposOfrecidos, alumno)
        : await resolverEnGrupo(texto, textoSinGrupo, grupo, gruposOfrecidos, alumno)
      if (siguiente.paso !== 'confirmar') return setFase(siguiente)
      // Si el emparejador no lo había reconocido por sí solo, se ofrece
      // guardar lo dictado como alias de voz para la próxima vez. Con la
      // convención nombre+curso, lo dictado para nombrarlo es el tramo entero.
      const reconocido = (estructura ? emparejarNombre : emparejarAlumno)(textoSinGrupo, alumnosDe(grupo))
      const yaLoEra = reconocido.estado === 'unico' && reconocido.alumno.id === alumno.id
      const fragmento = yaLoEra
        ? undefined
        : estructura
          ? aliasNuevo(estructura.nombre, alumno)
          : fragmentoParaAlias(textoSinGrupo, alumno)
      setFase({
        ...siguiente,
        grupoPorContexto,
        aliasPropuesto: fragmento ? { alumno, texto: fragmento, guardado: false } : undefined,
      })
    } finally {
      setProcesando(false)
    }
  }

  /**
   * «No es este alumno»: los otros candidatos que superan el umbral si los
   * hay; si no, la lista entera del grupo (candidatos vacíos).
   */
  function corregirAlumno(f: Extract<Fase, { paso: 'confirmar' }>): Fase {
    const elegido = f.accion?.alumnoId ?? intencionesVivas(f).map((x) => ('alumnoId' in x ? x.alumnoId : undefined)).find(Boolean)
    const otros = f.candidatosAlumno.filter((a) => a.id !== elegido)
    return { ...f, eligiendoAlumno: true, candidatosAlumno: otros.length ? f.candidatosAlumno : [] }
  }

  /** Guarda (o retira) el alias de voz propuesto. Solo con el toque del maestro. */
  async function alternarAlias(guardar: boolean) {
    if (fase.paso !== 'confirmar' || !fase.aliasPropuesto || procesando) return
    const { alumno, texto } = fase.aliasPropuesto
    setProcesando(true)
    try {
      const actual = (await db.alumnos.get(alumno.id))?.aliasVoz ?? []
      const aliasVoz = guardar ? [...actual, texto] : actual.filter((a) => a !== texto)
      await db.alumnos.update(alumno.id, { aliasVoz })
      setFase({ ...fase, aliasPropuesto: { ...fase.aliasPropuesto, guardado: guardar } })
    } finally {
      setProcesando(false)
    }
  }

  /** Las que quedan tras descartar a mano en la tarjeta (2.9). */
  function intencionesVivas(f: Fase): Intencion[] {
    if (f.paso !== 'confirmar' || !f.intenciones) return []
    const fuera = new Set(f.descartadas ?? [])
    return f.intenciones.filter((_, i) => !fuera.has(i))
  }

  async function confirmar() {
    if (fase.paso !== 'confirmar' || procesando || !fase.grupo) return
    const { texto, grupo } = fase
    setProcesando(true)
    try {
      // El comentario editado en la tarjeta es el que se guarda.
      const vivas = intencionesVivas(fase).map((x) =>
        x.accion === 'observacion' && fase.comentario !== undefined && fase.alumnoResuelto
          ? { ...x, texto: fase.comentario, resumen: resumenObservacion(fase.alumnoResuelto, x.signo, fase.comentario) }
          : x,
      )
      if (vivas.length > 0) {
        // Cada intención escribe por su cuenta y apila su propio deshacer: una
        // frase con dos órdenes son dos acciones, no una transacción.
        const hechas: string[] = []
        const deshaceres: (() => Promise<void>)[] = []
        for (const intencion of vivas) {
          const r = await ejecutarIntencion(intencion, grupo)
          hechas.push(r.respuesta)
          if (!r.deshacer) continue
          deshaceres.push(r.deshacer)
          apilarDeshacer(await registrarIntencion(texto, intencion), intencion.resumen, r.deshacer)
        }
        if (deshaceres.length > 0) {
          cerrar()
          mostrarAviso(hechas.join(' · '), async () => {
            for (const d of [...deshaceres].reverse()) await d()
          })
        } else {
          // Sin escritura no hay nada que deshacer, pero sí algo que enseñar
          // —el alumno sorteado, los equipos, el tanteo—: la hoja se queda.
          setFase({ paso: 'respuesta', texto: hechas.join('\n') })
        }
        return
      }

      if (!fase.accion) return
      const accion = conComentario(fase.accion, fase.comentario)
      const deshacer = await ejecutarAccion(accion)
      const logId = await registrarEnLog(texto, accion)
      apilarDeshacer(logId, accion.resumen, deshacer)
      cerrar()
      mostrarAviso(accion.resumen, deshacer)
    } catch (e) {
      setFase({ paso: 'dictado', texto, error: e instanceof Error ? e.message : 'No se pudo aplicar.' })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Hoja abierta={abierta} titulo="Agente de voz" onCerrar={cerrar}>
      {fase.paso === 'dictado' && (
        <div className="space-y-3">
          <BotonDictado
            yaExplicado={!!config.dictadoExplicado}
            deshabilitado={procesando}
            onInicio={() => {
              baseDictado.current = fase.texto
              setEscuchando(true)
            }}
            onTexto={(t) => setFase({ paso: 'dictado', texto: unirDictado(baseDictado.current, t) })}
            onFin={(t, motivo) => {
              setEscuchando(false)
              // Cancelar descarta lo de esta escucha y deja lo que ya había.
              const texto = motivo === 'cancelar' ? baseDictado.current : unirDictado(baseDictado.current, t)
              baseDictado.current = texto
              setFase({ paso: 'dictado', texto })
              // Solo «Parar» procesa. Límite o error dejan el texto para revisarlo.
              if (motivo === 'parar' && texto.trim()) void procesar(texto)
            }}
          />
          <CampoArea
            className="campo h-28 resize-none py-2"
            readOnly={escuchando}
            valor={fase.texto}
            onValor={(v) => {
              // Corregir a mano manda: lo escrito pasa a ser la base de lo que
              // se dicte después, o el siguiente parcial lo borraría.
              baseDictado.current = v
              setFase({ paso: 'dictado', texto: v })
            }}
            placeholder="David de cuarto A ha ayudado a recoger el material… (o toca «Dictar»)"
            aria-label="Dictado para el agente de voz"
            aria-invalid={!!fase.error}
            aria-describedby={fase.error ? 'agente-error' : undefined}
            autoFocus
          />
          {fase.error && (
            <p id="agente-error" role="alert" className="text-sm font-semibold text-acento">
              {fase.error}
            </p>
          )}
          <p className="text-xs texto-suave">
            Di nombre, curso y lo que ha hecho: «Lucía Martín del 4ºB no ha traído el chándal». El alumno se busca solo dentro de ese curso.
          </p>
          {!config.apiKey && (
            <p className="text-xs texto-suave">
              Sin API key configurada: se usa el reconocimiento local (observación, asistencia,
              chándal, deshacer).
            </p>
          )}
          <button
            className="btn-primario w-full"
            onClick={() => void procesar(fase.texto)}
            disabled={!fase.texto.trim() || procesando || escuchando}
          >
            {procesando ? 'Interpretando…' : 'Interpretar'}
          </button>

          {/* 2.8: deshacer un rato después, no solo en el aviso de 4 segundos.
              Dura lo que dura la app abierta, porque la función de deshacer vive
              en memoria; se dice en vez de aparentar que es para siempre. */}
          {deshacibles.length > 0 && (
            <div className="border-t border-agua pt-3 dark:border-noche-elevada">
              <p className="etiqueta">Últimas acciones del agente</p>
              <ul className="mt-1 space-y-1">
                {deshacibles.map((d) => (
                  <li key={d.logId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate texto-suave">{d.resumen}</span>
                    <button
                      className="pildora min-h-[40px] shrink-0 bg-agua-claro px-3 text-xs font-semibold text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                      onClick={() => void deshacerUna(d.logId, d.resumen)}
                      disabled={procesando}
                    >
                      <Undo2 size={14} aria-hidden />
                      Deshacer
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs texto-suave">
                Mientras la app siga abierta. Al cerrarla, lo hecho se queda hecho.
              </p>
            </div>
          )}
        </div>
      )}

      {fase.paso === 'confirmar' && (
        <div className="space-y-4">
          <div className="panel-agua space-y-3">
            {/* 2.8: lo que se oyó, literal, para cotejar con lo entendido. */}
            <div>
              <span className="etiqueta">Has dicho</span>
              <p className="text-sm italic texto-suave">«{fase.texto}»</p>
            </div>
            <div>
              <span className="etiqueta flex items-center gap-1.5">
                <Users size={14} aria-hidden />
                Grupo
              </span>
              {fase.grupo ? (
                <>
                  <SelectorGrupo
                    grupos={fase.gruposOfrecidos}
                    valor={fase.grupo.id}
                    onCambio={(id) => void elegirGrupo(id)}
                  />
                  {fase.grupoPorContexto && (
                    <p className="mt-1 text-xs texto-suave">No has dicho grupo: es el que tienes abierto.</p>
                  )}
                </>
              ) : (
                // Sin grupo resuelto NO se preselecciona ninguno: un desplegable
                // con el primero puesto parecería una respuesta, y aquí lo que
                // hay es una pregunta.
                <>
                  <p role="alert" className="text-xs font-semibold text-acento">
                    {fase.gruposOfrecidos.length < grupos.length
                      ? 'Ese nombre encaja con más de un grupo. Elige cuál.'
                      : 'No has dicho de qué grupo es. Elige uno.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fase.gruposOfrecidos.map((g) => (
                      <button
                        key={g.id}
                        className="pildora min-h-[40px] bg-agua-claro px-3 text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                        onClick={() => void elegirGrupo(g.id)}
                        disabled={procesando}
                      >
                        {g.nombre}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {fase.estructura && fase.alumnoResuelto && !fase.eligiendoAlumno && (
              <div>
                <span className="etiqueta">Alumno</span>
                <p className="text-sm font-bold">{nombreCompleto(fase.alumnoResuelto)}</p>
              </div>
            )}

            {fase.aclaracion && (
              <div className="border-t border-agua pt-3 dark:border-noche-elevada">
                <p role="alert" className="text-sm font-semibold text-acento">
                  {fase.aclaracion.pregunta}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {fase.aclaracion.opciones.map((op, i) => (
                    <button
                      key={i}
                      className="pildora min-h-[40px] bg-agua-claro px-3 text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                      onClick={() =>
                        setFase({ ...fase, aclaracion: undefined, intenciones: [op], descartadas: [] })
                      }
                      disabled={procesando}
                    >
                      {op.resumen}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {fase.intenciones && !fase.eligiendoAlumno && (
              <div className="space-y-2 border-t border-agua pt-3 dark:border-noche-elevada">
                {fase.intenciones.map((intencion, i) => {
                  const fuera = (fase.descartadas ?? []).includes(i)
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <div className={'min-w-0 flex-1 ' + (fuera ? 'line-through opacity-50' : '')}>
                        <p className="text-sm font-bold">{intencion.resumen}</p>
                        {intencion.accion === 'crear_columna' && (
                          <TipoDeColumna
                            intencion={intencion}
                            etapa={fase.grupo?.etapa ?? 'primaria'}
                            onTipo={(tipo) =>
                              setFase({
                                ...fase,
                                intenciones: fase.intenciones!.map((x, j) =>
                                  j === i && x.accion === 'crear_columna'
                                    ? { ...x, tipo, tipoPropuesto: false }
                                    : x,
                                ),
                              })
                            }
                          />
                        )}
                      </div>
                      {/* Descartar una de varias: una orden encadenada mal
                          entendida no puede obligar a repetir las otras. */}
                      {fase.intenciones!.length > 1 && (
                        <button
                          className="shrink-0 rounded-xl p-2 text-primario dark:text-agua"
                          aria-label={fuera ? `Recuperar: ${intencion.resumen}` : `Descartar: ${intencion.resumen}`}
                          onClick={() =>
                            setFase({
                              ...fase,
                              descartadas: fuera
                                ? (fase.descartadas ?? []).filter((d) => d !== i)
                                : [...(fase.descartadas ?? []), i],
                            })
                          }
                          disabled={procesando}
                        >
                          {fuera ? <Undo2 size={16} aria-hidden /> : <X size={16} aria-hidden />}
                        </button>
                      )}
                    </div>
                  )
                })}
                {/* Solo si alguna acción va sobre un alumno: en equipos,
                    sorteo o columnas no hay alumno que cambiar. */}
                {intencionesVivas(fase).some((x) => 'alumnoId' in x) && (
                  <button
                    className="text-xs font-semibold text-primario underline dark:text-agua"
                    onClick={() => setFase(corregirAlumno(fase))}
                    disabled={procesando}
                  >
                    No es este alumno
                  </button>
                )}
              </div>
            )}

            {fase.accion && !fase.intenciones && !fase.eligiendoAlumno && (
              <div className="border-t border-agua pt-3 dark:border-noche-elevada">
                <p className="text-sm font-bold">{fase.accion.resumen}</p>
                <p className="mt-1 text-xs texto-suave">{etiquetaDia(fase.accion.fecha)}</p>
                {fase.accion.alumnoId && (
                  <button
                    className="mt-2 text-xs font-semibold text-primario underline dark:text-agua"
                    onClick={() => setFase(corregirAlumno(fase))}
                    disabled={procesando}
                  >
                    No es este alumno
                  </button>
                )}
              </div>
            )}

            {!fase.eligiendoAlumno && llevaComentario(fase, intencionesVivas(fase)) && (
              <div className="border-t border-agua pt-3 dark:border-noche-elevada">
                <label className="etiqueta" htmlFor="agente-comentario">
                  Comentario
                </label>
                <CampoArea
                  id="agente-comentario"
                  className="campo h-20 resize-none py-2"
                  valor={fase.comentario ?? ''}
                  onValor={(v) =>
                    setFase({
                      ...fase,
                      comentario: v,
                      // El resumen de arriba enseña lo mismo que se va a guardar.
                      intenciones: fase.intenciones?.map((x) =>
                        x.accion === 'observacion' && fase.alumnoResuelto
                          ? { ...x, texto: v, resumen: resumenObservacion(fase.alumnoResuelto, x.signo, v) }
                          : x,
                      ),
                      accion: fase.accion && {
                        ...conComentario(fase.accion, v),
                        resumen: fase.accion.resumen.replace(/«[^»]*»/, `«${v}»`),
                      },
                    })
                  }
                />
              </div>
            )}

            {fase.grupo && fase.eligiendoAlumno && (
              <div className="border-t border-agua pt-3 dark:border-noche-elevada">
                <p className="text-sm texto-suave">¿A quién de {fase.grupo.nombre} te refieres?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(fase.candidatosAlumno.length ? fase.candidatosAlumno : alumnosDe(fase.grupo)).map((a) => (
                    <button
                      key={a.id}
                      className="pildora min-h-[40px] bg-agua-claro px-3 text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                      onClick={() => void elegirAlumno(a)}
                      disabled={procesando}
                    >
                      {a.alias || a.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {fase.aliasPropuesto && !fase.eligiendoAlumno && (
              <div className="border-t border-agua pt-3 dark:border-noche-elevada">
                {fase.aliasPropuesto.guardado ? (
                  <p className="flex items-center gap-2 text-xs texto-suave">
                    «{fase.aliasPropuesto.texto}» guardado como alias de voz.
                    <button
                      className="font-semibold text-primario underline dark:text-agua"
                      onClick={() => void alternarAlias(false)}
                      disabled={procesando}
                    >
                      Deshacer
                    </button>
                  </p>
                ) : (
                  <button
                    className="btn-suave w-full text-sm"
                    onClick={() => void alternarAlias(true)}
                    disabled={procesando}
                  >
                    Guardar «{fase.aliasPropuesto.texto}» como alias de voz de{' '}
                    {fase.aliasPropuesto.alumno.alias || fase.aliasPropuesto.alumno.nombre}
                  </button>
                )}
              </div>
            )}
          </div>

          {fase.aviso && <p className="text-xs texto-suave">{fase.aviso}</p>}
          {/* Quién lo ha resuelto. Discreto, pero visible: saber si ha habido
              llamada o no es lo que explica la latencia y el gasto. */}
          {fase.origen && (
            <p className="text-xs texto-suave">
              Interpretado {fase.origen === 'local' ? 'aquí, sin conexión' : 'con la IA'}.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-suave"
              onClick={() => setFase({ paso: 'dictado', texto: fase.texto })}
              disabled={procesando}
            >
              <Pencil size={18} aria-hidden />
              Editar
            </button>
            <button
              className="btn-primario"
              onClick={() => void confirmar()}
              disabled={
                procesando ||
                !fase.grupo ||
                fase.eligiendoAlumno ||
                (!fase.accion && intencionesVivas(fase).length === 0)
              }
            >
              <Check size={18} aria-hidden />
              {procesando ? 'Aplicando…' : 'Confirmar'}
            </button>
          </div>
          <button className="btn-peligro w-full" onClick={cerrar} disabled={procesando}>
            <X size={18} aria-hidden />
            Cancelar
          </button>
        </div>
      )}

      {fase.paso === 'respuesta' && (
        <div className="space-y-4">
          <div className="panel-agua whitespace-pre-line text-sm">{fase.texto}</div>
          {/* Un toque para el detalle: la respuesta es breve a propósito, y
              quien quiera más va a la vista de verdad (2.6). */}
          {fase.enlace && (
            <button
              className="btn-suave w-full"
              onClick={() => {
                navegar(fase.enlace!.ruta)
                cerrar()
              }}
            >
              {fase.enlace.etiqueta}
            </button>
          )}
          <button className="btn-primario w-full" onClick={cerrar}>
            Cerrar
          </button>
        </div>
      )}

      {fase.paso === 'rechazada' && (
        <div className="space-y-4">
          <p role="alert" className="text-sm font-semibold text-acento">
            {fase.motivo}
          </p>
          <button className="btn-primario w-full" onClick={cerrar}>
            Entendido
          </button>
        </div>
      )}
    </Hoja>
  )
}

/**
 * Las columnas del trimestre en curso, reducidas a lo que el parser mira.
 *
 * Hacen falta para decidir si «un punto en participación» va a la celda del
 * Cuaderno o al contador de observaciones: lo que lo decide es si se nombra una
 * columna que existe de verdad.
 */
async function columnasDelGrupo(grupoId: string): Promise<ColumnaConocida[]> {
  const curso = await obtenerCursoActivo()
  const trimestre = trimestreDe(aISO(), curso) ?? 1
  const columnas = await columnasDe(grupoId, trimestre)
  return columnas.map((c) => ({ id: c.id, titulo: c.titulo, tipo: c.tipo }))
}

/**
 * Pega lo que va transcribiendo el motor a lo que ya había en el campo.
 *
 * El motor reescribe el tramo entero en cada parcial, así que se concatena
 * contra una base fija, no contra el último valor del campo: si no, una
 * corrección del motor duplicaría media frase.
 */
function unirDictado(base: string, tramo: string): string {
  const b = base.trimEnd()
  const t = tramo.trim()
  if (!b) return t
  if (!t) return b
  return `${b} ${t}`
}

interface Estructura {
  nombre: string
  mencion: string
  comentario: string
}

function nombreCompleto(a: Alumno): string {
  return `${a.nombre} ${a.apellidos}`.trim()
}

function resumenObservacion(a: Alumno, signo: SignoObservacion, texto: string): string {
  const etiqueta = signo === '+' ? 'positivo' : signo === '-' ? 'negativo' : 'observación'
  return `${a.alias || a.nombre}: ${etiqueta} — «${texto}»`
}

/** Si la acción lleva texto redactado, el de la tarjeta (quizá editado) manda. */
function conComentario(accion: AccionResuelta, comentario?: string): AccionResuelta {
  if (comentario === undefined) return accion
  if (accion.accion === 'registrar_observacion')
    return { ...accion, payload: { ...accion.payload, texto: comentario } }
  if (accion.accion === 'anadir_comentario_eval')
    return { ...accion, payload: { ...accion.payload, comentario } }
  return accion
}

/** ¿La tarjeta tiene un texto que vaya a guardarse? Solo entonces se enseña el campo editable. */
function llevaComentario(f: Extract<Fase, { paso: 'confirmar' }>, vivas: Intencion[]): boolean {
  if (f.comentario === undefined || !f.alumnoResuelto) return false
  if (vivas.some((x) => x.accion === 'observacion')) return true
  return f.accion?.accion === 'registrar_observacion' || f.accion?.accion === 'anadir_comentario_eval'
}

/** Lo dictado para nombrar al alumno, si no es ya uno de sus alias de voz. */
function aliasNuevo(dicho: string, alumno: Alumno): string | undefined {
  const t = dicho.trim()
  if (!t) return undefined
  const ya = [alumno.nombre, nombreCompleto(alumno), alumno.alias, ...(alumno.aliasVoz ?? [])]
    .filter(Boolean)
    .some((a) => canonico(a!) === canonico(t))
  return ya ? undefined : t
}

/** Los otros nombres del grupo que se parecen a lo dictado, para el «no es este alumno». */
function candidatosDe(texto: string, delGrupo: Alumno[]): Alumno[] {
  return buscarAlumnoEnTexto(texto, delGrupo).map((c) => c.alumno)
}

function construirAccionDesdeApi(
  accion: import('../db/agente').AccionId,
  input: Record<string, unknown>,
  grupo: Grupo,
  alumno?: Alumno,
): AccionResuelta | null {
  const fecha = String(input.fecha ?? new Date().toISOString().slice(0, 10))
  const nombre = alumno ? alumno.alias || alumno.nombre : undefined
  // El grupo ya está resuelto en local y es el único del mapa: no se toma del
  // token, que además ya no viaja en el texto (se retiró la mención).
  const deAlumno = alumno ? { alumnoId: alumno.id, grupoId: grupo.id, fecha } : null

  switch (accion) {
    case 'registrar_observacion':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `Observación (${input.signo}) para ${nombre}: «${input.texto}»`,
        payload: input,
      }
    case 'marcar_asistencia':
      if (!deAlumno) return null
      return { accion, ...deAlumno, resumen: `${nombre}: ${input.estado}`, payload: input }
    case 'marcar_chandal':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `${nombre}: ${input.chandal ? 'con' : 'sin'} chándal`,
        payload: input,
      }
    case 'calificar':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `${nombre} · ${input.columnaTitulo}: ${input.valor}`,
        payload: input,
      }
    case 'anadir_comentario_eval':
      if (!deAlumno) return null
      return {
        accion,
        ...deAlumno,
        resumen: `Comentario T${input.trimestre} de ${nombre}: «${input.comentario}»`,
        payload: input,
      }
    case 'crear_nota_sesion':
      return {
        accion,
        grupoId: grupo.id,
        fecha,
        resumen: `Nota de sesión en ${grupo.nombre}: «${input.nota}»`,
        payload: input,
      }
    case 'deshacer_ultima':
      return { accion, fecha, resumen: 'Deshacer la última acción del agente', payload: {} }
    default:
      return null
  }
}

async function responderConsulta(
  input: Record<string, unknown>,
  alumno?: Alumno,
): Promise<string> {
  if (!alumno) return 'No he identificado de quién preguntas.'
  const nombre = alumno.alias || alumno.nombre

  if (input.sobre === 'asistencia' || input.sobre === 'chandal') {
    const registros = await db.asistencias.where('alumnoId').equals(alumno.id).toArray()
    const r = resumirAsistencia(registros)
    return input.sobre === 'chandal'
      ? `${nombre} lleva ${r.rachaChandal} sesiones seguidas con chándal (${r.sinChandal} veces sin él en total).`
      : `${nombre}: ${r.pctAsistencia}% de asistencia, ${r.faltas} faltas, ${r.retrasos} retrasos.`
  }

  if (input.sobre === 'observaciones') {
    const lista = await db.observaciones.where('alumnoId').equals(alumno.id).toArray()
    const positivos = lista.filter((o) => o.signo === '+').length
    const negativos = lista.filter((o) => o.signo === '-').length
    return `${nombre} tiene ${positivos} observaciones positivas y ${negativos} negativas registradas.`
  }

  return `Todavía no puedo consultar «${input.sobre}» de ${nombre}.`
}

/**
 * El tipo de una columna creada por voz (2.4).
 *
 * Si no se dijo, el parser propone uno y lo marca como propuesta: aquí se ve
 * que es una suposición y se cambia con un toque. Elegirlo en silencio es lo
 * que convierte un contador en una nota sin que nadie se entere hasta que el
 * cuaderno ya está a medio rellenar.
 */
function TipoDeColumna({
  intencion,
  etapa,
  onTipo,
}: {
  intencion: Extract<Intencion, { accion: 'crear_columna' }>
  etapa: Etapa
  onTipo: (tipo: TipoColumna) => void
}) {
  return (
    <div className="mt-1">
      <p className="text-xs texto-suave">
        Tipo: <span className="font-semibold">{etiquetaTipo(intencion.tipo)}</span>
        {intencion.tipoPropuesto && ' — no lo has dicho, lo propongo yo'}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {tiposDisponibles(etapa)
          .filter((t) => t.tipo !== intencion.tipo && t.tipo !== 'calculo' && t.tipo !== 'rubrica')
          .map((t) => (
            <button
              key={t.tipo}
              className="pildora min-h-[40px] bg-agua-claro px-3 text-xs text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
              onClick={() => onTipo(t.tipo)}
            >
              {t.etiqueta}
            </button>
          ))}
      </div>
    </div>
  )
}

function etiquetaTipo(tipo: TipoColumna): string {
  return TIPOS_COLUMNA.find((t) => t.tipo === tipo)?.etiqueta ?? tipo
}
