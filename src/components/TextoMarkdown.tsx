import { useMemo } from 'react'
import { bloques, type TrozoMd } from '../lib/markdown'

/**
 * Pinta la descripción de una sesión con su jerarquía visible.
 *
 * El caso de uso real manda: el móvil en la mano, de pie, en la pista y a
 * veces con sol. Por eso el cuerpo va a tamaño base con interlineado ancho
 * —legibilidad antes que densidad— y los tres niveles se distinguen por
 * TAMAÑO, PESO y COLOR a la vez, no solo por uno: a contraluz un cambio de
 * peso solo no se ve.
 *
 *   Momento (nivel 1)     primario, versalitas, con la doble línea de pista
 *   Submomento (nivel 2)  suave, versalitas, más pequeño
 *   Actividad             negrita en color de texto, tamaño de cuerpo
 *
 * Nunca se inyecta HTML: los bloques llegan ya troceados de `lib/markdown.ts`.
 */
export function TextoMarkdown({ texto, className }: { texto: string; className?: string }) {
  const partes = useMemo(() => bloques(texto), [texto])

  if (partes.length === 0) return null

  return (
    <div className={'space-y-3 break-words text-base leading-7' + (className ? ` ${className}` : '')}>
      {partes.map((b, i) => {
        if (b.tipo === 'titulo' && b.nivel === 1) {
          return (
            <div key={i} className={i === 0 ? '' : 'pt-2'}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-primario dark:text-agua">
                <Trozos trozos={b.trozos} />
              </h3>
              <div className="linea-pista mt-1" aria-hidden />
            </div>
          )
        }

        if (b.tipo === 'titulo') {
          return (
            <h4
              key={i}
              className={
                'text-xs font-bold uppercase tracking-wide texto-suave' + (i === 0 ? '' : ' pt-1')
              }
            >
              <Trozos trozos={b.trozos} />
            </h4>
          )
        }

        if (b.tipo === 'lista') {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-agua">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Trozos trozos={item.trozos} />
                  <SubLista hijos={item.hijos} />
                </li>
              ))}
            </ul>
          )
        }

        // `value` en cada elemento: el número es el que traía el texto, también
        // si salta («4.» tras una lista partida), nunca uno recontado.
        if (b.tipo === 'listaOrdenada') {
          return (
            <ol
              key={i}
              className="list-decimal space-y-2 pl-6 tabular-nums marker:font-bold marker:text-primario dark:marker:text-agua"
            >
              {b.items.map((item, j) => (
                <li key={j} value={item.numero} className="pl-1">
                  <Trozos trozos={item.trozos} />
                  <SubLista hijos={item.hijos} />
                </li>
              ))}
            </ol>
          )
        }

        return (
          <p key={i}>
            {b.lineas.map((linea, j) => (
              <span key={j} className="block">
                <Trozos trozos={linea} />
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

/**
 * La sublista de un elemento: sangrada y con un marcador distinto (círculo)
 * para que se lea DENTRO del elemento y no como una lista más al mismo nivel.
 */
function SubLista({ hijos }: { hijos: TrozoMd[][] }) {
  if (hijos.length === 0) return null
  return (
    <ul className="mt-1.5 list-[circle] space-y-1 pl-5 font-normal marker:text-agua">
      {hijos.map((h, k) => (
        <li key={k}>
          <Trozos trozos={h} />
        </li>
      ))}
    </ul>
  )
}

function Trozos({ trozos }: { trozos: TrozoMd[] }) {
  return (
    <>
      {trozos.map((t, i) =>
        t.fuerte ? (
          <strong key={i} className="font-bold text-tinta dark:text-noche-texto">
            {t.texto}
          </strong>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  )
}
