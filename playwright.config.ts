import { defineConfig } from '@playwright/test'

/**
 * Pruebas de disposición en un navegador real. Lo que comprueban —que ninguna
 * vista principal desborde el ancho del móvil— no se puede medir en jsdom, que
 * no calcula layout. Usa el Chrome del sistema (`channel: 'chrome'`): no se
 * descarga ningún navegador.
 *
 * Vitest no las recoge: su `include` es `src/**\/*.test.ts` y estas viven en `e2e/`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5174/', channel: 'chrome' },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'movil', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'escritorio', use: { viewport: { width: 1440, height: 900 } } },
  ],
})
