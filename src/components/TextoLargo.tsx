/**
 * Texto libre (planificación, comentarios) tal como se escribió: saltos de
 * párrafo y guiones incluidos. `whitespace-pre-wrap` conserva los saltos de
 * línea del `<textarea>` de origen y sigue envolviendo el texto largo — sin
 * tocar la cadena (nada de `replace` a `<br>`), así que no hay HTML que
 * inyectar ni que sanear.
 */
export function TextoLargo({ texto, className = '' }: { texto: string; className?: string }) {
  return <span className={`whitespace-pre-wrap ${className}`}>{texto}</span>
}
