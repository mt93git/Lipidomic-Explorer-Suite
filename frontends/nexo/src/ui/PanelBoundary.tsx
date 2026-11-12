import { Component, type ReactNode } from 'react';
import { strings as s } from './strings';
import { retryFailedImports } from './retryLazy';
/** A failure inside one panel shows a message in that panel instead of unmounting the whole app (and the canvas).
 *  Try again, or the browser coming back online (a chunk that failed to load offline, retryLazy.ts), draws it again. */
export class PanelBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(previous: { resetKey?: unknown }) { if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  componentDidCatch(error: Error) { console.warn('Panel failed:', error.message); }
  private retry = () => { if (!this.state.error) return; retryFailedImports(); this.setState({ error: null }); };
  componentDidMount() { window.addEventListener('online', this.retry); }
  componentWillUnmount() { window.removeEventListener('online', this.retry); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="panel-failed" role="alert"><p>{s.panelFailed}</p><small>{this.state.error.message}</small><button type="button" onClick={this.retry}>{s.tryAgain}</button></div>;
  }
}
