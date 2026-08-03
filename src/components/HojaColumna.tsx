import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, Copy, Plus, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cicloDeCurso, criteriosDeGrupo } from '../db/criterios'
import { ordinalCiclo } from '../lib/ciclos'
import {
  crearColumna,
  crearRubrica,
  eliminarColumna,
  moverColumna,
  TIPOS_APLICABLES_GRUPO,
  tiposDisponibles,
} from '../db/cuaderno'
import { db } from '../db/db'
import {
  asignarCriterio,
  fijarDescriptorFila,
  fijarPesoFila,
  filasDe,
  sincronizarFilasConRubrica,
} from '../db/filas'
import type {
  ComponenteCalculo,
  Columna,
  Criterio,
  FilaInstrumento,
  Grupo,
  Rubrica,
  TipoColumna,
  Trimestre,
} from '../db/types'
import { TIPOS_CALIFICABLES } from '../db/types'
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
  const [pesoUd, setPesoUd] = useState(0)
  const [rubricaId, setRubricaId] = useState('')
  const [caritas, setCaritas] = useState<3 | 5>(3)
  const [max, setMax] = useState(10)
  const [componentes, setComponentes] = useState<ComponenteCalculo[]>([])
  const [editandoRubrica, setEditandoRubrica] = useState<string | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  // Criterio elegido ANTES de que exista la fila: solo tiene sentido en una
  // columna nueva de tipo simple, que nace con una única fila (§ Bloque 1).
  const [criterioNueva, setCriterioNueva] = useState<string | null>(null)

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
      setPesoUd(columna.pesoUd)
      setRubricaId(columna.rubricaId ?? '')
      setCaritas(columna.caritas ?? 3)
      setMax(columna.escala?.max ?? 10)
      setComponentes(columna.calculo?.componentes ?? [])
    } else {
      setTitulo('')
      // Infantil no ofrece números, así que el tipo por defecto no puede serlo.
      setTipo(tipos[0]?.tipo ?? 'caritas')
      setUdId('')
      setPesoUd(0)
      setRubricaId('')
      setCaritas(3)
      setMax(10)
      setComponentes([])
      setCriterioNueva(null)
    }
  }, [estado])

  // Se reinicia al cambiar de unidad: el criterio suelto de otra unidad no
  // tendría sentido de golpe en la nueva.
  useEffect(() => setCriterioNueva(null), [udId])

  const delCiclo = useLiveQuery(
    async () => (grupo && grupo.etapa === 'primaria' ? criteriosDeGrupo('primaria', grupo.nivel) : []),
    [grupo?.etapa, grupo?.nivel],
  )

  if (!estado || !grupo) return null

  const esCalificable = TIPOS_CALIFICABLES.includes(tipo)
  // Solo las unidades del curso del grupo: ofrecer las de 5º al configurar una
  // columna de 3ºA sería ofrecer criterios de otro ciclo.
  //
  // La que ya tenga puesta se cuela igual aunque sea de otro curso. Si no, el
  // desplegable enseñaría «Sin unidad» y guardar la borraría sin que nadie
  // hubiera pedido tal cosa.
  const unidadesDelCurso = (unidades ?? []).filter(
    (u) => u.nivel === grupo.nivel || u.id === udId,
  )
  const deLaUnidadNueva = (unidadesDelCurso.find((u) => u.id === udId)?.criterios ?? [])
    .map((id) => (delCiclo ?? []).find((c) => c.id === id))
    .filter((c): c is Criterio => !!c)

  // Un cálculo sin componentes no promedia nada: se exige al menos uno.
  const guardable = !((tipo === 'rubrica' && !rubricaId) || (tipo === 'calculo' && componentes.length === 0))

  async function guardar() {
    if (!guardable) return

    if (esNueva) {
      // Título por defecto «Cálculo N» sobre las columnas de cálculo ya creadas.
      const nCalculos = (hermanas ?? []).filter((c) => c.tipo === 'calculo').length
      const tituloPorDefecto =
        tipo === 'calculo' ? `Cálculo ${nCalculos + 1}` : tipos.find((t) => t.tipo === tipo)?.etiqueta || 'Columna'
      const idNueva = await crearColumna({
        grupoId: grupo!.id,
        trimestre,
        titulo: titulo || tituloPorDefecto,
        tipo,
        udId: udId || undefined,
        pesoUd: udId ? pesoUd : 0,
        rubricaId: rubricaId || undefined,
        caritas,
        escala: { min: 0, max, decimales: 1 },
        calculo: tipo === 'calculo' ? { componentes } : undefined,
        fecha: aISO(),
      })
      // Instrumento simple: nace con una sola fila. Si se eligió criterio antes
      // de crear, se asigna ya —misma propagación a la unidad que en cualquier
      // otro momento, con su aviso y su Deshacer.
      if (criterioNueva && tipo !== 'rubrica' && tipo !== 'calculo') {
        const [filaInicial] = await filasDe(idNueva)
        if (filaInicial) {
          const { anadidoALaUnidad, deshacer } = await asignarCriterio(filaInicial.id, criterioNueva)
          if (anadidoALaUnidad) {
            const codigo = (delCiclo ?? []).find((c) => c.id === criterioNueva)?.codigo ?? criterioNueva
            mostrarAviso(`Criterio ${codigo} añadido también a la unidad «${anadidoALaUnidad}»`, deshacer)
          }
        }
      }
    } else if (columna) {
      await db.columnas.update(columna.id, {
        titulo,
        udId: udId || undefined,
        // Un peso sin unidad no significa nada: se limpia en vez de quedarse
        // guardado esperando a que alguien vuelva a asignar una unidad.
        pesoUd: udId ? pesoUd : 0,
        rubricaId: rubricaId || undefined,
        caritas,
        escala: columna.tipo === 'numero' ? { min: 0, max, decimales: 1 } : undefined,
        // El cálculo es el único tipo cuyos parámetros se editan tras crearlo.
        calculo: columna.tipo === 'calculo' ? { componentes } : undefined,
      })
      // La rúbrica ligada puede haber cambiado: las filas la siguen, sin perder
      // los criterios ni los pesos ya asignados a las que sobreviven.
      if (columna.tipo === 'rubrica') await sincronizarFilasConRubrica(columna.id)
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
              {unidadesDelCurso.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.titulo} ({u.nivel}º ·{' '}
                  {u.trimestre === null ? 'sin trimestre' : `T${u.trimestre}`})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs texto-suave">
              {udId
                ? 'La nota de esta columna entra en la de su unidad, con el peso de abajo.'
                : 'Sin unidad la columna existe y se evalúa, pero no entra en ninguna nota.'}
            </p>
          </div>

          {esCalificable && udId && (
            <div>
              <label className="etiqueta" htmlFor="col-peso-ud">
                Peso dentro de la unidad
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="col-peso-ud"
                  type="number"
                  min={0}
                  max={100}
                  className="campo cifra w-24 text-center"
                  value={pesoUd}
                  onChange={(e) => setPesoUd(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                />
                <span className="text-sm texto-suave">%</span>
              </div>
              <SumaDeLaUnidad
                udId={udId}
                columnaId={columna?.id ?? null}
                pesoEnEdicion={pesoUd}
                cuenta={esCalificable}
              />
            </div>
          )}

          {!esNueva && columna ? (
            <EditorFilas
              columna={columna}
              grupo={grupo}
              udId={udId}
              rubrica={rubricas?.find((r) => r.id === rubricaId)}
            />
          ) : grupo.etapa === 'primaria' && tipo !== 'rubrica' && tipo !== 'calculo' ? (
            <div>
              <span className="etiqueta">Qué se evalúa</span>
              <SelectorCriterioUnico
                criterioId={criterioNueva}
                deLaUnidad={deLaUnidadNueva}
                delCiclo={delCiclo ?? []}
                onElegir={setCriterioNueva}
              />
              <p className="mt-2 text-xs texto-suave">
                El criterio no cambia la nota: sirve para saber qué se ha evaluado y qué queda
                por evaluar.
              </p>
            </div>
          ) : (
            grupo.etapa === 'primaria' && (
              <p className="text-xs texto-suave">
                Los criterios de la rúbrica se asignan al volver a abrir esta columna, cuando ya
                existe una fila por cada nivel.
              </p>
            )
          )}

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
 * Cuánto suman los pesos de los instrumentos calificables de la unidad, con el
 * que se está editando ya contado. Debe dar 100; si no da, se dice y ya está.
 * Repartir mal un trimestre es un estado de paso, no un error que impedir.
 */
function SumaDeLaUnidad({
  udId,
  columnaId,
  pesoEnEdicion,
  cuenta,
}: {
  udId: string
  columnaId: string | null
  pesoEnEdicion: number
  cuenta: boolean
}) {
  const hermanas = useLiveQuery(
    async () => (await db.columnas.where('udId').equals(udId).toArray()).filter((c) => c.id !== columnaId),
    [udId, columnaId],
  )
  if (!hermanas) return null

  const suma =
    hermanas.filter((c) => TIPOS_CALIFICABLES.includes(c.tipo)).reduce((n, c) => n + c.pesoUd, 0) +
    (cuenta ? pesoEnEdicion : 0)
  const cuadra = suma === 100

  return (
    <p className={'mt-1 text-xs ' + (cuadra ? 'font-semibold text-lima-oscuro' : 'text-aviso-oscuro')}>
      Los instrumentos de esta unidad suman {suma} %{cuadra ? '.' : ', y deberían sumar 100 %.'}
    </p>
  )
}

/**
 * Filas del instrumento: lo que de verdad se evalúa y lo único que se ata a un
 * criterio del Decreto 61/2022.
 *
 * En una rúbrica hay una fila por criterio de la rúbrica y lo normal es que
 * cada una apunte a un criterio oficial distinto. Los criterios de la unidad se
 * ofrecen primero, de un toque; el resto del ciclo queda debajo, a un
 * desplegable, porque elegir fuera de la unidad es la excepción y no debería
 * costar lo mismo que lo habitual.
 */
function EditorFilas({
  columna,
  grupo,
  udId,
  rubrica,
}: {
  columna: Columna
  grupo: Grupo
  udId: string
  rubrica: Rubrica | undefined
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const filas = useLiveQuery(() => filasDe(columna.id), [columna.id, rubrica?.id])
  const unidad = useLiveQuery(async () => (udId ? db.unidades.get(udId) : undefined), [udId])
  const delCiclo = useLiveQuery(
    async () => (grupo.etapa === 'primaria' ? criteriosDeGrupo('primaria', grupo.nivel) : []),
    [grupo.etapa, grupo.nivel],
  )

  if (grupo.etapa !== 'primaria' || !filas || !delCiclo) return null

  const porId = new Map(delCiclo.map((c) => [c.id, c]))
  const deLaUnidad = (unidad?.criterios ?? [])
    .map((id) => porId.get(id))
    .filter((c): c is Criterio => !!c)

  // La unidad y el criterio tienen que ser del mismo ciclo. Con el selector
  // filtrado por el ciclo del grupo esto solo puede pasar si la unidad es de
  // otro curso; entonces no hay nada que elegir y se dice por qué.
  const cicloUnidad = unidad ? cicloDeCurso(unidad.nivel) : null
  const cicloGrupo = cicloDeCurso(grupo.nivel)
  const chocanLosCiclos = cicloUnidad !== null && cicloUnidad !== cicloGrupo

  async function elegir(filaId: string, criterioId: string | null) {
    const { anadidoALaUnidad, deshacer } = await asignarCriterio(filaId, criterioId)
    if (anadidoALaUnidad && criterioId) {
      const codigo = porId.get(criterioId)?.codigo ?? criterioId
      mostrarAviso(`Criterio ${codigo} añadido también a la unidad «${anadidoALaUnidad}»`, deshacer)
    }
  }

  return (
    <div>
      <span className="etiqueta">
        {rubrica ? 'Criterios de la rúbrica' : 'Qué se evalúa'}
      </span>

      {chocanLosCiclos ? (
        <div className="panel-agua text-sm">
          «{unidad!.titulo}» es de {unidad!.nivel}º ({ordinalCiclo(cicloUnidad!)} ciclo) y este
          grupo es de {grupo.nivel}º ({ordinalCiclo(cicloGrupo)} ciclo). Sus criterios no son los
          mismos, así que no se pueden asignar. Elige una unidad de {grupo.nivel}º o duplica esta
          al curso.
        </div>
      ) : (
        <ul className="space-y-2">
          {filas.map((fila) => (
            <FilaEditable
              key={fila.id}
              fila={fila}
              editableElDescriptor={!rubrica}
              variasFilas={filas.length > 1}
              deLaUnidad={deLaUnidad}
              delCiclo={delCiclo}
              onElegir={(criterioId) => void elegir(fila.id, criterioId)}
            />
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs texto-suave">
        {rubrica
          ? 'Cada criterio de la rúbrica puede evaluar un criterio del decreto distinto: es lo normal. Los descriptores se editan en la rúbrica.'
          : 'El criterio no cambia la nota: sirve para saber qué se ha evaluado y qué queda por evaluar.'}
      </p>
    </div>
  )
}

/**
 * Chips de los criterios de la unidad (de un toque) + desplegable con el resto
 * del ciclo. Único sitio donde vive este patrón: lo usan tanto la fila de un
 * instrumento existente como el selector de la columna al crearla.
 */
function SelectorCriterioUnico({
  criterioId,
  deLaUnidad,
  delCiclo,
  onElegir,
}: {
  criterioId: string | null
  deLaUnidad: Criterio[]
  delCiclo: Criterio[]
  onElegir: (criterioId: string | null) => void
}) {
  const resto = delCiclo.filter((c) => !deLaUnidad.some((u) => u.id === c.id))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {deLaUnidad.map((c) => (
          <button
            key={c.id}
            title={c.texto}
            aria-pressed={criterioId === c.id}
            onClick={() => onElegir(criterioId === c.id ? null : c.id)}
            className={
              'pildora min-h-[36px] px-2.5 text-xs font-bold ' +
              (criterioId === c.id
                ? 'bg-primario text-white'
                : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
            }
          >
            {c.codigo}
          </button>
        ))}
        {deLaUnidad.length === 0 && (
          <span className="text-xs texto-suave">
            La unidad aún no declara criterios. Elige uno abajo y se le añade.
          </span>
        )}
      </div>

      <select
        className="campo text-sm"
        value={criterioId ?? ''}
        onChange={(e) => onElegir(e.target.value || null)}
        aria-label="Criterio del decreto"
      >
        <option value="">Sin criterio</option>
        {deLaUnidad.length > 0 && (
          <optgroup label="De esta unidad">
            {deLaUnidad.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.texto.slice(0, 70)}…
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Resto del ciclo (se añadirá a la unidad)">
          {resto.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.texto.slice(0, 70)}…
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  )
}

function FilaEditable({
  fila,
  editableElDescriptor,
  variasFilas,
  deLaUnidad,
  delCiclo,
  onElegir,
}: {
  fila: FilaInstrumento
  editableElDescriptor: boolean
  variasFilas: boolean
  deLaUnidad: Criterio[]
  delCiclo: Criterio[]
  onElegir: (criterioId: string | null) => void
}) {
  const [descriptor, setDescriptor] = useState(fila.descriptor)
  useEffect(() => setDescriptor(fila.descriptor), [fila.descriptor])

  return (
    <li className="tarjeta space-y-2 py-3">
      {editableElDescriptor ? (
        <input
          className="campo"
          value={descriptor}
          onChange={(e) => setDescriptor(e.target.value)}
          onBlur={() => void fijarDescriptorFila(fila.id, descriptor)}
          aria-label="Qué se evalúa en esta fila"
        />
      ) : (
        <p className="font-semibold">{fila.descriptor}</p>
      )}

      <SelectorCriterioUnico
        criterioId={fila.criterioId}
        deLaUnidad={deLaUnidad}
        delCiclo={delCiclo}
        onElegir={onElegir}
      />

      {variasFilas && (
        <div className="flex items-center gap-2">
          <label className="text-xs texto-suave" htmlFor={`peso-${fila.id}`}>
            Peso
          </label>
          <input
            id={`peso-${fila.id}`}
            type="number"
            min={0}
            className="campo cifra w-20 py-1 text-center text-sm"
            placeholder="auto"
            value={fila.pesoFila ?? ''}
            onChange={(e) =>
              void fijarPesoFila(fila.id, e.target.value === '' ? null : Number(e.target.value))
            }
          />
          <span className="text-xs texto-suave">
            {fila.pesoFila === null ? 'a partes iguales con las demás' : '%'}
          </span>
        </div>
      )}
    </li>
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
