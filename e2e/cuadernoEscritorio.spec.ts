import { expect, test, type Page } from '@playwright/test'

/**
 * Cuaderno en escritorio (Bloque F3): un único scroll, columna Alumno y
 * cabecera fijas en los dos ejes, contadores por teclado, chips de grupo y
 * contraste/tamaño mínimo del texto. En móvil, la vista no cambia.
 */

const AHORA = new Date('2026-10-21T08:00:00')

async function sembrar(page: Page, columnasExtra = 0) {
  await page.clock.setFixedTime(AHORA)
  await page.goto('/#/hoy')
  await page.evaluate(
    async ({ extra }) => {
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
      const grupos = [
        { id: 'g6a', nombre: '6ºA', nivel: 6 },
        { id: 'g4l', nombre: '4ºA Lengua', nivel: 4 },
      ]
      for (const [i, g] of grupos.entries()) {
        await db.grupos.put({
          id: g.id, cursoEscolarId: 'c-e2e', nombre: g.nombre, etapa: 'primaria', nivel: g.nivel,
          color: '#006A80', orden: i, horario: [],
        } as never)
        for (let n = 0; n < 24; n++) {
          await db.alumnos.put({
            id: `${g.id}-a${n}`, grupoId: g.id, nombre: `Nombre${n}`, apellidos: `Apellido Largo ${n}`,
            alias: '', activo: true, nivelMotriz: n % 4 === 0 ? 2 : undefined,
          } as never)
        }
        const tipos = ['numero', 'contador', 'positivo_negativo', 'numero', 'si_no']
        for (let c = 0; c < tipos.length + extra; c++) {
          const tipo = tipos[c % tipos.length]
          await db.columnas.put({
            id: `${g.id}-c${c}`, grupoId: g.id, trimestre: 1, titulo: `${tipo} ${c}`, tipo, orden: c,
            pesoUd: 0, escala: { min: 0, max: 10, decimales: 1 },
          } as never)
        }
      }
      // Un contador a −1 y una observación negativa: el «−1» de la fila.
      await db.valores.put({
        id: 'v1', columnaId: 'g6a-c1', alumnoId: 'g6a-a1', contador: -1, actualizado: Date.now(),
      } as never)
      await db.observaciones.put({
        id: 'o1', alumnoId: 'g6a-a1', grupoId: 'g6a', fecha: '2026-10-20', tipo: 'conducta',
        signo: '-', texto: 'x', tags: [],
      } as never)
    },
    { extra: columnasExtra },
  )
}

/** Contraste WCAG entre el color del texto y el primer fondo opaco hacia arriba. */
async function textosIlegibles(page: Page) {
  return page.evaluate(() => {
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const rgba = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
    const mezcla = (arriba: number[], abajo: number[]) => {
      const a = arriba[3] ?? 1
      return [0, 1, 2].map((i) => arriba[i] * a + abajo[i] * (1 - a))
    }
    const fondoDe = (el: Element | null): number[] => {
      const capas: number[][] = []
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor)
        if ((c[3] ?? 1) > 0) capas.push(c)
        if ((c[3] ?? 1) >= 1) break
      }
      let base = [255, 255, 255]
      for (const c of capas.reverse()) base = mezcla(c, base)
      return base
    }
    const malos: string[] = []
    const zona = document.querySelector('#contenido')!
    const walker = document.createTreeWalker(zona, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent?.trim()
      const el = n.parentElement
      if (!t || !el) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('.sr-only,[aria-hidden="true"] .sr-only')) continue
      if (el.closest('[disabled]')) continue
      let opaco = 1
      for (let e: Element | null = el; e; e = e.parentElement) opaco *= Number(getComputedStyle(e).opacity)
      if (opaco < 1) continue
      const fg = mezcla(rgba(cs.color), fondoDe(el))
      const bg = fondoDe(el)
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
      const ratio = (a + 0.05) / (b + 0.05)
      const px = parseFloat(cs.fontSize)
      if (ratio < 4.5 || px < 12) malos.push(`${t.slice(0, 24)} · ${ratio.toFixed(2)}:1 · ${px}px`)
    }
    return malos
  })
}

