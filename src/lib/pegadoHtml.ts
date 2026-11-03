/**
 * Pegado desde Google Docs o desde la vista de Claude: listas en HTML → texto
 * con sus marcas escritas.
 *
 * Al copiar una lista con numeración automática, el `text/plain` del
 * portapapeles llega sin «1.», sin viñetas y sin los párrafos vacíos: las
 * actividades y sus preguntas quedan en un ladrillo indistinguible, y ningún
 * parser puede recuperar una estructura que ya no está en el texto. El
 * `text/html` sí la conserva, así que aquí se reescribe como texto plano con
 * las marcas que el resto de la importación ya entiende (`1. `, `- `, 2
 * espacios por nivel).
 *
 * El documento llega de `DOMParser`, que es inerte —no ejecuta scripts ni pide
 * nada a la red—, y de él solo se lee `textContent`: nunca se inserta HTML.
 *
 * Los encabezados salen como líneas normales, sin `#`: con almohadilla cada
 * título del documento pasaría a ser un corte de sesión (`MARKDOWN` en
 * `importarTexto.ts`) y el troceo dependería de cómo se pegó en vez de qué se
 * escribió.
 */

const BLOQUE = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'OL', 'UL', 'LI', 'BLOCKQUOTE',
  'PRE', 'SECTION', 'ARTICLE', 'TABLE', 'TR', 'HR',
])
const LISTA = new Set(['OL', 'UL'])

/** `true` si merece la pena reescribir el pegado: solo cuando trae listas. */
export function htmlConListas(html: string): boolean {
  return /<(?:ol|ul)[\s>]/i.test(html)
}

function limpio(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** El texto de un nodo sin sus sublistas, que van en líneas propias. */
function textoPropio(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? ''
  if (n.nodeType !== Node.ELEMENT_NODE) return ''
  const el = n as Element
  if (LISTA.has(el.tagName)) return ''
  if (el.tagName === 'BR') return ' '
  return Array.from(el.childNodes, textoPropio).join(BLOQUE.has(el.tagName) ? ' ' : '')
}

/**
 * Texto con marcas de lista de lo que cuelga de `raiz`.
 *
 * Líneas en blanco: donde el documento tenía un párrafo vacío, y al salir de
 * una lista o al pasar de una lista a otra de distinto tipo —el aire que
 * separa «4.» de sus viñetas y las viñetas de «5.»—. Entre un párrafo y la
 * lista que presenta («Material:» y sus elementos) no se mete ninguna: van
 * juntos.
 */
export function textoConMarcas(raiz: ParentNode): string {
  const lineas: string[] = []
  let enLinea = ''

  const blanco = () => {
    if (lineas.length && lineas[lineas.length - 1] !== '') lineas.push('')
  }

  // Numeración de primer nivel que sigue viva: Docs parte en dos `<ol>` una
  // lista interrumpida por viñetas, y el segundo puede llegar sin `start`.
  // Un párrafo de por medio la da por terminada.
  let siguienteNumero = 1
  let ultimaLista: 'OL' | 'UL' | null = null

  const volcar = () => {
    const t = limpio(enLinea)
    enLinea = ''
    if (!t) return
    // Primer texto tras una lista: el aire va delante.
    if (ultimaLista) blanco()
    ultimaLista = null
    lineas.push(t)
  }

  const lista = (el: Element, nivel: number) => {
    const ordenada = el.tagName === 'OL'
    if (nivel === 0) {
      if (ultimaLista && ultimaLista !== el.tagName) blanco()
      if (ordenada) {
        const start = Number(el.getAttribute('start'))
        if (Number.isInteger(start) && start > 0) siguienteNumero = start
        else if (ultimaLista === null) siguienteNumero = 1
      }
      ultimaLista = el.tagName as 'OL' | 'UL'
    }
    let local = ordenada && nivel > 0 ? Number(el.getAttribute('start')) || 1 : 1

    for (const hijo of Array.from(el.children)) {
      if (LISTA.has(hijo.tagName)) {
        // Docs cuelga a veces la sublista directamente del `<ol>`.
        lista(hijo, nivel + 1)
        continue
      }
      if (hijo.tagName !== 'LI') continue

      // `aria-level` (Docs) manda sobre la profundidad del DOM, que en Docs es plana.
      const aria = Number(hijo.getAttribute('aria-level'))
      const profundidad = Number.isInteger(aria) && aria > 0 ? Math.max(aria - 1, nivel) : nivel
      const sangria = '  '.repeat(profundidad)
      let marca = '-'
      if (ordenada) {
        if (profundidad === 0) marca = `${siguienteNumero++}.`
        else marca = `${local++}.`
      }
      const texto = limpio(textoPropio(hijo))
      if (texto) lineas.push(`${sangria}${marca} ${texto}`)

      for (const sub of Array.from(hijo.querySelectorAll(':scope > ol, :scope > ul, :scope > * > ol, :scope > * > ul')))
        lista(sub, profundidad + 1)
    }
  }

  const recorrer = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      enLinea += n.textContent ?? ''
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as Element
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || el.tagName === 'META') return

    // Un `<br>` suelto entre bloques es el párrafo vacío de Docs.
    if (el.tagName === 'BR') {
      if (limpio(enLinea)) volcar()
      else blanco()
      return
    }

    if (LISTA.has(el.tagName)) {
      volcar()
      lista(el, 0)
      return
    }

    if (!BLOQUE.has(el.tagName)) {
      for (const hijo of Array.from(el.childNodes)) recorrer(hijo)
      return
    }

    // Bloque: lo que llevaba antes es otra línea, y él empieza la suya.
    volcar()
    const antes = lineas.length
    for (const hijo of Array.from(el.childNodes)) recorrer(hijo)
    volcar()
    if (lineas.length === antes && el.tagName === 'P') blanco()
  }

  for (const hijo of Array.from(raiz.childNodes)) recorrer(hijo)
  volcar()

  while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop()
  return lineas.join('\n')
}
