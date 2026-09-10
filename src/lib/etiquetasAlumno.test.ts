import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Las dos reglas duras de las etiquetas de alumnado, vigiladas sobre la fuente.
 *
 *  1. Solo se pintan en las vistas de gestión del maestro.
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
const RASTRO = /PuntoEtiquetas|etiquetasAlumno|EtiquetaAlumno|etiquetas(?:Puestas)?De\s*\(/

/** El campo del alumno, leído directamente sin pasar por el módulo. */
const RASTRO_CAMPO = /\balumnos?\??\.etiquetas\b|\ba\.etiquetas\b/

function rastro(codigo: string): string | undefined {
  const limpio = sinComentarios(codigo)
  return (limpio.match(RASTRO) ?? limpio.match(RASTRO_CAMPO))?.[0]
}

describe('las etiquetas solo se pintan en las vistas de gestión', () => {
  const vistas = [...fuentes(join(RAIZ, 'pages'), ['.tsx']), ...fuentes(join(RAIZ, 'components'), ['.tsx'])]

  /**
   * Las únicas vistas que pueden nombrarlas: las cuatro pantallas de trabajo
   * del maestro —el Cuaderno, la ficha del grupo, el pase de lista y la ficha
   * del alumno—, más la de gestión del catálogo. Se miran de cerca en el móvil;
   * ninguna se proyecta ni se enseña a nadie. Las herramientas de aula, Hoy, el
   * planificador y el calendario siguen fuera.
   *
   * Esta lista se AMPLÍA a mano cuando una vista nueva tiene que pintarlas, y
   * nunca se sustituye por una prop opcional: la condición de contexto es
   * física a propósito.
   */
  const PERMITIDAS = [
    'Cuaderno.tsx',
    'GrupoDetalle.tsx',
    'PaseLista.tsx',
    'AlumnoDetalle.tsx',
    'EtiquetasAlumno.tsx',
  ]

  /** Las que pintan el punto, cada una con su copia. */
  const PINTAN = ['Cuaderno.tsx', 'GrupoDetalle.tsx', 'PaseLista.tsx', 'AlumnoDetalle.tsx']

  /**
   * Vistas que TOCAN una etiqueta sin PINTAR ninguna.
   *
   * `HojaObservacion` ofrece poner «Lesionado» al anotar una lesión, así que
   * nombra el módulo y su id; pero no enseña ni un punto, ni una abreviatura,
   * ni un nombre de etiqueta que no haya escrito el propio maestro en el texto
   * del ofrecimiento. Se les permite nombrarlo y se les prohíbe expresamente
   * cualquier cosa que renderice, que es lo que comprueba el test de abajo: sin
   * esa segunda mitad, esta lista sería un agujero en la regla.
   */
  const ASIGNAN_SIN_PINTAR = ['HojaObservacion.tsx']

  /** Lo que RENDERIZA una etiqueta, que es lo que ninguna de esas puede hacer. */
  const PINTA_ALGO = /PuntoEtiquetas|etiquetas(?:Puestas)?De\s*\(|iconoDe\s*\(|\.abreviatura\b/

  /**
   * Las vistas que se proyectan en la PDI o se enseñan a pantalla completa a
   * toda la clase. Ya están cubiertas por el repaso general de arriba —no
   * aparecen en PERMITIDAS—, pero se nombran aquí una a una para que ampliar
   * PERMITIDAS por descuido con cualquiera de ellas rompa el test en vez de
   * pasar en silencio. Un punto de color junto a un nombre señala a ese alumno
   * delante de sus compañeros.
   */
  const PROYECTABLES = [
    join(RAIZ, 'pages', 'EquiposGenerador.tsx'),
    join(RAIZ, 'pages', 'Herramientas.tsx'),
    join(RAIZ, 'components', 'SorteoAlumno.tsx'),
    join(RAIZ, 'components', 'Marcador.tsx'),
    join(RAIZ, 'components', 'Pizarra.tsx'),
  ]

  it('encuentra las vistas que hay que revisar', () => {
    expect(vistas.length).toBeGreaterThan(20)
  })

  it.each(vistas)('%s', (ruta) => {
    if (PERMITIDAS.some((p) => ruta.endsWith(p))) return
    if (ASIGNAN_SIN_PINTAR.some((p) => ruta.endsWith(p))) return
    const encontrado = rastro(readFileSync(ruta, 'utf-8'))
    expect(
      encontrado,
      `«${encontrado}»: las etiquetas de alumnado solo se pintan en ${PERMITIDAS.join(', ')}`,
    ).toBeUndefined()
  })

  it('el punto no vive en ningún componente reutilizable', () => {
    // Si estuviera en `src/components/`, cualquier vista podría montarlo. La
    // condición de contexto es física a propósito, y por eso cada vista que lo
    // pinta lleva su propia copia en vez de compartir una.
    const compartidos = fuentes(join(RAIZ, 'components'), ['.tsx'])
    expect(compartidos.filter((r) => readFileSync(r, 'utf-8').includes('PuntoEtiquetas'))).toEqual([])
  })

  it.each(PINTAN)('%s tiene su propia copia del punto, y no la exporta', (vista) => {
    const fuente = readFileSync(join(RAIZ, 'pages', vista), 'utf-8')
    expect(fuente).toContain('function PuntoEtiquetas')
    expect(fuente).not.toMatch(/export\s+(function|const)\s+PuntoEtiquetas/)
  })

  it.each(PINTAN)('%s pinta también la abreviatura, no solo el color', (vista) => {
    // El color nunca es el único portador del significado: dos etiquetas de
    // color parecido son indistinguibles de un vistazo, y bajo protanopia o
    // deuteranopia lo son del todo.
    const fuente = readFileSync(join(RAIZ, 'pages', vista), 'utf-8')
    expect(fuente).toMatch(/\{e\.abreviatura\}/)
  })

  it.each(ASIGNAN_SIN_PINTAR)('%s asigna, pero no pinta ninguna etiqueta', (vista) => {
    const fuente = sinComentarios(readFileSync(join(RAIZ, 'components', vista), 'utf-8'))
    const encontrado = fuente.match(PINTA_ALGO)?.[0]
    expect(
      encontrado,
      `«${encontrado}»: esta vista puede poner una etiqueta, pero no enseñarla`,
    ).toBeUndefined()
  })

  it('ninguna vista proyectable puede asignar tampoco', () => {
    const asignan = PROYECTABLES.filter((r) => ASIGNAN_SIN_PINTAR.some((p) => r.endsWith(p)))
    expect(asignan, 'una vista proyectable no puede ni tocar una etiqueta').toEqual([])
  })

  it.each(PROYECTABLES)('%s no menciona ninguna etiqueta de alumnado', (ruta) => {
    const encontrado = rastro(readFileSync(ruta, 'utf-8'))
    expect(
      encontrado,
      `«${encontrado}»: esta vista se proyecta o se enseña a toda la clase`,
    ).toBeUndefined()
  })

  it('ninguna vista proyectable está entre las permitidas', () => {
    const permitidas = PROYECTABLES.filter((r) => PERMITIDAS.some((p) => r.endsWith(p)))
    expect(permitidas, 'una vista proyectable no puede pintar etiquetas').toEqual([])
  })

  it('el interruptor es global: todas las que pintan lo consultan', () => {
    // Uno solo para toda la app. Si una vista pintara sin consultarlo, apagarlo
    // desde otra pantalla no la apagaría a ella.
    for (const vista of PINTAN) {
      const fuente = readFileSync(join(RAIZ, 'pages', vista), 'utf-8')
      expect(fuente, `${vista} pinta etiquetas sin mirar el interruptor`).toContain(
        'useEtiquetasVisibles',
      )
    }
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
    const sensibles = /\.(apoyos|notasPrivadas|nivelMotriz)\b/
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

/**
 * El nivel motriz (`Alumno.nivelMotriz`, `lib/nivelMotriz.ts`) hereda la regla
 * de contexto de las etiquetas, y por el mismo motivo: es una valoración del
 * maestro sobre un niño. Enseñar en la pizarra quién es «nivel 1» delante de
 * toda la clase es exactamente lo que no puede pasar.
 *
 * Se vigila igual que arriba, sobre la fuente. La salida del dispositivo ya la
 * cubre el test de `.nivelMotriz` en las SALIDAS.
 */
describe('el nivel motriz solo se ve en las vistas de gestión', () => {
  const vistas = [
    ...fuentes(join(RAIZ, 'pages'), ['.tsx']),
    ...fuentes(join(RAIZ, 'components'), ['.tsx']),
  ]

  const RASTRO_NIVEL = /\bnivelMotriz\b|SelectorNivelMotriz|NIVEL(?:ES)?_MOTRI[CZ]|etiquetaNivelMotriz/

  /**
   * Dónde se valora: la ficha del alumno y la vista de lote del grupo. Más el
   * Cuaderno, que lo ENSEÑA junto al nombre —con su propia copia del chip, como
   * el punto de etiquetas— para valorar mientras se pone nota, sin salir de la
   * rejilla. Y el control en sí, que a diferencia del punto de etiquetas SÍ
   * vive en `components/`: es un editor —un `input`, no un adorno junto a un
   * nombre—, y quién lo monta lo sigue decidiendo esta lista.
   */
  const PERMITIDAS_NIVEL = [
    'Cuaderno.tsx',
    'AlumnoDetalle.tsx',
    'EdicionMasivaAlumnos.tsx',
    'SelectorNivelMotriz.tsx',
  ]

  /** Las mismas de arriba: lo que se proyecta o se enseña a la clase entera. */
  const PROYECTABLES_NIVEL = [
    join(RAIZ, 'pages', 'EquiposGenerador.tsx'),
    join(RAIZ, 'pages', 'Herramientas.tsx'),
    join(RAIZ, 'components', 'SorteoAlumno.tsx'),
    join(RAIZ, 'components', 'Marcador.tsx'),
    join(RAIZ, 'components', 'Pizarra.tsx'),
  ]

  it.each(vistas)('%s', (ruta) => {
    if (PERMITIDAS_NIVEL.some((p) => ruta.endsWith(p))) return
    const encontrado = sinComentarios(readFileSync(ruta, 'utf-8')).match(RASTRO_NIVEL)?.[0]
    expect(
      encontrado,
      `«${encontrado}»: el nivel motriz solo se ve en ${PERMITIDAS_NIVEL.join(', ')}`,
    ).toBeUndefined()
  })

  it.each(PROYECTABLES_NIVEL)('%s se proyecta: jamás el nivel', (ruta) => {
    // Redundante con el repaso de arriba a propósito: si alguien añade una de
    // estas a PERMITIDAS_NIVEL por descuido, esto rompe igual.
    expect(PERMITIDAS_NIVEL.some((p) => ruta.endsWith(p))).toBe(false)
    expect(sinComentarios(readFileSync(ruta, 'utf-8')).match(RASTRO_NIVEL)?.[0]).toBeUndefined()
  })
})
