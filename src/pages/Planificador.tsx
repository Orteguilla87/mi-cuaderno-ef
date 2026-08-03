import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarRange, ChevronLeft, ChevronRight, Layers, Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { Hoja } from '../components/Hoja'
import { SelectorCriterios } from '../components/SelectorCriterios'
import { TituloSeccion } from '../components/TituloSeccion'
import { db } from '../db/db'
import {
  crearSesion,
  crearUnidad,
  duplicarUnidad,
  lunesDe,
  semanaActual,
  semanaDe,
  type HuecoSemana,
} from '../db/planificador'
import type { UnidadDidactica } from '../db/types'
import { aISO, formatoCorto, NOMBRES_DIA, sumarDias } from '../lib/fechas'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'
import { PlanGrupo } from './PlanGrupo'

type Vista = 'grupo' | 'semana' | 'unidades'

const SUBTITULOS: Record<Vista, string> = {
  grupo: 'Programación por grupo',
  semana: '',
  unidades: 'Unidades didácticas',
}

export function Planificador() {
  // Se entra por grupo: lo habitual es programar el curso de un grupo entero,
  // y solo después bajar a la semana a retocar un día concreto.
  const [vista, setVista] = useState<Vista>('grupo')
  const [lunes, setLunes] = useState(semanaActual)

  return (
    <>
      <Cabecera
        titulo="Planificador"
        subtitulo={
          vista === 'semana' ? (
            <span className="cifra">
              {formatoCorto(lunes)} – {formatoCorto(sumarDias(lunes, 4))}
            </span>
          ) : (
            SUBTITULOS[vista]
          )
        }
      />

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <button
            className={(vista === 'grupo' ? 'btn-primario' : 'btn-suave') + ' px-0 text-sm'}
            onClick={() => setVista('grupo')}
          >
            <Users size={18} aria-hidden />
            Grupo
          </button>
          <button
            className={(vista === 'semana' ? 'btn-primario' : 'btn-suave') + ' px-0 text-sm'}
            onClick={() => setVista('semana')}
          >
            <CalendarRange size={18} aria-hidden />
            Semana
          </button>
          <button
            className={(vista === 'unidades' ? 'btn-primario' : 'btn-suave') + ' px-0 text-sm'}
            onClick={() => setVista('unidades')}
          >
            <Layers size={18} aria-hidden />
            Unidades
          </button>
        </div>

        {vista === 'grupo' && <PlanGrupo />}
        {vista === 'semana' && <VistaSemana lunes={lunes} onCambiarSemana={setLunes} />}
        {vista === 'unidades' && <VistaUnidades />}
      </div>
    </>
  )
}

