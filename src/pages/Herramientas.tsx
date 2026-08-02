import { useLiveQuery } from 'dexie-react-hooks'
import { Shuffle, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { Marcador } from '../components/Marcador'
import { SorteoAlumno } from '../components/SorteoAlumno'
import { db } from '../db/db'
import { navegar } from '../lib/router'

type Id = 'equipos' | 'marcador' | 'aleatorio'

const HERRAMIENTAS: {
  id: Id
  titulo: string
  descripcion: string
  Icono: typeof Shuffle
  disponible: boolean
}[] = [
  {
    id: 'equipos',
    titulo: 'Generador de equipos',
    descripcion: 'Reparte al grupo en equipos equilibrados, con pizarra para proyectar',
    Icono: Shuffle,
    disponible: true,
  },
  {
    id: 'marcador',
    titulo: 'Marcador',
    descripcion: 'Tanteo de 2 a 6 equipos, a pantalla completa',
    Icono: Trophy,
    disponible: true,
  },
  {
    id: 'aleatorio',
    titulo: 'Selector aleatorio',
    descripcion: 'Elige a un alumno al azar',
    Icono: Users,
    disponible: true,
  },
]

/** §5 M8: herramientas de aula. */
export function Herramientas() {
  // Qué herramienta pidió grupo, para que la misma hoja sirva a las dos:
  // «equipos» navega a /equipos al elegir, «aleatorio» abre el sorteo aquí
  // mismo, sin salir de Herramientas. El marcador no necesita grupo: abre directo.
  const [pidiendoGrupo, setPidiendoGrupo] = useState<Id | null>(null)
  const [sorteando, setSorteando] = useState<string | null>(null)
  const [mostrandoMarcador, setMostrandoMarcador] = useState(false)

  return (
    <>
      <Cabecera titulo="Herramientas" />

      <div className="space-y-3 p-4">
        {HERRAMIENTAS.map(({ id, titulo, descripcion, Icono, disponible }) => (
          <button
            key={id}
            onClick={() => {
              if (!disponible) return
              if (id === 'marcador') setMostrandoMarcador(true)
              else setPidiendoGrupo(id)
            }}
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

      <HojaElegirGrupo
        abierta={pidiendoGrupo !== null}
        onCerrar={() => setPidiendoGrupo(null)}
        onElegir={(grupoId) => {
          const herramienta = pidiendoGrupo
          setPidiendoGrupo(null)
          if (herramienta === 'aleatorio') setSorteando(grupoId)
          else navegar(`/equipos/${grupoId}`)
        }}
      />

      {sorteando && <SorteoAlumno grupoId={sorteando} onCerrar={() => setSorteando(null)} />}

      {mostrandoMarcador && <Marcador onCerrar={() => setMostrandoMarcador(false)} />}
    </>
  )
}

function HojaElegirGrupo({
  abierta,
  onCerrar,
  onElegir,
}: {
  abierta: boolean
  onCerrar: () => void
  onElegir: (grupoId: string) => void
}) {
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
                onClick={() => onElegir(g.id)}
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
