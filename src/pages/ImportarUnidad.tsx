import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ClipboardPaste, Combine, Plus, Trash2, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Campo, CampoArea } from '../components/Campo'
import { TituloSeccion } from '../components/TituloSeccion'
import { db } from '../db/db'
import { buscarPorNombre, crearMaterial } from '../db/inventario'
import { importarUnidad } from '../db/planificador'
import type { Etapa } from '../db/types'
import {
  analizarTexto,
  fusionarSesiones,
  type ImportacionParseada,
  type SesionParseada,
} from '../lib/importarTexto'
import { terminologia } from '../lib/literales'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'
import { useVistaPlanificador } from '../store/vistaPlanificador'

/** Rótulo de cada patrón de corte, para poder juzgar el troceo en el paso 2. */
const NOMBRE_PATRON: Record<string, string> = {
  markdown: 'encabezado de markdown (#)',
  'sesion-n': '«Sesión N»',
  's-n': '«S1:», «S2:»…',
  mayusculas: 'línea en mayúsculas',
  numerada: 'línea numerada',
}

type Paso = 'pegar' | 'ambiguedad' | 'preview'

/**
 * Importación de una unidad pegando la programación como texto plano.
 *
 * El parser es determinista y vive en `lib/importarTexto.ts`: aquí no se
 * interpreta nada. Lo que sí se hace aquí es lo que el parser no puede hacer
 * solo —preguntar cuando el troceo es dudoso, y no dejar guardar una sesión sin
 * título—, porque nada se escribe en la base hasta que el preview se confirma.
 */
