function hashSchoolName(schoolName) {
  const normalized = String(schoolName || '').trim().normalize('NFC');
  // FNV-1a를 두 번 섞어 짧고 비슷한 학교명도 서로 다른 색에 배정될 가능성을 높인다.
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

// 9개 Tailwind 색상 중 하나를 고르던 방식은 서로 다른 학교가 같은 색을 갖기 쉬웠다.
// 소수점 hue와 명도/채도 조합을 사용해 사실상 이름 해시 전체를 색에 반영하면서, 같은 학교는 모든
// 화면과 기기에서 항상 같은 색으로 보이게 한다.
export function getSchoolTagStyle(schoolName) {
  const hash = hashSchoolName(schoolName);
  const hue = (hash % 36000) / 100;
  const saturation = 56 + ((hash >>> 8) % 1900) / 100;
  const textLightness = 29 + ((hash >>> 19) % 900) / 100;
  return {
    backgroundColor: `hsl(${hue} ${Math.min(83, saturation + 8)}% 96%)`,
    borderColor: `hsl(${hue} ${saturation}% 82%)`,
    color: `hsl(${hue} ${saturation}% ${textLightness}%)`,
  };
}

// 이전 호출부와 외부 사용처를 위한 공통 모양. 색은 getSchoolTagStyle이 담당한다.
export function getSchoolTagClassName() {
  return 'border';
}
