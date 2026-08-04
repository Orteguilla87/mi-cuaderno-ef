import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  Shirt,
  Undo2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { AccionCabecera, Cabecera } from '../components/Cabecera'
import { CampoArea } from '../components/Campo'
import { EstadoVacio } from '../components/EstadoVacio'
import { Hoja } from '../components/Hoja'
import {
  alternarChandal,
  ciclarEstado,
  leerAsistenciaGrupo,
  marcarTodosPresentes,
  resumirAsistencia,
} from '../db/asistencia'
import { db } from '../db/db'
import type { Alumno, Asistencia, EstadoAsistencia } from '../db/types'
import { usePulsacionLarga } from '../lib/pulsacionLarga'
import { aISO, etiquetaDia, sumarDias } from '../lib/fechas'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

/** Aspecto de cada estado. Solo tokens: nada de hex sueltos (§3.1). */
const ESTADOS: Record<
  EstadoAsistencia,
  { etiqueta: string; Icono: typeof Check; tarjeta: string; punto: string }
> = {
  presente: {
    etiqueta: 'Presente',
    Icono: Check,
    tarjeta: 'border-lima bg-lima/15 dark:bg-lima/20',
    punto: 'bg-lima-oscuro text-white',
  },
  falta: {
    etiqueta: 'Falta',
    Icono: X,
    tarjeta: 'border-acento bg-acento/10 dark:bg-acento/20',
    punto: 'bg-acento text-white',
  },
  retraso: {
    etiqueta: 'Retraso',
    Icono: Clock,
    tarjeta: 'border-aviso bg-aviso/10 dark:bg-aviso/20',
    punto: 'bg-aviso text-white',
  },
  justificada: {
    etiqueta: 'Justificada',
    Icono: FileCheck2,
    tarjeta: 'border-agua bg-agua/25 dark:bg-agua/15',
    punto: 'bg-primario text-white',
  },
}

export function PaseLista({ grupoId, fecha }: { grupoId: string; fecha?: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const dia = fecha ?? aISO()

  // Pila local de deshacer: un snackbar por cada toque sería insoportable con
  // 25 alumnos, así que el botón «Deshacer» de la cabecera va vaciando la pila.
  const [pila, setPila] = useState<(() => Promise<void>)[]>([])
  const [detalle, setDetalle] = useState<Alumno | null>(null)

  const grupo = useLiveQuery(() => db.grupos.get(grupoId), [grupoId])
  const alumnos = useLiveQuery(async () => {
    const lista = await db.alumnos.where('grupoId').equals(grupoId).toArray()
    return lista
      .filter((a) => a.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  }, [grupoId])

  const registros = useLiveQuery(
    async () => leerAsistenciaGrupo((alumnos ?? []).map((a) => a.id), dia),
    [alumnos, dia],
  )

  if (grupo === undefined || alumnos === undefined) {
    return (
      <>
        <Cabecera titulo="Pase de lista" />
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl2 bg-agua-claro dark:bg-noche-elevada"
            />
          ))}
        </div>
      </>
    )
  }
  if (grupo === null) {
    return (
      <>
        <Cabecera titulo="Grupo no encontrado" atras />
        <div className="p-4">
          <button className="btn-suave w-full" onClick={() => navegar('/grupos')}>
            Volver a Grupos
          </button>
        </div>
      </>
    )
  }

  const porAlumno = registros ?? new Map<string, Asistencia>()
  const resumen = resumirAsistencia([...porAlumno.values()])
  const sinRegistrar = alumnos.length - porAlumno.size

  function apilar(deshacer: () => Promise<void>) {
    setPila((p) => [...p, deshacer])
  }

  async function deshacer() {
    const ultima = pila[pila.length - 1]
    if (!ultima) return
    setPila((p) => p.slice(0, -1))
    await ultima()
  }

  async function todosPresentes() {
    const deshacerBulk = await marcarTodosPresentes(alumnos!, dia)
    apilar(deshacerBulk)
    mostrarAviso(`${alumnos!.length} presentes`, async () => {
      await deshacerBulk()
      setPila((p) => p.filter((f) => f !== deshacerBulk))
    })
  }

  const irA = (delta: number) => navegar(`/asistencia/${grupoId}/${sumarDias(dia, delta)}`)

  return (
    <>
      <Cabecera
        titulo={grupo.nombre}
        atras
        subtitulo={
          <span className="flex items-center gap-2">
            <span>{etiquetaDia(dia)}</span>
            {porAlumno.size > 0 && (
              <span className="cifra">
                · {resumen.presentes + resumen.retrasos}/{alumnos.length} en clase
              </span>
            )}
          </span>
        }
        acciones={
          pila.length > 0 && (
            <AccionCabecera onClick={deshacer}>
              <Undo2 size={18} aria-hidden />
              <span className="ml-1.5">Deshacer{pila.length > 1 ? ` (${pila.length})` : ''}</span>
            </AccionCabecera>
          )
        }
      />

      <div className="space-y-4 p-4">
        <BarraFecha dia={dia} onIr={irA} />

        {alumnos.length === 0 ? (
          <EstadoVacio
            titulo="Grupo sin alumnado"
            descripcion="Importa el listado de clase antes de pasar lista."
            accion={
              <button
                className="btn-primario w-full"
                onClick={() => navegar(`/grupos/${grupoId}`)}
              >
                Ir al grupo
              </button>
            }
          />
        ) : (
          <>
            {sinRegistrar > 0 && (
              <button className="btn-primario w-full" onClick={todosPresentes}>
                <Check size={20} aria-hidden />
                Todos presentes
              </button>
            )}

            {porAlumno.size > 0 && <Resumen resumen={resumen} sinRegistrar={sinRegistrar} />}

            <ul className="grid grid-cols-2 gap-2">
              {alumnos.map((a) => (
                <TarjetaAlumno
                  key={a.id}
                  alumno={a}
                  registro={porAlumno.get(a.id)}
                  onTocar={async () => apilar(await ciclarEstado(a.id, dia))}
                  onChandal={async () => apilar(await alternarChandal(a.id, dia))}
                  onDetalle={() => setDetalle(a)}
                />
              ))}
            </ul>

            <p className="text-center text-xs texto-suave">
              Toca para cambiar el estado · mantén pulsado para el detalle
            </p>
          </>
        )}
      </div>

      <HojaDetalle
        alumno={detalle}
        registro={detalle ? porAlumno.get(detalle.id) : undefined}
        fecha={dia}
        onCerrar={() => setDetalle(null)}
      />
    </>
  )
}

