import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPersistedAcademyState, sanitizeAcademyStorageValue } from '../../src/utils/academyPersistence.js';

test('student records and retired private workspace never enter persistence', () => {
  const state = {
    currentMode: 'private', role: 'tutor',
    students: [{ phone: 'private-contact' }],
    academyStudents: [{ id: 'student', phone: 'contact', parentName: 'guardian', checkinPin: '9182' }],
    tutorProfile: { bankAccount: 'private-account' }, geminiApiKey: 'private-key',
    payments: [{ id: 'private-payment' }],
    academyPayments: [{ id: 'academy-payment' }],
    academyDataOwnerUserId: 'owner', classGroups: [{ id: 'class' }],
  };
  const saved = selectPersistedAcademyState(state);
  assert.deepEqual(saved, {
    currentMode: 'academy', academyPayments: [{ id: 'academy-payment' }],
    academyDataOwnerUserId: 'owner', classGroups: [{ id: 'class' }],
  });
  assert.equal(state.academyStudents[0].phone, 'contact'); // in-memory authorized data untouched
});

for (const version of [undefined, 0, 2, 3, 99]) {
  test(`cached sensitive data is scrubbed regardless of version ${version}`, () => {
    const saved = JSON.parse(sanitizeAcademyStorageValue(JSON.stringify({
      version, state: { students: [{ parentPhone: 'old' }], academyStudents: [{ checkinPin: 'old' }], schoolNames: ['school'] },
    })));
    assert.deepEqual(saved.state, { currentMode: 'academy', schoolNames: ['school'] });
  });
}
test('malformed cache is discarded', () => {
  for (const value of ['{bad', 'null', '42']) assert.equal(sanitizeAcademyStorageValue(value), null);
});
