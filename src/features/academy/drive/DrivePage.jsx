import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Eye, File, FileImage, FileText, Loader2, LockKeyhole, Printer,
  RefreshCw, Search, ShieldCheck, ShieldOff, Trash2, Upload,
} from 'lucide-react';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { currentUserCan } from '../../../utils/staffPermissions';
import {
  MAX_DRIVE_FILE_SIZE,
  deleteAcademyDriveFile,
  getAcademyDriveFileUrl,
  listAcademyDriveFiles,
  updateAcademyDriveDownloadAllowed,
  uploadAcademyDriveFile,
} from '../../../services/supabase/driveApi';

const MAX_DRIVE_FILE_LABEL = '50MB';
// 업로드 선택창에서 자주 쓰는 학원 자료를 먼저 제안한다. 서버는 확장자를 기준으로
// 막지 않으므로, 이 목록 밖의 파일도 필요한 경우 선택할 수 있다.
const COMMON_ACADEMY_FILE_ACCEPT = [
  '.pdf', '.hwp', '.hwpx', '.doc', '.docx', '.odt', '.rtf',
  '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.zip',
].join(',');

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
}

function extensionOf(file) {
  const match = String(file?.original_name || '').match(/\.([a-z0-9]{1,12})$/i);
  return match?.[1]?.toLowerCase() || '';
}

function isPdf(file) {
  return file?.mime_type === 'application/pdf' || /\.pdf$/i.test(file?.original_name || '');
}

function isImage(file) {
  return String(file?.mime_type || '').startsWith('image/')
    || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file?.original_name || '');
}

function isDocx(file) {
  return extensionOf(file) === 'docx';
}

function isHangul(file) {
  return ['hwp', 'hwpx'].includes(extensionOf(file));
}

function isPlainText(file) {
  return ['txt', 'csv', 'md', 'log'].includes(extensionOf(file));
}

function previewKind(file) {
  if (isPdf(file)) return 'pdf';
  if (isImage(file)) return 'image';
  if (isDocx(file)) return 'docx';
  if (isHangul(file)) return 'hangul';
  if (isPlainText(file)) return 'text';
  return null;
}

function canPreview(file) {
  return previewKind(file) !== null;
}

function FileTypeIcon({ file, size = 20 }) {
  if (isPdf(file)) return <FileText size={size} className="text-red-500" />;
  if (isImage(file)) return <FileImage size={size} className="text-emerald-500" />;
  if (isHangul(file)) return <FileText size={size} className="text-violet-500" />;
  if (isDocx(file)) return <FileText size={size} className="text-blue-600" />;
  if (['xls', 'xlsx', 'csv'].includes(extensionOf(file))) return <FileText size={size} className="text-emerald-600" />;
  if (['ppt', 'pptx'].includes(extensionOf(file))) return <FileText size={size} className="text-orange-500" />;
  return <File size={size} className="text-blue-500" />;
}

