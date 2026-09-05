import { CalendarOff, Undo2 } from 'lucide-react'
import { cancelarClase, restaurarClase, type HuecoCancelado } from '../db/sesiones'
import { variablesColor } from './SelectorColor'
import { useUI } from '../store/ui'
import type { Grupo } from '../db/types'

/**
 * Una clase cancelada para un día suelto (`db.clasesCanceladas`) no desaparece
 * en silencio: se enseña apagada, con el motivo escrito y un «Restaurar» al
 * lado. Así queda claro que se ocultó ESA clase y no que se haya tocado el
 * horario del grupo, que afectaría a todas las semanas.
 *
 * Vive en un componente compartido para que Hoy (día y semana), Planificador y
 * Calendario lo enseñen exactamente igual — el mismo error que ya se corrigió
 * al unificar la resolución de sesiones en `db/sesiones.ts`.
 */
export function FilasCanceladas({ huecos }: { huecos: HuecoCancelado[] }) {
  if (huecos.length === 0) return null
  return (
    <ul className="grid gap-2 apaisado:grid-cols-2 lg:grid-cols-2">
      {huecos.map((h) => (
        <li key={`${h.grupo.id}-${h.fecha}-${h.horaInicio ?? ''}`}>
          <FilaCancelada hueco={h} />
        </li>
      ))}
    </ul>
  )
}

function FilaCancelada({ hueco }: { hueco: HuecoCancelado }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const { grupo, fecha, horaInicio } = hueco

  async function restaurar() {
    const deshacer = await restaurarClase(grupo.id, fecha, horaInicio)
    mostrarAviso(`Clase de ${grupo.nombre} restaurada`, deshacer)
  }

  return (
    <div className="tarjeta flex items-center gap-3 opacity-60">
      <span
        className="color-dato h-10 w-2 shrink-0 rounded-full"
        style={variablesColor(grupo.colorId ?? grupo.color)}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <CalendarOff size={16} className="shrink-0" aria-hidden />
          <span className="truncate font-bold line-through">{grupo.nombre}</span>
        </span>
        <span className="mt-0.5 block text-sm texto-suave">Sin clase este día</span>
      </span>
      <button
        className="flex shrink-0 flex-col items-center gap-0.5 text-xs font-bold text-primario dark:text-agua"
        onClick={() => void restaurar()}
        aria-label={`Restaurar la clase de ${grupo.nombre}`}
      >
        <Undo2 size={22} aria-hidden />
        Restaurar
      </button>
    </div>
  )
}

/**
 * «No hay clase este día» sobre un hueco todavía sin planificar: el caso real
 * de una salida, un examen o una semana en que ese grupo no viene. No toca el
 * horario ni borra nada, y el aviso trae su Deshacer.
 */
export function BotonNoHayClase({
  grupo,
  fecha,
  horaInicio,
  variante = 'icono',
}: {
  grupo: Grupo
  fecha: string
  horaInicio?: string
  /** `icono` va junto a la tarjeta; `ancho`, dentro de un panel desplegado. */
  variante?: 'icono' | 'ancho'
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)

  async function cancelar() {
    const deshacer = await cancelarClase(grupo.id, fecha, horaInicio)
    mostrarAviso(`Sin clase de ${grupo.nombre} este día`, deshacer)
  }

  if (variante === 'ancho') {
    return (
      <button className="btn w-full" onClick={() => void cancelar()}>
        <CalendarOff size={18} aria-hidden />
        No hay clase este día
      </button>
    )
  }

  return (
    <button
      className="flex shrink-0 flex-col items-center gap-0.5 text-xs font-bold texto-suave"
      onClick={() => void cancelar()}
      aria-label={`No hay clase de ${grupo.nombre} este día`}
      title="No hay clase este día"
    >
      <CalendarOff size={22} aria-hidden />
      Sin clase
    </button>
  )
}
