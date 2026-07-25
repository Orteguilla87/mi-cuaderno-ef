import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, Copy, Plus, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  crearColumna,
  crearRubrica,
  eliminarColumna,
  moverColumna,
  TIPOS_APLICABLES_GRUPO,
  tiposDisponibles,
} from '../db/cuaderno'
import { db } from '../db/db'
import type { ComponenteCalculo, Columna, Grupo, TipoColumna, Trimestre } from '../db/types'
import { aISO } from '../lib/fechas'
import { usePortapapelesColumnas } from '../store/portapapelesColumnas'
import { useUI } from '../store/ui'
import { Hoja } from './Hoja'
import { HojaConfirmar } from './HojaConfirmar'
import { HojaEditarRubrica } from '../pages/Rubricas'

/**
 * Alta y configuración de una columna. `estado` es la columna a editar, la
 * cadena 'nueva' para crear, o null si la hoja está cerrada.
 */
export function HojaColumna({
  estado,
  grupo,
  trimestre,
  onCerrar,
  onAplicarGrupo,
}: {
  estado: Columna | 'nueva' | null
  grupo: Grupo | null
  trimestre: Trimestre
  onCerrar: () => void
  /** Abre «aplicar a todo el grupo» para una columna ya existente. */
  onAplicarGrupo?: (c: Columna) => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const copiarColumnas = usePortapapelesColumnas((s) => s.copiar)
  const esNueva = estado === 'nueva'
  const columna = esNueva ? null : estado

  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoColumna>('numero')
  const [udId, setUdId] = useState('')
  const [rubricaId, setRubricaId] = useState('')
  const [caritas, setCaritas] = useState<3 | 5>(3)
  const [max, setMax] = useState(10)
  const [componentes, setComponentes] = useState<ComponenteCalculo[]>([])
  const [editandoRubrica, setEditandoRubrica] = useState<string | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)

  const unidades = useLiveQuery(() => db.unidades.toArray(), [])
  const rubricas = useLiveQuery(() => db.rubricas.toArray(), [])
  // Columnas del mismo grupo y trimestre, candidatas a entrar en un cálculo
  // (todas menos ella misma y menos otras de cálculo que la referencien).
  const hermanas = useLiveQuery(
    async () =>
      grupo
        ? (await db.columnas.where('[grupoId+trimestre]').equals([grupo.id, trimestre]).toArray()).sort(
            (a, b) => a.orden - b.orden,
          )
        : [],
    [grupo?.id, trimestre],
  )

  const tipos = grupo ? tiposDisponibles(grupo.etapa) : []

  useEffect(() => {
    if (!estado) return
    if (columna) {
      setTitulo(columna.titulo)
      setTipo(columna.tipo)
      setUdId(columna.udId ?? '')
      setRubricaId(columna.rubricaId ?? '')
      setCaritas(columna.caritas ?? 3)
      setMax(columna.escala?.max ?? 10)
      setComponentes(columna.calculo?.componentes ?? [])
    } else {
      setTitulo('')
      // Infantil no ofrece números, así que el tipo por defecto no puede serlo.
      setTipo(tipos[0]?.tipo ?? 'caritas')
      setUdId('')
      setRubricaId('')
      setCaritas(3)
      setMax(10)
      setComponentes([])
    }
  }, [estado])

  if (!estado || !grupo) return null

  // Un cálculo sin componentes no promedia nada: se exige al menos uno.
  const guardable = !((tipo === 'rubrica' && !rubricaId) || (tipo === 'calculo' && componentes.length === 0))

  async function guardar() {
    if (!guardable) return

    if (esNueva) {
      // Título por defecto «Cálculo N» sobre las columnas de cálculo ya creadas.
      const nCalculos = (hermanas ?? []).filter((c) => c.tipo === 'calculo').length
      const tituloPorDefecto =
        tipo === 'calculo' ? `Cálculo ${nCalculos + 1}` : tipos.find((t) => t.tipo === tipo)?.etiqueta || 'Columna'
      await crearColumna({
        grupoId: grupo!.id,
        trimestre,
        titulo: titulo || tituloPorDefecto,
        tipo,
        udId: udId || undefined,
        rubricaId: rubricaId || undefined,
        caritas,
        escala: { min: 0, max, decimales: 1 },
        calculo: tipo === 'calculo' ? { componentes } : undefined,
        fecha: aISO(),
      })
    } else if (columna) {
      await db.columnas.update(columna.id, {
        titulo,
        udId: udId || undefined,
        rubricaId: rubricaId || undefined,
        caritas,
        escala: columna.tipo === 'numero' ? { min: 0, max, decimales: 1 } : undefined,
        // El cálculo es el único tipo cuyos parámetros se editan tras crearlo.
        calculo: columna.tipo === 'calculo' ? { componentes } : undefined,
      })
    }
    onCerrar()
  }

  async function borrar() {
    if (!columna) return
    const deshacer = await eliminarColumna(columna.id)
    onCerrar()
    mostrarAviso(`Columna «${columna.titulo}» eliminada`, deshacer)
  }

  function copiarEstaColumna() {
    if (!columna || !grupo) return
    copiarColumnas({
      columnas: [columna],
      etapaOrigen: grupo.etapa,
      origenResumen: `«${columna.titulo}» de ${grupo.nombre}`,
    })
    mostrarAviso(`Columna «${columna.titulo}» copiada`)
  }

  async function nuevaRubrica() {
    const id = await crearRubrica(titulo || 'Rúbrica nueva', grupo!.etapa)
    setRubricaId(id)
    setEditandoRubrica(id)
  }

  return (
    <>
      <Hoja
        abierta={!!estado}
        titulo={esNueva ? 'Nueva columna' : 'Configurar columna'}
        onCerrar={onCerrar}
      >
        <div className="space-y-4">
          <div>
            <label className="etiqueta" htmlFor="col-titulo">
              Título
            </label>
            <input
              id="col-titulo"
              className="campo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Voltereta adelante"
              autoFocus
            />
          </div>

          {esNueva ? (
            <div>
              <span className="etiqueta">Tipo de instrumento</span>
              <div className="space-y-2">
                {tipos.map((t) => (
                  <button
                    key={t.tipo}
                    onClick={() => setTipo(t.tipo)}
                    aria-pressed={tipo === t.tipo}
                    className={
                      'w-full rounded-xl border-2 p-3 text-left transition ' +
                      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                      (tipo === t.tipo
                        ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
                        : 'border-borde dark:border-noche-borde')
                    }
                  >
                    <span className="block font-bold">{t.etiqueta}</span>
                    <span className="mt-0.5 block text-xs texto-suave">{t.descripcion}</span>
                  </button>
                ))}
              </div>
              {grupo.etapa === 'infantil' && (
                <p className="mt-2 text-xs texto-suave">
                  En Infantil no se ofrecen tipos numéricos: la evaluación es cualitativa.
                </p>
              )}
            </div>
          ) : (
            <div className="panel-agua text-sm">
              Tipo: <strong>{tipos.find((t) => t.tipo === tipo)?.etiqueta ?? tipo}</strong>. El
              tipo no se cambia una vez creada, para no dejar valores huérfanos.
            </div>
          )}

          {tipo === 'numero' && (
            <div>
              <label className="etiqueta" htmlFor="col-max">
                Nota máxima
              </label>
              <input
                id="col-max"
                type="number"
                className="campo cifra"
                value={max}
                min={1}
                onChange={(e) => setMax(Number(e.target.value))}
              />
            </div>
          )}

          {tipo === 'caritas' && (
            <div>
              <span className="etiqueta">Número de caritas</span>
              <div className="grid grid-cols-2 gap-2">
                {([3, 5] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setCaritas(n)}
                    className={caritas === n ? 'btn-primario' : 'btn-suave'}
                  >
                    {n} niveles
                  </button>
                ))}
              </div>
            </div>
          )}

          {tipo === 'rubrica' && (
            <div>
              <label className="etiqueta" htmlFor="col-rubrica">
                Rúbrica
              </label>
              <select
                id="col-rubrica"
                className="campo"
                value={rubricaId}
                onChange={(e) => setRubricaId(e.target.value)}
              >
                <option value="">Elige una rúbrica</option>
                {rubricas?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.titulo} ({r.criterios.length} criterios)
                  </option>
                ))}
              </select>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn-suave" onClick={() => void nuevaRubrica()}>
                  <Plus size={18} aria-hidden />
                  Crear
                </button>
                <button
                  className="btn-suave"
                  onClick={() => setEditandoRubrica(rubricaId)}
                  disabled={!rubricaId}
                >
                  Editar
                </button>
              </div>
            </div>
          )}

          {tipo === 'calculo' && (
            <EditorCalculo
              componentes={componentes}
              onCambio={setComponentes}
              // Ella misma nunca es componente de sí misma; las de cálculo sí
              // pueden encadenarse (el motor detecta ciclos).
              candidatas={(hermanas ?? []).filter((c) => c.id !== columna?.id)}
            />
          )}

          <div>
            <label className="etiqueta" htmlFor="col-ud">
              Unidad didáctica
            </label>
            <select
              id="col-ud"
              className="campo"
              value={udId}
              onChange={(e) => setUdId(e.target.value)}
            >
              <option value="">Sin unidad</option>
              {unidades?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.titulo} ({u.nivel}º · T{u.trimestre})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs texto-suave">
              Ligarla a una unidad permite después calcular la media de esa unidad.
            </p>
          </div>

          {columna && (
            <div>
              <span className="etiqueta">Posición</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-suave"
                  onClick={() => void moverColumna(columna.id, -1)}
                >
                  <ChevronLeft size={18} aria-hidden />
                  Mover antes
                </button>
                <button className="btn-suave" onClick={() => void moverColumna(columna.id, 1)}>
                  Mover después
                  <ChevronRight size={18} aria-hidden />
                </button>
              </div>
            </div>
          )}

          <button
            className="btn-primario w-full"
            onClick={() => void guardar()}
            disabled={!guardable}
          >
            {esNueva ? 'Crear columna' : 'Guardar cambios'}
          </button>

          {columna && onAplicarGrupo && TIPOS_APLICABLES_GRUPO.includes(columna.tipo) && (
            <button className="btn-suave w-full" onClick={() => onAplicarGrupo(columna)}>
              <Users size={18} aria-hidden />
              Aplicar a todo el grupo
            </button>
          )}

          {columna && (
            <button className="btn-suave w-full" onClick={copiarEstaColumna}>
              <Copy size={18} aria-hidden />
              Copiar esta columna
            </button>
          )}

          {columna && (
            <button className="btn-peligro w-full" onClick={() => setConfirmandoBorrado(true)}>
              <Trash2 size={18} aria-hidden />
              Eliminar columna
            </button>
          )}
        </div>
      </Hoja>

      {columna && (
        <HojaConfirmar
          abierta={confirmandoBorrado}
          titulo="Eliminar columna"
          descripcion={`¿Eliminar la columna «${columna.titulo}» y todas sus notas?`}
          textoConfirmar="Eliminar columna"
          onConfirmar={borrar}
          onCerrar={() => setConfirmandoBorrado(false)}
        />
      )}

      <HojaEditarRubrica
        rubricaId={editandoRubrica}
        onCerrar={() => setEditandoRubrica(null)}
      />
    </>
  )
}

