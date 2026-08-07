import { useLiveQuery } from 'dexie-react-hooks'
import { Lock, Merge, Plus, Tags, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Campo } from '../components/Campo'
import { EstadoVacio } from '../components/EstadoVacio'
import { Hoja } from '../components/Hoja'
import { db } from '../db/db'
import {
  borrarEtiqueta,
  contarPorEtiqueta,
  crearEtiqueta,
  editarEtiqueta,
  fusionarEtiquetas,
} from '../db/inventario'
import type { ColorEtiqueta, EtiquetaMaterial, GrupoEtiqueta } from '../db/types'
import {
  clasesEtiqueta,
  COLOR_ETIQUETA,
  COLORES_ETIQUETA,
  ETIQUETA_GRUPO,
  GRUPOS_ETIQUETA,
} from '../lib/inventario'
import { useUI } from '../store/ui'

/**
 * Gestión de etiquetas del inventario.
 *
 * La fusión es la razón de que esto sea una pantalla y no una hoja: después de
 * importar una hoja de cálculo del centro llegan «Aros», «aros» y «Aro» como
 * tres etiquetas distintas, y unirlas pide ver el recuento de material
 * afectado antes de tocar nada.
 */
export function EtiquetasMaterial() {
  const [editando, setEditando] = useState<EtiquetaMaterial | 'nueva' | null>(null)
  const [fusionando, setFusionando] = useState<EtiquetaMaterial | null>(null)

  const etiquetas = useLiveQuery(() => db.etiquetasMaterial.toArray(), [])
  const materiales = useLiveQuery(() => db.materiales.toArray(), [])

  const conteo = useMemo(() => contarPorEtiqueta(materiales ?? []), [materiales])

  const porGrupo = useMemo(() => {
    const mapa = new Map<GrupoEtiqueta, EtiquetaMaterial[]>()
    for (const g of GRUPOS_ETIQUETA) mapa.set(g, [])
    for (const e of [...(etiquetas ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      mapa.get(e.grupo ?? 'otro')!.push(e)
    return [...mapa].filter(([, lista]) => lista.length > 0)
  }, [etiquetas])

  const total = etiquetas?.length ?? 0

  return (
    <>
      <Cabecera
        titulo="Etiquetas"
        atras
        subtitulo={etiquetas ? `${total} etiqueta${total === 1 ? '' : 's'}` : undefined}
        acciones={
          <button className="btn-suave" onClick={() => setEditando('nueva')}>
            <Plus size={18} aria-hidden />
            Nueva
          </button>
        }
      />

      <div className="space-y-4 p-4">
        {total === 0 ? (
          <EstadoVacio
            Icono={Tags}
            titulo="Sin etiquetas"
            descripcion="Las etiquetas agrupan el material por tamaño, familia o sitio donde se guarda. Puedes crearlas aquí o al vuelo desde la ficha de un material."
            accion={
              <button className="btn-primario" onClick={() => setEditando('nueva')}>
                <Plus size={18} aria-hidden />
                Nueva etiqueta
              </button>
            }
          />
        ) : (
          porGrupo.map(([grupo, lista]) => (
            <section key={grupo}>
              <h2 className="text-base font-semibold text-primario dark:text-agua">
                {ETIQUETA_GRUPO[grupo]}
              </h2>
              <div className="linea-pista mb-3 mt-1" aria-hidden />
              <ul className="space-y-2">
                {lista.map((e) => (
                  <li key={e.id}>
                    <div className="tarjeta flex items-center gap-2 py-3">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => setEditando(e)}
                      >
                        <span className={'pildora shrink-0 ' + clasesEtiqueta(e)}>{e.nombre}</span>
                        {e.reservada && (
                          <Lock size={14} className="shrink-0 text-tinta-tenue" aria-label="Del sistema" />
                        )}
                        <span className="cifra ml-auto shrink-0 text-sm texto-suave">
                          {conteo[e.id] ?? 0}
                        </span>
                      </button>
                      {!e.reservada && total > 1 && (
                        <button
                          className="btn-fantasma min-h-tap min-w-tap px-0"
                          onClick={() => setFusionando(e)}
                          aria-label={`Fundir «${e.nombre}» en otra etiqueta`}
                        >
                          <Merge size={18} aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <Hoja
        abierta={editando !== null}
        titulo={editando === 'nueva' ? 'Nueva etiqueta' : 'Editar etiqueta'}
        onCerrar={() => setEditando(null)}
      >
        {editando && (
          <FormularioEtiqueta
            key={editando === 'nueva' ? 'nueva' : editando.id}
            existente={editando === 'nueva' ? null : editando}
            enUso={editando === 'nueva' ? 0 : (conteo[editando.id] ?? 0)}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Hoja>

      <Hoja
        abierta={fusionando !== null}
        titulo="Fundir etiquetas"
        onCerrar={() => setFusionando(null)}
      >
        {fusionando && (
          <FormularioFusion
            key={fusionando.id}
            origen={fusionando}
            etiquetas={etiquetas ?? []}
            afectados={conteo[fusionando.id] ?? 0}
            onCerrar={() => setFusionando(null)}
          />
        )}
      </Hoja>
    </>
  )
}

// ——————————————————————— alta y edición ———————————————————————

function FormularioEtiqueta({
  existente,
  enUso,
  onCerrar,
}: {
  existente: EtiquetaMaterial | null
  enUso: number
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [grupo, setGrupo] = useState<GrupoEtiqueta>(existente?.grupo ?? 'otro')
  const [color, setColor] = useState<ColorEtiqueta | ''>(existente?.color ?? '')
  const [error, setError] = useState<string | null>(null)

  // Las del sistema solo admiten color: otros módulos se apoyan en su nombre.
  const bloqueada = existente?.reservada === true
  const sinNombre = !nombre.trim()

  async function guardar() {
    setError(null)
    try {
      if (existente) {
        await editarEtiqueta(existente.id, {
          ...(bloqueada ? {} : { nombre, grupo }),
          color: color || undefined,
        })
        mostrarAviso(`«${nombre.trim()}» actualizada`)
      } else {
        await crearEtiqueta({ nombre, grupo, color: color || undefined })
        mostrarAviso(`«${nombre.trim()}» creada`)
      }
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar')
    }
  }

  async function borrar() {
    try {
      const deshacer = await borrarEtiqueta(existente!.id)
      onCerrar()
      mostrarAviso(`«${existente!.nombre}» eliminada`, deshacer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido borrar')
    }
  }

  return (
    <div className="space-y-4">
      {bloqueada && (
        <p className="aviso">
          «{existente?.nombre}» es una etiqueta del sistema: otras partes de la app cuentan con
          que exista con ese nombre. Solo se le puede cambiar el color.
        </p>
      )}

      <div>
        <label className="etiqueta" htmlFor="etiqueta-nombre">
          Nombre
        </label>
        <Campo
          id="etiqueta-nombre"
          valor={nombre}
          onValor={setNombre}
          disabled={bloqueada}
          placeholder="Blandos, porche, gomaespuma…"
          aria-invalid={sinNombre}
        />
      </div>

      <div>
        <p className="etiqueta">Grupo</p>
        <div className="flex flex-wrap gap-2">
          {GRUPOS_ETIQUETA.map((g) => (
            <button
              key={g}
              onClick={() => setGrupo(g)}
              disabled={bloqueada}
              aria-pressed={grupo === g}
              className={
                'pildora min-h-[44px] px-3 disabled:opacity-40 ' +
                (grupo === g
                  ? 'bg-primario text-white'
                  : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
              }
            >
              {ETIQUETA_GRUPO[g]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs texto-suave">Solo sirve para agrupar la lista.</p>
      </div>

      <div>
        <p className="etiqueta">Color</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setColor('')}
            aria-pressed={color === ''}
            className={
              'pildora min-h-[44px] px-3 ' +
              (color === '' ? 'bg-primario text-white' : COLOR_ETIQUETA.agua)
            }
          >
            Sin color
          </button>
          {COLORES_ETIQUETA.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={`Color ${c}`}
              className={
                'pildora min-h-[44px] px-4 ' + COLOR_ETIQUETA[c] + (color === c ? ' ring-4 ring-primario/40' : '')
              }
            >
              {nombre.trim() || 'Aa'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="aviso-fuerte">{error}</p>}

      <button
        className="btn-primario w-full"
        onClick={() => void guardar()}
        disabled={sinNombre && !bloqueada}
      >
        {existente ? 'Guardar cambios' : 'Crear etiqueta'}
      </button>

      {existente && !bloqueada && (
        <button className="btn-peligro w-full" onClick={() => void borrar()}>
          <Trash2 size={18} aria-hidden />
          {enUso > 0
            ? `Eliminar y quitarla de ${enUso} material${enUso === 1 ? '' : 'es'}`
            : 'Eliminar etiqueta'}
        </button>
      )}
    </div>
  )
}

// ——————————————————————— fusión ———————————————————————

function FormularioFusion({
  origen,
  etiquetas,
  afectados,
  onCerrar,
}: {
  origen: EtiquetaMaterial
  etiquetas: EtiquetaMaterial[]
  afectados: number
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const candidatas = useMemo(
    () =>
      etiquetas
        .filter((e) => e.id !== origen.id)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [etiquetas, origen.id],
  )
  const destino = candidatas.find((e) => e.id === destinoId)

  async function fundir() {
    if (!destino) return
    setError(null)
    try {
      const deshacer = await fusionarEtiquetas(origen.id, destino.id)
      onCerrar()
      mostrarAviso(`«${origen.nombre}» fundida en «${destino.nombre}»`, deshacer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido fundir')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm texto-suave">
        Todo el material de <strong>«{origen.nombre}»</strong> pasa a la etiqueta que elijas, y
        «{origen.nombre}» desaparece.
      </p>

      <div>
        <p className="etiqueta">Fundir en</p>
        <div className="flex flex-wrap gap-2">
          {candidatas.map((e) => (
            <button
              key={e.id}
              onClick={() => setDestinoId(e.id)}
              aria-pressed={destinoId === e.id}
              className={
                'pildora min-h-[44px] px-3 ' +
                (destinoId === e.id ? 'bg-primario text-white' : clasesEtiqueta(e))
              }
            >
              {e.nombre}
            </button>
          ))}
        </div>
      </div>

      {destino && (
        <div className="panel-agua text-sm">
          <p className="font-bold">
            {afectados} material{afectados === 1 ? '' : 'es'} pasa
            {afectados === 1 ? '' : 'n'} a «{destino.nombre}»
          </p>
          <p className="mt-1 texto-suave">
            El que ya tuviera «{destino.nombre}» no la duplica. Se puede deshacer.
          </p>
        </div>
      )}

      {error && <p className="aviso-fuerte">{error}</p>}

      <button className="btn-primario w-full" onClick={() => void fundir()} disabled={!destino}>
        <Merge size={18} aria-hidden />
        Fundir etiquetas
      </button>
    </div>
  )
}
