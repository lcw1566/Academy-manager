import assert from 'node:assert/strict';
import { reconcileStaffCollectionsWithActiveMembers } from '../src/utils/staffCache.js';

const input = {
  teachers: [
    { id: 'teacher-active', serverUserId: 'user-active', status: 'active' },
    { id: 'teacher-removed', serverUserId: 'user-removed', status: 'active' },
    { id: 'teacher-local', status: 'active' },
  ],
  assistants: [
    { id: 'assistant-removed-copy', serverUserId: 'user-removed', status: 'active' },
  ],
  managers: [
    { id: 'manager-old', serverUserId: 'user-old', status: 'inactive' },
  ],
};

const reconciled = reconcileStaffCollectionsWithActiveMembers(input, [
  { user_id: 'user-active', membership_status: 'active' },
]);

assert.equal(reconciled.skipped, false);
assert.equal(reconciled.deactivated, 2);
assert.equal(reconciled.teachers[0].status, 'active');
assert.equal(reconciled.teachers[1].status, 'inactive');
assert.equal(reconciled.teachers[2].status, 'active');
assert.equal(reconciled.assistants[0].status, 'inactive');
assert.equal(reconciled.managers[0].status, 'inactive');

const emptySnapshot = reconcileStaffCollectionsWithActiveMembers(input, []);
assert.equal(emptySnapshot.skipped, true);
assert.equal(emptySnapshot.deactivated, 0);
assert.equal(emptySnapshot.teachers[1].status, 'active');

console.log('Staff exit cache reconciliation checks passed.');
