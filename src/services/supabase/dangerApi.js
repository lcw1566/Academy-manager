// dangerApi.js
//
// Phase 20 — destructive Supabase operations gated behind owner-only UI with
// typed confirmations.
//
//   - resetCurrentAcademyServerData(academyId)
//       Wipes domain rows for a single academy. academy / academy_members /
//       academy_invitations / academy_staff_profiles are kept. Child tables
//       are deleted before parent tables to satisfy FK constraints.
//
//   - deleteAcademyWorkspace(academyId)
//       Deletes the academy row itself. Cascade FK on members/invitations/
//       staff_profiles/domain rows removes children automatically (provided
//       004 added the `academies delete by owner` RLS policy).
//
// IMPORTANT:
//   - Uses anon key + RLS. No service_role.
//   - On any per-table failure the function throws the table name so the
//     caller can surface a precise error to the user.
//   - These functions do NOT touch localStorage; the caller decides whether
//     to also reset local state.

import { supabase, isSupabaseConfigured } from '../../lib/supabase';

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았어요.');
  }
}

// Delete order: leaf-to-root. Each entry: [table, displayName].
// payrolls / payments / clinic_records / attendance_records / lesson_records
// reference class_sessions (and indirectly class_groups + students). Some
// tables reference each other only weakly (e.g. attendance via session +
// student), so safer to do children first.
const DELETE_ORDER = [
  ['payrolls',             '급여 기록'],
  ['payments',             '수납 기록'],
  ['clinic_records',       '클리닉 기록'],
  ['attendance_records',   '출결 기록'],
  ['lesson_records',       '수업 기록'],
  ['class_sessions',       '수업 회차'],
  ['class_groups',         '반'],
  ['students',             '학생'],
];

// Wipes all domain rows for the given academy. Throws if any table fails.
// Returns a per-table count summary { [table]: deletedRows }.
export async function resetCurrentAcademyServerData(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');

  const summary = {};

  for (const [table, label] of DELETE_ORDER) {
    // .select() to get the deleted rows back (so we can show counts).
    // RLS enforces academy_id scoping; even if a caller passes someone else's
    // academy id, owner-of-academy check blocks the delete.
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq('academy_id', academyId)
      .select('id');

    if (error) {
      // Surface the table the user-visible label for clearer messaging.
      const err = new Error(`${label} 삭제에 실패했어요: ${error.message}`);
      err.table = table;
      err.cause = error;
      throw err;
    }
    summary[table] = data?.length ?? 0;
  }

  return summary;
}

// Deletes the academy row itself.
// Requires the `academies delete by owner` RLS policy from SQL 004.
// Cascade FKs in 001/002/003/004 remove members / invitations /
// staff_profiles / domain rows automatically.
//
// If the policy isn't installed yet the delete will silently affect 0 rows.
// We then throw a clear error so the user sees that the SQL migration is
// missing rather than thinking the delete succeeded.
export async function deleteAcademyWorkspace(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');

  const { data, error } = await supabase
    .from('academies')
    .delete()
    .eq('id', academyId)
    .select('id');

  if (error) {
    throw new Error(`학원 삭제에 실패했어요: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      '학원이 삭제되지 않았어요. 권한이 없거나 SQL 004 마이그레이션이 아직 적용되지 않았을 수 있어요.',
    );
  }
  return { deletedId: academyId };
}
