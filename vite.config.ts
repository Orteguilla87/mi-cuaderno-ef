import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base './' => funciona igual en localhost y en GitHub Pages (subcarpeta)
export default defineConfig({
  base: './',
  // Vite no lee `PORT` por su cuenta. Sin esto, si el 5173 está ocupado se va a
  // otro puerto por su cuenta y quien lo lanzó queda apuntando al equivocado.
  server: { port: Number(process.env.PORT) || 5173 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Cuaderno EF/Psico',
        short_name: 'Cuaderno EF',
        description: 'Cuaderno docente de Educación Física y Psicomotricidad. Local-first, sin conexión.',
        lang: 'es',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F3F3EC',
        theme_color: '#006A80',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Sin runtime caching de red: la app no depende de red en runtime.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
})
