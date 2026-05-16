import useAcademyStore from '../../store/useAcademyStore';

const roles = [
  {
    id: 'tutor',
    emoji: '📚',
    title: '과외 선생님',
    desc: '개인 과외 수업과 학생을 관리해요.',
    badge: null,
  },
  {
    id: 'owner',
    emoji: '🏫',
    title: '학원 원장',
    desc: '학원 전체 수업, 학생, 수납, 클리닉을 관리해요.',
    badge: '학원',
  },
  {
    id: 'teacher',
    emoji: '✏️',
    title: '학원 강사',
    desc: '내 수업과 담당 학생, 클리닉 요청을 관리해요.',
    badge: '학원',
  },
  {
    id: 'assistant',
    emoji: '🔖',
    title: '보조강사',
    desc: '학생 클리닉, 숙제 검사, 오답 관리를 진행해요.',
    badge: '학원',
  },
];

export default function RoleSelectPage() {
  const setRole = useAcademyStore((s) => s.setRole);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-3">📝</div>
          <h1 className="text-2xl font-bold text-gray-900">클래스노트</h1>
          <p className="text-sm text-gray-500 mt-2">어떤 역할로 시작할까요?</p>
        </div>

        {/* Role Cards */}
        <div className="flex flex-col gap-3">
          {roles.map(({ id, emoji, title, desc, badge }) => (
            <button
              key={id}
              onClick={() => setRole(id)}
              className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm text-left active:scale-[0.97] transition-transform border border-gray-100"
            >
              <span className="text-3xl flex-shrink-0">{emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-bold text-gray-900 text-base">{title}</p>
                  {badge && (
                    <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 bg-blue-50 rounded-2xl px-4 py-3">
          <p className="text-xs text-blue-700 font-semibold mb-1">학원 모드 안내</p>
          <p className="text-xs text-blue-600">원장·강사·보조강사는 같은 학원 데이터를 공유합니다. 과외 선생님 데이터와는 완전히 분리됩니다.</p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          나중에 설정에서 변경할 수 있어요
        </p>
      </div>
    </div>
  );
}
