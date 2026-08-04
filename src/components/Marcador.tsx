import { Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Campo } from './Campo'
import { useConfig } from '../db/config'
import { useCapaAbierta } from '../lib/capas'

const MIN_EQUIPOS = 2
const MAX_EQUIPOS = 6

interface EquipoMarcador {
  nombre: string
  puntos: number
}

function equiposIniciales(n: number): EquipoMarcador[] {
  return Array.from({ length: n }, (_, i) => ({ nombre: `Equipo ${i + 1}`, puntos: 0 }))
}

/**
 * Marcador de tanteo a pantalla completa (§5 M8), para proyectar y leer desde la
 * pista. De 2 a 6 equipos: el número se cambia sobre la marcha sin perder los
 * puntos ya anotados. Las tarjetas y las cifras se agrandan o encogen según
 * cuántos equipos haya, para que los números sigan siendo grandes con 6.
 */
export function Marcador({ onCerrar }: { onCerrar: () => void }) {
  const config = useConfig()
  const colores =
    config.coloresPetos.length > 0 ? config.coloresPetos : ['#CE184B', '#006A80', '#B48C00', '#ABB200']
  const [equipos, setEquipos] = useState<EquipoMarcador[]>(() => equiposIniciales(3))
  useCapaAbierta(true)

  const n = equipos.length

  /** Cambia el número de equipos conservando los puntos de los que ya existían. */
  function cambiarCantidad(cantidad: number) {
    setEquipos((prev) => {
      if (cantidad <= prev.length) return prev.slice(0, cantidad)
      const extra = Array.from({ length: cantidad - prev.length }, (_, i) => ({
        nombre: `Equipo ${prev.length + i + 1}`,
        puntos: 0,
      }))
      return [...prev, ...extra]
    })
  }

  function sumar(i: number, delta: number) {
    setEquipos((prev) =>
      prev.map((e, j) => (j === i ? { ...e, puntos: Math.max(0, e.puntos + delta) } : e)),
    )
  }

  function renombrar(i: number, nombre: string) {
    setEquipos((prev) => prev.map((e, j) => (j === i ? { ...e, nombre } : e)))
  }

  function reiniciar() {
    setEquipos((prev) => prev.map((e) => ({ ...e, puntos: 0 })))
  }

  // Columnas y tamaño de cifra según cuántos equipos: con más equipos, más
  // columnas y una cifra algo menor, pero siempre grande respecto a la pantalla.
  const columnas = n <= 3 ? n : n === 4 ? 2 : 3
  const tamanoCifra =
    n <= 2 ? 'clamp(4rem, 20vh, 13rem)' : n <= 4 ? 'clamp(3rem, 15vh, 9rem)' : 'clamp(2.5rem, 11vh, 7rem)'

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-primario-oscuro p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:bg-noche-fondo">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={onCerrar}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white
                     focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
          aria-label="Cerrar marcador"
        >
          <X size={24} aria-hidden />
        </button>

        <div className="flex flex-1 items-center justify-center gap-1" role="group" aria-label="Número de equipos">
          {Array.from({ length: MAX_EQUIPOS - MIN_EQUIPOS + 1 }, (_, i) => MIN_EQUIPOS + i).map((c) => (
            <button
              key={c}
              onClick={() => cambiarCantidad(c)}
              aria-pressed={c === n}
              className={
                'cifra h-11 w-11 rounded-xl text-lg font-bold transition focus-visible:outline-none ' +
                'focus-visible:ring-4 focus-visible:ring-white/50 ' +
                (c === n ? 'bg-white text-primario' : 'bg-white/10 text-white/80')
              }
            >
              {c}
            </button>
          ))}
        </div>

        <button
          onClick={reiniciar}
          className="flex h-12 items-center gap-2 rounded-xl bg-white/10 px-4 font-semibold text-white
                     focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        >
          <RotateCcw size={20} aria-hidden />
          <span className="hidden sm:inline">Reiniciar</span>
        </button>
      </div>

      <div
        className="grid flex-1 auto-rows-fr gap-3"
        style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
      >
        {equipos.map((equipo, i) => {
          const color = colores[i % colores.length]
          return (
            <div
              key={i}
              className="flex min-h-0 flex-col rounded-xl2 border-4 p-2"
              style={{ borderColor: color, backgroundColor: `${color}1a` }}
            >
              <Campo
                valor={equipo.nombre}
                onValor={(v) => renombrar(i, v)}
                aria-label={`Nombre del equipo ${i + 1}`}
                className="w-full truncate rounded-xl bg-transparent text-center text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:text-xl"
                style={{ color }}
              />

              <div className="flex min-h-0 flex-1 items-center justify-center">
                <span
                  className="cifra font-bold leading-none text-white"
                  style={{ fontSize: tamanoCifra }}
                >
                  {equipo.puntos}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => sumar(i, -1)}
                  aria-label={`Restar punto a ${equipo.nombre}`}
                  className="flex min-h-[64px] flex-1 items-center justify-center rounded-xl bg-white/10 text-white transition active:scale-95
                             focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
                >
                  <Minus size={28} aria-hidden />
                </button>
                <button
                  onClick={() => sumar(i, 1)}
                  aria-label={`Sumar punto a ${equipo.nombre}`}
                  className="flex min-h-[64px] flex-[2] items-center justify-center rounded-xl font-bold text-white transition active:scale-95
                             focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
                  style={{ backgroundColor: color }}
                >
                  <Plus size={32} aria-hidden />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