/**
 * Selector de columnas y pesos de una columna de cálculo. Cada columna elegida
 * entra en la media ponderada; los pesos se normalizan al calcular (no tienen
 * por qué sumar 100), así que aquí solo se avisa de la suma, no se bloquea.
 */
function EditorCalculo({
  componentes,
  candidatas,
  onCambio,
}: {
  componentes: ComponenteCalculo[]
  candidatas: Columna[]
  onCambio: (comps: ComponenteCalculo[]) => void
}) {
  // Solo se promedian columnas con valor sobre 10; texto y positivos/negativos
  // no entran (el motor los descarta), así que no se ofrecen como componentes.
  const PROMEDIABLES: TipoColumna[] = ['numero', 'caritas', 'si_no', 'rubrica', 'calculo']
  const elegibles = candidatas.filter((c) => PROMEDIABLES.includes(c.tipo))

  const pesoDe = (id: string) => componentes.find((c) => c.columnaId === id)?.pesoPct
  const marcada = (id: string) => pesoDe(id) !== undefined
  const suma = componentes.reduce((n, c) => n + (c.pesoPct || 0), 0)

  function alternar(id: string) {
    if (marcada(id)) onCambio(componentes.filter((c) => c.columnaId !== id))
    // Peso por defecto: reparto a partes iguales sobre las que habrá.
    else onCambio([...componentes, { columnaId: id, pesoPct: Math.round(100 / (componentes.length + 1)) }])
  }

  function cambiarPeso(id: string, pesoPct: number) {
    onCambio(componentes.map((c) => (c.columnaId === id ? { ...c, pesoPct } : c)))
  }

  return (
    <div>
      <span className="etiqueta">Columnas del cálculo</span>
      {elegibles.length === 0 ? (
        <p className="text-sm texto-suave">
          No hay otras columnas promediables en este trimestre todavía. Crea antes las columnas de
          nota, caritas, lista de control o rúbrica.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {elegibles.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <button
                  onClick={() => alternar(c.id)}
                  aria-pressed={marcada(c.id)}
                  className={
                    'flex min-h-tap flex-1 items-center gap-2 rounded-xl border-2 px-3 text-left transition ' +
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                    (marcada(c.id)
                      ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
                      : 'border-borde dark:border-noche-borde')
                  }
                >
                  <span
                    className={
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-lg ' +
                      (marcada(c.id) ? 'bg-primario text-white' : 'border-2 border-borde dark:border-noche-borde')
                    }
                  >
                    {marcada(c.id) && <Check size={14} strokeWidth={3} aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.titulo}</span>
                </button>
                {marcada(c.id) && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      className="campo cifra w-20 text-center"
                      value={pesoDe(c.id)}
                      onChange={(e) => cambiarPeso(c.id, Number(e.target.value))}
                      aria-label={`Peso de ${c.titulo} en porcentaje`}
                    />
                    <span className="text-sm texto-suave">%</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs texto-suave">
            {componentes.length === 0
              ? 'Elige al menos una columna.'
              : `Los pesos suman ${suma}%. No tienen por qué sumar 100: se reparten proporcionalmente. Si a un alumno le falta alguna nota, esa columna se excluye y el resto se reajusta.`}
          </p>
        </>
      )}
    </div>
  )
}
