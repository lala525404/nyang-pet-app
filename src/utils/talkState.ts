// 펫과의 대화에서 기억하는 "한 번만/며칠 쉬기" 표시. 설정(petSettings)과 따로 둔다(설정창이 저장할 때 덮어쓰지 않도록).
// 대화 내용 자체는 어디에도 저장하지 않는다. 여기에는 날짜와 플래그만 있다.

const KEY = 'petTalkState';
export interface TalkState {
  introShown?: boolean;          // "더블클릭하면 저랑 얘기할 수 있어요" 안내를 이미 했는지
  birthSnoozeUntil?: string;     // 생일 묻기를 이 날짜(YYYY-MM-DD)까지 쉰다
  birthdayShown?: string;        // 생일 축하를 보여 준 날짜
}

export function readTalkState(): TalkState {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function writeTalkState(patch: TalkState): TalkState {
  const next = { ...readTalkState(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 공간이 없어도 앱은 계속 */ }
  return next;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// 7일 쉬기: 오늘이 쉬는 날짜(포함) 이전이면 아직 묻지 않는다
export const BIRTH_SNOOZE_DAYS = 7;
export const snoozedUntil = (today: Date) => dayKey(addDays(today, BIRTH_SNOOZE_DAYS));
export const isSnoozed = (state: TalkState, today: Date) => !!state.birthSnoozeUntil && dayKey(today) < state.birthSnoozeUntil;
