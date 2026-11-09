import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModoOrganizar } from '../lib/organizarUnidades'

/**
 * Cómo se organiza el listado de unidades y qué secciones están plegadas.
 *
 * Preferencia DE DISPOSITIVO, en `localStorage` y fuera de la copia: es cómo le
 * gusta ver la lista en este aparato, no un dato del cuaderno. Las carpetas en
 * sí sí son datos (tabla `carpetas`) y viajan con la copia cifrada.
 *
 * Si el almacenamiento falla (ventana privada), `persist` sigue funcionando en
 * memoria: se pierde la preferencia, no la vista.
 */
interface EstadoOrganizarUnidades {
  modo: ModoOrganizar
  plegadas: string[]
  fijarModo: (modo: ModoOrganizar) => void
  alternarPlegada: (clave: string) => void
}

export const useOrganizarUnidades = create<EstadoOrganizarUnidades>()(
  persist(
    (set) => ({
      modo: 'curso',
      plegadas: [],
      fijarModo: (modo) => set({ modo }),
      alternarPlegada: (clave) =>
        set((s) => ({
          plegadas: s.plegadas.includes(clave)
            ? s.plegadas.filter((c) => c !== clave)
            : [...s.plegadas, clave],
        })),
    }),
    { name: 'cuaderno-ef:organizar-unidades' },
  ),
)
