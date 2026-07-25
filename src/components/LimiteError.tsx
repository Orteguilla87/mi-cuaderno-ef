import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface Estado {
  error: Error | null
}

/**
 * Sin esto, cualquier fallo de Dexie deja la pantalla en blanco. En pista, sin
 * consola y sin cobertura, eso es irrecuperable: aquí al menos hay un botón.
 */
export class LimiteError extends Component<Props, Estado> {
  state: Estado = { error: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Solo consola local: no hay telemetría ni envío de errores (§1.1).
    console.error('Error no controlado:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="p-4">
        <div className="tarjeta space-y-3">
          <h1 className="text-xl font-bold">Algo ha fallado</h1>
          <p className="text-sm texto-suave">
            Tus datos siguen guardados en el dispositivo. Vuelve a cargar la app para continuar.
          </p>
          <pre className="overflow-x-auto rounded-xl bg-agua-claro p-2 text-xs texto-suave dark:bg-noche-elevada">
            {error.message}
          </pre>
          <button className="btn-primario w-full" onClick={() => window.location.reload()}>
            Recargar
          </button>
          <button
            className="btn-suave w-full"
            onClick={() => {
              window.location.hash = '/hoy'
              this.setState({ error: null })
            }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }
}
