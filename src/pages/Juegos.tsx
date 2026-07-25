import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { db } from '../db/db'
import {
  analizarJuegos,
  anadirAlBanco,
  buscarJuegos,
  facetas,
  reemplazarBanco,
  type ResultadoImportacion,
} from '../db/juegos'
import type { Juego } from '../db/types'
import { useUI } from '../store/ui'

export function Juegos({
  onElegir,
  seleccionados,
}: {
  /** Si se pasa, la pantalla actúa como selector para una sesión. */
  onElegir?: (juego: Juego) => void
  seleccionados?: Set<string>
}) {
  const [consulta, setConsulta] = useState('')
  const [etiqueta, setEtiqueta] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [detalle, setDetalle] = useState<Juego | null>(null)

  const juegos = useLiveQuery(() => db.juegos.toArray(), [])

  const { etiquetas } = useMemo(() => facetas(juegos ?? []), [juegos])

  const visibles = useMemo(() => {
    let lista = juegos ?? []
    if (etiqueta) lista = lista.filter((j) => j.etiquetas.includes(etiqueta))
    lista = buscarJuegos(lista, consulta)
    // Fuse ya devuelve por relevancia; sin consulta, alfabético.
    return consulta.trim() ? lista : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [juegos, consulta, etiqueta])

  const vacio = (juegos?.length ?? 0) === 0

  return (
    <>
      {!onElegir && (
        <Cabecera
          titulo="Banco de juegos"
          atras
          subtitulo={juegos ? `${juegos.length} juegos` : undefined}
          acciones={
            <button className="btn-suave" onClick={() => setImportando(true)}>
              Importar
            </button>
          }
        />
      )}

      <div className="space-y-4 p-4">
        {vacio ? (
          <div className="tarjeta text-center">
            <Download className="mx-auto text-tinta-tenue" size={32} aria-hidden />
            <p className="mt-2 text-base font-semibold">El banco está vacío</p>
            <p className="mt-1 text-sm texto-suave">
              Importa tu JSON de juegos: se reconocen los nombres de campo más habituales y los
              que no, se conservan igualmente.
            </p>
            <button className="btn-primario mt-4 w-full" onClick={() => setImportando(true)}>
              Importar juegos
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-tenue"
                aria-hidden
              />
              <input
                className="campo pl-10"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Buscar juego, material, etiqueta"
                aria-label="Buscar juegos"
              />
            </div>

            {etiquetas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setEtiqueta(null)}
                  aria-pressed={etiqueta === null}
                  className={
                    'pildora min-h-[40px] px-3 ' +
                    (etiqueta === null
                      ? 'bg-primario text-white'
                      : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                  }
                >
                  Todas
                </button>
                {etiquetas.map((t) => (
                  <button
                    key={t}
                    onClick={() => setEtiqueta(etiqueta === t ? null : t)}
                    aria-pressed={etiqueta === t}
                    className={
                      'pildora min-h-[40px] px-3 ' +
                      (etiqueta === t
                        ? 'bg-primario text-white'
                        : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            <p className="cifra text-xs texto-suave">
              {visibles.length} de {juegos?.length} juegos
            </p>

            <ul className="space-y-2">
              {visibles.map((j) => (
                <li key={j.id}>
                  <div className="tarjeta flex items-center gap-2 py-3">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setDetalle(j)}
                    >
                      <span className="block truncate text-base font-bold">{j.nombre}</span>
                      <span className="mt-0.5 block truncate text-sm texto-suave">
                        {[j.espacio, j.agrupamiento, j.material?.join(', ')]
                          .filter(Boolean)
                          .join(' · ') || 'Sin detalles'}
                      </span>
                    </button>

                    {onElegir && (
                      <button
                        onClick={() => onElegir(j)}
                        disabled={seleccionados?.has(j.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primario text-white disabled:opacity-40"
                        aria-label={`Añadir ${j.nombre} a la sesión`}
                      >
                        <Plus size={20} strokeWidth={3} aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <HojaImportarJuegos abierta={importando} onCerrar={() => setImportando(false)} />

      <Hoja
        abierta={!!detalle}
        titulo={detalle?.nombre ?? ''}
        onCerrar={() => setDetalle(null)}
      >
        {detalle && <DetalleJuego juego={detalle} onCerrar={() => setDetalle(null)} />}
      </Hoja>
    </>
  )
}

function DetalleJuego({ juego, onCerrar }: { juego: Juego; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)

  const filas: [string, string][] = [
    ['Descripción', juego.descripcion ?? ''],
    ['Material', juego.material?.join(', ') ?? ''],
    ['Espacio', juego.espacio ?? ''],
    ['Agrupamiento', juego.agrupamiento ?? ''],
    ['Intensidad', juego.intensidad ?? ''],
    ['Edades', juego.edades?.join(', ') ?? ''],
  ]

  async function borrar() {
    await db.juegos.delete(juego.id)
    onCerrar()
    mostrarAviso(`«${juego.nombre}» eliminado del banco`, async () => {
      await db.juegos.add(juego)
    })
  }

  return (
    <div className="space-y-4">
      <dl className="space-y-2">
        {filas
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="etiqueta mb-0">{k}</dt>
              <dd className="text-sm">{v}</dd>
            </div>
          ))}
      </dl>

      {juego.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {juego.etiquetas.map((t) => (
            <span
              key={t}
              className="pildora bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {juego.extra && (
        <details className="rounded-xl border border-borde p-2 text-xs dark:border-noche-borde">
          <summary className="cursor-pointer font-bold">Campos del origen</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap texto-suave">
            {JSON.stringify(juego.extra, null, 2)}
          </pre>
        </details>
      )}

      <button className="btn-peligro w-full" onClick={() => void borrar()}>
        <Trash2 size={18} aria-hidden />
        Quitar del banco
      </button>
    </div>
  )
}

function HojaImportarJuegos({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null)

  function analizar(valor: string) {
    setJson(valor)
    setError(null)
    setPrevia(null)
    if (!valor.trim()) return
    try {
      setPrevia(analizarJuegos(valor))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON no válido')
    }
  }

  async function confirmar(modo: 'reemplazar' | 'anadir') {
    if (!previa) return
    const deshacer =
      modo === 'reemplazar'
        ? await reemplazarBanco(previa.juegos)
        : await anadirAlBanco(previa.juegos)
    const n = previa.juegos.length
    setJson('')
    setPrevia(null)
    onCerrar()
    mostrarAviso(`${n} juegos importados`, deshacer)
  }

  return (
    <Hoja abierta={abierta} titulo="Importar juegos" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="json-juegos">
            JSON del banco
          </label>
          <textarea
            id="json-juegos"
            className="campo h-40 resize-none py-2 font-mono text-xs"
            value={json}
            onChange={(e) => analizar(e.target.value)}
            placeholder='[{"nombre": "Pilla-pilla", "material": ["petos"], "etiquetas": ["calentamiento"]}]'
          />
          <p className="mt-1 text-xs texto-suave">
            Admite una lista suelta o un objeto con <code>GAMES</code>, <code>games</code> o{' '}
            <code>juegos</code>. Todo se queda en el dispositivo.
          </p>
        </div>

        {error && (
          <div className="aviso-fuerte">{error}</div>
        )}

        {previa && (
          <div className="panel-agua space-y-2 text-sm">
            <p className="font-bold">
              {previa.juegos.length} juegos listos para importar
            </p>
            {previa.descartados > 0 && (
              <p className="texto-suave">
                {previa.descartados} entradas descartadas por no tener nombre.
              </p>
            )}
            {previa.camposNoReconocidos.length > 0 && (
              <p className="texto-suave">
                Campos conservados sin mapear: {previa.camposNoReconocidos.join(', ')}.
              </p>
            )}
            <ul className="mt-2 space-y-1">
              {previa.juegos.slice(0, 5).map((j) => (
                <li key={j.id} className="truncate font-semibold">
                  · {j.nombre}
                </li>
              ))}
              {previa.juegos.length > 5 && (
                <li className="texto-suave">y {previa.juegos.length - 5} más…</li>
              )}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn-suave"
            onClick={() => void confirmar('anadir')}
            disabled={!previa || previa.juegos.length === 0}
          >
            Añadir
          </button>
          <button
            className="btn-primario"
            onClick={() => void confirmar('reemplazar')}
            disabled={!previa || previa.juegos.length === 0}
          >
            Reemplazar banco
          </button>
        </div>
      </div>
    </Hoja>
  )
}
