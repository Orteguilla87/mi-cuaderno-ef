import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { GripVertical, Users } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Campo } from '../components/Campo'
import { EstadoVacio } from '../components/EstadoVacio'
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
  const mostrarAviso = useUI((s) => s.mostrarAviso)

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

  // Distancia mínima antes de activar el arrastre (§ Bloque 6.1): sin esto, un
  // toque para navegar a la ficha del grupo se interpretaría como el inicio de
  // un arrastre y el toque nunca llegaría a disparar la navegación. Pointer
  // Events cubre ratón y táctil con el mismo sensor.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  /** Único punto de escritura del orden: reescribe `Grupo.orden` de todos a la vez. */
  async function reordenar(idsEnOrden: string[]) {
    const previos = (grupos ?? []).map((g) => ({ id: g.id, orden: g.orden }))
    await db.transaction('rw', db.grupos, async () => {
      for (let i = 0; i < idsEnOrden.length; i++) {
        await db.grupos.update(idsEnOrden[i], { orden: i })
      }
    })
    mostrarAviso('Orden de grupos actualizado', async () => {
      await db.transaction('rw', db.grupos, async () => {
        for (const { id, orden } of previos) await db.grupos.update(id, { orden })
      })
    })
  }

  function alSoltar(evento: DragEndEvent) {
    const { active, over } = evento
    if (!over || active.id === over.id || !grupos) return
    const desde = grupos.findIndex((g) => g.id === active.id)
    const hasta = grupos.findIndex((g) => g.id === over.id)
    if (desde === -1 || hasta === -1) return
    void reordenar(arrayMove(grupos, desde, hasta).map((g) => g.id))
  }

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

      <div className="p-4">
        {grupos?.length === 0 && (
          <EstadoVacio
            Icono={Users}
            titulo="Todavía no hay grupos"
            descripcion="Crea tu primer grupo y pega el listado de alumnado."
            accion={
              <button className="btn-primario w-full" onClick={() => setAbierta(true)}>
                Crear grupo
              </button>
            }
          />
        )}

        {grupos && grupos.length > 0 && (
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
            <SortableContext items={grupos.map((g) => g.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-3 apaisado:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {grupos.map((g) => (
                  <GrupoTarjeta key={g.id} grupo={g} alumnos={conteos?.[g.id] ?? 0} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <HojaNuevoGrupo abierta={abierta} onCerrar={() => setAbierta(false)} orden={grupos?.length ?? 0} />
    </>
  )
}

/** Tarjeta de grupo arrastrable: el asa de arrastre va aparte del toque que navega. */
function GrupoTarjeta({ grupo: g, alumnos }: { grupo: Grupo; alumnos: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: g.id,
  })
  const estilo = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={estilo}
      className="flex items-stretch gap-1 rounded-xl2 border border-borde bg-white dark:border-noche-borde dark:bg-noche-superficie"
    >
      <button
        {...attributes}
        {...listeners}
        style={{ touchAction: 'none' }}
        className="flex shrink-0 cursor-grab items-center px-2 text-tinta-tenue active:cursor-grabbing"
        aria-label={`Reordenar ${g.nombre}`}
      >
        <GripVertical size={18} aria-hidden />
      </button>
      <button
        onClick={() => navegar(`/grupos/${g.id}`)}
        className="flex min-w-0 flex-1 items-center gap-3 py-4 pr-4 text-left"
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
            {alumnos} alumnos
            {g.horario.length > 0 &&
              ' · ' + g.horario.map((h) => `${DIAS[h.diaSemana - 1]} ${h.horaInicio}`).join(' · ')}
          </span>
        </span>
        <span className="text-2xl text-tinta-tenue" aria-hidden>
          ›
        </span>
      </button>
    </div>
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
          <Campo
            id="nombre-grupo"
            className="campo"
            valor={nombre}
            onValor={setNombre}
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
              className="flex items-center gap-2 rounded-xl border border-borde bg-white px-3 py-2 text-sm dark:border-noche-borde dark:bg-noche-superficie"
            >
              <span className="cifra flex-1 font-semibold">
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
          className="campo cifra flex-1"
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
          className="campo cifra flex-1"
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
