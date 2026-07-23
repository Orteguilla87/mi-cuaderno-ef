import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  Grid2x2,
  Lock,
  Save,
  Shuffle,
  Sliders,
  Unlock,
  Users2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { useConfig } from '../db/config'
import { db } from '../db/db'
import {
  alumnosGenerables,
  equiposGuardados,
  guardarEquipo,
  historialEquipos,
  vinculosDelGrupo,
} from '../db/equipos'
import { leerAsistenciaGrupo } from '../db/asistencia'
import {
  generarEquipos,
  resolverTamanios,
  type ComoRepartirSobra,
  type ModoGeneracion,
} from '../lib/generadorEquipos'
import type { Alumno, ConfigGeneracionEquipos, EquipoGenerado } from '../db/types'
import { aISO } from '../lib/fechas'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'
import { Pizarra } from '../components/Pizarra'

const MODOS: { valor: ModoGeneracion; etiqueta: string; descripcion: string }[] = [
  { valor: 'aleatorio', etiqueta: 'Aleatorio', descripcion: 'Reparto al azar' },
  {
    valor: 'heterogeneo',
    etiqueta: 'Heterogéneo',
    descripcion: 'Mezcla niveles: equipos parejos entre sí',
  },
  {
    valor: 'homogeneo',
    etiqueta: 'Homogéneo',
    descripcion: 'Agrupa niveles parecidos: equipos distintos entre sí',
  },
]

/**
 * Generador de equipos (§ petición del usuario). Todo en una pantalla con
 * paso interno (configurar → resultado; la pizarra es una superposición),
 * para no perder la configuración al navegar.
 */
