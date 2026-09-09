/**
 * Nivel motriz 1–5 (`Alumno.nivelMotriz`): la valoración del maestro sobre lo
 * que un niño puede hacer hoy, que el generador usa para repartir equipos.
 *
 * REGLA DURA, heredada de `apoyos` (§1.6): es una valoración sobre un niño.
 * Se ve en las vistas de gestión —ficha del alumno, «Género y nivel»— y en
 * NINGUNA vista proyectable: ni en la pantalla de equipos, ni en el alumno
 * aleatorio, ni en el marcador, ni en la pizarra. Tampoco en informes, PDF,
 * XLSX, CSV ni en lo que se manda al agente. La vigilancia está en
 * `lib/etiquetasAlumno.test.ts` y `lib/pseudonimizacion.test.ts`.
 *
 * Los números por sí solos no dicen nada —«un 2» no se sabe si es bueno o
 * malo—, así que cada uno lleva su rótulo en lenguaje llano.
 *
 * PENDIENTE: redacción provisional, a revisar por el usuario. Son los rótulos
 * que verá el maestro al valorar; cambiarlos aquí los cambia en toda la app.
 */

export const NIVELES_MOTRICES = [1, 2, 3, 4, 5] as const

export type NivelMotriz = (typeof NIVELES_MOTRICES)[number]

export const ETIQUETA_NIVEL_MOTRIZ: Record<NivelMotriz, string> = {
  1: 'Requiere apoyo',
  2: 'En desarrollo',
  3: 'Se desenvuelve',
  4: 'Buen desempeño',
  5: 'Alto desempeño',
}

/** Rótulo del nivel, o el aviso de que no se ha valorado (que no es un cero). */
export function etiquetaNivelMotriz(nivel: NivelMotriz | null | undefined): string {
  return nivel ? ETIQUETA_NIVEL_MOTRIZ[nivel] : 'Sin valorar'
}
