import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Estado vacío con acción, no un párrafo mudo: la pantalla vacía es la
 * primera que ve cualquier grupo nuevo, así que tiene que decir qué hacer a
 * continuación, no solo que no hay nada.
 */
export function EstadoVacio({
  Icono,
  titulo,
  descripcion,
  accion,
}: {
  Icono?: LucideIcon
  titulo: string
  descripcion?: ReactNode
  accion?: ReactNode
}) {
  return (
    <div className="tarjeta text-center">
      {Icono && <Icono className="mx-auto text-tinta-tenue" size={32} aria-hidden />}
      <p className={Icono ? 'mt-2 text-base font-semibold' : 'text-base font-semibold'}>
        {titulo}
      </p>
      {descripcion && <p className="mt-1 text-sm texto-suave">{descripcion}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}
