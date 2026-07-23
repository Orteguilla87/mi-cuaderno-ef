import { useLiveQuery } from 'dexie-react-hooks'
import { Shuffle, Timer, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { db } from '../db/db'
import { navegar } from '../lib/router'

const HERRAMIENTAS = [
  {
    titulo: 'Generador de equipos',
    descripcion: 'Reparte al grupo en equipos equilibrados, con pizarra para proyectar',
    Icono: Shuffle,
    disponible: true,
  },
  {
    titulo: 'Cronómetro',
    descripcion: 'Intervalos de trabajo y descanso',
    Icono: Timer,
    disponible: false,
  },
  {
    titulo: 'Marcador',
    descripcion: 'Tanteo a pantalla completa',
    Icono: Trophy,
    disponible: false,
  },
  {
    titulo: 'Selector aleatorio',
    descripcion: 'Elige a un alumno al azar',
    Icono: Users,
    disponible: false,
  },
]

/** §5 M8: herramientas de aula. Solo el generador de equipos está construido. */
export function Herramientas() {
  const [eligiendoGrupo, setEligiendoGrupo] = useState(false)

  return (
    <>
      <Cabecera titulo="Herramientas" />

      <div className="space-y-3 p-4">
        {HERRAMIENTAS.map(({ titulo, descripcion, Icono, disponible }) => (
          <button
            key={titulo}
            onClick={() => disponible && setEligiendoGrupo(true)}
            disabled={!disponible}
            className="tarjeta-pulsable flex w-full items-center gap-3 text-left disabled:opacity-60"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-agua-claro text-primario dark:bg-noche-elevada dark:text-agua">
              <Icono size={22} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-base font-bold">{titulo}</span>
                {!disponible && (
                  <span className="pildora bg-agua-medio text-primario-oscuro dark:bg-noche-elevada dark:text-agua">
                    Pronto
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-sm texto-suave">{descripcion}</span>
            </span>
          </button>
        ))}
      </div>

      <HojaElegirGrupo abierta={eligiendoGrupo} onCerrar={() => setEligiendoGrupo(false)} />
    </>
  )
}

function HojaElegirGrupo({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const grupos = useLiveQuery(async () => {
    const lista = await db.grupos.toArray()
    return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [])

  return (
    <Hoja abierta={abierta} titulo="¿Qué grupo?" onCerrar={onCerrar}>
      {grupos?.length === 0 ? (
        <p className="text-sm texto-suave">Todavía no hay grupos creados.</p>
      ) : (
        <ul className="space-y-2">
          {grupos?.map((g) => (
            <li key={g.id}>
              <button
                className="tarjeta-pulsable flex w-full items-center gap-3 text-left"
                onClick={() => navegar(`/equipos/${g.id}`)}
              >
                <span
                  className="h-10 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color }}
                  aria-hidden
                />
                <span className="flex items-center gap-2">
                  <span className="font-bold">{g.nombre}</span>
                  <BadgeEtapa etapa={g.etapa} nivel={g.nivel} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Hoja>
  )
}
