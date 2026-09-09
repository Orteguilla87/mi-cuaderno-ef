import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus, Tags, Trash2 } from 'lucide-react'
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
import { ICONOS_ETIQUETA, iconoDe } from '../lib/iconosEtiqueta'
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
      <Muestra etiqueta={etiqueta} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{etiqueta.nombre}</span>
        <span className="block text-xs texto-suave">
          {etiqueta.abreviatura}
          {etiqueta.temporal && ' · Temporal'} ·{' '}
          {usos === undefined ? '…' : `${usos} alumno${usos === 1 ? '' : 's'}`}
        </span>
      </span>
      <span className="text-2xl text-tinta-tenue" aria-hidden>
        ›
      </span>
    </button>
  )
}

/**
 * Cómo se ve la etiqueta: el icono si lo tiene, y si no el punto de color liso.
 * El color se conserva en los dos casos —de fondo—, pero nunca es lo único que
 * distingue una etiqueta de otra: al icono le acompaña siempre el nombre, y en
 * las vistas de trabajo, la abreviatura.
 */
function Muestra({ etiqueta }: { etiqueta: EtiquetaAlumno }) {
  const Icono = iconoDe(etiqueta.icono)
  return (
    <span
      className="color-dato flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
      style={variablesColor(etiqueta.colorId)}
      aria-hidden
    >
      {Icono && <Icono size={14} strokeWidth={2.5} className="color-dato-marca" />}
    </span>
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
  const [icono, setIcono] = useState<string | undefined>(undefined)
  const [temporal, setTemporal] = useState(false)
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
    setIcono(actual?.icono)
    setTemporal(actual?.temporal ?? false)
    setConfirmandoBorrado(false)
  }, [etiqueta, actual?.nombre, actual?.abreviatura, actual?.colorId, actual?.icono, actual?.temporal])

  // La abreviatura se propone a partir del nombre mientras no se toque a mano:
  // «Compensatoria» → «COM». Nunca queda vacía, porque es lo que se pinta.
  const abreviaturaEfectiva = abreviatura.trim() || nombre.trim().slice(0, 3).toUpperCase()

  async function guardar() {
    if (!nombre.trim()) return
    if (actual) {
      await editarEtiqueta(actual.id, {
        nombre,
        abreviatura: abreviaturaEfectiva,
        colorId,
        icono: icono ?? '',
        temporal,
      })
      mostrarAviso(`«${nombre.trim()}» guardada`)
    } else {
      await crearEtiqueta({ nombre, abreviatura: abreviaturaEfectiva, colorId, icono, temporal })
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

        <SelectorIcono valor={icono} onValor={setIcono} colorId={colorId} />

        <div>
          <button
            type="button"
            role="switch"
            aria-checked={temporal}
            onClick={() => setTemporal((v) => !v)}
            className={
              'flex min-h-tap w-full items-center gap-3 rounded-xl border px-3 text-left transition ' +
              (temporal
                ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
                : 'border-borde dark:border-noche-borde')
            }
          >
            <span
              className={
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ' +
                (temporal ? 'border-primario bg-primario text-white' : 'border-borde dark:border-noche-borde')
              }
              aria-hidden
            >
              {temporal && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Es temporal</span>
              <span className="block text-xs texto-suave">
                Al ponérsela a un alumno se propone fecha de fin. Una lesión sí; ACNEE o TDAH, no.
              </span>
            </span>
          </button>
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


/**
 * El icono de la etiqueta, del catálogo cerrado de `lib/iconosEtiqueta.ts`.
 *
 * «Sin icono» es una opción de verdad y la primera: la mayoría de las etiquetas
 * no necesita ninguno, y el punto de color con su abreviatura ya se distingue.
 */
function SelectorIcono({
  valor,
  onValor,
  colorId,
}: {
  valor: string | undefined
  onValor: (id: string | undefined) => void
  colorId: string
}) {
  return (
    <div>
      <span className="etiqueta">Icono</span>
      <p className="mb-2 text-xs texto-suave">
        Opcional. Si lo pones, sustituye al punto de color y se ve de más lejos.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Icono de la etiqueta">
        <button
          type="button"
          aria-pressed={valor === undefined}
          onClick={() => onValor(undefined)}
          className={
            'flex min-h-tap items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ' +
            (valor === undefined
              ? 'border-primario border-2 bg-agua-claro dark:bg-noche-elevada'
              : 'border-borde dark:border-noche-borde')
          }
        >
          <span
            className="color-dato h-4 w-4 shrink-0 rounded-full"
            style={variablesColor(colorId)}
            aria-hidden
          />
          Sin icono
        </button>
        {ICONOS_ETIQUETA.map(({ id, nombre, Icono }) => (
          <button
            key={id}
            type="button"
            aria-pressed={valor === id}
            aria-label={nombre}
            onClick={() => onValor(id)}
            className={
              'flex min-h-tap min-w-tap items-center justify-center rounded-xl border transition ' +
              (valor === id
                ? 'border-primario border-2 bg-agua-claro dark:bg-noche-elevada'
                : 'border-borde dark:border-noche-borde')
            }
          >
            <span
              className="color-dato flex h-7 w-7 items-center justify-center rounded-full"
              style={variablesColor(colorId)}
              aria-hidden
            >
              <Icono size={16} strokeWidth={2.5} className="color-dato-marca" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
