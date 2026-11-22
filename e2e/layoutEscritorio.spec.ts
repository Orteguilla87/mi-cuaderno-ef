import { expect, test, type Page } from '@playwright/test'

/**
 * Bloque F2: layout de escritorio por vista y cabecera compacta, en tres
 * tamaños de ventana. Lectura = 960 útiles centrados; trabajo = el área con
 * 32 px a cada lado y tope de 1600; cabecera ≤ 64 px y alineada con el contenido.
 */
const MENU: [etiqueta: string, tipo: 'lectura' | 'trabajo'][] = [
  ['Hoy', 'lectura'], ['Cuaderno', 'trabajo'], ['Grupos', 'lectura'], ['Planificador', 'trabajo'],
  ['Rúbricas', 'lectura'], ['Observaciones', 'lectura'], ['Cobertura de criterios', 'lectura'],
  ['Informes', 'lectura'], ['Etiquetas de alumnado', 'lectura'], ['Vincular alumnado', 'lectura'],
  ['Inventario', 'lectura'], ['Calendario', 'trabajo'], ['Herramientas', 'lectura'], ['Ajustes', 'lectura'],
]
const TAMANOS = [
  { width: 1280, height: 720 }, { width: 1536, height: 695 }, { width: 1920, height: 1080 },
]

async function sembrar(page: Page) {
  await page.goto('/#/hoy')
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    await db.cursos.put({
      id: 'c', nombre: '2026-2027', activo: true, inicio: '2026-09-01', fin: '2027-06-30',
      trimestres: [{ n: 1, inicio: '2026-09-07', fin: '2026-12-22' }], festivos: [],
    } as never)
    for (const [i, n] of ['3ºA', '4ºB'].entries()) {
      await db.grupos.put({
        id: `g${i}`, cursoEscolarId: 'c', nombre: n, etapa: 'primaria', nivel: 3 + i,
        color: '#006A80', orden: i, horario: [],
      } as never)
      await db.alumnos.put({ id: `a${i}`, grupoId: `g${i}`, nombre: 'Ana', apellidos: 'Pérez', alias: '', activo: true } as never)
    }
    for (let i = 0; i < 25; i++)
      await db.rubricas.put({
        id: `r${i}`, titulo: `Rúbrica ${i}`, niveles: [{ id: 'n', etiqueta: 'A', puntos: 1 }], criterios: [],
      } as never)
    const obs = []
    for (let i = 0; i < 30; i++)
      obs.push({ id: `o${i}`, alumnoId: 'a0', grupoId: 'g0', fecha: '2026-11-20', tipo: 'conducta', signo: 'neutro', texto: `Observación ${i}`, tags: [] })
    await db.observaciones.bulkPut(obs as never)
  })
}

test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'Solo escritorio')

for (const tam of TAMANOS) {
  test(`14 vistas a ${tam.width}×${tam.height}: lectura, trabajo y cabecera`, async ({ page }) => {
    await page.setViewportSize(tam)
    await sembrar(page)
    const nav = page.getByRole('navigation', { name: 'Principal' })
    const centros = new Set<number>()
    for (const [etiqueta, tipo] of MENU) {
      await nav.getByRole('button', { name: etiqueta, exact: true }).click()
      // Área de contenido: sin la barra lateral (15rem) ni la barra de scroll, si la hay.
      const ancho = await page.evaluate(() => document.querySelector('main')!.parentElement!.clientWidth)
      const area = ancho - 240
      const cab = page.locator('main header').first()
      await expect(cab).toBeVisible()
      const c = (await cab.boundingBox())!
      // Cabecera compacta.
      expect(c.height, `${etiqueta}: alto de cabecera`).toBeLessThanOrEqual(64)
      // Ancho según el tipo.
      const esperado = tipo === 'lectura' ? Math.min(960, area - 48) : Math.min(1600, area - 64)
      expect(c.width, `${etiqueta}: ancho`).toBeGreaterThanOrEqual(esperado - 1)
      expect(c.width, `${etiqueta}: ancho`).toBeLessThanOrEqual(esperado + 1)
      // Centrada en el área de contenido: mismos márgenes a izquierda y derecha de <main>.
      const m = (await page.locator('main').boundingBox())!
      const izq = c.x - m.x
      const der = m.x + m.width - (c.x + c.width)
      expect(Math.abs(izq - der), `${etiqueta}: centrado`).toBeLessThanOrEqual(1)
      // El eje de la página no salta entre vistas con y sin scroll (scrollbar-gutter, F1).
      centros.add(Math.round(m.x + m.width / 2))
      // Sin scroll lateral de página.
      const { vw, sw } = await page.evaluate(() => ({
        vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth,
      }))
      expect(sw, `${etiqueta}: scroll lateral`).toBeLessThanOrEqual(vw)
    }
    expect(centros.size, 'el centro del contenido salta entre vistas').toBe(1)
  })
}

for (const [ruta, nombre] of [['rubricas', 'Rúbricas'], ['observaciones', 'Observaciones']] as const)
  test(`${nombre}: la cabecera sigue pegada arriba al hacer scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await page.goto(`/#/${ruta}`)
    await expect(page.locator('main header').first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 600))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
    const c = (await page.locator('main header').first().boundingBox())!
    expect(c.y).toBeLessThanOrEqual(1)
    // Fondo opaco: el color de la cabecera no lleva transparencia.
    const fondo = await page.locator('main header').first().evaluate((h) => getComputedStyle(h).backgroundColor)
    expect(fondo).not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)/)
  })

test('Cobertura: el criterio ocupa hasta 2 líneas con el texto en title', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 695 })
  await sembrar(page)
  await page.goto('/#/cobertura')
  const textos = page.locator('main span[title]')
  if (await textos.count()) {
    const t = textos.first()
    await expect(t).toHaveCSS('-webkit-line-clamp', '2')
    expect((await t.getAttribute('title'))!.length).toBeGreaterThan(5)
  }
})
