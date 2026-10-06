import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { datosEjemplo, ID_ALUMNO, ID_GRUPO } from '../test/datosEjemplo'
import { exportarBackup, restaurarBackup } from './backup'
import { borrarValor, eliminarColumna, guardarValor } from './cuaderno'
import { db } from './db'
import { calificarGrupo } from './notas'
import { borrarNota, guardarNota, notasDeColumnas } from './notasCelda'

/** Notas de celda del Cuaderno (`NotaCelda`, esquema v26). */

async function vaciarBase() {
  await db.transaction('rw', db.tables, async () => {
    for (const tabla of db.tables) await tabla.clear()
  })
}

async function sembrar() {
  const datos = datosEjemplo()
  await db.transaction('rw', db.tables, async () => {
    for (const tabla of db.tables) {
      const filas = datos[tabla.name]
      if (filas?.length) await tabla.bulkAdd(filas as never[])
    }
  })
}

beforeEach(async () => {
  await vaciarBase()
  await sembrar()
  await db.notasCelda.clear()
})
afterEach(vaciarBase)

const nota = () => db.notasCelda.get(['col-1', ID_ALUMNO])

describe('crear, editar y borrar', () => {
  it('crea la nota, la edita y al vaciar el texto elimina el registro', async () => {
    await guardarNota('col-1', ID_ALUMNO, '  Repetir el giro  ')
    expect((await nota())?.texto).toBe('Repetir el giro')

    await guardarNota('col-1', ID_ALUMNO, 'Ya lo hace bien')
    expect((await nota())?.texto).toBe('Ya lo hace bien')
    expect(await db.notasCelda.count()).toBe(1)

    // Sin nota NO hay fila: nunca una cadena vacía.
    await guardarNota('col-1', ID_ALUMNO, '   ')
    expect(await nota()).toBeUndefined()
    expect(await db.notasCelda.count()).toBe(0)
  })

  it('borrarNota quita el registro y el deshacer lo devuelve tal cual', async () => {
    await guardarNota('col-1', ID_ALUMNO, 'Lesionado ese día')
    const deshacer = await borrarNota('col-1', ID_ALUMNO)
    expect(await nota()).toBeUndefined()
    await deshacer()
    expect((await nota())?.texto).toBe('Lesionado ese día')
  })

  it('el deshacer de una nota nueva la quita, no la deja vacía', async () => {
    const deshacer = await guardarNota('col-1', ID_ALUMNO, 'Nueva')
    await deshacer()
    expect(await db.notasCelda.count()).toBe(0)
  })

  it('notasDeColumnas las indexa por celda, como los valores de la rejilla', async () => {
    await guardarNota('col-1', ID_ALUMNO, 'Una')
    const mapa = await notasDeColumnas(['col-1', 'col-2'])
    expect([...mapa.keys()]).toEqual([`col-1|${ID_ALUMNO}`])
  })
})

describe('independiente del valor', () => {
  it('puede haber nota en una celda sin valor', async () => {
    await guardarNota('col-2', ID_ALUMNO, 'Sin nota todavía')
    expect(await db.valores.where('[columnaId+alumnoId]').equals(['col-2', ID_ALUMNO]).count()).toBe(0)
    expect((await db.notasCelda.get(['col-2', ID_ALUMNO]))?.texto).toBe('Sin nota todavía')
  })

  it('borrar el valor no borra la nota, ni al revés', async () => {
    await guardarNota('col-1', ID_ALUMNO, 'Ojo con el giro')
    await borrarValor('col-1', ID_ALUMNO)
    expect((await nota())?.texto).toBe('Ojo con el giro')

    await guardarValor('col-1', ID_ALUMNO, { numero: 7 })
    await borrarNota('col-1', ID_ALUMNO)
    const valor = await db.valores.where('[columnaId+alumnoId]').equals(['col-1', ID_ALUMNO]).first()
    expect(valor?.numero).toBe(7)
  })
})

describe('no afecta a ningún cálculo', () => {
  it('la nota trimestral y las columnas de cálculo salen idénticas con y sin notas', async () => {
    const sin = await calificarGrupo(ID_GRUPO, 1)
    await guardarNota('col-1', ID_ALUMNO, '10')
    await guardarNota('col-2', ID_ALUMNO, '0')
    const con = await calificarGrupo(ID_GRUPO, 1)
    expect(con).toEqual(sin)
  })
})

describe('borrado en cascada', () => {
  it('eliminar la columna se lleva sus notas, y el deshacer las devuelve', async () => {
    await guardarNota('col-1', ID_ALUMNO, 'Repetir')
    const deshacer = await eliminarColumna('col-1')
    expect(await db.notasCelda.count()).toBe(0)
    await deshacer()
    expect((await nota())?.texto).toBe('Repetir')
  })
})

describe('copia cifrada', () => {
  it('sobrevive a exportar cifrado → importar', async () => {
    await guardarNota('col-1', ID_ALUMNO, 'Va en la copia')
    const { fichero, cabecera } = await exportarBackup('pista-mojada-2026')
    expect(cabecera.registros.notasCelda).toBe(1)

    await vaciarBase()
    await restaurarBackup(fichero, 'pista-mojada-2026')
    expect((await nota())?.texto).toBe('Va en la copia')
  })
})