function BarraFecha({ dia, onIr }: { dia: string; onIr: (delta: number) => void }) {
  const hoy = aISO()
  return (
    <div className="flex items-center gap-2">
      <button className="btn-suave px-3" onClick={() => onIr(-1)} aria-label="Día anterior">
        <ChevronLeft size={20} aria-hidden />
      </button>
      <span className="cifra flex-1 text-center text-sm font-bold">{etiquetaDia(dia)}</span>
      <button
        className="btn-suave px-3"
        onClick={() => onIr(1)}
        aria-label="Día siguiente"
        disabled={dia >= hoy}
      >
        <ChevronRight size={20} aria-hidden />
      </button>
    </div>
  )
}

function Resumen({
  resumen,
  sinRegistrar,
}: {
  resumen: ReturnType<typeof resumirAsistencia>
  sinRegistrar: number
}) {
  const datos = [
    { etiqueta: 'Presentes', valor: resumen.presentes, clase: 'text-lima-oscuro' },
    { etiqueta: 'Faltas', valor: resumen.faltas, clase: 'text-acento' },
    { etiqueta: 'Retrasos', valor: resumen.retrasos, clase: 'text-aviso-oscuro' },
    { etiqueta: 'Sin chándal', valor: resumen.sinChandal, clase: 'text-primario' },
  ]
  return (
    <div className="tarjeta py-3">
      <dl className="grid grid-cols-4 gap-1 text-center">
        {datos.map((d) => (
          <div key={d.etiqueta}>
            <dd className={`cifra text-xl font-bold ${d.clase} dark:text-noche-texto`}>
              {d.valor}
            </dd>
            <dt className="text-xs texto-suave">{d.etiqueta}</dt>
          </div>
        ))}
      </dl>
      {sinRegistrar > 0 && (
        <p className="mt-2 text-center text-xs texto-suave">
          {sinRegistrar} sin registrar todavía
        </p>
      )}
    </div>
  )
}

