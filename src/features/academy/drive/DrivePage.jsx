import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Download, Eye, File, FileImage, FileText, Folder,
  FolderPlus, Loader2, Maximize2, Minimize2, Minus, Plus, Printer, RefreshCw,
  RotateCcw, Search, Trash2, Upload,
} from 'lucide-react';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  MAX_DRIVE_FILE_SIZE,
  createAcademyDriveFolder,
  deleteAcademyDriveFile,
  deleteAcademyDriveFolder,
  getAcademyDriveFileUrl,
  getAcademyDriveUsage,
  listAcademyDriveFiles,
  listAcademyDriveFolders,
  restoreAcademyDriveFile,
  restoreAcademyDriveFolder,
  trashAcademyDriveFile,
  trashAcademyDriveFolder,
  uploadAcademyDriveFile,
} from '../../../services/supabase/driveApi';

const MAX_DRIVE_FILE_LABEL = '50MB';
const DRIVE_TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
// 서버 허용 목록과 동일하게 유지한다. 실행·스크립트·압축 파일은 파일럿에서 제외한다.
const COMMON_ACADEMY_FILE_ACCEPT = [
  '.pdf', '.hwp', '.hwpx', '.doc', '.docx', '.odt', '.rtf',
  '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
].join(',');

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`;
  if (value >= 1024 * 1024 * 1024) {
    const gigabytes = value / (1024 * 1024 * 1024);
    return `${gigabytes.toFixed(gigabytes >= 10 ? 0 : 1)}GB`;
  }
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
}

function trashDaysRemaining(value) {
  const deletedAt = new Date(value).getTime();
  if (!Number.isFinite(deletedAt)) return '';
  return `${Math.max(1, Math.ceil((deletedAt + DRIVE_TRASH_RETENTION_MS - Date.now()) / 86400000))}일 남음`;
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

function exactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function mountSafeHangulHtml(container, html) {
  if (!container) return false;
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  parsed.querySelectorAll(
    'script, iframe, object, embed, link, meta, style, form, input, button, textarea, select, svg',
  ).forEach((node) => node.remove());

  const allowedAttributes = new Set([
    'class', 'style', 'rowspan', 'colspan', 'src', 'alt', 'width', 'height',
  ]);
  parsed.body.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (!allowedAttributes.has(name) || name.startsWith('on')) {
        element.removeAttribute(attribute.name);
      }
    });

    const style = element.getAttribute('style') || '';
    if (/url\s*\(|expression\s*\(|@import|behavior\s*:/i.test(style)) {
      element.removeAttribute('style');
    }

    if (element.hasAttribute('src')) {
      const src = element.getAttribute('src') || '';
      if (!/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(src)) {
        element.removeAttribute('src');
      }
    }
  });

  if (!parsed.body.textContent?.trim() && !parsed.body.querySelector('img, table')) {
    return false;
  }

  const fragment = document.createDocumentFragment();
  [...parsed.body.childNodes].forEach((node) => {
    fragment.appendChild(document.importNode(node, true));
  });
  container.replaceChildren(fragment);
  return true;
}

function namespaceRhwpSvgIds(parsed, pageIndex) {
  const idMap = new Map();
  const prefix = `drive-rhwp-page-${pageIndex + 1}-`;

  parsed.querySelectorAll('[id]').forEach((element) => {
    const originalId = element.getAttribute('id');
    if (!originalId) return;
    const uniqueId = `${prefix}${originalId}`;
    idMap.set(originalId, uniqueId);
    element.setAttribute('id', uniqueId);
  });
  if (!idMap.size) return;

  parsed.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      let nextValue = attribute.value;
      if (nextValue.startsWith('#')) {
        const replacement = idMap.get(nextValue.slice(1));
        if (replacement) nextValue = `#${replacement}`;
      }
      nextValue = nextValue.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (match, quote, id) => {
        const replacement = idMap.get(id);
        return replacement ? `url(#${replacement})` : match;
      });
      if (nextValue !== attribute.value) element.setAttribute(attribute.name, nextValue);
    });
  });
}

