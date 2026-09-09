import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Tags, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { Campo } from '../components/Campo'
import { EstadoVacio } from '../components/EstadoVacio'
import { Hoja } from '../components/Hoja'
import { SelectorColor, variablesColor } from '../components/SelectorColor'
import {
  alumnosConEtiqueta,
  borrarEtiqueta,
  crearEtiqueta,
  editarEtiqueta,
  etiquetas as leerEtiquetas,
} from '../db/etiquetasAlumno'
import type { EtiquetaAlumno } from '../db/types'
import { COLOR_POR_DEFECTO } from '../lib/paleta'
import { useUI } from '../store/ui'

/**
 * Catálogo de etiquetas de alumnado: TDAH, ACNEE, Compensatoria, lesionado…
 *
 * Aquí se crean, se editan y se borran. Ponerlas y quitarlas a cada alumno se
 * hace en su ficha («Editar alumno»), que es donde ya viven los otros datos
 * sensibles y donde está el aviso que los acompaña.
 *
 * Lo que se ve de ellas en el resto de la app es un punto de color con su
 * abreviatura, y solo en las cuatro vistas de gestión del maestro: Cuaderno,
 * ficha del grupo, pase de lista y ficha del alumno. En nada proyectable. Son
 * datos de categoría especial (ver `db/etiquetasAlumno.ts`).
 */
export function EtiquetasAlumno() {
  const [editando, setEditando] = useState<EtiquetaAlumno | 'nueva' | null>(null)
  const etiquetas = useLiveQuery(() => leerEtiquetas(), [])
  const total = etiquetas?.length ?? 0

  return (
    <>
      <Cabecera
        titulo="Etiquetas de alumnado"
        atras
        subtitulo={etiquetas ? `${total} etiqueta${total === 1 ? '' : 's'}` : undefined}
        acciones={
          <button className="btn-suave" onClick={() => setEditando('nueva')}>
            <Plus size={20} aria-hidden />
            Nueva
          </button>
        }
      />

      <div className="space-y-4 p-4">
        <div className="aviso text-xs">
          Datos sensibles: no salen nunca de este dispositivo salvo dentro de la copia cifrada, y
          solo se ven en tus pantallas de trabajo —Cuaderno, ficha del grupo, pase de lista y ficha
          del alumno—. No aparecen en informes, ni en exportaciones, ni en las herramientas de aula,
          ni en nada que se proyecte.
        </div>

        {total === 0 && etiquetas && (
          <EstadoVacio
            Icono={Tags}
            titulo="Todavía no hay etiquetas"
            descripcion="Una etiqueta es un punto de color con su abreviatura junto al nombre: TDAH, ACNEE, lesionado…"
            accion={
              <button className="btn-primario" onClick={() => setEditando('nueva')}>
                <Plus size={20} aria-hidden />
                Crear la primera
              </button>
            }
          />
        )}

        {(etiquetas ?? []).map((e) => (
          <FilaEtiqueta key={e.id} etiqueta={e} onEditar={() => setEditando(e)} />
        ))}
      </div>

      <HojaEtiqueta
        etiqueta={editando}
        onCerrar={() => setEditando(null)}
      />
    </>
  )
}

function FilaEtiqueta({
  etiqueta,
  onEditar,
}: {
  etiqueta: EtiquetaAlumno
  onEditar: () => void
}) {
  const usos = useLiveQuery(async () => (await alumnosConEtiqueta(etiqueta.id)).length, [etiqueta.id])

  return (
    <button className="tarjeta-pulsable flex w-full items-center gap-3 py-3" onClick={onEditar}>
      <span
        className="color-dato h-6 w-6 shrink-0 rounded-full"
        style={variablesColor(etiqueta.colorId)}
        aria-hidden
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{etiqueta.nombre}</span>
        <span className="block text-xs texto-suave">
          {etiqueta.abreviatura} · {usos === undefined ? '…' : `${usos} alumno${usos === 1 ? '' : 's'}`}
        </span>
      </span>
      <span className="text-2xl text-tinta-tenue" aria-hidden>
        ›
      </span>
    </button>
  )
}

