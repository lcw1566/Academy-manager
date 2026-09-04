import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { createClientUuid } from '../../utils/uuid';

export const FEEDBACK_BUCKET = 'feedback-attachments';
export const MAX_FEEDBACK_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function feedbackSetupError(error) {
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || String(error?.message || '').includes('product_feedback');
}

export function validateFeedbackImage(file) {
  if (!file) return;
  if (!(file instanceof File) || !ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('JPG, PNG, WEBP 이미지만 첨부할 수 있어요.');
  }
  if (file.size <= 0) throw new Error('빈 이미지는 첨부할 수 없어요.');
  if (file.size > MAX_FEEDBACK_IMAGE_SIZE) {
    throw new Error('이미지는 5MB 이하만 첨부할 수 있어요.');
  }
}

export async function submitProductFeedback({
  category,
  message,
  image = null,
  academyId = null,
  role = null,
  appMode = null,
  activeTab = null,
} = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('의견을 보내려면 서버 연결이 필요해요.');
  }

  const normalizedMessage = String(message || '').trim();
  if (!['bug', 'improvement'].includes(category)) {
    throw new Error('의견 종류를 선택해주세요.');
  }
  if (normalizedMessage.length < 10) {
    throw new Error('상황을 알 수 있도록 10자 이상 적어주세요.');
  }
  if (normalizedMessage.length > 4000) {
    throw new Error('내용은 4,000자 이하로 적어주세요.');
  }
  validateFeedbackImage(image);

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData?.user;
  if (!user) throw new Error('로그인이 필요해요.');

  const feedbackId = createClientUuid();
  let screenshotPath = null;

  if (image) {
    const extension = EXTENSION_BY_TYPE[image.type];
    screenshotPath = `${user.id}/${feedbackId}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .upload(screenshotPath, image, {
        cacheControl: '3600',
        contentType: image.type,
        upsert: false,
      });
    if (uploadError) {
      if (feedbackSetupError(uploadError) || uploadError?.statusCode === '404') {
        throw new Error('신고 기능의 서버 설정이 아직 적용되지 않았어요.');
      }
      throw new Error('이미지를 첨부하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  const pagePath = typeof window !== 'undefined' ? window.location.pathname : null;
  const context = typeof window === 'undefined'
    ? {}
    : {
        activeTab: activeTab || null,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        language: navigator.language || null,
      };

  const { data, error } = await supabase
    .from('product_feedback')
    .insert({
      id: feedbackId,
      reporter_user_id: user.id,
      academy_id: academyId || null,
      category,
      message: normalizedMessage,
      screenshot_path: screenshotPath,
      page_path: pagePath,
      app_mode: appMode || null,
      reporter_role: role || null,
      context,
    })
    .select('id, created_at')
    .single();

  if (error) {
    if (screenshotPath) {
      await supabase.storage.from(FEEDBACK_BUCKET).remove([screenshotPath]);
    }
    if (feedbackSetupError(error)) {
      throw new Error('신고 기능의 서버 설정이 아직 적용되지 않았어요.');
    }
    throw new Error('의견을 보내지 못했어요. 잠시 후 다시 시도해주세요.');
  }

  return data;
}
