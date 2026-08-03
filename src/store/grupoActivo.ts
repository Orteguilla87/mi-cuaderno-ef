import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Grupo activo, compartido entre Cuaderno y Planificador (§ Bloque 6.3): elegir
 * un grupo en uno debe dejarlo elegido al entrar en el otro, así que vive fuera
 * de ambos componentes. Persistido en localStorage —solo un id, no datos de
 * alumnado— para que sobreviva a cerrar y volver a abrir la app.
 */
interface EstadoGrupoActivo {
  grupoId: string | null
  fijarGrupo: (id: string | null) => void
}

export const useGrupoActivo = create<EstadoGrupoActivo>()(
  persist(
    (set) => ({
      grupoId: null,
      fijarGrupo: (grupoId) => set({ grupoId }),
    }),
    { name: 'cuaderno-ef:grupo-activo' },
  ),
)
