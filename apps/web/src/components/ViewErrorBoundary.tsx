import { Component, type ReactNode } from 'react';
import { Button } from '@fsa/ui';
import { retryFailedPages } from '../lazyPage';

// Chrome, Firefox and Safari word a failed import() differently.
const LOAD_FAILURE = /dynamically imported module|importing a module script failed/i;

type Failure = 'render' | 'load' | null;

/** Contains a render failure to the page content so the nav and in-memory analysis survive. Sends and stores nothing. */
export class ViewErrorBoundary extends Component<{ children: ReactNode }, { failed: Failure }> {
  state = { failed: null as Failure };

  constructor(props: { children: ReactNode }) {
    super(props);
    // A fresh boundary means the user opened a page: give one that failed to download another try.
    retryFailedPages();
  }

  static getDerivedStateFromError(error: unknown) {
    return { failed: error instanceof Error && LOAD_FAILURE.test(error.message) ? 'load' : 'render' };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  retry = () => {
    retryFailedPages();
    this.setState({ failed: null });
  };

  render() {
    if (this.state.failed === null) return this.props.children;
    return this.state.failed === 'load' ? (
      <div className="panel" role="alert">
        <h1>This page couldn't be loaded</h1>
        <p>Its code didn't download, which usually means the connection dropped. Your analysis is still loaded in this tab.</p>
        <Button variant="primary" onClick={this.retry}>Try again</Button>
      </div>
    ) : (
      <div className="panel" role="alert">
        <h1>This view couldn't be drawn</h1>
        <p>Your analysis is still loaded in this tab. Choose another page or shot.</p>
      </div>
    );
  }
}