async function abrirCuaderno(page: Page, grupo = 'g6a') {
  await page.goto(`/#/cuaderno/${grupo}`)
  await expect(page.getByRole('table')).toBeVisible()
}

test.describe('escritorio', () => {
  test.skip(({ isMobile }) => !!isMobile, 'solo escritorio')

  for (const vp of [
    { width: 1536, height: 695 },
    { width: 1920, height: 1080 },
  ]) {
    test(`un solo scroll y fijos en ambos ejes a ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp)
      await sembrar(page, 20)
      await abrirCuaderno(page)

      const sinScrollPagina = await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      )
      expect(sinScrollPagina).toBe(true)

      const caja = page.locator('.rejilla-desplazable')
      const esquina = page.locator('thead th').first()
      const titulo = page.locator('thead th').nth(1)
      const nombre = page.locator('tbody th').first()
      const antes = {
        esquina: await esquina.boundingBox(),
        titulo: await titulo.boundingBox(),
        nombre: await nombre.boundingBox(),
      }
      await caja.evaluate((el) => el.scrollTo(400, 400))
      await page.waitForTimeout(100)
      const desp = await caja.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }))
      expect(desp.x).toBeGreaterThan(0)
      expect(desp.y).toBeGreaterThan(0)
      expect((await esquina.boundingBox())!.y).toBeCloseTo(antes.esquina!.y, 0)
      expect((await esquina.boundingBox())!.x).toBeCloseTo(antes.esquina!.x, 0)
      expect((await titulo.boundingBox())!.y).toBeCloseTo(antes.titulo!.y, 0)
      // La primera fila de nombres se ha ido hacia arriba, pero su x no cambia.
      const primerVisible = page.locator('tbody th').nth(10)
      expect((await primerVisible.boundingBox())!.x).toBeCloseTo(antes.nombre!.x, 0)
      // Al llegar al final del scroll vertical aparecen los bloques del pie.
      await caja.evaluate((el) => el.scrollTo(el.scrollLeft, el.scrollHeight))
      await expect(page.locator('.rejilla-desplazable > div.sticky')).toBeInViewport()
    })
  }

  test('anchos: la tabla llena el área y la columna Alumno ≥180 px', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    const ancho = await page.locator('thead th').first().evaluate((el) => el.getBoundingClientRect().width)
    expect(ancho).toBeGreaterThanOrEqual(180)
    const { tabla, caja } = await page.evaluate(() => {
      const c = document.querySelector('.rejilla-desplazable') as HTMLElement
      const cs = getComputedStyle(c)
      return {
        tabla: c.querySelector('table')!.getBoundingClientRect().width,
        caja: c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      }
    })
    expect(tabla).toBeGreaterThanOrEqual(caja - 1)
  })

  test('contraste y tamaño mínimo del texto', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    // Las etiquetas de nivel motriz y el «−1» tienen que estar en pantalla.
    await expect(page.locator('tbody').getByText('−1').first()).toBeVisible()
    expect(await textosIlegibles(page)).toEqual([])
  })

  test('contraste en modo oscuro', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await abrirCuaderno(page)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    expect(await textosIlegibles(page)).toEqual([])
  })

  test('contador: teclado y ratón, y vaciar deja vacío', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    const celda = page.getByRole('button', { name: /Apellido Largo 3.*contador 1: / })
      .or(page.getByRole('button', { name: /Nombre3.*contador 1: / }))
      .first()
    await celda.focus()
    await page.keyboard.press('+')
    await expect(celda).toHaveAttribute('aria-label', /: 1$/)
    await page.keyboard.press('+')
    await expect(celda).toHaveAttribute('aria-label', /: 2$/)
    await page.keyboard.press('-')
    await expect(celda).toHaveAttribute('aria-label', /: 1$/)
    await page.keyboard.press('Delete')
    await expect(celda).toHaveAttribute('aria-label', /sin registro$/)
    // Con ratón: el panel de siempre.
    await celda.click()
    await page.getByRole('button', { name: /^Restar/ }).click()
    await expect(celda).toHaveAttribute('aria-label', /: −1$/)
    await page.getByRole('button', { name: 'Borrar (dejar vacío)' }).click()
    await expect(celda).toHaveAttribute('aria-label', /sin registro$/)
    const guardado = await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts')
      return (await db.valores.where('alumnoId').equals('g6a-a3').toArray()).map((v) => v.contador)
    })
    expect(guardado.filter((v) => v === 0)).toEqual([])
  })

  test('+/− de observación: ocultos hasta hover o foco', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    const mas = page.getByRole('button', { name: /Observación positiva para Nombre5/ })
    expect(await mas.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
    await page.locator('tr[data-alumno="g6a-a5"] th').hover()
    await expect.poll(() => mas.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    await page.mouse.move(0, 0)
    await mas.focus()
    await expect.poll(() => mas.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })

  test('se conserva: calificar 5 alumnos con Enter y saltar de columna con Tab', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    await page.locator('td[data-celda^="g6a-c0|"]').first().getByRole('button').click()
    const campo = page.getByRole('dialog').getByRole('textbox').first()
    for (const nota of ['7', '8', '5', '6', '9']) {
      await campo.fill(nota)
      await page.keyboard.press('Enter')
    }
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { db } = await import('/src/db/db.ts')
          return (await db.valores.where('columnaId').equals('g6a-c0').toArray()).length
        }),
      )
      .toBe(5)
    await page.keyboard.press('Tab')
    // Tab salta a la siguiente columna con evaluador (el contador se toca en la celda).
    await expect(page.getByRole('dialog')).toContainText('numero 3')
  })

  test('se conserva: nota de celda con clic derecho y marca en la esquina', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    const td = page.locator('td[data-celda="g6a-c3|g6a-a2"]')
    await td.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Añadir nota' }).click()
    await page.getByRole('textbox', { name: 'Texto de la nota' }).fill('Repetir salto')
    await page.getByRole('button', { name: 'Guardar nota' }).click()
    await expect(td.locator(':scope > :first-child')).toBeVisible()
    await td.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Ver o editar nota' }).click()
    await expect(page.getByRole('textbox', { name: 'Texto de la nota' })).toHaveValue('Repetir salto')
  })

  test('teclado en la fila del alumno: «+» abre observación positiva', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    await page.getByRole('button', { name: /Abrir ficha de .*Nombre4\b/ }).focus()
    await page.keyboard.press('+')
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('chips de grupo y pestañas de trimestre', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 695 })
    await sembrar(page)
    await abrirCuaderno(page)
    const chips = page.getByRole('group', { name: 'Grupo' })
    await expect(chips).toBeVisible()
    await chips.getByRole('button', { name: '4ºA Lengua' }).click()
    await expect(chips.getByRole('button', { name: '4ºA Lengua' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Cuaderno' })).toBeVisible()
    await expect(page.getByText('4ºA Lengua · 1.º trimestre').first()).toBeVisible()
    await expect(page.locator('tbody tr').first()).toHaveAttribute('data-alumno', /^g4l-/)
    await page.getByRole('tab', { name: '2.º trimestre' }).click()
    await expect(page.getByRole('tab', { name: '2.º trimestre' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('4ºA Lengua · 2.º trimestre').first()).toBeVisible()
  })
})

test.describe('móvil', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')

  test('el Cuaderno móvil no cambia', async ({ page }) => {
    await sembrar(page)
    await abrirCuaderno(page)
    await expect(page.getByRole('group', { name: 'Grupo' })).toBeHidden()
    await expect(page.getByRole('button', { name: /Observación positiva para Nombre0/ })).toHaveCSS('opacity', '1')
    await expect(page).toHaveScreenshot('cuaderno-movil.png', { fullPage: true })
  })
})