export function EquiposGenerador({ grupoId, sesionId }: { grupoId: string; sesionId?: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const config = useConfig()

  const [paso, setPaso] = useState<'configurar' | 'resultado'>('configurar')
  const [pizarra, setPizarra] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // — configuración —
  const [soloPresentes, setSoloPresentes] = useState(true)
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  const [porTamano, setPorTamano] = useState<'num' | 'tamano'>('num')
  const [numEquipos, setNumEquipos] = useState(4)
  const [tamanoEquipo, setTamanoEquipo] = useState(5)
  const [sobra, setSobra] = useState<ComoRepartirSobra>('repartir')
  const [modo, setModo] = useState<ModoGeneracion>('aleatorio')
  const [equilibrarGenero, setEquilibrarGenero] = useState(false)
  const [respetarVinculos, setRespetarVinculos] = useState(true)
  const [repartirApoyos, setRepartirApoyos] = useState(false)
  const [priorizarNuevos, setPriorizarNuevos] = useState(false)

  // — resultado —
  const [equipos, setEquipos] = useState<EquipoGenerado[]>([])
  const [advertencia, setAdvertencia] = useState<string | null>(null)
  const [fijados, setFijados] = useState<Record<string, number>>({})
  const [seleccionado, setSeleccionado] = useState<{ equipo: number; alumnoId: string } | null>(
    null,
  )

  const grupo = useLiveQuery(() => db.grupos.get(grupoId), [grupoId])
  const alumnosGrupo = useLiveQuery(async () => {
    const lista = await db.alumnos.where('grupoId').equals(grupoId).toArray()
    return lista
      .filter((a) => a.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  }, [grupoId])

  const presentesHoy = useLiveQuery(async () => {
    if (!alumnosGrupo) return null
    const registros = await leerAsistenciaGrupo(alumnosGrupo.map((a) => a.id), aISO())
    if (registros.size === 0) return null // sin pase de lista hoy: no hay dato
    return new Set(
      [...registros.entries()]
        .filter(([, r]) => r.estado === 'presente' || r.estado === 'retraso')
        .map(([id]) => id),
    )
  }, [alumnosGrupo])

  const vinculos = useLiveQuery(() => vinculosDelGrupo(grupoId), [grupoId]) ?? []
  const guardadas = useLiveQuery(() => equiposGuardados(grupoId), [grupoId]) ?? []
  const unidades = useLiveQuery(() => db.unidades.toArray(), []) ?? []

  const incluidos = useMemo(() => {
    if (!alumnosGrupo) return []
    let lista = alumnosGrupo
    if (soloPresentes && presentesHoy) lista = lista.filter((a) => presentesHoy.has(a.id))
    return lista.filter((a) => !excluidos.has(a.id))
  }, [alumnosGrupo, soloPresentes, presentesHoy, excluidos])

  const tamanios = useMemo(
    () =>
      resolverTamanios(incluidos.length, {
        porNumEquipos: porTamano === 'num' ? numEquipos : undefined,
        porTamano: porTamano === 'tamano' ? tamanoEquipo : undefined,
        sobra,
      }),
    [incluidos.length, porTamano, numEquipos, tamanoEquipo, sobra],
  )

  if (grupo === undefined || alumnosGrupo === undefined) return null
  if (grupo === null) {
    return (
      <>
        <Cabecera titulo="Grupo no encontrado" atras />
        <div className="p-4">
          <button className="btn-suave w-full" onClick={() => navegar('/grupos')}>
            Volver a Grupos
          </button>
        </div>
      </>
    )
  }

  async function generar() {
    if (!alumnosGrupo) return
    const { alumnos: generables, porId } = await alumnosGenerables(grupoId, false)
    const idsIncluidos = new Set(incluidos.map((a) => a.id))
    const alumnosParaMotor = generables.filter((a) => idsIncluidos.has(a.id))
    const historial = priorizarNuevos ? await historialEquipos(grupoId) : []

    const resultado = generarEquipos({
      alumnos: alumnosParaMotor,
      tamanios,
      modo,
      equilibrarGenero,
      repartirApoyos,
      vinculos: respetarVinculos
        ? vinculos.map((v) => ({ alumnoA: v.alumnoA, alumnoB: v.alumnoB, tipo: v.tipo }))
        : [],
      priorizarNuevos,
      historial,
    })

    const colores = config.coloresPetos.length > 0 ? config.coloresPetos : ['#CE184B', '#006A80']
    const nuevos: EquipoGenerado[] = resultado.equipos.map((miembros, i) => ({
      nombre: `Equipo ${i + 1}`,
      color: colores[i % colores.length],
      miembros,
    }))

    setEquipos(nuevos)
    setAdvertencia(resultado.advertencia ?? null)
    setFijados({})
    setSeleccionado(null)
    setPaso('resultado')
    void porId // silencia el lint: se usa solo para tipar, la referencia real vive en la rejilla
  }

  function regenerar() {
    const alumnosPlanos = equipos.flatMap((e) => e.miembros)
    void (async () => {
      const { alumnos: generables } = await alumnosGenerables(grupoId, false)
      const porId = new Set(alumnosPlanos)
      const historial = priorizarNuevos ? await historialEquipos(grupoId) : []
      const resultado = generarEquipos({
        alumnos: generables.filter((a) => porId.has(a.id)),
        tamanios: equipos.map((e) => e.miembros.length),
        modo,
        equilibrarGenero,
        repartirApoyos,
        vinculos: respetarVinculos
          ? vinculos.map((v) => ({ alumnoA: v.alumnoA, alumnoB: v.alumnoB, tipo: v.tipo }))
          : [],
        priorizarNuevos,
        historial,
        fijados,
      })
      setEquipos((prev) =>
        resultado.equipos.map((miembros, i) => ({ ...prev[i], miembros })),
      )
      setAdvertencia(resultado.advertencia ?? null)
    })()
  }

  function alternarFijado(alumnoId: string, equipoIdx: number) {
    setFijados((prev) => {
      const nuevo = { ...prev }
      if (alumnoId in nuevo) delete nuevo[alumnoId]
      else nuevo[alumnoId] = equipoIdx
      return nuevo
    })
  }

  function tocarMiembro(equipoIdx: number, alumnoId: string) {
    if (!seleccionado) {
      setSeleccionado({ equipo: equipoIdx, alumnoId })
      return
    }
    if (seleccionado.alumnoId === alumnoId) {
      setSeleccionado(null)
      return
    }
    if (seleccionado.equipo === equipoIdx) {
      // Mismo equipo: no hay nada que intercambiar; se cambia la selección.
      setSeleccionado({ equipo: equipoIdx, alumnoId })
      return
    }
    setEquipos((prev) => {
      const copia = prev.map((e) => ({ ...e, miembros: [...e.miembros] }))
      const iA = copia[seleccionado.equipo].miembros.indexOf(seleccionado.alumnoId)
      const iB = copia[equipoIdx].miembros.indexOf(alumnoId)
      copia[seleccionado.equipo].miembros[iA] = alumnoId
      copia[equipoIdx].miembros[iB] = seleccionado.alumnoId
      return copia
    })
    setSeleccionado(null)
  }

  async function guardar(nombre: string, udId?: string, vincularSesion?: boolean) {
    const cfg: ConfigGeneracionEquipos = {
      modo,
      soloPresentes,
      equilibrarGenero,
      respetarVinculos,
      repartirApoyos,
      priorizarNuevos,
    }
    await guardarEquipo({ grupoId, nombre, udId, config: cfg, equipos })
    setGuardando(false)
    mostrarAviso(`«${nombre}» guardado${vincularSesion && sesionId ? ' y vinculado a esta sesión' : ''}`)
  }

  const porAlumno = new Map(alumnosGrupo.map((a) => [a.id, a]))

  return (
    <>
      <Cabecera
        titulo="Generador de equipos"
        atras
        subtitulo={
          <span className="flex items-center gap-2">
            <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
            <span>{grupo.nombre}</span>
          </span>
        }
      />

      <div className="space-y-4 p-4">
        {paso === 'configurar' ? (
          <ConfiguracionPaso
            grupoId={grupoId}
            totalAlumnos={alumnosGrupo.length}
            soloPresentes={soloPresentes}
            onSoloPresentes={setSoloPresentes}
            hayPaseDeListaHoy={!!presentesHoy}
            alumnosGrupo={alumnosGrupo}
            excluidos={excluidos}
            onExcluidos={setExcluidos}
            incluidosCount={incluidos.length}
            porTamano={porTamano}
            onPorTamano={setPorTamano}
            numEquipos={numEquipos}
            onNumEquipos={setNumEquipos}
            tamanoEquipo={tamanoEquipo}
            onTamanoEquipo={setTamanoEquipo}
            sobra={sobra}
            onSobra={setSobra}
            tamanios={tamanios}
            modo={modo}
            onModo={setModo}
            equilibrarGenero={equilibrarGenero}
            onEquilibrarGenero={setEquilibrarGenero}
            respetarVinculos={respetarVinculos}
            onRespetarVinculos={setRespetarVinculos}
            hayVinculos={vinculos.length > 0}
            repartirApoyos={repartirApoyos}
            onRepartirApoyos={setRepartirApoyos}
            priorizarNuevos={priorizarNuevos}
            onPriorizarNuevos={setPriorizarNuevos}
            onGenerar={() => void generar()}
            guardadas={guardadas}
            onUsarGuardada={(e) => {
              setEquipos(e.equipos)
              setFijados({})
              setAdvertencia(null)
              setPaso('resultado')
            }}
          />
        ) : (
          <ResultadoPaso
            equipos={equipos}
            porAlumno={porAlumno}
            fijados={fijados}
            seleccionado={seleccionado}
            advertencia={advertencia}
            onTocar={tocarMiembro}
            onFijar={alternarFijado}
            onRenombrar={(i, nombre) =>
              setEquipos((prev) => prev.map((e, j) => (j === i ? { ...e, nombre } : e)))
            }
            onRegenerar={regenerar}
            onVolver={() => setPaso('configurar')}
            onGuardar={() => setGuardando(true)}
            onPizarra={() => setPizarra(true)}
          />
        )}
      </div>

      <HojaGuardar
        abierta={guardando}
        sesionId={sesionId}
        unidades={unidades}
        onCerrar={() => setGuardando(false)}
        onGuardar={guardar}
      />

      {pizarra && (
        <Pizarra
          equipos={equipos.map((e) => ({
            nombre: e.nombre,
            color: e.color,
            miembros: e.miembros.map((id) => {
              const a = porAlumno.get(id)
              return a?.alias || a?.nombre || '—'
            }),
          }))}
          onCerrar={() => setPizarra(false)}
        />
      )}
    </>
  )
}

function ConfiguracionPaso(props: {
  grupoId: string
  totalAlumnos: number
  soloPresentes: boolean
  onSoloPresentes: (v: boolean) => void
  hayPaseDeListaHoy: boolean
  alumnosGrupo: Alumno[]
  excluidos: Set<string>
  onExcluidos: (s: Set<string>) => void
  incluidosCount: number
  porTamano: 'num' | 'tamano'
  onPorTamano: (v: 'num' | 'tamano') => void
  numEquipos: number
  onNumEquipos: (n: number) => void
  tamanoEquipo: number
  onTamanoEquipo: (n: number) => void
  sobra: ComoRepartirSobra
  onSobra: (v: ComoRepartirSobra) => void
  tamanios: number[]
  modo: ModoGeneracion
  onModo: (m: ModoGeneracion) => void
  equilibrarGenero: boolean
  onEquilibrarGenero: (v: boolean) => void
  respetarVinculos: boolean
  onRespetarVinculos: (v: boolean) => void
  hayVinculos: boolean
  repartirApoyos: boolean
  onRepartirApoyos: (v: boolean) => void
  priorizarNuevos: boolean
  onPriorizarNuevos: (v: boolean) => void
  onGenerar: () => void
  guardadas: import('../db/types').Equipo[]
  onUsarGuardada: (e: import('../db/types').Equipo) => void
}) {
  function alternarExclusion(id: string) {
    const s = new Set(props.excluidos)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    props.onExcluidos(s)
  }

  return (
    <>
      <button
        className="btn-suave w-full"
        onClick={() => navegar(`/equipos/${props.grupoId}/datos`)}
      >
        <Sliders size={18} aria-hidden />
        Género y nivel del grupo
      </button>

      <section className="tarjeta space-y-3">
        <div>
          <span className="etiqueta">Alumnado incluido</span>
          {props.hayPaseDeListaHoy ? (
            <button
              className={props.soloPresentes ? 'btn-primario w-full' : 'btn-suave w-full'}
              onClick={() => props.onSoloPresentes(!props.soloPresentes)}
              aria-pressed={props.soloPresentes}
            >
              {props.soloPresentes ? 'Solo presentes hoy' : 'Todo el grupo'}
            </button>
          ) : (
            <p className="text-xs texto-suave">
              Sin pase de lista hoy: se incluye a todo el grupo activo.
            </p>
          )}
        </div>

        <details>
          <summary className="cursor-pointer text-xs font-bold texto-suave">
            Excluir alumnos concretos ({props.excluidos.size})
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.alumnosGrupo.map((a) => (
              <button
                key={a.id}
                onClick={() => alternarExclusion(a.id)}
                aria-pressed={props.excluidos.has(a.id)}
                className={
                  'pildora min-h-[40px] px-3 ' +
                  (props.excluidos.has(a.id)
                    ? 'bg-acento/15 text-acento line-through'
                    : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                }
              >
                {a.alias || a.nombre}
              </button>
            ))}
          </div>
        </details>

        <p className="cifra text-sm font-bold">
          {props.incluidosCount} alumnos incluidos
        </p>
      </section>

      <section className="tarjeta space-y-3">
        <span className="etiqueta">Tamaño de los equipos</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            className={props.porTamano === 'num' ? 'btn-primario' : 'btn-suave'}
            onClick={() => props.onPorTamano('num')}
          >
            Por nº de equipos
          </button>
          <button
            className={props.porTamano === 'tamano' ? 'btn-primario' : 'btn-suave'}
            onClick={() => props.onPorTamano('tamano')}
          >
            Por tamaño
          </button>
        </div>

        {props.porTamano === 'num' ? (
          <input
            type="number"
            className="campo cifra"
            min={1}
            value={props.numEquipos}
            onChange={(e) => props.onNumEquipos(Math.max(1, Number(e.target.value)))}
            aria-label="Número de equipos"
          />
        ) : (
          <input
            type="number"
            className="campo cifra"
            min={1}
            value={props.tamanoEquipo}
            onChange={(e) => props.onTamanoEquipo(Math.max(1, Number(e.target.value)))}
            aria-label="Alumnos por equipo"
          />
        )}

        <div>
          <span className="etiqueta">Con el resto</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={props.sobra === 'repartir' ? 'btn-primario' : 'btn-suave'}
              onClick={() => props.onSobra('repartir')}
            >
              Repartir
            </button>
            <button
              className={props.sobra === 'extra' ? 'btn-primario' : 'btn-suave'}
              onClick={() => props.onSobra('extra')}
            >
              Equipo extra
            </button>
          </div>
        </div>

        <p className="cifra text-sm texto-suave">
          {props.tamanios.length > 0
            ? `${props.tamanios.length} equipos: ${props.tamanios.join(', ')}`
            : 'Sin alumnos suficientes'}
        </p>
      </section>

      <section className="tarjeta space-y-2">
        <span className="etiqueta">Modo</span>
        {MODOS.map((m) => (
          <button
            key={m.valor}
            onClick={() => props.onModo(m.valor)}
            aria-pressed={props.modo === m.valor}
            className={
              'w-full rounded-xl border-2 p-3 text-left transition ' +
              (props.modo === m.valor
                ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
                : 'border-borde dark:border-noche-borde')
            }
          >
            <span className="block font-bold">{m.etiqueta}</span>
            <span className="mt-0.5 block text-xs texto-suave">{m.descripcion}</span>
          </button>
        ))}
      </section>

      <section className="tarjeta space-y-3">
        <span className="etiqueta">Restricciones</span>
        <Checkbox
          etiqueta="Equilibrar género (±1 por equipo)"
          activo={props.equilibrarGenero}
          onCambio={props.onEquilibrarGenero}
        />
        <Checkbox
          etiqueta={`Respetar vínculos${props.hayVinculos ? '' : ' (sin vínculos en este grupo)'}`}
          activo={props.respetarVinculos}
          onCambio={props.onRespetarVinculos}
        />
        <Checkbox
          etiqueta="Repartir alumnado con apoyos entre equipos"
          activo={props.repartirApoyos}
          onCambio={props.onRepartirApoyos}
        />
        <Checkbox
          etiqueta="Priorizar compañeros nuevos"
          activo={props.priorizarNuevos}
          onCambio={props.onPriorizarNuevos}
        />
      </section>

      <button
        className="btn-primario w-full"
        onClick={props.onGenerar}
        disabled={props.incluidosCount === 0 || props.tamanios.length === 0}
      >
        <Shuffle size={20} aria-hidden />
        Generar equipos
      </button>

      {props.guardadas.length > 0 && (
        <section>
          <h2 className="text-lg font-bold">Alineaciones guardadas</h2>
          <div className="linea-pista mb-2 mt-1.5" aria-hidden />
          <ul className="space-y-2">
            {props.guardadas.slice(0, 5).map((e) => (
              <li key={e.id}>
                <button
                  className="tarjeta-pulsable flex w-full items-center justify-between text-left"
                  onClick={() => props.onUsarGuardada(e)}
                >
                  <span>
                    <span className="block font-bold">{e.nombre}</span>
                    <span className="cifra block text-xs texto-suave">
                      {e.fecha} · {e.equipos.length} equipos
                    </span>
                  </span>
                  <span className="text-xs font-bold text-primario dark:text-agua">Usar</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function Checkbox({
  etiqueta,
  activo,
  onCambio,
}: {
  etiqueta: string
  activo: boolean
  onCambio: (v: boolean) => void
}) {
  return (
    <button
      className="flex w-full items-center gap-3 text-left"
      onClick={() => onCambio(!activo)}
      aria-pressed={activo}
    >
      <span
        className={
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ' +
          (activo ? 'border-primario bg-primario text-white' : 'border-borde dark:border-noche-borde')
        }
        aria-hidden
      >
        {activo ? '✓' : ''}
      </span>
      <span className="text-sm">{etiqueta}</span>
    </button>
  )
}

function ResultadoPaso({
  equipos,
  porAlumno,
  fijados,
  seleccionado,
  advertencia,
  onTocar,
  onFijar,
  onRenombrar,
  onRegenerar,
  onVolver,
  onGuardar,
  onPizarra,
}: {
  equipos: EquipoGenerado[]
  porAlumno: Map<string, Alumno>
  fijados: Record<string, number>
  seleccionado: { equipo: number; alumnoId: string } | null
  advertencia: string | null
  onTocar: (equipoIdx: number, alumnoId: string) => void
  onFijar: (alumnoId: string, equipoIdx: number) => void
  onRenombrar: (i: number, nombre: string) => void
  onRegenerar: () => void
  onVolver: () => void
  onGuardar: () => void
  onPizarra: () => void
}) {
  return (
    <>
      {advertencia && (
        <div className="flex items-start gap-2 rounded-xl border border-acento/40 bg-acento/10 p-3 text-sm text-acento">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{advertencia}</span>
        </div>
      )}

      <p className="text-xs texto-suave">
        Toca a un alumno y luego a otro de otro equipo para intercambiarlos. El candado lo fija
        para «Regenerar».
      </p>

      <div className="grid grid-cols-2 gap-3">
        {equipos.map((e, i) => (
          <div key={i} className="tarjeta py-3" style={{ borderTopColor: e.color, borderTopWidth: 4 }}>
            <input
              className="campo mb-2 px-2 py-1 text-sm font-bold"
              value={e.nombre}
              onChange={(ev) => onRenombrar(i, ev.target.value)}
              style={{ color: e.color }}
            />
            <ul className="space-y-1">
              {e.miembros.map((id) => {
                const a = porAlumno.get(id)
                const fijado = id in fijados
                const activo = seleccionado?.alumnoId === id
                return (
                  <li key={id} className="flex items-center gap-1">
                    <button
                      onClick={() => onTocar(i, id)}
                      className={
                        'min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm ' +
                        (activo
                          ? 'bg-primario text-white'
                          : 'bg-agua-claro dark:bg-noche-elevada')
                      }
                    >
                      {a?.alias || a?.nombre || '—'}
                    </button>
                    <button
                      onClick={() => onFijar(id, i)}
                      className={
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' +
                        (fijado ? 'text-primario dark:text-agua' : 'text-tinta-tenue')
                      }
                      aria-label={fijado ? `Desbloquear a ${a?.nombre}` : `Fijar a ${a?.nombre}`}
                      aria-pressed={fijado}
                    >
                      {fijado ? <Lock size={16} aria-hidden /> : <Unlock size={16} aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-suave" onClick={onVolver}>
          Configurar de nuevo
        </button>
        <button className="btn-suave" onClick={onRegenerar}>
          <Shuffle size={18} aria-hidden />
          Regenerar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-suave" onClick={onPizarra}>
          <Grid2x2 size={18} aria-hidden />
          Modo pizarra
        </button>
        <button className="btn-primario" onClick={onGuardar}>
          <Save size={18} aria-hidden />
          Guardar
        </button>
      </div>
    </>
  )
}

function HojaGuardar({
  abierta,
  sesionId,
  unidades,
  onCerrar,
  onGuardar,
}: {
  abierta: boolean
  sesionId?: string
  unidades: import('../db/types').UnidadDidactica[]
  onCerrar: () => void
  onGuardar: (nombre: string, udId?: string, vincularSesion?: boolean) => void
}) {
  const [nombre, setNombre] = useState('')
  const [udId, setUdId] = useState('')
  const [vincularSesion, setVincularSesion] = useState(!!sesionId)

  useEffect(() => {
    if (abierta) {
      setNombre('')
      setUdId('')
      setVincularSesion(!!sesionId)
    }
  }, [abierta, sesionId])

  return (
    <Hoja abierta={abierta} titulo="Guardar equipos" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="eq-nombre">
            Nombre de la alineación
          </label>
          <input
            id="eq-nombre"
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Equipos deporte colectivo"
            autoFocus
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="eq-ud">
            Unidad didáctica (opcional)
          </label>
          <select
            id="eq-ud"
            className="campo"
            value={udId}
            onChange={(e) => setUdId(e.target.value)}
          >
            <option value="">Sin unidad</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.titulo} ({u.nivel}º · T{u.trimestre})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs texto-suave">
            Vincularla a una unidad la mantiene estable toda la unidad (p. ej. Educación
            Deportiva).
          </p>
        </div>

        {sesionId && (
          <Checkbox
            etiqueta="Vincular a la sesión de hoy"
            activo={vincularSesion}
            onCambio={setVincularSesion}
          />
        )}

        <button
          className="btn-primario w-full"
          onClick={() => onGuardar(nombre || 'Equipos sin nombre', udId || undefined, vincularSesion)}
        >
          <Users2 size={18} aria-hidden />
          Guardar
        </button>
      </div>
    </Hoja>
  )
}