function safeRhwpSvgMarkup(markup, pageIndex) {
  const parsed = new DOMParser().parseFromString(String(markup || ''), 'image/svg+xml');
  if (parsed.querySelector('parsererror')) return '';
  const root = parsed.documentElement;
  if (root?.nodeName?.toLowerCase() !== 'svg') return '';

  root.querySelectorAll(
    'script, iframe, object, embed, foreignObject, audio, video, animate, animateMotion, animateTransform, set',
  ).forEach((node) => node.remove());
  root.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === 'href' || name === 'xlink:href') {
        if (!value.startsWith('#') && !/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(value)) {
          element.removeAttribute(attribute.name);
        }
        return;
      }
      if (name === 'style' && /url\s*\(|expression\s*\(|@import|behavior\s*:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  // rHWP는 각 페이지에서 cell-clip-0 같은 SVG ID를 다시 사용한다. 여러 쪽을
  // 한 DOM에 렌더링하면 뒤쪽 페이지가 앞쪽 페이지의 clipPath를 참조하므로
  // 표 배경과 글자가 흰색처럼 잘린다. 페이지별 ID와 참조를 함께 고유화한다.
  namespaceRhwpSvgIds(parsed, pageIndex);
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  return root.outerHTML;
}

function nextPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else window.setTimeout(resolve, 0);
  });
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
  const showToast = useAcademyStore((s) => s.showToast);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [driveUsage, setDriveUsage] = useState(0);
  const [driveQuota, setDriveQuota] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [isTrashView, setIsTrashView] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busyFileId, setBusyFileId] = useState(null);

  const loadFiles = useCallback(async () => {
    if (!currentAcademyId) {
      setFiles([]);
      setFolders([]);
      setDriveUsage(0);
      setDriveQuota(0);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError('');
    try {
      let [nextFiles, nextFolders, nextUsage] = await Promise.all([
        listAcademyDriveFiles(currentAcademyId, { includeDeleted: true }),
        listAcademyDriveFolders(currentAcademyId, { includeDeleted: true }),
        getAcademyDriveUsage(currentAcademyId),
      ]);

      // 별도 스케줄러 없이도 파일럿에서 보관기한을 지키도록 드라이브 진입 시
      // 7일이 지난 항목을 정리한다. 파일 삭제는 Edge Function에서 멤버십과
      // 휴지통 상태를 다시 확인한다.
      const trashCutoff = Date.now() - DRIVE_TRASH_RETENTION_MS;
      const expiredFiles = nextFiles.filter(
        (file) => file.deleted_at && new Date(file.deleted_at).getTime() <= trashCutoff,
      );
      const expiredFolders = nextFolders.filter(
        (folder) => folder.deleted_at && new Date(folder.deleted_at).getTime() <= trashCutoff,
      );
      if (expiredFiles.length || expiredFolders.length) {
        await Promise.allSettled(expiredFiles.map((file) => deleteAcademyDriveFile(file)));
        const folderById = new Map(nextFolders.map((folder) => [folder.id, folder]));
        const folderDepth = (folder) => {
          let depth = 0;
          let cursor = folder;
          const visited = new Set();
          while (cursor?.parent_id && !visited.has(cursor.id)) {
            visited.add(cursor.id);
            depth += 1;
            cursor = folderById.get(cursor.parent_id);
          }
          return depth;
        };
        const deepestFirst = [...expiredFolders].sort(
          (left, right) => folderDepth(right) - folderDepth(left),
        );
        for (const folder of deepestFirst) {
          try {
            await deleteAcademyDriveFolder(folder.id);
          } catch {
            // 아직 보관기한이 남은 하위 항목이 있으면 다음 진입 때 다시 확인한다.
          }
        }
        [nextFiles, nextFolders, nextUsage] = await Promise.all([
          listAcademyDriveFiles(currentAcademyId, { includeDeleted: true }),
          listAcademyDriveFolders(currentAcademyId, { includeDeleted: true }),
          getAcademyDriveUsage(currentAcademyId),
        ]);
      }

      setFiles(nextFiles);
      setFolders(nextFolders);
      setDriveUsage(nextUsage.usedBytes);
      setDriveQuota(nextUsage.quotaBytes);
      setCurrentFolderId((current) => (
        current && !nextFolders.some((folder) => folder.id === current && !folder.deleted_at)
          ? null
          : current
      ));
    } catch (error) {
      setLoadError(error?.message || '공유 자료를 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }, [currentAcademyId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const currentFolder = useMemo(
    () => folders.find((folder) => folder.id === currentFolderId && !folder.deleted_at) || null,
    [folders, currentFolderId],
  );
  const breadcrumbs = useMemo(() => {
    const byId = new Map(folders.filter((folder) => !folder.deleted_at).map((folder) => [folder.id, folder]));
    const result = [];
    const visited = new Set();
    let cursor = currentFolder;
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      result.unshift(cursor);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : null;
    }
    return result;
  }, [folders, currentFolder]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ko-KR');
    const scopedFolders = folders.filter((folder) => Boolean(folder.deleted_at) === isTrashView);
    const scopedFiles = files.filter((file) => Boolean(file.deleted_at) === isTrashView);
    if (query) {
      return {
        folders: scopedFolders.filter((folder) => folder.name.toLocaleLowerCase('ko-KR').includes(query)),
        files: scopedFiles.filter((file) => file.original_name.toLocaleLowerCase('ko-KR').includes(query)),
      };
    }
    if (isTrashView) return { folders: scopedFolders, files: scopedFiles };
    return {
      folders: scopedFolders.filter((folder) => (folder.parent_id || null) === currentFolderId),
      files: scopedFiles.filter((file) => (file.folder_id || null) === currentFolderId),
    };
  }, [files, folders, search, currentFolderId, isTrashView]);

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

  const removeFile = async (file) => {
    setIsDeleting(true);
    await withFileBusy(file, async () => {
      if (file.deleted_at) {
        await deleteAcademyDriveFile(file);
        setFiles((current) => current.filter((item) => item.id !== file.id));
        setDriveUsage((current) => Math.max(0, current - (Number(file.size_bytes) || 0)));
        showToast('자료를 영구 삭제했어요.');
      } else {
        const trashed = await trashAcademyDriveFile(file.id);
        setFiles((current) => current.map((item) => (item.id === file.id ? trashed : item)));
        showToast('자료를 휴지통으로 옮겼어요.');
      }
      setDeleteTarget(null);
    });
    setIsDeleting(false);
  };

  const removeFolder = async (folder) => {
    const hasChildren = folders.some((item) => (
      item.parent_id === folder.id && (folder.deleted_at || !item.deleted_at)
    )) || files.some((item) => (
      item.folder_id === folder.id && (folder.deleted_at || !item.deleted_at)
    ));
    if (hasChildren) {
      showToast('파일이나 하위 폴더를 먼저 비워주세요.', 'error');
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    try {
      if (folder.deleted_at) {
        await deleteAcademyDriveFolder(folder.id);
        setFolders((current) => current.filter((item) => item.id !== folder.id));
        showToast('폴더를 영구 삭제했어요.');
      } else {
        const trashed = await trashAcademyDriveFolder(folder.id);
        setFolders((current) => current.map((item) => (item.id === folder.id ? trashed : item)));
        if (currentFolderId === folder.id) setCurrentFolderId(folder.parent_id || null);
        showToast('폴더를 휴지통으로 옮겼어요.');
      }
      setDeleteTarget(null);
    } catch (error) {
      showToast(error?.message || '폴더를 삭제하지 못했어요.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const restoreFile = (file) => withFileBusy(file, async () => {
    const restored = await restoreAcademyDriveFile(file.id);
    setFiles((current) => current.map((item) => (item.id === file.id ? restored : item)));
    showToast('자료를 복구했어요.');
  });

  const restoreFolder = async (folder) => {
    try {
      const restored = await restoreAcademyDriveFolder(folder.id);
      setFolders((current) => current.map((item) => (item.id === folder.id ? restored : item)));
      showToast('폴더를 복구했어요.');
    } catch (error) {
      showToast(error?.message || '폴더를 복구하지 못했어요.', 'error');
    }
  };

  const toggleTrash = () => {
    setIsTrashView((current) => !current);
    setCurrentFolderId(null);
    setSearch('');
  };

  return (
    <div>
      <Header
        title="공유 드라이브"
        right={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTrash}
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-[#4E5968] active:bg-[#E5E8EB] md:w-auto md:px-3 ${
                isTrashView ? 'bg-red-50 text-red-500' : 'bg-[#F2F4F6]'
              }`}
              aria-label={isTrashView ? '드라이브로 돌아가기' : '휴지통'}
            >
              {isTrashView ? <ChevronLeft size={16} /> : <Trash2 size={16} />}
              <span className="ml-1.5 hidden text-sm font-bold md:inline">
                {isTrashView ? '드라이브' : '휴지통'}
              </span>
            </button>
            {!isTrashView && (
              <>
                <button
                  type="button"
                  onClick={() => setIsFolderOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2F4F6] text-[#4E5968] active:bg-[#E5E8EB] md:w-auto md:px-3"
                  aria-label="새 폴더"
                >
                  <FolderPlus size={16} />
                  <span className="ml-1.5 hidden text-sm font-bold md:inline">새 폴더</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0064FF] text-sm font-bold text-white shadow-sm active:bg-[#0050CC] md:w-auto md:px-4"
                  aria-label="자료 올리기"
                >
                  <Upload size={16} />
                  <span className="ml-1.5 hidden md:inline">자료 올리기</span>
                </button>
              </>
            )}
          </div>
        )}
      />

      <div className="pt-14 md:pt-0 pb-6 px-4 md:px-0">
        <section className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
              <Folder size={17} className="text-[#0064FF]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-900">
                  {isTrashView ? '휴지통' : '학원 내부 공유 자료'}
                </p>
                {!isTrashView && driveQuota > 0 && (
                  <span className="shrink-0 text-[11px] font-semibold text-[#6B7684]">
                    {formatBytes(driveUsage)} / {formatBytes(driveQuota)}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-0.5 leading-5">
                {isTrashView
                  ? '삭제한 항목은 7일 동안 보관되며 복구할 수 있어요.'
                  : '모든 직원이 폴더를 만들고 자료를 올리거나 내려받을 수 있어요.'}
              </p>
              {!isTrashView && driveQuota > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full ${
                      driveUsage / driveQuota >= 0.9 ? 'bg-red-400' : 'bg-[#3182F6]'
                    }`}
                    style={{ width: `${Math.min(100, (driveUsage / driveQuota) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {!isTrashView && (
          <div className="mt-4 flex min-h-10 items-center gap-1 overflow-x-auto whitespace-nowrap rounded-xl border border-gray-100 bg-white px-2 py-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className={`rounded-lg px-2.5 py-2 text-xs font-bold ${
                currentFolderId ? 'text-[#6B7684] active:bg-gray-50' : 'bg-blue-50 text-[#0064FF]'
              }`}
            >
              드라이브
            </button>
            {breadcrumbs.map((folder) => (
              <div key={folder.id} className="flex items-center gap-1">
                <ChevronRight size={13} className="text-[#B0B8C1]" />
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(folder.id)}
                  className={`rounded-lg px-2.5 py-2 text-xs font-bold ${
                    folder.id === currentFolderId
                      ? 'bg-blue-50 text-[#0064FF]'
                      : 'text-[#6B7684] active:bg-gray-50'
                  }`}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isTrashView ? '휴지통 검색' : '자료 이름 검색'}
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
        ) : visibleItems.files.length === 0 && visibleItems.folders.length === 0 ? (
          <EmptyState
            icon={search ? '🔎' : '🗂️'}
            title={search ? '검색 결과가 없어요' : isTrashView ? '휴지통이 비어 있어요' : '이 폴더가 비어 있어요'}
            description={search
              ? '다른 검색어를 입력해보세요.'
              : isTrashView
              ? '삭제한 자료와 폴더가 여기에 표시돼요.'
              : '새 폴더를 만들거나 자료를 올려보세요.'}
          />
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {currentFolderId && !search && (
              <button
                type="button"
                onClick={() => setCurrentFolderId(currentFolder?.parent_id || null)}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm active:bg-gray-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-[#6B7684]">
                  <ChevronLeft size={20} />
                </span>
                <span className="text-sm font-bold text-[#333D4B]">상위 폴더</span>
              </button>
            )}
            {visibleItems.folders.map((folder) => (
              <DriveFolderCard
                key={folder.id}
                folder={folder}
                isTrash={isTrashView}
                onOpen={() => {
                  setCurrentFolderId(folder.id);
                  setSearch('');
                }}
                onRestore={() => restoreFolder(folder)}
                onDelete={() => setDeleteTarget({ kind: 'folder', item: folder })}
              />
            ))}
            {visibleItems.files.map((file) => (
              <DriveFileCard
                key={file.id}
                file={file}
                isTrash={isTrashView}
                isBusy={busyFileId === file.id}
                onOpen={() => openPreview(file)}
                onDownload={() => downloadFile(file)}
                onRestore={() => restoreFile(file)}
                onDelete={() => setDeleteTarget({ kind: 'file', item: file })}
              />
            ))}
          </div>
        )}
      </div>

      <UploadDriveSheet
        isOpen={isUploadOpen}
        academyId={currentAcademyId}
        folderId={currentFolderId}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={(file) => {
          setFiles((current) => [file, ...current]);
          setDriveUsage((current) => current + (Number(file.size_bytes) || 0));
          setIsUploadOpen(false);
          showToast('공유 자료를 올렸어요.');
        }}
        onError={(message) => showToast(message, 'error')}
      />

      <CreateFolderSheet
        isOpen={isFolderOpen}
        academyId={currentAcademyId}
        parentId={currentFolderId}
        onClose={() => setIsFolderOpen(false)}
        onCreated={(folder) => {
          setFolders((current) => [...current, folder]);
          setIsFolderOpen(false);
          showToast('새 폴더를 만들었어요.');
        }}
        onError={(message) => showToast(message, 'error')}
      />

      {deleteTarget && (
        <DeleteDriveItemSheet
          target={deleteTarget}
          isPermanent={Boolean(deleteTarget.item.deleted_at)}
          isBusy={isDeleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => (
            deleteTarget.kind === 'file'
              ? removeFile(deleteTarget.item)
              : removeFolder(deleteTarget.item)
          )}
        />
      )}

      {preview && (
        <DrivePreviewSheet
          file={preview.file}
          url={preview.url}
          kind={preview.kind}
          onClose={() => setPreview(null)}
          onDownload={() => downloadFile(preview.file)}
          onError={(message) => showToast(message, 'error')}
        />
      )}
    </div>
  );
}

function DriveFolderCard({
  folder,
  isTrash,
  onOpen,
  onRestore,
  onDelete,
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#3182F6]"
      >
        <Folder size={20} />
      </span>
      <button type="button" onClick={isTrash ? undefined : onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-bold text-gray-900">{folder.name}</p>
        <p className="mt-1 text-[11px] text-gray-400">
          {isTrash
            ? `삭제됨 · ${trashDaysRemaining(folder.deleted_at)}`
            : `폴더 · ${formatDate(folder.created_at)}`}
        </p>
      </button>
      {isTrash ? (
        <>
          <IconAction label="폴더 복구" Icon={RotateCcw} onClick={onRestore} tone="blue" />
          <IconAction label="폴더 영구 삭제" Icon={Trash2} onClick={onDelete} tone="red" />
        </>
      ) : (
        <>
          <IconAction label="폴더 삭제" Icon={Trash2} onClick={onDelete} tone="red" />
          <IconAction label="폴더 열기" Icon={ChevronRight} onClick={onOpen} />
        </>
      )}
    </div>
  );
}

function DriveFileCard({
  file,
  isTrash,
  isBusy,
  onOpen,
  onDownload,
  onRestore,
  onDelete,
}) {
  const previewable = canPreview(file);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 flex items-center gap-3">
      <button type="button" disabled={isTrash} onClick={onOpen} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0" aria-label={`${file.original_name} 열기`}>
        <FileTypeIcon file={file} />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" disabled={isTrash} onClick={onOpen} className="block max-w-full text-left">
          <p className="text-sm font-bold text-gray-900 truncate">{file.original_name}</p>
        </button>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-400">
          <span>{formatBytes(file.size_bytes)}</span>
          <span>·</span>
          <span>{isTrash ? trashDaysRemaining(file.deleted_at) : formatDate(file.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {isBusy ? (
          <span className="w-8 h-8 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-[#0064FF]" /></span>
        ) : (
          isTrash ? (
            <>
              <IconAction label="자료 복구" Icon={RotateCcw} onClick={onRestore} tone="blue" />
              <IconAction label="자료 영구 삭제" Icon={Trash2} onClick={onDelete} tone="red" />
            </>
          ) : (
            <>
              {previewable && <IconAction label="열기" Icon={Eye} onClick={onOpen} />}
              <IconAction label="다운로드" Icon={Download} onClick={onDownload} />
              <IconAction label="삭제" Icon={Trash2} onClick={onDelete} tone="red" />
            </>
          )
        )}
      </div>
    </div>
  );
}

function IconAction({ label, Icon, onClick, tone = 'gray' }) {
  const color = tone === 'red'
    ? 'text-red-400 active:bg-red-50'
    : tone === 'blue'
    ? 'text-[#3182F6] active:bg-blue-50'
    : 'text-gray-400 active:bg-gray-100';
  return <button type="button" onClick={onClick} className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`} aria-label={label} title={label}><Icon size={16} /></button>;
}

function UploadDriveSheet({ isOpen, academyId, folderId, onClose, onUploaded, onError }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
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
      const uploaded = await uploadAcademyDriveFile({ academyId, folderId, file });
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
      <p className="text-sm text-gray-600 leading-6">모든 재직 직원이 자료를 열람하고 내려받을 수 있어요. PDF·이미지·DOCX·HWP/HWPX·텍스트는 앱 안에서 바로 인쇄할 수 있습니다.</p>
      <input ref={inputRef} type="file" accept={COMMON_ACADEMY_FILE_ACCEPT} onChange={chooseFile} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 w-full min-h-28 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 flex flex-col items-center justify-center gap-2 px-4">
        <Upload size={21} className="text-[#0064FF]" />
        {file ? (
          <span className="max-w-full text-center"><span className="block text-sm font-bold text-gray-900 truncate">{file.name}</span><span className="block text-xs text-gray-500 mt-1">{formatBytes(file.size)}</span></span>
        ) : <span className="text-sm font-bold text-[#0064FF]">파일 선택</span>}
      </button>
      <p className="mt-2 text-[11px] text-gray-400">파일당 최대 {MAX_DRIVE_FILE_LABEL} · HWP/HWPX, Word, Excel, PPT, PDF, 이미지, CSV 등을 올릴 수 있어요.</p>
    </Modal>
  );
}

function CreateFolderSheet({
  isOpen,
  academyId,
  parentId,
  onClose,
  onCreated,
  onError,
}) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setIsCreating(false);
    }
  }, [isOpen]);

  const createFolder = async () => {
    if (!name.trim()) {
      onError('폴더 이름을 입력해주세요.');
      return;
    }
    setIsCreating(true);
    try {
      const folder = await createAcademyDriveFolder({
        academyId,
        parentId,
        name,
      });
      onCreated(folder);
    } catch (error) {
      onError(error?.message || '폴더를 만들지 못했어요.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isCreating ? () => {} : onClose}
      title="새 폴더"
      footer={(
        <button
          type="button"
          disabled={isCreating || !name.trim()}
          onClick={createFolder}
          className="mb-3 w-full rounded-2xl bg-[#0064FF] py-3.5 text-sm font-bold text-white disabled:bg-blue-300"
        >
          {isCreating ? '만드는 중…' : '폴더 만들기'}
        </button>
      )}
    >
      <label className="block">
        <span className="text-sm font-bold text-[#333D4B]">폴더 이름</span>
        <input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) createFolder();
          }}
          placeholder="예: 중등 영어 자료"
          className="mt-2 h-14 w-full rounded-2xl border border-[#D1D6DB] bg-white px-4 text-base font-semibold text-[#191F28] outline-none focus:border-[#3182F6] focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <p className="mt-2 text-xs text-[#8B95A1]">현재 위치 안에 새 폴더가 만들어져요.</p>
    </Modal>
  );
}

