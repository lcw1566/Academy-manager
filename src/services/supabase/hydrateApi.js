// hydrateApi.js
//
// 학원 도메인 전체를 한 번에 fetch 하는 snapshot API.
// Phase 16 수동 hydrate 의 fetch 단계에서 사용.
//
// 반환 구조:
//   {
//     students, classGroups, classSessions,
//     lessonRecords, attendanceRecords,
//     clinicRecords, payments, payrolls,
//   }
//
// 일부 테이블이 실패하면 어떤 테이블이 어떤 사유로 실패했는지 알 수 있도록
// Promise.allSettled 로 모은 뒤 실패가 있으면 에러를 throw 한다.
// 호출처는 hydrate 를 시도하지 않고 toast 만 띄우면 된다 (= 부분 적용 방지).

import { isSupabaseConfigured } from '../../lib/supabase';
import {
  listAcademyStudents,
  listAcademyClassGroups,
  listAcademyClassSessions,
  listAcademyLessonRecords,
  listAcademyAttendanceRecords,
  listAcademyClinicRecords,
  listAcademyPayments,
  listAcademyPayrolls,
} from './domainApi';

const TABLES = [
  ['students',          listAcademyStudents],
  ['classGroups',       listAcademyClassGroups],
  ['classSessions',     listAcademyClassSessions],
  ['lessonRecords',     listAcademyLessonRecords],
  ['attendanceRecords', listAcademyAttendanceRecords],
  ['clinicRecords',     listAcademyClinicRecords],
  ['payments',          listAcademyPayments],
  ['payrolls',          listAcademyPayrolls],
];

export async function fetchAcademySnapshot(academyId) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase가 설정되지 않았어요.');
  }
  if (!academyId) {
    throw new Error('academyId가 필요해요.');
  }

  const results = await Promise.allSettled(
    TABLES.map(([, fn]) => fn(academyId))
  );

  const data = {};
  const failed = [];
  results.forEach((r, i) => {
    const key = TABLES[i][0];
    if (r.status === 'fulfilled') {
      data[key] = r.value ?? [];
    } else {
      failed.push({ key, error: r.reason });
    }
  });

  if (failed.length > 0) {
    const msg = failed
      .map((f) => `${f.key}: ${f.error?.message ?? String(f.error)}`)
      .join('; ');
    const err = new Error(`서버 데이터 조회 실패 — ${msg}`);
    err.failed = failed;
    err.partial = data;
    throw err;
  }

  return data;
}
