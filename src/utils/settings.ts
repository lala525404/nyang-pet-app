import type { CustomShape } from '../components/CatEmoji';

export interface Alarm {
  id: string;
  time: string;
  enabled: boolean;
}

export type BuddyMode = 'chill' | 'buddy' | 'chaos' | 'custom';

export interface PetSettings {
  alwaysOnTop: boolean;
  petVisible: boolean;
  distractEmoji: boolean;
  workStart: string;
  workEnd: string;
  animalId: string;
  customImages: (string | null)[];
  distractInterval: number;
  imageRotateInterval: number;
  imageRotateEnabled: boolean; // 사진 교체 켬/끔. 예전 설정에는 없으므로 기본값(켬)이 그대로 이어진다
  moveSpeed: number;
  zone: number;
  monitor: number; // -1 = 전체 모니터
  yarEnabled: boolean;
  yarInterval: number;
  useCustomMode: boolean;
  customShape: CustomShape; // 커스텀 버디 표시 모양
  buddyMode: BuddyMode;
  size: number; // 50~200
  lunchEnabled: boolean;
  leaveEnabled: boolean;
  lunchTime: string;
  leaveTime: string;
  lunchPreAlertMinutes: number;
  leavePreAlertMinutes: number;
  alarms: Alarm[];
  // 점심·퇴근 분리 전 키. 예전 버전으로 돌아가도 값이 남도록 지우지 않고, 마이그레이션 원본으로만 쓴다.
  breakTimeEnabled: boolean;
  preAlertMinutes: number;
}

export const DEFAULT_SETTINGS: PetSettings = {
  alwaysOnTop: true, petVisible: true, distractEmoji: true,
  workStart: '09:00', workEnd: '18:00', animalId: 'cat',
  customImages: [null, null, null], distractInterval: 30,
  imageRotateInterval: 60, imageRotateEnabled: true, useCustomMode: true, customShape: 'round', moveSpeed: 5, zone: 0, monitor: -1,
  yarEnabled: false, yarInterval: 60, buddyMode: 'buddy', size: 100,
  lunchEnabled: false, leaveEnabled: false, lunchTime: '12:00', leaveTime: '18:00',
  lunchPreAlertMinutes: 5, leavePreAlertMinutes: 5, alarms: [],
  breakTimeEnabled: false, preAlertMinutes: 5,
};

export const MODE_PRESETS: Record<'chill' | 'buddy' | 'chaos', Partial<PetSettings>> = {
  chill: { moveSpeed: 1, distractEmoji: false, yarEnabled: false, buddyMode: 'chill' },
  buddy: { moveSpeed: 5, distractEmoji: true, distractInterval: 30, yarEnabled: false, buddyMode: 'buddy' },
  chaos: { moveSpeed: 10, distractEmoji: true, distractInterval: 10, yarEnabled: true, yarInterval: 30, buddyMode: 'chaos' },
};

const STORAGE_KEY = 'petSettings';

// 점심·퇴근 키 분리 마이그레이션: 새 키가 없을 때만 기존 breakTimeEnabled·preAlertMinutes 값을 복사한다.
// 새 키가 한 번 저장되면 다시 실행돼도 아무것도 바꾸지 않는다.
export function migrateSettings(raw: Record<string, unknown>): { settings: Record<string, unknown>; changed: boolean } {
  const s = { ...raw };
  let changed = false;
  const fill = (key: string, value: unknown) => {
    if (s[key] === undefined) { s[key] = value; changed = true; }
  };
  const enabled = typeof raw.breakTimeEnabled === 'boolean' ? raw.breakTimeEnabled : DEFAULT_SETTINGS.breakTimeEnabled;
  const pre = typeof raw.preAlertMinutes === 'number' && raw.preAlertMinutes > 0 ? raw.preAlertMinutes : DEFAULT_SETTINGS.preAlertMinutes;
  fill('lunchEnabled', enabled);
  fill('leaveEnabled', enabled);
  fill('lunchPreAlertMinutes', pre);
  fill('leavePreAlertMinutes', pre);
  return { settings: s, changed };
}

// 저장된 설정을 읽어 마이그레이션하고, 바뀌었으면 바로 다시 저장한다. 저장값이 없으면 null.
export function readStoredSettings(): Record<string, unknown> | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const { settings, changed } = migrateSettings(JSON.parse(text));
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return settings;
  } catch {
    return null;
  }
}

export function loadSettings(): PetSettings {
  const stored = readStoredSettings();
  return stored ? { ...DEFAULT_SETTINGS, ...stored } as PetSettings : DEFAULT_SETTINGS;
}

export function saveSettings(s: PetSettings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

// 내 사진 목록에서 빈 칸을 뺀 순서. 첫 번째가 대표(점심·퇴근·알람 알림 카드에 나오는 사진)다.
export const activePhotos = (images: (string | null)[]): string[] => images.filter(Boolean) as string[];

// 지정한 칸의 사진을 대표(맨 앞)로 옮긴다. 나머지 사진의 순서와 빈 칸 위치는 그대로 둔다.
export function makeRepresentative(images: (string | null)[], slot: number): (string | null)[] {
  if (!images[slot]) return images;
  const filled = images.map((img, i) => (img ? i : -1)).filter(i => i >= 0);
  if (filled[0] === slot) return images;
  const order = [slot, ...filled.filter(i => i !== slot)];
  const next = [...images];
  filled.forEach((pos, k) => { next[pos] = images[order[k]]; });
  return next;
}

// 교체 주기 표기: 30초, 1분, 1분 30초
export function formatInterval(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60), r = sec % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

// 시각 표기 통일: "18:00" → "오후 6:00" (앞자리 0 없음)
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h < 12 ? '오전' : '오후';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour}:${String(m).padStart(2, '0')}`;
}
