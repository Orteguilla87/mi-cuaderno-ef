import { useEffect, useState } from 'react'

/**
 * Router mínimo por hash. Suficiente para la app y evita meter react-router,
 * que no está en el stack acordado.
 *
 * Pestañas (§5): #/hoy · #/cuaderno · #/grupos · #/planificador · #/mas
 * Detalles:      #/grupos/:id · #/alumnos/:id · #/asistencia/:grupoId[/:fecha]
 *                #/sesiones/:id · #/observaciones[/:grupoId[/:alumnoId]] · #/infantil/:grupoId
 * Bajo «Más»:    #/juegos · #/observaciones · #/evaluacion · #/informes ·
 *                #/calendario · #/herramientas · #/ajustes
 *                #/equipos/:grupoId[/datos | /sesion-:sesionId] (generador de equipos)
 */

export function rutaActual(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/hoy'
}

export function navegar(ruta: string): void {
  window.location.hash = ruta
}

/**
 * Cambia de ruta SIN apilar una entrada nueva en el historial: la actual se
 * sustituye. Para cambios laterales dentro de la misma pantalla (cambiar de
 * grupo en el Cuaderno, por ejemplo), donde «Atrás» debe seguir devolviendo al
 * origen desde el que se llegó y no al grupo anterior.
 */
export function reemplazarRuta(ruta: string): void {
  const { href } = window.location
  window.location.replace(href.replace(/#.*$/, '') + '#' + ruta)
}

export function volver(): void {
  window.history.back()
}

export function useRuta(): string {
  const [ruta, setRuta] = useState(rutaActual)

  useEffect(() => {
    const onHash = () => setRuta(rutaActual())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return ruta
}

/** Devuelve los segmentos de la ruta: '/grupos/abc' => ['grupos', 'abc'] */
export function segmentos(ruta: string): string[] {
  return ruta.split('/').filter(Boolean)
}
