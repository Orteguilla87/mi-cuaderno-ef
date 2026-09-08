import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  contadoresPorAlumno,
  crearObservacion,
  editarObservacion,
  eliminarObservacion,
} from './observaciones'

/**
 * Edición en línea de observaciones desde la ficha del alumno.
 *
 * Se prueba la capa de datos, que es donde el proyecto prueba (§2: Vitest para
 * la lógica, no para el DOM — no hay jsdom ni Testing Library en el stack). El
 * «cancelar» de la interfaz tiene dos mitades: mientras se escribe, el
 * borrador vive en el componente y la base no se toca —nada que probar aquí—;
 * una vez guardado, revertir es el `deshacer` que se comprueba abajo.
 */

const GRUPO_ID = 'g1'
const ALUMNO_ID = 'a1'
const OTRO_ALUMNO = 'a2'

async function observacion(
  texto: string,
  signo: '+' | '-' | 'neutro' = '+',
  alumnoId = ALUMNO_ID,
) {
  const { observacion: o } = await crearObservacion({
    alumnoId,
    grupoId: GRUPO_ID,
    tipo: 'conducta',
    signo,
    texto,
    tags: [],
    fecha: '2026-09-08',
  })
  return o
}

beforeEach(async () => {
  await db.grupos.put({
    id: GRUPO_ID,
    cursoEscolarId: 'c1',
    nombre: '3ºB',
    etapa: 'primaria',
    nivel: 3,
    color: '#006A80',
    orden: 0,
    horario: [],
  })
})

afterEach(async () => {
  await db.delete()
  await db.open()
})

describe('editar el texto', () => {
  it('persiste: al volver a leer la observación, el texto es el nuevo', async () => {
    const o = await observacion('Ayuda a recoger')
    await editarObservacion(o.id, { texto: 'Ayuda a recoger el material sin pedírselo' })

    // Lectura nueva, como la que hace la ficha al montarse otra vez.
    const releida = await db.observaciones.get(o.id)
    expect(releida?.texto).toBe('Ayuda a recoger el material sin pedírselo')
  })

  it('recorta los espacios de los bordes y deja el resto intacto', async () => {
    const o = await observacion('Corto')
    await editarObservacion(o.id, { texto: '  Con dos  espacios dentro  ' })
    expect((await db.observaciones.get(o.id))?.texto).toBe('Con dos  espacios dentro')
  })

  it('sella `actualizadoEn` sin tocar la fecha de registro', async () => {
    const o = await observacion('Sin tocar')
    expect(o.actualizadoEn).toBeUndefined()

    await editarObservacion(o.id, { texto: 'Tocada' }, 1_700_000_000_000)
    const tras = await db.observaciones.get(o.id)
    expect(tras?.actualizadoEn).toBe(1_700_000_000_000)
    expect(tras?.fecha).toBe('2026-09-08')
  })

  it('la edición no crea un registro nuevo ni cambia el id', async () => {
    const o = await observacion('Una')
    await editarObservacion(o.id, { texto: 'Una, editada' })
    expect(await db.observaciones.count()).toBe(1)
    expect((await db.observaciones.get(o.id))?.id).toBe(o.id)
  })
})

describe('cambiar el signo recalcula los balances', () => {
  it('de positiva a negativa mueve el contador de un lado al otro', async () => {
    const o = await observacion('Cambia de signo', '+')
    await observacion('Otra positiva', '+')

    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 2, negativos: 0 }]]),
    )

    await editarObservacion(o.id, { signo: '-' })
    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 1, negativos: 1 }]]),
    )
  })

  it('pasar a neutra la saca del balance: las neutras no computan', async () => {
    const o = await observacion('Pasa a neutra', '+')
    await observacion('Negativa', '-')

    await editarObservacion(o.id, { signo: 'neutro' })
    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 0, negativos: 1 }]]),
    )
    // Sigue existiendo: no computar no es desaparecer.
    expect((await db.observaciones.get(o.id))?.signo).toBe('neutro')
  })

  it('de neutra a positiva la mete en el balance', async () => {
    const o = await observacion('Nace neutra', 'neutro')
    // El alumno aparece en el mapa —tiene observaciones—, pero a cero: una
    // neutra no suma a ningún lado.
    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 0, negativos: 0 }]]),
    )

    await editarObservacion(o.id, { signo: '+' })
    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 1, negativos: 0 }]]),
    )
  })

  it('cambiar la categoría no toca el balance: el signo es otra cosa', async () => {
    const o = await observacion('Categoría', '+')
    await editarObservacion(o.id, { tipo: 'salud' })

    expect((await db.observaciones.get(o.id))?.tipo).toBe('salud')
    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 1, negativos: 0 }]]),
    )
  })
})

