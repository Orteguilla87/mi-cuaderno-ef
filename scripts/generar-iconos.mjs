/**
 * Genera los iconos PNG de la PWA sin dependencias externas (§1.1: bundle autocontenido).
 * Dibuja un silbato estilizado sobre el color primario. Ejecutar: node scripts/generar-iconos.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(RAIZ, 'public')

const PRIMARIO = [0x00, 0x6a, 0x80]
const BLANCO = [0xff, 0xff, 0xff]

function crc32(buf) {
  let c
  const tabla = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

function png(ancho, alto, pixeles) {
  const cabecera = Buffer.alloc(13)
  cabecera.writeUInt32BE(ancho, 0)
  cabecera.writeUInt32BE(alto, 4)
  cabecera[8] = 8 // bits por canal
  cabecera[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(pixeles, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

/** margen: fracción del lienzo que queda como fondo (los iconos maskable necesitan más). */
function dibujar(tamano, margen) {
  const filas = Buffer.alloc(tamano * (tamano * 4 + 1))
  const c = tamano / 2
  const radioFondo = tamano * (0.5 - margen)
  const radioAro = tamano * (0.5 - margen) * 0.52
  const grosor = tamano * 0.055

  for (let y = 0; y < tamano; y++) {
    const inicio = y * (tamano * 4 + 1)
    filas[inicio] = 0 // filtro PNG: none
    for (let x = 0; x < tamano; x++) {
      const d = Math.hypot(x - c + 0.5, y - c + 0.5)
      let color = null
      let alfa = 0

      if (d <= radioFondo) {
        color = PRIMARIO
        alfa = 255
        // Aro blanco (cuerpo del silbato) y punto central.
        if (Math.abs(d - radioAro) < grosor) color = BLANCO
        if (d < tamano * 0.055) color = BLANCO
      }

      const p = inicio + 1 + x * 4
      filas[p] = color ? color[0] : 0
      filas[p + 1] = color ? color[1] : 0
      filas[p + 2] = color ? color[2] : 0
      filas[p + 3] = alfa
    }
  }

  return png(tamano, tamano, filas)
}

mkdirSync(PUBLIC, { recursive: true })
writeFileSync(join(PUBLIC, 'icon-192.png'), dibujar(192, 0.02))
writeFileSync(join(PUBLIC, 'icon-512.png'), dibujar(512, 0.02))
// Maskable: el sistema recorta hasta un 20% por lado, así que se deja zona segura.
writeFileSync(join(PUBLIC, 'icon-maskable-512.png'), dibujar(512, 0.14))
console.log('Iconos generados en public/')
