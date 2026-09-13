import { useLiveQuery } from 'dexie-react-hooks'
import { Clipboard, Copy, Save, Shuffle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Campo, CampoArea } from '../components/Campo'
import { CampoTexto } from '../components/CampoTexto'
import { Hoja } from '../components/Hoja'
import { Recursos } from '../components/Recursos'
import { TituloSeccion } from '../components/TituloSeccion'
import { ValoracionSesion } from '../components/ValoracionSesion'
import { db } from '../db/db'
import { gruposVisibles } from '../db/grupos'
import { resumenSesion, type ResumenSesion } from '../db/sesiones'
import {
  deshacerLote,
  duplicarSesion,
  editarSesion,
  eliminarClase,
  pegarEnSesion,
  previsualizarEliminarClase,
  sesionAPlantilla,
  type ClaseEnPrevia,
  type ModoEliminarClase,
  type PreviaEliminarClase,
} from '../db/planificador'
import type { Sesion, UnidadDidactica } from '../db/types'
import { diaLectivo, formatoDiaCorto } from '../lib/fechas'
import { ambitoUnidad, terminologia } from '../lib/literales'
import { navegar } from '../lib/router'
import { useLotesPlan } from '../store/lotesPlan'
import { usePortapapeles } from '../store/portapapeles'
import { useUI } from '../store/ui'