function TarjetaAlumno({
  alumno,
  registro,
  onTocar,
  onChandal,
  onDetalle,
}: {
  alumno: Alumno
  registro?: Asistencia
  onTocar: () => void
  onChandal: () => void
  onDetalle: () => void
}) {
  const estado = registro?.estado
  const aspecto = estado ? ESTADOS[estado] : null

  // Pulsación larga para el detalle; el toque normal cicla el estado.
  const larga = usePulsacionLarga(onDetalle)

  return (
    <li>
      <div
        className={
          'relative flex min-h-[76px] w-full flex-col justify-center rounded-xl2 border-2 p-2 pr-10 transition ' +
          (aspecto
            ? aspecto.tarjeta
            : 'border-borde bg-superficie dark:border-noche-borde dark:bg-noche-superficie')
        }
      >
        <button
          className="text-left"
          {...larga.props}
          onClick={() => {
            // Tras una pulsación larga el click también dispara: se ignora para
            // no cambiar el estado sin querer al abrir el detalle.
            if (larga.fueLargo.current) return
            onTocar()
          }}
          aria-label={`${alumno.alias || alumno.nombre}: ${aspecto?.etiqueta ?? 'sin registrar'}`}
        >
          <span className="block truncate text-base font-bold leading-tight">
            {alumno.alias || alumno.nombre}
          </span>
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold texto-suave">
            {aspecto ? (
              <>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${aspecto.punto}`}
                >
                  <aspecto.Icono size={13} strokeWidth={3} aria-hidden />
                </span>
                {aspecto.etiqueta}
              </>
            ) : (
              'Sin registrar'
            )}
          </span>
        </button>

        <button
          onClick={onChandal}
          className={
            'absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-xl transition ' +
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
            (registro && !registro.chandal
              ? 'bg-acento text-white'
              : registro?.chandal
                ? 'text-lima-oscuro dark:text-lima'
                : 'text-tinta-tenue')
          }
          aria-label={
            registro?.chandal === false
              ? `${alumno.alias || alumno.nombre}: sin chándal`
              : `${alumno.alias || alumno.nombre}: con chándal`
          }
          aria-pressed={registro?.chandal === false}
        >
          <Shirt size={20} aria-hidden />
        </button>
      </div>
    </li>
  )
}

/** Detalle de un alumno en esa fecha: estado explícito y observación del día. */
function HojaDetalle({
  alumno,
  registro,
  fecha,
  onCerrar,
}: {
  alumno: Alumno | null
  registro?: Asistencia
  fecha: string
  onCerrar: () => void
}) {
  if (!alumno) return null

  async function fijarEstado(estado: EstadoAsistencia) {
    if (registro) {
      await db.asistencias.update(registro.id, { estado })
    } else {
      await db.asistencias.add({
        id: crypto.randomUUID(),
        alumnoId: alumno!.id,
        fecha,
        estado,
        chandal: true,
      })
    }
  }

  return (
    <Hoja abierta={!!alumno} titulo={alumno.alias || alumno.nombre} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <span className="etiqueta">Estado</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(ESTADOS) as EstadoAsistencia[]).map((e) => {
              const { etiqueta, Icono } = ESTADOS[e]
              const activo = registro?.estado === e
              return (
                <button
                  key={e}
                  className={activo ? 'btn-primario' : 'btn-suave'}
                  onClick={() => void fijarEstado(e)}
                >
                  <Icono size={18} aria-hidden />
                  {etiqueta}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <span className="etiqueta">Chándal</span>
          <button
            className={registro?.chandal === false ? 'btn-acento w-full' : 'btn-suave w-full'}
            onClick={() => void alternarChandal(alumno!.id, fecha)}
          >
            <Shirt size={18} aria-hidden />
            {registro?.chandal === false ? 'Sin chándal' : 'Con chándal'}
          </button>
        </div>

        <div>
          <label className="etiqueta" htmlFor="obs-dia">
            Observación del día
          </label>
          <CampoArea
            id="obs-dia"
            className="campo h-20 resize-none py-2"
            valor={registro?.observacion ?? ''}
            disabled={!registro}
            placeholder={registro ? 'Se encontró mal, avisa la familia…' : 'Marca antes un estado'}
            onValor={(v) => {
              if (registro) void db.asistencias.update(registro.id, { observacion: v })
            }}
          />
        </div>

        <button
          className="btn-suave w-full"
          onClick={() => {
            onCerrar()
            navegar(`/alumnos/${alumno!.id}`)
          }}
        >
          Ver ficha completa
        </button>
      </div>
    </Hoja>
  )
}
