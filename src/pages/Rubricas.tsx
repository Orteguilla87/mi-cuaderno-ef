import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardPaste, Copy, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { crearRubrica, duplicarRubrica } from '../db/cuaderno'
import { db, nuevoId } from '../db/db'
import type { CriterioRubrica, NivelRubrica, Rubrica } from '../db/types'
import { navegar } from '../lib/router'
import { parsearTablaRubrica, type TablaRubricaImportada } from '../lib/rubricaTabla'
import { useUI } from '../store/ui'

export function Rubricas() {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [editando, setEditando] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [importando, setImportando] = useState(false)

  const rubricas = useLiveQuery(async () => {
    const lista = await db.rubricas.toArray()
    return lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
  }, [])

  async function crear() {
    const id = await crearRubrica(titulo || 'Rúbrica sin título')
    setTitulo('')
    setEditando(id)
  }

  async function crearDesdeTabla(tabla: TablaRubricaImportada) {
    const id = await crearRubrica(titulo || 'Rúbrica sin título')
    await aplicarTablaImportada(id, tabla)
    setTitulo('')
    setImportando(false)
    setEditando(id)
  }

  async function eliminar(r: Rubrica) {
    const enUso = await db.columnas.where('rubricaId').equals(r.id).count()
    if (enUso > 0) {
      mostrarAviso(`«${r.titulo}» se usa en ${enUso} columnas: quítala de ellas primero`)
      return
    }
    await db.rubricas.delete(r.id)
    mostrarAviso(`«${r.titulo}» eliminada`, async () => {
      await db.rubricas.add(r)
    })
  }

  return (
    <>
      <Cabecera
        titulo="Rúbricas"
        atras
        subtitulo={rubricas ? `${rubricas.length} en el banco` : undefined}
      />

      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          <input
            className="campo flex-1"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void crear()}
            placeholder="Nombre de la rúbrica"
            aria-label="Nombre de la nueva rúbrica"
          />
          <button className="btn-primario px-4" onClick={() => void crear()}>
            <Plus size={20} aria-hidden />
          </button>
        </div>

        <button className="btn-suave w-full" onClick={() => setImportando(true)}>
          <ClipboardPaste size={18} aria-hidden />
          Importar tabla (CSV o pegado de Excel)
        </button>

        {rubricas?.length === 0 && (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Sin rúbricas todavía</p>
            <p className="mt-1 text-sm texto-suave">
              Crea una y úsala como columna en el cuaderno de cualquier grupo.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {rubricas?.map((r) => (
            <li key={r.id} className="tarjeta py-3">
              <div className="flex items-center gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditando(r.id)}>
                  <span className="block truncate text-base font-bold">{r.titulo}</span>
                  <span className="cifra mt-0.5 block text-sm texto-suave">
                    {r.criterios.length} criterios · {r.niveles.length} niveles
                  </span>
                </button>
                <button
                  onClick={() => void duplicarRubrica(r.id)}
                  className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                  aria-label={`Duplicar ${r.titulo}`}
                >
                  <Copy size={18} aria-hidden />
                </button>
                <button
                  onClick={() => void eliminar(r)}
                  className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                  aria-label={`Eliminar ${r.titulo}`}
                >
                  <Trash2 size={18} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button className="btn-suave w-full" onClick={() => navegar('/cuaderno')}>
          Ir al cuaderno
        </button>
      </div>

      <HojaEditarRubrica rubricaId={editando} onCerrar={() => setEditando(null)} />

      <HojaImportarTabla
        abierta={importando}
        onCerrar={() => setImportando(false)}
        onImportar={crearDesdeTabla}
      />
    </>
  )
}

/** Aplica una tabla importada sobre una rúbrica ya existente, con ids nuevos. */
async function aplicarTablaImportada(rubricaId: string, tabla: TablaRubricaImportada) {
  const niveles: NivelRubrica[] = tabla.niveles.map((n) => ({
    id: nuevoId(),
    etiqueta: n.etiqueta,
    valor: n.valor,
  }))
  const criterios: CriterioRubrica[] = tabla.criterios.map((c) => ({
    id: nuevoId(),
    titulo: c.titulo,
    pesoPct: 0,
    descripciones: Object.fromEntries(
      c.descripciones.map((texto, i) => [niveles[i]?.id, texto]).filter(([, t]) => t),
    ),
  }))
  await db.rubricas.update(rubricaId, { niveles, criterios })
}

/** Pegar una tabla (CSV o copiado de Excel/Sheets) para crear o sustituir una rúbrica. */
function HojaImportarTabla({
  abierta,
  rubricaActual,
  onCerrar,
  onImportar,
}: {
  abierta: boolean
  /** Si se pasa, sustituye esta rúbrica en vez de crear una nueva. */
  rubricaActual?: Rubrica
  onCerrar: () => void
  onImportar: (tabla: TablaRubricaImportada) => void | Promise<void>
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<TablaRubricaImportada | null>(null)
  const [error, setError] = useState<string | null>(null)

  function analizar(valor: string) {
    setTexto(valor)
    setError(null)
    setPrevia(null)
    if (!valor.trim()) return
    try {
      setPrevia(parsearTablaRubrica(valor))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido leer la tabla.')
    }
  }

  async function confirmar() {
    if (!previa) return
    await onImportar(previa)
    setTexto('')
    setPrevia(null)
    if (rubricaActual) mostrarAviso(`«${rubricaActual.titulo}» actualizada desde la tabla`)
  }

  return (
    <Hoja
      abierta={abierta}
      titulo={rubricaActual ? `Pegar tabla en «${rubricaActual.titulo}»` : 'Importar rúbrica desde tabla'}
      onCerrar={onCerrar}
    >
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="tabla-rubrica">
            Tabla
          </label>
          <textarea
            id="tabla-rubrica"
            className="campo h-40 resize-none py-2 font-mono text-xs"
            value={texto}
            onChange={(e) => analizar(e.target.value)}
            placeholder={'Criterio\tNo conseguido\tEn proceso\tConseguido\nEquilibrio\tSe cae\tDuda\tFirme'}
          />
          <p className="mt-1 text-xs texto-suave">
            Pega desde Excel/Sheets (columnas = niveles) o CSV. Primera celda de cada fila de
            niveles con «:valor» para fijar la nota; si no, se reparte 2, 4, 6… hasta 10.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-acento/40 bg-acento/10 p-3 text-sm text-acento">
            {error}
          </div>
        )}

        {previa && (
          <div className="panel-agua space-y-1 text-sm">
            <p className="font-bold">
              {previa.criterios.length} criterios · {previa.niveles.length} niveles
            </p>
            <p className="texto-suave">
              Niveles: {previa.niveles.map((n) => `${n.etiqueta} (${n.valor})`).join(', ')}
            </p>
            {rubricaActual && (
              <p className="font-semibold text-acento">
                Sustituye por completo los criterios y niveles actuales de «{rubricaActual.titulo}».
              </p>
            )}
          </div>
        )}

        <button
          className="btn-primario w-full"
          onClick={() => void confirmar()}
          disabled={!previa}
        >
          {rubricaActual ? 'Sustituir' : 'Crear rúbrica'}
        </button>
      </div>
    </Hoja>
  )
}

/** Editor de la rúbrica en tabla: filas = criterios, columnas = niveles. */
export function HojaEditarRubrica({
  rubricaId,
  onCerrar,
}: {
  rubricaId: string | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [importando, setImportando] = useState(false)
  const rubrica = useLiveQuery(
    async () => (rubricaId ? db.rubricas.get(rubricaId) : undefined),
    [rubricaId],
  )

  if (!rubricaId || !rubrica) return null

  const actualizar = (cambios: Partial<Rubrica>) => void db.rubricas.update(rubricaId, cambios)

  async function importarSobreEsta(tabla: TablaRubricaImportada) {
    const antes = { niveles: rubrica!.niveles, criterios: rubrica!.criterios }
    await aplicarTablaImportada(rubricaId!, tabla)
    setImportando(false)
    mostrarAviso('Tabla importada', async () => {
      await db.rubricas.update(rubricaId!, antes)
    })
  }

  function anadirNivel() {
    actualizar({
      niveles: [
        ...rubrica!.niveles,
        {
          id: nuevoId(),
          etiqueta: 'Nuevo nivel',
          // Continúa la progresión existente en vez de empezar de cero.
          valor: Math.max(0, ...rubrica!.niveles.map((x) => x.valor)) + 2,
        },
      ],
    })
  }

  function anadirCriterio() {
    actualizar({
      criterios: [
        ...rubrica!.criterios,
        { id: nuevoId(), titulo: `Criterio ${rubrica!.criterios.length + 1}`, pesoPct: 0 },
      ],
    })
  }

  const sumaPesos = rubrica.criterios.reduce((n, c) => n + c.pesoPct, 0)

  return (
    <>
      <Hoja abierta={!!rubricaId} titulo="Editar rúbrica" onCerrar={onCerrar}>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="campo flex-1"
              value={rubrica.titulo}
              onChange={(e) => actualizar({ titulo: e.target.value })}
              aria-label="Título de la rúbrica"
            />
            <button
              className="btn-suave px-3"
              onClick={() => setImportando(true)}
              aria-label="Pegar tabla sobre esta rúbrica"
            >
              <ClipboardPaste size={18} aria-hidden />
            </button>
          </div>

          <p className="text-xs texto-suave">
            El valor de cada nivel es su nota (2, 4, 6, 8, 10…): es lo que se ve siempre al
            evaluar y lo que se usa para promediar.
          </p>

          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-max border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[150px] border-b-2 border-r border-borde bg-agua-claro px-2 py-2 text-left text-xs font-bold uppercase text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua">
                    Criterio
                  </th>
                  {rubrica.niveles.map((n, i) => (
                    <th
                      key={n.id}
                      className="min-w-[130px] border-b-2 border-r border-borde bg-agua-claro p-1.5 dark:border-noche-borde dark:bg-noche-elevada"
                    >
                      <div className="flex items-center gap-1">
                        <input
                          className="campo px-1.5 py-1 text-xs"
                          value={n.etiqueta}
                          onChange={(e) => {
                            const niveles = [...rubrica.niveles]
                            niveles[i] = { ...n, etiqueta: e.target.value }
                            actualizar({ niveles })
                          }}
                          aria-label={`Etiqueta del nivel ${i + 1}`}
                        />
                        <button
                          onClick={() =>
                            actualizar({ niveles: rubrica.niveles.filter((x) => x.id !== n.id) })
                          }
                          disabled={rubrica.niveles.length <= 2}
                          className="shrink-0 text-tinta-tenue disabled:opacity-30"
                          aria-label={`Quitar nivel ${n.etiqueta}`}
                        >
                          <X size={16} aria-hidden />
                        </button>
                      </div>
                      <input
                        type="number"
                        className="campo cifra mt-1 px-1.5 py-1 text-center text-xs font-bold"
                        value={n.valor}
                        onChange={(e) => {
                          const niveles = [...rubrica.niveles]
                          niveles[i] = { ...n, valor: Number(e.target.value) }
                          actualizar({ niveles })
                        }}
                        aria-label={`Valor (nota) del nivel ${i + 1}`}
                      />
                    </th>
                  ))}
                  <th className="min-w-[56px] border-b-2 border-borde bg-agua-claro p-1 dark:border-noche-borde dark:bg-noche-elevada">
                    <button
                      onClick={anadirNivel}
                      className="flex h-full w-full items-center justify-center text-primario-oscuro dark:text-agua"
                      aria-label="Añadir nivel"
                    >
                      <Plus size={18} aria-hidden />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rubrica.criterios.map((c, i) => (
                  <tr key={c.id}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 min-w-[150px] border-b border-r border-borde bg-superficie p-1.5 text-left dark:border-noche-borde dark:bg-noche-superficie"
                    >
                      <div className="flex items-center gap-1">
                        <input
                          className="campo px-1.5 py-1 text-xs font-semibold"
                          value={c.titulo}
                          onChange={(e) => {
                            const criterios = [...rubrica.criterios]
                            criterios[i] = { ...c, titulo: e.target.value }
                            actualizar({ criterios })
                          }}
                          aria-label={`Título del criterio ${i + 1}`}
                        />
                        <button
                          onClick={() =>
                            actualizar({
                              criterios: rubrica.criterios.filter((x) => x.id !== c.id),
                            })
                          }
                          disabled={rubrica.criterios.length <= 1}
                          className="shrink-0 text-tinta-tenue disabled:opacity-30"
                          aria-label={`Quitar criterio ${c.titulo}`}
                        >
                          <X size={16} aria-hidden />
                        </button>
                      </div>
                      <input
                        type="number"
                        className="campo cifra mt-1 px-1.5 py-1 text-xs"
                        value={c.pesoPct}
                        onChange={(e) => {
                          const criterios = [...rubrica.criterios]
                          criterios[i] = { ...c, pesoPct: Number(e.target.value) }
                          actualizar({ criterios })
                        }}
                        aria-label={`Peso del criterio ${i + 1} en porcentaje`}
                        placeholder="Peso %"
                      />
                    </th>
                    {rubrica.niveles.map((n) => (
                      <td
                        key={n.id}
                        className="border-b border-r border-borde p-1.5 align-top dark:border-noche-borde"
                      >
                        <textarea
                          className="campo h-16 resize-none px-1.5 py-1 text-xs"
                          value={c.descripciones?.[n.id] ?? ''}
                          onChange={(e) => {
                            const criterios = [...rubrica.criterios]
                            criterios[i] = {
                              ...c,
                              descripciones: { ...c.descripciones, [n.id]: e.target.value },
                            }
                            actualizar({ criterios })
                          }}
                          placeholder="Descriptor"
                        />
                      </td>
                    ))}
                    <td className="border-b border-borde dark:border-noche-borde" />
                  </tr>
                ))}
                <tr>
                  <th className="sticky left-0 z-10 border-r border-borde bg-superficie p-1.5 dark:border-noche-borde dark:bg-noche-superficie">
                    <button
                      onClick={anadirCriterio}
                      className="flex w-full items-center justify-center gap-1 text-xs font-bold text-primario dark:text-agua"
                    >
                      <Plus size={16} aria-hidden />
                      Criterio
                    </button>
                  </th>
                  <td colSpan={rubrica.niveles.length + 1} />
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs texto-suave">
            Los pesos suman {sumaPesos}%.{' '}
            {sumaPesos === 0
              ? 'Con todos a 0, los criterios pesan por igual.'
              : sumaPesos !== 100 && 'No tienen por qué sumar 100: se reparten proporcionalmente.'}
          </p>

          <button className="btn-primario w-full" onClick={onCerrar}>
            Hecho
          </button>
        </div>
      </Hoja>

      <HojaImportarTabla
        abierta={importando}
        rubricaActual={rubrica}
        onCerrar={() => setImportando(false)}
        onImportar={importarSobreEsta}
      />
    </>
  )
}
