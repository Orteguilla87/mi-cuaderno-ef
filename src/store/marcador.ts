import { create } from 'zustand'

/**
 * El marcador de tanteo, fuera del componente.
 *
 * Vivía en el estado local de `Herramientas`, así que solo existía mientras esa
 * pantalla estaba abierta y no había forma de tocarlo desde otro sitio. El
 * agente de voz necesita las tres cosas —abrirlo, sumar y restar— desde donde
 * sea que esté el maestro, con el móvil en el bolsillo y sin volver a la
 * pantalla de herramientas. Los puntos son del partido, no de la vista.
 */

export const MIN_EQUIPOS = 2
export const MAX_EQUIPOS = 6

export interface EquipoMarcador {
  nombre: string
  puntos: number
}

export function equiposIniciales(n: number): EquipoMarcador[] {
  return Array.from({ length: n }, (_, i) => ({ nombre: `Equipo ${i + 1}`, puntos: 0 }))
}

function acotar(n: number): number {
  return Math.min(MAX_EQUIPOS, Math.max(MIN_EQUIPOS, Math.round(n)))
}

interface EstadoMarcador {
  visible: boolean
  equipos: EquipoMarcador[]
  /** Abre el marcador. Con `equipos`, lo arranca de cero con esa cantidad. */
  abrir: (equipos?: number) => void
  cerrar: () => void
  cambiarCantidad: (cantidad: number) => void
  /** Suma o resta al equipo `i` (base 0). Los puntos nunca bajan de 0. */
  sumar: (i: number, delta: number) => void
  renombrar: (i: number, nombre: string) => void
  reiniciar: () => void
}

export const useMarcador = create<EstadoMarcador>((set) => ({
  visible: false,
  equipos: equiposIniciales(3),
  abrir: (equipos) =>
    set((s) => ({
      visible: true,
      // Sin cantidad dicha se conserva el tanteo en curso: volver a abrirlo a
      // media clase no puede borrar lo que ya iba marcado.
      equipos: equipos === undefined ? s.equipos : equiposIniciales(acotar(equipos)),
    })),
  cerrar: () => set({ visible: false }),
  cambiarCantidad: (cantidad) =>
    set((s) => {
      const n = acotar(cantidad)
      if (n <= s.equipos.length) return { equipos: s.equipos.slice(0, n) }
      const extra = Array.from({ length: n - s.equipos.length }, (_, i) => ({
        nombre: `Equipo ${s.equipos.length + i + 1}`,
        puntos: 0,
      }))
      return { equipos: [...s.equipos, ...extra] }
    }),
  sumar: (i, delta) =>
    set((s) => ({
      equipos: s.equipos.map((e, j) => (j === i ? { ...e, puntos: Math.max(0, e.puntos + delta) } : e)),
    })),
  renombrar: (i, nombre) =>
    set((s) => ({ equipos: s.equipos.map((e, j) => (j === i ? { ...e, nombre } : e)) })),
  reiniciar: () => set((s) => ({ equipos: s.equipos.map((e) => ({ ...e, puntos: 0 })) })),
}))
