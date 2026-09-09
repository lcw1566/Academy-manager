import { create } from 'zustand';
import { getMyDeveloperAccess } from '../services/supabase/developerApi';

const DEVELOPER_WORKSPACE_SESSION_KEY = 'seenit-developer-workspace';
let accessPromise = null;

function readWorkspaceSelected() {
  if (typeof sessionStorage === 'undefined') return false;
  try { return sessionStorage.getItem(DEVELOPER_WORKSPACE_SESSION_KEY) === '1'; }
  catch { return false; }
}

function persistWorkspaceSelected(selected) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (selected) sessionStorage.setItem(DEVELOPER_WORKSPACE_SESSION_KEY, '1');
    else sessionStorage.removeItem(DEVELOPER_WORKSPACE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const initialAccess = { has_access: false, role: null, capabilities: {} };

const useDeveloperStore = create((set, get) => ({
  access: initialAccess,
  isAccessLoaded: false,
  isAccessLoading: false,
  accessError: null,
  isWorkspaceSelected: readWorkspaceSelected(),

  loadAccess: async ({ force = false } = {}) => {
    if (get().isAccessLoaded && !force) return get().access;
    if (accessPromise) return accessPromise;
    set({ isAccessLoading: true, accessError: null });
    accessPromise = (async () => {
      try {
        const access = await getMyDeveloperAccess();
        const normalized = {
          has_access: access?.has_access === true,
          role: access?.role || null,
          capabilities: access?.capabilities && typeof access.capabilities === 'object'
            ? access.capabilities
            : {},
          setup_missing: access?.setup_missing === true,
        };
        if (!normalized.has_access) persistWorkspaceSelected(false);
        set({
          access: normalized,
          isAccessLoaded: true,
          isWorkspaceSelected: normalized.has_access ? get().isWorkspaceSelected : false,
        });
        return normalized;
      } catch (error) {
        persistWorkspaceSelected(false);
        set({
          access: initialAccess,
          isAccessLoaded: true,
          isWorkspaceSelected: false,
          accessError: error?.message || '개발자 권한을 확인하지 못했어요.',
        });
        return initialAccess;
      } finally {
        set({ isAccessLoading: false });
        accessPromise = null;
      }
    })();
    return accessPromise;
  },

  enterWorkspace: () => {
    if (!get().access?.has_access) return false;
    persistWorkspaceSelected(true);
    set({ isWorkspaceSelected: true });
    return true;
  },

  leaveWorkspace: () => {
    persistWorkspaceSelected(false);
    set({ isWorkspaceSelected: false });
  },

  clear: () => {
    persistWorkspaceSelected(false);
    accessPromise = null;
    set({
      access: initialAccess,
      isAccessLoaded: false,
      isAccessLoading: false,
      accessError: null,
      isWorkspaceSelected: false,
    });
  },
}));

export default useDeveloperStore;
