import { Component, type ReactNode } from 'react';

/** Contains a render failure to the page content so the nav and in-memory analysis survive. Sends and stores nothing. */
export class ViewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="panel" role="alert">
        <h1>This view couldn't be drawn</h1>
        <p>Your analysis is still loaded in this tab. Choose another page or shot.</p>
      </div>
    );
  }
}
