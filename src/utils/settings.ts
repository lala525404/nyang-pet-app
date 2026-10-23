import type { CustomShape } from '../components/CatEmoji';
import type { AlarmRepeat } from './alarmSchedule';
import { seedFreshTheme } from './theme';

export interface Alarm {
  id: string;
  time: string;
  enabled: boolean;
  name?: string;       // 알람 이름(카드 제목). 비어 있으면 "알람"
  endTime?: string;    // 종료 시각(있으면 카드에 시간 범위로)
  attendees?: string;  // 참석자(쉼표로 구분)
  memo?: string;
  preMinutes?: number; // 이 알람의 미리 알림(분 전). 없거나 0이면 미리 알림 없음
  repeat?: AlarmRepeat; // 반복(매주 요일 / 특정 날짜 한 번 / 그 주만). 없으면 예전 알람처럼 매일
  skipDate?: string;   // "오늘만 건너뛰기": 이 날짜(YYYY-MM-DD) 하루만 울리지 않는다
}

export type BuddyMode = 'chill' | 'buddy' | 'chaos' | 'custom';

export interface PetSettings {
  alwaysOnTop: boolean;
  petVisible: boolean;
  distractEmoji: boolean;
  workStart: string;
  workEnd: string;   // 더 이상 쓰지 않는다(퇴근 시간은 leaveTime 하나). 예전 저장값 호환용으로만 남긴다
  animalId: string;
  customImages: (string | null)[];
  distractInterval: number;
  imageRotateInterval: number;
  imageRotateEnabled: boolean; // 사진 교체 켬/끔. 예전 설정에는 없으므로 기본값(켬)이 그대로 이어진다
  // 말풍선(v1.2.0): 모두 새 키라서 예전 설정에는 없고, 없으면 기본값이 쓰인다
  bubbleEnabled: boolean;     // 주기적으로 뜨는 말풍선(내 메시지·시계·졸림 방지) 켬/끔
  bubbleMessages: string[];   // 내 메시지 최대 5개, 각 20자 이하. 순서대로 하나씩 돌린다
  bubbleShowSec: number;      // 한 번 보여주는 시간(초)
  bubbleGapSec: number;       // 메시지가 나오는 주기(초, 한 메시지가 나오고 다음 메시지가 나올 때까지)
  bubbleClock: boolean;       // 메시지가 없는 동안 현재 시간 표시
  introEnabled: boolean;      // 설정창 시작 인트로 보기(새 버전 첫 설정창에서만 한 번). 예전 설정에는 없으므로 기본값(켬)이 쓰인다
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
  lunchPreAlertEnabled: boolean;
  leavePreAlertEnabled: boolean;
  alarms: Alarm[];
  // 점심·퇴근 분리 전 키. 예전 버전으로 돌아가도 값이 남도록 지우지 않고, 마이그레이션 원본으로만 쓴다.
  breakTimeEnabled: boolean;
  preAlertMinutes: number;
}

export const DEFAULT_SETTINGS: PetSettings = {
  alwaysOnTop: true, petVisible: true, distractEmoji: true,
  workStart: '09:00', workEnd: '18:00', animalId: 'cat',
  customImages: [null, null, null], distractInterval: 30,
  imageRotateInterval: 60, imageRotateEnabled: true,
  bubbleEnabled: true, bubbleMessages: [], bubbleShowSec: 5, bubbleGapSec: 30, bubbleClock: true, introEnabled: true, useCustomMode: true, customShape: 'round', moveSpeed: 5, zone: 0, monitor: -1,
  yarEnabled: false, yarInterval: 60, buddyMode: 'buddy', size: 100,
  lunchEnabled: false, leaveEnabled: false, lunchTime: '12:00', leaveTime: '18:00',
  lunchPreAlertMinutes: 5, leavePreAlertMinutes: 5, lunchPreAlertEnabled: false, leavePreAlertEnabled: false, alarms: [],
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
  // 미리 알림 켬/끔(v1.4.1): 새 설치의 기본은 꺼짐이지만, 이미 저장된 설정은 예전처럼 항상 미리 알림이 있었으므로 켜짐으로 채워 동작을 바꾸지 않는다.
  fill('lunchPreAlertEnabled', true);
  fill('leavePreAlertEnabled', true);
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

// 설정을 한 번이라도 저장한 적이 있는지(완전 새 설치인지 가르는 데 쓴다)
export function hasStoredSettings(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
}

// 완전 새 설치의 기본 버디는 최애 하트. 기존 사용자의 저장값은 건드리지 않는다(마이그레이션 없음).
export const FRESH_ANIMAL_ID = 'heart';
// useCustomMode는 끈다: 설정창의 동물 바꾸기가 "동물" 탭(맨 앞 하트가 선택된 목록)으로 열린다. 사진을 올리면 업로드 경로가 다시 켠다.
export const freshDefaults = (): PetSettings => ({ ...DEFAULT_SETTINGS, animalId: FRESH_ANIMAL_ID, useCustomMode: false });

// 설정창이 새 설치(메인이 flags.json 없음 + 저장된 설정 없음)로 뜬 경우 하트 기본값을 한 번 저장한다.
// 창이 다시 그려져도(StrictMode 등) 결과가 바뀌지 않도록 첫 판단을 기억한다.
let freshSeeded: boolean | undefined;
export function seedFreshInstall(mainSaysFresh: boolean): boolean {
  if (freshSeeded === undefined) {
    freshSeeded = mainSaysFresh && !hasStoredSettings();
    if (freshSeeded) { seedFreshTheme(); saveSettings(freshDefaults()); }
  }
  return freshSeeded;
}

// 버디 창: 메인이 새 설치라고 알려 준 경우(#/pet?fresh=1)에만, 저장값이 없는 동안 하트를 보여 준다
export const isFreshWindow = (): boolean => window.location.hash.includes('fresh=1');

export function loadSettings(): PetSettings {
  const stored = readStoredSettings();
  return stored ? { ...DEFAULT_SETTINGS, ...stored } as PetSettings : (isFreshWindow() ? freshDefaults() : DEFAULT_SETTINGS);
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

// ── 말풍선 ────────────────────────────────────────────────────────────────
export const BUBBLE_MAX_MESSAGES = 5;
export const BUBBLE_MAX_CHARS = 20;               // 말풍선 두 줄 안에 잘리지 않는 길이
export const BUBBLE_SHOW_RANGE = [3, 15] as const;   // 표시 시간(초)
export const BUBBLE_GAP_RANGE = [10, 300] as const;  // 주기(초)

// 글자 수는 화면에 보이는 글자(이모지 한 개 = 1) 기준으로 센다
export const charCount = (text: string): number => Array.from(text).length;
export const clampTo = (v: number, [min, max]: readonly [number, number], fallback: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

// 저장된 메시지를 정리: 문자열만, 앞뒤 공백 제거, 빈 것 제외, 20자까지, 5개까지
export function cleanBubbleMessages(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is string => typeof m === 'string')
    .map(m => Array.from(m.trim()).slice(0, BUBBLE_MAX_CHARS).join(''))
    .filter(Boolean)
    .slice(0, BUBBLE_MAX_MESSAGES);
}

// 현재 시각을 "오후 6:00" 형식으로 (시스템 시간 기준)
export function clockText(d: Date = new Date()): string {
  return formatTime(`${d.getHours()}:${d.getMinutes()}`);
}

// 시각 표기 통일: "18:00" → "오후 6:00" (앞자리 0 없음)
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h < 12 ? '오전' : '오후';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour}:${String(m).padStart(2, '0')}`;
}
