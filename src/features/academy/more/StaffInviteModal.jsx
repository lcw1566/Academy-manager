// StaffInviteModal — Pre-Phase 31
//
// 원장이 강사 / 보조강사를 초대할 때 사용하는 단순 모달.
//
// 변경 이유:
//   기존 TeacherFormModal / AssistantFormModal 은 owner 가 이름·연락처·과목·급여
//   까지 입력하도록 되어 있었으나, 이름/연락처는 본인의 profile 에서 가져와야 하고
//   과목·급여·메모는 초대 수락 후 별도의 학원 설정 모달에서 다루는 것이 맞다.
//
// 이 모달은 이메일 + 역할 만 받는다. 초대가 수락되면 구성원 관리 섹션에서
// 학원 설정 모달(AcademyStaffProfileModal) 로 과목·급여를 설정한다.
import Modal from '../../../components/Modal';
import StaffInviteWidget from './StaffInviteWidget';
import { useState } from 'react';

const ROLE_LABEL = { teacher: '강사', assistant: '보조강사' };

export default function StaffInviteModal({ role = 'teacher', onClose }) {
  const [selectedRole, setSelectedRole] = useState(role);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="직원 초대"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl"
        >
          닫기
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-blue-50 rounded-2xl px-4 py-3">
          <p className="text-xs text-blue-700 leading-relaxed">
            직원으로 초대할 이메일을 입력해주세요. 수락 후 직원 정보와 급여 조건을 설정할 수 있어요.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">역할</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ROLE_LABEL).map(([id, label]) => {
              const active = selectedRole === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedRole(id)}
                  className={`rounded-2xl border px-3 py-3 text-left active:opacity-80 ${
                    active ? 'border-[#3182F6] bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className={`text-sm font-bold ${active ? 'text-[#3182F6]' : 'text-gray-900'}`}>{label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <StaffInviteWidget role={selectedRole} />
      </div>
    </Modal>
  );
}
