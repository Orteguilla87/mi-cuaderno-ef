import { expect, test } from '@playwright/test'

/**
 * Unidad de ciclo en el Planificador: las pestañas enseñan la versión de cada
 * curso, la sesión adaptada lleva su marca, y la fila con el botón extra
 * («Adaptar» / «Volver a la versión común») no desborda el móvil.
 */
test('unidad de ciclo: versión por curso, marca de adaptada y sin scroll lateral', async ({ page }, info) => {
  await page.goto('/#/hoy')
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    await db.unidades.put({
      id: 'ud-ciclo', etapa: 'primaria', ambito: 'ciclo', niveles: [3, 4], trimestre: 1,
      titulo: 'Habilidades con móvil', criterios: [], computa: true, pesosPorNivel: { 3: 0, 4: 0 },
      sesiones: [
        { id: 'p1', nivel: -1, orden: 0, titulo: 'Lanzamientos con aros de colores y relevos por parejas', notas: 'Común', recursos: [],
          adaptaciones: { 4: { titulo: 'Lanzamientos a diana con distancia variable', notas: 'Para 4º', recursos: [] } } },
        { id: 'p2', nivel: -1, orden: 1, titulo: 'Recepciones', notas: '', recursos: [] },
      ],
    } as never)
  })

  await page.goto('/#/planificador')
  await page.getByRole('tab', { name: 'Unidades', exact: true }).click()
  // Por curso, la unidad de ciclo sale en 3º y en 4º: se abre desde 3º.
  const tercero = page.getByRole('region', { name: '3º de Primaria' })
  await tercero.getByRole('button', { name: /Ver las 2 sesiones/ }).click()

  await expect(tercero.getByText('Lanzamientos con aros de colores y relevos por parejas')).toBeVisible()
  await tercero.getByRole('button', { name: '4º', exact: true }).click()
  await expect(page.getByText('Lanzamientos a diana con distancia variable')).toBeVisible()
  await expect(page.getByText('Adaptada para 4º')).toBeVisible()
  await expect(page.getByRole('button', { name: /Volver a la versión común en la sesión 1/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Adaptar la sesión 2 para 4º/ })).toBeVisible()

  const { vw, sw } = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    sw: document.documentElement.scrollWidth,
  }))
  expect(sw).toBeLessThanOrEqual(vw)
  await page.screenshot({ path: info.outputPath('unidad-ciclo.png'), fullPage: true })
})
