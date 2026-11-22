import { expect, test, type Page } from '@playwright/test'

/**
 * Bloque F1: navegación en escritorio (1536×695, el portátil real) y móvil.
 * Una sola entrada activa por vista, sin salto horizontal, título de pestaña,
 * flecha «atrás» solo con origen real, Vincular y el chip «Lesión».
 */

const MENU: [ruta: string, etiqueta: string][] = [
  ['/hoy', 'Hoy'],
  ['/cuaderno', 'Cuaderno'],
  ['/grupos', 'Grupos'],
  ['/planificador', 'Planificador'],
  ['/rubricas', 'Rúbricas'],
  ['/observaciones', 'Observaciones'],
  ['/cobertura', 'Cobertura de criterios'],
  ['/informes', 'Informes'],
  ['/etiquetas-alumnado', 'Etiquetas de alumnado'],
  ['/vincular-alumnado', 'Vincular alumnado'],
  ['/inventario', 'Inventario'],
  ['/calendario', 'Calendario'],
  ['/herramientas', 'Herramientas'],
  ['/ajustes', 'Ajustes'],
]

async function sembrar(page: Page) {
  await page.goto('/#/hoy')
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    await db.cursos.put({
      id: 'c-e2e', nombre: '2026-2027', activo: true, inicio: '2026-09-01', fin: '2027-06-30',
      trimestres: [{ n: 1, inicio: '2026-09-07', fin: '2026-12-22' }], festivos: [],
    } as never)
    for (const [i, n] of ['1ºA', '1ºB', '2ºA'].entries())
      await db.grupos.put({
        id: `g${i}`, cursoEscolarId: 'c-e2e', nombre: n, etapa: 'primaria', nivel: 1,
        color: '#006A80', orden: i, horario: [],
      } as never)
    await db.alumnos.put({ id: 'a1', grupoId: 'g0', nombre: 'Ana', apellidos: 'Pérez', alias: '', activo: true } as never)
    const obs = (id: string, tipo: string) =>
      ({ id, alumnoId: 'a1', grupoId: 'g0', fecha: '2026-11-20', tipo, signo: 'neutro', texto: `obs ${id}`, tags: [] }) as never
    await db.observaciones.bulkPut([obs('o1', 'lesion'), obs('o2', 'lesion'), obs('o3', 'conducta')])
  })
}

const esMovil = (p: Page) => (p.viewportSize()?.width ?? 0) < 1024

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'escritorio') await page.setViewportSize({ width: 1536, height: 695 })
  await sembrar(page)
})

test('cada vista del menú: una sola entrada activa, título y sin salto lateral', async ({ page }) => {
  test.skip(esMovil(page), 'Recorrido de la barra lateral: solo escritorio')
  const nav = page.getByRole('navigation', { name: 'Principal' })

  // Las 14 caben sin scroll a 1536×695 y las etiquetas no se parten.
  const caja = await nav.evaluate((n) => ({ sh: n.scrollHeight, ch: n.clientHeight }))
  expect(caja.sh).toBeLessThanOrEqual(caja.ch)
  const etiquetas = nav.getByRole('button', { name: 'Etiquetas de alumnado' })
  expect((await etiquetas.boundingBox())!.height).toBeLessThan(48)

  const xCabecera: Record<string, number> = {}
  for (const [ruta, etiqueta] of MENU) {
    await nav.getByRole('button', { name: etiqueta, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#${ruta}$`))
    const activas = nav.locator('[aria-current="page"]')
    await expect(activas).toHaveCount(1)
    await expect(activas).toHaveText(etiqueta)
    await expect(page).toHaveTitle(`${etiqueta} · Cuaderno EF`)
    const h = page.locator('main header').first()
    if (await h.count()) xCabecera[ruta] = (await h.boundingBox())!.x
    // Desde el menú no hay flecha atrás.
    await expect(page.getByRole('button', { name: 'Volver' })).toHaveCount(0)
  }
  // Sin salto horizontal entre vistas cortas y largas.
  expect(xCabecera['/hoy'] ?? xCabecera['/grupos']).toBe(xCabecera['/ajustes'])
  expect(xCabecera['/grupos']).toBe(xCabecera['/ajustes'])
})

test('flecha atrás: solo con origen real, y vuelve a él', async ({ page }) => {
  await page.goto('/#/rubricas')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Rúbricas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Volver' })).toHaveCount(0)

  if (esMovil(page)) {
    await page.goto('/#/hoy')
    await page.getByRole('navigation').last().getByRole('button', { name: 'Más' }).click()
    await page.getByRole('button', { name: /Rúbricas/ }).click()
    // En la barra inferior, «Más» es la activa en Rúbricas.
    await expect(page.getByRole('navigation').last().locator('[aria-current="page"]')).toHaveText(/Más/)
  } else {
    await page.goto('/#/grupos')
    // Un enlace interno = `navegar()` sin `raiz`.
    await page.evaluate(async () => (await import('/src/lib/router.ts')).navegar('/rubricas'))
  }
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page).toHaveURL(esMovil(page) ? /#\/mas$/ : /#\/grupos$/)
})

test('Vincular: el segundo selector empieza vacío y no ofrece el grupo del primero', async ({ page }) => {
  await page.goto('/#/vincular-alumnado')
  const selectores = page.getByRole('button', { name: /Cambiar de grupo/ })
  await expect(selectores.nth(0)).toContainText('1ºA')
  await expect(selectores.nth(1)).toContainText('Elige un grupo')
  await selectores.nth(1).click()
  const opciones = page.getByRole('listbox').getByRole('option')
  await expect(opciones).toHaveText([/1ºB/, /2ºA/])
})

test('Observaciones: chip «Lesión» que filtra igual', async ({ page }) => {
  await page.goto('/#/observaciones')
  const chip = page.getByRole('button', { name: 'Lesión', exact: true })
  await expect(chip).toBeVisible()
  await expect(chip).toHaveCSS('text-transform', 'none')
  await chip.click()
  await expect(page.getByText(/^obs o\d$/)).toHaveCount(2)
  await expect(page.getByText(/· Lesión$/).first()).toBeVisible()
})

test('móvil: barra inferior y sin scroll lateral en Hoy y Planificador', async ({ page }) => {
  test.skip(!esMovil(page), 'Solo móvil')
  const barra = page.getByRole('navigation').last()
  for (const [ruta, activa] of [
    ['/hoy', 'Hoy'], ['/planificador', 'Planificador'], ['/observaciones', 'Más'], ['/grupos', 'Grupos'],
  ] as const) {
    await page.goto(`/#${ruta}`)
    await expect(barra.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(barra.locator('[aria-current="page"]')).toHaveText(new RegExp(activa))
    const { vw, sw } = await page.evaluate(() => ({
      vw: document.documentElement.clientWidth,
      sw: document.documentElement.scrollWidth,
    }))
    expect(sw).toBeLessThanOrEqual(vw)
  }
})
