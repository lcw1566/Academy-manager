import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  GraduationCap,
  MessageCircle,
  Monitor,
  MousePointerClick,
  PhoneCall,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UsersRound,
} from 'lucide-react';

const ctaBase =
  'transition-all duration-300 ease-out hover:-translate-y-1 active:translate-y-0';
const cardBase =
  'transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-600/10';

const reveal = (delay = 0, amount = 0.2) => ({
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

const featureBlocks = [
  {
    title: '학생, 수업, 출결을 한 화면에서',
    desc: '학생 정보부터 오늘 수업, 출결 상태, 클리닉 기록까지 흩어지지 않게 관리해요.',
    type: 'attendance',
  },
  {
    title: '수납과 정산도 같이',
    desc: '월별 수납, 미납 확인, 강사 급여 흐름까지 학원 운영 숫자를 놓치지 않아요.',
    type: 'payment',
  },
  {
    title: '강사와 같은 데이터를 공유',
    desc: 'PC에서 만든 반과 학생 정보가 모바일에서도 이어져서 같은 기준으로 일할 수 있어요.',
    type: 'team',
  },
];

const proofItems = [
  { label: '편리한 사용', value: '설치 없이 바로 사용', type: 'pc' },
  { label: '학생 연락', value: '저장없이 바로 연결', type: 'call' },
  { label: '데이터 관리', value: '개인별 맞춤 관리 가능', type: 'history' },
];

const workflowItems = [
  {
    Icon: Monitor,
    title: 'PC에서는 크게 보고 빠르게 정리',
    desc: '원장님은 웹에서 학생, 반, 수납, 근무 일정을 한 번에 정리합니다.',
  },
  {
    Icon: Smartphone,
    title: '모바일에서는 현장에서 바로 처리',
    desc: '선생님은 출결, 수업 기록, 클리닉 입력을 휴대폰으로 처리합니다.',
  },
  {
    Icon: PhoneCall,
    title: '연락이 필요할 때는 모바일 전화',
    desc: '학생/학부모 연락처는 모바일에서 전화 버튼으로 바로 연결됩니다.',
  },
  {
    Icon: Download,
    title: '다운로드보다 쉬운 앱처럼 설치',
    desc: '자주 쓰는 PC에서는 브라우저 설치 기능으로 바탕화면 앱처럼 열 수 있어요.',
  },
];

const sellingPoints = [
  '원장, 운영 매니저, 선생님이 같은 워크스페이스에서 일해요.',
  '학생별 수업 기록과 클리닉 기록이 누적돼 상담 준비가 쉬워져요.',
  '출결과 수납 상태를 따로 엑셀에 옮겨 적는 시간을 줄여요.',
  'PC와 모바일 역할이 분명해서 현장 업무가 자연스럽게 이어져요.',
];

export default function LandingPage({ onSignIn, onSignUp }) {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-gray-100/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-6">
          <a href="#" className="flex items-center gap-2" aria-label="씨닛 홈">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
              <GraduationCap size={18} />
            </div>
            <span className="text-base font-black tracking-normal">씨닛</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-gray-600 md:flex">
            <a href="#benefits" className="transition-colors hover:text-gray-950">장점</a>
            <a href="#workflow" className="transition-colors hover:text-gray-950">사용 방식</a>
            <a href="#trust" className="transition-colors hover:text-gray-950">운영 관리</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSignIn}
              className={`hidden h-10 items-center rounded-xl px-4 text-sm font-bold text-gray-700 active:bg-gray-100 md:inline-flex ${ctaBase}`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={onSignUp}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm shadow-blue-600/20 active:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 ${ctaBase}`}
            >
              시작하기
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-[72svh] items-center overflow-hidden bg-white px-5 pb-12 pt-28 md:px-6 md:pt-32">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 md:grid-cols-[1fr_0.8fr] md:items-center">
          <motion.div {...reveal(0, 0.35)} className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-600">
              누구나 간편한 학원 관리 씨닛
            </p>
            <h1 className="text-[42px] font-black leading-[1.08] tracking-normal text-gray-950 md:text-[68px]">
              학원 운영,
              <br />
              이제는 간편하게
            </h1>
            <p className="mt-5 max-w-xl text-lg font-semibold leading-relaxed text-gray-700 md:text-xl">
              학생 관리, 수업 기록, 출결, 수납, 강사 업무를 PC와 모바일에서 간편하게
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onSignUp}
                className={`inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-base font-black text-white shadow-lg shadow-blue-600/20 active:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/25 ${ctaBase}`}
              >
                무료로 시작하기
                <ArrowRight size={19} />
              </button>
              <button
                type="button"
                onClick={onSignIn}
                className={`inline-flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-base font-black text-gray-800 shadow-sm ring-1 ring-gray-200 active:bg-gray-50 hover:shadow-lg ${ctaBase}`}
              >
                이미 계정이 있어요
              </button>
            </div>
          </motion.div>

          <motion.div {...reveal(0.12, 0.35)} className="hidden md:block">
            <LivePulsePanel />
          </motion.div>
        </div>
      </section>

      <section className="bg-[#F7F8FA] px-5 py-10 md:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-3">
          {proofItems.map((item, index) => (
            <motion.article
              key={item.label}
              {...reveal(index * 0.07)}
              className={`overflow-hidden rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 ${cardBase}`}
            >
              <ProofVisual type={item.type} />
              <p className="mt-5 text-sm font-bold text-gray-500">{item.label}</p>
              <p className="mt-1 text-2xl font-black text-gray-950">{item.value}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section id="benefits" className="bg-white px-5 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-6xl">
          <motion.div {...reveal()} className="max-w-2xl">
            <p className="text-sm font-black text-blue-600">왜 씨닛인가요?</p>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-normal md:text-5xl">
              학원 업무는 많지만,
              <br />
              관리 도구는 단순해야 하니까
            </h2>
          </motion.div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {featureBlocks.map(({ title, desc, type }, index) => (
              <motion.article
                key={title}
                {...reveal(index * 0.08)}
                className={`rounded-3xl bg-[#F7F8FA] p-6 ${cardBase}`}
              >
                <FeatureGraphic type={type} />
                <h3 className="mt-7 text-xl font-black leading-snug text-gray-950">{title}</h3>
                <p className="mt-3 text-[15px] font-medium leading-relaxed text-gray-600">{desc}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="bg-gray-950 px-5 py-20 text-white md:px-6 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-[0.86fr_1.14fr] md:items-start">
            <motion.div {...reveal()}>
              <p className="text-sm font-black text-blue-300">PC 모바일 무엇으로든 간편하게</p>
              <h2 className="mt-3 text-3xl font-black leading-tight tracking-normal md:text-5xl">
                사무실에서는 PC,
                <br />
                수업 중에는 모바일.
              </h2>
              <p className="mt-5 text-base font-semibold leading-relaxed text-gray-300">
                다운로드 프로그램을 따로 설치하지 않아도 됩니다. 웹에서 바로 접속하고, 필요하면 앱처럼 설치해서 쓰세요.
              </p>
            </motion.div>
            <div className="space-y-4">
              <motion.div {...reveal(0.05)}>
                <DeviceHandoffVisual />
              </motion.div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {workflowItems.map(({ Icon, title, desc }, index) => (
                  <motion.article
                    key={title}
                    {...reveal(index * 0.06)}
                    className={`rounded-3xl bg-white/[0.08] p-5 ring-1 ring-white/10 ${cardBase} hover:shadow-black/20`}
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-gray-950">
                      <Icon size={21} />
                    </div>
                    <h3 className="text-lg font-black leading-snug">{title}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-gray-300">{desc}</p>
                  </motion.article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="trust" className="bg-white px-5 py-20 md:px-6 md:py-28">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-[1fr_1fr] md:items-center">
          <motion.div {...reveal()}>
            <p className="text-sm font-black text-blue-600">데이터가 곧 학원의 경쟁력으로</p>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-normal md:text-5xl">
              간편한 기록,
              <br />
              사라지지 않는 데이터
            </h2>
            <p className="mt-5 text-base font-semibold leading-relaxed text-gray-600">
              학생 데이터가 쌓이면 학부모 상담, 보강 판단, 미납 확인, 강사 커뮤니케이션이 훨씬 빨라집니다.
            </p>
            <button
              type="button"
              onClick={onSignUp}
              className={`mt-8 inline-flex h-14 items-center gap-2 rounded-2xl bg-blue-600 px-6 text-base font-black text-white shadow-lg shadow-blue-600/20 active:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/25 ${ctaBase}`}
            >
              학원 워크스페이스 만들기
              <ArrowRight size={18} />
            </button>
          </motion.div>
          <motion.div {...reveal(0.08)} className="rounded-[2rem] bg-[#F7F8FA] p-5 md:p-7">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-gray-500">운영 체크</p>
                <p className="mt-1 text-2xl font-black text-gray-950">오늘 놓치지 않을 일</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <BarChart3 size={23} />
              </div>
            </div>
            <div className="space-y-3">
              {sellingPoints.map((point, index) => (
                <motion.div
                  key={point}
                  initial={{ opacity: 0, x: 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.55 }}
                  transition={{ duration: 0.46, delay: index * 0.13, ease: [0.22, 1, 0.36, 1] }}
                  className="group flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
                >
                  <motion.span
                    initial={{ scale: 0.4, rotate: -35 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true, amount: 0.8 }}
                    transition={{ duration: 0.32, delay: 0.12 + index * 0.13, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                  >
                    <Check size={15} strokeWidth={3} />
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-relaxed text-gray-800">{point}</p>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true, amount: 0.8 }}
                      transition={{ duration: 0.45, delay: 0.2 + index * 0.13, ease: [0.22, 1, 0.36, 1] }}
                      className="mt-2 h-0.5 origin-left rounded-full bg-blue-100"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 ${cardBase}`}>
                <Clock3 size={20} className="text-emerald-600" />
                <p className="mt-3 text-sm font-black text-gray-950">반복 업무 절약</p>
              </div>
              <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 ${cardBase}`}>
                <ShieldCheck size={20} className="text-blue-600" />
                <p className="mt-3 text-sm font-black text-gray-950">학원별 데이터 관리</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-[#F7F8FA] px-5 py-16 md:px-6 md:py-20">
        <motion.div {...reveal()} className="mx-auto max-w-4xl text-center">
          <MessageCircle size={32} className="mx-auto text-blue-600" />
          <h2 className="mt-5 text-3xl font-black leading-tight tracking-normal md:text-5xl">
            지금 바로 학원 운영을
            <br />
            정리해보세요.
          </h2>
          <p className="mt-4 text-base font-semibold leading-relaxed text-gray-600">
            PC에서는 웹으로 바로 시작하고, 모바일에서는 출결과 연락까지 이어집니다.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onSignUp}
              className={`inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-7 text-base font-black text-white shadow-lg shadow-blue-600/20 active:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/25 ${ctaBase}`}
            >
              시작하기
              <ArrowRight size={19} />
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className={`inline-flex h-14 items-center justify-center rounded-2xl bg-white px-7 text-base font-black text-gray-800 shadow-sm ring-1 ring-gray-200 active:bg-gray-50 hover:shadow-lg ${ctaBase}`}
            >
              로그인
            </button>
          </div>
        </motion.div>
      </section>
    </main>
  );
}

function LivePulsePanel() {
  return (
    <div className="rounded-[2rem] bg-[#F7F8FA] p-5 shadow-sm ring-1 ring-gray-100">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-gray-500">실시간 운영 흐름</p>
          <p className="mt-1 text-2xl font-black text-gray-950">오늘 수업 8개</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <BadgeCheck size={21} />
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-black text-gray-900">출결 현황</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-600">동기화됨</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['출석', '21', 'bg-blue-600 text-white'],
              ['지각', '2', 'bg-amber-100 text-amber-700'],
              ['결석', '1', 'bg-gray-100 text-gray-600'],
            ].map(([label, value, color]) => (
              <div key={label} className={`rounded-2xl px-3 py-3 ${color}`}>
                <p className="text-xs font-bold opacity-80">{label}</p>
                <p className="mt-1 text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <UserCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-gray-900">강사 출결 입력 완료</p>
            <p className="mt-0.5 text-xs font-bold text-gray-500">모바일에서 저장된 기록이 반영됐어요</p>
          </div>
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="h-2.5 w-2.5 rounded-full bg-blue-600"
          />
        </div>
      </div>
    </div>
  );
}

function ProofVisual({ type }) {
  if (type === 'pc') {
    return (
      <div className="h-24 rounded-2xl bg-[#F7F8FA] p-3">
        <div className="h-full rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-200" />
            <span className="h-2 w-2 rounded-full bg-amber-200" />
            <span className="h-2 w-2 rounded-full bg-emerald-200" />
          </div>
          <motion.div
            animate={{ width: ['38%', '74%', '38%'] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            className="h-3 rounded-full bg-blue-600"
          />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <span className="h-3 rounded-full bg-gray-100" />
            <span className="h-3 rounded-full bg-gray-100" />
            <span className="h-3 rounded-full bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  if (type === 'call') {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl bg-blue-50">
        <motion.div
          animate={{ scale: [1, 1.035, 1], y: [0, -1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="relative flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-blue-600 text-white shadow-lg shadow-blue-600/25"
        >
          <motion.span
            animate={{ scale: [0.92, 1.55, 1.55], opacity: [0, 0.22, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-[1.4rem] bg-blue-500"
          />
          <PhoneCall size={25} className="relative z-10" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-24 overflow-hidden rounded-2xl bg-[#F7F8FA] p-3">
      <div className="flex h-full flex-col justify-center gap-2">
        {['수업 기록', '출결 저장'].map((label, index) => (
          <motion.div
            key={label}
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 2.4, delay: index * 0.2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-gray-100"
          >
            <CheckCircle2 size={15} className="text-blue-600" />
            <span className="text-xs font-black text-gray-700">{label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FeatureGraphic({ type }) {
  if (type === 'attendance') {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <CalendarCheck size={18} />
            </div>
            <span className="text-sm font-black text-gray-900">오늘 수업</span>
          </div>
          <span className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-black text-white">8개</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F8FA] px-3 py-3">
          <span className="text-sm font-bold text-gray-700">중2 수학</span>
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">출석</span>
        </div>
      </div>
    );
  }

  if (type === 'payment') {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <ReceiptText size={18} />
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">수납 완료</span>
        </div>
        <p className="text-2xl font-black text-gray-950">500,000원</p>
        <div className="mt-3 h-2 rounded-full bg-gray-100">
          <motion.div
            initial={{ width: '40%' }}
            whileInView={{ width: '82%' }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-emerald-500"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
          <UsersRound size={18} />
        </div>
        <span className="text-xs font-black text-gray-500">같은 워크스페이스</span>
      </div>
      <div className="flex items-center gap-2">
        {['원장', '매니저', '선생님'].map((label, index) => (
          <div key={label} className="flex-1 rounded-2xl bg-[#F7F8FA] px-2 py-3 text-center">
            <div className={`mx-auto mb-1 h-6 w-6 rounded-full ${index === 0 ? 'bg-blue-600' : index === 1 ? 'bg-sky-400' : 'bg-emerald-400'}`} />
            <p className="text-[11px] font-black text-gray-700">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeviceHandoffVisual() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-white/[0.08] p-5 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 rounded-2xl bg-white p-4 text-gray-950">
          <div className="mb-4 flex items-center gap-2">
            <Monitor size={20} className="text-blue-600" />
            <span className="text-sm font-black">PC 정리</span>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-3/4 rounded-full bg-gray-200" />
            <div className="h-3 w-1/2 rounded-full bg-gray-100" />
            <div className="h-8 rounded-2xl bg-blue-50" />
          </div>
        </div>
        <motion.div
          animate={{ x: [-6, 6, -6], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 sm:flex"
        >
          <ChevronRight size={20} />
        </motion.div>
        <div className="w-28 flex-shrink-0 rounded-[1.6rem] bg-white p-3 text-gray-950">
          <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-gray-200" />
          <div className="space-y-2">
            <div className="h-8 rounded-2xl bg-blue-600" />
            <div className="h-3 rounded-full bg-gray-100" />
            <div className="h-3 w-2/3 rounded-full bg-gray-100" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/[0.08] px-4 py-3">
        <MousePointerClick size={18} className="text-blue-300" />
        <span className="text-sm font-bold text-gray-200">업무는 이어지고, 화면은 기기에 맞게 가벼워집니다.</span>
      </div>
    </div>
  );
}
