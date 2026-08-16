import React from 'react';

interface ViewErrorBoundaryProps {
  viewName: string;
  onRecover?: () => void;
  children: React.ReactNode;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
}

export class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ViewErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`${this.props.viewName} view failed to render`, error);
  }

  private handleRecover = () => {
    this.setState({ hasError: false });
    this.props.onRecover?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-full w-full items-center justify-center bg-[#09090b] p-4">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-5 text-center shadow-lg">
          <h2 className="text-lg font-semibold text-rose-200">{this.props.viewName} view failed</h2>
          <p className="mt-1 text-xs text-rose-100/80">A rendering error occurred. Reloading this view usually recovers safely.</p>
          <button
            onClick={this.handleRecover}
            className="mt-4 rounded-lg border border-rose-300/30 bg-rose-400/15 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-400/25"
          >
            Retry view
          </button>
        </div>
      </div>
    );
  }
}
