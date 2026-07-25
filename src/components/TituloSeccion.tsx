import type { ReactNode } from 'react'

/**
 * Encabezado de sección (h2) + la firma visual de «doble línea de pista»
 * (§3.2), en un solo sitio. Antes cada página escribía el h2 y la línea a
 * mano, con tamaños y márgenes que iban divergiendo entre pantallas.
 */
export function TituloSeccion({ children }: { children: ReactNode }) {
  return (
    <>
      <h2 className="text-lg font-bold">{children}</h2>
      <div className="linea-pista mb-2 mt-1.5" aria-hidden />
    </>
  )
}
