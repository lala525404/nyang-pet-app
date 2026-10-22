import type { Alarm } from './settings';

// 알람 반복 규칙(설정창·캘린더용). 메인 프로세스의 alarms.cjs와 같은 규칙이어야 한다(tests/alarms-unit.cjs가 둘이 같은 결과를 내는지 비교한다).
//   weekly: 매주 지정한 요일마다 | date: 특정 날짜 한 번 | week: 그 주(월~일)의 지정한 요일만 | 없음: 예전 알람처럼 매일
export type AlarmRepeat =
  | { kind: 'weekly'; days: number[] }                 // 0=일 … 6=토
  | { kind: 'date'; date: string }                     // YYYY-MM-DD
  | { kind: 'week'; weekStart: string; days: number[] }; // weekStart는 그 주 월요일 YYYY-MM-DD

export const MAX_ALARMS = 50;
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;   // 화면 순서: 월~일
export const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: '매일', days: [0, 1, 2, 3, 4, 5, 6] }, { label: '평일', days: [1, 2, 3, 4, 5] }, { label: '주말', days: [0, 6] },
];

const pad2 = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const isYmd = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number); const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
};
export const parseYmd = (v: string): Date => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number): Date => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const mondayOf = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));   // 그 날이 속한 주의 월요일
export const toMin = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const minToTime = (m: number): string => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;

// 그 날(Date)에 이 알람이 예정돼 있는지. 켬/끔·건너뛰기는 보지 않는다.
export function occursOn(a: Pick<Alarm, 'repeat'>, day: Date): boolean {
  const r = a.repeat; if (!r) return true;
  if (r.kind === 'weekly') return r.days.includes(day.getDay());
  if (r.kind === 'date') return r.date === ymd(day);
  if (r.kind === 'week') { const diff = Math.round((startOfDay(day).getTime() - parseYmd(r.weekStart).getTime()) / 86400000); return diff >= 0 && diff < 7 && r.days.includes(day.getDay()); }
  return true;
}
export const isSkipped = (a: Pick<Alarm, 'skipDate'>, day: Date): boolean => !!a.skipDate && a.skipDate === ymd(day);

// 예전 알람(반복 정보 없음)은 화면에서 "매일"(요일 7개 모두 선택)로 보인다
export const effectiveDays = (a: Pick<Alarm, 'repeat'>): number[] => {
  const r = a.repeat; if (!r) return [0, 1, 2, 3, 4, 5, 6];
  return r.kind === 'date' ? [parseYmd(r.date).getDay()] : r.days;
};

// 한 번만 울리는 알람(날짜·그 주만)이 마지막으로 울릴 시각. 반복 알람은 null.
export function lastOccurrence(a: Pick<Alarm, 'repeat' | 'time'>): Date | null {
  const r = a.repeat; if (!r || r.kind === 'weekly') return null;
  const [h, m] = a.time.split(':').map(Number);
  if (r.kind === 'date') { const d = parseYmd(r.date); d.setHours(h, m, 0, 0); return d; }
  const ws = parseYmd(r.weekStart); const dates = r.days.map(day => addDays(ws, (day + 6) % 7)); const last = dates.reduce((x, y) => (x > y ? x : y)); last.setHours(h, m, 0, 0); return last;
}
// 지난(완료된) 한 번짜리 알람인지: 마지막으로 울릴 시각이 지났다
export function isPastOneShot(a: Pick<Alarm, 'repeat' | 'time'>, now: Date): boolean { const l = lastOccurrence(a); return !!l && l.getTime() < now.getTime(); }

const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
// 목록·편집 창에 보여 줄 한 줄 요약: 매일 / 평일 / 주말 / 매주 월·수 / 10월 27일(화) / 그 주만 수·금
export function repeatSummary(a: Pick<Alarm, 'repeat'>): string {
  const r = a.repeat; const names = (days: number[]) => WEEK_ORDER.filter(d => days.includes(d)).map(d => WEEKDAY_LABELS[d]).join('·');
  if (!r) return '매일';
  if (r.kind === 'date') { const d = parseYmd(r.date); return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY_LABELS[d.getDay()]})`; }
  const pre = DAY_PRESETS.find(p => sameDays([...p.days].sort(), [...r.days].sort()));
  if (r.kind === 'week') return `그 주만 ${pre ? pre.label : names(r.days)}`;
  return pre ? pre.label : `매주 ${names(r.days)}`;
}
