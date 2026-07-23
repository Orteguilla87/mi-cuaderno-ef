import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { crearColumna, crearRubrica, eliminarColumna, moverColumna, tiposDisponibles } from '../db/cuaderno'
import { db } from '../db/db'
import type { Columna, Grupo, TipoColumna, Trimestre } from '../db/types'
import { aISO } from '../lib/fechas'
import { useUI } from '../store/ui'
import { Hoja } from './Hoja'
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
}: {
  estado: Columna | 'nueva' | null
  grupo: Grupo | null
  trimestre: Trimestre
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const esNueva = estado === 'nueva'
  const columna = esNueva ? null : estado

  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoColumna>('numero')
  const [udId, setUdId] = useState('')
  const [rubricaId, setRubricaId] = useState('')
  const [caritas, setCaritas] = useState<3 | 5>(3)
  const [max, setMax] = useState(10)
  const [editandoRubrica, setEditandoRubrica] = useState<string | null>(null)

  const unidades = useLiveQuery(() => db.unidades.toArray(), [])
  const rubricas = useLiveQuery(() => db.rubricas.toArray(), [])

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
    } else {
      setTitulo('')
      // Infantil no ofrece números, así que el tipo por defecto no puede serlo.
      setTipo(tipos[0]?.tipo ?? 'caritas')
      setUdId('')
      setRubricaId('')
      setCaritas(3)
      setMax(10)
    }
  }, [estado])

  if (!estado || !grupo) return null

  async function guardar() {
    if (tipo === 'rubrica' && !rubricaId) return

    if (esNueva) {
      await crearColumna({
        grupoId: grupo!.id,
        trimestre,
        titulo: titulo || tipos.find((t) => t.tipo === tipo)?.etiqueta || 'Columna',
        tipo,
        udId: udId || undefined,
        rubricaId: rubricaId || undefined,
        caritas,
        escala: { min: 0, max, decimales: 1 },
        fecha: aISO(),
      })
    } else if (columna) {
      await db.columnas.update(columna.id, {
        titulo,
        udId: udId || undefined,
        rubricaId: rubricaId || undefined,
        caritas,
        escala: columna.tipo === 'numero' ? { min: 0, max, decimales: 1 } : undefined,
      })
    }
    onCerrar()
  }

  async function borrar() {
    if (!columna) return
    if (!window.confirm(`¿Eliminar la columna «${columna.titulo}» y todas sus notas?`)) return
    const deshacer = await eliminarColumna(columna.id)
    onCerrar()
    mostrarAviso(`Columna «${columna.titulo}» eliminada`, deshacer)
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
            disabled={tipo === 'rubrica' && !rubricaId}
          >
            {esNueva ? 'Crear columna' : 'Guardar cambios'}
          </button>

          {columna && (
            <button className="btn w-full text-acento" onClick={() => void borrar()}>
              <Trash2 size={18} aria-hidden />
              Eliminar columna
            </button>
          )}
        </div>
      </Hoja>

      <HojaEditarRubrica
        rubricaId={editandoRubrica}
        onCerrar={() => setEditandoRubrica(null)}
      />
    </>
  )
}
