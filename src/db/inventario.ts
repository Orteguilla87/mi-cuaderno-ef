/**
 * Inventario de material — acceso a la base.
 *
 * Catálogo propio del centro, transversal a las etapas. Todo local (§1.1): ni
 * una petición de red sale de este módulo.
 *
 * Los borrados devuelven una función de deshacer, como `anadirAlBanco` en
 * `db/juegos.ts`: se la queda el snackbar (`useUI.mostrarAviso`) y así ninguna
 * escritura del módulo es definitiva de un solo toque.
 */

import Fuse from 'fuse.js'
import { db, nuevoId } from './db'
import { limpiarOpcionales, normalizarNombre } from '../lib/inventario'
import type { EtiquetaMaterial, Material } from './types'

/**
 * Id fijo de la etiqueta reservada. Fijo y no aleatorio porque los módulos que
 * vengan después (sesión de emergencia, banco de juegos) tienen que poder
 * excluir el material no apto para 3-5 años sin buscarla por nombre.
 */
export const ETIQUETA_APTO_INFANTIL = 'etq-apto-infantil'

export class ErrorInventario extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorInventario'
  }
}

type Deshacer = () => Promise<void>

// ——————————————————————— materiales ———————————————————————

/** Campos que el formulario rellena; el resto los pone la propia función. */
export type DatosMaterial = Omit<
  Material,
  'id' | 'nombreNormalizado' | 'creadoEn' | 'actualizadoEn'
>

export async function crearMaterial(datos: DatosMaterial, ahora = Date.now()): Promise<Material> {
  const material = limpiarOpcionales({
    ...datos,
    id: nuevoId(),
    nombre: datos.nombre.trim(),
    nombreNormalizado: normalizarNombre(datos.nombre),
    etiquetaIds: datos.etiquetaIds ?? [],
    creadoEn: ahora,
    actualizadoEn: ahora,
  }) as Material
  await db.materiales.add(material)
  return material
}

/**
 * Reemplaza el registro entero en vez de hacer `update` parcial: es la única
 * forma de que un campo BORRADO en el formulario desaparezca de verdad. Con
 * `update({cantidad: undefined})` Dexie deja la clave como estaba, y el
 * material se quedaría con una cantidad que el usuario acaba de quitar.
 */
export async function editarMaterial(
  id: string,
  datos: DatosMaterial,
  ahora = Date.now(),
): Promise<void> {
  const previo = await db.materiales.get(id)
  if (!previo) throw new ErrorInventario('El material ya no existe.')
  const material = limpiarOpcionales({
    ...datos,
    id,
    nombre: datos.nombre.trim(),
    nombreNormalizado: normalizarNombre(datos.nombre),
    etiquetaIds: datos.etiquetaIds ?? [],
    creadoEn: previo.creadoEn,
    actualizadoEn: ahora,
  }) as Material
  await db.materiales.put(material)
}

export async function borrarMaterial(id: string): Promise<Deshacer> {
  const previo = await db.materiales.get(id)
  if (!previo) throw new ErrorInventario('El material ya no existe.')
  await db.materiales.delete(id)
  return async () => void (await db.materiales.add(previo))
}

export function listarMateriales(): Promise<Material[]> {
  return db.materiales.toArray()
}

/**
 * Búsqueda difusa (§2: Fuse.js), igual que en el Banco de Juegos: tolera
 * erratas y acentos, que es lo que hace falta buscando con una mano.
 */
