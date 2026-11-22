import { expect, test } from '@playwright/test'
import { aplicarTema, fallosContraste, sembrar, TEMAS } from './utilContraste'

/**
 * Bloque F6a: contraste AA (texto ≥4.5:1, grande ≥3:1, ≥12 px; iconos de
 * control ≥3:1) en las vistas pedidas, en los cuatro temas y en móvil y
 * escritorio. Además: tres niveles de superficie distinguibles, FAB fuera del
 * rojo y foco visible en escritorio.
 */

const VISTAS = [
  '/#/hoy',
  '/#/cuaderno/g6a',
  '/#/cobertura',
  '/#/etiquetas-alumnado',
  '/#/vincular-alumnado',
  '/#/observaciones',
  '/#/observaciones/g6a',
  '/#/calendario',
]

for (const tema of TEMAS) {
  test(`contraste en ${tema}`, async ({ page, isMobile }) => {
    test.setTimeout(120_000)
    if (!isMobile) await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    const todos: string[] = []
    for (const ruta of VISTAS) {
      await page.goto(ruta)
      await page.waitForTimeout(400)
      await aplicarTema(page, tema)
      for (const f of await fallosContraste(page)) todos.push(`${ruta} · ${f}`)
    }
    expect(todos).toEqual([])
  })
}

test('escritorio 1920×1080: contraste en claro y oscuro', async ({ page, isMobile }) => {
  test.skip(!!isMobile)
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await sembrar(page)
  const todos: string[] = []
  for (const tema of ['claro', 'oscuro'] as const) {
    for (const ruta of VISTAS) {
      await page.goto(ruta)
      await page.waitForTimeout(400)
      await aplicarTema(page, tema)
      for (const f of await fallosContraste(page)) todos.push(`${tema} ${ruta} · ${f}`)
    }
  }
  expect(todos).toEqual([])
})

test('tres niveles de superficie distinguibles', async ({ page }) => {
  await sembrar(page)
  await page.goto('/#/hoy')
  for (const tema of ['claro', 'oscuro'] as const) {
    await aplicarTema(page, tema)
    const lums = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      const lum = (v: string) => {
        const [r, g, b] = v.trim().split(/\s+/).map((x) => {
          const s = Number(x) / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      return ['--sup-fondo', '--sup-tarjeta', '--sup-elevada'].map((v) => lum(cs.getPropertyValue(v)))
    })
    const r = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    expect(r(lums[0], lums[1])).toBeGreaterThanOrEqual(1.05)
    expect(r(lums[1], lums[2])).toBeGreaterThanOrEqual(1.05)
    expect(r(lums[0], lums[2])).toBeGreaterThanOrEqual(1.05)
  }
})

test('el FAB del micrófono no es rojo', async ({ page }) => {
  await sembrar(page)
  await page.goto('/#/hoy')
  const fondo = await page
    .getByRole('button', { name: /agente|micr|dictar|voz/i })
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(fondo).not.toBe('rgb(206, 24, 75)')
})

test('foco de teclado visible en escritorio', async ({ page, isMobile }) => {
  test.skip(!!isMobile)
  await page.setViewportSize({ width: 1536, height: 695 })
  await sembrar(page)
  await page.goto('/#/cuaderno/g6a')
  await page.waitForTimeout(400)
  const sinFoco: string[] = []
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const cs = getComputedStyle(el)
      const anillo = cs.boxShadow !== 'none' && cs.boxShadow.includes('rgb')
      const contorno = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2
      return { ok: anillo || contorno, quien: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) }
    })
    if (info && !info.ok) sinFoco.push(String(info.quien))
  }
  expect(sinFoco).toEqual([])
})
