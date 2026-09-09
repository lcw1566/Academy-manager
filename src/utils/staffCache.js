export function reconcileStaffCollectionsWithActiveMembers(
  { teachers = [], assistants = [], managers = [] } = {},
  activeMembers = [],
) {
  const activeUserIds = new Set(
    (Array.isArray(activeMembers) ? activeMembers : [])
      .map((member) => member?.user_id || member?.userId)
      .filter(Boolean),
  );

  // 빈 결과는 권한 부족이나 일시적인 서버 응답일 수도 있다. 활성 멤버를 한 명도
  // 확인하지 못한 경우에는 로컬 직원을 일괄 비활성화하지 않는다.
  if (activeUserIds.size === 0) {
    return {
      teachers,
      assistants,
      managers,
      deactivated: 0,
      skipped: true,
    };
  }

  let deactivated = 0;
  const reconcile = (staffList) => (staffList || []).map((staff) => {
    // 서버 계정과 연결되지 않은 수동/예시 직원은 이 동기화의 대상이 아니다.
    if (!staff?.serverUserId || activeUserIds.has(staff.serverUserId) || staff.status === 'inactive') {
      return staff;
    }
    deactivated += 1;
    return { ...staff, status: 'inactive' };
  });

  return {
    teachers: reconcile(teachers),
    assistants: reconcile(assistants),
    managers: reconcile(managers),
    deactivated,
    skipped: false,
  };
}
