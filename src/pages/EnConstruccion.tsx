import { Cabecera } from '../components/Cabecera'

/** Pestañas cuyo módulo llega en fases posteriores (§8). */
export function EnConstruccion({
  titulo,
  fase,
  atras = false,
}: {
  titulo: string
  fase: string
  /** Las pantallas que cuelgan de «Más» no son pestaña: hay que poder volver. */
  atras?: boolean
}) {
  return (
    <>
      <Cabecera titulo={titulo} atras={atras} />
      <div className="p-4">
        <div className="tarjeta text-center">
          <p className="text-base font-semibold">Aún no disponible</p>
          <p className="mt-1 text-sm texto-suave">Este módulo se implementa en la {fase}.</p>
        </div>
      </div>
    </>
  )
}
