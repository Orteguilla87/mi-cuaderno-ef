import { defineConfig } from 'vitest/config'

// Configuración propia, separada de vite.config.ts: los tests son lógica pura
// (motor de notas, fórmulas, generador de equipos…) y no necesitan el plugin
// de React ni el de PWA.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
