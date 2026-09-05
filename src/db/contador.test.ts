import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  borrarValor,
  calcularColumna,
  crearColumna,
  guardarValor,
  mediaDe,
  valorNormalizado,
  valorReferenciable,
  valoresDe,
} from './cuaderno'
import { califica, notaUd } from '../lib/notas'
import type { Columna, Rubrica, UnidadCalificable, ValorCelda } from './types'

/**
 * Columna de tipo CONTADOR (§ M5). Lo que se protege aquí no es el número, es
 * la distinción entre VACÍO y CERO: vacío significa «no lo he usado» y cero,
 * «sumé y resté lo mismo». Confundirlos falsearía cualquier media.
 */

const GRUPO = 'g1'
const ALUMNO = 'a1'
const SIN_RUBRICAS = new Map<string, Rubrica>()

/** Paso de la interacción real: pulsar + o − sobre lo que haya (o sobre nada). */
async function pulsar(columnaId: string, signo: 1 | -1, paso = 1) {
  const previo = await db.valores
    .where('[columnaId+alumnoId]')
    .equals([columnaId, ALUMNO])
    .first()
  await guardarValor(columnaId, ALUMNO, { contador: (previo?.contador ?? 0) + signo * paso })
}

async function leer(columnaId: string): Promise<ValorCelda | undefined> {
  return db.valores.where('[columnaId+alumnoId]').equals([columnaId, ALUMNO]).first()
}

