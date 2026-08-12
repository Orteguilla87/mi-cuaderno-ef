/**
 * Firestore de mentira, del tamaño exacto que usa `db/sincro.ts`.
 *
 * Existe porque el motor de sincronización no se puede probar de verdad sin
 * algo que haga de servidor: subir, bajar, reensamblar los trozos y —sobre
 * todo— fallar a mitad para comprobar que el estado local no queda corrupto.
 * Con el SDK real haría falta red y un proyecto de Firebase; con esto, un
 * `Map`.
 *
 * Se enchufa con `vi.mock('firebase/firestore', () => import('../test/firestoreFalso'))`.
 * Solo implementa lo que el motor llama; cualquier otra cosa es que el motor ha
 * crecido y este doble se ha quedado corto, y entonces el test debe romperse.
 */

export interface RefFalsa {
  ruta: string
}

/** `sync/{id}` → meta; `sync/{id}/partes/{n}` → trozo. */
export const almacen = new Map<string, Record<string, unknown>>()

export function reiniciarFirestoreFalso(): void {
  almacen.clear()
}

export function doc(padre: RefFalsa | unknown, ...segmentos: string[]): RefFalsa {
  const base = (padre as RefFalsa)?.ruta
  return { ruta: [base, ...segmentos].filter(Boolean).join('/') }
}

export function collection(padre: RefFalsa, nombre: string): RefFalsa {
  return { ruta: `${padre.ruta}/${nombre}` }
}

export function getDoc(ref: RefFalsa): Promise<{
  exists: () => boolean
  data: () => Record<string, unknown> | undefined
}> {
  const guardado = almacen.get(ref.ruta)
  return Promise.resolve({ exists: () => guardado !== undefined, data: () => guardado })
}

export function setDoc(ref: RefFalsa, datos: Record<string, unknown>): Promise<void> {
  almacen.set(ref.ruta, { ...datos })
  return Promise.resolve()
}

export function deleteDoc(ref: RefFalsa): Promise<void> {
  almacen.delete(ref.ruta)
  return Promise.resolve()
}

/**
 * El motor solo lo usa para enterarse de que el otro dispositivo ha subido
 * algo. Aquí no hay nadie más escribiendo, así que basta con no hacer nada y
 * devolver una baja que tampoco hace nada.
 */
export function onSnapshot(): () => void {
  return () => undefined
}

/** En Firestore lo pone el servidor; aquí, el reloj de la máquina. */
export function serverTimestamp(): string {
  return new Date().toISOString()
}

export const Bytes = {
  fromUint8Array(datos: Uint8Array) {
    // Copia, como hace el SDK real: quien lo guarda no debe poder cambiarlo
    // después por tener una referencia al mismo búfer.
    const copia = datos.slice()
    return { toUint8Array: () => copia }
  },
}

// ——————————————————————————— utilidades para los tests ———————————————————————————

export function meta(id: string): Record<string, unknown> | undefined {
  return almacen.get(`sync/${id}`)
}

/** Estropea un trozo de la copia: sirve para provocar un fallo de reensamblado. */
export function romperParte(id: string, n: number): void {
  almacen.set(`sync/${id}/partes/${n}`, {
    datos: { toUint8Array: () => new Uint8Array([1, 2, 3]) },
  })
}
