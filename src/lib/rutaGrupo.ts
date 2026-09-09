import type { Grupo } from '../db/types'
import { INFANTIL_HABILITADO } from './etapas'
import { segmentos } from './router'

/**
 * Cambiar de grupo SIN salir de la pantalla en la que estás.
 *
 * El maestro lleva nueve grupos y compara constantemente: mira el listado de 4ºA
 * y quiere el de 4ºB. Hasta ahora eso eran tres toques —atrás, elegir grupo,
 * entrar—; con el desplegable de la cabecera es uno.
 *
 * Módulo puro, sin React ni Dexie, para poder probar la única parte que tiene
 * miga: qué ruta sale de combinar «dónde estoy» con «a qué grupo voy».
 *
 * ——— LAS DOS REGLAS ———
 *
 *  1. Se conserva la SUBPANTALLA. Del listado de alumnado de un grupo se pasa al
 *     listado de alumnado del otro, no a su portada.
 *  2. Si esa subpantalla no aplica al grupo nuevo —el Cuaderno no existe en
 *     Infantil (§6)—, se cae en la ficha del grupo. Sin error y sin pantalla en
 *     blanco: el destino siempre existe.
 *
 * Y una tercera que no es de aquí pero va con esto: quien navegue tiene que
 * usar `reemplazarRuta`, no `navegar`. Cambiar de grupo es un movimiento
 * LATERAL, no un paso adelante; si se apilara, «Atrás» iría devolviendo por los
 * grupos que se han ido mirando en vez de salir al listado, que es de donde se
 * entró.
 */

/**
 * Las secciones cuya ruta es `/<seccion>/<grupoId>[/...]`.
 *
 * `admite` decide si esa sección existe para un grupo dado. `conservaResto`
 * dice si lo que va detrás del id sigue teniendo sentido con otro grupo: casi
 * nunca, porque son fechas, franjas horarias y sesiones de ESE grupo.
 */
const SECCIONES: Record<string, { admite: (g: Grupo) => boolean }> = {
  grupos: { admite: () => true },
  asistencia: { admite: () => true },
  equipos: { admite: () => true },
  observaciones: { admite: () => true },
  // El Cuaderno es de Primaria: Infantil evalúa cualitativamente en su propia
  // pantalla, y esa barrera de etapa es una regla dura del proyecto.
  cuaderno: { admite: (g) => g.etapa !== 'infantil' },
  infantil: { admite: (g) => g.etapa === 'infantil' && INFANTIL_HABILITADO },
}

/** La ruta a la que lleva la ficha de un grupo: el destino que siempre existe. */
export function rutaPrincipalDe(grupo: Grupo): string {
  return `/grupos/${grupo.id}`
}

/**
 * La ruta equivalente en otro grupo. Si no la hay, su ficha.
 *
 * Se queda con la sección y el id, y TIRA lo que venga detrás: la fecha y la
 * franja de un pase de lista, o la sesión de un generador de equipos, son del
 * grupo del que se viene y no significan nada en el nuevo. Arrastrarlas abriría
 * la pantalla en un día en el que ese grupo no tiene clase.
 */
export function rutaEnOtroGrupo(rutaActual: string, grupo: Grupo): string {
  const [seccion] = segmentos(rutaActual)
  const config = seccion ? SECCIONES[seccion] : undefined
  if (!config || !config.admite(grupo)) return rutaPrincipalDe(grupo)
  return `/${seccion}/${grupo.id}`
}

/** Si esa ruta es de las que llevan un grupo dentro y admiten el desplegable. */
export function esRutaDeGrupo(rutaActual: string): boolean {
  const [seccion, param] = segmentos(rutaActual)
  return !!seccion && !!param && seccion in SECCIONES
}