describe('cancelar revierte', () => {
  it('deshacer repone el texto anterior y la marca de tiempo que tenía', async () => {
    const o = await observacion('Original')
    await editarObservacion(o.id, { texto: 'Primera edición' }, 1_000)
    const { deshacer } = await editarObservacion(o.id, { texto: 'Segunda edición' }, 2_000)

    await deshacer()
    const tras = await db.observaciones.get(o.id)
    expect(tras?.texto).toBe('Primera edición')
    expect(tras?.actualizadoEn).toBe(1_000)
  })

  it('deshacer un cambio de signo devuelve el balance a como estaba', async () => {
    const o = await observacion('Vuelve', '+')
    const { deshacer } = await editarObservacion(o.id, { signo: '-' })

    await deshacer()
    expect((await db.observaciones.get(o.id))?.signo).toBe('+')
    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 1, negativos: 0 }]]),
    )
  })

  it('deshacer sobre una recién creada le quita `actualizadoEn`', async () => {
    const o = await observacion('Nunca tocada')
    const { deshacer } = await editarObservacion(o.id, { texto: 'Tocada' })
    await deshacer()
    expect((await db.observaciones.get(o.id))?.actualizadoEn).toBeUndefined()
  })
})

describe('eliminar', () => {
  it('no toca las demás observaciones del alumno', async () => {
    const uno = await observacion('Primera')
    const dos = await observacion('Segunda')
    const tres = await observacion('Tercera')

    await eliminarObservacion(dos.id)

    const quedan = await db.observaciones.where('alumnoId').equals(ALUMNO_ID).toArray()
    expect(quedan.map((o) => o.id).sort()).toEqual([uno.id, tres.id].sort())
    expect(quedan.map((o) => o.texto).sort()).toEqual(['Primera', 'Tercera'])
  })

  it('no toca las de otro alumno del mismo grupo', async () => {
    const mia = await observacion('Mía')
    await observacion('Del otro', '+', OTRO_ALUMNO)

    await eliminarObservacion(mia.id)
    const delOtro = await db.observaciones.where('alumnoId').equals(OTRO_ALUMNO).toArray()
    expect(delOtro).toHaveLength(1)
    expect(delOtro[0].texto).toBe('Del otro')
  })

  it('deshacer la repone entera, con su id', async () => {
    const o = await observacion('Se borra y vuelve', '-')
    const { deshacer } = await eliminarObservacion(o.id)
    expect(await db.observaciones.get(o.id)).toBeUndefined()

    await deshacer()
    expect(await db.observaciones.get(o.id)).toEqual(o)
  })

  it('quita del balance lo que la observación aportaba', async () => {
    const o = await observacion('Positiva', '+')
    await observacion('Negativa', '-')

    await eliminarObservacion(o.id)
    expect(await contadoresPorAlumno(GRUPO_ID)).toEqual(
      new Map([[ALUMNO_ID, { positivos: 0, negativos: 1 }]]),
    )
  })
})

describe('errores', () => {
  it('editar o eliminar una observación que ya no existe lo dice', async () => {
    await expect(editarObservacion('fantasma', { texto: 'x' })).rejects.toThrow(/ya no existe/)
    await expect(eliminarObservacion('fantasma')).rejects.toThrow(/ya no existe/)
  })
})