function HojaEtiqueta({
  etiqueta,
  onCerrar,
}: {
  etiqueta: EtiquetaAlumno | 'nueva' | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const esNueva = etiqueta === 'nueva'
  const actual = esNueva ? null : etiqueta

  const [nombre, setNombre] = useState('')
  const [abreviatura, setAbreviatura] = useState('')
  const [colorId, setColorId] = useState(COLOR_POR_DEFECTO)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)

  const usos = useLiveQuery(
    async () => (actual ? (await alumnosConEtiqueta(actual.id)).length : 0),
    [actual?.id],
  )

  useEffect(() => {
    if (!etiqueta) return
    setNombre(actual?.nombre ?? '')
    setAbreviatura(actual?.abreviatura ?? '')
    setColorId(actual?.colorId ?? COLOR_POR_DEFECTO)
    setConfirmandoBorrado(false)
  }, [etiqueta, actual?.nombre, actual?.abreviatura, actual?.colorId])

  // La abreviatura se propone a partir del nombre mientras no se toque a mano:
  // «Compensatoria» → «COM». Nunca queda vacía, porque es lo que se pinta.
  const abreviaturaEfectiva = abreviatura.trim() || nombre.trim().slice(0, 3).toUpperCase()

  async function guardar() {
    if (!nombre.trim()) return
    if (actual) {
      await editarEtiqueta(actual.id, { nombre, abreviatura: abreviaturaEfectiva, colorId })
      mostrarAviso(`«${nombre.trim()}» guardada`)
    } else {
      await crearEtiqueta({ nombre, abreviatura: abreviaturaEfectiva, colorId })
      mostrarAviso(`«${nombre.trim()}» creada`)
    }
    onCerrar()
  }

  async function borrar() {
    if (!actual) return
    const deshacer = await borrarEtiqueta(actual.id)
    onCerrar()
    mostrarAviso(`«${actual.nombre}» eliminada`, deshacer)
  }

  return (
    <Hoja
      abierta={etiqueta !== null}
      titulo={esNueva ? 'Nueva etiqueta' : 'Editar etiqueta'}
      onCerrar={onCerrar}
    >
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="et-nombre">
            Nombre
          </label>
          <Campo
            id="et-nombre"
            className="campo"
            valor={nombre}
            onValor={setNombre}
            placeholder="TDAH"
            autoFocus
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="et-abrev">
            Abreviatura
          </label>
          <Campo
            id="et-abrev"
            className="campo"
            valor={abreviatura}
            onValor={(v) => setAbreviatura(v.slice(0, 3))}
            placeholder={nombre.trim().slice(0, 3).toUpperCase() || 'TDA'}
          />
          <p className="mt-1 text-xs texto-suave">
            Hasta 3 letras. Es lo que se ve junto al punto de color: el color por sí solo no
            distingue dos etiquetas parecidas.
          </p>
        </div>

        <div>
          <span className="etiqueta">Color</span>
          <SelectorColor valor={colorId} onValor={setColorId} etiqueta="Color de la etiqueta" />
        </div>

        <button className="btn-primario w-full" disabled={!nombre.trim()} onClick={() => void guardar()}>
          {esNueva ? 'Crear etiqueta' : 'Guardar cambios'}
        </button>

        {actual && !confirmandoBorrado && (
          <button className="btn-fantasma w-full" onClick={() => setConfirmandoBorrado(true)}>
            <Trash2 size={20} aria-hidden />
            Eliminar etiqueta
          </button>
        )}

        {actual && confirmandoBorrado && (
          <div className="space-y-2">
            <div className="aviso-fuerte text-sm">
              {usos === 0
                ? 'No está puesta a nadie: se elimina y ya está.'
                : `Se quitará de ${usos} alumno${usos === 1 ? '' : 's'}. Podrás deshacerlo.`}
            </div>
            <button className="btn-peligro w-full" onClick={() => void borrar()}>
              <Trash2 size={20} aria-hidden />
              Eliminar definitivamente
            </button>
            <button className="btn-fantasma w-full" onClick={() => setConfirmandoBorrado(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </Hoja>
  )
}