function DeleteDriveItemSheet({
  target,
  isPermanent,
  isBusy,
  onClose,
  onConfirm,
}) {
  const isFolder = target.kind === 'folder';
  const name = isFolder ? target.item.name : target.item.original_name;
  return (
    <Modal
      isOpen
      onClose={isBusy ? () => {} : onClose}
      title={isPermanent
        ? `${isFolder ? '폴더' : '자료'}를 영구 삭제할까요?`
        : `${isFolder ? '폴더' : '자료'}를 삭제할까요?`}
      footer={(
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="rounded-2xl bg-[#F2F4F6] py-3.5 text-sm font-bold text-[#4E5968]"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-red-500 py-3.5 text-sm font-bold text-white disabled:bg-red-300"
          >
            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {isPermanent ? '영구 삭제' : '삭제'}
          </button>
        </div>
      )}
    >
      <div className="rounded-2xl bg-red-50 px-4 py-4">
        <p className="break-words text-sm font-bold text-[#191F28]">{name}</p>
        <p className="mt-1 text-xs leading-5 text-red-600">
          {isPermanent
            ? '영구 삭제하면 복구할 수 없어요.'
            : isFolder
            ? '비어 있는 폴더만 삭제할 수 있으며 7일 동안 복구할 수 있어요.'
            : '삭제한 자료는 휴지통에서 7일 동안 복구할 수 있어요.'}
        </p>
      </div>
    </Modal>
  );
}

