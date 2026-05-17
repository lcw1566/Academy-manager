import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-base font-bold text-gray-800 mb-2">화면을 불러오지 못했어요</p>
        <p className="text-sm text-gray-500 mb-6">잠시 후 다시 시도하거나 다른 탭으로 이동해주세요.</p>
        {import.meta.env.DEV && this.state.error && (
          <p className="text-xs text-red-400 bg-red-50 rounded-xl px-3 py-2 mb-4 max-w-sm text-left break-all">
            {this.state.error.message}
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm"
        >
          새로고침
        </button>
      </div>
    );
  }
}
