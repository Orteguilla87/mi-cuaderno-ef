import { describe, expect, it, vi } from 'vitest'
import { crearDescarga, soportaCryptoSubtle } from './descargar'

describe('crearDescarga', () => {
  it('crea una URL de blob y permite revocarla', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { url, nombre, revocar } = crearDescarga('contenido', 'fichero.txt', 'text/plain')
    expect(url).toMatch(/^blob:/)
    expect(nombre).toBe('fichero.txt')
    revocar()
    expect(revokeSpy).toHaveBeenCalledWith(url)
  })
})

describe('soportaCryptoSubtle', () => {
  it('detecta que crypto.subtle está disponible en este entorno de pruebas', () => {
    expect(soportaCryptoSubtle()).toBe(true)
  })
})
