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
