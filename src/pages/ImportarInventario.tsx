import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Cabecera } from '../components/Cabecera'
import { EstadoVacio } from '../components/EstadoVacio'
import { db } from '../db/db'
import {
  aplicarImportacion,
  marcadorEtiquetaNueva,
  type DatosMaterial,
  type PlanImportacion,
} from '../db/inventario'
import type { EtiquetaMaterial, GrupoEtiqueta, Material } from '../db/types'
import {
  analizarFilas,
  anchoDeHoja,
  DESTINOS,
  detectarDuplicados,
  ETIQUETA_DESTINO,
  etiquetasNuevas,
  fusionarCampos,
  nombresDeColumna,
  primeraFilaConDatos,
  resolucionPorDefecto,
  SEPARADORES,
  sugerirDestino,
  type Celda,
  type DestinoColumna,
  type Resolucion,
  type Separador,
} from '../lib/importInventario'
import { ETIQUETA_ESTADO, ETIQUETA_GRUPO, GRUPOS_ETIQUETA, normalizarNombre, textoCantidad } from '../lib/inventario'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

interface Libro {
  nombreFichero: string
  hojas: string[]
  /** Filas crudas de la hoja elegida, sin cabecera aún. */
  filas: Celda[][]
}

/**
 * Importador de inventario desde CSV / XLSX.
 *
 * No se asume ninguna cabecera ni orden de columnas: se sugiere un mapeo y el
 * usuario lo corrige. Nada se escribe hasta la vista previa, y lo que no se
 * entiende se enseña como incidencia en vez de rellenarse a ojo.
 */
