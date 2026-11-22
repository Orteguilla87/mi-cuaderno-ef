import type { Page } from '@playwright/test'

/**
 * Utilidades compartidas por las pruebas de contraste (Bloques F3 y F6a).
 *
 * `fallosContraste` recorre lo visible de `#contenido` y de la capa fija (FAB,
 * cabecera) y devuelve cada texto < 4.5:1 (o < 3:1 si es grande), cada texto
 * < 12 px y cada icono dentro de un control < 3:1 contra su fondo real
 * (capas semitransparentes mezcladas hasta el primer fondo opaco).
 */

export const AHORA = new Date('2026-10-21T08:00:00')

export async function sembrar(page: Page, columnasExtra = 0) {
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
        festivos: ['2026-10-12', '2026-11-02'],
      } as never)
      await db.etiquetasAlumno.put({
        id: 'et1', nombre: 'Lesionado', abreviatura: 'LES', colorId: 'teal-500', icono: undefined,
      } as never)
      const grupos = [
        { id: 'g6a', nombre: '6ºA', nivel: 6 },
        { id: 'g4l', nombre: '4ºA Lengua', nivel: 4 },
      ]
      for (const [i, g] of grupos.entries()) {
        await db.grupos.put({
          id: g.id, cursoEscolarId: 'c-e2e', nombre: g.nombre, etapa: 'primaria', nivel: g.nivel,
          color: '#006A80', orden: i,
          horario: [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, horaInicio: `0${9 + i}:00`, horaFin: `0${9 + i}:45` })),
        } as never)
        for (let n = 0; n < 24; n++) {
          await db.alumnos.put({
            id: `${g.id}-a${n}`, grupoId: g.id, nombre: `Nombre${n}`, apellidos: `Apellido Largo ${n}`,
            alias: '', activo: true, nivelMotriz: n % 4 === 0 ? 2 : undefined,
            ...(n % 5 === 0 ? { etiquetas: ['et1'] } : {}),
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
      await db.valores.put({
        id: 'v1', columnaId: 'g6a-c1', alumnoId: 'g6a-a1', contador: -1, actualizado: Date.now(),
      } as never)
      await db.valores.put({
        id: 'v2', columnaId: 'g6a-c0', alumnoId: 'g6a-a2', numero: 3.5, actualizado: Date.now(),
      } as never)
      for (const [i, signo] of (['-', '+', 'neutro'] as const).entries()) {
        await db.observaciones.put({
          id: `o${i}`, alumnoId: 'g6a-a1', grupoId: 'g6a', fecha: '2026-10-20', tipo: 'conducta',
          signo, texto: `Observación ${i}`, tags: [],
        } as never)
      }
    },
    { extra: columnasExtra },
  )
}

export type Tema = 'claro' | 'oscuro' | 'claro-pista' | 'oscuro-pista'
export const TEMAS: Tema[] = ['claro', 'oscuro', 'claro-pista', 'oscuro-pista']

/** Aplica el tema a mano (no persiste): clase `dark` y `pista` en <html>. */
export async function aplicarTema(page: Page, tema: Tema) {
  await page.evaluate((t) => {
    const r = document.documentElement
    r.classList.toggle('dark', t.startsWith('oscuro'))
    r.classList.toggle('pista', t.endsWith('pista'))
  }, tema)
  await page.waitForTimeout(250)
}

export async function fallosContraste(page: Page): Promise<string[]> {
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
    const ratio = (fg: number[], bg: number[]) => {
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
      return (a + 0.05) / (b + 0.05)
    }
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return false
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false
      if (el.closest('.sr-only,[disabled],[aria-disabled="true"]')) return false
      let opaco = 1
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.visibility === 'hidden' || cs.display === 'none') return false
        opaco *= Number(cs.opacity)
      }
      return opaco >= 1
    }
    const malos: string[] = []
    const raices = [document.querySelector('#contenido'), document.querySelector('[aria-label*="agente" i]')]
      .filter(Boolean) as Element[]
    for (const raiz of raices) {
      const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent?.trim()
        const el = n.parentElement
        if (!t || !el || !visible(el)) continue
        const cs = getComputedStyle(el)
        const bg = fondoDe(el)
        const r = ratio(mezcla(rgba(cs.color), bg), bg)
        const px = parseFloat(cs.fontSize)
        const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700)
        const min = grande ? 3 : 4.5
        if (r < min || px < 12) malos.push(`texto «${t.slice(0, 28)}» ${r.toFixed(2)}:1 ${px}px`)
      }
      for (const svg of raiz.querySelectorAll('button svg, a svg, [role="button"] svg, [role="tab"] svg')) {
        if (!visible(svg) || svg.closest('.color-dato')) continue
        const cs = getComputedStyle(svg)
        const bg = fondoDe(svg.parentElement)
        const r = ratio(mezcla(rgba(cs.color), bg), bg)
        if (r < 3) {
          const ctl = svg.closest('button,a,[role]')
          malos.push(`icono «${(ctl?.getAttribute('aria-label') ?? ctl?.textContent ?? '').trim().slice(0, 28)}» ${r.toFixed(2)}:1`)
        }
      }
    }
    return [...new Set(malos)]
  })
}
