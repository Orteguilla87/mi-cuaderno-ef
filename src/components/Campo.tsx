import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent, FocusEvent, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

/**
 * Causa raíz del salto de cursor (Gboard/Android): estos campos tenían el
 * `value` alimentado por un `useLiveQuery` que va y vuelve de IndexedDB en
 * cada tecla. React ve `props.value` viejo en el render inmediato y reasigna
 * `node.value`, lo que en Chrome Android manda `selectionStart/End` al final
 * y cancela la composición en curso de Gboard — de ahí el salto al pulsar
 * espacio y las predicciones que meten espacios sueltos.
 *
 * `Campo`/`CampoArea` cortan ese ciclo con un borrador local: `value` sale
 * siempre del propio estado del campo (síncrono con lo que ya hay en el
 * DOM), nunca del round-trip a la base. El eco tardío del store solo se
 * admite si el campo no tiene foco ni está en medio de una composición.
 * `sanear` (p. ej. clamps numéricos o el filtro del PIN) solo se aplica al
 * confirmar (blur/Enter), nunca en cada tecla — clampar mientras se teclea
 * es otra forma de reescribir `value` por debajo del usuario.
 */
type PropsBase = {
  valor: string
  onValor: (v: string) => void
  sanear?: (v: string) => string
  alConfirmar?: (v: string) => void
}

function useBorrador(valorExterno: string, sanear: ((v: string) => string) | undefined, onValor: (v: string) => void) {
  const [borrador, setBorrador] = useState(valorExterno)
  const enFoco = useRef(false)
  const componiendo = useRef(false)

  useEffect(() => {
    if (!enFoco.current && !componiendo.current) setBorrador(valorExterno)
  }, [valorExterno])

  function escribir(v: string) {
    setBorrador(v)
    if (!componiendo.current) onValor(v)
  }

  function terminarComposicion(v: string) {
    componiendo.current = false
    setBorrador(v)
    onValor(v)
  }

  function confirmar(alConfirmar?: (v: string) => void) {
    enFoco.current = false
    if (!sanear) {
      alConfirmar?.(borrador)
      return
    }
    const limpio = sanear(borrador)
    setBorrador(limpio)
    if (limpio !== valorExterno) onValor(limpio)
    alConfirmar?.(limpio)
  }

  return { borrador, enFoco, componiendo, escribir, terminarComposicion, confirmar }
}

export const Campo = forwardRef<HTMLInputElement, PropsBase & InputHTMLAttributes<HTMLInputElement>>(
  function Campo({ valor, onValor, sanear, alConfirmar, className, onFocus, onBlur, onKeyDown, ...resto }, ref) {
    const { borrador, enFoco, componiendo, escribir, terminarComposicion, confirmar } = useBorrador(
      valor,
      sanear,
      onValor,
    )

    return (
      <input
        {...resto}
        ref={ref}
        className={className ?? 'campo'}
        value={borrador}
        onChange={(e: ChangeEvent<HTMLInputElement>) => escribir(e.target.value)}
        onCompositionStart={() => {
          componiendo.current = true
        }}
        onCompositionEnd={(e: CompositionEvent<HTMLInputElement>) => terminarComposicion(e.currentTarget.value)}
        onFocus={(e: FocusEvent<HTMLInputElement>) => {
          enFoco.current = true
          onFocus?.(e)
        }}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          confirmar(alConfirmar)
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar(alConfirmar)
          onKeyDown?.(e)
        }}
      />
    )
  },
)

export const CampoArea = forwardRef<HTMLTextAreaElement, PropsBase & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function CampoArea({ valor, onValor, sanear, alConfirmar, className, onFocus, onBlur, ...resto }, ref) {
    const { borrador, enFoco, componiendo, escribir, terminarComposicion, confirmar } = useBorrador(
      valor,
      sanear,
      onValor,
    )

    return (
      <textarea
        {...resto}
        ref={ref}
        className={className ?? 'campo'}
        value={borrador}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => escribir(e.target.value)}
        onCompositionStart={() => {
          componiendo.current = true
        }}
        onCompositionEnd={(e: CompositionEvent<HTMLTextAreaElement>) => terminarComposicion(e.currentTarget.value)}
        onFocus={(e: FocusEvent<HTMLTextAreaElement>) => {
          enFoco.current = true
          onFocus?.(e)
        }}
        onBlur={(e: FocusEvent<HTMLTextAreaElement>) => {
          confirmar(alConfirmar)
          onBlur?.(e)
        }}
      />
    )
  },
)
