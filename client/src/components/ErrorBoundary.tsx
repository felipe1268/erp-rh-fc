import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  retryCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const isDomError = error.message?.includes('removeChild') || 
                       error.message?.includes('insertBefore') ||
                       error.message?.includes('não é filho') ||
                       error.message?.includes('is not a child');
    
    if (isDomError) {
      return { hasError: false, error: null };
    }

    const isChunkError = error.message?.includes('Failed to fetch dynamically imported module') ||
                         error.message?.includes('Importing a module script failed') ||
                         error.message?.includes('error loading dynamically imported module') ||
                         error.message?.includes('Loading chunk') ||
                         error.name === 'ChunkLoadError';

    if (isChunkError) {
      // sessionStorage pode lançar exceção no modo privado do iOS — sempre em try/catch
      try {
        const reloadKey = '__erp_chunk_reload';
        const lastReload = sessionStorage.getItem(reloadKey);
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 10000) {
          sessionStorage.setItem(reloadKey, String(now));
          const rcb = (window as any).__reloadCacheBusting;
          if (typeof rcb === 'function') rcb(now); else window.location.reload();
        }
      } catch { /* modo privado iOS: ignora e mostra erro normalmente */ }
      return { hasError: true, error };
    }
    
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const isDomError = error.message?.includes('removeChild') || 
                       error.message?.includes('insertBefore') ||
                       error.message?.includes('não é filho') ||
                       error.message?.includes('is not a child');
    
    if (isDomError) {
      console.warn('[ErrorBoundary] Erro de DOM ignorado:', error.message);
      // Tentar recuperar automaticamente
      if (this.state.retryCount < 3) {
        this.setState(prev => ({ 
          hasError: false, 
          error: null, 
          retryCount: prev.retryCount + 1 
        }));
      }
      return;
    }
    
    console.error('[ErrorBoundary] Erro capturado:', error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack || null });

    try {
      const reporter = (window as any).__reportClientError;
      if (typeof reporter === 'function') {
        reporter('react-error-boundary', error, {
          componentStack: errorInfo.componentStack?.substring(0, 4000) || null,
          errorName: error.name,
        });
      }
    } catch { /* nunca quebrar dentro do boundary */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Ocorreu um erro inesperado.</h2>

            {this.state.error?.message && (
              <div className="p-3 w-full rounded bg-destructive/10 border border-destructive/30 mb-4">
                <p className="text-sm font-semibold text-destructive break-words">
                  {this.state.error.name || "Error"}: {this.state.error.message}
                </p>
              </div>
            )}

            {this.state.componentStack && (
              <div className="p-3 w-full rounded bg-amber-50 border border-amber-200 mb-4">
                <p className="text-xs font-semibold text-amber-900 mb-1">Componente que falhou:</p>
                <pre className="text-xs text-amber-900 whitespace-break-spaces font-mono">
                  {this.state.componentStack.split('\n').slice(0, 6).join('\n')}
                </pre>
              </div>
            )}

            <details className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <summary className="text-sm text-muted-foreground cursor-pointer mb-2">Stack técnico (para suporte)</summary>
              <pre className="text-xs text-muted-foreground whitespace-break-spaces mt-2">
                {this.state.error?.stack}
              </pre>
            </details>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
