import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, ESQUEMA_ACTUAL } from './db'
import { exportarBackup, restaurarBackup } from './backup'
import {
  borrarEtiqueta,
  borrarMaterial,
  buscarPorNombre,
  contarPorEtiqueta,
  crearEtiqueta,
  crearMaterial,
  editarEtiqueta,
  editarMaterial,
  ETIQUETA_APTO_INFANTIL,
  fusionarEtiquetas,
  listarMateriales,
  sembrarInventario,
} from './inventario'

const CLAVE = 'caseta-del-porche-2026'

async function vaciarBase() {
  await db.transaction('rw', db.tables, async () => {
    for (const tabla of db.tables) await tabla.clear()
  })
}

beforeEach(vaciarBase)
afterEach(vaciarBase)

describe('semilla', () => {
  it('planta las tres de tamaño y la reservada, y no repite al llamarla otra vez', async () => {
    await sembrarInventario()
    await sembrarInventario()

    const etiquetas = await db.etiquetasMaterial.toArray()
    expect(etiquetas).toHaveLength(4)
    // Sin ordenar: `toArray()` sale por clave primaria (uuid), no por inserción.
    expect(
      etiquetas
        .filter((e) => e.grupo === 'tamano')
        .map((e) => e.nombre)
        .sort(),
    ).toEqual(['Grande', 'Mediano', 'Pequeño'])
    const apto = await db.etiquetasMaterial.get(ETIQUETA_APTO_INFANTIL)
    expect(apto?.reservada).toBe(true)
    expect(await db.materiales.count()).toBe(0)
  })

  it('dos pasadas a la vez no plantan dos juegos de etiquetas', async () => {
    // El arranque en desarrollo monta el efecto dos veces: las dos leen la
    // tabla vacía antes de que ninguna escriba.
    await Promise.all([sembrarInventario(), sembrarInventario()])
    expect(await db.etiquetasMaterial.count()).toBe(4)
  })

  it('no repuebla un inventario del que el usuario ya borró las etiquetas', async () => {
    await crearMaterial({ nombre: 'Conos', etiquetaIds: [] })
    await sembrarInventario()
    expect(await db.etiquetasMaterial.count()).toBe(0)
  })
})

describe('CRUD de materiales', () => {
  it('un material sin cantidad ni estado se guarda SIN esas claves', async () => {
    const creado = await crearMaterial({ nombre: '  Aros  ', etiquetaIds: [] })
    expect(creado.nombre).toBe('Aros')
    expect(creado.nombreNormalizado).toBe('aros')

    const guardado = await db.materiales.get(creado.id)
    expect(guardado).toBeDefined()
    expect('cantidad' in guardado!).toBe(false)
    expect('estado' in guardado!).toBe(false)
    expect('ubicacion' in guardado!).toBe(false)
  })

  it('editar quitando la cantidad la borra de verdad, no la deja como estaba', async () => {
    const creado = await crearMaterial({
      nombre: 'Petos',
      cantidad: 24,
      estado: 'regular',
      etiquetaIds: [],
    })
    expect((await db.materiales.get(creado.id))?.cantidad).toBe(24)

    await editarMaterial(creado.id, { nombre: 'Petos', etiquetaIds: [] })
    const tras = await db.materiales.get(creado.id)
    expect('cantidad' in tras!).toBe(false)
    expect('estado' in tras!).toBe(false)
    expect(tras?.creadoEn).toBe(creado.creadoEn)
  })

  it('borrar devuelve un deshacer que lo repone entero', async () => {
    const creado = await crearMaterial({ nombre: 'Picas', cantidad: 10, etiquetaIds: [] })
    const deshacer = await borrarMaterial(creado.id)
    expect(await db.materiales.count()).toBe(0)
    await deshacer()
    expect(await db.materiales.get(creado.id)).toEqual(creado)
  })

  it('buscarPorNombre ignora mayúsculas, tildes y espacios', async () => {
    await crearMaterial({ nombre: 'Balón de gomaespuma', etiquetaIds: [] })
    const lista = await listarMateriales()
    expect(buscarPorNombre(lista, '  balon   DE gomaespuma ')?.nombre).toBe(
      'Balón de gomaespuma',
    )
    expect(buscarPorNombre(lista, 'aros')).toBeUndefined()
  })
})

