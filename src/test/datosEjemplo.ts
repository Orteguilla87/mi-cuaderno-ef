/**
 * Juego de datos de ejemplo con las 24 tablas pobladas, incluidos los campos
 * sensibles (`apoyos`, `notasPrivadas`, `nivelMotriz`) que solo viajan en el
 * backup cifrado. Lo usan los tests de M9.
 *
 * Solo se importa desde tests: no forma parte del bundle.
 */

import type { Tablas } from '../lib/backup'

export const ID_CURSO = 'curso-1'
export const ID_GRUPO = 'grupo-1'
export const ID_ALUMNO = 'alumno-1'

export function datosEjemplo(): Tablas {
  return {
    cursos: [
      {
        id: ID_CURSO,
        nombre: '2026-2027',
        activo: true,
        inicio: '2026-09-01',
        fin: '2027-06-30',
        trimestres: [
          { n: 1, inicio: '2026-09-07', fin: '2026-12-22' },
          { n: 2, inicio: '2027-01-08', fin: '2027-03-26' },
          { n: 3, inicio: '2027-04-06', fin: '2027-06-19' },
        ],
        festivos: ['2026-12-08', '2027-05-02'],
      },
    ],
    grupos: [
      {
        id: ID_GRUPO,
        cursoEscolarId: ID_CURSO,
        nombre: '3ºB',
        etapa: 'primaria',
        nivel: 3,
        color: '#006A80',
        orden: 1,
        horario: [
          { diaSemana: 1, horaInicio: '09:00', horaFin: '09:45' },
          { diaSemana: 3, horaInicio: '11:30', horaFin: '12:15' },
        ],
      },
      {
        id: 'grupo-2',
        cursoEscolarId: ID_CURSO,
        nombre: 'Infantil 4A',
        etapa: 'infantil',
        nivel: 4,
        color: '#9AC3CC',
        orden: 2,
        horario: [{ diaSemana: 2, horaInicio: '10:00', horaFin: '10:45' }],
      },
    ],
    alumnos: [
      {
        id: ID_ALUMNO,
        grupoId: ID_GRUPO,
        nombre: 'Lucía',
        apellidos: 'Ramírez Ortega',
        alias: 'Lucía R.',
        activo: true,
        // Los tres campos sensibles: deben sobrevivir intactos al backup.
        apoyos: 'Necesita instrucción corta y apoyo visual al explicar el juego.',
        notasPrivadas: 'Se agobia si pierde; conviene rotar los roles.',
        genero: 'chica',
        nivelMotriz: 4,
      },
      {
        id: 'alumno-2',
        grupoId: ID_GRUPO,
        nombre: 'Óscar',
        apellidos: 'Núñez Gil',
        alias: 'Óscar N.',
        activo: true,
        genero: 'chico',
        nivelMotriz: 2,
      },
      {
        id: 'alumno-3',
        grupoId: 'grupo-2',
        nombre: 'Ana',
        apellidos: 'Pérez Sanz',
        alias: 'Ana P.',
        activo: false,
      },
    ],
    asistencias: [
      {
        id: 'asis-1',
        alumnoId: ID_ALUMNO,
        fecha: '2026-09-14',
        estado: 'presente',
        chandal: true,
      },
      {
        id: 'asis-2',
        alumnoId: 'alumno-2',
        fecha: '2026-09-14',
        estado: 'retraso',
        chandal: false,
        observacion: 'Llegó del médico.',
      },
    ],
    sesiones: [
      {
        id: 'sesion-1',
        grupoId: ID_GRUPO,
        fecha: '2026-09-14',
        titulo: 'Desplazamientos y giros',
        udId: 'ud-1',
        juegos: [{ gameId: 'j-1', nombre: 'El pilla-pilla de las cuatro esquinas' }],
        notas: 'Calentamiento en círculo. Vigilar los apoyos al girar.',
        valoracion: 4,
        recursos: [{ tipo: 'nota', valor: 'Sacar 12 conos y 4 aros.' }],
        recursosNecesarios: '12 conos, 4 aros',
      },
    ],
    observaciones: [
      {
        id: 'obs-1',
        alumnoId: ID_ALUMNO,
        grupoId: ID_GRUPO,
        fecha: '2026-09-14',
        tipo: 'conducta',
        signo: '+',
        texto: 'Ayuda a recoger sin que se lo pidan.',
        tags: ['ayuda a otros'],
      },
    ],
    unidades: [
      {
        id: 'ud-1',
        nivel: 3,
        trimestre: 1,
        titulo: 'Nos movemos por el espacio',
        criterios: ['EF.2C.1.1'],
        computa: true,
        pesoTrimestre: 100,
      },
    ],
    instrumentos: [
      {
        id: 'inst-1',
        udId: 'ud-1',
        tipo: 'lista_control',
        items: [{ id: 'it-1', descripcion: 'Gira sin perder el equilibrio', criterioCodigo: '1.1', pesoPct: 100 }],
        escala: { min: 0, max: 10 },
      },
    ],
    calificaciones: [
      {
        id: 'cal-1',
        alumnoId: ID_ALUMNO,
        instrumentoId: 'inst-1',
        itemId: 'it-1',
        valor: 8,
        trimestre: 1,
        fecha: '2026-10-05',
      },
    ],
    evalTrimestrales: [
      {
        id: 'evt-1',
        alumnoId: ID_ALUMNO,
        trimestre: 1,
        notaCalculada: 7.8,
        calificacionOficial: 'NT',
        comentario: 'Progresa bien en coordinación.',
        cerrado: false,
      },
    ],
    evalFinales: [
      {
        id: 'evf-1',
        alumnoId: ID_ALUMNO,
        notaCalculada: 8.1,
        notaDocente: 8.5,
        calificacionOficial: 'NT',
        comentario: 'Curso muy regular.',
      },
    ],
    registrosInfantil: [
      {
        id: 'ri-1',
        alumnoId: 'alumno-3',
        criterioCodigo: 'INF:I.1.1',
        momento: 1,
        nivel: 'en_proceso',
        observacion: 'Le cuesta el equilibrio a la pata coja.',
      },
    ],
    informesInfantil: [
      {
        id: 'ii-1',
        alumnoId: 'alumno-3',
        trimestre: 1,
        comentario: 'Disfruta con el material y participa.',
      },
    ],
    comentarios: [
      { id: 'com-1', texto: '{nombre} ha mejorado su coordinación.', categoria: 'progreso', etapa: 'primaria' },
    ],
    juegos: [
      {
        id: 'j-1',
        nombre: 'El pilla-pilla de las cuatro esquinas',
        descripcion: 'Cuatro casas y un cazador en el centro.',
        material: ['conos'],
        etiquetas: ['calentamiento', 'carrera'],
        extra: { origen: 'banco propio' },
      },
    ],
    plantillas: [
      {
        id: 'pl-1',
        tipo: 'sesion',
        titulo: 'Sesión tipo de calentamiento + juego + vuelta a la calma',
        etapa: 'primaria',
        juegos: [],
        notas: 'Esqueleto reutilizable.',
        recursos: [],
      },
    ],
    columnas: [
      {
        id: 'col-1',
        grupoId: ID_GRUPO,
        trimestre: 1,
        titulo: 'Giros',
        tipo: 'numero',
        orden: 1,
        udId: 'ud-1',
        escala: { min: 0, max: 10, decimales: 1 },
      },
      {
        id: 'col-2',
        grupoId: ID_GRUPO,
        trimestre: 1,
        titulo: 'Media de la unidad',
        tipo: 'calculo',
        orden: 2,
        calculo: { componentes: [{ columnaId: 'col-1', pesoPct: 100 }] },
      },
    ],
    rubricas: [
      {
        id: 'rub-1',
        titulo: 'Participación',
        etapa: 'primaria',
        niveles: [
          { id: 'n-1', etiqueta: 'Iniciado', valor: 1 },
          { id: 'n-2', etiqueta: 'Conseguido', valor: 3 },
        ],
        criterios: [{ id: 'cr-1', titulo: 'Se implica en el juego', pesoPct: 100 }],
      },
    ],
    valores: [
      { id: 'val-1', columnaId: 'col-1', alumnoId: ID_ALUMNO, numero: 8, actualizado: 1_790_000_000_000 },
    ],
    criterios: [
      {
        id: 'EF.2C.1.1',
        codigo: '1.1',
        etapa: 'primaria',
        competenciaCodigo: 'CE1',
        competenciaTexto: 'PENDIENTE',
        texto: 'PENDIENTE',
        ciclo: 2,
        cursos: [3, 4],
      },
    ],
    vinculos: [
      { id: 'vin-1', grupoId: ID_GRUPO, alumnoA: ID_ALUMNO, alumnoB: 'alumno-2', tipo: 'separar' },
    ],
    equipos: [
      {
        id: 'eq-1',
        grupoId: ID_GRUPO,
        nombre: 'Equipos del 14/09',
        fecha: '2026-09-14',
        config: {
          modo: 'heterogeneo',
          soloPresentes: true,
          equilibrarGenero: true,
          respetarVinculos: true,
          repartirApoyos: true,
          priorizarNuevos: false,
        },
        equipos: [{ nombre: 'Rojo', color: '#CE184B', miembros: [ID_ALUMNO] }],
      },
    ],
    config: [
      {
        id: 'config',
        pesosTrimestres: [30, 30, 40],
        modoMedia: 'ponderada',
        bandasOficiales: { SU: 5, BI: 6, NT: 7, SB: 9 },
        quickTagsObservacion: ['esfuerzo', 'material'],
        coloresPetos: ['#CE184B', '#006A80', '#B48C00', '#ABB200'],
        modeloAgente: 'claude-haiku-4-5-20251001',
        modoPista: false,
        tema: 'sistema',
      },
    ],
    accionesAgente: [
      {
        id: 'acc-1',
        timestamp: 1_790_000_000_000,
        transcripcion: 'A17 ha ayudado a recoger',
        accion: 'registrar_observacion',
        payload: { alumno: 'A17', signo: '+' },
        estado: 'aplicada',
      },
    ],
  }
}
