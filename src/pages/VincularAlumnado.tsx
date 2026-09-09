import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Check, Link2, X } from 'lucide-react'
import { useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { EstadoVacio } from '../components/EstadoVacio'
import { SelectorGrupo } from '../components/SelectorGrupo'
import { TituloSeccion } from '../components/TituloSeccion'
import { db } from '../db/db'
import { desvincular, vincular } from '../db/personas'
import type { Alumno } from '../db/types'
import { emparejar, resumir, type EstadoPropuesta, type Propuesta } from '../lib/vinculacion'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

/**
 * Asistente de vinculación: decir que la ficha de «4º EF» y la de «4º Lengua»
 * son el mismo niño.
 *
 * ——— REGLA DURA: NUNCA SE VINCULA SOLO ———
 *
 * La app propone; vincula el usuario. Dos alumnos pueden llamarse igual, y el
 * mismo alumno estar escrito distinto en cada lista, así que un emparejamiento
 * automático mezclaría en silencio los datos de dos niños. Por eso:
 *
 *  - Cada propuesta enseña los DOS nombres completos tal como están escritos,
 *    no el normalizado con el que se comparó.
 *  - Las ambiguas —dos o más candidatos— no traen a nadie elegido y hay que
 *    resolverlas una a una.
 *  - «Vincular las exactas» existe, pero es un botón con su recuento delante:
 *    no se aplica solo al abrir la pantalla.
 *  - Todo se deshace, aquí y desde la ficha del alumno.
 *
 * Y se comparan SOLO los dos grupos elegidos. Nunca se recorre la base entera.
 */
export function VincularAlumnado() {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [idA, setIdA] = useState<string | null>(null)
  const [idB, setIdB] = useState<string | null>(null)

  const grupos = useLiveQuery(
    async () => (await db.grupos.toArray()).sort((x, y) => x.orden - y.orden),
    [],
  )

  const alumnosA = useLiveQuery(async () => (idA ? activos(idA) : []), [idA]) ?? []
  const alumnosB = useLiveQuery(async () => (idB ? activos(idB) : []), [idB]) ?? []

  const listos = idA !== null && idB !== null && idA !== idB
  const propuestas = listos ? emparejar(alumnosA, alumnosB) : []
  const conteo = resumir(propuestas)

  const nombre = (id: string | null) => grupos?.find((g) => g.id === id)?.nombre ?? ''

  async function unir(a: Alumno, b: Alumno) {
    const { deshacer } = await vincular(a.id, [b.id])
    mostrarAviso(`${a.nombre} vinculado con ${nombre(idB)}`, deshacer)
  }

  async function unirExactas() {
    const exactas = propuestas.filter((p) => p.estado === 'exacta' && p.b)
    const deshaceres: (() => Promise<void>)[] = []
    for (const p of exactas) deshaceres.push((await vincular(p.a.id, [p.b!.id])).deshacer)
    mostrarAviso(`${exactas.length} fichas vinculadas`, async () => {
      // Al revés: la última en escribirse es la primera en reponerse.
      for (const d of [...deshaceres].reverse()) await d()
    })
  }

  async function separar(a: Alumno) {
    const { deshacer } = await desvincular(a.id)
    mostrarAviso(`${a.nombre} desvinculado`, deshacer)
  }

  if (grupos === undefined) return null

  return (
    <>
      <Cabecera
        titulo="Vincular alumnado"
        atras
        subtitulo="La misma persona en dos grupos distintos"
      />

      <div className="space-y-4 p-4">
        <div className="aviso text-xs">
          Vincular NO fusiona los grupos. Lo que se comparte es lo de la persona —etiquetas y
          pautas de apoyo—; las notas, la asistencia y el Cuaderno siguen siendo de cada área.
          Nada se vincula sin que lo confirmes tú, y todo se puede deshacer.
        </div>

        {grupos.length < 2 ? (
          <EstadoVacio
            Icono={Link2}
            titulo="Hacen falta dos grupos"
            descripcion="Esto sirve cuando das dos áreas al mismo alumnado y tienes un grupo para cada una."
            accion={
              <button className="btn-primario" onClick={() => navegar('/grupos')}>
                Ir a Grupos
              </button>
            }
          />
        ) : (
          <>
            <section>
              <TituloSeccion>Qué dos grupos comparar</TituloSeccion>
              <div className="space-y-2">
                <SelectorGrupo grupos={grupos} valor={idA} onCambio={setIdA} />
                <SelectorGrupo grupos={grupos} valor={idB} onCambio={setIdB} />
              </div>
              {idA !== null && idA === idB && (
                <p className="mt-2 text-sm text-acento">Elige dos grupos distintos.</p>
              )}
            </section>

            {listos && (
              <>
                <p className="text-sm texto-suave">
                  {conteo.exacta} con el mismo nombre · {conteo.probable} parecidas ·{' '}
                  {conteo.ambigua} sin resolver · {conteo['sin-pareja']} sin pareja
                  {conteo['ya-vinculada'] > 0 && ` · ${conteo['ya-vinculada']} ya vinculadas`}
                </p>

                {conteo.exacta > 0 && (
                  <button className="btn-primario w-full" onClick={() => void unirExactas()}>
                    <Check size={20} aria-hidden />
                    Vincular las {conteo.exacta} con el mismo nombre
                  </button>
                )}

                <ul className="space-y-2">
                  {propuestas.map((p) => (
                    <FilaPropuesta
                      key={p.a.id}
                      propuesta={p}
                      nombreB={nombre(idB)}
                      onVincular={unir}
                      onDesvincular={separar}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Solo el alumnado activo: una baja de un área no es pareja de nadie. */
async function activos(grupoId: string): Promise<Alumno[]> {
  const lista = await db.alumnos.where('grupoId').equals(grupoId).toArray()
  return lista
    .filter((a) => a.activo)
    .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
}

const ROTULO: Record<EstadoPropuesta, { texto: string; clase: string }> = {
  exacta: {
    texto: 'Mismo nombre',
    clase: 'bg-lima/25 text-lima-oscuro dark:bg-lima/20 dark:text-lima',
  },
  probable: {
    texto: 'Se parece',
    clase: 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua',
  },
  ambigua: { texto: 'Hay que elegir', clase: 'bg-acento/15 text-acento' },
  'sin-pareja': {
    texto: 'Sin pareja',
    clase: 'bg-agua-claro/60 text-tinta-tenue dark:bg-noche-elevada',
  },
  'ya-vinculada': {
    texto: 'Ya vinculada',
    clase: 'bg-lima/25 text-lima-oscuro dark:bg-lima/20 dark:text-lima',
  },
}

function nombreCompleto(a: Alumno): string {
  return a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre
}

function FilaPropuesta({
  propuesta: p,
  nombreB,
  onVincular,
  onDesvincular,
}: {
  propuesta: Propuesta
  nombreB: string
  onVincular: (a: Alumno, b: Alumno) => Promise<void>
  onDesvincular: (a: Alumno) => Promise<void>
}) {
  const [descartada, setDescartada] = useState(false)
  const rotulo = ROTULO[p.estado]

  return (
    <li className="tarjeta space-y-2 py-3">
      <div className="flex items-center gap-2">
        {/* El rótulo va escrito, no solo coloreado: «hay que elegir» no puede
            depender de distinguir un rojo de un verde. */}
        <span className={`pildora ${rotulo.clase}`}>
          {p.estado === 'ambigua' && (
            <AlertTriangle size={12} className="mr-1" strokeWidth={3} aria-hidden />
          )}
          {rotulo.texto}
        </span>
      </div>

      {/* Los nombres, tal como están escritos en cada lista. */}
      <p className="font-semibold">{nombreCompleto(p.a)}</p>

      {p.estado === 'sin-pareja' && (
        <p className="text-sm texto-suave">Nadie de {nombreB} se le parece. Se queda sin vincular.</p>
      )}

      {p.estado === 'ya-vinculada' && p.b && (
        <>
          <p className="text-sm texto-suave">Es la misma persona que {nombreCompleto(p.b)}.</p>
          <button className="btn-fantasma w-full" onClick={() => void onDesvincular(p.a)}>
            <X size={18} aria-hidden />
            Desvincular
          </button>
        </>
      )}

      {(p.estado === 'exacta' || p.estado === 'probable') && p.b && !descartada && (
        <>
          <p className="text-sm">
            En {nombreB}: <span className="font-semibold">{nombreCompleto(p.b)}</span>
          </p>
          <div className="flex gap-2">
            <button className="btn-primario flex-1" onClick={() => void onVincular(p.a, p.b!)}>
              <Check size={18} aria-hidden />
              Es la misma persona
            </button>
            <button className="btn-suave" onClick={() => setDescartada(true)}>
              <X size={18} aria-hidden />
              No
            </button>
          </div>
        </>
      )}

      {descartada && <p className="text-sm texto-suave">Descartada. No se ha vinculado nada.</p>}

      {p.estado === 'ambigua' && (
        <>
          <p className="text-sm texto-suave">
            {p.candidatos.length > 0
              ? `Hay ${p.candidatos.length} fichas que podrían serlo. Elige tú: el sistema no puede saberlo.`
              : `Hay más de una ficha con este nombre. Ninguna se vincula sola: resuélvelo a mano.`}
          </p>
          <ul className="space-y-1">
            {p.candidatos.map((c) => (
              <li key={c.alumno.id}>
                <button
                  className="btn-suave w-full justify-start"
                  onClick={() => void onVincular(p.a, c.alumno)}
                >
                  <Check size={18} aria-hidden />
                  {nombreCompleto(c.alumno)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  )
}
