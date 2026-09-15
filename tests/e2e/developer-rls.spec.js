import { expect, test } from '@playwright/test';
import {
  resetDeveloperLab,
  setDeveloperPermissions,
  setDeveloperPersona,
} from './support/supabase.js';

test.describe('개발자 테스트 랩 RLS', () => {
  test('선생님의 수납·급여 권한을 데이터 API에서도 강제한다', async () => {
    const { client, lab } = await resetDeveloperLab('full');
    try {
      await setDeveloperPersona(client, 'teacher');

      const hiddenPayments = await client
        .from('payments')
        .select('id')
        .eq('academy_id', lab.academy_id);
      expect(hiddenPayments.error).toBeNull();
      expect(hiddenPayments.data).toHaveLength(0);

      const ownPayroll = await client
        .from('payrolls')
        .select('id')
        .eq('academy_id', lab.academy_id);
      expect(ownPayroll.error).toBeNull();
      expect(ownPayroll.data).toHaveLength(1);

      await setDeveloperPermissions(client, {
        canViewPayments: true,
        canManagePayments: false,
        canViewPayroll: true,
      });
      const visiblePayments = await client
        .from('payments')
        .select('id')
        .eq('academy_id', lab.academy_id);
      expect(visiblePayments.error).toBeNull();
      expect(visiblePayments.data).toHaveLength(4);

      const forbiddenUpdate = await client
        .from('payments')
        .update({ memo: 'E2E 조회 전용 변경 차단' })
        .eq('academy_id', lab.academy_id)
        .select('id');
      expect(forbiddenUpdate.error).toBeNull();
      expect(forbiddenUpdate.data).toHaveLength(0);
    } finally {
      await client.auth.signOut();
    }
  });

  test('민감 학생 컬럼은 직접 조회를 막고 보안 RPC에서 역할별로 마스킹한다', async () => {
    const { client, lab } = await resetDeveloperLab('full');
    try {
      const ownerStudents = await client.rpc('list_academy_students_secure', {
        p_academy_id: lab.academy_id,
      });
      expect(ownerStudents.error).toBeNull();
      expect(ownerStudents.data).toHaveLength(5);
      expect(ownerStudents.data.some((student) => Boolean(student.checkin_pin))).toBe(true);

      await setDeveloperPersona(client, 'teacher');
      const directRead = await client
        .from('students')
        .select('*')
        .eq('academy_id', lab.academy_id);
      expect(directRead.error).not.toBeNull();

      const teacherStudents = await client.rpc('list_academy_students_secure', {
        p_academy_id: lab.academy_id,
      });
      expect(teacherStudents.error).toBeNull();
      expect(teacherStudents.data).toHaveLength(5);
      for (const student of teacherStudents.data) {
        for (const field of ['phone', 'parent_phone', 'parent_name', 'parent_title', 'parent_title_custom', 'checkin_pin']) {
          expect(student[field]).toBeNull();
        }
      }
      const studentId = teacherStudents.data[0].id;
      const detail = await client.rpc('get_student_secure', { p_student_id: studentId });
      expect(detail.error).toBeNull();
      for (const field of ['phone', 'parent_phone', 'parent_name', 'parent_title', 'parent_title_custom', 'checkin_pin']) {
        expect(detail.data[field]).toBeNull();
      }
      const write = await client.from('students').update({ phone: '01000009999' }).eq('id', studentId);
      expect(write.error).not.toBeNull();
      await setDeveloperPersona(client, 'owner');
      const unchanged = await client.rpc('get_student_secure', { p_student_id: studentId });
      expect(unchanged.error).toBeNull();
      expect(unchanged.data.phone).toBe(ownerStudents.data.find((student) => student.id === studentId).phone);
    } finally {
      await client.auth.signOut();
    }
  });
});
