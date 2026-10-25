/**
 * Ancho y disposición de las vistas principales, por vista y por viewport.
 * ÚNICO sitio donde se fijan: tres veces un cambio pensado para escritorio, o
 * una rejilla sin columnas, se coló en móvil (Planificador, Hoy y otra vez
 * Planificador) porque cada pantalla tenía su literal suelto.
 *
 * Reglas:
 * - Cada entrada la consume UNA sola vista. Aunque dos literales coincidan, no
 *   se comparten: ensanchar una vista no puede arrastrar a otra.
 * - Toda rejilla de tarjetas empieza por `grid-cols-1` (= `minmax(0, 1fr)`).
 *   Sin él la pista implícita es `auto`, mide el título `truncate` sin cortar y
 *   un título largo ensancha la tarjeta más allá de la pantalla del móvil.
 * - Lo de escritorio lleva `lg:` dentro del propio valor (el corte de la barra
 *   lateral): usado donde sea, nunca afecta al móvil.
 * - Literales enteros, para que Tailwind los encuentre al escanear.
 *
 * `e2e/desborde.spec.ts` comprueba en un navegador real que ninguna vista
 * principal produce scroll lateral en móvil.
 */
export const DISPOSICION = {
  /** Hoy · Día y Semana: tarjetas de clase, una por fila (dos en apaisado). */
  hoy: { rejilla: 'grid grid-cols-1 gap-2 apaisado:grid-cols-2' },
  /** Hoy · clases quitadas de ese día. */
  hoyCanceladas: { rejilla: 'grid grid-cols-1 gap-2 apaisado:grid-cols-2' },

  /** Planificador · Semana: tarjetas apiladas en móvil, dos por fila en escritorio. */
  planSemana: { rejilla: 'grid grid-cols-1 gap-2 apaisado:grid-cols-2 lg:grid-cols-2' },
  /** Planificador · Semana: clases quitadas de ese día. */
  planSemanaCanceladas: { rejilla: 'grid grid-cols-1 gap-2 apaisado:grid-cols-2 lg:grid-cols-2' },

  /**
   * Planificador · Grupo.
   * - movil: un grupo cada vez (el del desplegable), al ancho del contenedor.
   * - escritorioTira: todos los grupos en paralelo, con scroll horizontal
   *   DENTRO de la tira (la página no se ensancha). Oculta en móvil.
   * - escritorioColumna: 33rem (1,5 × los 22rem de antes) para leer completos
   *   títulos del tipo «SESIÓN DE LECTURA · Libro B, bloque 2».
   */
  planGrupo: {
    movil: 'w-full space-y-4 lg:hidden',
    escritorioTira: 'hidden gap-4 overflow-x-auto pb-2 pr-4 lg:flex',
    escritorioColumna: 'lg:w-[33rem]',
  },

  /** Grupos: tarjetas de grupo. */
  grupos: { rejilla: 'grid grid-cols-1 gap-3 apaisado:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3' },

  /** Calendario: clases del día elegido. */
  calendario: { rejilla: 'grid grid-cols-1 gap-2 apaisado:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3' },
  /** Calendario: clases quitadas del día elegido. */
  calendarioCanceladas: { rejilla: 'grid grid-cols-1 gap-2 apaisado:grid-cols-2 lg:grid-cols-2' },
} as const