export function ImportarUnidad() {
  const [paso, setPaso] = useState<Paso>('pegar')
  const [texto, setTexto] = useState('')
  const [analisis, setAnalisis] = useState<ImportacionParseada | null>(null)
  const [sesiones, setSesiones] = useState<SesionParseada[]>([])
  const [tituloUnidad, setTituloUnidad] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('primaria')
  const [nivel, setNivel] = useState(1)
  const [guardando, setGuardando] = useState(false)

  const materiales = useLiveQuery(() => db.materiales.toArray(), [])
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const fijarVista = useVistaPlanificador((s) => s.fijarVista)

  const vocabulario = terminologia(etapa)

  function analizar() {
    const r = analizarTexto(texto)
    if (r.sesiones.length === 0) return
    setAnalisis(r)
    setSesiones(r.sesiones)
    setTituloUnidad(r.tituloUnidad ?? '')
    setPaso(r.ambiguo ? 'ambiguedad' : 'preview')
  }

  /** «Es una sola sesión»: se deshace el troceo fusionando todos los bloques. */
  function unificar() {
    if (!analisis) return
    setSesiones([analisis.sesiones.reduce((a, b) => fusionarSesiones(a, b))])
    setPaso('preview')
  }

  function cambiar(i: number, cambios: Partial<SesionParseada>) {
    setSesiones((lista) => lista.map((s, j) => (j === i ? { ...s, ...cambios } : s)))
  }

  function descartar(i: number) {
    setSesiones((lista) => lista.filter((_, j) => j !== i))
  }

  function fusionarConSiguiente(i: number) {
    setSesiones((lista) => [
      ...lista.slice(0, i),
      fusionarSesiones(lista[i], lista[i + 1]),
      ...lista.slice(i + 2),
    ])
  }

  // Un título vacío bloquea la importación: es el único identificador de la
  // sesión en los listados, y el parser no lo inventa por diseño.
  const sinTitulo = sesiones.some((s) => !(s.titulo ?? '').trim())
  const puedeImportar =
    sesiones.length > 0 && !sinTitulo && tituloUnidad.trim().length > 0 && !guardando

  /** Ítems de material que no están en el inventario, en todo lo que se va a importar. */
  const noEnInventario = useMemo(() => {
    if (!materiales) return []
    const fuera: string[] = []
    for (const s of sesiones) {
      for (const r of s.recursos) {
        if (!buscarPorNombre(materiales, r) && !fuera.includes(r)) fuera.push(r)
      }
    }
    return fuera
  }, [sesiones, materiales])

  async function importar() {
    if (!puedeImportar) return
    setGuardando(true)
    try {
      const comunes = {
        titulo: tituloUnidad,
        sesiones: sesiones.map((s) => ({
          titulo: (s.titulo ?? '').trim(),
          descripcion: s.descripcion,
          recursos: s.recursos,
          enlacesYNotas: s.enlacesYNotas,
        })),
      }
      const { deshacer } = await importarUnidad(
        etapa === 'infantil'
          ? { ...comunes, etapa: 'infantil' }
          : { ...comunes, etapa: 'primaria', nivel },
      )

      const cuantas = sesiones.length
      fijarVista('unidades')
      navegar('/planificador')
      mostrarAviso(
        `${vocabulario.unidad} «${tituloUnidad.trim()}» con ${cuantas} ${cuantas === 1 ? 'sesión' : 'sesiones'}`,
        deshacer,
      )
    } finally {
      setGuardando(false)
    }
  }

  async function anadirAlInventario(nombre: string) {
    await crearMaterial({ nombre, etiquetaIds: [] })
    mostrarAviso(`«${nombre}» añadido al inventario`)
  }

  return (
    <>
      <Cabecera titulo="Importar pegando texto" subtitulo="Programación en texto plano" atras />

      <div className="space-y-4 p-4">
        {paso === 'pegar' && (
          <>
            <div className="panel-agua text-sm">
              Pega aquí la programación tal como la tengas —Word, Drive, markdown o texto pelado—.
              Se analiza en el dispositivo, sin enviarla a ningún sitio, y no se guarda nada hasta
              que revises el resultado.
            </div>

            <div>
              <label className="etiqueta" htmlFor="texto-pegado">
                Texto de la programación
              </label>
              <CampoArea
                id="texto-pegado"
                className="campo h-72 resize-none py-2 text-sm"
                valor={texto}
                onValor={setTexto}
                placeholder={'Sesión 1: Familiarización\nBotar el balón…\nMaterial: 10 balones'}
              />
            </div>

            <button
              className="btn-primario w-full"
              onClick={analizar}
              disabled={!texto.trim()}
            >
              <Wand2 size={20} aria-hidden />
              Analizar
            </button>
          </>
        )}

        {paso === 'ambiguedad' && analisis && (
          <>
            <div className="tarjeta space-y-3">
              <p className="text-base font-bold">
                He encontrado {analisis.sesiones.length} bloques, pero no está claro qué son.
              </p>
              <p className="text-sm texto-suave">
                Los he separado por {NOMBRE_PATRON[analisis.sesiones[0].patronDeteccion ?? ''] ??
                  'el formato del texto'}
                , que tanto puede marcar sesiones distintas como apartados dentro de una misma
                sesión. Dilo tú, que no se decide solo.
              </p>

              <ul className="space-y-1">
                {analisis.sesiones.map((s, i) => (
                  <li key={i} className="rounded-xl bg-agua-claro px-3 py-2 text-sm dark:bg-noche-elevada">
                    <span className="font-semibold">{s.titulo ?? 'Sin título'}</span>
                    <span className="texto-suave">
                      {' · '}
                      {s.descripcion.split('\n')[0]?.slice(0, 60) || 'sin texto'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <button className="btn-primario w-full" onClick={() => setPaso('preview')}>
              Son {analisis.sesiones.length} sesiones distintas
            </button>
            <button className="btn-suave w-full" onClick={unificar}>
              Es una sola sesión con apartados
            </button>
          </>
        )}

        {paso === 'preview' && (
          <>
            <section>
              <TituloSeccion>Destino</TituloSeccion>

              <div className="tarjeta space-y-4">
                <div>
                  <label className="etiqueta" htmlFor="titulo-unidad">
                    Título de {vocabulario.unidadEnFrase}
                  </label>
                  <Campo
                    id="titulo-unidad"
                    className={'campo' + (tituloUnidad.trim() ? '' : ' ring-2 ring-acento')}
                    valor={tituloUnidad}
                    onValor={setTituloUnidad}
                    placeholder="Habilidades con móvil"
                  />
                </div>

                <div>
                  <span className="etiqueta">Etapa</span>
                  <div className="flex gap-2">
                    {(['primaria', 'infantil'] as const).map((e) => (
                      <button
                        key={e}
                        onClick={() => setEtapa(e)}
                        aria-pressed={etapa === e}
                        className={(etapa === e ? 'btn-primario' : 'btn-suave') + ' flex-1 px-0'}
                      >
                        {e === 'primaria' ? 'Primaria' : 'Infantil'}
                      </button>
                    ))}
                  </div>
                </div>

                {etapa === 'primaria' ? (
                  <div>
                    <span className="etiqueta">Nivel</span>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          onClick={() => setNivel(n)}
                          aria-pressed={nivel === n}
                          className={
                            (nivel === n ? 'btn-primario' : 'btn-suave') + ' min-w-tap flex-1 px-0'
                          }
                        >
                          {n}º
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs texto-suave">
                      Una importación es una sola unidad de un solo curso. Si el texto trae sesiones
                      de varios cursos, impórtalo una vez por curso.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm texto-suave">
                    2.º ciclo de Infantil: los criterios del Decreto 36/2022 son los mismos para 3,
                    4 y 5 años.
                  </p>
                )}

                <div className="panel-agua text-sm">
                  El trimestre, los criterios y si cuenta para la nota se completan al abrir{' '}
                  {vocabulario.unidadEnFrase}: el texto pegado no los trae y ponerlos por defecto
                  metería en el reparto de pesos algo que aún no has colocado.
                </div>
              </div>
            </section>

            <section>
              <TituloSeccion>
                {sesiones.length} {sesiones.length === 1 ? 'sesión' : 'sesiones'}
              </TituloSeccion>

              {sinTitulo && (
                <p className="mb-2 flex items-start gap-2 text-sm font-semibold text-acento">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
                  Falta algún título. No se inventan: es lo único que identifica la sesión en los
                  listados.
                </p>
              )}

              <ul className="space-y-3">
                {sesiones.map((s, i) => (
                  <li key={i} className="tarjeta space-y-3">
                    <div className="flex items-start gap-2">
                      <span className="cifra mt-2 shrink-0 text-sm font-bold texto-suave">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <label className="etiqueta" htmlFor={`titulo-${i}`}>
                          Título
                          {s.titulo && s.tituloProvisional && (
                            <span className="pildora ml-2 bg-aviso-claro px-2 py-0.5 text-xs font-semibold text-aviso-oscuro dark:bg-noche-elevada dark:text-aviso">
                              deducido
                            </span>
                          )}
                        </label>
                        <Campo
                          id={`titulo-${i}`}
                          className={
                            'campo' + ((s.titulo ?? '').trim() ? '' : ' ring-2 ring-acento')
                          }
                          valor={s.titulo ?? ''}
                          onValor={(v) => cambiar(i, { titulo: v, tituloProvisional: false })}
                          placeholder="Escribe el título"
                        />
                      </div>
                      <button
                        className="btn-suave mt-6 shrink-0 px-3"
                        onClick={() => descartar(i)}
                        aria-label={`Descartar la sesión ${i + 1}`}
                      >
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </div>

                    <div>
                      <label className="etiqueta" htmlFor={`desc-${i}`}>
                        Descripción
                      </label>
                      <CampoArea
                        id={`desc-${i}`}
                        className="campo h-32 resize-none py-2 text-sm"
                        valor={s.descripcion}
                        onValor={(v) => cambiar(i, { descripcion: v })}
                      />
                    </div>

                    <div>
                      <span className="etiqueta">Material</span>
                      {s.recursos.length === 0 ? (
                        <p className="text-sm texto-suave">Sin material en el texto.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {s.recursos.map((r) => {
                            const fuera = materiales && !buscarPorNombre(materiales, r)
                            return (
                              <li key={r}>
                                <button
                                  onClick={() =>
                                    cambiar(i, { recursos: s.recursos.filter((x) => x !== r) })
                                  }
                                  className={
                                    'pildora px-3 py-1 text-sm ' +
                                    (fuera
                                      ? 'bg-aviso-claro text-aviso-oscuro dark:bg-noche-elevada dark:text-aviso'
                                      : 'bg-lima/20 text-lima-oscuro dark:bg-lima/25 dark:text-lima')
                                  }
                                  aria-label={`Quitar ${r}`}
                                >
                                  {r}
                                  {fuera && ' · no está en el inventario'}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>

                    <div>
                      <label className="etiqueta" htmlFor={`enlaces-${i}`}>
                        Enlaces y notas
                      </label>
                      <CampoArea
                        id={`enlaces-${i}`}
                        className="campo h-16 resize-none py-2 text-sm"
                        valor={s.enlacesYNotas}
                        onValor={(v) => cambiar(i, { enlacesYNotas: v })}
                        placeholder="Uno por línea"
                      />
                    </div>

                    {i + 1 < sesiones.length && (
                      <button
                        className="btn-suave w-full text-sm"
                        onClick={() => fusionarConSiguiente(i)}
                      >
                        <Combine size={16} aria-hidden />
                        Unir con la siguiente
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {noEnInventario.length > 0 && (
              <section>
                <TituloSeccion>Material que no está en el inventario</TituloSeccion>
                <ul className="space-y-2">
                  {noEnInventario.map((nombre) => (
                    <li key={nombre} className="tarjeta flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{nombre}</span>
                      <button
                        className="btn-suave shrink-0 px-3 text-xs"
                        onClick={() => void anadirAlInventario(nombre)}
                      >
                        <Plus size={16} aria-hidden />
                        Añadir
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button
              className="btn-primario w-full"
              onClick={() => void importar()}
              disabled={!puedeImportar}
            >
              <ClipboardPaste size={20} aria-hidden />
              Importar {sesiones.length} {sesiones.length === 1 ? 'sesión' : 'sesiones'}
            </button>
          </>
        )}
      </div>
    </>
  )
}
