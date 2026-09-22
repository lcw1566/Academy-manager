import { expect, test } from '@playwright/test';
import { createAnonymousClient, createRoleClient, getE2eTargetKind, resetDeveloperLab } from './support/supabase.js';
import { E2E_AUTH_FILES } from './support/accounts.js';
import { provisionRoleTestLab } from './support/provision.js';

async function openAcademy(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /씨닛 기능 테스트 학원.*원장/ }).click();
  await expect(page.getByRole('button', { name: '홈', exact: true })).toBeVisible();
}

async function prepareQr() {
  const { client, lab } = await resetDeveloperLab('full');
  const { error } = await client.from('academies').update({
    student_check_method: 'qr', attendance_qr_token: 'synthetic-e2e-generation',
  }).eq('id', lab.academy_id);
  if (error) throw error;
  const issued = await client.rpc('issue_academy_checkin_qr', { p_academy_id: lab.academy_id });
  if (issued.error) throw issued.error;
  return { client, lab, qr: issued.data };
}

test('학생은 새로고침 후 서버에서 복원되고 영구 캐시에는 남지 않는다', async ({ page }) => {
  test.skip(getE2eTargetKind() !== 'local', '개발 서버의 메모리 상태와 영구 저장소를 함께 검사한다');
  const { client } = await resetDeveloperLab('full');
  await client.auth.signOut({ scope: 'local' });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('privacy-fixture-installed')) return;
    sessionStorage.setItem('privacy-fixture-installed', '1');
    localStorage.setItem('academy-store', JSON.stringify({ version: 2, state: {
      currentMode: 'private', students: [{ phone: 'legacy-private-contact' }],
      academyStudents: [{ phone: 'legacy-academy-contact', checkinPin: 'legacy-pin' }],
      tutorProfile: { name: 'legacy-tutor' }, geminiApiKey: 'legacy-ai-key',
    } }));
  });
  await openAcademy(page);
  const state = async () => page.evaluate(async () => {
    const { default: store } = await import('/src/store/useAcademyStore.js');
    const current = store.getState();
    const saved = JSON.parse(localStorage.getItem('academy-store') || '{}').state || {};
    return {
      count: current.academyStudents.length,
      authorizedPinLoaded: current.academyStudents.some((s) => Boolean(s.checkinPin)),
      currentMode: current.currentMode,
      persistedStudents: Object.hasOwn(saved, 'academyStudents'),
      privateData: ['students', 'tutorProfile', 'geminiApiKey'].some((key) => Object.hasOwn(saved, key) || Object.hasOwn(current, key)),
    };
  });
  const expected = { count: 5, authorizedPinLoaded: true, currentMode: 'academy', persistedStudents: false, privateData: false };
  await expect.poll(state).toEqual(expected);
  await page.reload();
  await expect.poll(state).toEqual(expected);
  await expect(page.getByText('개인 과외 워크스페이스')).toHaveCount(0);
});

test('공개 REST/RPC는 만료 변조·생략·직접 토큰 접근을 거절한다', async () => {
  const { client, lab, qr } = await prepareQr();
  const anonymous = createAnonymousClient();
  try {
    const students = await client.rpc('list_academy_students_secure', { p_academy_id: lab.academy_id });
    expect(students.error).toBeNull();
    const pin = students.data.find((s) => s.checkin_pin)?.checkin_pin;
    expect(Boolean(pin)).toBe(true);
    const params = { p_academy_id: lab.academy_id, p_qr_token: qr.token, p_pin: pin };
    for (const expiry of [null, qr.expiresAt + 3600]) {
      const result = await anonymous.rpc('public_student_checkin', { ...params, p_expires_at: expiry });
      expect(result.error).toBeNull();
      expect(result.data[0].ok).toBe(false);
    }
    const nonceRead = await anonymous.from('academy_checkin_nonces').select('token');
    expect(nonceRead.error).not.toBeNull();
    const issue = await anonymous.rpc('issue_academy_checkin_qr', { p_academy_id: lab.academy_id });
    expect(issue.error).not.toBeNull();
    const valid = await anonymous.rpc('public_student_checkin', { ...params, p_expires_at: qr.expiresAt });
    expect(valid.error).toBeNull();
    expect(valid.data[0].ok).toBe(true);
  } finally { await client.auth.signOut({ scope: 'local' }); }
});

