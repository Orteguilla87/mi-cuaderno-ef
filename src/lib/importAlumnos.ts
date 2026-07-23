/**
 * Parser de importación de alumnado (M1).
 * Acepta una línea por alumno, en cualquiera de estos formatos:
 *   - "Apellido1 Apellido2, Nombre"   (formato de listado oficial)
 *   - "Nombre Apellido1 Apellido2"
 *   - CSV: "apellidos;nombre" o "apellidos,nombre" (también con tabulador)
 * Una cabecera tipo "nombre,apellidos" se detecta y se ignora.
 */

export interface AlumnoImportado {
  nombre: string
  apellidos: string
}

const SEPARADORES = [';', '\t']

function limpiar(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function esCabecera(linea: string): boolean {
  const l = linea.toLowerCase()
  return /\bapellidos?\b/.test(l) && /\bnombre\b/.test(l)
}

function partirLinea(linea: string): AlumnoImportado | null {
  const texto = limpiar(linea.replace(/^\d+[.)]\s*/, '')) // quita "1. " del listado
  if (!texto) return null

  for (const sep of SEPARADORES) {
    if (texto.includes(sep)) {
      const [a, b = ''] = texto.split(sep)
      return { apellidos: limpiar(a), nombre: limpiar(b) }
    }
  }

  // La coma en un listado escolar separa apellidos de nombre: "García López, Ana"
  if (texto.includes(',')) {
    const [a, b = ''] = texto.split(',')
    return { apellidos: limpiar(a), nombre: limpiar(b) }
  }

  // Sin separador: la primera palabra es el nombre, el resto apellidos.
  const partes = texto.split(' ')
  if (partes.length === 1) return { nombre: partes[0], apellidos: '' }
  return { nombre: partes[0], apellidos: partes.slice(1).join(' ') }
}

export function parsearAlumnos(entrada: string): AlumnoImportado[] {
  const resultado: AlumnoImportado[] = []
  const vistos = new Set<string>()

  for (const linea of entrada.split(/\r?\n/)) {
    if (!linea.trim() || esCabecera(linea)) continue
    const alumno = partirLinea(linea)
    if (!alumno || (!alumno.nombre && !alumno.apellidos)) continue

    const clave = `${alumno.nombre}|${alumno.apellidos}`.toLowerCase()
    if (vistos.has(clave)) continue // el pegado desde listados duplica con frecuencia
    vistos.add(clave)
    resultado.push(alumno)
  }

  return resultado
}

/** Alias por defecto: nombre + inicial del primer apellido ("Ana G."). */
export function aliasPorDefecto({ nombre, apellidos }: AlumnoImportado): string {
  const inicial = apellidos.trim().charAt(0)
  return inicial ? `${nombre} ${inicial.toUpperCase()}.` : nombre
}
