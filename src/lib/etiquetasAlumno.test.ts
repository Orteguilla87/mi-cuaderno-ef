import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Las dos reglas duras de las etiquetas de alumnado, vigiladas sobre la fuente.
 *
 *  1. Solo se pintan en el Cuaderno.
 *  2. No salen del dispositivo salvo dentro del blob cifrado.
 *
 * Se revisa el código y no la pantalla por el mismo motivo que en
 * `literales.test.ts`: el proyecto no monta React en los tests (§2), y revisar
 * la fuente sale más barato y cubre más —ninguna vista puede escaparse por no
 * tener test propio, y una vista nueva queda cubierta el día que se escribe—.
 */

const RAIZ = join(import.meta.dirname, '..')

function fuentes(dir: string, ext: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return fuentes(ruta, ext)
    if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.tsx')) return []
    return ext.some((x) => e.name.endsWith(x)) ? [ruta] : []
  })
}

/** Quita comentarios: un comentario que explica la regla no la incumple. */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Lo que delata que una fuente está tocando etiquetas de ALUMNADO. Nombres
 * propios, no `.etiquetas` a secas: el inventario y el banco de juegos tienen
 * sus propias etiquetas, que no son datos sensibles de nadie.
 */
const RASTRO = /PuntoEtiquetas|etiquetasAlumno|EtiquetaAlumno|etiquetasDe\s*\(/

/** El campo del alumno, leído directamente sin pasar por el módulo. */
const RASTRO_CAMPO = /\balumnos?\??\.etiquetas\b|\ba\.etiquetas\b/

function rastro(codigo: string): string | undefined {
  const limpio = sinComentarios(codigo)
  return (limpio.match(RASTRO) ?? limpio.match(RASTRO_CAMPO))?.[0]
}

describe('las etiquetas solo se pintan en el Cuaderno', () => {
  const vistas = [...fuentes(join(RAIZ, 'pages'), ['.tsx']), ...fuentes(join(RAIZ, 'components'), ['.tsx'])]

  /**
   * Las dos únicas vistas que pueden nombrarlas: el Cuaderno, que pinta el
   * punto, y la ficha del alumno junto con su pantalla de gestión, donde se
   * ponen y se quitan. Ninguna de las tres se proyecta ni se enseña a nadie.
   */
  const PERMITIDAS = ['Cuaderno.tsx', 'AlumnoDetalle.tsx', 'EtiquetasAlumno.tsx']

  it('encuentra las vistas que hay que revisar', () => {
    expect(vistas.length).toBeGreaterThan(20)
  })

  it.each(vistas)('%s', (ruta) => {
    if (PERMITIDAS.some((p) => ruta.endsWith(p))) return
    const encontrado = rastro(readFileSync(ruta, 'utf-8'))
    expect(
      encontrado,
      `«${encontrado}»: las etiquetas de alumnado solo se pintan en el Cuaderno`,
    ).toBeUndefined()
  })

  it('el punto vive dentro de Cuaderno.tsx, no en un componente reutilizable', () => {
    // Si estuviera en `src/components/`, cualquier vista podría montarlo. La
    // condición de contexto es física a propósito.
    const compartidos = fuentes(join(RAIZ, 'components'), ['.tsx'])
    expect(compartidos.filter((r) => readFileSync(r, 'utf-8').includes('PuntoEtiquetas'))).toEqual([])
    expect(readFileSync(join(RAIZ, 'pages', 'Cuaderno.tsx'), 'utf-8')).toContain(
      'function PuntoEtiquetas',
    )
  })

  it('el punto no se exporta: nadie de fuera puede montarlo', () => {
    const cuaderno = readFileSync(join(RAIZ, 'pages', 'Cuaderno.tsx'), 'utf-8')
    expect(cuaderno).not.toMatch(/export\s+(function|const)\s+PuntoEtiquetas/)
  })
})

describe('las etiquetas nunca salen del dispositivo', () => {
  /**
   * Todas las rutas por las que algo puede abandonar el dispositivo sin cifrar.
   * Cifrar es la única salida permitida, así que `db/backup.ts` y `lib/backup.ts`
   * no están en la lista: ahí SÍ tienen que viajar.
   */
  const SALIDAS = [
    join(RAIZ, 'lib', 'informes.ts'), // PDF (acta, informe individual, plan del día), XLSX, CSV
    join(RAIZ, 'lib', 'inventario.ts'), // XLSX y CSV del inventario
    join(RAIZ, 'lib', 'recursosTexto.ts'), // texto de «Preparar el material», al portapapeles
    join(RAIZ, 'lib', 'descargar.ts'), // primitiva de descarga
    join(RAIZ, 'db', 'agenteApi.ts'), // única llamada de red con contenido
    join(RAIZ, 'lib', 'pseudonimizacion.ts'), // lo que se envía al agente
    join(RAIZ, 'db', 'equipos.ts'), // lo que entra al generador
  ]

  it.each(SALIDAS)('%s no toca las etiquetas', (ruta) => {
    const encontrado = rastro(readFileSync(ruta, 'utf-8'))
    expect(
      encontrado,
      `«${encontrado}»: esta ruta saca datos del dispositivo sin cifrar`,
    ).toBeUndefined()
  })

  it('tampoco tocan `apoyos`, `notasPrivadas` ni `nivelMotriz` en crudo', () => {
    // La misma protección de la que las etiquetas son herederas. Estaba escrita
    // solo en comentarios; aquí queda comprobada.
    const sensibles = /\.(apoyos|notasPrivadas)\b/
    const culpables = SALIDAS.filter(
      (r) => r !== join(RAIZ, 'db', 'equipos.ts') && sinComentarios(readFileSync(r, 'utf-8')).match(sensibles),
    )
    expect(culpables).toEqual([])
  })

  /**
   * El repaso de arriba solo vale si la lista está completa, y una lista escrita
   * a mano envejece: el día que alguien añada un export nuevo, nadie se
   * acordará de venir aquí. Así que se busca en TODA la fuente quién puede
   * sacar algo del dispositivo —escribir un fichero, copiar al portapapeles o
   * llamar a la red— y se exige que cada uno esté clasificado.
   */
  it('la lista de salidas está completa: no hay ninguna sin clasificar', () => {
    const SACAN_ALGO =
      /XLSX\.writeFile|doc\.save\(|descargarArchivo\(|clipboard\.writeText|\bfetch\(|setDoc\(/

    /**
     * Las salidas que SÍ pueden llevar datos sensibles, porque lo que sacan va
     * cifrado de extremo a extremo antes de salir (M9, §10 y §11).
     */
    const CIFRADAS = ['db/backup.ts', 'lib/backup.ts', 'db/sincro.ts', 'lib/webdav.ts']

    const todas = [
      ...fuentes(join(RAIZ, 'lib'), ['.ts', '.tsx']),
      ...fuentes(join(RAIZ, 'db'), ['.ts']),
      ...fuentes(join(RAIZ, 'pages'), ['.tsx']),
      ...fuentes(join(RAIZ, 'components'), ['.tsx']),
    ]
    const relativa = (r: string) => r.slice(RAIZ.length + 1).replace(/\\/g, '/')
    const clasificadas = new Set([
      ...SALIDAS.map(relativa),
      ...CIFRADAS,
      // Vistas que disparan una salida: el bloque «solo se pintan en el
      // Cuaderno» ya comprueba que no nombran ninguna etiqueta.
      'pages/Informes.tsx',
      'pages/Hoy.tsx',
    ])

    const detectadas = todas
      .filter((r) => SACAN_ALGO.test(sinComentarios(readFileSync(r, 'utf-8'))))
      .map(relativa)

    // Guardia contra un test vacío: si el patrón deja de encontrar nada, este
    // repaso pasaría siempre sin mirar a nadie.
    expect(detectadas.length).toBeGreaterThanOrEqual(6)

    const sinClasificar = detectadas.filter((r) => !clasificadas.has(r))

    expect(
      sinClasificar,
      'salida nueva sin clasificar: añádela a SALIDAS y comprueba que no lleva etiquetas',
    ).toEqual([])
  })

  it('la pizarra y el marcador no reciben ni el alumno entero', () => {
    // Bloqueo estructural: si no llega como prop, no se puede filtrar.
    const pizarra = readFileSync(join(RAIZ, 'components', 'Pizarra.tsx'), 'utf-8')
    expect(rastro(pizarra)).toBeUndefined()
  })
})
