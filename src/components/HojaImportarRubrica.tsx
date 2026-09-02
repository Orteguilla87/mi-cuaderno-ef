/**
 * Importar una rúbrica pegando la tabla desde Excel/Sheets o un CSV.
 *
 * Todo lo que se ve aquí es PREVIA: no se escribe nada hasta confirmar. Lo que
 * el parser no ha sabido leer se enseña marcado en vez de rellenarse a ojo, y
 * lo que ha deducido —qué columna es cada cosa, el valor de cada nivel, el peso
 * de cada fila— se puede corregir antes de crear la rúbrica.
 *
 * El criterio del decreto NO se elige aquí: la referencia («2.2.a») viaja con
 * cada fila, pero «2.2» es un criterio distinto en cada ciclo y el banco de
 * rúbricas no tiene curso. El vínculo se sugiere después, al usar la rúbrica en
 * una columna del cuaderno, que es donde se sabe de qué grupo se trata.
 */

import { AlertTriangle, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  analizarTabla,
  DELIMITADORES,
  ESCALA_APP,
  ETIQUETA_DESTINO,
  type Delimitador,
  type DestinoColumna,
  type FilaImportada,
  type NivelImportado,
  type TablaRubricaImportada,
} from '../lib/rubricaTabla'
import { Campo, CampoArea } from './Campo'
import { Hoja } from './Hoja'
import { TituloSeccion } from './TituloSeccion'

export interface PlanRubrica {
  niveles: NivelImportado[]
  filas: FilaImportada[]
}

const NOMBRE_DELIMITADOR: Record<Delimitador, string> = {
  '\t': 'Tabulador (Excel/Sheets)',
  ';': 'Punto y coma',
  ',': 'Coma',
}

const DESTINOS: DestinoColumna[] = ['indicador', 'peso', 'nivel', 'ignorar']

const EJEMPLO = [
  'Indicador\tPeso\t10\t8\t6\t4\t2',
  '2.2.a · Cambia de dirección para escapar\t40 %\tDe forma anticipada y eficaz\tNivel intermedio entre 10 y 6\tEn una ocasión puntual\tNivel intermedio entre 6 y 2\tMantiene siempre la misma carrera',
].join('\n')