beforeEach(async () => {
  await db.grupos.put({
    id: GRUPO,
    cursoEscolarId: 'c1',
    nombre: '3ºA',
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

describe('celda de contador', () => {
  it('una celda nueva está vacía: no hay fila, y no es un 0', async () => {
    const id = await crearColumna({ grupoId: GRUPO, trimestre: 1, titulo: 'Material', tipo: 'contador' })

    expect(await leer(id)).toBeUndefined()
    const valores = await valoresDe([id])
    expect(valores.get(`${id}|${ALUMNO}`)).toBeUndefined()
  })

  it('el primer + sobre una celda vacía la deja en 1', async () => {
    const id = await crearColumna({ grupoId: GRUPO, trimestre: 1, titulo: 'Material', tipo: 'contador' })
    await pulsar(id, 1)
    expect((await leer(id))?.contador).toBe(1)
  })

  it('el primer − sobre una celda vacía la deja en −1', async () => {
    const id = await crearColumna({ grupoId: GRUPO, trimestre: 1, titulo: 'Material', tipo: 'contador' })
    await pulsar(id, -1)
    expect((await leer(id))?.contador).toBe(-1)
  })

  it('borrar devuelve la celda a vacío, no a 0', async () => {
    const id = await crearColumna({ grupoId: GRUPO, trimestre: 1, titulo: 'Material', tipo: 'contador' })
    await pulsar(id, 1)
    await pulsar(id, 1)
    expect((await leer(id))?.contador).toBe(2)

    await borrarValor(id, ALUMNO)

    const tras = await leer(id)
    expect(tras).toBeUndefined()
    // La distinción que da sentido al tipo: borrado NO es cero.
    expect(tras?.contador).not.toBe(0)
  })

  it('deshacer el borrado devuelve el número que había', async () => {
    const id = await crearColumna({ grupoId: GRUPO, trimestre: 1, titulo: 'Material', tipo: 'contador' })
    await pulsar(id, -1)
    await pulsar(id, -1)

    const deshacer = await borrarValor(id, ALUMNO)
    await deshacer()

    expect((await leer(id))?.contador).toBe(-2)
  })

  it('un 0 alcanzado sumando y restando SÍ existe como registro', async () => {
    const id = await crearColumna({ grupoId: GRUPO, trimestre: 1, titulo: 'Material', tipo: 'contador' })
    await pulsar(id, 1)
    await pulsar(id, -1)

    const v = await leer(id)
    expect(v).toBeDefined()
    expect(v?.contador).toBe(0)
  })

  it('no tiene tope: crece y baja sin límite, con el paso configurado', async () => {
    const id = await crearColumna({
      grupoId: GRUPO,
      trimestre: 1,
      titulo: 'Puntos',
      tipo: 'contador',
      paso: 5,
    })
    expect((await db.columnas.get(id))?.paso).toBe(5)

    for (let i = 0; i < 40; i++) await pulsar(id, 1, 5)
    expect((await leer(id))?.contador).toBe(200)

    for (let i = 0; i < 100; i++) await pulsar(id, -1, 5)
    expect((await leer(id))?.contador).toBe(-300)
  })
})

describe('el contador en el motor de cálculo', () => {
  const columna = (parcial: Partial<Columna> & Pick<Columna, 'id' | 'tipo'>): Columna =>
    ({ grupoId: GRUPO, trimestre: 1, titulo: parcial.id, orden: 0, pesoUd: 0, ...parcial }) as Columna

  const valor = (columnaId: string, campos: Partial<ValorCelda>): ValorCelda => ({
    id: `${columnaId}-${ALUMNO}`,
    columnaId,
    alumnoId: ALUMNO,
    actualizado: 0,
    ...campos,
  })

  const mapa = (...vs: ValorCelda[]) => new Map(vs.map((v) => [`${v.columnaId}|${v.alumnoId}`, v]))

  it('no se normaliza a 0–10: fuera de toda media por defecto', () => {
    const cont = columna({ id: 'cont', tipo: 'contador' })
    expect(valorNormalizado(cont, valor('cont', { contador: 7 }))).toBeNull()
  })

  it('sí está disponible como valor referenciable, con su número tal cual', () => {
    const cont = columna({ id: 'cont', tipo: 'contador' })
    expect(valorReferenciable(cont, valor('cont', { contador: 7 }))).toBe(7)
    expect(valorReferenciable(cont, valor('cont', { contador: -3 }))).toBe(-3)
  })

  it('una celda vacía es ausencia de dato, nunca un 0', () => {
    const cont = columna({ id: 'cont', tipo: 'contador' })
    // Sin registro.
    expect(valorReferenciable(cont, undefined)).toBeNull()
    // Registro sin el campo (p. ej. la fila la creó otra cosa).
    expect(valorReferenciable(cont, valor('cont', {}))).toBeNull()
    // Y un 0 real sí es un dato.
    expect(valorReferenciable(cont, valor('cont', { contador: 0 }))).toBe(0)
  })

  it('una celda vacía no entra en la fórmula ni la arrastra a la baja', () => {
    const num = columna({ id: 'n', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const cont = columna({ id: 'cont', tipo: 'contador' })
    const calc = columna({
      id: 'calc',
      tipo: 'calculo',
      calculo: {
        componentes: [
          { columnaId: 'n', pesoPct: 50 },
          { columnaId: 'cont', pesoPct: 50 },
        ],
      },
    })
    const cols = new Map([num, cont, calc].map((c) => [c.id, c]))

    // Contador vacío: el peso se renormaliza sobre el número, que vale 8.
    const sinContador = calcularColumna(calc, cols, mapa(valor('n', { numero: 8 })), ALUMNO, SIN_RUBRICAS)
    expect(sinContador.valor).toBe(8)
    expect(sinContador.contadas).toBe(1)
    expect(sinContador.total).toBe(2)

    // Si el vacío contase como 0, la media sería 4. No lo hace.
    expect(sinContador.valor).not.toBe(4)

    // Con un 0 explícito sí entra y la media baja: son estados distintos.
    const conCero = calcularColumna(
      calc,
      cols,
      mapa(valor('n', { numero: 8 }), valor('cont', { contador: 0 })),
      ALUMNO,
      SIN_RUBRICAS,
    )
    expect(conCero.valor).toBe(4)
    expect(conCero.contadas).toBe(2)
  })

  it('referenciado a mano, entra con su número', () => {
    const cont = columna({ id: 'cont', tipo: 'contador' })
    const calc = columna({
      id: 'calc',
      tipo: 'calculo',
      calculo: { componentes: [{ columnaId: 'cont', pesoPct: 100 }] },
    })
    const cols = new Map([cont, calc].map((c) => [c.id, c]))

    const res = calcularColumna(calc, cols, mapa(valor('cont', { contador: 6 })), ALUMNO, SIN_RUBRICAS)
    expect(res.valor).toBe(6)
  })

  it('no altera la media del cuaderno si no se referencia', () => {
    const num = columna({ id: 'n', tipo: 'numero', escala: { min: 0, max: 10, decimales: 1 } })
    const cont = columna({ id: 'cont', tipo: 'contador' })
    const valores = mapa(valor('n', { numero: 8 }), valor('cont', { contador: 25 }))

    const soloNota = mediaDe([num], valores, ALUMNO, SIN_RUBRICAS)
    const conContador = mediaDe([num, cont], valores, ALUMNO, SIN_RUBRICAS)

    expect(conContador.media).toBe(soloNota.media)
    expect(conContador.contadas).toBe(1)
  })

  it('no entra en la nota de la unidad aunque tenga peso asignado', () => {
    const num = columna({
      id: 'n',
      tipo: 'numero',
      escala: { min: 0, max: 10, decimales: 1 },
      udId: 'u1',
      pesoUd: 50,
    })
    const cont = columna({ id: 'cont', tipo: 'contador', udId: 'u1', pesoUd: 50 })
    const valores = mapa(valor('n', { numero: 8 }), valor('cont', { contador: 25 }))

    // La puerta del motor de la Orden 130: el contador no califica.
    expect(califica(num)).toBe(true)
    expect(califica(cont)).toBe(false)

    const res = notaUd(
      {
        unidad: { id: 'u1', titulo: 'UD 1', nivel: 3, pesoTrimestre: 100 } as UnidadCalificable,
        instrumentos: [
          {
            columna: num,
            filas: [
              { id: 'f1', columnaId: 'n', orden: 0, descriptor: 'Nota', criterioId: null, pesoFila: null },
            ],
          },
          {
            columna: cont,
            filas: [
              {
                id: 'f2',
                columnaId: 'cont',
                orden: 0,
                descriptor: 'Material',
                criterioId: null,
                pesoFila: null,
              },
            ],
          },
        ],
      },
      (columnaId) => valores.get(`${columnaId}|${ALUMNO}`),
      valorNormalizado,
    )

    // Solo la nota numérica: el contador es un registro de aula, con peso o sin él.
    expect(res.valor).toBe(8)
    expect(res.log.some((r) => r.motivo === 'tipo_no_califica')).toBe(true)
  })
})
