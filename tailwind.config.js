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
      // Móvil o tablet girado (§ Bloque 4 de orientación). Es un `screen`
      // propio y no `max-lg:landscape:` repetido en cada clase por dos
      // razones: se lee de un vistazo qué reglas son de apaisado, y al ir en
      // `extend` sus reglas se emiten DESPUÉS de `md:`/`lg:`, así que ganan
      // sin depender del orden en que estén escritas las clases.
      screens: {
        apaisado: { raw: '(max-width: 1023px) and (orientation: landscape)' },
        // Escritorio con poca altura (portátil a 1536×695, Bloque F1): la
        // barra lateral compacta sus entradas para que todas quepan sin scroll.
        bajo: { raw: '(min-width: 1024px) and (max-height: 759px)' },
      },
      colors: {
        primario: {
          DEFAULT: token('primary'),
          oscuro: token('primary-dark'),
          claro: token('primary-light'),
        },
        acento: {
          DEFAULT: token('accent'),
          oscuro: token('accent-dark'),
          claro: token('accent-light'),
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
        // Mismo tono que el peto amarillo (--equipo-amarillo): relleno de las
        // estrellas de valoración de sesión, no una familia de color nueva.
        estrella: token('equipo-amarillo'),
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
      // Bloque F6a: `text-acento` (texto e iconos) apunta a un ROL que cambia
      // con el tema (--accent-text: oscurecido en claro, aclarado en oscuro);
      // `bg-acento`, `border-acento` y `ring-acento` siguen con el acento puro.
      textColor: {
        acento: { DEFAULT: token('accent-text') },
        tinta: { suave: token('texto-suave'), tenue: token('texto-tenue') },
        aviso: { DEFAULT: token('warning-text') },
      },
      // Tres superficies (fondo, tarjeta, elevada) y la fila par de rejilla:
      // roles de tokens.css que se redefinen en `.dark`.
      backgroundColor: {
        sup: {
          fondo: token('sup-fondo'),
          tarjeta: token('sup-tarjeta'),
          elevada: token('sup-elevada'),
          fila: token('sup-fila'),
        },
      },
      // Sin esto, un `border` o un `ring` sin color explícito cae al gris-200 y
      // al azul-500 de Tailwind: grises y azules ajenos colados sin que aparezcan
      // en ningún grep. Los valores por defecto también son tokens.
      borderColor: { DEFAULT: token('border') },
      ringColor: { DEFAULT: token('primary') },
      minHeight: { tap: '48px' },
      minWidth: { tap: '48px' },
      // Escala tipográfica (Bloque F6b). Cada nombre apunta a un ROL cuyo valor
      // se define POR SEPARADO para móvil y para escritorio en tokens.css (sin
      // constantes compartidas): meta, texto, principal, sección y título.
      // 3xl en adelante queda fuera: son las cifras grandes de las vistas
      // proyectables (marcador, sorteo), que se miden a distancia.
      fontSize: {
        xs: ['var(--fs-meta)', { lineHeight: '1.35' }],
        sm: ['var(--fs-texto)', { lineHeight: '1.45' }],
        base: ['var(--fs-principal)', { lineHeight: '1.5' }],
        lg: ['var(--fs-seccion)', { lineHeight: '1.35' }],
        xl: ['var(--fs-seccion)', { lineHeight: '1.3' }],
        '2xl': ['var(--fs-titulo)', { lineHeight: '1.25' }],
      },
      // Pesos (Bloque F6b): 400 texto, 600 títulos y nombres. Las negritas
      // (700+) de antes se quedan en 600: sin negritas innecesarias.
      fontWeight: {
        bold: '600',
        extrabold: '600',
        black: '600',
      },
      // Radios por jerarquía (Bloque F6a), desde las variables de tokens.css.
      // La escala heredada se remapea para que ningún componente quede con un
      // radio suelto: `xl`/`lg`/`md` (controles) → 8 px; `xl2` (tarjetas) →
      // 12 px; `2xl`/`3xl` → contenedor. Hojas, paneles y menús piden
      // `rounded-contenedor` (16 px) explícitamente.
      borderRadius: {
        DEFAULT: 'var(--radio-control)',
        control: 'var(--radio-control)',
        tarjeta: 'var(--radio-tarjeta)',
        contenedor: 'var(--radio-contenedor)',
        md: 'var(--radio-control)',
        lg: 'var(--radio-control)',
        xl: 'var(--radio-control)',
        xl2: 'var(--radio-tarjeta)',
        '2xl': 'var(--radio-contenedor)',
        '3xl': 'var(--radio-contenedor)',
      },
      // Escala de capas de src/index.css: un solo origen para nav/FAB/hojas/
      // avisos/pantallas completas/bloqueo por PIN, para que no se repita un
      // z-40 suelto en cada componente y acabe empatando con otro.
      zIndex: {
        nav: 'var(--z-nav)',
        fab: 'var(--z-fab)',
        hoja: 'var(--z-hoja)',
        aviso: 'var(--z-aviso)',
        modal: 'var(--z-modal)',
        bloqueo: 'var(--z-bloqueo)',
      },
    },
  },
  plugins: [],
}
