import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { BadgeEtapa } from '../components/Badge'
import { Cabecera } from '../components/Cabecera'
import { CampoArea } from '../components/Campo'
import { Hoja } from '../components/Hoja'
import { criteriosDeGrupo } from '../db/criterios'
import { db } from '../db/db'
import { fijarNivel, NIVELES_INFANTIL, registrosDe, siguienteNivel } from '../db/infantil'
import type { Alumno, Criterio } from '../db/types'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

const MOMENTOS = [
  { momento: 1 as const, etiqueta: '1.er trimestre' },
  { momento: 2 as const, etiqueta: '2.º trimestre' },
  { momento: 3 as const, etiqueta: '3.er trimestre' },
]

/**
 * Registro de Infantil (§6 M6): escala cualitativa sobre los criterios del Área
 * I en 3 momentos. Regla dura: solo grupos de etapa 'infantil'; los de Primaria
 * ni siquiera llegan aquí.
 */
export function Infantil({ grupoId }: { grupoId: string }) {
  const [momento, setMomento] = useState<1 | 2 | 3>(1)
  const [informando, setInformando] = useState(false)

  // `null` = todavía cargando; `undefined` de Dexie (grupo inexistente) se
  // normaliza a `null`-encontrado para no quedarse en blanco para siempre.
  const grupo = useLiveQuery(async () => (await db.grupos.get(grupoId)) ?? null, [grupoId])
  const alumnos = useLiveQuery(async () => {
    const lista = await db.alumnos.where('grupoId').equals(grupoId).toArray()
    return lista
      .filter((a) => a.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  }, [grupoId])

  const criterios = useLiveQuery(
    async () => (grupo ? criteriosDeGrupo('infantil', grupo.nivel) : []),
    [grupo?.nivel],
  )

  const registros = useLiveQuery(
    async () => registrosDe((alumnos ?? []).map((a) => a.id), momento),
    [alumnos, momento],
  )

  if (grupo === undefined) return null // cargando
  if (grupo === null || grupo.etapa !== 'infantil') {
    return (
      <>
        <Cabecera titulo="Solo para Infantil" atras />
        <div className="p-4">
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Este registro es de Infantil</p>
            <p className="mt-1 text-sm texto-suave">
              Los grupos de Primaria se evalúan desde el cuaderno.
            </p>
            <button className="btn-suave mt-4 w-full" onClick={() => navegar('/grupos')}>
              Volver a Grupos
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Cabecera
        titulo={grupo.nombre}
        atras
        subtitulo={
          <span className="flex items-center gap-2">
            <BadgeEtapa etapa={grupo.etapa} nivel={grupo.nivel} />
            <span>Registro por criterios</span>
          </span>
        }
        acciones={
          <button className="btn-suave" onClick={() => setInformando(true)}>
            <FileText size={18} aria-hidden />
            Informe
          </button>
        }
      />

      <div className="space-y-3 p-4 pb-2">
        <div className="grid grid-cols-3 gap-2">
          {MOMENTOS.map((m) => (
            <button
              key={m.momento}
              onClick={() => setMomento(m.momento)}
              className={(momento === m.momento ? 'btn-primario' : 'btn-suave') + ' px-0 text-sm'}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-xs texto-suave">
          {NIVELES_INFANTIL.map((n) => (
            <span key={n.nivel} className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${n.clase}`}
              >
                {n.corto}
              </span>
              {n.etiqueta}
            </span>
          ))}
        </div>
      </div>

      {alumnos?.length === 0 ? (
        <div className="p-4">
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Grupo sin alumnado</p>
            <button
              className="btn-primario mt-4 w-full"
              onClick={() => navegar(`/grupos/${grupoId}`)}
            >
              Importar listado
            </button>
          </div>
        </div>
      ) : (
        <RejillaInfantil
          alumnos={alumnos ?? []}
          criterios={criterios ?? []}
          momento={momento}
          registros={registros ?? new Map()}
        />
      )}

      <HojaInforme
        abierta={informando}
        alumnos={alumnos ?? []}
        criterios={criterios ?? []}
        onCerrar={() => setInformando(false)}
      />
    </>
  )
}

function RejillaInfantil({
  alumnos,
  criterios,
  momento,
  registros,
}: {
  alumnos: Alumno[]
  criterios: Criterio[]
  momento: 1 | 2 | 3
  registros: Map<string, import('../db/types').RegistroInfantil>
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)

  if (criterios.length === 0) {
    return (
      <div className="p-4">
        <div className="tarjeta text-center">
          <p className="text-base font-semibold">Sin criterios cargados</p>
          <p className="mt-1 text-sm texto-suave">
            Los criterios del Área I se cargan solos al abrir la app.
          </p>
        </div>
      </div>
    )
  }

  async function tocar(alumnoId: string, criterioCodigo: string) {
    const clave = `${alumnoId}|${criterioCodigo}`
    const actual = registros.get(clave)?.nivel
    const siguiente = siguienteNivel(actual)
    const deshacer = await fijarNivel(alumnoId, criterioCodigo, momento, siguiente)
    mostrarAviso('Guardado', deshacer)
  }

  return (
    <div className="carril-fab-derecha overflow-x-auto apaisado:max-h-[75dvh] apaisado:overflow-y-auto lg:max-h-[70vh] lg:overflow-y-auto">
      <table className="w-max border-separate border-spacing-0">
        <caption className="sr-only">
          Registro de criterios del Área I, momento {momento}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-[150px] border-b-2 border-r border-borde bg-agua-claro px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-primario-oscuro dark:border-noche-borde dark:bg-noche-elevada dark:text-agua apaisado:top-0 lg:top-0"
            >
              Alumno
            </th>
            {criterios.map((c) => (
              <th
                key={c.id}
                scope="col"
                className="min-w-[64px] border-b-2 border-r border-borde bg-agua-claro px-1 py-2 dark:border-noche-borde dark:bg-noche-elevada apaisado:sticky apaisado:top-0 apaisado:z-10 lg:sticky lg:top-0 lg:z-10"
                title={c.texto}
              >
                <span className="cifra block text-xs font-bold text-primario-oscuro dark:text-agua">
                  {c.codigo}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((a, fila) => (
            <tr key={a.id} className={fila % 2 ? 'bg-agua-claro/30 dark:bg-noche-elevada/30' : ''}>
              <th
                scope="row"
                className="sticky left-0 z-10 min-w-[150px] border-b border-r border-borde bg-superficie px-3 py-2 text-left text-sm font-semibold dark:border-noche-borde dark:bg-noche-superficie"
              >
                <span className="block max-w-[150px] truncate">
                  {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
                </span>
              </th>
              {criterios.map((c) => {
                const reg = registros.get(`${a.id}|${c.codigo}`)
                const aspecto = reg
                  ? NIVELES_INFANTIL.find((n) => n.nivel === reg.nivel)
                  : null
                return (
                  <td
                    key={c.id}
                    className="border-b border-r border-borde p-0 text-center dark:border-noche-borde"
                  >
                    <button
                      className="flex h-14 w-full items-center justify-center active:scale-95"
                      onClick={() => void tocar(a.id, c.codigo)}
                      aria-label={`${a.alias || a.nombre}, criterio ${c.codigo}: ${aspecto?.etiqueta ?? 'sin valorar'}`}
                    >
                      {aspecto ? (
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${aspecto.clase}`}
                        >
                          {aspecto.corto}
                        </span>
                      ) : (
                        <span className="h-8 w-8 rounded-full border-2 border-dashed border-borde dark:border-noche-borde" />
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Informe cualitativo por alumno, con resumen automático de sus registros (§6). */
function HojaInforme({
  abierta,
  alumnos,
  criterios,
  onCerrar,
}: {
  abierta: boolean
  alumnos: Alumno[]
  criterios: Criterio[]
  onCerrar: () => void
}) {
  const [alumnoId, setAlumnoId] = useState<string | null>(null)
  const alumno = alumnos.find((a) => a.id === alumnoId) ?? alumnos[0] ?? null

  return (
    <Hoja abierta={abierta} titulo="Informe de Infantil" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="inf-alumno">
            Alumno
          </label>
          <select
            id="inf-alumno"
            className="campo"
            value={alumno?.id ?? ''}
            onChange={(e) => setAlumnoId(e.target.value)}
          >
            {alumnos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.apellidos ? `${a.apellidos}, ${a.nombre}` : a.nombre}
              </option>
            ))}
          </select>
        </div>

        {alumno && <InformeAlumno alumno={alumno} criterios={criterios} />}
      </div>
    </Hoja>
  )
}

function InformeAlumno({ alumno, criterios }: { alumno: Alumno; criterios: Criterio[] }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const informe = useLiveQuery(
    async () =>
      db.informesInfantil.where('[alumnoId+trimestre]').equals([alumno.id, 3]).first() ??
      db.informesInfantil.where('alumnoId').equals(alumno.id).first(),
    [alumno.id],
  )
  const registros = useLiveQuery(
    () => db.registrosInfantil.where('alumnoId').equals(alumno.id).toArray(),
    [alumno.id],
  )

  const [comentario, setComentario] = useState('')
  // El comentario editable se inicializa desde el guardado la primera vez.
  const valor = comentario || informe?.comentario || ''

  async function guardar() {
    const existente = await db.informesInfantil
      .where('[alumnoId+trimestre]')
      .equals([alumno.id, 3])
      .first()
    if (existente) {
      const comentarioAnterior = existente.comentario
      await db.informesInfantil.update(existente.id, { comentario: valor })
      mostrarAviso('Informe guardado', async () => {
        await db.informesInfantil.update(existente.id, { comentario: comentarioAnterior })
      })
    } else {
      const id = crypto.randomUUID()
      await db.informesInfantil.add({ id, alumnoId: alumno.id, trimestre: 3, comentario: valor })
      mostrarAviso('Informe guardado', async () => {
        await db.informesInfantil.delete(id)
      })
    }
  }

  // Resumen automático: cuántos criterios en cada nivel, por momento.
  const porMomento = [1, 2, 3].map((m) => {
    const delMomento = (registros ?? []).filter((r) => r.momento === m)
    return {
      momento: m,
      iniciado: delMomento.filter((r) => r.nivel === 'iniciado').length,
      en_proceso: delMomento.filter((r) => r.nivel === 'en_proceso').length,
      conseguido: delMomento.filter((r) => r.nivel === 'conseguido').length,
      sinValorar: criterios.length - delMomento.length,
    }
  })

  return (
    <div className="space-y-4">
      <div className="panel-agua">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primario dark:text-agua" aria-hidden />
          <h3 className="text-sm font-bold">Resumen automático</h3>
        </div>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Resumen de registros por momento y nivel</caption>
          <thead>
            <tr className="cifra text-xs texto-suave">
              <th scope="col" className="text-left font-semibold">
                Momento
              </th>
              <th scope="col" className="font-semibold">
                I
              </th>
              <th scope="col" className="font-semibold">
                P
              </th>
              <th scope="col" className="font-semibold">
                C
              </th>
              <th scope="col" className="font-semibold">
                <span className="sr-only">Sin valorar</span>
                <span aria-hidden>—</span>
              </th>
            </tr>
          </thead>
          <tbody className="cifra text-center">
            {porMomento.map((p) => (
              <tr key={p.momento}>
                <td className="text-left font-semibold">{p.momento}.º trim.</td>
                <td>{p.iniciado}</td>
                <td>{p.en_proceso}</td>
                <td className="font-bold text-lima-oscuro dark:text-lima">{p.conseguido}</td>
                <td className="texto-suave">{p.sinValorar}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <label className="etiqueta" htmlFor="inf-comentario">
          Comentario del informe
        </label>
        <CampoArea
          id="inf-comentario"
          className="campo h-40 resize-none py-2"
          valor={valor}
          onValor={setComentario}
          placeholder={`${alumno.nombre} ha evolucionado a lo largo del curso en…`}
        />
        <p className="mt-1 text-xs texto-suave">
          El banco de comentarios y la exportación del informe llegan con los informes (fase 6).
        </p>
      </div>

      <button className="btn-primario w-full" onClick={() => void guardar()}>
        Guardar comentario
      </button>
    </div>
  )
}
