import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bug,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import useDeveloperStore from '../../store/useDeveloperStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import {
  createDeveloperFeedbackScreenshotUrl,
  getDeveloperDashboardStats,
  listDeveloperFeedback,
  updateDeveloperFeedbackStatus,
} from '../../services/supabase/developerApi';

const STATUS_OPTIONS = [
  { id: 'received', label: '접수', color: 'bg-blue-50 text-blue-700' },
  { id: 'reviewing', label: '검토 중', color: 'bg-amber-50 text-amber-700' },
  { id: 'planned', label: '개선 예정', color: 'bg-violet-50 text-violet-700' },
  { id: 'resolved', label: '해결', color: 'bg-emerald-50 text-emerald-700' },
  { id: 'closed', label: '종료', color: 'bg-gray-100 text-gray-600' },
];

const CATEGORY_OPTIONS = [
  { id: '', label: '전체' },
  { id: 'bug', label: '버그' },
  { id: 'improvement', label: '개선 제안' },
];

function statusMeta(status) {
  return STATUS_OPTIONS.find((item) => item.id === status) || STATUS_OPTIONS[0];
}

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '-';
  }
}

function number(value) {
  return Number(value) || 0;
}

export default function DeveloperWorkspace() {
  const access = useDeveloperStore((state) => state.access);
  const leaveWorkspace = useDeveloperStore((state) => state.leaveWorkspace);
  const setWorkspacePicked = useWorkspaceStore((state) => state.setWorkspacePicked);
  const [stats, setStats] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const canManageFeedback = ['developer', 'support'].includes(access?.role);

  const selected = useMemo(
    () => feedback.find((item) => item.id === selectedId) || feedback[0] || null,
    [feedback, selectedId],
  );

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [nextStats, nextFeedback] = await Promise.all([
        getDeveloperDashboardStats(),
        listDeveloperFeedback({
          status: statusFilter || null,
          category: categoryFilter || null,
          limit: 100,
        }),
      ]);
      setStats(nextStats);
      setFeedback(nextFeedback);
      setSelectedId((current) => (
        current && nextFeedback.some((item) => item.id === current)
          ? current
          : (nextFeedback[0]?.id || null)
      ));
    } catch (loadError) {
      setError(loadError?.message || '개발자 현황을 불러오지 못했어요.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    setScreenshotUrl(null);
    if (!selected?.screenshot_path) {
      setScreenshotLoading(false);
      return () => { active = false; };
    }
    setScreenshotLoading(true);
    createDeveloperFeedbackScreenshotUrl(selected.screenshot_path)
      .then((url) => {
        if (active) setScreenshotUrl(url);
      })
      .catch(() => {
        if (active) setScreenshotUrl(null);
      })
      .finally(() => {
        if (active) setScreenshotLoading(false);
      });
    return () => { active = false; };
  }, [selected?.id, selected?.screenshot_path]);

  const changeStatus = async (nextStatus) => {
    if (!canManageFeedback || !selected || nextStatus === selected.status || savingStatus) return;
    setSavingStatus(true);
    setError('');
    try {
      const updated = await updateDeveloperFeedbackStatus(selected.id, nextStatus);
      setFeedback((items) => items.map((item) => (
        item.id === selected.id
          ? { ...item, status: updated?.status || nextStatus, updated_at: updated?.updated_at }
          : item
      )));
      const nextStats = await getDeveloperDashboardStats();
      setStats(nextStats);
    } catch (statusError) {
      setError(statusError?.message || '의견 상태를 변경하지 못했어요.');
    } finally {
      setSavingStatus(false);
    }
  };

  const backToWorkspaces = () => {
    leaveWorkspace();
    setWorkspacePicked(false);
  };

  const totalCount = feedback[0]?.total_count ?? feedback.length;

  return (
    <div className="min-h-screen bg-[#F2F4F6] text-[#191F28]">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 md:px-8">
          <button
            type="button"
            onClick={backToWorkspaces}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="워크스페이스 선택으로 돌아가기"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold md:text-lg">씨닛 개발자 워크스페이스</h1>
              <p className="text-xs text-gray-500">{access?.role || 'developer'} · 서버 검증 계정</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => load({ quiet: true })}
            disabled={refreshing}
            className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 md:px-8 md:py-8">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="새로 접수" value={stats?.received} Icon={Clock3} tone="blue" />
          <StatCard label="검토 중" value={stats?.reviewing} Icon={Bug} tone="amber" />
          <StatCard label="최근 7일" value={stats?.last_7_days} Icon={Lightbulb} tone="violet" />
          <StatCard label="활성 학원" value={stats?.active_academies} Icon={Building2} tone="slate" />
          <StatCard label="활성 구성원" value={stats?.active_members} Icon={Users} tone="emerald" />
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-900">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold">개인정보 보호 운영 원칙</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">
              이 화면은 제품 의견과 익명 집계만 제공합니다. 학생 연락처·학부모 연락처·체크인 PIN은 개발자 권한으로도 조회하지 않습니다.
              신고 이미지에 개인정보가 포함됐다면 문제 확인 목적 외에는 사용하거나 공유하지 마세요.
            </p>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h2 className="text-lg font-bold">버그·개선 제안 접수함</h2>
              <p className="mt-1 text-xs text-gray-500">현재 조건 {number(totalCount)}건 · 상태 변경은 감사 로그에 기록돼요.</p>
            </div>
            <div className="flex gap-2">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 md:w-32"
                aria-label="의견 종류 필터"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 md:w-32"
                aria-label="의견 상태 필터"
              >
                <option value="">전체 상태</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center gap-2 text-sm font-semibold text-gray-500">
              <Loader2 size={18} className="animate-spin" /> 접수함을 불러오는 중…
            </div>
          ) : feedback.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <CheckCircle2 size={30} className="text-emerald-500" />
              <p className="mt-3 text-sm font-bold">조건에 맞는 의견이 없어요</p>
              <p className="mt-1 text-xs text-gray-500">필터를 바꾸거나 새로고침해보세요.</p>
            </div>
          ) : (
            <div className="grid min-h-[540px] lg:grid-cols-[380px_minmax(0,1fr)]">
              <div className="max-h-[680px] overflow-y-auto border-b border-gray-100 lg:border-b-0 lg:border-r">
                {feedback.map((item) => {
                  const meta = statusMeta(item.status);
                  const isSelected = item.id === selected?.id;
                  const CategoryIcon = item.category === 'bug' ? Bug : Lightbulb;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full border-b border-gray-100 px-4 py-4 text-left transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                          <CategoryIcon size={14} className={item.category === 'bug' ? 'text-red-500' : 'text-violet-500'} />
                          {item.category === 'bug' ? '버그' : '개선 제안'}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${meta.color}`}>{meta.label}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-gray-900">{item.message}</p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                        <span className="truncate">{item.academy_name || '학원 연결 없음'}</span>
                        <span className="shrink-0">{formatDateTime(item.created_at)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selected && (
                <article className="min-w-0 px-4 py-5 md:px-7 md:py-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {selected.category === 'bug'
                          ? <Bug size={18} className="text-red-500" />
                          : <Lightbulb size={18} className="text-violet-500" />}
                        <span className="text-sm font-bold">{selected.category === 'bug' ? '버그 신고' : '개선 제안'}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">접수 {formatDateTime(selected.created_at)}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500">
                      처리 상태
                      <select
                        value={selected.status}
                        onChange={(event) => changeStatus(event.target.value)}
                        disabled={savingStatus || !canManageFeedback}
                        className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 disabled:opacity-60"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                      {savingStatus && <Loader2 size={15} className="animate-spin" />}
                    </label>
                  </div>

                  {!canManageFeedback && (
                    <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                      조회 전용 계정은 처리 상태를 변경할 수 없어요.
                    </p>
                  )}

                  <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-4">
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-800">{selected.message}</p>
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
                    <MetaItem label="학원" value={selected.academy_name || '연결 없음'} />
                    <MetaItem label="앱 모드" value={selected.app_mode || '-'} />
                    <MetaItem label="신고 역할" value={selected.reporter_role || '-'} />
                    <MetaItem label="화면" value={selected.context?.activeTab || selected.page_path || '-'} />
                    <MetaItem label="화면 크기" value={selected.context?.viewport || '-'} />
                    <MetaItem label="언어" value={selected.context?.language || '-'} />
                  </dl>

                  {selected.screenshot_path && (
                    <div className="mt-6">
                      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                        <ImageIcon size={17} /> 첨부 화면
                      </div>
                      {screenshotLoading ? (
                        <div className="flex h-44 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                          <Loader2 size={20} className="animate-spin" />
                        </div>
                      ) : screenshotUrl ? (
                        <a href={screenshotUrl} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                          <img src={screenshotUrl} alt="신고에 첨부된 화면" className="max-h-[420px] w-full object-contain" />
                          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                            크게 보기 <ExternalLink size={12} />
                          </span>
                        </a>
                      ) : (
                        <p className="rounded-2xl bg-gray-50 px-4 py-4 text-xs text-gray-500">첨부 이미지를 불러오지 못했어요.</p>
                      )}
                    </div>
                  )}
                </article>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, Icon, tone }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.slate}`}>
        <Icon size={17} />
      </div>
      <p className="mt-3 text-2xl font-black tabular-nums">{number(value).toLocaleString('ko-KR')}</p>
      <p className="mt-1 text-xs font-semibold text-gray-500">{label}</p>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-100 px-3 py-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className="mt-1 truncate font-bold text-gray-700" title={String(value)}>{value}</dd>
    </div>
  );
}
