import { expect, test, type Page } from '@playwright/test'

/**
 * Regresión de anchos: ninguna vista principal puede producir scroll lateral en
 * móvil. Tres veces se ha colado: Planificador, Hoy y otra vez Planificador
 * (pestaña Semana). En las tres la causa fue la misma —una rejilla sin
 * `grid-cols-1` cuya pista implícita mide un título `truncate` sin cortar— y
 * solo se veía con títulos largos, así que aquí se siembran largos a propósito.
 */

const TITULO_LARGO =
  'SESIÓN DE LECTURA · Libro B, bloque 2 — circuito de habilidades motrices básicas con material alternativo'

// Miércoles lectivo: con el reloj real, un domingo dejaría Hoy sin clases que medir.
const AHORA = new Date('2026-10-21T10:00:00')

async function sembrar(page: Page) {
  await page.clock.setFixedTime(AHORA)
  await page.goto('/#/hoy')
  await page.evaluate(
    async ({ titulo, hoyISO }) => {
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
      const base = new Date(hoyISO + 'T12:00:00')
      for (let i = 0; i < 4; i++) {
        const grupoId = `g-e2e-${i}`
        await db.grupos.put({
          id: grupoId, cursoEscolarId: 'c-e2e', nombre: `${i + 1}ºA Educación Física bilingüe`,
          etapa: 'primaria', nivel: i + 1, color: '#006A80', orden: i,
          horario: [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, horaInicio: '09:00', horaFin: '09:45' })),
        } as never)
        for (let k = -7; k <= 7; k++) {
          const f = new Date(base)
          f.setDate(f.getDate() + k)
          const fecha = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
          await db.sesiones.put({
            id: `s-e2e-${i}-${k}`, grupoId, fecha, titulo, juegos: [], notas: '', recursos: [], franjaInicio: '09:00',
          } as never)
        }
      }
    },
    { titulo: TITULO_LARGO, hoyISO: '2026-10-21' },
  )
}

/** Ancho del documento frente al viewport, y el primer elemento que sobresale. */
async function medir(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const sw = document.documentElement.scrollWidth
    let culpable = ''
    if (sw > vw) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > vw + 1) {
          culpable = `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}"> ${Math.round(r.width)}px`
          break
        }
      }
    }
    return { vw, sw, culpable }
  })
}

async function abrir(page: Page, ruta: string, pestana?: string) {
  await page.goto('/#' + ruta)
  if (pestana) await page.getByRole('tab', { name: pestana, exact: true }).click()
  // La vista lee de IndexedDB con useLiveQuery: se espera a que pinte el título sembrado.
  if (ruta !== '/grupos' && pestana !== 'Unidades') {
    await expect(page.getByText(/SESIÓN DE LECTURA/).locator('visible=true').first()).toBeVisible()
  }
}

const VISTAS: { nombre: string; ruta: string; pestana?: string }[] = [
  { nombre: 'Hoy · Día', ruta: '/hoy', pestana: 'Día' },
  { nombre: 'Hoy · Semana', ruta: '/hoy', pestana: 'Semana' },
  { nombre: 'Planificador · Grupo', ruta: '/planificador', pestana: 'Grupo' },
  { nombre: 'Planificador · Semana', ruta: '/planificador', pestana: 'Semana' },
  { nombre: 'Planificador · Unidades', ruta: '/planificador', pestana: 'Unidades' },
  { nombre: 'Grupos', ruta: '/grupos' },
]

test.beforeEach(async ({ page }) => {
  await sembrar(page)
})

for (const v of VISTAS) {
  test(`${v.nombre}: sin scroll lateral`, async ({ page }) => {
    await abrir(page, v.ruta, v.pestana)
    const { vw, sw, culpable } = await medir(page)
    expect(sw, `el contenido mide ${sw}px en un viewport de ${vw}px; sobresale ${culpable}`).toBeLessThanOrEqual(vw)
  })
}

test('Planificador · Grupo: en escritorio, columnas en paralelo de 33rem; en móvil, una al ancho', async ({ page }, info) => {
  await abrir(page, '/planificador', 'Grupo')
  const anchos = await page.evaluate(() =>
    [...document.querySelectorAll('[data-columna-grupo]')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => Math.round(el.getBoundingClientRect().width)),
  )
  if (info.project.name === 'escritorio') {
    expect(anchos.length).toBe(4)
    for (const a of anchos) expect(a).toBe(528)
  } else {
    expect(anchos.length).toBe(1)
    const { vw } = await medir(page)
    expect(anchos[0]).toBeLessThanOrEqual(vw)
  }
})

test('Hoy · Día: una tarjeta por fila y el título entero', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'la columna única es una regla de escritorio')
  await abrir(page, '/hoy', 'Día')
  const izquierdas = await page.evaluate(() =>
    [...document.querySelectorAll('[data-rejilla="hoy"] > li')].map((li) => Math.round(li.getBoundingClientRect().left)),
  )
  expect(izquierdas.length).toBeGreaterThan(1)
  expect(new Set(izquierdas).size).toBe(1)
  await expect(page.getByText(TITULO_LARGO).first()).toBeVisible()
})
