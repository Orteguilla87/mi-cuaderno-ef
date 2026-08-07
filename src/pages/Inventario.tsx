import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDownUp, Package, Plus, Search, Tags, Trash2, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Campo, CampoArea } from '../components/Campo'
import { EstadoVacio } from '../components/EstadoVacio'
import { Hoja } from '../components/Hoja'
import { db } from '../db/db'
import {
  borrarMaterial,
  buscarMateriales,
  buscarPorNombre,
  crearEtiqueta,
  crearMaterial,
  editarMaterial,
  type DatosMaterial,
} from '../db/inventario'
import type { EstadoMaterial, EtiquetaMaterial, GrupoEtiqueta, Material } from '../db/types'
import {
  aCantidad,
  avisosMaterial,
  clasesEtiqueta,
  COLOR_ESTADO,
  ESTADOS,
  ETIQUETA_ESTADO,
  ETIQUETA_GRUPO,
  ETIQUETA_ORDEN,
  FILTRO_VACIO,
  filtrar,
  GRUPOS_ETIQUETA,
  hayFiltros,
  ordenarMateriales,
  textoCantidad,
  type FiltroInventario,
  type OrdenInventario,
} from '../lib/inventario'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

const ORDENES: OrdenInventario[] = ['alfabetico', 'cantidad', 'estado']

/**
 * Inventario de material (catálogo del centro, transversal a las etapas).
 *
 * Sin FAB propio: el botón de alta vive en la cabecera, como el «Importar» del
 * Banco de Juegos. El único elemento flotante de la app sigue siendo el
 * micrófono, y `carril-fab` ya reserva su hueco al final del scroll.
 */
