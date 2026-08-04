import { useLiveQuery } from 'dexie-react-hooks'
import { CircleAlert, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { EstadoVacio } from '../components/EstadoVacio'
import { LineaPlegable } from '../components/LineaPlegable'
import { TituloSeccion } from '../components/TituloSeccion'
import { ciclosConGrupos, coberturaDelCiclo, type CoberturaCriterio } from '../db/cobertura'
import { db } from '../db/db'
import { ordinalCiclo } from '../lib/ciclos'
import { navegar } from '../lib/router'

/**
 * Qué criterios del Decreto 61/2022 se han evaluado ya y cuáles siguen sin
 * tocar. Es la trazabilidad que exige la Orden 130/2023: los criterios no
 * llevan nota, llevan constancia de haberse trabajado.
 *
 * De uso interno. No sale de aquí: no hay exportación, ni nada pensado para
 * enseñar a nadie fuera.
 */
export function Cobertura() {
  const [ciclo, setCiclo] = useState<1 | 2 | 3 | null>(null)

  const ciclos = useLiveQuery(() => ciclosConGrupos(), [])
  useEffect(() => {
    if (ciclo === null && ciclos && ciclos.length > 0) setCiclo(ciclos[0])
  }, [ciclos, ciclo])

  const cobertura = useLiveQuery(async () => {
    if (ciclo === null) return []
    // Se tocan las tablas de las que depende para que Dexie reemita al cambiar
    // una fila, una columna o una nota.
    await Promise.all([db.filas.count(), db.columnas.count(), db.valores.count()])
    return coberturaDelCiclo(ciclo)
  }, [ciclo])

  if (ciclos?.length === 0)
    return (
      <>
        <Cabecera titulo="Cobertura de criterios" />
        <div className="p-4">
          <EstadoVacio
            Icono={Target}
            titulo="Todavía no hay grupos de Primaria"
            descripcion="La cobertura se calcula sobre los criterios del ciclo de cada grupo."
            accion={
              <button className="btn-primario w-full" onClick={() => navegar('/grupos')}>
                Ir a Grupos
              </button>
            }
          />
        </div>
      </>
    )

  const sinCubrir = (cobertura ?? []).filter((c) => c.usos.length === 0).length

  return (
    <>
      <Cabecera
        titulo="Cobertura de criterios"
        subtitulo={ciclo ? `${ordinalCiclo(ciclo)} ciclo · Decreto 61/2022` : undefined}
      />

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          {(ciclos ?? []).map((c) => (
            <button
              key={c}
              onClick={() => setCiclo(c)}
              className={(ciclo === c ? 'btn-primario' : 'btn-suave') + ' px-0'}
            >
              {ordinalCiclo(c)} ciclo
            </button>
          ))}
        </div>

        {cobertura && (
          <div
            className={
              'flex items-center gap-2 rounded-xl2 border-2 p-3 text-sm font-semibold ' +
              (sinCubrir === 0
                ? 'border-lima bg-lima/10 text-lima-oscuro'
                : 'border-acento bg-acento/10 text-acento')
            }
          >
            {sinCubrir > 0 && <CircleAlert size={18} className="shrink-0" aria-hidden />}
            <span className="cifra">
              {sinCubrir === 0
                ? `Los ${cobertura.length} criterios del ciclo están cubiertos`
                : `${sinCubrir} de ${cobertura.length} criterios sin evaluar todavía`}
            </span>
          </div>
        )}

        <p className="text-xs texto-suave">
          Acumula los dos cursos del ciclo. Cuentan también los instrumentos de unidades que no
          computan y los que no tienen unidad: se enseñaron, luego el criterio está cubierto.
        </p>

        <TituloSeccion>Criterios del ciclo</TituloSeccion>

        <ul className="space-y-2">
          {(cobertura ?? []).map((c) => (
            <FichaCriterio key={c.criterio.id} cobertura={c} />
          ))}
        </ul>
      </div>
    </>
  )
}

function FichaCriterio({ cobertura }: { cobertura: CoberturaCriterio }) {
  const { criterio, usos } = cobertura
  const [abierto, setAbierto] = useState(false)
  const cubierto = usos.length > 0

  return (
    <li
      className={
        'tarjeta py-3 ' + (cubierto ? '' : 'border-2 border-acento bg-acento/5')
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            'cifra flex h-9 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold ' +
            (cubierto
              ? 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua'
              : 'bg-acento text-white')
          }
        >
          {criterio.codigo}
        </span>
        <span className="min-w-0 flex-1">
          <LineaPlegable
            texto={criterio.texto}
            abierto={abierto}
            onCambio={setAbierto}
            textoClassName="text-sm font-semibold"
            etiquetaExpandir={`Ver texto completo del criterio ${criterio.codigo}`}
            etiquetaContraer={`Contraer texto del criterio ${criterio.codigo}`}
          />
          <span className="cifra mt-1 block text-xs texto-suave">
            {criterio.competenciaCodigo} ·{' '}
            {cubierto
              ? `${usos.length} ${usos.length === 1 ? 'instrumento' : 'instrumentos'}`
              : 'sin ningún instrumento'}
          </span>
        </span>
      </div>

      {abierto && cubierto && (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="bg-agua-claro text-left dark:bg-noche-elevada">
              <th className="rounded-l-xl px-2 py-1.5 font-semibold">Instrumento</th>
              <th className="px-2 py-1.5 font-semibold">Unidad y curso</th>
              <th className="rounded-r-xl px-2 py-1.5 text-right font-semibold">Notas</th>
            </tr>
          </thead>
          <tbody>
            {usos.map((u, i) => (
              <tr key={`${u.columnaId}-${i}`} className="align-top">
                <td className="px-2 py-1.5">
                  <span className="font-semibold">{u.titulo}</span>
                  {u.descriptor !== u.titulo && (
                    <span className="block texto-suave">{u.descriptor}</span>
                  )}
                  {!u.calificable && (
                    <span className="pildora mt-1 bg-aviso/15 px-2 py-0.5 text-[11px] font-semibold text-aviso-oscuro">
                      No calificable
                    </span>
                  )}
                </td>
                <td className="cifra px-2 py-1.5">
                  {u.unidad ?? 'Sin unidad'}
                  <span className="block texto-suave">
                    {u.curso}º · {u.grupo}
                  </span>
                </td>
                <td className="cifra px-2 py-1.5 text-right">
                  {u.notas.length === 0 ? (
                    <span className="texto-suave">sin evaluar</span>
                  ) : (
                    <>
                      {u.notas.length}{' '}
                      {u.notas.length === 1 ? 'nota' : 'notas'}
                      <span className="block texto-suave">
                        {Math.min(...u.notas).toFixed(1)}–{Math.max(...u.notas).toFixed(1)}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {abierto && !cubierto && (
        <p className="mt-2 text-xs texto-suave">
          Ningún instrumento del ciclo apunta a este criterio. Se asigna desde la columna del
          Cuaderno, en «Qué se evalúa».
        </p>
      )}
    </li>
  )
}