export function SesionDetalle({ sesionId }: { sesionId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const { sesionCopiada, copiar: copiarEnPortapapeles } = usePortapapeles()
  const [duplicando, setDuplicando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const sesion = useLiveQuery(() => db.sesiones.get(sesionId), [sesionId])
  const grupo = useLiveQuery(
    async () => (sesion ? db.grupos.get(sesion.grupoId) : undefined),
    [sesion?.grupoId],
  )
  // Solo las de la etapa del grupo: mezclarlas ofrecería a un grupo de 4 años
  // las unidades de 4.º de Primaria, que apuntan a otro decreto.
  const unidades = useLiveQuery(
    async () =>
      grupo ? db.unidades.where('etapa').equals(grupo.etapa).toArray() : ([] as UnidadDidactica[]),
    [grupo?.etapa],
  )

  if (sesion === undefined) return null
  if (sesion === null) {
    return (
      <>
        <Cabecera titulo="Sesión no encontrada" atras />
        <div className="p-4">
          <button className="btn-suave w-full" onClick={() => navegar('/planificador')}>
            Volver al planificador
          </button>
        </div>
      </>
    )
  }

  const actualizar = (cambios: Partial<Sesion>) => void db.sesiones.update(sesionId, cambios)

  async function guardarFechaHora(cambios: { fecha?: string; horaInicio?: string; horaFin?: string }) {
    try {
      const deshacer = await editarSesion(sesionId, cambios)
      mostrarAviso('Sesión actualizada', deshacer)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se pudo actualizar la sesión.')
    }
  }

  async function guardarComoPlantilla() {
    const id = await sesionAPlantilla(sesionId)
    mostrarAviso('Guardada como plantilla', async () => {
      await db.plantillas.delete(id)
    })
  }

  function copiarEstaSesion() {
    copiarEnPortapapeles({
      titulo: sesion!.titulo,
      udId: sesion!.udId,
      juegos: sesion!.juegos,
      notas: sesion!.notas,
      recursos: sesion!.recursos,
      recursosNecesarios: sesion!.recursosNecesarios,
      comentarios: sesion!.comentarios,
      origenResumen: `${sesion!.titulo || 'Sesión sin título'} · ${grupo?.nombre ?? ''}`,
    })
    mostrarAviso('Sesión copiada. Ve al grupo que quieras y pégala en la sesión que decidas.')
  }

  async function pegarAqui() {
    if (!sesionCopiada) return
    const deshacer = await pegarEnSesion(sesionId, sesionCopiada)
    mostrarAviso('Contenido pegado', deshacer)
  }

  const diaSemana = diaLectivo(sesion.fecha)
  const franjaHabitual = grupo?.horario.find((f) => f.diaSemana === diaSemana)
  const tieneHorarioPropio = !!(sesion.horaInicio && sesion.horaFin)
  const horaMostrada = tieneHorarioPropio
    ? `${sesion.horaInicio}–${sesion.horaFin}`
    : franjaHabitual
      ? `${franjaHabitual.horaInicio}–${franjaHabitual.horaFin}`
      : null

  return (
    <>
      <Cabecera
        titulo={sesion.titulo || 'Sesión sin título'}
        atras
        subtitulo={
          grupo && (
            <span className="flex items-center gap-2">
              <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
              <span>{grupo.nombre}</span>
              <span className="cifra">
                · {formatoDiaCorto(sesion.fecha)}
                {horaMostrada && ` · ${horaMostrada}`}
              </span>
            </span>
          )
        }
      />

      <div className="space-y-4 p-4">
        <div>
          <label className="etiqueta" htmlFor="s-titulo">
            Título
          </label>
          <Campo
            id="s-titulo"
            className="campo"
            valor={sesion.titulo}
            onValor={(v) => actualizar({ titulo: v })}
            placeholder="Circuito de equilibrio"
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="s-ud">
            {terminologia(grupo?.etapa ?? 'primaria').unidad}
          </label>
          <select
            id="s-ud"
            className="campo"
            value={sesion.udId ?? ''}
            onChange={(e) => actualizar({ udId: e.target.value || undefined })}
          >
            <option value="">Sin unidad</option>
            {unidades?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.titulo} ({ambitoUnidad(u.etapa, u.niveles)} ·{' '}
                {u.trimestre === null ? 'sin trimestre' : `T${u.trimestre}`})
              </option>
            ))}
          </select>
        </div>

        <CampoTexto
          id="s-notas"
          etiqueta="Descripción"
          valor={sesion.notas}
          onValor={(v) => actualizar({ notas: v })}
          placeholder="Organización, variantes, qué vigilar…"
        />

        <div>
          <label className="etiqueta" htmlFor="s-recursos-necesarios">
            Recursos necesarios
          </label>
          <CampoArea
            id="s-recursos-necesarios"
            className="campo h-20 resize-none py-2"
            valor={sesion.recursosNecesarios ?? ''}
            onValor={(v) => actualizar({ recursosNecesarios: v })}
            placeholder="12 conos, silbato, petos de 2 colores…"
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="s-comentarios">
            Comentarios
          </label>
          <CampoArea
            id="s-comentarios"
            className="campo h-20 resize-none py-2"
            valor={sesion.comentarios ?? ''}
            onValor={(v) => actualizar({ comentarios: v })}
            placeholder="Cómo fue realmente, incidencias…"
          />
        </div>

        <Recursos recursos={sesion.recursos} onCambio={(recursos) => actualizar({ recursos })} />

        <section>
          <TituloSeccion>Cómo ha ido</TituloSeccion>
          <ValoracionSesion
            valor={sesion.valoracion}
            onCambio={(valoracion) => actualizar({ valoracion })}
          />
        </section>

        <section>
          <TituloSeccion>Fecha y horario</TituloSeccion>

          <label className="etiqueta" htmlFor="s-fecha">
            Fecha
          </label>
          <input
            id="s-fecha"
            type="date"
            className="campo cifra"
            value={sesion.fecha}
            onChange={(e) => void guardarFechaHora({ fecha: e.target.value })}
          />

          <button
            className="btn-suave mt-2 w-full"
            onClick={() =>
              void guardarFechaHora(
                tieneHorarioPropio
                  ? { horaInicio: undefined, horaFin: undefined }
                  : {
                      horaInicio: franjaHabitual?.horaInicio ?? '09:00',
                      horaFin: franjaHabitual?.horaFin ?? '09:45',
                    },
              )
            }
          >
            {tieneHorarioPropio ? 'Usar el horario habitual del grupo' : 'Poner un horario distinto ese día'}
          </button>

          {tieneHorarioPropio && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="time"
                className="campo cifra"
                value={sesion.horaInicio}
                onChange={(e) => void guardarFechaHora({ horaInicio: e.target.value })}
                aria-label="Hora de inicio de esta sesión"
              />
              <input
                type="time"
                className="campo cifra"
                value={sesion.horaFin}
                onChange={(e) => void guardarFechaHora({ horaFin: e.target.value })}
                aria-label="Hora de fin de esta sesión"
              />
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-suave" onClick={copiarEstaSesion}>
            <Copy size={18} aria-hidden />
            Copiar
          </button>
          <button className="btn-suave" onClick={() => void pegarAqui()} disabled={!sesionCopiada}>
            <Clipboard size={18} aria-hidden />
            Pegar aquí
          </button>
        </div>
        {sesionCopiada && (
          <p className="text-xs texto-suave">Copiado: {sesionCopiada.origenResumen}</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-suave" onClick={() => setDuplicando(true)}>
            <Copy size={18} aria-hidden />
            Duplicar
          </button>
          <button className="btn-suave" onClick={() => void guardarComoPlantilla()}>
            <Save size={18} aria-hidden />
            Plantilla
          </button>
        </div>

        <button
          className="btn-suave w-full"
          onClick={() => navegar(`/equipos/${sesion.grupoId}/sesion-${sesionId}`)}
        >
          <Shuffle size={18} aria-hidden />
          Generar equipos para esta sesión
        </button>

        <button className="btn w-full text-acento" onClick={() => setEliminando(true)}>
          <Trash2 size={18} aria-hidden />
          Eliminar sesión
        </button>
      </div>

      <HojaDuplicar abierta={duplicando} sesion={sesion} onCerrar={() => setDuplicando(false)} />

      <HojaEliminarSesion
        abierta={eliminando}
        sesion={sesion}
        onCerrar={() => setEliminando(false)}
      />
    </>
  )
}

/** Duplicar a otro grupo y fecha: crea una sesión nueva (distinto de copiar/pegar). */
function HojaDuplicar({
  abierta,
  sesion,
  onCerrar,
}: {
  abierta: boolean
  sesion: Sesion
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const grupos = useLiveQuery(() => gruposVisibles(), [])
  const [grupoId, setGrupoId] = useState(sesion.grupoId)
  const [fecha, setFecha] = useState(sesion.fecha)

  async function duplicar() {
    const id = await duplicarSesion(sesion.id, { grupoId, fecha })
    onCerrar()
    mostrarAviso('Sesión duplicada', async () => {
      await db.sesiones.delete(id)
    })
    navegar(`/sesiones/${id}`)
  }

  return (
    <Hoja abierta={abierta} titulo="Duplicar sesión" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="dup-grupo">
            Grupo de destino
          </label>
          <select
            id="dup-grupo"
            className="campo"
            value={grupoId}
            onChange={(e) => setGrupoId(e.target.value)}
          >
            {grupos?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta" htmlFor="dup-fecha">
            Fecha
          </label>
          <input
            id="dup-fecha"
            type="date"
            className="campo cifra"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        <p className="text-xs texto-suave">
          Crea una sesión nueva en esa fecha, con título, juegos, descripción y recursos. La
          valoración no se copia: es de aquella clase concreta.
        </p>

        <button className="btn-primario w-full" onClick={() => void duplicar()}>
          Duplicar
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Eliminar una sesión: EXACTAMENTE dos opciones (`eliminarClase`).
 *
 * «Eliminar y mover a la derecha» es la clase que no se da —excursión, salida—:
 * todo lo programado se retrasa una sesión. «Eliminar la sesión» la quita con su
 * contenido y no mueve nada más. Antes de confirmar se enseña la previa: qué
 * contenido va a qué clase, qué desaparece y qué se queda sin ubicación. Y si
 * la clase tiene registros del alumnado, cuántos, aunque no se borren.
 */
function HojaEliminarSesion({
  abierta,
  sesion,
  onCerrar,
}: {
  abierta: boolean
  sesion: Sesion
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const registrarLote = useLotesPlan((s) => s.registrar)
  const quitarLote = useLotesPlan((s) => s.quitar)
  const [modo, setModo] = useState<ModoEliminarClase | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Solo mientras la hoja está abierta: recontar en cada render de la página
  // sería trabajo para nada.
  const resumen = useLiveQuery(
    async () => (abierta ? resumenSesion(sesion.id) : undefined),
    [abierta, sesion.id],
  )
  const previa = useLiveQuery(
    async () => (abierta && modo ? previsualizarEliminarClase(sesion.id, modo) : undefined),
    [abierta, modo, sesion.id],
  )

  function cerrar() {
    setModo(null)
    setError(null)
    onCerrar()
  }

  async function confirmar() {
    if (!modo) return
    try {
      const { lote } = await eliminarClase(sesion.id, modo)
      registrarLote(lote)
      cerrar()
      navegar('/planificador')
      mostrarAviso(
        modo === 'mover' ? 'Sesión eliminada; lo programado se ha retrasado' : 'Sesión eliminada',
        async () => {
          await deshacerLote(lote)
          quitarLote(lote.id)
        },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido eliminar la sesión')
    }
  }

  return (
    <Hoja abierta={abierta} titulo="Eliminar sesión" onCerrar={cerrar}>
      <div className="space-y-3">
        {resumen && <AvisoRegistros resumen={resumen} />}

        {!modo ? (
          <>
            <button className="btn-primario w-full" onClick={() => setModo('mover')}>
              Eliminar y mover a la derecha
            </button>
            <p className="text-xs texto-suave">
              La clase no se da (excursión, salida…): su contenido y el de las sesiones siguientes
              pasan una sesión adelante. No se pierde nada, se pospone.
            </p>

            <button className="btn-suave w-full" onClick={() => setModo('eliminar')}>
              Eliminar la sesión
            </button>
            <p className="text-xs texto-suave">
              La sesión desaparece con su contenido. El resto de la programación se queda
              exactamente donde está.
            </p>

            <button className="btn w-full" onClick={cerrar}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            {previa ? (
              <PreviaEliminar previa={previa} resumen={resumen} />
            ) : (
              <p className="text-sm texto-suave">Calculando…</p>
            )}

            {error && <p className="text-sm font-semibold text-acento">{error}</p>}

            <button
              className="btn-peligro w-full"
              onClick={() => void confirmar()}
              disabled={!previa}
            >
              <Trash2 size={18} aria-hidden />
              {modo === 'mover' ? 'Eliminar y mover' : 'Eliminar la sesión'}
            </button>
            <button className="btn w-full" onClick={() => setModo(null)}>
              Volver
            </button>
          </>
        )}
      </div>
    </Hoja>
  )
}

const rotuloClase = (c: ClaseEnPrevia) => `${formatoDiaCorto(c.fecha)}${c.franja ? ` · ${c.franja}` : ''}`

/** La previa de la eliminación, antes de escribir nada. */
function PreviaEliminar({
  previa,
  resumen,
}: {
  previa: PreviaEliminarClase
  resumen: ResumenSesion | undefined
}) {
  const { eliminada } = previa

  if (previa.modo === 'eliminar') {
    const pierde = resumen
      ? [
          !eliminada.vacia && `«${eliminada.titulo}»`,
          resumen.juegos > 0 && `${resumen.juegos} ${resumen.juegos === 1 ? 'juego' : 'juegos'}`,
          resumen.tieneNotas && 'la descripción y los comentarios',
          resumen.tieneValoracion && 'la valoración',
        ].filter((x): x is string => typeof x === 'string')
      : []
    return (
      <div className="tarjeta space-y-1 border-l-4 border-acento text-sm">
        <p>
          Desaparece la sesión del <strong className="cifra">{rotuloClase(eliminada)}</strong>
          {pierde.length > 0 ? (
            <>
              {' '}
              y con ella <strong>{enumerar(pierde)}</strong>.
            </>
          ) : (
            '. No tenía contenido.'
          )}
        </p>
        <p className="texto-suave">Nada más se mueve: el resto de la programación sigue igual.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="tarjeta space-y-2 text-sm">
        <p>
          Desaparece la sesión del <strong className="cifra">{rotuloClase(eliminada)}</strong>.
        </p>
        {eliminada.vacia ? (
          <p className="texto-suave">Estaba vacía: no hay contenido que mover.</p>
        ) : (
          <>
            <p className="texto-suave">Lo programado pasa una sesión adelante:</p>
            <ol className="max-h-60 space-y-1 overflow-y-auto pr-1">
              {previa.movimientos.map((m) => (
                <li
                  key={`${m.a.fecha}|${m.a.franja}`}
                  className="flex items-center gap-2 rounded-xl bg-agua-claro px-3 py-1.5 dark:bg-noche-elevada"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {m.titulo}
                    {m.unidad && <span className="texto-suave"> · {m.unidad}</span>}
                  </span>
                  <span className="cifra shrink-0 text-xs font-semibold">→ {rotuloClase(m.a)}</span>
                </li>
              ))}
            </ol>
            {previa.seDetieneEn && (
              <p className="texto-suave">
                Se detiene en la sesión vacía del{' '}
                <span className="cifra">{rotuloClase(previa.seDetieneEn)}</span>: de ahí en adelante
                no cambia nada.
              </p>
            )}
          </>
        )}
      </div>

      {previa.sinUbicacion && (
        <div className="tarjeta border-2 border-acento p-3 text-sm">
          <p className="font-bold text-acento">Un contenido se queda sin ubicación</p>
          <p className="mt-1">
            «{previa.sinUbicacion.titulo}»
            {previa.sinUbicacion.unidad ? ` (${previa.sinUbicacion.unidad})` : ' (sin unidad)'} no
            tiene ninguna sesión vacía por delante donde ir. No se crea ninguna sesión nueva: si
            sigues, ese contenido se pierde. Se puede deshacer.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Registros del alumnado de esa clase, con cifras (§ M9: nunca destruir datos en
 * silencio). Van por fecha y grupo, no por sesión, así que NO se borran: se
 * cuentan antes de confirmar para que no haya sorpresa ni susto.
 */
function AvisoRegistros({ resumen }: { resumen: ResumenSesion }) {
  const registros = [
    resumen.asistencias > 0 &&
      `${resumen.asistencias} ${resumen.asistencias === 1 ? 'registro' : 'registros'} de asistencia`,
    resumen.observaciones > 0 &&
      `${resumen.observaciones} ${resumen.observaciones === 1 ? 'observación' : 'observaciones'}`,
    resumen.calificaciones > 0 &&
      `${resumen.calificaciones} ${resumen.calificaciones === 1 ? 'calificación' : 'calificaciones'}`,
  ].filter((x): x is string => typeof x === 'string')

  if (registros.length === 0) return null
  return (
    <div className="tarjeta space-y-1 border-l-4 border-acento text-sm">
      <p>
        Esta clase tiene datos registrados: <strong>{enumerar(registros)}</strong>.
      </p>
      <p className="texto-suave">No se borran: siguen guardados con su fecha.</p>
    </div>
  )
}

/** «a, b y c» — enumeración en español, sin coma antes de la conjunción. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}
