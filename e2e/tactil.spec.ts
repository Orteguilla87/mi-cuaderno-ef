import { expect, test } from '@playwright/test'
import { sembrar } from './utilContraste'

/**
 * Bloque F6b: en móvil, todo control visible ofrece un objetivo táctil de al
 * menos 44×44 px —su propia caja o, si se dibuja más pequeño, su área ampliada
 * con `.tap-44` (un ::after que la extiende sin cambiar el dibujo)—. Y ningún
 * input/select/textarea baja de 16 px (iOS hace zoom al enfocarlos).
 */

const VISTAS = [
  '/#/hoy',
  '/#/cuaderno/g6a',
  '/#/grupos',
  '/#/grupos/g6a',
  '/#/asistencia/g6a',
  '/#/planificador',
  '/#/mas',
  '/#/rubricas',
  '/#/observaciones',
  '/#/cobertura',
  '/#/informes',
  '/#/etiquetas-alumnado',
  '/#/vincular-alumnado',
  '/#/inventario',
  '/#/calendario',
  '/#/herramientas',
  '/#/ajustes',
]

test.describe('móvil', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')

  test('objetivos táctiles ≥44 px y campos a 16 px', async ({ page }) => {
    test.setTimeout(180_000)
    await sembrar(page)
    const fallos: string[] = []
    for (const ruta of VISTAS) {
      await page.goto(ruta)
      await page.waitForTimeout(400)
      const malos = await page.evaluate(() => {
        const res: string[] = []
        const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role="button"], [role="tab"], [role="checkbox"], [role="switch"]'
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          const r = el.getBoundingClientRect()
          if (!r.width || !r.height) continue
          if (el.closest('[aria-hidden="true"], .sr-only, [inert], [data-tactil-exento]')) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
          // Campos de texto: 16 px para que iOS no amplíe al enfocar.
          if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea')) {
            if (parseFloat(cs.fontSize) < 16) res.push(`campo <16px «${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.id}» ${cs.fontSize}`)
          }
          // Enlaces dentro de un párrafo: excepción WCAG 2.5.8 (en línea).
          if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue
          const tras = getComputedStyle(el, '::after')
          const ampliada = tras.position === 'absolute' && tras.content !== 'none'
          const ancho = Math.max(r.width, ampliada ? parseFloat(tras.width) : 0)
          const alto = Math.max(r.height, ampliada ? parseFloat(tras.height) : 0)
          if (ancho < 43.5 || alto < 43.5) {
            const nombre = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 30)
            res.push(`${Math.round(ancho)}×${Math.round(alto)} «${nombre}»`)
          }
        }
        return [...new Set(res)]
      })
      for (const m of malos) fallos.push(`${ruta} · ${m}`)
    }
    expect(fallos).toEqual([])
  })

  test('Cuaderno móvil: puntos de etiqueta (máx. 2) y festivo con texto en Calendario', async ({ page }) => {
    await sembrar(page)
    await page.goto('/#/cuaderno/g6a')
    const puntos = page.locator('[data-tactil-exento="puntos de etiqueta"]').first()
    await expect(puntos).toHaveAttribute('aria-label', 'Etiquetas: Lesionado')
    expect(await puntos.locator(':scope > span').count()).toBeLessThanOrEqual(2)
    await page.goto('/#/calendario')
    // 2026-10-12 es festivo en la semilla: el día lo dice, no solo su color.
    await expect(page.getByRole('button', { name: /12 de octubre.*Festivo/i })).toBeVisible()
  })
})
