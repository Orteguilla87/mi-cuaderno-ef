import { expect, test, type Page } from '@playwright/test'

/**
 * «Pasar programación al siguiente día» en un navegador real, en móvil y en
 * escritorio: la hoja no produce scroll lateral, la previa dice qué pasa en
 * cada grupo, aplicar vacía el día y Deshacer deja la base idéntica.
 *
 * Tres grupos de EF con clase cada día y Lengua 4º con DOS clases el día D.
 */

const AHORA = new Date('2026-10-21T08:00:00') // miércoles lectivo
const D = '2026-10-21'
const LARGO = 'Circuito de habilidades motrices básicas con material alternativo y cooperación'

async function sembrar(page: Page) {
  await page.clock.setFixedTime(AHORA)
  await page.goto('/#/hoy')
  await page.evaluate(
    async ({ largo, d }) => {
      const { db } = await import('/src/db/db.ts')
      await db.cursos.put({
        id: 'c-e2e', nombre: '2026-2027', activo: true, inicio: '2026-09-01', fin: '2027-06-30',
        trimestres: [
          { n: 1, inicio: '2026-09-07', fin: '2026-12-22' },
          { n: 2, inicio: '2027-01-08', fin: '2027-03-26' },
          { n: 3, inicio: '2027-04-06', fin: '2027-06-19' },
        ],
        festivos: [],
      } as never)
      const iso = (f: Date) =>
        `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
      const grupos = [
        { id: 'ef3', nombre: '3ºA', nivel: 3, franjas: ['09:00'] },
        { id: 'ef4', nombre: '4ºB', nivel: 4, franjas: ['10:00'] },
        { id: 'ef5', nombre: '5ºA', nivel: 5, franjas: ['11:00'] },
        { id: 'len4', nombre: 'Lengua 4º', nivel: 4, franjas: ['12:00', '13:00'] },
      ]
      for (const [i, g] of grupos.entries()) {
        await db.grupos.put({
          id: g.id, cursoEscolarId: 'c-e2e', nombre: g.nombre, etapa: 'primaria', nivel: g.nivel,
          color: '#006A80', orden: i,
          horario: [1, 2, 3, 4, 5].flatMap((dia) =>
            g.franjas.map((h) => ({ diaSemana: dia, horaInicio: h, horaFin: h.replace(':00', ':45') })),
          ),
        } as never)
        // 15 días lectivos desde D, con una sesión vacía en la 4.ª clase.
        const f = new Date(d + 'T12:00:00')
        let n = 0
        while (n < 15) {
          if (f.getDay() !== 0 && f.getDay() !== 6) {
            for (const h of g.franjas) {
              await db.sesiones.put({
                id: `s-${g.id}-${n}-${h}`, grupoId: g.id, fecha: iso(f), franjaInicio: h,
                titulo: n === 3 ? '' : `${g.nombre} · ${n} · ${largo}`, juegos: [], notas: '', recursos: [],
              } as never)
            }
            n++
          }
          f.setDate(f.getDate() + 1)
        }
      }
    },
    { largo: LARGO, d: D },
  )
}

async function foto(page: Page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    const s = (await db.sesiones.toArray()).sort((a, b) => a.id.localeCompare(b.id))
    const b = await db.contenidoSinClase.toArray()
    return JSON.stringify({ s, b })
  })
}

async function sinScrollLateral(page: Page) {
  const { vw, sw } = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    sw: document.documentElement.scrollWidth,
  }))
  expect(sw).toBeLessThanOrEqual(vw)
  const panel = page.getByRole('dialog')
  const caja = await panel.boundingBox()
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(vw + 1)
}

test('Hoy: previa, aplicar y deshacer en los cuatro grupos', async ({ page }) => {
  await sembrar(page)
  await page.goto('/#/hoy')
  await expect(page.getByText(/3ºA · 0 ·/).first()).toBeVisible()
  const antes = await foto(page)

  await page.getByRole('button', { name: 'Pasar programación al siguiente día' }).click()
  const hoja = page.getByRole('dialog')
  await expect(hoja.getByText(/Avanza 1/).first()).toBeVisible()
  await expect(hoja.getByText(/Lengua 4º/).first()).toBeVisible()
  await expect(hoja.getByText(/2 clases/)).toBeVisible()
  await sinScrollLateral(page)

  await hoja.getByRole('button', { name: /Pasar programación \(4 grupos\)/ }).click()
  await expect(page.getByText('Programación pasada en 4 grupos')).toBeVisible()
  const despues = await foto(page)
  expect(despues).not.toEqual(antes)
  // El día D queda vacío en todos los grupos: ninguna sesión de hoy tiene título.
  const vaciasHoy = await page.evaluate(async (d) => {
    const { db } = await import('/src/db/db.ts')
    return (await db.sesiones.where('fecha').equals(d).toArray()).every((s) => s.titulo === '')
  }, D)
  expect(vaciasHoy).toBe(true)

  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect.poll(() => foto(page)).toEqual(antes)
})

test('Planificador: la hoja abre desde Semana y desmarcar un grupo lo avisa', async ({ page }) => {
  await sembrar(page)
  await page.goto('/#/planificador')
  await page.getByRole('tab', { name: 'Semana', exact: true }).click()
  await page.getByRole('button', { name: 'Pasar programación al siguiente día' }).click()
  const hoja = page.getByRole('dialog')
  await hoja.getByRole('checkbox', { name: '4ºB' }).uncheck()
  await expect(hoja.getByText(/no se corre/)).toBeVisible()
  await expect(hoja.getByRole('button', { name: /Pasar programación \(3 grupos\)/ })).toBeVisible()
  await sinScrollLateral(page)
})
