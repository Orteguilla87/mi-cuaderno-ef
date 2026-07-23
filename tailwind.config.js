/**
 * Tailwind es solo el motor de utilidades sobre los tokens de §3.1 (CLAUDE.md).
 * Aquí NO se define ningún color: cada utilidad apunta a una variable de
 * `src/styles/tokens.css`, que es la única fuente de verdad. Escribir un hex en
 * este fichero es una desviación de la spec.
 */

/** `rgb(var(--x) / <alpha-value>)` conserva los modificadores de opacidad (`bg-primario/25`). */
const token = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primario: {
          DEFAULT: token('primary'),
          oscuro: token('primary-dark'),
          claro: token('primary-light'),
        },
        acento: {
          DEFAULT: token('accent'),
          oscuro: token('accent-dark'),
        },
        lima: {
          DEFAULT: token('positive'),
          oscuro: token('positive-dark'),
        },
        // Estado intermedio (retraso, advertencias): mezcla de lima y acento.
        aviso: {
          DEFAULT: token('warning'),
          oscuro: token('warning-dark'),
          claro: token('warning-soft'),
        },
        hueso: token('bg'),
        superficie: token('surface'),
        agua: {
          DEFAULT: token('soft'),
          claro: token('soft-light'),
          medio: token('soft-mid'),
        },
        // Neutros con el matiz del primario: ningún gris frío de Tailwind.
        tinta: {
          DEFAULT: token('ink'),
          suave: token('ink-soft'),
          tenue: token('ink-faint'),
        },
        borde: {
          DEFAULT: token('border'),
          fuerte: token('border-strong'),
        },
        noche: {
          fondo: token('night-bg'),
          superficie: token('night-surface'),
          elevada: token('night-raised'),
          borde: token('night-border'),
          texto: token('night-ink'),
          suave: token('night-soft'),
        },
      },
      // Sin esto, un `border` o un `ring` sin color explícito cae al gris-200 y
      // al azul-500 de Tailwind: grises y azules ajenos colados sin que aparezcan
      // en ningún grep. Los valores por defecto también son tokens.
      borderColor: { DEFAULT: token('border') },
      ringColor: { DEFAULT: token('primary') },
      minHeight: { tap: '48px' },
      minWidth: { tap: '48px' },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
}
