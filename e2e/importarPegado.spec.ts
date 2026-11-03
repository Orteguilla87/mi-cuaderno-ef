import { expect, test, type Page } from '@playwright/test'

/**
 * Pegar una programación copiada de Google Docs o de la vista de Claude: el
 * `text/plain` del portapapeles pierde la numeración automática y las viñetas,
 * así que la importación tiene que leerlas del `text/html`. Va en navegador
 * real porque Vitest corre sin DOM y aquí hacen falta `DOMParser`, el evento
 * `paste` y `insertText` de verdad.
 */

const ACTIVIDADES = [
  'Sintagma nominal (8 min · GG). Núcleo y determinantes en la flauta, un balón nuevo.',
  'Pronombres personales (10 min · P). Sustituir y analizar persona y número.',
  'Campo semántico frente a campo léxico (10 min · GG). Clasificar en dos columnas.',
  'Cabezas numeradas (15 min · G4). Ocho preguntas proyectadas; el grupo piensa un minuto.',
]
const PREGUNTAS = [
  'Núcleo de aquel perro pequeño (perro).',
  'Pronombre que sustituye a Lena y Theo (ellos).',
  'Clasifica médico, árbol, sofá.',
]
const CIERRE = 'Cierre (2 min · GG). Qué pregunta ha costado más.'
const NOTAS = [
  'Por qué cooperativo aquí: en un repaso interesa que todos sepan la respuesta.',
  'Registro: anota las preguntas que fallan más grupos; pasan al taller de errores de la S18.',
]

const li = (t: string, extra = '') => `<li dir="ltr"${extra}><p dir="ltr"><span>${t}</span></p></li>`

/** Como lo deja Docs: todo plano bajo un `<b>`, la lista partida en dos `<ol>` y sin `start`. */
const HTML_DOCS =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">' +
  '<p dir="ltr"><span>S17 – Repaso cooperativo</span></p>' +
  `<ol>${ACTIVIDADES.map((a) => li(a, ' aria-level="1"')).join('')}</ol><br>` +
  `<ul>${PREGUNTAS.map((p) => li(p, ' aria-level="1"')).join('')}</ul><br>` +
  `<ol>${li(CIERRE, ' aria-level="1"')}</ol><br>` +
  `<ul>${NOTAS.map((n) => li(n, ' aria-level="1"')).join('')}</ul></b>`

/** Como lo deja la vista de Claude: HTML semántico, con `start` en el segundo `<ol>`. */
const HTML_CLAUDE =
  '<p>S17 – Repaso cooperativo</p>' +
  `<ol>${ACTIVIDADES.map((a) => `<li>${a}</li>`).join('')}</ol>` +
  `<ul>${PREGUNTAS.map((p) => `<li>${p}</li>`).join('')}</ul>` +
  `<ol start="5"><li>${CIERRE}</li></ol>` +
  `<ul>${NOTAS.map((n) => `<li>${n}</li>`).join('')}</ul>`

/** El `text/plain` que acompaña: sin marcas, que es justo el fallo. */
const PLANO = ['S17 – Repaso cooperativo', ...ACTIVIDADES, ...PREGUNTAS, CIERRE, ...NOTAS].join('\n')

async function pegar(page: Page, html: string) {
  await page.goto('/#/planificador/importar')
  const campo = page.locator('#texto-pegado')
  await campo.focus()
  await campo.evaluate(
    (el, { html, plano }) => {
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      dt.setData('text/plain', plano)
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    { html, plano: PLANO },
  )
  return campo
}

for (const [origen, html] of [['Google Docs', HTML_DOCS], ['vista de Claude', HTML_CLAUDE]] as const) {
  test(`pegar desde ${origen} conserva numeración, viñetas y anidamiento`, async ({ page }) => {
    const campo = await pegar(page, html)

    await expect(campo).toHaveValue(
      [
        'S17 – Repaso cooperativo',
        ...ACTIVIDADES.map((a, i) => `${i + 1}. ${a}`),
        '',
        ...PREGUNTAS.map((p) => `- ${p}`),
        '',
        `5. ${CIERRE}`,
        '',
        ...NOTAS.map((n) => `- ${n}`),
      ].join('\n'),
    )

    await page.getByRole('button', { name: 'Analizar' }).click()

    const desc = page.locator('#desc-0')
    const ol = desc.locator('ol')
    await expect(ol).toHaveCount(1)
    await expect(ol.locator(':scope > li')).toHaveCount(5)
    await expect(ol.locator(':scope > li').nth(4)).toHaveAttribute('value', '5')

    const cuarto = ol.locator(':scope > li').nth(3)
    await expect(cuarto.locator('strong').first()).toHaveText('Cabezas numeradas')
    const sub = cuarto.locator('ul > li')
    await expect(sub).toHaveCount(3)
    await expect(sub.first()).toBeVisible()

    // La sublista se ve sangrada respecto a su elemento.
    const xCuarto = (await cuarto.boundingBox())!.x
    const xSub = (await sub.first().boundingBox())!.x
    expect(xSub).toBeGreaterThan(xCuarto + 8)

    // Las notas docentes del final se mudan a «Enlaces y notas», con su rótulo.
    await expect(desc.locator(':scope ul:not(ol ul) > li')).toHaveCount(0)
    await expect(page.locator('#enlaces-0')).toHaveValue(NOTAS.join('\n'))

    const { sw, vw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      vw: document.documentElement.clientWidth,
    }))
    expect(sw).toBeLessThanOrEqual(vw)
  })
}

test('un pegado sin listas entra tal cual', async ({ page }) => {
  const campo = await pegar(page, '<p>Sesión 1: Bote</p><p>Botar el balón.</p>')
  // Sin listas no se intercepta: el pegado por defecto de un evento sintético
  // no escribe nada, y eso es lo que demuestra que no se ha tocado.
  await expect(campo).toHaveValue('')
})
