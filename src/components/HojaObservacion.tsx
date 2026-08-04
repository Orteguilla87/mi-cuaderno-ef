import { Minus, Plus, Circle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useConfig } from '../db/config'
import { crearObservacion } from '../db/observaciones'
import type { Alumno, SignoObservacion, TipoObservacion } from '../db/types'
import { useUI } from '../store/ui'
import { CampoArea } from './Campo'
import { Hoja } from './Hoja'

const TIPOS: { valor: TipoObservacion; etiqueta: string }[] = [
  { valor: 'conducta', etiqueta: 'Conducta' },
  { valor: 'aprendizaje', etiqueta: 'Aprendizaje' },
  { valor: 'salud', etiqueta: 'Salud' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const SIGNOS: { valor: SignoObservacion; etiqueta: string; Icono: typeof Plus; clase: string }[] = [
  { valor: '+', etiqueta: 'Positivo', Icono: Plus, clase: 'bg-lima-oscuro text-white' },
  { valor: 'neutro', etiqueta: 'Neutro', Icono: Circle, clase: 'bg-agua text-primario-oscuro' },
  { valor: '-', etiqueta: 'Negativo', Icono: Minus, clase: 'bg-acento text-white' },
]

/**
 * Registro de observación en ≤3 taps (§5 M4): el signo suele venir ya elegido
 * desde el botón que abrió la hoja, así que queda chip de tipo → texto → guardar.
 * El texto se dicta con el teclado nativo; no hay Web Speech API (§6).
 */
export function HojaObservacion({
  abierta,
  grupoId,
  alumno,
  signoInicial = '+',
  onCerrar,
}: {
  abierta: boolean
  grupoId: string
  /** Sin alumno, la observación es del grupo entero. */
  alumno?: Alumno | null
  signoInicial?: SignoObservacion
  onCerrar: () => void
}) {
  const mostrarAviso = useUI((s) => s.mostrarAviso)
  const config = useConfig()

  const [signo, setSigno] = useState<SignoObservacion>(signoInicial)
  const [tipo, setTipo] = useState<TipoObservacion>('conducta')
  const [texto, setTexto] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // Cada apertura empieza limpia, pero respetando el signo con el que se abrió.
  useEffect(() => {
    if (abierta) {
      setSigno(signoInicial)
      setTipo('conducta')
      setTexto('')
      setTags([])
    }
  }, [abierta, signoInicial, alumno?.id])

  async function guardar() {
    const { observacion, deshacer } = await crearObservacion({
      alumnoId: alumno?.id,
      grupoId,
      tipo,
      signo,
      texto,
      tags,
    })
    onCerrar()
    mostrarAviso(
      `Observación guardada${alumno ? ` · ${alumno.alias || alumno.nombre}` : ''}`,
      deshacer,
    )
    return observacion
  }

  const titulo = alumno ? alumno.alias || alumno.nombre : 'Observación de grupo'

  return (
    <Hoja abierta={abierta} titulo={titulo} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <span className="etiqueta">Signo</span>
          <div className="grid grid-cols-3 gap-2">
            {SIGNOS.map(({ valor, etiqueta, Icono, clase }) => (
              <button
                key={valor}
                onClick={() => setSigno(valor)}
                aria-pressed={signo === valor}
                className={
                  'flex min-h-tap flex-col items-center justify-center gap-1 rounded-xl border-2 py-2 text-xs font-bold transition ' +
                  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primario/40 ' +
                  (signo === valor
                    ? 'border-primario bg-agua-claro dark:bg-noche-elevada'
                    : 'border-borde dark:border-noche-borde')
                }
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${clase}`}>
                  <Icono size={16} strokeWidth={3} aria-hidden />
                </span>
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="etiqueta">Tipo</span>
          <div className="grid grid-cols-4 gap-2">
            {TIPOS.map(({ valor, etiqueta }) => (
              <button
                key={valor}
                onClick={() => setTipo(valor)}
                aria-pressed={tipo === valor}
                className={
                  (tipo === valor ? 'btn-primario' : 'btn-suave') + ' px-0 text-xs'
                }
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        {config.quickTagsObservacion.length > 0 && (
          <div>
            <span className="etiqueta">Etiquetas</span>
            <div className="flex flex-wrap gap-2">
              {config.quickTagsObservacion.map((t) => {
                const activa = tags.includes(t)
                return (
                  <button
                    key={t}
                    onClick={() =>
                      setTags((prev) => (activa ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                    aria-pressed={activa}
                    className={
                      'pildora min-h-[40px] px-3 transition ' +
                      (activa
                        ? 'bg-primario text-white'
                        : 'bg-agua-claro text-primario-oscuro dark:bg-noche-elevada dark:text-agua')
                    }
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <label className="etiqueta" htmlFor="obs-texto">
            Qué ha pasado
          </label>
          <CampoArea
            id="obs-texto"
            className="campo h-24 resize-none py-2"
            valor={texto}
            onValor={setTexto}
            placeholder="Usa el micrófono del teclado para dictarlo."
            autoFocus
          />
        </div>

        <button
          className="btn-primario w-full"
          onClick={() => void guardar()}
          disabled={!texto.trim() && tags.length === 0}
        >
          Guardar observación
        </button>
      </div>
    </Hoja>
  )
}
