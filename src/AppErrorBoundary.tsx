import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = { children: ReactNode; onReload?: () => void }
type AppErrorBoundaryState = { failed: boolean }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('[Elo] Falha de renderização', error, info)
    else console.error('[Elo] Falha de renderização', error.name)
  }

  override render() {
    if (!this.state.failed) return this.props.children

    return <main className="app-fatal" role="alert">
      <div className="app-fatal-mark" aria-hidden="true"><i /><i /><i /></div>
      <span>RECUPERAÇÃO DA INTERFACE</span>
      <h1>Esta área não abriu como deveria.</h1>
      <p>Atualize a aplicação para carregar novamente. Se o problema continuar, informe o suporte sem enviar dados de saúde ou credenciais.</p>
      <button type="button" onClick={() => this.props.onReload ? this.props.onReload() : window.location.reload()}>Atualizar o Elo</button>
    </main>
  }
}
