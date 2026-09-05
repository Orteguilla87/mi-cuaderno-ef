import { defineConfig } from 'vitest/config'

// Configuración propia, separada de vite.config.ts: los tests son lógica pura
// (motor de notas, fórmulas, generador de equipos…) y no necesitan el plugin
// de React ni el de PWA.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Solo db.test.ts y sus dependientes tocan Dexie; el resto son funciones
    // puras y no necesitan IndexedDB.
    setupFiles: ['./src/test/setupIndexedDB.ts'],
    // Los tests de backup y sincronización cifran de verdad: PBKDF2 con las
    // 600k iteraciones de §1.4, varias veces por test. Con la suite entera en
    // paralelo eso pasa de los 5 s por defecto y falla por reloj, no por lógica
    // — y bajar las iteraciones en pruebas dejaría sin probar lo que importa.
    testTimeout: 30_000,
  },
})