function VistaSemana({
  lunes,
  onCambiarSemana,
}: {
  lunes: string
  onCambiarSemana: (l: string) => void
}) {
  const huecos = useLiveQuery(() => semanaDe(lunes), [lunes])
  const hoy = aISO()

  async function abrir(h: HuecoSemana) {
    // Un hueco sin sesión la crea al vuelo: planificar no debe costar dos pasos.
    const id = h.sesion?.id ?? (await crearSesion(h.grupo.id, h.fecha))
    navegar(`/sesiones/${id}`)
  }

  const porDia = (d: number) => (huecos ?? []).filter((h) => h.diaSemana === d)

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          className="btn-suave px-3"
          onClick={() => onCambiarSemana(sumarDias(lunes, -7))}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <button className="btn-fantasma flex-1" onClick={() => onCambiarSemana(lunesDe(hoy))}>
          Semana actual
        </button>
        <button
          className="btn-suave px-3"
          onClick={() => onCambiarSemana(sumarDias(lunes, 7))}
          aria-label="Semana siguiente"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {huecos?.length === 0 && (
        <div className="tarjeta text-center">
          <p className="text-base font-semibold">Sin clases esta semana</p>
          <p className="mt-1 text-sm texto-suave">
            El planificador se construye sobre el horario de cada grupo.
          </p>
          <button className="btn-primario mt-4 w-full" onClick={() => navegar('/grupos')}>
            Ir a Grupos
          </button>
        </div>
      )}

      {[1, 2, 3, 4, 5].map((d) => {
        const delDia = porDia(d)
        if (delDia.length === 0) return null
        const fecha = sumarDias(lunes, d - 1)
        return (
          <section key={d}>
            <TituloSeccion>
              {NOMBRES_DIA[d - 1]}{' '}
              <span className="cifra text-sm font-normal texto-suave">{formatoCorto(fecha)}</span>
              {fecha === hoy && <span className="pildora ml-2 bg-primario text-white">Hoy</span>}
            </TituloSeccion>

            <ul className="space-y-2">
              {delDia.map((h) => (
                <li key={`${h.grupo.id}-${h.horaInicio}`}>
                  <button
                    className="tarjeta-pulsable flex w-full items-center gap-3 text-left"
                    onClick={() => void abrir(h)}
                  >
                    <span
                      className="h-10 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: h.grupo.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-bold">{h.grupo.nombre}</span>
                        <BadgeEtapa etapa={h.grupo.etapa} nivel={h.grupo.nivel} />
                      </span>
                      <span className="cifra mt-0.5 block truncate text-sm texto-suave">
                        {h.horaInicio}–{h.horaFin}
                        {h.sesion?.titulo ? ` · ${h.sesion.titulo}` : ''}
                      </span>
                    </span>
                    <span
                      className={
                        'shrink-0 text-xs font-bold ' +
                        (h.sesion ? 'text-lima-oscuro dark:text-lima' : 'text-primario dark:text-agua')
                      }
                    >
                      {h.sesion
                        ? `${h.sesion.juegos.length} juegos`
                        : 'Planificar'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function VistaUnidades() {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<UnidadDidactica | null>(null)
  const [duplicando, setDuplicando] = useState<{ id: string; titulo: string; nivel: number } | null>(
    null,
  )

  const unidades = useLiveQuery(async () => {
    const lista = await db.unidades.toArray()
    // Las unidades sin trimestre van al final de su nivel: son las sueltas.
    const orden = (t: number | null) => t ?? 9
    return lista.sort(
      (a, b) =>
        a.nivel - b.nivel ||
        orden(a.trimestre) - orden(b.trimestre) ||
        a.titulo.localeCompare(b.titulo, 'es'),
    )
  }, [])

  const conteos = useLiveQuery(async () => {
    const sesiones = await db.sesiones.toArray()
    const mapa: Record<string, number> = {}
    for (const s of sesiones) if (s.udId) mapa[s.udId] = (mapa[s.udId] ?? 0) + 1
    return mapa
  }, [])

  return (
    <>
      <button className="btn-primario w-full" onClick={() => setCreando(true)}>
        <Plus size={20} aria-hidden />
        Nueva unidad
      </button>

      {unidades?.length === 0 && (
        <div className="tarjeta text-center">
          <p className="text-base font-semibold">Sin unidades didácticas</p>
          <p className="mt-1 text-sm texto-suave">
            Agrupa las sesiones en unidades para reutilizarlas entre niveles.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {unidades?.map((u) => (
          <li key={u.id} className="tarjeta flex items-start gap-2 py-3">
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => setEditando(u)}
              aria-label={`Editar unidad ${u.titulo}`}
            >
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-bold">{u.titulo}</p>
                {!u.computa && (
                  <span className="pildora shrink-0 bg-aviso/15 px-2 py-0.5 text-xs font-semibold text-aviso-oscuro">
                    No cuenta
                  </span>
                )}
              </div>
              <p className="cifra mt-0.5 text-sm texto-suave">
                {u.nivel}º ·{' '}
                {u.trimestre === null ? 'sin trimestre' : `${u.trimestre}.º trimestre`} ·{' '}
                {conteos?.[u.id] ?? 0} sesiones ·{' '}
                {u.criterios.length} {u.criterios.length === 1 ? 'criterio' : 'criterios'}
              </p>
            </button>
            <button
              className="btn-suave shrink-0 px-3 text-xs"
              onClick={() => setDuplicando({ id: u.id, titulo: u.titulo, nivel: u.nivel })}
            >
              Duplicar
            </button>
          </li>
        ))}
      </ul>

      <HojaNuevaUnidad abierta={creando} onCerrar={() => setCreando(false)} />
      <HojaEditarUnidad unidad={editando} onCerrar={() => setEditando(null)} />
      <HojaDuplicarUnidad unidad={duplicando} onCerrar={() => setDuplicando(null)} />
    </>
  )
}

/** Duplicar una UD a otro nivel: así se reutiliza el mismo esqueleto entre cursos. */
function HojaDuplicarUnidad({
  unidad,
  onCerrar,
}: {
  unidad: { id: string; titulo: string; nivel: number } | null
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [nivel, setNivel] = useState(1)

  // El nivel de partida es el siguiente al de origen: duplicar a su propio
  // nivel casi nunca es lo que se quiere.
  useEffect(() => {
    if (unidad) setNivel(unidad.nivel < 6 ? unidad.nivel + 1 : 1)
  }, [unidad])

  async function duplicar() {
    if (!unidad) return
    const id = await duplicarUnidad(unidad.id, nivel)
    onCerrar()
    mostrarAviso(`«${unidad.titulo}» duplicada a ${nivel}º`, async () => {
      await db.unidades.delete(id)
    })
  }

  return (
    <Hoja abierta={!!unidad} titulo="Duplicar unidad" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm texto-suave">
          Se copia «{unidad?.titulo}» con sus criterios y trimestre. Las sesiones no se duplican.
        </p>

        <div>
          <span className="etiqueta">Nivel de destino</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setNivel(n)}
                className={(nivel === n ? 'btn-primario' : 'btn-suave') + ' min-w-tap flex-1 px-0'}
              >
                {n}º
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primario w-full" onClick={() => void duplicar()}>
          Duplicar unidad
        </button>
      </div>
    </Hoja>
  )
}

function HojaNuevaUnidad({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const [titulo, setTitulo] = useState('')
  const [nivel, setNivel] = useState(1)
  const [trimestre, setTrimestre] = useState<1 | 2 | 3 | null>(1)
  const [computa, setComputa] = useState(true)
  const [criterios, setCriterios] = useState<string[]>([])

  // Los criterios ofrecidos dependen del ciclo del nivel: al cambiarlo, los ya
  // elegidos de otro ciclo dejarían de tener sentido.
  useEffect(() => {
    if (abierta) setCriterios([])
  }, [abierta, nivel])

  async function guardar() {
    if (!titulo.trim()) return
    const id = await crearUnidad({ titulo, nivel, trimestre, computa, criterios })
    setTitulo('')
    onCerrar()
    mostrarAviso(`Unidad «${titulo.trim()}» creada`, async () => {
      await db.unidades.delete(id)
    })
  }

  return (
    <Hoja abierta={abierta} titulo="Nueva unidad" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="ud-titulo">
            Título
          </label>
          <input
            id="ud-titulo"
            className="campo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Habilidades con móvil"
            autoFocus
          />
        </div>

        <div>
          <span className="etiqueta">Nivel</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setNivel(n)}
                className={(nivel === n ? 'btn-primario' : 'btn-suave') + ' min-w-tap flex-1 px-0'}
              >
                {n}º
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="etiqueta">Trimestre</span>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTrimestre(t)}
                className={(trimestre === t ? 'btn-primario' : 'btn-suave') + ' px-0'}
              >
                {t}.º
              </button>
            ))}
            <button
              onClick={() => setTrimestre(null)}
              className={(trimestre === null ? 'btn-primario' : 'btn-suave') + ' px-0 text-xs'}
            >
              Ninguno
            </button>
          </div>
          {trimestre === null && (
            <p className="mt-1 text-xs texto-suave">
              Una unidad suelta: no entra en la nota de ningún trimestre, pero sí cuenta en la
              cobertura de criterios.
            </p>
          )}
        </div>

        <label className="tarjeta flex cursor-pointer items-center gap-3 py-3">
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0 accent-primario"
            checked={computa}
            onChange={(e) => setComputa(e.target.checked)}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Cuenta para la nota</span>
            <span className="mt-0.5 block text-xs texto-suave">
              Si lo desmarcas, la unidad se sigue programando y evaluando, pero no entra en el
              reparto de pesos del trimestre.
            </span>
          </span>
        </label>

        <SelectorCriterios nivel={nivel} seleccionados={criterios} onCambio={setCriterios} />

        <button className="btn-primario w-full" onClick={() => void guardar()} disabled={!titulo.trim()}>
          Crear unidad
        </button>
      </div>
    </Hoja>
  )
}

/**
 * Edición de una unidad ya creada: no existía antes (§ Bloque 1). El nivel se
 * enseña de solo lectura porque cambiarlo cambiaría el ciclo de sus criterios
 * ya asignados; para eso está «Duplicar a otro nivel».
 */
function HojaEditarUnidad({
  unidad,
  onCerrar,
}: {
  unidad: UnidadDidactica | null
  onCerrar: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [trimestre, setTrimestre] = useState<1 | 2 | 3 | null>(1)
  const [computa, setComputa] = useState(true)
  const [criterios, setCriterios] = useState<string[]>([])

  useEffect(() => {
    if (!unidad) return
    setTitulo(unidad.titulo)
    setTrimestre(unidad.trimestre)
    setComputa(unidad.computa)
    setCriterios(unidad.criterios)
  }, [unidad])

  if (!unidad) return null

  async function guardar() {
    if (!unidad || !titulo.trim()) return
    await db.unidades.update(unidad.id, {
      titulo: titulo.trim(),
      trimestre,
      computa,
      criterios,
    })
    onCerrar()
  }

  return (
    <Hoja abierta={!!unidad} titulo="Editar unidad" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="ud-editar-titulo">
            Título
          </label>
          <input
            id="ud-editar-titulo"
            className="campo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
          />
        </div>

        <div className="panel-agua text-sm">
          Nivel: <strong>{unidad.nivel}º</strong>. Para cambiarlo, duplica la unidad al nivel
          destino desde la lista.
        </div>

        <div>
          <span className="etiqueta">Trimestre</span>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTrimestre(t)}
                className={(trimestre === t ? 'btn-primario' : 'btn-suave') + ' px-0'}
              >
                {t}.º
              </button>
            ))}
            <button
              onClick={() => setTrimestre(null)}
              className={(trimestre === null ? 'btn-primario' : 'btn-suave') + ' px-0 text-xs'}
            >
              Ninguno
            </button>
          </div>
        </div>

        <label className="tarjeta flex cursor-pointer items-center gap-3 py-3">
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0 accent-primario"
            checked={computa}
            onChange={(e) => setComputa(e.target.checked)}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Cuenta para la nota</span>
            <span className="mt-0.5 block text-xs texto-suave">
              Si lo desmarcas, la unidad se sigue programando y evaluando, pero no entra en el
              reparto de pesos del trimestre.
            </span>
          </span>
        </label>

        <SelectorCriterios nivel={unidad.nivel} seleccionados={criterios} onCambio={setCriterios} />

        <button
          className="btn-primario w-full"
          onClick={() => void guardar()}
          disabled={!titulo.trim()}
        >
          Guardar cambios
        </button>
      </div>
    </Hoja>
  )
}
