import { useLiveQuery } from 'dexie-react-hooks'
import {
  Clipboard,
  Copy,
  GripVertical,
  Link2,
  Plus,
  Save,
  Shuffle,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { TituloSeccion } from '../components/TituloSeccion'
import { ValoracionSesion } from '../components/ValoracionSesion'
import { db } from '../db/db'
import {
  duplicarSesion,
  editarSesion,
  eliminarSesion,
  pegarEnSesion,
  sesionAPlantilla,
} from '../db/planificador'
import type { Juego, Recurso, Sesion } from '../db/types'
import { diaLectivo, formatoDiaCorto } from '../lib/fechas'
import { navegar } from '../lib/router'
import { usePortapapeles } from '../store/portapapeles'
import { useUI } from '../store/ui'
import { Juegos } from './Juegos'

export function SesionDetalle({ sesionId }: { sesionId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const { sesionCopiada, copiar: copiarEnPortapapeles } = usePortapapeles()
  const [eligiendoJuego, setEligiendoJuego] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const sesion = useLiveQuery(() => db.sesiones.get(sesionId), [sesionId])
  const grupo = useLiveQuery(
    async () => (sesion ? db.grupos.get(sesion.grupoId) : undefined),
    [sesion?.grupoId],
  )
  const unidades = useLiveQuery(() => db.unidades.toArray(), [])

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

  function anadirJuego(j: Juego) {
    if (sesion!.juegos.some((x) => x.gameId === j.id)) return
    actualizar({ juegos: [...sesion!.juegos, { gameId: j.id, nombre: j.nombre }] })
  }

  function quitarJuego(gameId: string) {
    actualizar({ juegos: sesion!.juegos.filter((j) => j.gameId !== gameId) })
  }

  function moverJuego(indice: number, delta: number) {
    const lista = [...sesion!.juegos]
    const destino = indice + delta
    if (destino < 0 || destino >= lista.length) return
    ;[lista[indice], lista[destino]] = [lista[destino], lista[indice]]
    actualizar({ juegos: lista })
  }

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
          <input
            id="s-titulo"
            className="campo"
            value={sesion.titulo}
            onChange={(e) => actualizar({ titulo: e.target.value })}
            placeholder="Circuito de equilibrio"
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="s-ud">
            Unidad didáctica
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
                {u.titulo} ({u.nivel}º · T{u.trimestre})
              </option>
            ))}
          </select>
        </div>

        <section>
          <TituloSeccion>Juegos</TituloSeccion>

          {sesion.juegos.length === 0 ? (
            <p className="mb-2 text-sm texto-suave">
              Todavía no hay juegos. Añádelos del banco en dos toques.
            </p>
          ) : (
            <ul className="mb-2 space-y-2">
              {sesion.juegos.map((j, i) => (
                <li
                  key={j.gameId}
                  className="flex items-center gap-2 rounded-xl border border-borde bg-superficie p-2 dark:border-noche-borde dark:bg-noche-superficie"
                >
                  <span className="flex flex-col text-tinta-tenue">
                    <button
                      onClick={() => moverJuego(i, -1)}
                      disabled={i === 0}
                      className="px-1 disabled:opacity-30"
                      aria-label={`Subir ${j.nombre}`}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moverJuego(i, 1)}
                      disabled={i === sesion.juegos.length - 1}
                      className="px-1 disabled:opacity-30"
                      aria-label={`Bajar ${j.nombre}`}
                    >
                      ▼
                    </button>
                  </span>
                  <GripVertical size={16} className="shrink-0 text-tinta-tenue" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-semibold">{j.nombre}</span>
                  <button
                    onClick={() => quitarJuego(j.gameId)}
                    className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                    aria-label={`Quitar ${j.nombre}`}
                  >
                    <X size={18} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button className="btn-suave w-full" onClick={() => setEligiendoJuego(true)}>
            <Plus size={18} aria-hidden />
            Añadir del banco
          </button>
        </section>

        <div>
          <label className="etiqueta" htmlFor="s-notas">
            Descripción
          </label>
          <textarea
            id="s-notas"
            className="campo h-28 resize-none py-2"
            value={sesion.notas}
            onChange={(e) => actualizar({ notas: e.target.value })}
            placeholder="Organización, variantes, qué vigilar…"
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="s-recursos-necesarios">
            Recursos necesarios
          </label>
          <textarea
            id="s-recursos-necesarios"
            className="campo h-20 resize-none py-2"
            value={sesion.recursosNecesarios ?? ''}
            onChange={(e) => actualizar({ recursosNecesarios: e.target.value })}
            placeholder="12 conos, silbato, petos de 2 colores…"
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="s-comentarios">
            Comentarios
          </label>
          <textarea
            id="s-comentarios"
            className="campo h-20 resize-none py-2"
            value={sesion.comentarios ?? ''}
            onChange={(e) => actualizar({ comentarios: e.target.value })}
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

      <Hoja abierta={eligiendoJuego} titulo="Añadir juego" onCerrar={() => setEligiendoJuego(false)}>
        <Juegos
          onElegir={(j) => anadirJuego(j)}
          seleccionados={new Set(sesion.juegos.map((j) => j.gameId))}
        />
      </Hoja>

      <HojaDuplicar abierta={duplicando} sesion={sesion} onCerrar={() => setDuplicando(false)} />

      <HojaEliminarSesion
        abierta={eliminando}
        sesion={sesion}
        onCerrar={() => setEliminando(false)}
      />
    </>
  )
}

function Recursos({
  recursos,
  onCambio,
}: {
  recursos: Recurso[]
  onCambio: (r: Recurso[]) => void
}) {
  const [tipo, setTipo] = useState<Recurso['tipo']>('enlace')
  const [valor, setValor] = useState('')

  function anadir() {
    if (!valor.trim()) return
    onCambio([...recursos, { tipo, valor: valor.trim() }])
    setValor('')
  }

  return (
    <section>
      <TituloSeccion>Enlaces y notas</TituloSeccion>

      {recursos.length > 0 && (
        <ul className="mb-2 space-y-2">
          {recursos.map((r, i) => (
            <li
              key={`${r.tipo}-${i}`}
              className="flex items-center gap-2 rounded-xl border border-borde bg-superficie p-2 dark:border-noche-borde dark:bg-noche-superficie"
            >
              {r.tipo === 'enlace' ? (
                <Link2 size={16} className="shrink-0 text-primario" aria-hidden />
              ) : (
                <StickyNote size={16} className="shrink-0 text-primario" aria-hidden />
              )}
              {r.tipo === 'enlace' ? (
                <a
                  href={r.valor}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-primario underline dark:text-agua"
                >
                  {r.valor}
                </a>
              ) : (
                <span className="min-w-0 flex-1 text-sm">{r.valor}</span>
              )}
              <button
                onClick={() => onCambio(recursos.filter((_, j) => j !== i))}
                className="flex min-h-tap min-w-tap items-center justify-center text-tinta-tenue"
                aria-label="Quitar recurso"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <select
          className="campo w-28 shrink-0"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as Recurso['tipo'])}
          aria-label="Tipo de recurso"
        >
          <option value="enlace">Enlace</option>
          <option value="nota">Nota</option>
        </select>
        <input
          className="campo flex-1"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && anadir()}
          placeholder={tipo === 'enlace' ? 'https://…' : 'Recordar traer petos'}
          aria-label="Valor del recurso"
        />
        <button
          className="btn-suave px-3"
          onClick={anadir}
          disabled={!valor.trim()}
          aria-label="Añadir recurso"
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </section>
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
  const grupos = useLiveQuery(() => db.grupos.toArray(), [])
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

/** Eliminar con la opción de cerrar el hueco corriendo las siguientes sesiones. */
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

  async function eliminar(desplazar: boolean) {
    const deshacer = await eliminarSesion(sesion.id, desplazar)
    onCerrar()
    navegar('/planificador')
    mostrarAviso(
      desplazar ? 'Sesión eliminada; las siguientes se han corrido' : 'Sesión eliminada',
      deshacer,
    )
  }

  return (
    <Hoja abierta={abierta} titulo="Eliminar sesión" onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-sm texto-suave">
          ¿Qué hacemos con el hueco que deja en el calendario de este grupo?
        </p>
        <button className="btn-primario w-full" onClick={() => void eliminar(true)}>
          Eliminar y desplazar las siguientes
        </button>
        <p className="text-xs texto-suave">
          Cada sesión posterior pasa a la clase anterior de la secuencia, cerrando el hueco.
        </p>
        <button className="btn-suave w-full" onClick={() => void eliminar(false)}>
          Eliminar solo esta sesión
        </button>
        <button className="btn w-full" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </Hoja>
  )
}
