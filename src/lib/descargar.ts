/**
 * Descarga de ficheros al dispositivo (§9 M9, informes §M7).
 *
 * Un `<a download>` sin insertar en el DOM funciona en Chrome/Firefox de
 * escritorio, pero es el patrón que Android WebView/Chrome descarta en
 * silencio (sin lanzar error) cuando el navegador considera que ya no hay
 * gesto de usuario activo — algo especialmente probable aquí porque el
 * cifrado del backup (PBKDF2 600k) tarda segundos y puede agotar esa ventana
 * antes de llegar al `.click()`. `descargarArchivo` evita ambos fallos:
 * ancla insertada en el DOM y revocación diferida (no en el mismo tick).
 */

export function crearDescarga(
  datos: BlobPart,
  nombre: string,
  tipo: string,
): { url: string; nombre: string; revocar: () => void } {
  const blob = new Blob([datos], { type: tipo })
  const url = URL.createObjectURL(blob)
  return { url, nombre, revocar: () => URL.revokeObjectURL(url) }
}

export function descargarArchivo(datos: BlobPart, nombre: string, tipo: string): void {
  const { url, revocar } = crearDescarga(datos, nombre, tipo)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Revocar en el mismo tick puede cancelar una descarga que el navegador
  // todavía no ha empezado a leer; un segundo de margen es gratis.
  window.setTimeout(revocar, 1000)
}

/** `crypto.subtle` falta en contextos no seguros (http:// que no sea localhost). */
export function soportaCryptoSubtle(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}