function DrivePreviewSheet({ file, url, kind, onClose, onDownload, onError }) {
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
      fitContent
      footer={(
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={onDownload} className="flex-1 rounded-2xl bg-gray-100 py-3 text-sm font-bold text-gray-700 flex items-center justify-center gap-1.5"><Download size={16} />다운로드</button>
          <button type="button" disabled={isPreparingPrint || !isDocumentReady} onClick={printFile} className="flex-1 rounded-2xl bg-[#0064FF] py-3 text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:bg-blue-300"><Printer size={16} />{isPreparingPrint ? '인쇄 준비 중…' : isDocumentReady ? '바로 인쇄' : '자료 여는 중…'}</button>
        </div>
      )}
    >
      <div className={`drive-print-area rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 ${kind === 'pdf' || kind === 'image' ? 'h-[52vh] min-h-72' : 'min-h-72'}`}>
        {renderPreview()}
      </div>
      <p className="mt-3 text-xs text-gray-500 text-center">
        {kind === 'hangul'
          ? '페이지 형태로 보여드려요. 원본 프로그램과 일부 다를 수 있어요.'
          : '인쇄 버튼을 누르면 이 기기의 인쇄 대화상자가 열립니다.'}
      </p>
    </Modal>
  );
}

function DocumentPreview({ url, kind, onReady, onError }) {
  const containerRef = useRef(null);
  const hangulViewerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('자료를 여는 중이에요…');
  const [failed, setFailed] = useState(false);
  const [hangulPages, setHangulPages] = useState([]);
  const [hangulPageCount, setHangulPageCount] = useState(0);
  const [hangulZoom, setHangulZoom] = useState(100);
  const [hangulFallback, setHangulFallback] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === hangulViewerRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await hangulViewerRef.current?.requestFullscreen();
    } catch {
      onErrorRef.current('이 기기에서는 전체 화면을 열지 못했어요.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    let rhwpDocument = null;
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
          const sourceBytes = new Uint8Array(bytes);
          try {
            setStatus('한글 문서의 페이지를 만드는 중이에요…');
            const { createRhwpDocument } = await import('./rhwpViewer');
            if (typeof document !== 'undefined' && document.fonts?.ready) {
              await document.fonts.ready;
            }
            rhwpDocument = await createRhwpDocument(sourceBytes);
            if (cancelled) {
              rhwpDocument.free();
              rhwpDocument = null;
              return;
            }

            const pageCount = rhwpDocument.pageCount();
            if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 500) {
              throw new Error(pageCount > 500
                ? '500쪽이 넘는 문서는 원본을 다운로드해주세요.'
                : '표시할 페이지가 없어요.');
            }

            setHangulPageCount(pageCount);
            const renderedPages = Array(pageCount).fill('');
            for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
              if (cancelled) return;
              const svg = safeRhwpSvgMarkup(rhwpDocument.renderPageSvg(pageIndex), pageIndex);
              if (!svg) throw new Error(`${pageIndex + 1}쪽을 표시하지 못했어요.`);
              renderedPages[pageIndex] = svg;
              if (pageIndex === 0 || (pageIndex + 1) % 3 === 0 || pageIndex === pageCount - 1) {
                setHangulPages([...renderedPages]);
                setStatus(pageIndex === pageCount - 1
                  ? ''
                  : `${pageIndex + 1}/${pageCount}쪽을 준비하고 있어요…`);
                await nextPaint();
              }
            }

            if (!cancelled) onReadyRef.current();
            return;
          } catch (rhwpError) {
            rhwpDocument?.free();
            rhwpDocument = null;
            if (cancelled) return;
            console.warn('[drive] rHWP preview failed, using compatibility preview', rhwpError);
            setHangulPages([]);
            setHangulPageCount(0);
            setHangulFallback(true);
            setStatus('호환 미리보기로 여는 중이에요…');
            await nextPaint();
            if (cancelled) return;
          }

          const {
            HwpxReader,
            detectFormat,
            hwpToHwpx,
          } = await import('@ssabrojs/hwpxjs/browser');
          const format = detectFormat(sourceBytes);
          let hwpxBytes = sourceBytes;
          if (format === 'hwp') {
            hwpxBytes = await hwpToHwpx(sourceBytes, {
              title: '씨닛 미리보기',
              creator: '씨닛',
            });
          } else if (format !== 'hwpx') {
            throw new Error('지원하는 HWP 5.0 또는 HWPX 문서가 아니에요.');
          }

          if (cancelled || !containerRef.current) return;
          const reader = new HwpxReader();
          await reader.loadFromArrayBuffer(exactArrayBuffer(hwpxBytes));
          const html = await reader.extractHtml({
            paragraphTag: 'p',
            tableClassName: 'drive-hwpx-table',
            renderImages: true,
            renderTables: true,
            renderStyles: true,
            embedImages: true,
          });
          if (cancelled || !containerRef.current) return;
          if (!mountSafeHangulHtml(containerRef.current, html)) {
            throw new Error('미리보기로 표시할 문서 내용을 찾지 못했어요.');
          }
          setStatus('');
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
    return () => {
      cancelled = true;
      rhwpDocument?.free();
      rhwpDocument = null;
    };
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

  if (kind === 'hangul') {
    return (
      <div ref={hangulViewerRef} className="drive-hangul-scroll relative min-h-72 max-h-[52vh] overflow-auto bg-[#eef0f3] p-2.5 md:p-5">
        {!hangulFallback && hangulPageCount > 0 && (
          <div className="drive-rhwp-toolbar sticky top-0 z-10 mx-auto mb-3 flex w-fit items-center gap-1 rounded-2xl bg-white/95 p-1.5 shadow-sm backdrop-blur">
            <span className="px-2 text-xs font-semibold text-gray-500">{hangulPageCount}쪽</span>
            <button
              type="button"
              aria-label="축소"
              disabled={hangulZoom <= 60}
              onClick={() => setHangulZoom((value) => Math.max(60, value - 10))}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:text-gray-300"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={() => setHangulZoom(100)}
              className="min-w-12 rounded-xl px-1.5 py-1.5 text-xs font-bold text-[#0064FF] transition-colors hover:bg-blue-50"
            >
              {hangulZoom}%
            </button>
            <button
              type="button"
              aria-label="확대"
              disabled={hangulZoom >= 180}
              onClick={() => setHangulZoom((value) => Math.min(180, value + 10))}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:text-gray-300"
            >
              <Plus size={16} />
            </button>
            {canFullscreen && (
              <button
                type="button"
                aria-label={isFullscreen ? '전체 화면 닫기' : '전체 화면'}
                onClick={toggleFullscreen}
                className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100"
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
          </div>
        )}
        {hangulFallback ? (
          <div ref={containerRef} className="drive-hangul-page" />
        ) : (
          <div
            className="drive-rhwp-pages"
            style={{
              width: `${hangulZoom}%`,
              maxWidth: `${Math.round(794 * hangulZoom / 100)}px`,
            }}
          >
            {hangulPages.map((svg, index) => (
              svg ? (
                <div
                  key={index}
                  className="drive-rhwp-page"
                  aria-label={`${index + 1}쪽`}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <div key={index} className="drive-rhwp-page drive-rhwp-page-loading animate-pulse" />
              )
            ))}
          </div>
        )}
        {status && (hangulFallback || !hangulPages.some(Boolean)) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
            <div className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm">
              <Loader2 size={17} className="animate-spin text-[#0064FF]" />
              {status}
            </div>
          </div>
        )}
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