export function buscarMateriales(materiales: Material[], consulta: string): Material[] {
  const q = consulta.trim()
  if (!q) return materiales

  const fuse = new Fuse(materiales, {
    keys: [
      { name: 'nombre', weight: 3 },
      { name: 'ubicacion', weight: 1 },
      { name: 'notas', weight: 1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
  })
  return fuse.search(q).map((r) => r.item)
}

/** El material con ese nombre, ignorando mayúsculas, tildes y espacios. */
export function buscarPorNombre(materiales: Material[], nombre: string): Material | undefined {
  const n = normalizarNombre(nombre)
  if (!n) return undefined
  return materiales.find((m) => m.nombreNormalizado === n)
}

// ——————————————————————— etiquetas ———————————————————————

export async function crearEtiqueta(
  datos: Omit<EtiquetaMaterial, 'id' | 'nombreNormalizado' | 'creadoEn'>,
  ahora = Date.now(),
): Promise<EtiquetaMaterial> {
  const nombre = datos.nombre.trim()
  if (!nombre) throw new ErrorInventario('La etiqueta necesita un nombre.')
  const etiqueta = limpiarOpcionales({
    ...datos,
    id: nuevoId(),
    nombre,
    nombreNormalizado: normalizarNombre(nombre),
    creadoEn: ahora,
  }) as EtiquetaMaterial
  await db.etiquetasMaterial.add(etiqueta)
  return etiqueta
}

/**
 * Cambios parciales sobre una etiqueta. Las reservadas solo admiten color: son
 * del sistema y otros módulos se apoyan en su nombre.
 */
export async function editarEtiqueta(
  id: string,
  cambios: Partial<Pick<EtiquetaMaterial, 'nombre' | 'grupo' | 'color'>>,
): Promise<void> {
  const previa = await db.etiquetasMaterial.get(id)
  if (!previa) throw new ErrorInventario('La etiqueta ya no existe.')

  const tocaAlgoMasQueElColor = cambios.nombre !== undefined || cambios.grupo !== undefined
  if (previa.reservada && tocaAlgoMasQueElColor)
    throw new ErrorInventario(
      `«${previa.nombre}» es una etiqueta del sistema: solo se le puede cambiar el color.`,
    )

  const nombre = cambios.nombre?.trim()
  if (cambios.nombre !== undefined && !nombre)
    throw new ErrorInventario('La etiqueta necesita un nombre.')

  const etiqueta = limpiarOpcionales({
    ...previa,
    ...cambios,
    ...(nombre ? { nombre, nombreNormalizado: normalizarNombre(nombre) } : {}),
  }) as EtiquetaMaterial
  await db.etiquetasMaterial.put(etiqueta)
}

/**
 * Borra la etiqueta y la desasigna de todo material, en una transacción: o se
 * va entera o no se va, nunca deja `etiquetaIds` apuntando a un id fantasma.
 */
export async function borrarEtiqueta(id: string): Promise<Deshacer> {
  const previa = await db.etiquetasMaterial.get(id)
  if (!previa) throw new ErrorInventario('La etiqueta ya no existe.')
  if (previa.reservada)
    throw new ErrorInventario(
      `«${previa.nombre}» es una etiqueta del sistema y no se puede borrar.`,
    )

  const afectados = await db.materiales.where('etiquetaIds').equals(id).toArray()
  await db.transaction('rw', db.materiales, db.etiquetasMaterial, async () => {
    for (const m of afectados)
      await db.materiales.update(m.id, { etiquetaIds: m.etiquetaIds.filter((e) => e !== id) })
    await db.etiquetasMaterial.delete(id)
  })

  return async () => {
    await db.transaction('rw', db.materiales, db.etiquetasMaterial, async () => {
      await db.etiquetasMaterial.add(previa)
      for (const m of afectados) await db.materiales.update(m.id, { etiquetaIds: m.etiquetaIds })
    })
  }
}

/**
 * Reasigna a `destinoId` todo el material de `origenId` y borra la origen.
 *
 * Imprescindible después de importar: de una hoja de cálculo real salen
 * «Aros», «aros» y «Aro» como tres etiquetas distintas.
 */
export async function fusionarEtiquetas(origenId: string, destinoId: string): Promise<Deshacer> {
  if (origenId === destinoId) throw new ErrorInventario('Elige dos etiquetas distintas.')
  const origen = await db.etiquetasMaterial.get(origenId)
  const destino = await db.etiquetasMaterial.get(destinoId)
  if (!origen || !destino) throw new ErrorInventario('Alguna de las etiquetas ya no existe.')
  if (origen.reservada)
    throw new ErrorInventario(
      `«${origen.nombre}» es una etiqueta del sistema: no se puede fundir en otra.`,
    )

  const afectados = await db.materiales.where('etiquetaIds').equals(origenId).toArray()
  await db.transaction('rw', db.materiales, db.etiquetasMaterial, async () => {
    for (const m of afectados) {
      // Sin duplicar: el material puede tener ya la etiqueta de destino.
      const ids = m.etiquetaIds.filter((e) => e !== origenId)
      if (!ids.includes(destinoId)) ids.push(destinoId)
      await db.materiales.update(m.id, { etiquetaIds: ids })
    }
    await db.etiquetasMaterial.delete(origenId)
  })

  return async () => {
    await db.transaction('rw', db.materiales, db.etiquetasMaterial, async () => {
      await db.etiquetasMaterial.add(origen)
      for (const m of afectados) await db.materiales.update(m.id, { etiquetaIds: m.etiquetaIds })
    })
  }
}

export function listarEtiquetas(): Promise<EtiquetaMaterial[]> {
  return db.etiquetasMaterial.toArray()
}

/** Cuántos materiales lleva cada etiqueta, para el listado de gestión. */
export function contarPorEtiqueta(materiales: Material[]): Record<string, number> {
  const conteo: Record<string, number> = {}
  for (const m of materiales) for (const id of m.etiquetaIds) conteo[id] = (conteo[id] ?? 0) + 1
  return conteo
}

// ——————————————————————— importación ———————————————————————

/**
 * Marcador para una etiqueta que todavía no existe cuando se arma el plan.
 *
 * El plan se construye fuera de la transacción, así que no puede conocer el id
 * de una etiqueta que se va a crear dentro de ella. En vez de escribir primero
 * y arreglar después —que dejaría material apuntando a ids fantasma si algo
 * falla a mitad—, se referencian por nombre normalizado y `aplicarImportacion`
 * los sustituye por el id real ya dentro de la transacción.
 */
export const PREFIJO_ETIQUETA_NUEVA = 'nueva:'

export function marcadorEtiquetaNueva(nombre: string): string {
  return PREFIJO_ETIQUETA_NUEVA + normalizarNombre(nombre)
}

export interface PlanImportacion {
  /** Materiales nuevos. Sus `etiquetaIds` pueden llevar marcadores. */
  crear: DatosMaterial[]
  /** Materiales existentes a completar: solo los campos que estaban vacíos. */
  fusionar: { id: string; campos: Partial<DatosMaterial> }[]
  /** Nombres de etiqueta a crear antes de nada, con su grupo. */
  etiquetas: { nombre: string; grupo?: EtiquetaMaterial['grupo'] }[]
}

export interface ResumenImportacion {
  creados: number
  fusionados: number
  etiquetasCreadas: number
  /** Nombre de etiqueta → id, para que la pantalla sepa qué se creó. */
  idsPorNombre: Record<string, string>
  deshacer: Deshacer
}

/**
 * Escribe el plan entero en UNA transacción: o entra todo o no entra nada.
 * Una importación a medias sobre un inventario ya empezado sería peor que no
 * importar, porque no habría forma de saber por dónde se quedó.
 *
 * El deshacer guarda el estado previo de lo que toca (no una marca de lote en
 * el registro): es el mismo deshacer del snackbar que usa el resto de la app.
 */
export async function aplicarImportacion(
  plan: PlanImportacion,
  ahora = Date.now(),
): Promise<ResumenImportacion> {
  const previos = await db.materiales.bulkGet(plan.fusionar.map((f) => f.id))
  const idsPorNombre: Record<string, string> = {}
  const idsEtiquetasCreadas: string[] = []
  const idsMaterialesCreados: string[] = []

  await db.transaction('rw', db.materiales, db.etiquetasMaterial, async () => {
    for (const { nombre, grupo } of plan.etiquetas) {
      const etiqueta = limpiarOpcionales({
        id: nuevoId(),
        nombre: nombre.trim(),
        nombreNormalizado: normalizarNombre(nombre),
        grupo,
        creadoEn: ahora,
      }) as EtiquetaMaterial
      await db.etiquetasMaterial.add(etiqueta)
      idsPorNombre[normalizarNombre(nombre)] = etiqueta.id
      idsEtiquetasCreadas.push(etiqueta.id)
    }

    /** Marcadores → id real; lo que no se resuelve se cae, no se escribe roto. */
    const resolver = (ids: string[] | undefined): string[] =>
      (ids ?? [])
        .map((id) =>
          id.startsWith(PREFIJO_ETIQUETA_NUEVA)
            ? idsPorNombre[id.slice(PREFIJO_ETIQUETA_NUEVA.length)]
            : id,
        )
        .filter((id): id is string => !!id)

    for (const datos of plan.crear) {
      const material = limpiarOpcionales({
        ...datos,
        id: nuevoId(),
        nombre: datos.nombre.trim(),
        nombreNormalizado: normalizarNombre(datos.nombre),
        etiquetaIds: resolver(datos.etiquetaIds),
        creadoEn: ahora,
        actualizadoEn: ahora,
      }) as Material
      await db.materiales.add(material)
      idsMaterialesCreados.push(material.id)
    }

    for (const { id, campos } of plan.fusionar) {
      const previo = await db.materiales.get(id)
      if (!previo) continue
      const material = limpiarOpcionales({
        ...previo,
        ...campos,
        etiquetaIds: resolver(campos.etiquetaIds ?? previo.etiquetaIds),
        actualizadoEn: ahora,
      }) as Material
      await db.materiales.put(material)
    }
  })

  return {
    creados: idsMaterialesCreados.length,
    fusionados: plan.fusionar.length,
    etiquetasCreadas: idsEtiquetasCreadas.length,
    idsPorNombre,
    deshacer: async () => {
      await db.transaction('rw', db.materiales, db.etiquetasMaterial, async () => {
        await db.materiales.bulkDelete(idsMaterialesCreados)
        await db.etiquetasMaterial.bulkDelete(idsEtiquetasCreadas)
        const restaurar = previos.filter((m): m is Material => !!m)
        if (restaurar.length) await db.materiales.bulkPut(restaurar)
      })
    },
  }
}

// ——————————————————————— semilla ———————————————————————

/**
 * Ids FIJOS, no `nuevoId()`, por la misma razón que los criterios oficiales:
 * con ids aleatorios, dos pasadas de la semilla plantan dos juegos completos
 * de etiquetas. Pasa de verdad —React monta el efecto de arranque dos veces en
 * desarrollo, y las dos leen la tabla vacía antes de que ninguna escriba—, así
 * que la semilla se escribe con `bulkPut` sobre claves conocidas y repetirla no
 * duplica nada.
 */
function semilla(ahora: number): EtiquetaMaterial[] {
  const tamano = ['Pequeño', 'Mediano', 'Grande'].map((nombre) => ({
    id: `etq-tam-${normalizarNombre(nombre)}`,
    nombre,
    nombreNormalizado: normalizarNombre(nombre),
    grupo: 'tamano' as const,
    creadoEn: ahora,
  }))
  return [
    ...tamano,
    {
      // Sirve para excluir después el material peligroso en las pistas en
      // cuesta con alumnado de 3-5 años. Por eso es del sistema: otro módulo
      // dependerá de que exista.
      id: ETIQUETA_APTO_INFANTIL,
      nombre: 'Apto infantil',
      nombreNormalizado: normalizarNombre('Apto infantil'),
      grupo: 'otro',
      color: 'lima',
      reservada: true,
      creadoEn: ahora,
    },
  ]
}

/**
 * Cuatro etiquetas y ningún material: el catálogo lo pone el centro, no la app.
 *
 * Solo siembra si las DOS tablas están vacías. Con la de etiquetas a secas
 * volvería a plantar las de tamaño cada vez que el usuario las borrase a
 * conciencia, y repoblaría un inventario recién restaurado de una copia que
 * deliberadamente no las tenía.
 */
export async function sembrarInventario(ahora = Date.now()): Promise<void> {
  const [etiquetas, materiales] = await Promise.all([
    db.etiquetasMaterial.count(),
    db.materiales.count(),
  ])
  if (etiquetas > 0 || materiales > 0) return
  // `bulkPut` y no `bulkAdd`: con los ids fijos de arriba, dos pasadas
  // simultáneas escriben las mismas cuatro filas en vez de chocar.
  await db.etiquetasMaterial.bulkPut(semilla(ahora))
}
