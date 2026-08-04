import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  ClipboardX,
  Columns3,
  Copy,
  Minus,
  Plus,
  Scale,
  Settings2,
  Shuffle,
  Table2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Celda, EditorColumna, HojaAplicarGrupo, TablaRubrica } from '../components/Celda'
import { EstadoVacio } from '../components/EstadoVacio'
import { EvaluadorRubrica } from '../components/EvaluadorRubrica'
import { Hoja } from '../components/Hoja'
import { HojaColumna } from '../components/HojaColumna'
import { HojaObservacion } from '../components/HojaObservacion'
import { HojaPesosTrimestre } from '../components/HojaPesosTrimestre'
import { SelectorGrupo } from '../components/SelectorGrupo'
import { SorteoAlumno } from '../components/SorteoAlumno'
import {
  agruparPorUnidad,
  calcularColumna,
  columnasDe,
  guardarValor,
  mediaDe,
  pegarColumnas,
  TIPOS_APLICABLES_GRUPO,
  validarPegado,
  valorNormalizado,
  valoresDe,
  type ResultadoCalculo,
  type ResultadoValidacionPegado,
} from '../db/cuaderno'
import { guardarConfig, useConfig } from '../db/config'
import { db } from '../db/db'
import { calificarGrupo } from '../db/notas'
import { filasPorColumna } from '../db/filas'
import { notaInstrumento, notaOficial, type MotivoExclusion, type ResultadoTrimestre } from '../lib/notas'
import type {
  Alumno,
  AnchoColumnaAlumno,
  BandaSobre,
  CalificacionOficial,
  Columna,
  FilaInstrumento,
  FormatoNombre,
  Grupo,
  Rubrica,
  SignoObservacion,
  Trimestre,
  ValorCelda,
} from '../db/types'
import { contadoresPorAlumno, type ContadorSigno } from '../db/observaciones'
import { formatearNombre } from '../lib/nombres'
import { usePulsacionLarga } from '../lib/pulsacionLarga'
import { navegar } from '../lib/router'
import { useGrupoActivo } from '../store/grupoActivo'
import { usePortapapelesColumnas } from '../store/portapapelesColumnas'
import { useUI } from '../store/ui'

/**
 * Ancho de la columna de alumnado congelada (§ Bloque 4), en px. Se aplica
 * por estilo en línea, no por clase de Tailwind: es una preferencia en
 * tiempo de ejecución, no un valor que el JIT pueda ver en el código fuente.
 */
const ANCHO_COLUMNA_ALUMNO_PX: Record<AnchoColumnaAlumno, number> = {
  estrecha: 120,
  media: 156,
  ancha: 196,
}