export function HojaImportarRubrica({
  abierta,
  onCerrar,
  onImportar,
}: {
  abierta: boolean
  onCerrar: () => void
  onImportar: (plan: PlanRubrica) => void | Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [delimitador, setDelimitador] = useState<Delimitador | 'auto'>('auto')
  const [filaCabecera, setFilaCabecera] = useState(0)
  const [conservarRelleno, setConservarRelleno] = useState(false)
  // Correcciones del usuario sobre lo que dedujo el parser. Se guardan aparte y
  // se aplican encima del análisis para que cambiar el texto no las pierda.
  const [mapeo, setMapeo] = useState<DestinoColumna[] | null>(null)
  const [valores, setValores] = useState<Record<number, number>>({})
  const [pesos, setPesos] = useState<Record<number, number | undefined>>({})
  const [descartadas, setDescartadas] = useState<Set<number>>(new Set())

  const analisis = useMemo<
    { tabla: TablaRubricaImportada; error: null } | { tabla: null; error: string | null }
  >(() => {
    if (!texto.trim()) return { tabla: null, error: null }
    try {
      return {
        tabla: analizarTabla(texto, {
          delimitador: delimitador === 'auto' ? undefined : delimitador,
          filaCabecera,
          mapeo: mapeo ?? undefined,
          conservarRelleno,
        }),
        error: null,
      }
    } catch (e) {
      return { tabla: null, error: e instanceof Error ? e.message : 'No se ha podido leer la tabla.' }
    }
  }, [texto, delimitador, filaCabecera, mapeo, conservarRelleno])

  const tabla = analisis.tabla

  function reiniciarCorrecciones() {
    setMapeo(null)
    setValores({})
    setPesos({})
    setDescartadas(new Set())
  }

  function cambiarTexto(v: string) {
    setTexto(v)
    reiniciarCorrecciones()
  }

  const niveles: NivelImportado[] = (tabla?.niveles ?? []).map((n, i) => ({
    ...n,
    valor: valores[i] ?? n.valor,
  }))

  const filas: FilaImportada[] = (tabla?.filas ?? [])
    .filter((f) => !descartadas.has(f.indice))
    .map((f) => (f.indice in pesos ? { ...f, pesoPct: pesos[f.indice] } : f))

  const conPeso = filas.filter((f) => f.pesoPct !== undefined)
  const sumaPesos = conPeso.length
    ? Math.round(conPeso.reduce((s, f) => s + (f.pesoPct ?? 0), 0) * 100) / 100
    : undefined

  const valoresRepetidos = new Set(niveles.map((n) => n.valor)).size !== niveles.length
  const escalaNoEstandar =
    niveles.length !== ESCALA_APP.length || niveles.some((n, i) => n.valor !== ESCALA_APP[i])
  const rellenos = filas.reduce((s, f) => s + f.rellenos, 0)
  const sinReferencia = filas.filter((f) => !f.referencia).length
  const sinPeso = filas.filter((f) => f.pesoPct === undefined).length

  async function confirmar() {
    if (!tabla || filas.length === 0 || valoresRepetidos) return
    await onImportar({ niveles, filas })
    setTexto('')
    reiniciarCorrecciones()
  }

  return (
    <Hoja abierta={abierta} titulo="Importar rúbrica desde tabla" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="tabla-rubrica">
            Pega aquí la tabla
          </label>
          <CampoArea
            id="tabla-rubrica"
            className="campo h-40 resize-none py-2 font-mono text-xs"
            valor={texto}
            onValor={cambiarTexto}
            placeholder={EJEMPLO}
          />
          <p className="mt-1 text-xs texto-suave">
            Desde Excel/Sheets (Ctrl+C sobre las celdas) o un CSV. Se reconocen tabulador, punto y
            coma y coma, y los descriptores largos entrecomillados con saltos de línea dentro.
          </p>
        </div>

        {analisis.error && <div className="aviso-fuerte">{analisis.error}</div>}

        {tabla && (
          <>
            <TituloSeccion>Cómo se ha leído</TituloSeccion>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="etiqueta">Separador</span>
                <select
                  className="campo text-sm"
                  value={delimitador}
                  onChange={(e) => {
                    setDelimitador(e.target.value as Delimitador | 'auto')
                    reiniciarCorrecciones()
                  }}
                >
                  <option value="auto">Automático ({NOMBRE_DELIMITADOR[tabla.delimitador]})</option>
                  {DELIMITADORES.map((d) => (
                    <option key={d} value={d}>
                      {NOMBRE_DELIMITADOR[d]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="etiqueta">Fila de cabecera</span>
                <select
                  className="campo text-sm"
                  value={filaCabecera}
                  onChange={(e) => {
                    setFilaCabecera(Number(e.target.value))
                    reiniciarCorrecciones()
                  }}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <option key={i} value={i}>
                      {i + 1}.ª fila con datos
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="etiqueta">Qué es cada columna</span>
              <ul className="space-y-1.5">
                {tabla.cabecera.map((nombre, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm" title={nombre}>
                      {nombre.trim() || `Columna ${i + 1}`}
                    </span>
                    <select
                      className="campo w-32 shrink-0 text-sm"
                      value={tabla.mapeo[i]}
                      aria-label={`Destino de la columna ${nombre.trim() || i + 1}`}
                      onChange={(e) => {
                        const nuevo = [...tabla.mapeo]
                        nuevo[i] = e.target.value as DestinoColumna
                        setMapeo(nuevo)
                        setValores({})
                      }}
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
            </div>

            <div>
              <span className="etiqueta">Niveles, de mayor a menor</span>
              <ul className="space-y-1.5">
                {niveles.map((n, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{n.etiqueta}</span>
                    <select
                      className="campo cifra w-24 shrink-0 text-sm"
                      value={n.valor}
                      aria-label={`Valor del nivel ${n.etiqueta}`}
                      onChange={(e) => setValores({ ...valores, [i]: Number(e.target.value) })}
                    >
                      {[...new Set([...ESCALA_APP, n.valor])]
                        .sort((a, b) => b - a)
                        .map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </li>
                ))}
              </ul>
              {escalaNoEstandar && (
                <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-acento">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  Estos valores no son la escala de la app (10, 8, 6, 4, 2). Revisa cada nivel antes
                  de importar: no se convierte nada a ciegas.
                </p>
              )}
              {valoresRepetidos && (
                <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-acento">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  Hay dos niveles con el mismo valor. Cámbialos para poder importar.
                </p>
              )}
            </div>

            <TituloSeccion>
              {filas.length} {filas.length === 1 ? 'indicador' : 'indicadores'}
            </TituloSeccion>

            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-hueso p-1.5 text-left dark:bg-noche-fondo">
                      Indicador
                    </th>
                    <th className="p-1.5 text-left">Peso</th>
                    {niveles.map((n, i) => (
                      <th key={i} className="cifra p-1.5 text-left">
                        {n.valor}
                      </th>
                    ))}
                    <th className="p-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {tabla.filas.map((f) => {
                    const fuera = descartadas.has(f.indice)
                    const peso = f.indice in pesos ? pesos[f.indice] : f.pesoPct
                    return (
                      <tr key={f.indice} className={fuera ? 'opacity-40' : undefined}>
                        <td className="sticky left-0 z-10 max-w-[14rem] bg-hueso p-1.5 align-top dark:bg-noche-fondo">
                          {f.referencia ? (
                            <span className="pildora mr-1 bg-agua-claro px-1.5 py-0.5 text-[11px] font-bold text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                              {f.referencia}
                            </span>
                          ) : (
                            <span className="mr-1 text-[11px] font-semibold texto-suave">
                              sin ref.
                            </span>
                          )}
                          {f.titulo}
                        </td>
                        <td className="p-1.5 align-top">
                          <Campo
                            className="campo cifra h-9 w-20 px-2 text-xs"
                            valor={peso === undefined ? '' : String(peso)}
                            onValor={(v) => {
                              const limpio = v.replace('%', '').trim().replace(',', '.')
                              const n = limpio === '' ? undefined : Number(limpio)
                              setPesos({
                                ...pesos,
                                [f.indice]: n === undefined || Number.isNaN(n) ? undefined : n,
                              })
                            }}
                            placeholder="—"
                            aria-label={`Peso de ${f.titulo}`}
                          />
                        </td>
                        {niveles.map((_, i) => (
                          <td key={i} className="max-w-[12rem] p-1.5 align-top texto-suave">
                            {f.descripciones[i] || (
                              <span className="text-[11px] italic">vacío</span>
                            )}
                          </td>
                        ))}
                        <td className="p-1.5 align-top">
                          <button
                            className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                            aria-label={fuera ? `Recuperar ${f.titulo}` : `Descartar ${f.titulo}`}
                            onClick={() => {
                              const nuevo = new Set(descartadas)
                              if (fuera) nuevo.delete(f.indice)
                              else nuevo.add(f.indice)
                              setDescartadas(nuevo)
                            }}
                          >
                            {fuera ? <Undo2 size={16} aria-hidden /> : <span aria-hidden>×</span>}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="panel-agua space-y-1 text-xs">
              <p className="font-bold">
                {sumaPesos === undefined
                  ? 'Ninguna fila trae peso: los indicadores pesarán por igual.'
                  : `Los pesos suman ${sumaPesos} %.`}
              </p>
              {sumaPesos !== undefined && sumaPesos !== 100 && (
                <p className="flex items-start gap-1.5 font-semibold text-acento">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  No suman 100 %. Se puede importar igual: los pesos se reparten
                  proporcionalmente.
                </p>
              )}
              {sinPeso > 0 && sumaPesos !== undefined && (
                <p className="texto-suave">
                  {sinPeso} {sinPeso === 1 ? 'fila entra' : 'filas entran'} sin peso reconocido.
                </p>
              )}
              {rellenos > 0 && (
                <p className="texto-suave">
                  {rellenos} {rellenos === 1 ? 'descriptor' : 'descriptores'} de relleno («Nivel
                  intermedio entre…») {rellenos === 1 ? 'se ha vaciado' : 'se han vaciado'}: al
                  calificar se verá solo la nota.
                </p>
              )}
              {sinReferencia > 0 && (
                <p className="texto-suave">
                  {sinReferencia} {sinReferencia === 1 ? 'indicador' : 'indicadores'} sin referencia
                  de criterio: {sinReferencia === 1 ? 'entra' : 'entran'} sin código.
                </p>
              )}
              {tabla.descartadas > 0 && (
                <p className="texto-suave">
                  {tabla.descartadas} {tabla.descartadas === 1 ? 'fila' : 'filas'} sin indicador,
                  descartadas.
                </p>
              )}
              <p className="texto-suave">
                El criterio del decreto se sugiere al usar la rúbrica en una columna, donde ya se
                sabe el ciclo del grupo. Aquí solo viaja el código.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-primario"
                checked={conservarRelleno}
                onChange={(e) => setConservarRelleno(e.target.checked)}
              />
              <span>
                Conservar los descriptores de relleno literalmente en vez de dejarlos vacíos.
              </span>
            </label>
          </>
        )}

        <button
          className="btn-primario w-full"
          onClick={() => void confirmar()}
          disabled={!tabla || filas.length === 0 || valoresRepetidos}
        >
          Crear rúbrica{filas.length > 0 ? ` con ${filas.length}` : ''}
          {filas.length > 0 && (filas.length === 1 ? ' indicador' : ' indicadores')}
        </button>
      </div>
    </Hoja>
  )
}
