import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronRight, Scale, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import {
  guardarPesosTrimestre,
  repartirAPartesIguales,
  unidadesDe,
  unidadesQueNoComputan,
} from '../db/planificador'
import type { Grupo, Trimestre, UnidadDidactica } from '../db/types'
import { TIPOS_CALIFICABLES } from '../db/types'
import { useUI } from '../store/ui'
import { Hoja } from './Hoja'

/**
 * Reparto de pesos de las unidades dentro de un trimestre (Orden 130/2023,
 * art. 6). Vive aquí, colgando del Cuaderno, porque el Cuaderno ya tiene el
 * contexto que hace falta: qué grupo y qué trimestre.
 *
 * El total no bloquea nada. Un trimestre a medio repartir es un estado normal
 * en octubre; lo que la app debe hacer es que se vea, no impedir cerrar la hoja.
 */
export function HojaPesosTrimestre({
  abierta,
  grupo,
  trimestre,
  onCerrar,
}: {
  abierta: boolean
  grupo: Grupo | null
  trimestre: Trimestre
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const nivel = grupo?.nivel ?? 0

  const unidades = useLiveQuery(
    async () => (grupo ? unidadesDe(nivel, trimestre) : []),
    [nivel, trimestre, grupo?.id],
  )
  const sueltas = useLiveQuery(
    async () => (grupo ? unidadesQueNoComputan(nivel) : []),
    [nivel, grupo?.id],
  )

  /**
   * Qué unidades tienen al menos un instrumento que dé nota. Una unidad sin
   * ninguno no es calificable: no puede aportar nada al trimestre, así que
   * exigirle peso sería pedir que cuadre una cuenta imposible.
   */
  const calificables = useLiveQuery(async () => {
    const columnas = await db.columnas.toArray()
    return new Set(
      columnas
        .filter((c) => c.udId && TIPOS_CALIFICABLES.includes(c.tipo))
        .map((c) => c.udId as string),
    )
  }, [])

  // Borrador local: se escribe al guardar, no en cada tecla, para que el total
  // se pueda ver mal a mitad de reparto sin que la base quede a medias.
  const [borrador, setBorrador] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!abierta || !unidades) return
    setBorrador(Object.fromEntries(unidades.map((u) => [u.id, u.pesoTrimestre])))
  }, [abierta, unidades])

  const computan = unidades ?? []
  const conNota = computan.filter((u) => calificables?.has(u.id))
  const suma = conNota.reduce((n, u) => n + (borrador[u.id] ?? 0), 0)
  const cuadra = suma === 100
  const hayQueRepartir = conNota.length > 0

  async function guardar() {
    const deshacer = await guardarPesosTrimestre(
      computan.map((u) => ({ udId: u.id, pesoTrimestre: borrador[u.id] ?? 0 })),
    )
    onCerrar()
    mostrarAviso(
      cuadra ? 'Pesos guardados' : `Pesos guardados. Suman ${suma} %, no 100 %`,
      deshacer,
    )
  }

  function repartir() {
    const reparto = repartirAPartesIguales(conNota.map((u) => u.id))
    setBorrador((prev) => ({
      ...prev,
      ...Object.fromEntries(reparto.map((r) => [r.udId, r.pesoTrimestre])),
    }))
  }

  return (
    <Hoja
      abierta={abierta}
      titulo={`Pesos del ${trimestre}.º trimestre`}
      onCerrar={onCerrar}
    >
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          Cuánto vale cada unidad dentro del trimestre. Las unidades son del curso, no del grupo:
          este reparto vale para todos los {nivel}º.
        </p>

        {computan.length === 0 ? (
          <div className="panel-agua text-sm">
            No hay unidades de {nivel}º en este trimestre. Créalas en el Planificador y vuelve.
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {computan.map((u) => (
                <FilaPeso
                  key={u.id}
                  unidad={u}
                  peso={borrador[u.id] ?? 0}
                  calificable={!!calificables?.has(u.id)}
                  onCambio={(peso) => setBorrador((prev) => ({ ...prev, [u.id]: peso }))}
                />
              ))}
            </ul>

            <Total suma={suma} cuadra={cuadra} hayQueRepartir={hayQueRepartir} />

            {hayQueRepartir && (
              <button className="btn-suave w-full" onClick={repartir}>
                <Scale size={18} aria-hidden />
                Repartir a partes iguales
              </button>
            )}

            <button className="btn-primario w-full" onClick={() => void guardar()}>
              Guardar pesos
            </button>
          </>
        )}

        <NoComputan unidades={sueltas ?? []} />
      </div>
    </Hoja>
  )
}

function FilaPeso({
  unidad,
  peso,
  calificable,
  onCambio,
}: {
  unidad: UnidadDidactica
  peso: number
  calificable: boolean
  onCambio: (peso: number) => void
}) {
  return (
    <li className="tarjeta flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{unidad.titulo}</p>
        {calificable ? (
          <p className="mt-0.5 text-xs texto-suave">
            {unidad.criterios.length}{' '}
            {unidad.criterios.length === 1 ? 'criterio' : 'criterios'}
          </p>
        ) : (
          <p className="mt-0.5 text-xs font-semibold text-aviso-oscuro">
            No calificable: sin instrumentos que den nota
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          className="campo cifra w-20 text-center"
          value={peso}
          disabled={!calificable}
          onChange={(e) => onCambio(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          aria-label={`Peso de ${unidad.titulo} en porcentaje del trimestre`}
        />
        <span className="text-sm texto-suave">%</span>
      </div>
    </li>
  )
}

/** El total, en verde si cuadra y en ámbar si no. Informa; no impide guardar. */
function Total({
  suma,
  cuadra,
  hayQueRepartir,
}: {
  suma: number
  cuadra: boolean
  hayQueRepartir: boolean
}) {
  if (!hayQueRepartir)
    return (
      <div className="panel-agua text-sm">
        Ninguna unidad de este trimestre tiene todavía un instrumento que dé nota, así que no hay
        nada que repartir.
      </div>
    )

  return (
    <div
      aria-live="polite"
      className={
        'flex items-center gap-2 rounded-xl2 border-2 p-3 text-sm font-semibold ' +
        (cuadra
          ? 'border-lima bg-lima/10 text-lima-oscuro'
          : 'border-aviso bg-aviso/10 text-aviso-oscuro')
      }
    >
      {!cuadra && <TriangleAlert size={18} className="shrink-0" aria-hidden />}
      <span className="cifra flex-1">Total: {suma} %</span>
      {!cuadra && <span className="font-normal">Debería sumar 100 %</span>}
    </div>
  )
}

/** Las unidades que no computan: no entran en la nota, pero sí en la cobertura. */
function NoComputan({ unidades }: { unidades: UnidadDidactica[] }) {
  const [abierto, setAbierto] = useState(false)
  if (unidades.length === 0) return null

  return (
    <div>
      <button
        className="btn-fantasma w-full justify-start px-0 text-sm"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        {abierto ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
        {unidades.length} {unidades.length === 1 ? 'unidad que no computa' : 'unidades que no computan'}
      </button>
      {abierto && (
        <>
          <ul className="mt-2 space-y-1">
            {unidades.map((u) => (
              <li key={u.id} className="tarjeta py-2 text-sm">
                <span className="font-semibold">{u.titulo}</span>
                <span className="cifra ml-2 texto-suave">
                  {u.trimestre === null ? 'sin trimestre' : `T${u.trimestre}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs texto-suave">
            No entran en la nota, pero sí cuentan en el informe de cobertura: se enseñaron.
          </p>
        </>
      )}
    </div>
  )
}
