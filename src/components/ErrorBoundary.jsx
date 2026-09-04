import { Component } from 'react';
import * as Sentry from '@sentry/react';
import useAcademyStore from '../store/useAcademyStore';

// Functional fallback so we can use hooks (store)
function ErrorFallback({ error, componentStack, onReset }) {
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);

  const handleGoHome = () => {
    setActiveTab('home');
    onReset();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <p className="text-base font-bold text-gray-800 mb-2">화면을 불러오지 못했어요.</p>
      <p className="text-sm text-gray-500 mb-6">일시적인 오류가 발생했어요. 홈으로 이동해 다시 시도해주세요.</p>

      {import.meta.env.DEV && error && (
        <div className="w-full max-w-sm mb-4 text-left">
          <p className="text-xs font-bold text-red-500 mb-1">오류 메시지</p>
          <p className="text-xs text-red-400 bg-red-50 rounded-xl px-3 py-2 break-all mb-2">
            {error.message}
          </p>
          {componentStack && (
            <>
              <p className="text-xs font-bold text-red-500 mb-1">컴포넌트 스택</p>
              <pre className="text-[10px] text-red-400 bg-red-50 rounded-xl px-3 py-2 overflow-x-auto whitespace-pre-wrap">
                {componentStack.trim().split('\n').slice(0, 6).join('\n')}
              </pre>
            </>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleGoHome}
          className="px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm"
        >
          홈으로 이동
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-2xl text-sm"
        >
          새로고침
        </button>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const store = useAcademyStore.getState();

    Sentry.withScope((scope) => {
      scope.setTag('seenit.role', store.role || 'unknown');
      scope.setTag('seenit.mode', store.currentMode || 'unknown');
      scope.setTag('seenit.active_tab', store.activeTab || 'unknown');
      scope.setContext('react', {
        componentStack: info?.componentStack || null,
      });
      Sentry.captureException(error);
    });

    console.error('[ErrorBoundary] 렌더링 오류 발생', {
      '── 오류 정보 ──': '',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 8).join('\n'),
      componentStack: info?.componentStack?.trim().split('\n').slice(0, 10).join('\n'),
      '── 상태 정보 ──': '',
      role: store.role,
      currentMode: store.currentMode,
      activeTab: store.activeTab,
      '── 네비게이션 ──': '',
      selectedClassGroupId: store.selectedClassGroupId,
      selectedClassSessionId: store.selectedClassSessionId,
      selectedAcademyStudentId: store.selectedAcademyStudentId,
      selectedClassId: store.selectedClassId,
      selectedStudentId: store.selectedStudentId,
      '── 데이터 현황 ──': '',
      classGroupsCount: store.classGroups?.length ?? 0,
      classSessionsCount: store.classSessions?.length ?? 0,
      academyStudentsCount: store.academyStudents?.length ?? 0,
      academyTeachersCount: store.academyTeachers?.length ?? 0,
      academyLessonRecordsCount: store.academyLessonRecords?.length ?? 0,
    });
    this.setState({ componentStack: info?.componentStack || null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <ErrorFallback
        error={this.state.error}
        componentStack={this.state.componentStack}
        onReset={() => this.setState({ hasError: false, error: null, componentStack: null })}
      />
    );
  }
}
