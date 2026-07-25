import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles } from 'lucide-react'
import { Cabecera } from '../components/Cabecera'
import { db } from '../db/db'
import { sugerirNivelesDesdeMedia } from '../db/equipos'
import { leerCursoActivo } from '../db/curso'
import type { Alumno } from '../db/types'
import { navegar } from '../lib/router'
import { useUI } from '../store/ui'

const NIVELES = [1, 2, 3, 4, 5] as const
const GENEROS = [
  { valor: 'chico' as const, etiqueta: 'Chico' },
  { valor: 'chica' as const, etiqueta: 'Chica' },
]

/**
 * Edición en serie de género y nivel motriz (§ Generador de equipos). Ambos
 * campos son privados como `apoyos`: nunca se leen en informes ni en el modo
 * pizarra, solo aquí y dentro del cálculo del generador.
 */
export function EdicionMasivaAlumnos({ grupoId }: { grupoId: string }) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const grupo = useLiveQuery(() => db.grupos.get(grupoId), [grupoId])
  const curso = useLiveQuery(() => leerCursoActivo(), [])
  const alumnos = useLiveQuery(async () => {
    const lista = await db.alumnos.where('grupoId').equals(grupoId).toArray()
    return lista
      .filter((a) => a.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  }, [grupoId])

  if (grupo === undefined) return null
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

  async function sugerirNiveles() {
    if (!curso) return
    // El trimestre actual se deduce de la fecha de hoy contra los tramos del
    // curso; sin tramos configurados, se usa el 1.º como valor razonable.
    const hoy = new Date().toISOString().slice(0, 10)
    const tramo = curso.trimestres.find((t) => hoy >= t.inicio && hoy <= t.fin)
    const trimestre = tramo?.n ?? 1
    const sugeridos = await sugerirNivelesDesdeMedia(grupoId, trimestre)
    await db.transaction('rw', db.alumnos, async () => {
      for (const [alumnoId, nivel] of sugeridos) await db.alumnos.update(alumnoId, { nivelMotriz: nivel })
    })
    mostrarAviso(`Niveles sugeridos para ${sugeridos.size} alumnos. Ajusta los que no encajen.`)
  }

  return (
    <>
      <Cabecera
        titulo="Género y nivel"
        atras
        subtitulo={`${grupo.nombre} · privado, no sale en informes`}
      />

      <div className="space-y-4 p-4">
        <div className="panel-agua text-sm">
          El nivel motriz y el género solo se usan para repartir equipos equilibrados. Nunca
          aparecen en informes, exportaciones ni en el modo pizarra.
        </div>

        {grupo.etapa === 'primaria' && (
          <button className="btn-suave w-full" onClick={() => void sugerirNiveles()}>
            <Sparkles size={18} aria-hidden />
            Sugerir niveles desde la media del trimestre actual
          </button>
        )}

        {alumnos?.length === 0 && (
          <div className="tarjeta text-center">
            <p className="text-base font-semibold">Sin alumnado</p>
          </div>
        )}

        <ul className="space-y-3">
          {alumnos?.map((a) => (
            <FilaAlumno key={a.id} alumno={a} />
          ))}
        </ul>
      </div>
    </>
  )
}

function FilaAlumno({ alumno }: { alumno: Alumno }) {
  const actualizar = (cambios: Partial<Alumno>) => void db.alumnos.update(alumno.id, cambios)

  return (
    <li className="tarjeta space-y-2 py-3">
      <p className="truncate text-base font-bold">
        {alumno.apellidos ? `${alumno.apellidos}, ${alumno.nombre}` : alumno.nombre}
      </p>

      <div className="flex flex-wrap gap-2">
        {GENEROS.map((g) => (
          <button
            key={g.valor}
            onClick={() => actualizar({ genero: alumno.genero === g.valor ? null : g.valor })}
            aria-pressed={alumno.genero === g.valor}
            className={
              'pildora min-h-[40px] px-3 ' +
              (alumno.genero === g.valor
                ? 'bg-primario text-white'
                : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
            }
          >
            {g.etiqueta}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        {NIVELES.map((n) => (
          <button
            key={n}
            onClick={() => actualizar({ nivelMotriz: alumno.nivelMotriz === n ? null : n })}
            aria-pressed={alumno.nivelMotriz === n}
            aria-label={`Nivel motriz ${n}`}
            className={
              'flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-bold transition ' +
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
              (alumno.nivelMotriz === n
                ? 'bg-primario text-white'
                : 'border border-borde text-tinta-suave dark:border-noche-borde')
            }
          >
            {n}
          </button>
        ))}
      </div>
    </li>
  )
}
