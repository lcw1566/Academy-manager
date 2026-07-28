const ROOM_TAG_TONES = [
  'border-blue-200 bg-blue-50 text-blue-700',
  'border-violet-200 bg-violet-50 text-violet-700',
  'border-emerald-200 bg-emerald-50 text-emerald-700',
  'border-amber-200 bg-amber-50 text-amber-700',
  'border-rose-200 bg-rose-50 text-rose-700',
  'border-cyan-200 bg-cyan-50 text-cyan-700',
];

export function getRoomTagClassName(room = '') {
  const value = String(room).trim();
  if (!value) return 'border-gray-200 bg-gray-50 text-gray-500';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return ROOM_TAG_TONES[Math.abs(hash) % ROOM_TAG_TONES.length];
}