export default function DrivePage() {
  const role = useAcademyStore((s) => s.role);
  const showToast = useAcademyStore((s) => s.showToast);
  const authUserId = useAuthStore((s) => s.user?.id);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busyFileId, setBusyFileId] = useState(null);
  const isOwner = role === 'owner';
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((profile) => profile.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canManageDrive = isOwner || currentUserCan(
    { role, staffProfile: myStaffProfile },
    'canManageDrive',
  );

  const loadFiles = useCallback(async () => {
    if (!currentAcademyId) {
      setFiles([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError('');
    try {
      setFiles(await listAcademyDriveFiles(currentAcademyId));
    } catch (error) {
      setLoadError(error?.message || '공유 자료를 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }, [currentAcademyId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const visibleFiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ko-KR');
    if (!query) return files;
    return files.filter((file) => file.original_name.toLocaleLowerCase('ko-KR').includes(query));
  }, [files, search]);

  const withFileBusy = async (file, action) => {
    setBusyFileId(file.id);
    try {
      await action();
    } catch (error) {
      showToast(error?.message || '파일을 처리하지 못했어요.', 'error');
    } finally {
      setBusyFileId(null);
    }
  };

  const openPreview = (file) => withFileBusy(file, async () => {
    if (!canPreview(file)) {
      showToast('앱 내 열람은 PDF·이미지·DOCX·HWP/HWPX·텍스트 자료를 지원해요. 다른 Office 자료는 PDF로 올려주세요.', 'info');
      return;
    }
    const url = await getAcademyDriveFileUrl(file.id, 'view');
    setPreview({ file, url, kind: previewKind(file) });
  });

  const downloadFile = (file) => withFileBusy(file, async () => {
    const url = await getAcademyDriveFileUrl(file.id, 'download');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });

  const toggleDownload = (file) => withFileBusy(file, async () => {
    const updated = await updateAcademyDriveDownloadAllowed(file.id, !file.download_allowed);
    setFiles((current) => current.map((item) => item.id === updated.id ? updated : item));
    showToast(updated.download_allowed ? '이 자료의 다운로드를 허용했어요.' : '이 자료의 다운로드를 차단했어요.');
  });

  const removeFile = (file) => {
    if (!window.confirm(`“${file.original_name}” 자료를 삭제할까요?\n삭제하면 복구할 수 없어요.`)) return;
    withFileBusy(file, async () => {
      await deleteAcademyDriveFile(file);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      showToast('자료를 삭제했어요.');
    });
  };

  return (
    <div>
      <Header
        title="공유 드라이브"
        right={canManageDrive ? (
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="h-9 w-9 md:w-auto md:px-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold shadow-sm active:bg-[#0050CC]"
            aria-label="자료 올리기"
          >
            <Upload size={16} />
            <span className="hidden md:inline">자료 올리기</span>
          </button>
        ) : null}
      />

      <div className="pt-14 md:pt-0 pb-6 px-4 md:px-0">
        <section className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
              <LockKeyhole size={17} className="text-[#0064FF]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">학원 내부 공유 자료</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-5">
                PDF·이미지·워드(DOCX)·한글(HWP/HWPX)·텍스트 자료는 다운로드 없이도 앱 안에서 열람·인쇄할 수 있어요.
              </p>
            </div>
          </div>
          {canManageDrive && (
            <p className="mt-3 text-[11px] text-blue-700 font-medium">
              자료 등록, 삭제와 다운로드 허용 여부는 원장 또는 권한이 있는 운영 매니저가 변경할 수 있어요.
            </p>
          )}
        </section>

        <div className="mt-4 flex items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="자료 이름 검색"
            className="flex-1 min-w-0 bg-transparent text-sm text-gray-800 outline-none"
          />
          <button type="button" onClick={loadFiles} className="p-1 -mr-1 text-gray-400 active:text-[#0064FF]" aria-label="새로고침">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {isLoading ? (
          <DriveLoading />
        ) : loadError ? (
          <div className="mt-6 rounded-2xl bg-white border border-red-100 px-5 py-6 text-center shadow-sm">
            <p className="text-sm font-bold text-gray-800">자료를 불러오지 못했어요</p>
            <p className="text-xs text-gray-500 mt-1 break-words">{loadError}</p>
            <button type="button" onClick={loadFiles} className="mt-4 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">다시 시도</button>
          </div>
        ) : visibleFiles.length === 0 ? (
          <EmptyState
            icon={files.length ? '🔎' : '🗂️'}
            title={files.length ? '검색 결과가 없어요' : '공유된 자료가 없어요'}
            description={canManageDrive && !files.length ? '오른쪽 위 버튼으로 첫 자료를 올려보세요.' : '다른 검색어를 입력하거나 나중에 다시 확인해보세요.'}
          />
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {visibleFiles.map((file) => (
              <DriveFileCard
                key={file.id}
                file={file}
                isOwner={isOwner}
                canManageDrive={canManageDrive}
                isBusy={busyFileId === file.id}
                onOpen={() => openPreview(file)}
                onDownload={() => downloadFile(file)}
                onToggleDownload={() => toggleDownload(file)}
                onDelete={() => removeFile(file)}
              />
            ))}
          </div>
        )}
      </div>

      <UploadDriveSheet
        isOpen={isUploadOpen}
        academyId={currentAcademyId}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={(file) => {
          setFiles((current) => [file, ...current]);
          setIsUploadOpen(false);
          showToast('공유 자료를 올렸어요.');
        }}
        onError={(message) => showToast(message, 'error')}
      />

      {preview && (
        <DrivePreviewSheet
          file={preview.file}
          url={preview.url}
          kind={preview.kind}
          isOwner={isOwner}
          onClose={() => setPreview(null)}
          onDownload={() => downloadFile(preview.file)}
          onError={(message) => showToast(message, 'error')}
        />
      )}
    </div>
  );
}

function DriveFileCard({ file, isOwner, canManageDrive, isBusy, onOpen, onDownload, onToggleDownload, onDelete }) {
  const canDownload = isOwner || file.download_allowed;
  const previewable = canPreview(file);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 flex items-center gap-3">
      <button type="button" onClick={onOpen} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0" aria-label={`${file.original_name} 열기`}>
        <FileTypeIcon file={file} />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="block max-w-full text-left">
          <p className="text-sm font-bold text-gray-900 truncate">{file.original_name}</p>
        </button>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-400">
          <span>{formatBytes(file.size_bytes)}</span>
          <span>·</span>
          <span>{formatDate(file.created_at)}</span>
          <span>·</span>
          {file.download_allowed ? <span className="text-emerald-600 font-semibold">다운로드 허용</span> : <span className="text-amber-600 font-semibold">다운로드 차단</span>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {isBusy ? (
          <span className="w-8 h-8 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-[#0064FF]" /></span>
        ) : (
          <>
            {previewable && <IconAction label="열기" Icon={Eye} onClick={onOpen} />}
            {canDownload && <IconAction label="다운로드" Icon={Download} onClick={onDownload} />}
            {canManageDrive && (
              <>
                <IconAction label={file.download_allowed ? '다운로드 차단' : '다운로드 허용'} Icon={file.download_allowed ? ShieldCheck : ShieldOff} onClick={onToggleDownload} tone={file.download_allowed ? 'emerald' : 'amber'} />
                <IconAction label="삭제" Icon={Trash2} onClick={onDelete} tone="red" />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IconAction({ label, Icon, onClick, tone = 'gray' }) {
  const color = tone === 'red' ? 'text-red-400 active:bg-red-50' : tone === 'emerald' ? 'text-emerald-500 active:bg-emerald-50' : tone === 'amber' ? 'text-amber-500 active:bg-amber-50' : 'text-gray-400 active:bg-gray-100';
  return <button type="button" onClick={onClick} className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`} aria-label={label} title={label}><Icon size={16} /></button>;
}

function UploadDriveSheet({ isOpen, academyId, onClose, onUploaded, onError }) {
  const [file, setFile] = useState(null);
  const [downloadAllowed, setDownloadAllowed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setDownloadAllowed(false);
      setIsUploading(false);
    }
  }, [isOpen]);

  const chooseFile = (event) => {
    const next = event.target.files?.[0] || null;
    if (next && next.size > MAX_DRIVE_FILE_SIZE) {
      onError('파일은 50MB 이하만 업로드할 수 있어요.');
      event.target.value = '';
      return;
    }
    setFile(next);
  };

  const upload = async () => {
    if (!file) { onError('업로드할 파일을 선택해주세요.'); return; }
    if (!academyId) { onError('학원 정보를 찾을 수 없어요.'); return; }
    setIsUploading(true);
    try {
      const uploaded = await uploadAcademyDriveFile({ academyId, file, downloadAllowed });
      onUploaded(uploaded);
    } catch (error) {
      onError(error?.message || '자료 업로드에 실패했어요.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isUploading ? () => {} : onClose}
      title="공유 자료 올리기"
      footer={<button type="button" disabled={isUploading} onClick={upload} className="w-full mb-3 rounded-2xl bg-[#0064FF] py-3.5 text-sm font-bold text-white disabled:bg-blue-300">{isUploading ? '업로드 중…' : '자료 올리기'}</button>}
    >
      <p className="text-sm text-gray-600 leading-6">모든 재직 직원이 자료를 열람할 수 있어요. PDF·이미지·DOCX·HWP/HWPX·텍스트는 앱 안에서 바로 인쇄할 수 있습니다.</p>
      <input ref={inputRef} type="file" accept={COMMON_ACADEMY_FILE_ACCEPT} onChange={chooseFile} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 w-full min-h-28 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 flex flex-col items-center justify-center gap-2 px-4">
        <Upload size={21} className="text-[#0064FF]" />
        {file ? (
          <span className="max-w-full text-center"><span className="block text-sm font-bold text-gray-900 truncate">{file.name}</span><span className="block text-xs text-gray-500 mt-1">{formatBytes(file.size)}</span></span>
        ) : <span className="text-sm font-bold text-[#0064FF]">파일 선택</span>}
      </button>
      <p className="mt-2 text-[11px] text-gray-400">파일당 최대 {MAX_DRIVE_FILE_LABEL} · HWP/HWPX, Word, Excel, PPT, PDF, 이미지, CSV, ZIP 등을 올릴 수 있어요.</p>
      <label className="mt-5 flex items-start gap-3 rounded-2xl bg-gray-50 px-4 py-3.5 cursor-pointer">
        <input type="checkbox" checked={downloadAllowed} onChange={(event) => setDownloadAllowed(event.target.checked)} className="mt-0.5 w-4 h-4 accent-[#0064FF]" />
        <span><span className="block text-sm font-bold text-gray-900">직원 다운로드 허용</span><span className="block text-xs text-gray-500 mt-1 leading-5">해제하면 앱 안에서 열람·인쇄만 가능해요. 원장은 항상 내려받을 수 있어요.</span></span>
      </label>
    </Modal>
  );
}

function DrivePreviewSheet({ file, url, kind, isOwner, onClose, onDownload, onError }) {
  const frameRef = useRef(null);
  const [printUrl, setPrintUrl] = useState('');
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [isDocumentReady, setIsDocumentReady] = useState(kind === 'pdf' || kind === 'image');
  const blobUrlRef = useRef('');

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  const printFile = async () => {
    // DOCX/HWP/HWPX/TXT 는 현재 화면에 렌더링한 내용을 앱 인쇄 스타일로 바로 출력한다.
    // PDF/이미지는 같은 출처 Blob iframe을 만들어 해당 문서 자체의 인쇄 기능을 호출한다.
    if (kind !== 'pdf' && kind !== 'image') {
      setIsPreparingPrint(true);
      window.setTimeout(() => {
        try {
          window.print();
        } catch {
          onError('이 기기에서는 인쇄 대화상자를 열지 못했어요.');
        } finally {
          setIsPreparingPrint(false);
        }
      }, 80);
      return;
    }

    setIsPreparingPrint(true);
    try {
      const signedUrl = await getAcademyDriveFileUrl(file.id, 'print');
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error('인쇄용 파일을 불러오지 못했어요.');
      const blob = await response.blob();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = URL.createObjectURL(blob);
      setPrintUrl(blobUrlRef.current);
    } catch (error) {
      setIsPreparingPrint(false);
      onError(error?.message || '인쇄를 준비하지 못했어요.');
    }
  };

  const handleFrameLoad = () => {
    if (!printUrl) return;
    window.setTimeout(() => {
      setIsPreparingPrint(false);
      try {
        frameRef.current?.contentWindow?.focus();
        frameRef.current?.contentWindow?.print();
      } catch {
        onError('이 기기에서는 인쇄 대화상자를 열지 못했어요.');
      }
    }, 120);
  };

  const canDownload = isOwner || file.download_allowed;
  const renderPreview = () => {
    if (kind === 'pdf' || kind === 'image') {
      return <iframe ref={frameRef} src={printUrl || url} onLoad={handleFrameLoad} title={`${file.original_name} 미리보기`} className="w-full h-full bg-white" />;
    }
    return (
      <DocumentPreview
        url={url}
        kind={kind}
        onReady={() => setIsDocumentReady(true)}
        onError={onError}
      />
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={file.original_name}
      size="wide"
      footer={(
        <div className="flex gap-2 mb-3">
          {canDownload && <button type="button" onClick={onDownload} className="flex-1 rounded-2xl bg-gray-100 py-3 text-sm font-bold text-gray-700 flex items-center justify-center gap-1.5"><Download size={16} />다운로드</button>}
          <button type="button" disabled={isPreparingPrint || !isDocumentReady} onClick={printFile} className="flex-1 rounded-2xl bg-[#0064FF] py-3 text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:bg-blue-300"><Printer size={16} />{isPreparingPrint ? '인쇄 준비 중…' : isDocumentReady ? '바로 인쇄' : '자료 여는 중…'}</button>
        </div>
      )}
    >
      <div className={`drive-print-area rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 ${kind === 'pdf' || kind === 'image' ? 'h-[52vh] min-h-72' : 'min-h-72'}`}>
        {renderPreview()}
      </div>
      <p className="mt-3 text-xs text-gray-500 text-center">
        {kind === 'hangul' ? '한글 문서는 텍스트 중심으로 열람·인쇄됩니다. 복잡한 편집 서식은 PDF 변환본을 권장합니다.' : '인쇄 버튼을 누르면 이 기기의 인쇄 대화상자가 열립니다.'}
      </p>
    </Modal>
  );
}

function DocumentPreview({ url, kind, onReady, onError }) {
  const containerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('자료를 여는 중이에요…');
  const [failed, setFailed] = useState(false);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('자료를 불러오지 못했어요.');
        const bytes = await response.arrayBuffer();
        if (cancelled) return;

        if (kind === 'docx') {
          setStatus('워드 문서를 그리는 중이에요…');
          const { renderAsync } = await import('docx-preview');
          if (cancelled || !containerRef.current) return;
          containerRef.current.replaceChildren();
          await renderAsync(bytes, containerRef.current, undefined, {
            className: 'drive-docx-preview',
            inWrapper: true,
            breakPages: true,
            useBase64URL: true,
            renderAltChunks: false,
          });
          if (!cancelled) onReadyRef.current();
          return;
        }

        if (kind === 'hangul') {
          setStatus('한글 문서에서 내용을 읽는 중이에요…');
          const { hwpToText } = await import('@ssabrojs/hwpxjs/browser');
          const content = await hwpToText(new Uint8Array(bytes));
          if (cancelled) return;
          setText(content?.trim() || '표시할 텍스트를 찾지 못했어요. 복잡한 서식 자료는 PDF 변환본을 올려주세요.');
          onReadyRef.current();
          return;
        }

        const content = new TextDecoder('utf-8').decode(bytes);
        if (cancelled) return;
        setText(content || '빈 텍스트 파일이에요.');
        onReadyRef.current();
      } catch (error) {
        if (cancelled) return;
        const message = kind === 'hangul'
          ? '한글 문서를 열지 못했어요. 암호가 설정된 파일이거나 지원하지 않는 구형 형식일 수 있어요.'
          : kind === 'docx'
          ? '워드 문서를 열지 못했어요. 손상되지 않은 DOCX 파일인지 확인해주세요.'
          : '텍스트 자료를 열지 못했어요.';
        setStatus(message);
        setFailed(true);
        onErrorRef.current(error?.message ? `${message} (${error.message})` : message);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [url, kind]);

  if (failed) {
    return <div className="min-h-72 bg-white px-6 flex items-center justify-center text-center text-sm leading-6 text-gray-500">{status}</div>;
  }

  if (kind === 'docx') {
    return (
      <div className="min-h-72 bg-[#f2f2f2] overflow-auto p-3 md:p-6">
        <div ref={containerRef} className="drive-docx-host" />
        {status && <p className="sr-only">{status}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-72 max-h-[52vh] overflow-auto bg-white p-5">
      {!text ? (
        <div className="h-40 flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 size={17} className="animate-spin" />{status}</div>
      ) : (
        <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-800 font-sans">{text}</pre>
      )}
    </div>
  );
}

function DriveLoading() {
  return <div className="mt-4 flex flex-col gap-2">{[1, 2, 3].map((index) => <div key={index} className="h-[68px] rounded-2xl bg-white animate-pulse border border-gray-100" />)}</div>;
}
