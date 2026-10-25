import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

// Catches any render-time crash in the app and shows a recoverable screen
// instead of a blank white page - on a phone there is no console and no
// obvious way back otherwise. Styles are inline on purpose: if the failure
// is CSS- or render-related, inline styles are the most robust thing to
// paint. Placed above BrowserRouter so even a routing-level crash is caught.
export class ErrorBoundary extends Component<Props, State> {
  // The project has no @types/react, so the `react` module is untyped and
  // Component's props/state aren't inherited for type-checking. Declare them
  // explicitly (type-only; no runtime effect with useDefineForClassFields off).
  declare props: Props;
  declare state: State;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
        textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#ececec', color: '#18181b'
      }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Something went wrong
        </div>
        <p style={{ fontSize: 13, color: '#52525b', maxWidth: '30ch', margin: 0, lineHeight: 1.5 }}>
          SpendWise hit an unexpected error. Your data is safe — reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 28px', borderRadius: 9999, border: 'none',
            background: '#18181b', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer'
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
