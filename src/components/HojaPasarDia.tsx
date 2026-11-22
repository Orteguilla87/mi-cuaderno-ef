import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, MinusCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  gruposConClaseEn,
  pasarProgramacionDia,
  previsualizarPasarDia,
  type ModoDesborde,
  type PreviaGrupoPasarDia,
} from '../db/pasarDia'
import type { ClaseEnPrevia } from '../db/planificador'
import { DISPOSICION } from '../lib/disposicion'
import { deshacerLote } from '../db/lotes'
import { formatoDiaCorto, formatoLargo } from '../lib/fechas'
import { useLotesPlan } from '../store/lotesPlan'
import { useUI } from '../store/ui'
import { Hoja } from './Hoja'

const rotulo = (c: ClaseEnPrevia) => `${formatoDiaCorto(c.fecha)}${c.franja ? ` · ${c.franja}` : ''}`

/**
 * «Pasar programación al siguiente día» (`db/pasarDia.ts`): se pierde un día de
 * clase y toda la programación se corre, en todos los grupos a la vez. Fecha y
 * grupos arriba; debajo, la previa por grupo, y nada se escribe hasta confirmar.
 * Se abre como hoja sobre la pantalla de origen: «Atrás» la cierra y deja al
 * maestro donde estaba.
 */
