import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { db, nuevoId } from '../db/db'
import { leerCursoActivo, obtenerCursoActivo } from '../db/curso'
import type { Etapa, FranjaHorario, Grupo } from '../db/types'
import { DURACION_SESION_MIN, sumarMinutos } from '../lib/horas'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

/**
 * Colores de grupo: solo la paleta de §3.1 y derivados por oscurecido. Nada de
 * familias ajenas — con 9 grupos hacen falta 6 tonos distinguibles, y estos lo
 * son sin romper la identidad de la app.
 */
const COLORES = ['#006A80', '#CE184B', '#ABB200', '#9AC3CC', '#00505F', '#7F8500']
const DIAS = ['L', 'M', 'X', 'J', 'V'] as const

export function Grupos() {
  const [abierta, setAbierta] = useState(false)

  const grupos = useLiveQuery(async () => {
    const curso = await leerCursoActivo()
    if (!curso) return [] // el curso lo crea App al arrancar; llega en el siguiente tick
    const lista = await db.grupos.where('cursoEscolarId').equals(curso.id).toArray()
    return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  }, [])

  const conteos = useLiveQuery(async () => {
    const alumnos = await db.alumnos.filter((a) => a.activo).toArray()
    const mapa: Record<string, number> = {}
    for (const a of alumnos) mapa[a.grupoId] = (mapa[a.grupoId] ?? 0) + 1
    return mapa
  }, [])

  return (
    <>
      <Cabecera
        titulo="Grupos"
        subtitulo={grupos ? `${grupos.length} grupo${grupos.length === 1 ? '' : 's'}` : undefined}
        acciones={
          <button className="btn-primario" onClick={() => setAbierta(true)}>
            + Grupo
          </button>
        }
      />

      <div className="space-y-3 p-4">
        {grupos?.length === 0 && (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Todavía no hay grupos</p>
            <p className="mt-1 text-sm texto-suave">
              Crea tu primer grupo y pega el listado de alumnado.
            </p>
            <button className="btn-primario mt-4 w-full" onClick={() => setAbierta(true)}>
              Crear grupo
            </button>
          </div>
        )}

        {grupos?.map((g) => (
          <button
            key={g.id}
            onClick={() => navegar(`/grupos/${g.id}`)}
            className="tarjeta flex w-full items-center gap-3 text-left"
          >
            <span
              className="h-12 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: g.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-lg font-bold">{g.nombre}</span>
                <BadgeEtapa etapa={g.etapa} nivel={g.nivel} />
              </span>
              <span className="mt-0.5 block text-sm texto-suave">
                {conteos?.[g.id] ?? 0} alumnos
                {g.horario.length > 0 &&
                  ' · ' +
                    g.horario.map((h) => `${DIAS[h.diaSemana - 1]} ${h.horaInicio}`).join(' · ')}
              </span>
            </span>
            <span className="text-2xl text-tinta-tenue" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>

      <HojaNuevoGrupo abierta={abierta} onCerrar={() => setAbierta(false)} orden={grupos?.length ?? 0} />
    </>
  )
}

function HojaNuevoGrupo({
  abierta,
  onCerrar,
  orden,
}: {
  abierta: boolean
  onCerrar: () => void
  orden: number
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nombre, setNombre] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('primaria')
  const [nivel, setNivel] = useState(1)
  const [color, setColor] = useState(COLORES[0])
  const [horario, setHorario] = useState<FranjaHorario[]>([])

  const niveles = etapa === 'primaria' ? [1, 2, 3, 4, 5, 6] : [3, 4, 5]

  function cambiarEtapa(nueva: Etapa) {
    setEtapa(nueva)
    setNivel(nueva === 'primaria' ? 1 : 3)
  }

  async function guardar() {
    if (!nombre.trim()) return
    const curso = await obtenerCursoActivo()
    const grupo: Grupo = {
      id: nuevoId(),
      cursoEscolarId: curso.id,
      nombre: nombre.trim(),
      etapa,
      nivel,
      color,
      orden,
      horario,
    }
    await db.grupos.add(grupo)
    onCerrar()
    setNombre('')
    setHorario([])
    mostrarAviso(`Grupo «${grupo.nombre}» creado`, async () => {
      await db.grupos.delete(grupo.id)
    })
    navegar(`/grupos/${grupo.id}`)
  }

  return (
    <Hoja abierta={abierta} titulo="Nuevo grupo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="nombre-grupo">
            Nombre
          </label>
          <input
            id="nombre-grupo"
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="3ºB"
            autoFocus
          />
        </div>

        <div>
          <span className="etiqueta">Etapa</span>
          <div className="grid grid-cols-2 gap-2">
            {(['primaria', 'infantil'] as const).map((e) => (
              <button
                key={e}
                onClick={() => cambiarEtapa(e)}
                className={etapa === e ? 'btn-primario' : 'btn-suave'}
              >
                {e === 'primaria' ? 'Primaria' : 'Infantil'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="etiqueta">{etapa === 'primaria' ? 'Curso' : 'Edad'}</span>
          <div className="flex flex-wrap gap-2">
            {niveles.map((n) => (
              <button
                key={n}
                onClick={() => setNivel(n)}
                className={
                  (nivel === n ? 'btn-primario' : 'btn-suave') + ' min-w-tap flex-1 px-0'
                }
              >
                {etapa === 'primaria' ? `${n}º` : `${n} años`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="etiqueta">Color</span>
          <div className="flex gap-2">
            {COLORES.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={
                  'h-12 w-12 rounded-full border-4 ' +
                  (color === c ? 'border-tinta dark:border-white' : 'border-transparent')
                }
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <EditorHorario horario={horario} onCambio={setHorario} />

        <button className="btn-primario w-full" onClick={guardar} disabled={!nombre.trim()}>
          Crear grupo
        </button>
      </div>
    </Hoja>
  )
}

/** Horario semanal del grupo: lo usará la vista «Hoy» (fase 2) para abrir la lista que toca. */
export function EditorHorario({
  horario,
  onCambio,
}: {
  horario: FranjaHorario[]
  onCambio: (h: FranjaHorario[]) => void
}) {
  const [dia, setDia] = useState<FranjaHorario['diaSemana']>(1)
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [horaFin, setHoraFin] = useState('09:45')

  const rangoInvalido = horaFin <= horaInicio // 'HH:MM' compara bien como texto

  return (
    <div>
      <span className="etiqueta">Horario semanal</span>

      {horario.length > 0 && (
        <ul className="mb-2 space-y-1">
          {horario.map((h, i) => (
            <li
              key={`${h.diaSemana}-${h.horaInicio}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-borde bg-white px-3 py-2 text-sm dark:border-noche-borde dark:bg-noche-superficie"
            >
              <span className="flex-1 font-semibold tabular-nums">
                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'][h.diaSemana - 1]} ·{' '}
                {h.horaInicio}–{h.horaFin}
              </span>
              <button
                className="min-h-tap min-w-tap text-acento"
                onClick={() => onCambio(horario.filter((_, j) => j !== i))}
                aria-label="Quitar franja"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <select
          className="campo flex-1"
          value={dia}
          onChange={(e) => setDia(Number(e.target.value) as FranjaHorario['diaSemana'])}
          aria-label="Día de la semana"
        >
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="time"
          className="campo flex-1 tabular-nums"
          value={horaInicio}
          onChange={(e) => {
            const v = e.target.value
            setHoraInicio(v)
            // La franja se arrastra entera: mover el inicio no debe dejar un
            // rango inválido a la espera de que el usuario lo note.
            if (horaFin <= v) setHoraFin(sumarMinutos(v, DURACION_SESION_MIN))
          }}
          aria-label="Hora de inicio"
        />
        <input
          type="time"
          className="campo flex-1 tabular-nums"
          value={horaFin}
          onChange={(e) => setHoraFin(e.target.value)}
          aria-label="Hora de fin"
        />
        <button
          className="btn-suave"
          disabled={rangoInvalido}
          onClick={() => onCambio([...horario, { diaSemana: dia, horaInicio, horaFin }])}
        >
          Añadir
        </button>
      </div>
      {rangoInvalido && (
        <p className="mt-1 text-sm font-semibold text-acento">
          La hora de fin debe ser posterior a la de inicio.
        </p>
      )}
    </div>
  )
}
