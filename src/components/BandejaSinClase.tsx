import { useLiveQuery } from 'dexie-react-hooks'
import { Inbox } from 'lucide-react'
import { useState } from 'react'
import { colocarSinClase, descartarSinClase, sesionesVaciasDesde, sinClaseDelGrupo } from '../db/sinClase'
import type { ContenidoSinClase, Grupo } from '../db/types'
import { aISO, formatoDiaCorto } from '../lib/fechas'
import { useUI } from '../store/ui'
import { Hoja } from './Hoja'
import { HojaConfirmar } from './HojaConfirmar'

/**
 * «Sin clase asignada»: contenido que «Pasar programación al siguiente día» no
 * pudo colocar antes de fin de curso. Solo aparece si hay algo.
 */
export function BandejaSinClase({ grupo }: { grupo: Grupo }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const aparcados = useLiveQuery(() => sinClaseDelGrupo(grupo.id), [grupo.id])
  const [colocando, setColocando] = useState<ContenidoSinClase | null>(null)
  const [descartando, setDescartando] = useState<ContenidoSinClase | null>(null)

  if (!aparcados?.length) return null

  async function descartar() {
    if (!descartando) return
    const deshacer = await descartarSinClase(descartando.id)
    setDescartando(null)
    mostrarAviso('Descartado', deshacer)
  }

  return (
    <section className="tarjeta space-y-2 border-l-4 border-acento text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Inbox size={18} className="shrink-0 text-acento" aria-hidden />
        Sin clase asignada ({aparcados.length})
      </p>
      <p className="texto-suave">
        No cupo antes de fin de curso al pasar la programación. Nada se ha borrado: colócalo en una
        sesión vacía o descártalo.
      </p>
      <ul className="space-y-2">
        {aparcados.map((a) => (
          <li key={a.id} className="space-y-1">
            <p className="min-w-0 break-words">
              <strong>{a.contenido.titulo?.trim() || 'Sesión sin título'}</strong>
              <span className="cifra texto-suave"> · estaba el {formatoDiaCorto(a.origen.fecha)}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-suave text-xs" onClick={() => setColocando(a)}>
                Colocar en…
              </button>
              <button className="btn text-xs" onClick={() => setDescartando(a)}>
                Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <HojaColocar aparcado={colocando} grupo={grupo} onCerrar={() => setColocando(null)} />
      <HojaConfirmar
        abierta={descartando !== null}
        titulo="¿Descartar este contenido?"
        descripcion={`«${descartando?.contenido.titulo?.trim() || 'Sesión sin título'}» desaparece de la bandeja. Podrás deshacerlo justo después.`}
        textoConfirmar="Descartar"
        onConfirmar={() => void descartar()}
        onCerrar={() => setDescartando(null)}
      />
    </section>
  )
}

function HojaColocar({
  aparcado,
  grupo,
  onCerrar,
}: {
  aparcado: ContenidoSinClase | null
  grupo: Grupo
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const vacias = useLiveQuery(
    async () => (aparcado ? sesionesVaciasDesde(grupo.id, aISO()) : []),
    [aparcado?.id, grupo.id],
  )

  async function colocar(sesionId: string, cuando: string) {
    if (!aparcado) return
    const deshacer = await colocarSinClase(aparcado.id, sesionId)
    onCerrar()
    mostrarAviso(`Colocado el ${cuando}`, deshacer)
  }

  return (
    <Hoja abierta={aparcado !== null} titulo="Colocar en una sesión vacía" onCerrar={onCerrar}>
      {vacias?.length === 0 ? (
        <p className="text-sm texto-suave">
          {grupo.nombre} no tiene sesiones vacías desde hoy. Vacía una desde el Planificador y vuelve.
        </p>
      ) : (
        <ul className="space-y-2">
          {vacias?.map((s) => {
            const cuando = `${formatoDiaCorto(s.fecha)}${s.franjaInicio ? ` · ${s.franjaInicio}` : ''}`
            return (
              <li key={s.id}>
                <button className="btn-suave cifra w-full" onClick={() => void colocar(s.id, cuando)}>
                  {cuando}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Hoja>
  )
}