test('인증된 학생·직원 출결은 직접 테이블 쓰기와 다른 직원 지정 요청을 거절한다', async () => {
  const { lab, users } = await provisionRoleTestLab();
  const teacher = await createRoleClient('teacher');
  try {
    const students = await teacher.rpc('list_academy_students_secure', {
      p_academy_id: lab.academy_id,
    });
    expect(students.error).toBeNull();
    const studentId = students.data[0]?.id;
    expect(studentId).toBeTruthy();

    const directStudent = await teacher.from('student_check_events').insert({
      academy_id: lab.academy_id,
      student_id: studentId,
      event_type: 'check_in',
      source: 'teacher_manual',
      event_time: new Date().toISOString(),
      created_by: users.teacher.id,
    });
    expect(directStudent.error).not.toBeNull();

    const directStaff = await teacher.from('staff_attendance_logs').insert({
      academy_id: lab.academy_id,
      staff_user_id: users.teacher.id,
      staff_role: 'teacher',
      work_date: new Date().toISOString().slice(0, 10),
      actual_start_time: '00:01',
      source: 'manual',
    });
    expect(directStaff.error).not.toBeNull();

    const forgedStaff = await teacher.rpc('record_staff_attendance', {
      p_academy_id: lab.academy_id,
      p_staff_user_id: users.manager.id,
      p_staff_role: 'manager',
      p_work_date: new Date().toISOString().slice(0, 10),
      p_action: 'clock_in',
      p_time: '00:01',
      p_source: 'manual',
    });
    expect(forgedStaff.error).not.toBeNull();

    const validManual = await teacher.rpc('record_student_manual_check_event', {
      p_academy_id: lab.academy_id,
      p_student_id: studentId,
      p_event_type: 'check_in',
      p_event_time: new Date().toISOString(),
    });
    expect(validManual.error).toBeNull();
    expect(validManual.data.source).toBe('teacher_manual');
    expect(validManual.data.created_by).toBe(users.teacher.id);
  } finally {
    await teacher.auth.signOut({ scope: 'local' });
  }
});

for (const theme of ['light', 'dark']) {
  test(`공용 QR 화면과 만료 안내 (${theme}, 동작 감소)`, async ({ page }, testInfo) => {
    const { client } = await prepareQr();
    await client.auth.signOut({ scope: 'local' });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('seenit-theme-preference', value), theme);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '워크스페이스를 선택해주세요' })).toBeVisible();
    await expect(page.getByText('개인 과외 워크스페이스')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`workspace-${theme}.png`) });
    await page.getByRole('button', { name: /씨닛 기능 테스트 학원.*원장/ }).click();
    await expect(page.getByRole('button', { name: '홈', exact: true })).toBeVisible();
    await page.goto('/?qrDisplay=1');
    await expect(page.getByRole('img', { name: 'QR 코드' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({ path: testInfo.outputPath(`qr-${theme}.png`) });
    await page.goto('/?checkin=1&a=00000000-0000-0000-0000-000000000001&t=synthetic');
    await expect(page.getByText('QR 시간이 만료됐습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '체크하기' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`expired-${theme}.png`) });
  });
}

test('기존 tutor 프로필과 이전 선택 상태도 학원 초대 화면으로 진입한다', async ({ browser }) => {
  await provisionRoleTestLab();
  const client = await createRoleClient('invited');
  const { data: { user } } = await client.auth.getUser();
  const original = await client.from('profiles').select('account_type,default_role').eq('id', user.id).single();
  expect(original.error).toBeNull();
  const context = await browser.newContext({ storageState: E2E_AUTH_FILES.invited });
  try {
    const changed = await client.from('profiles').update({ account_type: 'tutor', default_role: 'tutor' }).eq('id', user.id);
    expect(changed.error).toBeNull();
    await context.addInitScript(() => sessionStorage.setItem('workspace-picked', '1'));
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '학원을 선택해주세요' })).toBeVisible();
    await expect(page.getByRole('button', { name: '수락', exact: true })).toBeVisible();
    await expect(page.getByText('개인 과외 워크스페이스')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '홈', exact: true })).toHaveCount(0);
  } finally {
    const restored = await client.from('profiles').update(original.data).eq('id', user.id);
    await context.close();
    await client.auth.signOut({ scope: 'local' });
    expect(restored.error).toBeNull();
  }
});