export function ImportarInventario() {
  const [libro, setLibro] = useState<Libro | null>(null)
  const [hoja, setHoja] = useState(0)
  const [filaCabecera, setFilaCabecera] = useState(0)
  const [destinos, setDestinos] = useState<DestinoColumna[]>([])
  const [separador, setSeparador] = useState<Separador>(',')
  const [resoluciones, setResoluciones] = useState<Record<number, Resolucion>>({})
  const [grupoEtiquetas, setGrupoEtiquetas] = useState<GrupoEtiqueta | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  const materiales = useLiveQuery(() => db.materiales.toArray(), [])
  const etiquetas = useLiveQuery(() => db.etiquetasMaterial.toArray(), [])
  const mostrarAviso = useUI((s) => s.mostrarAviso)

  async function elegirFichero(fichero: File) {
    setError(null)
    try {
      // `raw: false` + `defval: null` deja las celdas tal como se ven en la
      // hoja: el parseo tolerante es cosa de `lib/importInventario.ts`, aquí
      // solo se lee. SheetJS abre .xlsx, .xls y .csv con la misma llamada, pero
      // un CSV sin BOM leído como bytes cae al códec por defecto de la
      // librería (no UTF-8), y «Descripción» sale mojibake. Un inventario de
      // centro exportado desde Excel o Sheets es casi siempre UTF-8, así que
      // el .csv se decodifica a texto primero y se lee como string.
      const esCsv = /\.csv$/i.test(fichero.name) || fichero.type === 'text/csv'
      const wb = esCsv
        ? XLSX.read(new TextDecoder('utf-8').decode(await fichero.arrayBuffer()), {
            type: 'string',
            raw: false,
          })
        : XLSX.read(new Uint8Array(await fichero.arrayBuffer()), { type: 'array', raw: false })
      if (wb.SheetNames.length === 0) throw new Error('El fichero no tiene ninguna hoja.')
      cargarHoja(wb, 0, fichero.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido leer el fichero')
      setLibro(null)
    }
  }

  function cargarHoja(wb: XLSX.WorkBook, indice: number, nombreFichero: string) {
    const filas = XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[wb.SheetNames[indice]], {
      header: 1,
      defval: null,
      blankrows: true,
    })
    const cabecera = primeraFilaConDatos(filas)
    setLibro({ nombreFichero, hojas: wb.SheetNames, filas })
    setHoja(indice)
    setFilaCabecera(cabecera)
    setDestinos(sugerirDestinos(filas, cabecera))
    setResoluciones({})
    // El libro se guarda en el estado para poder cambiar de hoja sin releer.
    librosAbiertos.set(nombreFichero, wb)
  }

  const columnas = libro ? anchoDeHoja(libro.filas) : 0
  const nombresColumna = useMemo(
    () => (libro ? nombresDeColumna(libro.filas[filaCabecera] ?? [], columnas) : []),
    [libro, filaCabecera, columnas],
  )

  const analisis = useMemo(() => {
    if (!libro) return null
    return analizarFilas(libro.filas.slice(filaCabecera + 1), { destinos, separador })
  }, [libro, filaCabecera, destinos, separador])

  const duplicados = useMemo(
    () => (analisis ? detectarDuplicados(analisis.filas, materiales ?? []) : new Map()),
    [analisis, materiales],
  )

  const nuevasEtiquetas = useMemo(
    () => (analisis ? etiquetasNuevas(analisis.filas, etiquetas ?? []) : []),
    [analisis, etiquetas],
  )

  const hayNombre = destinos.includes('nombre')

  function resolucionDe(indice: number): Resolucion {
    const duplicado = duplicados.get(indice)
    if (!duplicado) return 'crear'
    return resoluciones[indice] ?? resolucionPorDefecto(duplicado)
  }

  const cuenta = useMemo(() => {
    if (!analisis) return { crear: 0, fusionar: 0, omitir: 0 }
    const c = { crear: 0, fusionar: 0, omitir: 0 }
    for (const fila of analisis.filas) c[resolucionDe(fila.indice)]++
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisis, duplicados, resoluciones])

  async function importar() {
    if (!analisis) return
    setImportando(true)
    setError(null)
    try {
      const plan = construirPlan({
        filas: analisis.filas,
        resolucionDe,
        duplicados,
        etiquetasExistentes: etiquetas ?? [],
        materialesExistentes: materiales ?? [],
        nuevasEtiquetas,
        grupoEtiquetas: grupoEtiquetas || undefined,
      })
      const resumen = await aplicarImportacion(plan)
      mostrarAviso(
        `${resumen.creados} creados · ${resumen.fusionados} fusionados`,
        resumen.deshacer,
      )
      navegar('/inventario')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido importar')
    } finally {
      setImportando(false)
    }
  }

  return (
    <>
      <Cabecera
        titulo="Importar inventario"
        atras
        subtitulo={libro ? libro.nombreFichero : 'CSV, XLSX o XLS'}
      />

      <div className="space-y-4 p-4">
        {!libro ? (
          <EstadoVacio
            Icono={FileSpreadsheet}
            titulo="Elige la hoja del inventario"
            descripcion="Vale cualquier hoja: no hace falta que tenga un formato concreto ni las columnas en un orden determinado. Tú dices qué es cada columna y verás el resultado antes de que se guarde nada."
            accion={
              <label className="btn-primario cursor-pointer">
                <Upload size={18} aria-hidden />
                Elegir archivo
                <input
                  type="file"
                  className="sr-only"
                  accept=".csv,.xlsx,.xls,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void elegirFichero(f)
                  }}
                />
              </label>
            }
          />
        ) : (
          <>
            {libro.hojas.length > 1 && (
              <section>
                <h2 className="etiqueta">Hoja</h2>
                <div className="flex flex-wrap gap-2">
                  {libro.hojas.map((h, i) => (
                    <button
                      key={h}
                      onClick={() => {
                        const wb = librosAbiertos.get(libro.nombreFichero)
                        if (wb) cargarHoja(wb, i, libro.nombreFichero)
                      }}
                      aria-pressed={hoja === i}
                      className={
                        'pildora min-h-[44px] px-3 ' +
                        (hoja === i
                          ? 'bg-primario text-white'
                          : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                      }
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="etiqueta">Fila de los títulos</h2>
              <div className="flex flex-wrap gap-2">
                {libro.filas.slice(0, 8).map((fila, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setFilaCabecera(i)
                      setDestinos(sugerirDestinos(libro.filas, i))
                    }}
                    aria-pressed={filaCabecera === i}
                    className={
                      'pildora min-h-[44px] max-w-full truncate px-3 normal-case ' +
                      (filaCabecera === i
                        ? 'bg-primario text-white'
                        : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                    }
                  >
                    {fila.filter((c) => c !== null && String(c).trim()).slice(0, 3).join(' · ') ||
                      `Fila ${i + 1} (vacía)`}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-base font-semibold text-primario dark:text-agua">Qué es cada columna</h2>
              <div className="linea-pista mb-3 mt-1" aria-hidden />
              <ul className="space-y-2">
                {nombresColumna.map((nombre, i) => (
                  <li key={i} className="tarjeta flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nombre}</span>
                    <select
                      className="campo w-40 shrink-0"
                      value={destinos[i] ?? 'ignorar'}
                      onChange={(e) => {
                        const nuevos = [...destinos]
                        nuevos[i] = e.target.value as DestinoColumna
                        setDestinos(nuevos)
                      }}
                      aria-label={`Destino de la columna ${nombre}`}
                    >
                      {DESTINOS.map((d) => (
                        <option key={d} value={d}>
                          {ETIQUETA_DESTINO[d]}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              {!hayNombre && (
                <p className="aviso-fuerte mt-2">
                  Falta decir qué columna es el nombre. Es la única imprescindible.
                </p>
              )}
            </section>

            {destinos.includes('etiquetas') && (
              <section>
                <h2 className="etiqueta">Separador de las etiquetas</h2>
                <div className="flex flex-wrap gap-2">
                  {SEPARADORES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeparador(s)}
                      aria-pressed={separador === s}
                      className={
                        'pildora min-h-[44px] w-14 justify-center px-3 ' +
                        (separador === s
                          ? 'bg-primario text-white'
                          : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {hayNombre && analisis && (
              <>
                <Preview
                  analisis={analisis}
                  duplicados={duplicados}
                  resolucionDe={resolucionDe}
                  onResolver={(indice, r) => setResoluciones({ ...resoluciones, [indice]: r })}
                  onTodas={(r) => {
                    const todas: Record<number, Resolucion> = {}
                    for (const [indice] of duplicados) todas[indice] = r
                    setResoluciones(todas)
                  }}
                  etiquetas={etiquetas ?? []}
                />

                {nuevasEtiquetas.length > 0 && (
                  <section className="tarjeta">
                    <h2 className="text-base font-semibold">
                      {nuevasEtiquetas.length} etiqueta{nuevasEtiquetas.length === 1 ? '' : 's'} nueva
                      {nuevasEtiquetas.length === 1 ? '' : 's'}
                    </h2>
                    <p className="mt-1 text-sm texto-suave">
                      Se crearán al importar. Puedes darles un grupo a todas de golpe y
                      arreglarlo luego en «Etiquetas».
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {nuevasEtiquetas.map((n) => (
                        <span
                          key={n}
                          className="pildora bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setGrupoEtiquetas('')}
                        aria-pressed={grupoEtiquetas === ''}
                        className={
                          'pildora min-h-[44px] px-3 ' +
                          (grupoEtiquetas === ''
                            ? 'bg-primario text-white'
                            : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                        }
                      >
                        Sin grupo
                      </button>
                      {GRUPOS_ETIQUETA.map((g) => (
                        <button
                          key={g}
                          onClick={() => setGrupoEtiquetas(g)}
                          aria-pressed={grupoEtiquetas === g}
                          className={
                            'pildora min-h-[44px] px-3 ' +
                            (grupoEtiquetas === g
                              ? 'bg-primario text-white'
                              : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                          }
                        >
                          {ETIQUETA_GRUPO[g]}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {error && <p className="aviso-fuerte">{error}</p>}

                <button
                  className="btn-primario w-full"
                  onClick={() => void importar()}
                  disabled={importando || cuenta.crear + cuenta.fusionar === 0}
                >
                  Importar {cuenta.crear} nuevos y completar {cuenta.fusionar}
                </button>
              </>
            )}
          </>
        )}

        {error && !libro && <p className="aviso-fuerte">{error}</p>}
      </div>
    </>
  )
}

/**
 * Libros ya parseados, fuera del estado de React: un `WorkBook` de SheetJS no
 * es serializable ni tiene por qué disparar renders, y guardarlo evita releer
 * el fichero entero al cambiar de hoja.
 */
const librosAbiertos = new Map<string, XLSX.WorkBook>()

function sugerirDestinos(filas: Celda[][], filaCabecera: number): DestinoColumna[] {
  const columnas = anchoDeHoja(filas)
  const cabecera = nombresDeColumna(filas[filaCabecera] ?? [], columnas)
  const usados = new Set<DestinoColumna>()
  return cabecera.map((nombre) => {
    const destino = sugerirDestino(nombre)
    // Un destino no se puede repetir: dos columnas «Nombre» dejarían la
    // segunda pisando a la primera sin que se vea.
    if (destino === 'ignorar' || usados.has(destino)) return 'ignorar'
    usados.add(destino)
    return destino
  })
}

// ——————————————————————— vista previa ———————————————————————

function Preview({
  analisis,
  duplicados,
  resolucionDe,
  onResolver,
  onTodas,
  etiquetas,
}: {
  analisis: ReturnType<typeof analizarFilas>
  duplicados: Map<number, { nombreExistente: string; enElFichero: boolean }>
  resolucionDe: (indice: number) => Resolucion
  onResolver: (indice: number, r: Resolucion) => void
  onTodas: (r: Resolucion) => void
  etiquetas: EtiquetaMaterial[]
}) {
  const conocidas = useMemo(
    () => new Set(etiquetas.map((e) => e.nombreNormalizado)),
    [etiquetas],
  )
  const conIncidencias = analisis.filas.filter((f) => f.incidencias.length > 0).length

  return (
    <section>
      <h2 className="text-base font-semibold text-primario dark:text-agua">
        Antes de guardar nada
      </h2>
      <div className="linea-pista mb-3 mt-1" aria-hidden />

      <p className="cifra text-sm texto-suave">
        {analisis.filas.length} filas · {duplicados.size} duplicadas · {conIncidencias} con
        incidencias · {analisis.descartadas} descartadas sin nombre
      </p>

      {duplicados.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="self-center text-sm texto-suave">Con todas las duplicadas:</span>
          {(['crear', 'fusionar', 'omitir'] as Resolucion[]).map((r) => (
            <button key={r} className="btn-suave min-h-[40px] px-3 text-sm" onClick={() => onTodas(r)}>
              {ETIQUETA_RESOLUCION[r]}
            </button>
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {analisis.filas.map((fila) => {
          const duplicado = duplicados.get(fila.indice)
          const resolucion = resolucionDe(fila.indice)
          const cantidad = textoCantidad(fila)
          return (
            <li
              key={fila.indice}
              className={'tarjeta py-3 ' + (resolucion === 'omitir' ? 'opacity-50' : '')}
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-base font-bold">{fila.nombre}</span>
                {cantidad && <span className="cifra shrink-0 text-sm texto-suave">{cantidad}</span>}
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {fila.estado && (
                  <span className="pildora bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                    {ETIQUETA_ESTADO[fila.estado]}
                  </span>
                )}
                {fila.ubicacion && (
                  <span className="pildora bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                    {fila.ubicacion}
                  </span>
                )}
                {fila.etiquetas.map((t) => (
                  <span
                    key={t}
                    className={
                      'pildora ' +
                      (conocidas.has(normalizarNombre(t))
                        ? 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua'
                        : 'bg-lima/20 text-lima-oscuro dark:bg-lima/25 dark:text-lima')
                    }
                  >
                    {t}
                  </span>
                ))}
              </div>

              {fila.incidencias.map((inc) => (
                <p key={inc} className="aviso mt-2 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  {inc}
                </p>
              ))}

              {duplicado && (
                <div className="mt-2">
                  <p className="text-sm texto-suave">
                    {duplicado.enElFichero
                      ? `Repetido dentro del propio fichero («${duplicado.nombreExistente}»).`
                      : `Ya existe «${duplicado.nombreExistente}» en el inventario.`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(['crear', 'fusionar', 'omitir'] as Resolucion[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => onResolver(fila.indice, r)}
                        aria-pressed={resolucion === r}
                        disabled={r === 'fusionar' && duplicado.enElFichero}
                        className={
                          'pildora min-h-[40px] px-3 disabled:opacity-30 ' +
                          (resolucion === r
                            ? 'bg-primario text-white'
                            : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                        }
                      >
                        {ETIQUETA_RESOLUCION[r]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const ETIQUETA_RESOLUCION: Record<Resolucion, string> = {
  crear: 'Crear nueva',
  fusionar: 'Fusionar',
  omitir: 'Omitir',
}

// ——————————————————————— plan ———————————————————————

function construirPlan({
  filas,
  resolucionDe,
  duplicados,
  etiquetasExistentes,
  materialesExistentes,
  nuevasEtiquetas,
  grupoEtiquetas,
}: {
  filas: ReturnType<typeof analizarFilas>['filas']
  resolucionDe: (indice: number) => Resolucion
  duplicados: Map<number, { materialId?: string }>
  etiquetasExistentes: EtiquetaMaterial[]
  materialesExistentes: Material[]
  nuevasEtiquetas: string[]
  grupoEtiquetas?: GrupoEtiqueta
}): PlanImportacion {
  const porNombre = new Map(etiquetasExistentes.map((e) => [e.nombreNormalizado, e.id]))
  const porId = new Map(materialesExistentes.map((m) => [m.id, m]))

  const plan: PlanImportacion = {
    crear: [],
    fusionar: [],
    etiquetas: nuevasEtiquetas.map((nombre) => ({ nombre, grupo: grupoEtiquetas })),
  }

  // Las que aún no existen viajan como marcador: `aplicarImportacion` las crea
  // y sustituye el marcador por el id real, ya dentro de la transacción.
  const idDe = (nombre: string): string =>
    porNombre.get(normalizarNombre(nombre)) ?? marcadorEtiquetaNueva(nombre)

  for (const fila of filas) {
    const resolucion = resolucionDe(fila.indice)
    if (resolucion === 'omitir') continue

    const etiquetaIds = fila.etiquetas.map(idDe)

    if (resolucion === 'crear') {
      plan.crear.push({
        nombre: fila.nombre,
        cantidad: fila.cantidad,
        cantidadInservible: fila.cantidadInservible,
        estado: fila.estado,
        ubicacion: fila.ubicacion,
        notas: fila.notas,
        etiquetaIds,
      })
      continue
    }

    const materialId = duplicados.get(fila.indice)?.materialId
    const existente = materialId ? porId.get(materialId) : undefined
    if (!existente) continue
    const campos = fusionarCampos(existente, fila, etiquetaIds)
    plan.fusionar.push({ id: existente.id, campos: campos as Partial<DatosMaterial> })
  }

  return plan
}