/** `grupoId`: llegada directa desde otra pantalla (p. ej. el icono de grupo en Hoy). */
export function Cuaderno({ grupoId: grupoIdInicial }: { grupoId?: string } = {}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const copiadas = usePortapapelesColumnas((s) => s.copiadas)
  const copiarColumnas = usePortapapelesColumnas((s) => s.copiar)
  const limpiarPortapapelesColumnas = usePortapapelesColumnas((s) => s.limpiar)

  // Grupo activo compartido con el Planificador (§ Bloque 6.3): la llegada
  // directa desde otra pantalla (`grupoIdInicial`, p. ej. desde Hoy) manda y
  // además deja fijado ese grupo para la próxima vez.
  const grupoIdGuardado = useGrupoActivo((s) => s.grupoId)
  const fijarGrupoActivo = useGrupoActivo((s) => s.fijarGrupo)
  useEffect(() => {
    if (grupoIdInicial) fijarGrupoActivo(grupoIdInicial)
  }, [grupoIdInicial, fijarGrupoActivo])
  const grupoId = grupoIdInicial ?? grupoIdGuardado

  const [trimestre, setTrimestre] = useState<Trimestre>(1)
  const [configurando, setConfigurando] = useState<Columna | 'nueva' | null>(null)
  const [evaluando, setEvaluando] = useState<{ columna: Columna; indice: number } | null>(null)
  const [evaluandoRubrica, setEvaluandoRubrica] = useState<{ columna: Columna; indice: number } | null>(
    null,
  )
  const [tablaRubrica, setTablaRubrica] = useState<Columna | null>(null)
  const [aplicando, setAplicando] = useState<Columna | null>(null)
  const [sorteando, setSorteando] = useState(false)
  const [pegando, setPegando] = useState(false)
  const [repartiendo, setRepartiendo] = useState(false)
  const [vistaAbierta, setVistaAbierta] = useState(false)

  const grupos = useLiveQuery(async () => {
    const lista = await db.grupos.toArray()
    return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [])

  const grupo = grupos?.find((g) => g.id === grupoId) ?? grupos?.[0] ?? null
  const idEfectivo = grupo?.id ?? null

  // El id guardado puede haber quedado obsoleto (grupo borrado, u orfandad del
  // localStorage persistido): se corrige al primero por orden, sin esperar a
  // que el usuario lo note. No corre si llega un `grupoIdInicial` explícito.
  useEffect(() => {
    if (grupoIdInicial) return
    if (grupos && grupos.length > 0 && !grupos.some((g) => g.id === grupoIdGuardado)) {
      fijarGrupoActivo(grupos[0].id)
    }
  }, [grupoIdInicial, grupos, grupoIdGuardado, fijarGrupoActivo])

  const alumnos = useLiveQuery(async () => {
    if (!idEfectivo) return []
    const lista = await db.alumnos.where('grupoId').equals(idEfectivo).toArray()
    return lista
      .filter((a) => a.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  }, [idEfectivo])

  const columnas = useLiveQuery(
    async () => (idEfectivo ? columnasDe(idEfectivo, trimestre) : []),
    [idEfectivo, trimestre],
  )

  const valores = useLiveQuery(
    async () => valoresDe((columnas ?? []).map((c) => c.id)),
    [columnas],
  )

  const rubricas = useLiveQuery(async () => {
    const lista = await db.rubricas.toArray()
    return new Map(lista.map((r) => [r.id, r]))
  }, [])

  const unidades = useLiveQuery(() => db.unidades.toArray(), [])

  const contadoresObs = useLiveQuery(
    async () => (idEfectivo ? contadoresPorAlumno(idEfectivo) : new Map<string, ContadorSigno>()),
    [idEfectivo],
  )

  const columnasPorId = useMemo(
    () => new Map((columnas ?? []).map((c) => [c.id, c] as const)),
    [columnas],
  )

  const idsColumnasRubrica = useMemo(
    () => (columnas ?? []).filter((c) => c.tipo === 'rubrica').map((c) => c.id),
    [columnas],
  )
  const filasRubrica = useLiveQuery(
    async () => filasPorColumna(idsColumnasRubrica),
    [idsColumnasRubrica],
  )

  /**
   * Resultado de cada columna de cálculo por alumno, en un solo pase.
   *
   * Recalcula solo cuando cambian columnas, notas o rúbricas —y `valores` viene
   * de `useLiveQuery`, así que Dexie lo reemite al escribir una nota: el
   * recálculo es automático—. El memo se comparte por alumno para que encadenar
   * cálculos no recompute los componentes. Con ~25 alumnos son unos cientos de
   * operaciones: no necesita más.
   */
  const calculos = useMemo(() => {
    const res = new Map<string, ResultadoCalculo>()
    const calcCols = (columnas ?? []).filter((c) => c.tipo === 'calculo')
    if (calcCols.length === 0) return res
    const vals = valores ?? new Map<string, ValorCelda>()
    const rubs = rubricas ?? new Map<string, Rubrica>()
    for (const a of alumnos ?? []) {
      const memo = new Map<string, ResultadoCalculo>()
      for (const c of calcCols) {
        res.set(`${c.id}|${a.id}`, calcularColumna(c, columnasPorId, vals, a.id, rubs, memo))
      }
    }
    return res
  }, [columnas, alumnos, valores, rubricas, columnasPorId])

  /**
   * Nota ponderada de cada columna de rúbrica por alumno (§ Bloque 2.1): el
   * MISMO motor que certifica el trimestre (`notaInstrumento`), no un
   * recuento aparte. `contadas`/`total` alimentan el aviso de nota parcial,
   * igual que en las columnas de cálculo.
   */
  const notasRubrica = useMemo(() => {
    const res = new Map<string, ResultadoCalculo>()
    const colsRubrica = (columnas ?? []).filter((c) => c.tipo === 'rubrica')
    if (colsRubrica.length === 0) return res
    const vals = valores ?? new Map<string, ValorCelda>()
    const rubs = rubricas ?? new Map<string, Rubrica>()
    const filasPorCol = filasRubrica ?? new Map<string, FilaInstrumento[]>()
    for (const c of colsRubrica) {
      const filas = filasPorCol.get(c.id) ?? []
      const rubrica = c.rubricaId ? rubs.get(c.rubricaId) : undefined
      for (const a of alumnos ?? []) {
        const valor = vals.get(`${c.id}|${a.id}`)
        const resultado = notaInstrumento({ columna: c, filas, rubrica }, valor, valorNormalizado)
        const contadas = filas.filter(
          (f) => f.criterioRubricaId && valor?.rubrica?.[f.criterioRubricaId],
        ).length
        res.set(`${c.id}|${a.id}`, { valor: resultado.valor, contadas, total: filas.length })
      }
    }
    return res
  }, [columnas, alumnos, valores, rubricas, filasRubrica])

  const visibles = columnas ?? []

  /**
   * Rúbrica → evaluador por alumno; número/texto → recorrido por alumno; el
   * resto se edita al toque.
   *
   * `indice` es la fila tocada: el recorrido arranca en ESE alumno, no en el
   * primero de la clase. Empezar siempre por el 0 obligaba a avanzar a mano
   * hasta la fila que se acababa de tocar.
   */
  function abrirEditor(columna: Columna, indice: number) {
    if (columna.tipo === 'rubrica') setEvaluandoRubrica({ columna, indice })
    else setEvaluando({ columna, indice })
  }

  if (!grupos) {
    return (
      <>
        <Cabecera titulo="Cuaderno" />
        <div className="space-y-2 p-4">
          <div className="h-10 animate-pulse rounded-xl bg-agua-claro dark:bg-noche-elevada" />
          <div className="h-64 animate-pulse rounded-xl2 bg-agua-claro dark:bg-noche-elevada" />
        </div>
      </>
    )
  }
  if (grupos.length === 0) {
    return (
      <>
        <Cabecera titulo="Cuaderno" />
        <div className="p-4">
          <EstadoVacio
            Icono={Table2}
            titulo="Todavía no hay grupos"
            descripcion="El cuaderno se organiza por grupo y trimestre."
            accion={
              <button className="btn-primario w-full" onClick={() => navegar('/grupos')}>
                Ir a Grupos
              </button>
            }
          />
        </div>
      </>
    )
  }

  const mapaRubricas = rubricas ?? new Map<string, Rubrica>()
  const mapaValores = valores ?? new Map()

  async function cambiar(
    columna: Columna,
    alumnoId: string,
    cambios: Parameters<typeof guardarValor>[2],
  ) {
    const deshacer = await guardarValor(columna.id, alumnoId, cambios)
    return deshacer
  }

  return (
    <>
      {/* Solo título + subtítulo en la cabecera (§ Bloque 5.1): con acciones
          dentro, a 360–390px el título quedaba tapado por los botones
          contiguos. Los botones bajan a su propia fila, bajo las pestañas de
          trimestre — jerárquicamente son suyas, no del título. */}
      <Cabecera
        titulo="Cuaderno"
        subtitulo={grupo ? `${grupo.nombre} · ${trimestre}.º trimestre` : undefined}
      />

      {sorteando && idEfectivo && (
        <SorteoAlumno grupoId={idEfectivo} onCerrar={() => setSorteando(false)} />
      )}

      <div className="space-y-3 p-4 pb-2">
        <SelectorGrupo grupos={grupos} valor={idEfectivo} onCambio={fijarGrupoActivo} />

        <div role="tablist" aria-label="Trimestre" className="pestanas">
          {([1, 2, 3] as const).map((t) => (
            <button
              key={t}
              role="tab"
              onClick={() => setTrimestre(t)}
              aria-selected={trimestre === t}
              className="pestana"
            >
              {t}.º trimestre
            </button>
          ))}
        </div>

        {/* Fila de acciones del trimestre (§ Bloque 5.1/5.2): pertenecen al
            trimestre que se está viendo, no al título — el icono de Pesos
            vive aquí y nunca dentro de la barra de pestañas, que a 360px se
            comprimía hasta no caber. */}
        <div className="flex flex-wrap gap-2">
          {idEfectivo && (
            <button
              className="btn-suave w-11 shrink-0 px-0"
              onClick={() => navegar(`/asistencia/${idEfectivo}`)}
              title="Pasar lista"
              aria-label="Pasar lista"
            >
              <ClipboardCheck size={18} aria-hidden />
            </button>
          )}
          {idEfectivo && (
            <button
              className="btn-suave w-11 shrink-0 px-0"
              onClick={() => setSorteando(true)}
              title="Alumno aleatorio"
              aria-label="Alumno aleatorio"
            >
              <Shuffle size={18} aria-hidden />
            </button>
          )}
          <button className="btn-suave shrink-0" onClick={() => setConfigurando('nueva')}>
            <Plus size={18} aria-hidden />
            Columna
          </button>
          {idEfectivo && grupo && visibles.length > 0 && (
            <button
              className="btn-suave w-11 shrink-0 px-0"
              onClick={() => {
                copiarColumnas({
                  columnas: visibles,
                  etapaOrigen: grupo.etapa,
                  origenResumen: `${visibles.length} ${visibles.length === 1 ? 'columna' : 'columnas'} de ${grupo.nombre}`,
                })
                mostrarAviso(`Estructura de ${grupo.nombre} copiada`)
              }}
              title="Copiar estructura del grupo"
              aria-label="Copiar estructura del grupo"
            >
              <Copy size={18} aria-hidden />
            </button>
          )}
          {/* Solo Primaria: en Infantil no hay notas que repartir (§6). */}
          {grupo?.etapa === 'primaria' && (
            <button
              className="btn-suave w-11 shrink-0 px-0"
              onClick={() => setRepartiendo(true)}
              title="Pesos de las unidades en el trimestre"
              aria-label="Pesos de las unidades en el trimestre"
            >
              <Scale size={18} aria-hidden />
            </button>
          )}
          <button
            className="btn-suave w-11 shrink-0 px-0"
            onClick={() => setVistaAbierta(true)}
            title="Vista de la rejilla"
            aria-label="Vista de la rejilla"
          >
            <Columns3 size={18} aria-hidden />
          </button>
        </div>

        {copiadas && (
          <div className="panel-agua flex items-center gap-2 text-sm">
            <Clipboard size={16} className="shrink-0 text-primario dark:text-agua" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Copiado: <strong>{copiadas.origenResumen}</strong>
            </span>
            {idEfectivo && (
              <button
                onClick={() => setPegando(true)}
                className="flex min-h-tap min-w-tap items-center justify-center text-primario dark:text-agua"
                aria-label="Pegar aquí"
                title="Pegar aquí"
              >
                <Clipboard size={18} aria-hidden />
              </button>
            )}
            <button
              onClick={limpiarPortapapelesColumnas}
              className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
              aria-label="Descartar lo copiado"
              title="Descartar lo copiado"
            >
              <ClipboardX size={18} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {alumnos?.length === 0 ? (
        <div className="p-4">
          <EstadoVacio
            titulo={`${grupo?.nombre} no tiene alumnado`}
            accion={
              <button
                className="btn-primario w-full"
                onClick={() => navegar(`/grupos/${idEfectivo}`)}
              >
                Importar listado
              </button>
            }
          />
        </div>
      ) : visibles.length === 0 ? (
        <div className="p-4">
          <EstadoVacio
            Icono={Table2}
            titulo="Sin columnas en este trimestre"
            descripcion="Añade la primera: número, positivos y negativos, caritas, lista de control, rúbrica o texto."
            accion={
              <button className="btn-primario w-full" onClick={() => setConfigurando('nueva')}>
                <Plus size={18} aria-hidden />
                Nueva columna
              </button>
            }
          />
        </div>
      ) : (
        <Rejilla
          alumnos={alumnos ?? []}
          visibles={visibles}
          valores={mapaValores}
          calculos={calculos}
          notasRubrica={notasRubrica}
          contadoresObs={contadoresObs ?? new Map()}
          grupoId={idEfectivo!}
          onConfigurar={setConfigurando}
          onEvaluar={abrirEditor}
          onAplicarGrupo={setAplicando}
          onCambiar={cambiar}
        />
      )}

      {grupo?.etapa === 'primaria' && idEfectivo && (
        <NotaDelTrimestre
          grupoId={idEfectivo}
          trimestre={trimestre}
          alumnos={alumnos ?? []}
          onRepartir={() => setRepartiendo(true)}
        />
      )}

      <MediasPorUnidad
        columnas={columnas ?? []}
        alumnos={alumnos ?? []}
        valores={mapaValores}
        rubricas={mapaRubricas}
        unidades={unidades ?? []}
      />

      <HojaPesosTrimestre
        abierta={repartiendo}
        grupo={grupo}
        trimestre={trimestre}
        onCerrar={() => setRepartiendo(false)}
      />

      <HojaVistaRejilla abierta={vistaAbierta} onCerrar={() => setVistaAbierta(false)} />

      <HojaColumna
        estado={configurando}
        grupo={grupo}
        trimestre={trimestre}
        onCerrar={() => setConfigurando(null)}
        onAplicarGrupo={(c) => {
          setConfigurando(null)
          setAplicando(c)
        }}
      />

      <HojaAplicarGrupo
        columna={aplicando}
        alumnos={alumnos ?? []}
        valores={mapaValores}
        onCerrar={() => setAplicando(null)}
      />

      {evaluando && (
        <EditorColumna
          columna={evaluando.columna}
          alumnos={alumnos ?? []}
          indice={evaluando.indice}
          valores={mapaValores}
          onIndice={(indice) => setEvaluando({ ...evaluando, indice })}
          onCerrar={() => setEvaluando(null)}
        />
      )}

      {evaluandoRubrica && (
        <EvaluadorRubrica
          columna={evaluandoRubrica.columna}
          rubrica={
            evaluandoRubrica.columna.rubricaId
              ? mapaRubricas.get(evaluandoRubrica.columna.rubricaId)
              : undefined
          }
          filas={filasRubrica?.get(evaluandoRubrica.columna.id) ?? []}
          alumnos={alumnos ?? []}
          indice={evaluandoRubrica.indice}
          valores={mapaValores}
          onCambiar={cambiar}
          onIndice={(indice) => setEvaluandoRubrica({ ...evaluandoRubrica, indice })}
          onCerrar={() => setEvaluandoRubrica(null)}
          onVerTabla={() => {
            const columna = evaluandoRubrica.columna
            setEvaluandoRubrica(null)
            setTablaRubrica(columna)
          }}
        />
      )}

      {tablaRubrica && (
        <TablaRubrica
          columna={tablaRubrica}
          rubrica={
            tablaRubrica.rubricaId ? mapaRubricas.get(tablaRubrica.rubricaId) : undefined
          }
          alumnos={alumnos ?? []}
          valores={mapaValores}
          onCambiar={cambiar}
          onCerrar={() => setTablaRubrica(null)}
        />
      )}

      {pegando && idEfectivo && grupo && copiadas && (
        <HojaPegarColumnas
          copiadas={copiadas}
          grupo={grupo}
          trimestre={trimestre}
          onCerrar={() => setPegando(false)}
        />
      )}
    </>
  )
}

/**
 * Cabecera de una columna. Toque → configurar; pulsación larga → aplicar un
 * valor a todo el grupo (solo en los tipos que lo admiten). Es su propio
 * componente porque la pulsación larga es un hook y no puede vivir en un `.map`.
 */
function CabeceraColumna({
  columna,
  onConfigurar,
  onAplicarGrupo,
}: {
  columna: Columna
  onConfigurar: (c: Columna) => void
  onAplicarGrupo: (c: Columna) => void
}) {
  const aplicable = TIPOS_APLICABLES_GRUPO.includes(columna.tipo)
  const larga = usePulsacionLarga(() => onAplicarGrupo(columna))

  return (
    <th
      scope="col"
      className="min-w-[76px] border-b-2 border-r border-borde bg-agua-claro p-0 dark:border-noche-borde dark:bg-noche-elevada max-lg:landscape:sticky max-lg:landscape:top-0 max-lg:landscape:z-10 lg:sticky lg:top-0 lg:z-10"
    >
      <button
        className="flex h-full w-full flex-col items-center gap-0.5 px-2 py-2"
        {...(aplicable ? larga.props : {})}
        onClick={() => {
          // Tras la pulsación larga, el click también dispara: se ignora para no
          // abrir la configuración encima de la hoja de «aplicar a todo».
          if (aplicable && larga.fueLargo.current) return
          onConfigurar(columna)
        }}
        title={columna.titulo}
      >
        <span className="line-clamp-2 text-xs font-bold leading-tight text-primario-oscuro dark:text-agua">
          {columna.titulo}
        </span>
        <Settings2 size={12} className="text-tinta-tenue" aria-hidden />
      </button>
    </th>
  )
}

/**
 * Rejilla táctil. La columna de alumnos va congelada a la izquierda con
 * `position: sticky`, que es lo que permite evaluar en el móvil sin perder de
 * vista de quién es cada fila.
 */
function Rejilla({
  alumnos,
  visibles,
  valores,
  calculos,
  notasRubrica,
  contadoresObs,
  grupoId,
  onConfigurar,
  onEvaluar,
  onAplicarGrupo,
  onCambiar,
}: {
  alumnos: Alumno[]
  visibles: Columna[]
  valores: Map<string, import('../db/types').ValorCelda>
  calculos: Map<string, ResultadoCalculo>
  notasRubrica: Map<string, ResultadoCalculo>
  contadoresObs: Map<string, ContadorSigno>
  grupoId: string
  onConfigurar: (c: Columna) => void
  /** `indice` = fila tocada, para que el recorrido empiece en ese alumno. */
  onEvaluar: (c: Columna, indice: number) => void
  /** Long-press en la cabecera: aplicar un valor a toda la columna. */
  onAplicarGrupo: (c: Columna) => void
  onCambiar: (
    columna: Columna,
    alumnoId: string,
    cambios: Parameters<typeof guardarValor>[2],
  ) => Promise<() => Promise<void>>
}) {
  // Los botones +/− abren la hoja de observación (M4) con el signo ya elegido,
  // para poder escoger tipo y escribir el texto — no suman en el acto.
  const [observando, setObservando] = useState<{
    alumno: Alumno
    signo: SignoObservacion
  } | null>(null)
  const config = useConfig()
  const anchoColumnaAlumno = ANCHO_COLUMNA_ALUMNO_PX[config.anchoColumnaAlumno]

  return (
    // En escritorio la rejilla acota su propia altura y hace scroll interno:
    // así la cabecera de columnas puede quedarse fija (`lg:sticky lg:top-0`)
    // sin tener que coordinar su posición con la altura variable de Cabecera.
    <div className="carril-fab-derecha overflow-x-auto max-lg:landscape:max-h-[75dvh] max-lg:landscape:overflow-y-auto lg:max-h-[70vh] lg:overflow-y-auto">
      <table className="w-max border-separate border-spacing-0">
        <caption className="sr-only">Cuaderno de notas: alumnos por columnas de evaluación</caption>
        <thead>
          <tr>
            <th
              className="sticky left-0 z-20 border-b-2 border-r border-borde bg-agua-claro px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua max-lg:landscape:top-0 lg:top-0"
              style={{ minWidth: anchoColumnaAlumno, width: anchoColumnaAlumno }}
              scope="col"
            >
              Alumno
            </th>
            {visibles.map((columna) => (
              <CabeceraColumna
                key={columna.id}
                columna={columna}
                onConfigurar={onConfigurar}
                onAplicarGrupo={onAplicarGrupo}
              />
            ))}
          </tr>
        </thead>

        <tbody>
          {alumnos.map((a, fila) => {
            const nombre = a.alias || a.nombre
            const contador = contadoresObs.get(a.id)
            return (
            <tr key={a.id} className={fila % 2 ? 'bg-agua-claro/30 dark:bg-noche-elevada/30' : ''}>
              <th
                scope="row"
                className={
                  'sticky left-0 z-10 border-b border-r border-borde px-2 py-1.5 text-left text-sm font-semibold dark:border-noche-borde ' +
                  (fila % 2
                    ? 'bg-[rgb(238,245,246)] dark:bg-noche-superficie'
                    : 'bg-superficie dark:bg-noche-superficie')
                }
                style={{ minWidth: anchoColumnaAlumno, width: anchoColumnaAlumno }}
              >
                <div className="flex items-center gap-1">
                  <button
                    className="min-w-0 flex-1 truncate text-left underline-offset-2 active:underline"
                    onClick={() => navegar(`/alumnos/${a.id}`)}
                    aria-label={`Abrir ficha de ${formatearNombre(a, config.formatoNombre)}`}
                  >
                    {formatearNombre(a, config.formatoNombre)}
                  </button>
                  <button
                    onClick={() => setObservando({ alumno: a, signo: '+' })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lima/20 text-lima-oscuro transition active:scale-95 dark:text-lima"
                    aria-label={`Observación positiva para ${nombre}`}
                  >
                    <Plus size={16} strokeWidth={3} aria-hidden />
                  </button>
                  <button
                    onClick={() => setObservando({ alumno: a, signo: '-' })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-acento/15 text-acento transition active:scale-95"
                    aria-label={`Observación negativa para ${nombre}`}
                  >
                    <Minus size={16} strokeWidth={3} aria-hidden />
                  </button>
                </div>
                {contador && (contador.positivos > 0 || contador.negativos > 0) && (
                  <div className="cifra mt-0.5 flex items-center gap-1.5 text-xs font-bold">
                    {contador.positivos > 0 && (
                      <span className="text-lima-oscuro dark:text-lima">+{contador.positivos}</span>
                    )}
                    {contador.negativos > 0 && <span className="text-acento">−{contador.negativos}</span>}
                  </div>
                )}
              </th>

              {visibles.map((columna) => (
                <td
                  key={`${columna.id}-${a.id}`}
                  className="border-b border-r border-borde p-0 dark:border-noche-borde"
                >
                  <Celda
                    columna={columna}
                    alumno={a}
                    valor={valores.get(`${columna.id}|${a.id}`)}
                    calculado={
                      columna.tipo === 'calculo'
                        ? calculos.get(`${columna.id}|${a.id}`)
                        : columna.tipo === 'rubrica'
                          ? notasRubrica.get(`${columna.id}|${a.id}`)
                          : undefined
                    }
                    // Escritura optimista sin aviso (§7): un toque suelto no
                    // necesita confirmación, igual que en el pase de lista.
                    onCambiar={(cambios) => void onCambiar(columna, a.id, cambios)}
                    onAbrirEditor={() => onEvaluar(columna, fila)}
                  />
                </td>
              ))}
            </tr>
            )
          })}
        </tbody>
      </table>

      <HojaObservacion
        abierta={!!observando}
        grupoId={grupoId}
        alumno={observando?.alumno}
        signoInicial={observando?.signo}
        onCerrar={() => setObservando(null)}
      />
    </div>
  )
}

const OPCIONES_FORMATO_NOMBRE: { valor: FormatoNombre; etiqueta: string }[] = [
  { valor: 'apellidos-nombre', etiqueta: 'Apellidos, Nombre' },
  { valor: 'nombre-apellidos', etiqueta: 'Nombre Apellidos' },
  { valor: 'solo-nombre', etiqueta: 'Solo Nombre' },
]

const OPCIONES_ANCHO_COLUMNA: { valor: AnchoColumnaAlumno; etiqueta: string }[] = [
  { valor: 'estrecha', etiqueta: 'Estrecha' },
  { valor: 'media', etiqueta: 'Media' },
  { valor: 'ancha', etiqueta: 'Ancha' },
]

/** Preferencias de la rejilla (§ Bloque 4): formato del nombre y ancho de la columna congelada. */
function HojaVistaRejilla({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const config = useConfig()

  return (
    <Hoja abierta={abierta} titulo="Vista de la rejilla" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <span className="etiqueta">Nombre del alumnado</span>
          <div className="space-y-2">
            {OPCIONES_FORMATO_NOMBRE.map((o) => (
              <button
                key={o.valor}
                onClick={() => void guardarConfig({ formatoNombre: o.valor })}
                className={
                  'w-full rounded-xl border p-3 text-left ' +
                  (config.formatoNombre === o.valor
                    ? 'border-primario bg-primario/10'
                    : 'border-borde dark:border-noche-borde')
                }
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="etiqueta">Ancho de la columna de alumnado</span>
          <div className="grid grid-cols-3 gap-2">
            {OPCIONES_ANCHO_COLUMNA.map((o) => (
              <button
                key={o.valor}
                onClick={() => void guardarConfig({ anchoColumnaAlumno: o.valor })}
                className={(config.anchoColumnaAlumno === o.valor ? 'btn-primario' : 'btn-suave') + ' px-0'}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Hoja>
  )
}

/** Motivos del log del motor, en español y en una línea. */
const EXPLICACION: Record<MotivoExclusion, string> = {
  sin_unidad: 'sin unidad didáctica',
  tipo_no_califica: 'no da nota',
  es_calculo: 'es una columna de cálculo',
  unidad_no_computa: 'la unidad no cuenta para la nota',
  unidad_sin_trimestre: 'la unidad no tiene trimestre',
  unidad_sin_instrumentos: 'la unidad no tiene ningún instrumento que dé nota',
  sin_evidencia: 'sin evaluar',
  renormalizado: 'pesos reajustados por lo que falta',
  sin_pesos: 'faltan los pesos',
}

/**
 * Nota del trimestre según la Orden 130/2023: instrumento → unidad → trimestre,
 * con su conversión oficial.
 *
 * Es la nota buena, la que se traslada a Raíces, y por eso enseña también el
 * porqué: qué unidad ha aportado cuánto y qué se ha quedado fuera. Una nota que
 * sale de descartar cosas sin evidencia tiene que poder explicarse delante de
 * quien pregunte.
 */
function NotaDelTrimestre({
  grupoId,
  trimestre,
  alumnos,
  onRepartir,
}: {
  grupoId: string
  trimestre: Trimestre
  alumnos: Alumno[]
  onRepartir: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [detalle, setDetalle] = useState<string | null>(null)
  const config = useConfig()

  // Depende de columnas, filas, valores y unidades: se observan las cuatro
  // tablas para que la nota se rehaga sola al tocar cualquier cosa.
  const notas = useLiveQuery(async () => {
    await Promise.all([db.columnas.count(), db.filas.count(), db.valores.count(), db.unidades.count()])
    return calificarGrupo(grupoId, trimestre)
  }, [grupoId, trimestre])

  if (!notas || alumnos.length === 0) return null
  const hayAlguna = [...notas.values()].some((r) => r.nota !== null)

  return (
    <div className="mt-4 px-4 pb-2">
      <button className="desplegable w-full" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <span className="flex-1 text-left text-sm font-bold">
          Nota del {trimestre}.º trimestre
        </span>
        <ChevronDown
          size={18}
          className={'shrink-0 transition-transform ' + (abierto ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {abierto && (
        <div className="tarjeta mt-3 py-3">
          <h3 className="text-base font-bold">Nota del {trimestre}.º trimestre</h3>
          <div className="linea-pista mb-2 mt-1.5" aria-hidden />

          {!hayAlguna && (
            <div className="panel-agua mb-2 text-sm">
              Todavía no sale ninguna nota. Hace falta que las unidades tengan peso en el trimestre
              y que sus instrumentos tengan peso dentro de la unidad.
              <button className="btn-suave mt-2 w-full" onClick={onRepartir}>
                Repartir pesos del trimestre
              </button>
            </div>
          )}

          <ul className="space-y-1">
            {alumnos.map((a) => {
              const res = notas.get(a.id)
              const oficial = res?.nota != null ? notaOficial(res.nota, config.bandaSobre) : null
              const abiertoEste = detalle === a.id
              return (
                <li key={a.id}>
                  <button
                    className="flex w-full items-center gap-2 py-1 text-left text-sm"
                    onClick={() => setDetalle(abiertoEste ? null : a.id)}
                    aria-expanded={abiertoEste}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {formatearNombre(a, config.formatoNombre)}
                    </span>
                    {/* Real → redondeada (oficial), siempre juntas: el decimal
                        real queda trazable para una reclamación (Orden 130,
                        art. 20), sea cual sea el modo de redondeo elegido. */}
                    <span className="cifra text-xs texto-suave">
                      {oficial == null ? '—' : `${oficial.real.toFixed(2)} → ${oficial.redondeada}`}
                    </span>
                    <span className="pildora w-12 justify-center bg-agua-claro px-0 py-0.5 text-xs font-bold text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                      {oficial?.oficial ?? '—'}
                    </span>
                  </button>

                  {abiertoEste && res && (
                    <div className="mb-1 ml-2 border-l-2 border-agua pl-3 text-xs">
                      {res.porUnidad.map((u) => (
                        <p key={u.udId} className="cifra">
                          {u.titulo}: <strong>{u.nota.toFixed(2)}</strong> × {u.peso} %
                        </p>
                      ))}
                      {res.log.length > 0 && (
                        <ul className="mt-1 texto-suave">
                          {res.log.map((l, i) => (
                            <li key={i}>
                              {l.referencia}: {EXPLICACION[l.motivo]}
                              {l.detalle ? ` (${l.detalle})` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <ResumenDistribucion
            trimestre={trimestre}
            alumnos={alumnos}
            notas={notas}
            bandaSobre={config.bandaSobre}
          />

          <p className="mt-2 text-xs texto-suave">
            Orden 130/2023: cada instrumento pesa dentro de su unidad y cada unidad dentro del
            trimestre. Lo que no está evaluado se excluye y el resto se reajusta; toca un alumno
            para ver el desglose.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Recuento del trimestre por banda oficial (§ Bloque 3.3): absoluto y
 * porcentaje. Quien no tiene nota calculable va aparte, en «Sin datos» —
 * nunca como IN, que acusaría de suspenso a quien simplemente no tiene
 * evidencia todavía.
 */
function ResumenDistribucion({
  trimestre,
  alumnos,
  notas,
  bandaSobre,
}: {
  trimestre: Trimestre
  alumnos: Alumno[]
  notas: Map<string, ResultadoTrimestre>
  bandaSobre: BandaSobre
}) {
  const recuento: Record<CalificacionOficial | 'SIN_DATOS', number> = {
    IN: 0,
    SU: 0,
    BI: 0,
    NT: 0,
    SB: 0,
    SIN_DATOS: 0,
  }
  for (const a of alumnos) {
    const res = notas.get(a.id)
    if (res?.nota == null) recuento.SIN_DATOS++
    else recuento[notaOficial(res.nota, bandaSobre).oficial]++
  }

  const total = alumnos.length
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100))

  const bandas: { clave: CalificacionOficial; clase: string }[] = [
    { clave: 'IN', clase: 'bg-acento/15 text-acento' },
    {
      clave: 'SU',
      clase: 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua',
    },
    {
      clave: 'BI',
      clase: 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua',
    },
    {
      clave: 'NT',
      clase: 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua',
    },
    { clave: 'SB', clase: 'bg-lima/20 text-lima-oscuro dark:text-lima' },
  ]

  return (
    <div className="mt-3">
      <p className="etiqueta mb-2">
        Distribución del {trimestre}.º trimestre
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {bandas.map(({ clave, clase }) => (
          <div key={clave} className={'rounded-xl2 p-2.5 text-center ' + clase}>
            <p className="cifra text-xl font-bold">{recuento[clave]}</p>
            <p className="text-xs font-bold">{clave}</p>
            <p className="cifra text-xs">{pct(recuento[clave])}%</p>
          </div>
        ))}
        <div className="rounded-xl2 bg-white p-2.5 text-center text-tinta-tenue dark:bg-noche-superficie">
          <p className="cifra text-xl font-bold">{recuento.SIN_DATOS}</p>
          <p className="text-xs font-bold">Sin datos</p>
          <p className="cifra text-xs">{pct(recuento.SIN_DATOS)}%</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Media simple por unidad, informativa. NO es la nota oficial —esa la calcula
 * `NotaDelTrimestre` con los pesos de la Orden 130— sino el vistazo rápido de
 * «cómo va esta unidad», con todas las columnas valiendo igual.
 */
function MediasPorUnidad({
  columnas,
  alumnos,
  valores,
  rubricas,
  unidades,
}: {
  columnas: Columna[]
  alumnos: Alumno[]
  valores: Map<string, import('../db/types').ValorCelda>
  rubricas: Map<string, Rubrica>
  unidades: import('../db/types').UnidadDidactica[]
}) {
  const [abierto, setAbierto] = useState(false)
  const config = useConfig()
  const grupos = useMemo(() => agruparPorUnidad(columnas), [columnas])

  const conUnidad = [...grupos.entries()].filter(([udId]) => udId !== null)
  if (conUnidad.length === 0 || alumnos.length === 0) return null

  return (
    <div className="mt-2 p-4">
      <button className="desplegable w-full" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <span className="flex-1 text-left text-sm font-bold">Medias por unidad</span>
        <ChevronDown
          size={18}
          className={'shrink-0 transition-transform ' + (abierto ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {conUnidad.map(([udId, cols]) => {
            const unidad = unidades.find((u) => u.id === udId)
            return (
              <section key={udId} className="tarjeta py-3">
                <h3 className="text-base font-bold">{unidad?.titulo ?? 'Unidad'}</h3>
                <div className="linea-pista mb-2 mt-1.5" aria-hidden />
                <ul className="space-y-1">
                  {alumnos.map((a) => {
                    const { media, contadas } = mediaDe(cols, valores, a.id, rubricas)
                    return (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {formatearNombre(a, config.formatoNombre)}
                        </span>
                        <span className="cifra font-bold">
                          {media == null ? '—' : media.toFixed(1)}
                        </span>
                        <span className="cifra w-16 text-right text-xs texto-suave">
                          {contadas}/{cols.length}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-2 text-xs texto-suave">
                  Media simple sobre 10, con todas las columnas valiendo igual. Es un vistazo, no
                  la nota oficial: esa lleva los pesos de la Orden 130.
                </p>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Confirmación de pegado de columnas (Bloque 3): valida antes de escribir
 * (etapa compatible + criterios del ciclo destino) y solo entonces muestra el
 * resumen «Se crearán N columnas». Nunca toca `db.valores`: solo estructura.
 */
function HojaPegarColumnas({
  copiadas,
  grupo,
  trimestre,
  onCerrar,
}: {
  copiadas: import('../store/portapapelesColumnas').ColumnasCopiadas
  grupo: Grupo
  trimestre: Trimestre
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [validacion, setValidacion] = useState<ResultadoValidacionPegado | null>(null)

  useEffect(() => {
    let cancelado = false
    setValidacion(null)
    void validarPegado(copiadas.columnas, copiadas.etapaOrigen, grupo.etapa, grupo.nivel).then(
      (r) => {
        if (!cancelado) setValidacion(r)
      },
    )
    return () => {
      cancelado = true
    }
  }, [copiadas, grupo.etapa, grupo.nivel])

  async function pegar() {
    const resultado = await pegarColumnas(
      grupo.id,
      trimestre,
      copiadas.columnas,
      copiadas.etapaOrigen,
      grupo.etapa,
      grupo.nivel,
    )
    onCerrar()
    if (resultado.creadas > 0) {
      mostrarAviso(
        `${resultado.creadas} ${resultado.creadas === 1 ? 'columna creada' : 'columnas creadas'}`,
        resultado.deshacer,
      )
    }
  }

  return (
    <Hoja abierta titulo="Pegar columnas" onCerrar={onCerrar}>
      <div className="space-y-4">
        {!validacion ? (
          <p className="text-sm texto-suave">Comprobando…</p>
        ) : !validacion.permitido ? (
          <>
            <p className="text-sm text-acento">{validacion.motivo}</p>
            <button className="btn-suave w-full" onClick={onCerrar}>
              Entendido
            </button>
          </>
        ) : (
          <>
            <div className="panel-agua text-sm">
              {validacion.aPegar.length === 0
                ? 'No queda ninguna columna que se pueda pegar aquí.'
                : `Se ${validacion.aPegar.length === 1 ? 'creará' : 'crearán'} ${validacion.aPegar.length} ${validacion.aPegar.length === 1 ? 'columna' : 'columnas'} en ${grupo.nombre} · ${trimestre}.º trimestre.`}
            </div>

            {validacion.criteriosNoEncajan.length > 0 && (
              <div className="rounded-xl2 border border-acento/30 bg-acento/5 p-3 text-sm">
                <p className="font-bold text-acento">
                  {validacion.criteriosNoEncajan.length === 1
                    ? 'No encaja en el ciclo destino:'
                    : 'No encajan en el ciclo destino:'}
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {validacion.criteriosNoEncajan.map((titulo) => (
                    <li key={titulo}>{titulo}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs texto-suave">
                  Su criterio no existe en {grupo.nombre}; se pegará el resto.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button className="btn-suave" onClick={onCerrar}>
                Cancelar
              </button>
              <button
                className="btn-primario"
                onClick={() => void pegar()}
                disabled={validacion.aPegar.length === 0}
              >
                Pegar
              </button>
            </div>
          </>
        )}
      </div>
    </Hoja>
  )
}
