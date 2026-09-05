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
  duplicarSesion,
  editarSesion,
  eliminarSesion,
  pegarEnSesion,
  sesionAPlantilla,
} from '../db/planificador'
import type { Sesion, UnidadDidactica } from '../db/types'
import { diaLectivo, formatoDiaCorto, formatoCorto } from '../lib/fechas'
import { ambitoUnidad, terminologia } from '../lib/literales'
import { navegar } from '../lib/router'
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
 * Eliminar una sesión: tres cosas distintas que antes se confundían en una.
 *
 * «Eliminar esta clase» quita la clase de ESE día —el hueco viene del horario
 * del grupo, así que sin cancelarlo la clase reaparecía vacía y parecía que no
 * se había borrado nada—. «Vaciar la planificación» hace lo de antes: borra el
 * contenido y deja el hueco libre. Y cambiar el horario del grupo, que afecta a
 * TODAS las semanas, se enseña como lo que es: otra acción, en otro sitio.
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
  // Solo mientras la hoja está abierta: recontar en cada render de la página
  // sería trabajo para nada.
  const resumen = useLiveQuery(
    async () => (abierta ? resumenSesion(sesion.id) : undefined),
    [abierta, sesion.id],
  )

  async function eliminar(opciones: { desplazar?: boolean; cancelar?: boolean }) {
    const deshacer = await eliminarSesion(sesion.id, !!opciones.desplazar, !!opciones.cancelar)
    onCerrar()
    navegar('/planificador')
    mostrarAviso(
      opciones.desplazar
        ? 'Sesión eliminada; las siguientes se han corrido'
        : opciones.cancelar
          ? `Clase cancelada el ${formatoCorto(sesion.fecha)}`
          : 'Planificación vaciada',
      deshacer,
    )
  }

  return (
    <Hoja abierta={abierta} titulo="Eliminar sesión" onCerrar={onCerrar}>
      <div className="space-y-3">
        {resumen && <AvisoContenido resumen={resumen} />}

        <button className="btn-primario w-full" onClick={() => void eliminar({ cancelar: true })}>
          Eliminar esta clase
        </button>
        <p className="text-xs texto-suave">
          Quita la clase del {formatoCorto(sesion.fecha)} de Hoy, del planificador y del calendario.
          El horario del grupo no cambia: el resto de semanas siguen igual, y puedes restaurarla
          desde ese mismo día.
        </p>

        <button className="btn-suave w-full" onClick={() => void eliminar({ desplazar: true })}>
          Eliminar y desplazar las siguientes
        </button>
        <p className="text-xs texto-suave">
          Cada sesión posterior pasa a la clase anterior de la secuencia, cerrando el hueco.
        </p>

        <button className="btn-suave w-full" onClick={() => void eliminar({})}>
          Vaciar la planificación
        </button>
        <p className="text-xs texto-suave">
          Borra el contenido pero mantiene la clase en el calendario, lista para planificar de
          nuevo.
        </p>

        <button
          className="btn w-full"
          onClick={() => {
            onCerrar()
            navegar(`/grupos/${sesion.grupoId}`)
          }}
        >
          Cambiar el horario del grupo
        </button>
        <p className="text-xs texto-suave">
          Ojo: el horario afecta a todas las semanas del curso, no solo a este día.
        </p>

        <button className="btn w-full" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Qué se pierde y qué no, con cifras (§ M9: nunca destruir datos en silencio).
 * La asistencia y las observaciones van por fecha y grupo, no por sesión, así
 * que sobreviven al borrado — y decirlo evita tanto la sorpresa como el susto.
 */
function AvisoContenido({ resumen }: { resumen: ResumenSesion }) {
  const pierde = [
    resumen.juegos > 0 && `${resumen.juegos} ${resumen.juegos === 1 ? 'juego' : 'juegos'}`,
    resumen.tieneNotas && 'la descripción y los comentarios',
    resumen.tieneValoracion && 'la valoración',
  ].filter((x): x is string => typeof x === 'string')

  const conserva = [
    resumen.asistencias > 0 &&
      `${resumen.asistencias} ${resumen.asistencias === 1 ? 'registro' : 'registros'} de asistencia`,
    resumen.observaciones > 0 &&
      `${resumen.observaciones} ${resumen.observaciones === 1 ? 'observación' : 'observaciones'}`,
  ].filter((x): x is string => typeof x === 'string')

  return (
    <div className="tarjeta space-y-1 border-l-4 border-acento">
      <p className="text-sm">
        {pierde.length > 0 ? (
          <>
            Se pierde el contenido de la sesión: <strong>{enumerar(pierde)}</strong>.
          </>
        ) : (
          'Esta sesión no tiene contenido guardado.'
        )}
      </p>
      {conserva.length > 0 && (
        <p className="text-sm texto-suave">
          No se borra nada más: {enumerar(conserva)} de ese día se conservan.
        </p>
      )}
    </div>
  )
}

/** «a, b y c» — enumeración en español, sin coma antes de la conjunción. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}
