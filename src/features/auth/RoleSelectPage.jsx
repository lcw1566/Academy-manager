import useAcademyStore from '../../store/useAcademyStore';

const roles = [
  {
    id: 'tutor',
    emoji: '📚',
    title: '과외 선생님',
    desc: '학생 관리, 수업 기록, 수납까지 혼자 다 관리해요',
  },
  {
    id: 'director',
    emoji: '🏫',
    title: '학원 원장',
    desc: '강사 관리, 전체 수업·수납을 총괄해요',
  },
  {
    id: 'teacher',
    emoji: '✏️',
    title: '강사',
    desc: '내 수업 출결, 수업 기록, 알림장만 관리해요',
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
          {roles.map(({ id, emoji, title, desc }) => (
            <button
              key={id}
              onClick={() => setRole(id)}
              className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm text-left active:scale-[0.97] transition-transform border border-gray-100"
            >
              <span className="text-3xl">{emoji}</span>
              <div>
                <p className="font-bold text-gray-900 text-base">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          나중에 설정에서 변경할 수 있어요
        </p>
      </div>
    </div>
  );
}
