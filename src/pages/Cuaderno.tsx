import { useLiveQuery } from 'dexie-react-hooks'
import {
  Clipboard,
  ClipboardCheck,
  ClipboardX,
  Copy,
  Minus,
  Plus,
  Settings2,
  Shuffle,
  Table2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Celda, EditorColumna, HojaAplicarGrupo, TablaRubrica } from '../components/Celda'
import { EstadoVacio } from '../components/EstadoVacio'
import { Hoja } from '../components/Hoja'
import { HojaColumna } from '../components/HojaColumna'
import { HojaObservacion } from '../components/HojaObservacion'
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
  valoresDe,
  type ResultadoCalculo,
  type ResultadoValidacionPegado,
} from '../db/cuaderno'
import { db } from '../db/db'
import type {
  Alumno,
  Columna,
  Grupo,
  Rubrica,
  SignoObservacion,
  Trimestre,
  ValorCelda,
} from '../db/types'
import { contadoresPorAlumno, type ContadorSigno } from '../db/observaciones'
import { usePulsacionLarga } from '../lib/pulsacionLarga'
import { navegar } from '../lib/router'
import { usePortapapelesColumnas } from '../store/portapapelesColumnas'
import { useUI } from '../store/ui'

export function Cuaderno() {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const copiadas = usePortapapelesColumnas((s) => s.copiadas)
  const copiarColumnas = usePortapapelesColumnas((s) => s.copiar)
  const limpiarPortapapelesColumnas = usePortapapelesColumnas((s) => s.limpiar)

  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [trimestre, setTrimestre] = useState<Trimestre>(1)
  const [configurando, setConfigurando] = useState<Columna | 'nueva' | null>(null)
  const [evaluando, setEvaluando] = useState<{ columna: Columna; indice: number } | null>(null)
  const [tablaRubrica, setTablaRubrica] = useState<Columna | null>(null)
  const [aplicando, setAplicando] = useState<Columna | null>(null)
  const [sorteando, setSorteando] = useState(false)
  const [pegando, setPegando] = useState(false)

  const grupos = useLiveQuery(async () => {
    const lista = await db.grupos.toArray()
    return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [])

  const grupo = grupos?.find((g) => g.id === grupoId) ?? grupos?.[0] ?? null
  const idEfectivo = grupo?.id ?? null

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

  // La rúbrica siempre se abre en tabla (alumno × criterio): nunca se separa
  // en columnas sueltas de la rejilla, así que aquí es siempre una columna 1:1.
  const visibles = columnas ?? []

  /**
   * Rúbrica → tabla; número/texto → recorrido por alumno; el resto se edita al
   * toque.
   *
   * `indice` es la fila tocada: el recorrido arranca en ESE alumno, no en el
   * primero de la clase. Empezar siempre por el 0 obligaba a avanzar a mano
   * hasta la fila que se acababa de tocar.
   */
  function abrirEditor(columna: Columna, indice: number) {
    if (columna.tipo === 'rubrica') setTablaRubrica(columna)
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
      <Cabecera
        titulo="Cuaderno"
        subtitulo={grupo ? `${grupo.nombre} · ${trimestre}.º trimestre` : undefined}
        acciones={
          <div className="flex gap-2">
            {idEfectivo && (
              <button
                className="btn-suave w-11 px-0"
                onClick={() => navegar(`/asistencia/${idEfectivo}`)}
                title="Pasar lista"
                aria-label="Pasar lista"
              >
                <ClipboardCheck size={18} aria-hidden />
              </button>
            )}
            {idEfectivo && (
              <button
                className="btn-suave w-11 px-0"
                onClick={() => setSorteando(true)}
                title="Alumno aleatorio"
                aria-label="Alumno aleatorio"
              >
                <Shuffle size={18} aria-hidden />
              </button>
            )}
            <button className="btn-suave" onClick={() => setConfigurando('nueva')}>
              <Plus size={18} aria-hidden />
              Columna
            </button>
            {idEfectivo && grupo && visibles.length > 0 && (
              <button
                className="btn-suave w-11 px-0"
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
          </div>
        }
      />

      {sorteando && idEfectivo && (
        <SorteoAlumno grupoId={idEfectivo} onCerrar={() => setSorteando(false)} />
      )}

      <div className="space-y-3 p-4 pb-2">
        <div className="flex flex-wrap gap-2">
          {grupos.map((g) => (
            <button
              key={g.id}
              onClick={() => setGrupoId(g.id)}
              aria-pressed={idEfectivo === g.id}
              className={
                'pildora min-h-[40px] gap-1.5 px-3 ' +
                (idEfectivo === g.id
                  ? 'bg-primario text-white'
                  : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
              }
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: g.color }}
                aria-hidden
              />
              {g.nombre}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTrimestre(t)}
              className={(trimestre === t ? 'btn-primario' : 'btn-suave') + ' px-0'}
            >
              {t}.º trimestre
            </button>
          ))}
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
          rubricas={mapaRubricas}
          calculos={calculos}
          contadoresObs={contadoresObs ?? new Map()}
          grupoId={idEfectivo!}
          onConfigurar={setConfigurando}
          onEvaluar={abrirEditor}
          onAplicarGrupo={setAplicando}
          onCambiar={cambiar}
        />
      )}

      <MediasPorUnidad
        columnas={columnas ?? []}
        alumnos={alumnos ?? []}
        valores={mapaValores}
        rubricas={mapaRubricas}
        unidades={unidades ?? []}
      />

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
      className="min-w-[76px] border-b-2 border-r border-borde bg-agua-claro p-0 dark:border-noche-borde dark:bg-noche-elevada lg:sticky lg:top-0 lg:z-10"
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
  rubricas,
  calculos,
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
  rubricas: Map<string, Rubrica>
  calculos: Map<string, ResultadoCalculo>
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

  return (
    // En escritorio la rejilla acota su propia altura y hace scroll interno:
    // así la cabecera de columnas puede quedarse fija (`lg:sticky lg:top-0`)
    // sin tener que coordinar su posición con la altura variable de Cabecera.
    <div className="carril-fab-derecha overflow-x-auto lg:max-h-[70vh] lg:overflow-y-auto">
      <table className="w-max border-separate border-spacing-0">
        <caption className="sr-only">Cuaderno de notas: alumnos por columnas de evaluación</caption>
        <thead>
          <tr>
            <th
              className="sticky left-0 z-20 min-w-[196px] border-b-2 border-r border-borde bg-agua-claro px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua lg:top-0"
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
                  'sticky left-0 z-10 min-w-[196px] border-b border-r border-borde px-2 py-1.5 text-left text-sm font-semibold dark:border-noche-borde ' +
                  (fila % 2
                    ? 'bg-[rgb(238,245,246)] dark:bg-noche-superficie'
                    : 'bg-superficie dark:bg-noche-superficie')
                }
              >
                <div className="flex items-center gap-1">
                  <button
                    className="min-w-0 flex-1 truncate text-left underline-offset-2 active:underline"
                    onClick={() => navegar(`/alumnos/${a.id}`)}
                    aria-label={`Abrir ficha de ${a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}`}
                  >
                    {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
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
                    rubrica={columna.rubricaId ? rubricas.get(columna.rubricaId) : undefined}
                    calculado={
                      columna.tipo === 'calculo'
                        ? calculos.get(`${columna.id}|${a.id}`)
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

/** Media por unidad didáctica: el uso que se le dará a estas columnas después. */
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
  const grupos = useMemo(() => agruparPorUnidad(columnas), [columnas])

  const conUnidad = [...grupos.entries()].filter(([udId]) => udId !== null)
  if (conUnidad.length === 0 || alumnos.length === 0) return null

  return (
    <div className="p-4">
      <button
        className="btn-suave w-full"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        {abierto ? 'Ocultar' : 'Ver'} medias por unidad
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
                          {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
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
                  Media sobre 10 de las columnas promediables. Los positivos/negativos y el texto
                  no entran.
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