export function HojaPasarDia({
  abierta,
  fechaInicial,
  onCerrar,
}: {
  abierta: boolean
  fechaInicial: string
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const registrarLote = useLotesPlan((s) => s.registrar)
  const quitarLote = useLotesPlan((s) => s.quitar)
  const [fecha, setFecha] = useState(fechaInicial)
  const [desmarcados, setDesmarcados] = useState<string[]>([])
  const [desbordes, setDesbordes] = useState<Record<string, ModoDesborde>>({})
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Cada apertura empieza de cero, en la fecha de donde se viene.
  useEffect(() => {
    if (!abierta) return
    setFecha(fechaInicial)
    setDesmarcados([])
    setDesbordes({})
    setError(null)
  }, [abierta, fechaInicial])

  const candidatos = useLiveQuery(
    async () => (abierta && fecha ? gruposConClaseEn(fecha) : []),
    [abierta, fecha],
  )
  const marcados = (candidatos ?? []).filter((g) => !desmarcados.includes(g.id)).map((g) => g.id)
  const claveMarcados = marcados.join(',')
  const claveDesbordes = JSON.stringify(desbordes)

  const previa = useLiveQuery(
    async () =>
      abierta && candidatos && candidatos.length > 0
        ? previsualizarPasarDia(fecha, marcados, desbordes)
        : undefined,
    [abierta, fecha, candidatos, claveMarcados, claveDesbordes],
  )
  const seAplican = previa?.grupos.filter((g) => g.seAplica).length ?? 0

  function alternar(id: string) {
    setDesmarcados((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))
  }

  async function confirmar() {
    setOcupado(true)
    setError(null)
    try {
      const { lote } = await pasarProgramacionDia(fecha, marcados, desbordes)
      onCerrar()
      if (!lote) {
        mostrarAviso('No había nada que pasar')
        return
      }
      registrarLote(lote)
      mostrarAviso(`Programación pasada en ${seAplican} ${seAplican === 1 ? 'grupo' : 'grupos'}`, async () => {
        await deshacerLote(lote)
        quitarLote(lote.id)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido pasar la programación')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Hoja
      abierta={abierta}
      titulo="Pasar programación al siguiente día"
      onCerrar={onCerrar}
      ancho={DISPOSICION.pasarDia.panelEscritorio}
    >
      <div className={DISPOSICION.pasarDia.cuerpo}>
        {/* Entrada: fecha y grupos. */}
        <div className="min-w-0 space-y-3">
          <p className="text-sm texto-suave">
            Las clases de ese día quedan vacías y lo programado avanza tantas sesiones como clases
            se pierden, hasta la primera sesión vacía de cada grupo. No se crea ni se borra ninguna
            sesión.
          </p>
          <label className="block">
            <span className="etiqueta">Día que se pierde</span>
            <input
              type="date"
              className="campo cifra"
              value={fecha}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
            />
          </label>
          <p className="text-sm font-semibold">{formatoLargo(fecha)}</p>

          {candidatos?.length === 0 ? (
            <p className="tarjeta text-sm texto-suave">
              Ese día no hay sesiones de ningún grupo: no hay nada que pasar.
            </p>
          ) : (
            <fieldset className="space-y-1">
              <legend className="etiqueta">Grupos</legend>
              {candidatos?.map((g) => (
                <label key={g.id} className="flex min-h-tap items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-primario"
                    checked={!desmarcados.includes(g.id)}
                    onChange={() => alternar(g.id)}
                  />
                  <span className="min-w-0 break-words font-semibold">{g.nombre}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        {/* Previa. */}
        <div className="min-w-0 space-y-3">
          {previa?.desalineados.map((d) => (
            <p key={d} className="tarjeta flex items-start gap-2 border-l-4 border-acento text-sm">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-acento" aria-hidden />
              <span className="min-w-0 break-words">
                <strong>Grupos que dejan de ir a la par.</strong> {d}
              </span>
            </p>
          ))}

          {previa?.grupos.map((g) => (
            <PreviaGrupo
              key={g.grupoId}
              g={g}
              marcado={marcados.includes(g.grupoId)}
              onDesborde={(m) => setDesbordes((d) => ({ ...d, [g.grupoId]: m }))}
            />
          ))}

          {error && <p className="text-sm font-semibold text-acento">{error}</p>}

          <button
            className="btn-primario w-full"
            onClick={() => void confirmar()}
            disabled={!previa || seAplican === 0 || ocupado}
          >
            <CalendarClock size={18} aria-hidden />
            {seAplican > 0
              ? `Pasar programación (${seAplican} ${seAplican === 1 ? 'grupo' : 'grupos'})`
              : 'Pasar programación'}
          </button>
          <button className="btn w-full" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </Hoja>
  )
}

function PreviaGrupo({
  g,
  marcado,
  onDesborde,
}: {
  g: PreviaGrupoPasarDia
  marcado: boolean
  onDesborde: (m: ModoDesborde) => void
}) {
  const clases = `${g.k} ${g.k === 1 ? 'clase' : 'clases'}`
  // Estado en texto + icono: el color nunca va solo.
  const estado = !marcado
    ? { Icono: MinusCircle, texto: 'Desmarcado: se queda como está', aviso: false }
    : g.conContenido === 0
      ? { Icono: MinusCircle, texto: `${clases} ese día, ya vacías: nada que correr`, aviso: false }
      : g.desborde
        ? {
            Icono: AlertTriangle,
            texto: `No cabe todo antes de fin de curso: ${g.sinUbicacion.length} ${g.sinUbicacion.length === 1 ? 'sesión sobra' : 'sesiones sobran'}`,
            aviso: true,
          }
        : {
            Icono: CheckCircle2,
            texto: `Avanza ${g.conContenido} · se para en ${g.seDetieneEn.map(rotulo).join(' y ')}`,
            aviso: false,
          }

  return (
    <details className={`tarjeta text-sm ${estado.aviso ? 'border-l-4 border-acento' : ''}`} open={estado.aviso}>
      <summary className="flex min-h-tap cursor-pointer items-start gap-2">
        <estado.Icono
          size={18}
          className={`mt-0.5 shrink-0 ${estado.aviso ? 'text-acento' : 'text-primario dark:text-agua'}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 break-words">
          <strong>{g.nombre}</strong> · {clases}
          <span className="block texto-suave">{estado.texto}</span>
        </span>
      </summary>

      {marcado && g.desborde && (
        <div className="mt-2 space-y-2">
          <ul className="space-y-1">
            {g.sinUbicacion.map((x, i) => (
              <li key={i} className="break-words">
                «{x.titulo}»{x.unidad && <span className="texto-suave"> · {x.unidad}</span>}
              </li>
            ))}
          </ul>
          <fieldset className="space-y-1">
            <legend className="sr-only">Qué hacer con {g.nombre}</legend>
            <label className="flex min-h-tap items-center gap-3">
              <input
                type="radio"
                name={`desborde-${g.grupoId}`}
                className="h-5 w-5 shrink-0 accent-primario"
                checked={g.desborde === 'cancelar'}
                onChange={() => onDesborde('cancelar')}
              />
              <span>No pasar este grupo (se queda como está)</span>
            </label>
            <label className="flex min-h-tap items-center gap-3">
              <input
                type="radio"
                name={`desborde-${g.grupoId}`}
                className="h-5 w-5 shrink-0 accent-primario"
                checked={g.desborde === 'bandeja'}
                onChange={() => onDesborde('bandeja')}
              />
              <span>Pasarlo y guardar lo que sobra en «Sin clase asignada»</span>
            </label>
          </fieldset>
        </div>
      )}

      {g.movimientos.length > 0 && (
        <ol className={`mt-2 ${DISPOSICION.pasarDia.movimientos}`}>
          {g.movimientos.map((m, i) => (
            <li key={i} className="cifra min-w-0 break-words texto-suave">
              <span className="font-semibold text-tinta dark:text-noche-texto">{m.titulo}:</span>{' '}
              {rotulo(m.de)} <ArrowRight size={12} className="inline" aria-label="pasa a" /> {rotulo(m.a)}
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}
