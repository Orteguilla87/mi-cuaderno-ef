import { useLiveQuery } from 'dexie-react-hooks'
import { NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { borrarNota, guardarNota } from '../db/notasCelda'
import type { Alumno, Columna } from '../db/types'
import { useUI } from '../store/ui'
import { CampoArea } from './Campo'
import { Hoja } from './Hoja'

/**
 * UI de las notas de celda del Cuaderno (`NotaCelda`): la hoja para verla y
 * editarla —el mismo sitio para las dos cosas— y el menú del clic derecho en
 * escritorio. Solo la usa `pages/Cuaderno.tsx`.
 */

export interface CeldaNota {
  columna: Columna
  alumno: Alumno
}

/** Marca de «esta celda tiene nota»: triángulo en la esquina superior derecha. */
export function MarcaNota() {
  return (
    <span
      aria-hidden
      // Absoluto y sin eventos: ni mueve el valor, ni cambia medidas, ni se
      // traga el toque de la celda.
      className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-8 border-t-8 border-l-transparent border-t-acento"
    />
  )
}

export function HojaNotaCelda({ celda, onCerrar }: { celda: CeldaNota | null; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const columnaId = celda?.columna.id
  const alumnoId = celda?.alumno.id
  const nota = useLiveQuery(
    async () => (columnaId && alumnoId ? ((await db.notasCelda.get([columnaId, alumnoId])) ?? null) : null),
    [columnaId, alumnoId],
  )
  const [texto, setTexto] = useState<string | null>(null)

  // Al cambiar de celda, el borrador vuelve a ser el de la nota guardada.
  useEffect(() => setTexto(null), [columnaId, alumnoId])

  if (!celda) return null

  const actual = texto ?? nota?.texto ?? ''
  const nombre = celda.alumno.alias || celda.alumno.nombre

  async function guardar() {
    if (!celda) return
    const deshacer = await guardarNota(celda.columna.id, celda.alumno.id, actual)
    setTexto(null)
    onCerrar()
    mostrarAviso(actual.trim() ? 'Nota guardada' : 'Nota borrada', deshacer)
  }

  async function borrar() {
    if (!celda) return
    const deshacer = await borrarNota(celda.columna.id, celda.alumno.id)
    setTexto(null)
    onCerrar()
    mostrarAviso('Nota borrada', deshacer)
  }

  return (
    <Hoja abierta titulo={`Nota · ${nombre} · ${celda.columna.titulo}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <CampoArea
          className="campo min-h-[7rem]"
          valor={actual}
          onValor={setTexto}
          placeholder="Lo que quieras recordar de esta celda"
          aria-label="Texto de la nota"
          autoFocus
        />
        <p className="text-xs texto-suave">
          Solo se ve aquí, en el Cuaderno. No cuenta en ninguna nota ni sale en informes ni
          exportaciones; sí va en la copia cifrada.
        </p>
        <button className="btn-primario w-full" onClick={() => void guardar()}>
          Guardar nota
        </button>
        {nota && (
          <button className="btn-peligro w-full" onClick={() => void borrar()}>
            <Trash2 size={18} aria-hidden />
            Borrar nota
          </button>
        )}
      </div>
    </Hoja>
  )
}

/** Menú propio del clic derecho sobre una celda (escritorio). */
export function MenuNotaCelda({
  menu,
  tieneNota,
  onEditar,
  onCerrar,
}: {
  menu: (CeldaNota & { x: number; y: number }) | null
  tieneNota: boolean
  onEditar: (celda: CeldaNota) => void
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null)

  // Dentro de la ventana aunque el clic sea en el borde derecho o abajo.
  useLayoutEffect(() => {
    if (!menu || !panelRef.current) return setCoord(null)
    const { width, height } = panelRef.current.getBoundingClientRect()
    setCoord({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const alPulsarTecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alPulsarTecla)
    panelRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => window.removeEventListener('keydown', alPulsarTecla)
  }, [menu, onCerrar])

  if (!menu) return null

  async function borrar() {
    if (!menu) return
    const deshacer = await borrarNota(menu.columna.id, menu.alumno.id)
    onCerrar()
    mostrarAviso('Nota borrada', deshacer)
  }

  const opcion =
    'flex min-h-tap w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition ' +
    'hover:bg-agua-claro focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 dark:hover:bg-noche-elevada'

  return (
    <>
      <button
        className="fixed inset-0 z-fab cursor-default"
        aria-label="Cerrar menú"
        onClick={onCerrar}
        onContextMenu={(e) => {
          e.preventDefault()
          onCerrar()
        }}
      />
      <div
        ref={panelRef}
        role="menu"
        aria-label={`Nota de ${menu.alumno.alias || menu.alumno.nombre} en ${menu.columna.titulo}`}
        style={{ top: coord?.top ?? 0, left: coord?.left ?? 0, visibility: coord ? 'visible' : 'hidden' }}
        className="fixed z-hoja min-w-[12rem] rounded-xl2 border border-borde bg-superficie p-1 shadow-xl dark:border-noche-borde dark:bg-noche-superficie"
      >
        <button
          role="menuitem"
          className={opcion}
          onClick={() => {
            onEditar(menu)
            onCerrar()
          }}
        >
          {tieneNota ? <Pencil size={16} aria-hidden /> : <NotebookPen size={16} aria-hidden />}
          {tieneNota ? 'Ver o editar nota' : 'Añadir nota'}
        </button>
        {tieneNota && (
          <button role="menuitem" className={opcion + ' text-acento'} onClick={() => void borrar()}>
            <Trash2 size={16} aria-hidden />
            Borrar nota
          </button>
        )}
      </div>
    </>
  )
}