describe('etiquetas', () => {
  it('borrar una etiqueta la desasigna de todo material, y el deshacer lo repone', async () => {
    const etiqueta = await crearEtiqueta({ nombre: 'Blandos', grupo: 'familia' })
    const otra = await crearEtiqueta({ nombre: 'Porche', grupo: 'ubicacion' })
    const material = await crearMaterial({
      nombre: 'Balones',
      etiquetaIds: [etiqueta.id, otra.id],
    })

    const deshacer = await borrarEtiqueta(etiqueta.id)
    expect(await db.etiquetasMaterial.get(etiqueta.id)).toBeUndefined()
    expect((await db.materiales.get(material.id))?.etiquetaIds).toEqual([otra.id])

    await deshacer()
    expect(await db.etiquetasMaterial.get(etiqueta.id)).toBeDefined()
    expect((await db.materiales.get(material.id))?.etiquetaIds).toEqual([etiqueta.id, otra.id])
  })

  it('la reservada no se borra ni se renombra, pero sí cambia de color', async () => {
    await sembrarInventario()
    await expect(borrarEtiqueta(ETIQUETA_APTO_INFANTIL)).rejects.toThrow(/sistema/)
    await expect(
      editarEtiqueta(ETIQUETA_APTO_INFANTIL, { nombre: 'Otra cosa' }),
    ).rejects.toThrow(/sistema/)

    await editarEtiqueta(ETIQUETA_APTO_INFANTIL, { color: 'acento' })
    expect((await db.etiquetasMaterial.get(ETIQUETA_APTO_INFANTIL))?.color).toBe('acento')
  })

  it('fusionar reasigna sin duplicar y borra la de origen', async () => {
    const aros = await crearEtiqueta({ nombre: 'Aros' })
    const aro = await crearEtiqueta({ nombre: 'aro' })
    const soloOrigen = await crearMaterial({ nombre: 'Aro pequeño', etiquetaIds: [aro.id] })
    const ambas = await crearMaterial({ nombre: 'Aro grande', etiquetaIds: [aro.id, aros.id] })

    await fusionarEtiquetas(aro.id, aros.id)

    expect(await db.etiquetasMaterial.get(aro.id)).toBeUndefined()
    expect((await db.materiales.get(soloOrigen.id))?.etiquetaIds).toEqual([aros.id])
    expect((await db.materiales.get(ambas.id))?.etiquetaIds).toEqual([aros.id])
  })

  it('contarPorEtiqueta cuenta materiales, no asignaciones sueltas', async () => {
    const a = await crearEtiqueta({ nombre: 'A' })
    const b = await crearEtiqueta({ nombre: 'B' })
    await crearMaterial({ nombre: 'Uno', etiquetaIds: [a.id] })
    await crearMaterial({ nombre: 'Dos', etiquetaIds: [a.id, b.id] })

    expect(contarPorEtiqueta(await listarMateriales())).toEqual({ [a.id]: 2, [b.id]: 1 })
  })
})

describe('backup cifrado — las dos tablas entran solas y la ausencia sobrevive', () => {
  it('export → wipe → import restaura inventario y etiquetas íntegros', async () => {
    await sembrarInventario()
    const etiqueta = await crearEtiqueta({ nombre: 'Blandos', grupo: 'familia', color: 'lima' })
    const completo = await crearMaterial({
      nombre: 'Conos',
      cantidad: 30,
      cantidadInservible: 2,
      estado: 'bueno',
      ubicacion: 'Almacén',
      notas: 'Los amarillos están en la caseta',
      etiquetaIds: [etiqueta.id, ETIQUETA_APTO_INFANTIL],
    })
    const desnudo = await crearMaterial({ nombre: 'Picas', etiquetaIds: [] })

    const { fichero, cabecera } = await exportarBackup(CLAVE)
    expect(cabecera.esquema).toBe(ESQUEMA_ACTUAL)
    expect(cabecera.registros.materiales).toBe(2)
    expect(cabecera.registros.etiquetasMaterial).toBe(5)

    await vaciarBase()
    expect(await db.materiales.count()).toBe(0)

    const resultado = await restaurarBackup(fichero, CLAVE)
    expect(resultado.migrado).toBe(false)
    expect(resultado.escritos.materiales).toBe(2)
    expect(resultado.escritos.etiquetasMaterial).toBe(5)

    expect(await db.materiales.get(completo.id)).toEqual(completo)
    expect(await db.etiquetasMaterial.get(etiqueta.id)).toEqual(etiqueta)

    // Lo que de verdad se vigila: los campos opcionales ausentes siguen
    // ausentes tras el viaje, no vuelven convertidos en 0 ni en null.
    const restaurado = await db.materiales.get(desnudo.id)
    expect('cantidad' in restaurado!).toBe(false)
    expect('cantidadInservible' in restaurado!).toBe(false)
    expect('estado' in restaurado!).toBe(false)
    expect('ubicacion' in restaurado!).toBe(false)
    expect('notas' in restaurado!).toBe(false)
  })

  it('una copia anterior a la v18 restaura las tablas nuevas vacías, sin romper', async () => {
    await sembrarInventario()
    const { fichero } = await exportarBackup(CLAVE)

    // Se simula la copia antigua quitándole las dos tablas: es exactamente lo
    // que trae un `.enc` hecho con esquema 17.
    await vaciarBase()
    const { abrir, empaquetar } = await import('../lib/backup')
    const { tablas } = await abrir(fichero, CLAVE)
    delete tablas.materiales
    delete tablas.etiquetasMaterial
    const antigua = await empaquetar(tablas, CLAVE, { esquema: 17, creado: new Date() })

    const resultado = await restaurarBackup(antigua.fichero, CLAVE)
    expect(resultado.migrado).toBe(true)
    expect(await db.materiales.count()).toBe(0)
    expect(await db.etiquetasMaterial.count()).toBe(0)
  })
})
