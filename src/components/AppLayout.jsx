import { lazy, Suspense, useEffect } from 'react';
import useAcademyStore from '../store/useAcademyStore';
import BottomNav, { PRIVATE_TABS } from './BottomNav';
import Sidebar from './Sidebar';

const loadDashboardPage = () => import('../features/dashboard/DashboardPage');
const loadClassesPage = () => import('../features/classes/ClassesPage');
const loadClassDetailPage = () => import('../features/classes/ClassDetailPage');
const loadLessonGroupDetailPage = () => import('../features/classes/LessonGroupDetailPage');
const loadStudentsPage = () => import('../features/students/StudentsPage');
const loadStudentDetailPage = () => import('../features/students/StudentDetailPage');
const loadPaymentsPage = () => import('../features/payments/PaymentsPage');
const loadMorePage = () => import('../features/more/MorePage');

const DashboardPage = lazy(loadDashboardPage);
const ClassesPage = lazy(loadClassesPage);
const ClassDetailPage = lazy(loadClassDetailPage);
const LessonGroupDetailPage = lazy(loadLessonGroupDetailPage);
const StudentsPage = lazy(loadStudentsPage);
const StudentDetailPage = lazy(loadStudentDetailPage);
const PaymentsPage = lazy(loadPaymentsPage);
const MorePage = lazy(loadMorePage);

const PRIVATE_TAB_LOADERS = [
  loadClassesPage,
  loadStudentsPage,
  loadPaymentsPage,
  loadMorePage,
];

const PRIVATE_TAB_IDS = ['home', 'classes', 'students', 'payments', 'more'];

export default function AppLayout() {
  const activeTab = useAcademyStore((s) => s.activeTab);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const selectedClassId = useAcademyStore((s) => s.selectedClassId);
  const selectedStudentId = useAcademyStore((s) => s.selectedStudentId);
  const selectedRepeatGroupId = useAcademyStore((s) => s.selectedRepeatGroupId);
  const students = useAcademyStore((s) => s.students);
  const classes = useAcademyStore((s) => s.classes);
  const repeatGroups = useAcademyStore((s) => s.repeatGroups);
  const goBackFromClass = useAcademyStore((s) => s.goBackFromClass);
  const goBackFromStudent = useAcademyStore((s) => s.goBackFromStudent);
  const goBackFromRepeatGroup = useAcademyStore((s) => s.goBackFromRepeatGroup);

  // 첫 화면 렌더를 막지 않고, 브라우저가 한가해진 뒤 주요 탭만 미리 받는다.
  // 상세 화면은 실제 선택 시 로드해 초기 데이터 사용량을 제한한다.
  useEffect(() => {
    const preload = () => PRIVATE_TAB_LOADERS.forEach((load) => load().catch(() => {}));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 1200);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!PRIVATE_TAB_IDS.includes(activeTab)) {
      setActiveTab('home');
    }
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    if (selectedClassId && !classes.some((cls) => cls.id === selectedClassId)) {
      goBackFromClass();
    }
  }, [selectedClassId, classes, goBackFromClass]);

  useEffect(() => {
    if (selectedStudentId && !students.some((student) => student.id === selectedStudentId)) {
      goBackFromStudent();
    }
  }, [selectedStudentId, students, goBackFromStudent]);

  useEffect(() => {
    if (selectedRepeatGroupId && !repeatGroups.some((group) => group.id === selectedRepeatGroupId)) {
      goBackFromRepeatGroup();
    }
  }, [selectedRepeatGroupId, repeatGroups, goBackFromRepeatGroup]);

  const pageKey = selectedRepeatGroupId
    ? `repeatgroup-${selectedRepeatGroupId}`
    : selectedClassId
    ? `class-${selectedClassId}`
    : selectedStudentId
    ? `student-${selectedStudentId}`
    : activeTab;

  const renderContent = () => {
    if (activeTab === 'home')     return <DashboardPage />;
    if (activeTab === 'classes') {
      if (selectedRepeatGroupId) return <LessonGroupDetailPage />;
      if (selectedClassId)       return <ClassDetailPage />;
      return <ClassesPage />;
    }
    if (activeTab === 'students') return selectedStudentId ? <StudentDetailPage /> : <StudentsPage />;
    if (activeTab === 'payments') return <PaymentsPage />;
    if (activeTab === 'more')     return <MorePage />;
    return <DashboardPage />;
  };

  return (
    <div className="min-h-screen bg-seenit-canvas text-seenit-ink md:flex">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <Sidebar tabs={PRIVATE_TABS} />

      <main className="flex-1 min-w-0">
        <div className="main-content max-w-md mx-auto md:mx-0 md:max-w-none md:px-8 md:py-6 pb-24 md:pb-8">
          <Suspense fallback={<div className="h-[60vh]" />}>
            <div key={pageKey}>
              {renderContent()}
            </div>
          </Suspense>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
