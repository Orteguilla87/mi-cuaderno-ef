import { expect, test } from '@playwright/test'

/**
 * Organizar el listado de unidades: por curso, por ciclo y por carpetas que crea
 * el docente, con búsqueda. Comprueba el flujo real —crear carpeta, guardar una
 * unidad en ella— y que nada desborde el móvil.
 */
test('organizar unidades por curso, ciclo y carpeta', async ({ page }, info) => {
  await page.goto('/#/hoy')
  await page.evaluate(async () => {
    localStorage.removeItem('cuaderno-ef:organizar-unidades')
    const { db } = await import('/src/db/db.ts')
    const ud = (id: string, titulo: string, niveles: number[], extra = {}) =>
      db.unidades.put({
        id, etapa: 'primaria', niveles, trimestre: 1, titulo, criterios: [], computa: true,
        pesosPorNivel: Object.fromEntries(niveles.map((n) => [n, 0])), ...extra,
      } as never)
    await ud('u1', 'Habilidades con móvil', [3, 4], { ambito: 'ciclo' })
    await ud('u2', 'Atletismo adaptado', [5])
    await ud('u3', 'Juegos populares del patio', [3])
  })

  await page.goto('/#/planificador')
  await page.getByRole('tab', { name: 'Unidades', exact: true }).click()

  // Por curso (por defecto): la unidad de ciclo sale en 3º y en 4º.
  await expect(page.getByRole('region', { name: '3º de Primaria' }).getByText('Habilidades con móvil')).toBeVisible()
  await expect(page.getByRole('region', { name: '4º de Primaria' }).getByText('Habilidades con móvil')).toBeVisible()

  // Por ciclo.
  await page.getByRole('group', { name: 'Organizar por' }).getByRole('button', { name: 'Ciclo' }).click()
  const segundo = page.getByRole('region', { name: /2\.º ciclo/ })
  await expect(segundo.getByText('Habilidades con móvil')).toBeVisible()
  await expect(segundo.getByText('Juegos populares del patio')).toBeVisible()

  // Por carpeta: crear una y guardar una unidad dentro desde su menú.
  await page.getByRole('group', { name: 'Organizar por' }).getByRole('button', { name: 'Carpeta' }).click()
  await page.getByRole('button', { name: 'Nueva carpeta' }).click()
  await page.getByLabel('Nombre').fill('Para el día de lluvia')
  await page.getByRole('button', { name: 'Crear carpeta' }).click()
  await page.getByRole('button', { name: 'Acciones de unidad didáctica Juegos populares del patio' }).click()
  await page.getByRole('button', { name: 'Guardar en carpeta' }).click()
  await page.getByRole('button', { name: 'Para el día de lluvia', exact: true }).click()

  const carpeta = page.getByRole('region', { name: 'Para el día de lluvia' })
  await expect(carpeta.getByText('Juegos populares del patio')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Sin carpeta' }).getByText('Atletismo adaptado')).toBeVisible()

  // Buscar ignora acentos.
  await page.getByLabel('Buscar unidades').fill('movil')
  await expect(page.getByText('Habilidades con móvil')).toBeVisible()
  await expect(page.getByText('Atletismo adaptado')).toHaveCount(0)
  await page.getByLabel('Buscar unidades').fill('')

  const { vw, sw } = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    sw: document.documentElement.scrollWidth,
  }))
  expect(sw).toBeLessThanOrEqual(vw)
  await page.screenshot({ path: info.outputPath('carpetas.png'), fullPage: true })
})