export function Inventario() {
  const [consulta, setConsulta] = useState('')
  const [filtro, setFiltro] = useState<FiltroInventario>(FILTRO_VACIO)
  const [orden, setOrden] = useState<OrdenInventario>('alfabetico')
  const [editando, setEditando] = useState<Material | 'nuevo' | null>(null)

  const materiales = useLiveQuery(() => db.materiales.toArray(), [])
  const etiquetas = useLiveQuery(() => db.etiquetasMaterial.toArray(), [])

  const porId = useMemo(
    () => new Map((etiquetas ?? []).map((e) => [e.id, e])),
    [etiquetas],
  )

  const visibles = useMemo(() => {
    const filtrados = filtrar(materiales ?? [], filtro)
    // Con consulta manda la relevancia de Fuse; sin ella, el orden elegido.
    return consulta.trim()
      ? buscarMateriales(filtrados, consulta)
      : ordenarMateriales(filtrados, orden)
  }, [materiales, filtro, consulta, orden])

  const total = materiales?.length ?? 0
  const vacio = total === 0

  return (
    <>
      <Cabecera
        titulo="Inventario"
        subtitulo={materiales ? `${total} material${total === 1 ? '' : 'es'}` : undefined}
        acciones={
          <button className="btn-suave" onClick={() => setEditando('nuevo')}>
            <Plus size={18} aria-hidden />
            Nuevo
          </button>
        }
      />

      <div className="space-y-4 p-4">
        {vacio ? (
          <EstadoVacio
            Icono={Package}
            titulo="Todavía no hay material"
            descripcion="El catálogo del material del centro: qué hay, cuánto y en qué estado. Lo usarás para montar sesiones con lo que de verdad está en la caseta."
            accion={
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="btn-primario" onClick={() => setEditando('nuevo')}>
                  <Plus size={18} aria-hidden />
                  Añadir material
                </button>
                <button className="btn-suave" onClick={() => navegar('/inventario/importar')}>
                  <Upload size={18} aria-hidden />
                  Importar desde archivo
                </button>
              </div>
            }
          />
        ) : (
          <>
            <BarraFiltros
              consulta={consulta}
              onConsulta={setConsulta}
              filtro={filtro}
              onFiltro={setFiltro}
              orden={orden}
              onOrden={setOrden}
              etiquetas={etiquetas ?? []}
            />

            <p className="cifra text-xs texto-suave">
              {visibles.length} de {total} materiales
            </p>

            {visibles.length === 0 ? (
              <EstadoVacio
                titulo="Nada con esos filtros"
                descripcion="Prueba a quitar alguna etiqueta o a buscar otra cosa."
                accion={
                  <button
                    className="btn-suave"
                    onClick={() => {
                      setConsulta('')
                      setFiltro(FILTRO_VACIO)
                    }}
                  >
                    Limpiar todo
                  </button>
                }
              />
            ) : (
              <ul className="space-y-2">
                {visibles.map((m) => (
                  <li key={m.id}>
                    <FilaMaterial material={m} porId={porId} onAbrir={() => setEditando(m)} />
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-suave" onClick={() => navegar('/inventario/etiquetas')}>
                <Tags size={18} aria-hidden />
                Gestionar etiquetas
              </button>
              <button className="btn-suave" onClick={() => navegar('/inventario/importar')}>
                <Upload size={18} aria-hidden />
                Importar desde archivo
              </button>
            </div>
          </>
        )}
      </div>

      <HojaMaterial
        material={editando}
        etiquetas={etiquetas ?? []}
        materiales={materiales ?? []}
        onCerrar={() => setEditando(null)}
        onIrA={(m) => setEditando(m)}
      />
    </>
  )
}

// ——————————————————————————— fila ———————————————————————————

function FilaMaterial({
  material,
  porId,
  onAbrir,
}: {
  material: Material
  porId: Map<string, EtiquetaMaterial>
  onAbrir: () => void
}) {
  const cantidad = textoCantidad(material)

  return (
    <button className="tarjeta-pulsable flex w-full items-start gap-3 py-3 text-left" onClick={onAbrir}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-base font-bold">{material.nombre}</span>
          {/* Sin cantidad no se pinta NADA: ni «—» ni 0. El hueco en blanco es
              lo que recuerda que ese material está sin contar. */}
          {cantidad && <span className="cifra shrink-0 text-sm texto-suave">{cantidad}</span>}
        </div>

        {material.ubicacion && (
          <span className="mt-0.5 block truncate text-sm texto-suave">{material.ubicacion}</span>
        )}

        {(material.estado || material.etiquetaIds.length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {material.estado && (
              <span className={'pildora ' + COLOR_ESTADO[material.estado]}>
                {ETIQUETA_ESTADO[material.estado]}
              </span>
            )}
            {material.etiquetaIds.map((id) => {
              const etiqueta = porId.get(id)
              if (!etiqueta) return null
              return (
                <span key={id} className={'pildora ' + clasesEtiqueta(etiqueta)}>
                  {etiqueta.nombre}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </button>
  )
}

// ——————————————————————————— filtros ———————————————————————————

function BarraFiltros({
  consulta,
  onConsulta,
  filtro,
  onFiltro,
  orden,
  onOrden,
  etiquetas,
}: {
  consulta: string
  onConsulta: (v: string) => void
  filtro: FiltroInventario
  onFiltro: (f: FiltroInventario) => void
  orden: OrdenInventario
  onOrden: (o: OrdenInventario) => void
  etiquetas: EtiquetaMaterial[]
}) {
  const [abierta, setAbierta] = useState(false)

  const porGrupo = useMemo(() => {
    const mapa = new Map<GrupoEtiqueta, EtiquetaMaterial[]>()
    for (const g of GRUPOS_ETIQUETA) mapa.set(g, [])
    for (const e of [...etiquetas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      mapa.get(e.grupo ?? 'otro')!.push(e)
    return [...mapa].filter(([, lista]) => lista.length > 0)
  }, [etiquetas])

  function alternarEtiqueta(id: string) {
    const ids = filtro.etiquetaIds.includes(id)
      ? filtro.etiquetaIds.filter((e) => e !== id)
      : [...filtro.etiquetaIds, id]
    onFiltro({ ...filtro, etiquetaIds: ids })
  }

  function alternarEstado(estado: EstadoMaterial) {
    const estados = filtro.estados.includes(estado)
      ? filtro.estados.filter((e) => e !== estado)
      : [...filtro.estados, estado]
    onFiltro({ ...filtro, estados })
  }

  const activos = hayFiltros(filtro)

  return (
    // `top-0` a secas: la cabecera es `sticky` y no fija, así que al desplazar
    // sale de pantalla y esta barra ocupa su sitio, no queda flotando debajo.
    <div className="sticky top-0 z-10 -mx-4 space-y-3 bg-hueso px-4 py-3 dark:bg-noche-fondo">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <Campo
            className="campo pl-10"
            valor={consulta}
            onValor={onConsulta}
            placeholder="Buscar material, ubicación, notas"
            aria-label="Buscar material"
          />
        </div>
        <button
          className="btn-suave shrink-0 px-3"
          onClick={() => setAbierta(!abierta)}
          aria-expanded={abierta}
        >
          Filtros
        </button>
      </div>

      {abierta && (
        <div className="space-y-3">
          <div>
            <p className="etiqueta">Orden</p>
            <div className="flex flex-wrap gap-2">
              {ORDENES.map((o) => (
                <button
                  key={o}
                  onClick={() => onOrden(o)}
                  aria-pressed={orden === o}
                  className={
                    'pildora min-h-[40px] gap-1 px-3 ' +
                    (orden === o
                      ? 'bg-primario text-white'
                      : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                  }
                >
                  <ArrowDownUp size={14} aria-hidden />
                  {ETIQUETA_ORDEN[o]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="etiqueta">Estado</p>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => alternarEstado(e)}
                  aria-pressed={filtro.estados.includes(e)}
                  className={
                    'pildora min-h-[40px] px-3 ' +
                    (filtro.estados.includes(e)
                      ? 'bg-primario text-white'
                      : COLOR_ESTADO[e])
                  }
                >
                  {ETIQUETA_ESTADO[e]}
                </button>
              ))}
            </div>
          </div>

          {porGrupo.map(([grupo, lista]) => (
            <div key={grupo}>
              <p className="etiqueta">{ETIQUETA_GRUPO[grupo]}</p>
              <div className="flex flex-wrap gap-2">
                {lista.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => alternarEtiqueta(e.id)}
                    aria-pressed={filtro.etiquetaIds.includes(e.id)}
                    className={
                      'pildora min-h-[40px] px-3 ' +
                      (filtro.etiquetaIds.includes(e.id)
                        ? 'bg-primario text-white'
                        : clasesEtiqueta(e))
                    }
                  >
                    {e.nombre}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs texto-suave">
            Varias etiquetas se acumulan: solo sale el material que las tiene todas.
          </p>
        </div>
      )}

      {activos && (
        <div className="flex flex-wrap items-center gap-2">
          {filtro.estados.map((e) => (
            <PildoraActiva key={e} texto={ETIQUETA_ESTADO[e]} onQuitar={() => alternarEstado(e)} />
          ))}
          {filtro.etiquetaIds.map((id) => (
            <PildoraActiva
              key={id}
              texto={etiquetas.find((e) => e.id === id)?.nombre ?? 'Etiqueta'}
              onQuitar={() => alternarEtiqueta(id)}
            />
          ))}
          <button className="btn-fantasma min-h-[40px] px-2 text-sm" onClick={() => onFiltro(FILTRO_VACIO)}>
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  )
}

function PildoraActiva({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <button
      onClick={onQuitar}
      className="pildora min-h-[40px] gap-1 bg-primario px-3 text-white"
      aria-label={`Quitar el filtro ${texto}`}
    >
      {texto}
      <X size={14} aria-hidden />
    </button>
  )
}

// ——————————————————————————— alta y edición ———————————————————————————

interface Borrador {
  nombre: string
  cantidad: string
  cantidadInservible: string
  estado: EstadoMaterial | ''
  etiquetaIds: string[]
  ubicacion: string
  notas: string
}

const BORRADOR_VACIO: Borrador = {
  nombre: '',
  cantidad: '',
  cantidadInservible: '',
  estado: '',
  etiquetaIds: [],
  ubicacion: '',
  notas: '',
}

function aBorrador(material: Material): Borrador {
  return {
    nombre: material.nombre,
    cantidad: material.cantidad === undefined ? '' : String(material.cantidad),
    cantidadInservible:
      material.cantidadInservible === undefined ? '' : String(material.cantidadInservible),
    estado: material.estado ?? '',
    etiquetaIds: material.etiquetaIds,
    ubicacion: material.ubicacion ?? '',
    notas: material.notas ?? '',
  }
}

/** Campo vacío → clave ausente, jamás 0 ni cadena vacía. */
function aDatos(borrador: Borrador): DatosMaterial {
  return {
    nombre: borrador.nombre.trim(),
    cantidad: aCantidad(borrador.cantidad),
    cantidadInservible: aCantidad(borrador.cantidadInservible),
    estado: borrador.estado || undefined,
    etiquetaIds: borrador.etiquetaIds,
    ubicacion: borrador.ubicacion.trim() || undefined,
    notas: borrador.notas.trim() || undefined,
  }
}

function HojaMaterial({
  material,
  etiquetas,
  materiales,
  onCerrar,
  onIrA,
}: {
  material: Material | 'nuevo' | null
  etiquetas: EtiquetaMaterial[]
  materiales: Material[]
  onCerrar: () => void
  onIrA: (m: Material) => void
}) {
  const esNuevo = material === 'nuevo'
  const existente = material && material !== 'nuevo' ? material : null
  const mostrarAviso = useUI((s) => s.mostrarAviso)

  // `key` en <Hoja> reinicia el borrador al cambiar de material: sin eso, abrir
  // otra fila arrastraría lo escrito en la anterior.
  return (
    <Hoja
      abierta={material !== null}
      titulo={esNuevo ? 'Nuevo material' : 'Editar material'}
      onCerrar={onCerrar}
    >
      {material && (
        <FormularioMaterial
          key={existente?.id ?? 'nuevo'}
          existente={existente}
          etiquetas={etiquetas}
          materiales={materiales}
          onCerrar={onCerrar}
          onIrA={onIrA}
          mostrarAviso={mostrarAviso}
        />
      )}
    </Hoja>
  )
}

function FormularioMaterial({
  existente,
  etiquetas,
  materiales,
  onCerrar,
  onIrA,
  mostrarAviso,
}: {
  existente: Material | null
  etiquetas: EtiquetaMaterial[]
  materiales: Material[]
  onCerrar: () => void
  onIrA: (m: Material) => void
  mostrarAviso: (texto: string, deshacer?: () => Promise<void>) => void
}) {
  const [borrador, setBorrador] = useState<Borrador>(
    existente ? aBorrador(existente) : BORRADOR_VACIO,
  )
  const [guardando, setGuardando] = useState(false)

  const datos = aDatos(borrador)
  const avisos = avisosMaterial(datos)

  // Duplicado: se avisa y se ofrece saltar al existente, pero NO se bloquea el
  // guardado (§ reglas transversales: avisar, no bloquear).
  const duplicado = useMemo(() => {
    const otro = buscarPorNombre(materiales, borrador.nombre)
    return otro && otro.id !== existente?.id ? otro : undefined
  }, [materiales, borrador.nombre, existente])

  const sinNombre = !datos.nombre

  async function guardar() {
    if (sinNombre) return
    setGuardando(true)
    try {
      if (existente) {
        await editarMaterial(existente.id, datos)
        mostrarAviso(`«${datos.nombre}» actualizado`)
      } else {
        await crearMaterial(datos)
        mostrarAviso(`«${datos.nombre}» añadido al inventario`)
      }
      onCerrar()
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!existente) return
    const deshacer = await borrarMaterial(existente.id)
    onCerrar()
    mostrarAviso(`«${existente.nombre}» eliminado`, deshacer)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="etiqueta" htmlFor="material-nombre">
          Nombre
        </label>
        <Campo
          id="material-nombre"
          valor={borrador.nombre}
          onValor={(nombre) => setBorrador({ ...borrador, nombre })}
          placeholder="Conos, aros, petos…"
          aria-invalid={sinNombre}
        />
        {duplicado && (
          <p className="aviso mt-1.5">
            Ya existe «{duplicado.nombre}».{' '}
            <button className="font-bold underline" onClick={() => onIrA(duplicado)}>
              ¿Editar el existente?
            </button>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta" htmlFor="material-cantidad">
            Cantidad
          </label>
          <Campo
            id="material-cantidad"
            className="campo cifra"
            inputMode="numeric"
            valor={borrador.cantidad}
            onValor={(cantidad) => setBorrador({ ...borrador, cantidad })}
            placeholder="Sin contar"
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="material-inservible">
            Inservibles
          </label>
          <Campo
            id="material-inservible"
            className="campo cifra"
            inputMode="numeric"
            valor={borrador.cantidadInservible}
            onValor={(cantidadInservible) => setBorrador({ ...borrador, cantidadInservible })}
            placeholder="—"
          />
        </div>
      </div>

      <p className="text-xs texto-suave">
        Los dos se pueden dejar en blanco: en blanco significa «no lo he contado», que no es lo
        mismo que cero.
      </p>

      {avisos.map((a) => (
        <p key={a} className="aviso">
          {a}
        </p>
      ))}

      <div>
        <p className="etiqueta">Estado</p>
        <div className="flex flex-wrap gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e}
              onClick={() => setBorrador({ ...borrador, estado: borrador.estado === e ? '' : e })}
              aria-pressed={borrador.estado === e}
              className={
                'pildora min-h-[44px] px-3 ' +
                (borrador.estado === e ? 'bg-primario text-white' : COLOR_ESTADO[e])
              }
            >
              {ETIQUETA_ESTADO[e]}
            </button>
          ))}
        </div>
      </div>

      <SelectorEtiquetas
        etiquetas={etiquetas}
        elegidas={borrador.etiquetaIds}
        onElegidas={(etiquetaIds) => setBorrador({ ...borrador, etiquetaIds })}
      />

      <div>
        <label className="etiqueta" htmlFor="material-ubicacion">
          Ubicación
        </label>
        <Campo
          id="material-ubicacion"
          valor={borrador.ubicacion}
          onValor={(ubicacion) => setBorrador({ ...borrador, ubicacion })}
          placeholder="Almacén, porche, caseta…"
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="material-notas">
          Notas
        </label>
        <CampoArea
          id="material-notas"
          className="campo h-20 resize-none py-2"
          valor={borrador.notas}
          onValor={(notas) => setBorrador({ ...borrador, notas })}
        />
      </div>

      <button className="btn-primario w-full" onClick={() => void guardar()} disabled={sinNombre || guardando}>
        {existente ? 'Guardar cambios' : 'Añadir al inventario'}
      </button>

      {existente && (
        <button className="btn-peligro w-full" onClick={() => void borrar()}>
          <Trash2 size={18} aria-hidden />
          Eliminar del inventario
        </button>
      )}
    </div>
  )
}

function SelectorEtiquetas({
  etiquetas,
  elegidas,
  onElegidas,
}: {
  etiquetas: EtiquetaMaterial[]
  elegidas: string[]
  onElegidas: (ids: string[]) => void
}) {
  const [consulta, setConsulta] = useState('')

  const visibles = useMemo(() => {
    const q = consulta.trim().toLowerCase()
    const ordenadas = [...etiquetas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    if (!q) return ordenadas
    return ordenadas.filter((e) => e.nombreNormalizado.includes(q))
  }, [etiquetas, consulta])

  const exacta = etiquetas.some((e) => e.nombre.toLowerCase() === consulta.trim().toLowerCase())
  const puedeCrear = consulta.trim().length > 0 && !exacta

  async function crearYElegir() {
    const nueva = await crearEtiqueta({ nombre: consulta.trim() })
    onElegidas([...elegidas, nueva.id])
    setConsulta('')
  }

  return (
    <div>
      <p className="etiqueta">Etiquetas</p>
      <Campo
        valor={consulta}
        onValor={setConsulta}
        placeholder="Buscar o crear etiqueta"
        aria-label="Buscar o crear etiqueta"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {visibles.map((e) => (
          <button
            key={e.id}
            onClick={() =>
              onElegidas(
                elegidas.includes(e.id)
                  ? elegidas.filter((id) => id !== e.id)
                  : [...elegidas, e.id],
              )
            }
            aria-pressed={elegidas.includes(e.id)}
            className={
              'pildora min-h-[40px] px-3 ' +
              (elegidas.includes(e.id) ? 'bg-primario text-white' : clasesEtiqueta(e))
            }
          >
            {e.nombre}
          </button>
        ))}
        {puedeCrear && (
          <button className="btn-suave min-h-[40px] px-3 text-sm" onClick={() => void crearYElegir()}>
            <Plus size={14} aria-hidden />
            Crear «{consulta.trim()}»
          </button>
        )}
      </div>
    </div>
  )
}
