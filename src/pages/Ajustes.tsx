import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Cabecera } from '../components/Cabecera'
import { CursoEscolarAjustes } from '../components/CursoEscolarAjustes'
import { CONFIG_POR_DEFECTO, guardarConfig, useConfig } from '../db/config'
import { db } from '../db/db'
import { leerCursoActivo } from '../db/curso'
import type { BandasOficiales, ModoMedia } from '../db/types'

export function Ajustes() {
  const config = useConfig()
  const curso = useLiveQuery(() => leerCursoActivo(), [])

  return (
    <>
      <Cabecera titulo="Ajustes" subtitulo={curso ? `Curso ${curso.nombre}` : undefined} atras />

      <div className="space-y-4 p-4">
        <Seccion
          titulo="Curso escolar"
          ayuda="El planificador genera las sesiones entre estas fechas, saltando los días no lectivos."
        >
          <CursoEscolarAjustes />
        </Seccion>

        <Seccion titulo="Aspecto">
          <Fila
            etiqueta="Modo pista"
            ayuda="Alto contraste y botones grandes para el sol directo."
            control={
              <Interruptor
                activo={config.modoPista}
                onCambio={(v) => guardarConfig({ modoPista: v })}
                etiqueta="Modo pista"
              />
            }
          />
          <div>
            <span className="etiqueta">Tema</span>
            <div className="grid grid-cols-3 gap-2">
              {(['sistema', 'claro', 'oscuro'] as const).map((t) => (
                <button
                  key={t}
                  className={config.tema === t ? 'btn-primario' : 'btn-suave'}
                  onClick={() => guardarConfig({ tema: t })}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </Seccion>

        <Seccion
          titulo="Generador de equipos"
          ayuda="Colores de peto por defecto, en el orden en que se asignan a los equipos."
        >
          <ColoresPetos coloresPetos={config.coloresPetos} />
        </Seccion>

        <Seccion
          titulo="Evaluación"
          ayuda="Se aplica a Primaria. Infantil usa solo escala cualitativa."
        >
          <div>
            <span className="etiqueta">Media de la nota final</span>
            <div className="space-y-2">
              {(
                [
                  ['aritmetica', 'Aritmética', 'Media simple de los tres trimestres.'],
                  ['ponderada', 'Ponderada', 'Cada trimestre pesa lo que indiques abajo.'],
                  ['continua', 'Continua', 'Nota del 3.º trimestre ajustada por la tendencia.'],
                ] as [ModoMedia, string, string][]
              ).map(([valor, titulo, ayuda]) => (
                <button
                  key={valor}
                  onClick={() => guardarConfig({ modoMedia: valor })}
                  className={
                    'w-full rounded-xl border p-3 text-left ' +
                    (config.modoMedia === valor
                      ? 'border-primario bg-primario/10'
                      : 'border-borde dark:border-noche-borde')
                  }
                >
                  <div className="font-semibold">{titulo}</div>
                  <div className="text-sm texto-suave">{ayuda}</div>
                </button>
              ))}
            </div>
          </div>

          {config.modoMedia === 'ponderada' && (
            <div>
              <span className="etiqueta">Pesos por trimestre (%)</span>
              <div className="flex gap-2">
                {config.pesosTrimestres.map((peso, i) => (
                  <label key={i} className="flex-1">
                    <span className="mb-1 block text-center text-xs texto-suave">{i + 1}.º</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="campo text-center"
                      value={peso}
                      onChange={(e) => {
                        const pesos = [...config.pesosTrimestres] as [number, number, number]
                        pesos[i] = Number(e.target.value)
                        void guardarConfig({ pesosTrimestres: pesos })
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs texto-suave">
                Suman {config.pesosTrimestres.reduce((a, b) => a + b, 0)}%.
              </p>
            </div>
          )}

          <EditorBandas
            bandas={config.bandasOficiales}
            onCambio={(bandas) => guardarConfig({ bandasOficiales: bandas })}
          />
        </Seccion>

        <Seccion
          titulo="Agente de voz"
          ayuda="Única conexión de red de la app. Solo se envía texto pseudonimizado: nunca nombres ni datos de la base."
        >
          <ClaveApi />
          <div>
            <label className="etiqueta" htmlFor="modelo">
              Modelo
            </label>
            <input
              id="modelo"
              className="campo"
              value={config.modeloAgente}
              onChange={(e) => guardarConfig({ modeloAgente: e.target.value })}
            />
            <p className="mt-1 text-xs texto-suave">
              Los identificadores cambian con el tiempo; por eso es editable.
            </p>
          </div>
        </Seccion>

        <Seccion titulo="Datos" ayuda="Todo vive en este dispositivo. Nada se sube a ningún servidor.">
          <Estadisticas />
          <p className="text-xs texto-suave">
            El backup cifrado y el PIN llegan en la fase 8. Hasta entonces, evita reinstalar el
            navegador o borrar sus datos.
          </p>
        </Seccion>
      </div>
    </>
  )
}

function ColoresPetos({ coloresPetos }: { coloresPetos: string[] }) {
  function cambiar(i: number, valor: string) {
    const nuevo = [...coloresPetos]
    nuevo[i] = valor
    void guardarConfig({ coloresPetos: nuevo })
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {coloresPetos.map((c, i) => (
          <label key={i} className="flex flex-col items-center gap-1">
            <input
              type="color"
              value={c}
              onChange={(e) => cambiar(i, e.target.value)}
              className="h-12 w-full cursor-pointer rounded-lg border border-borde dark:border-noche-borde"
              aria-label={`Color de peto ${i + 1}`}
            />
          </label>
        ))}
      </div>
      <button
        className="btn-fantasma"
        onClick={() => void guardarConfig({ coloresPetos: CONFIG_POR_DEFECTO.coloresPetos })}
      >
        Restaurar por defecto
      </button>
    </div>
  )
}

function Seccion({
  titulo,
  ayuda,
  children,
}: {
  titulo: string
  ayuda?: string
  children: React.ReactNode
}) {
  return (
    <section className="tarjeta space-y-4">
      <div>
        <h2 className="text-lg font-bold">{titulo}</h2>
        <div className="linea-pista mt-1.5" aria-hidden />
        {ayuda && <p className="mt-2 text-sm texto-suave">{ayuda}</p>}
      </div>
      {children}
    </section>
  )
}

function Fila({
  etiqueta,
  ayuda,
  control,
}: {
  etiqueta: string
  ayuda?: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{etiqueta}</div>
        {ayuda && <div className="text-sm texto-suave">{ayuda}</div>}
      </div>
      {control}
    </div>
  )
}

function Interruptor({
  activo,
  onCambio,
  etiqueta,
}: {
  activo: boolean
  onCambio: (v: boolean) => void
  etiqueta: string
}) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambio(!activo)}
      className={
        'relative h-8 w-14 shrink-0 rounded-full transition ' +
        (activo ? 'bg-primario' : 'bg-borde dark:bg-noche-borde')
      }
    >
      <span
        className={
          'absolute top-1 h-6 w-6 rounded-full bg-white transition-all ' +
          (activo ? 'left-7' : 'left-1')
        }
      />
    </button>
  )
}

function EditorBandas({
  bandas,
  onCambio,
}: {
  bandas: BandasOficiales
  onCambio: (b: BandasOficiales) => void
}) {
  const claves: (keyof BandasOficiales)[] = ['SU', 'BI', 'NT', 'SB']

  return (
    <div>
      <span className="etiqueta">Bandas de calificación oficial</span>
      <p className="mb-2 text-xs texto-suave">
        Nota mínima para cada calificación. Por debajo de {bandas.SU} es IN.
      </p>
      <div className="flex gap-2">
        {claves.map((c) => (
          <label key={c} className="flex-1">
            <span className="mb-1 block text-center text-xs font-bold texto-suave">{c}</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              className="campo text-center"
              value={bandas[c]}
              onChange={(e) => onCambio({ ...bandas, [c]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

/** La API key solo se guarda en local (§1.3). Se muestra enmascarada por defecto. */
function ClaveApi() {
  const config = useConfig()
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="etiqueta" htmlFor="api-key">
        API key de Anthropic
      </label>
      <div className="flex gap-2">
        <input
          id="api-key"
          type={visible ? 'text' : 'password'}
          className="campo flex-1"
          value={config.apiKey ?? ''}
          onChange={(e) => guardarConfig({ apiKey: e.target.value })}
          placeholder="sk-ant-..."
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn-suave" onClick={() => setVisible((v) => !v)}>
          {visible ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      <p className="mt-1 text-xs texto-suave">
        Se guarda solo en este dispositivo. Sin clave, el agente funcionará con el parser local
        sin conexión.
      </p>
    </div>
  )
}

function Estadisticas() {
  const datos = useLiveQuery(async () => ({
    grupos: await db.grupos.count(),
    alumnos: await db.alumnos.filter((a) => a.activo).count(),
    asistencias: await db.asistencias.count(),
    observaciones: await db.observaciones.count(),
  }))

  if (!datos) return null

  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      {[
        ['Grupos', datos.grupos],
        ['Alumnos', datos.alumnos],
        ['Registros de asistencia', datos.asistencias],
        ['Observaciones', datos.observaciones],
      ].map(([etiqueta, valor]) => (
        <div key={String(etiqueta)} className="rounded-lg bg-agua-claro p-2 dark:bg-noche-elevada">
          <dt className="text-xs texto-suave">{etiqueta}</dt>
          <dd className="text-lg font-bold">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}
