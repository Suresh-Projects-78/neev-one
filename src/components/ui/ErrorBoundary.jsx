import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch() {
    // Intentionally minimal: avoid noisy console logs in production builds.
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-lg bg-white border rounded-xl p-6">
          <div className="text-lg font-semibold">Something went wrong</div>
          <div className="text-sm text-gray-600 mt-2">
            Try refreshing the page. If the problem continues, check the last change.
          </div>
          <div className="mt-4 text-xs text-gray-500 break-words">
            {String(this.state.error?.message || this.state.error || '')}
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
