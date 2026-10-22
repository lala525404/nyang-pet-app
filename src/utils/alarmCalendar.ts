import type { Alarm } from './settings';
import { addDays, isPastOneShot, isSkipped, mondayOf, occursOn, parseYmd, toMin, WEEKDAY_LABELS } from './alarmSchedule';

// 주간 캘린더 배치 계산(화면과 분리해 시험한다). 시간 축은 하루 전체(00:00~24:00)를 그리고 처음에는 오전 8시 근처로 스크롤한다.
export const HOUR_PX = 48;                 // 한 시간의 높이
export const SLOT_MIN = 30;                // 빈 칸을 눌렀을 때 시각을 맞추는 단위(분)
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MIN;
export const DEFAULT_SCROLL_HOUR = 8;      // 처음 보이는 시각(오전 8시부터 약 12시간이 한눈에 보인다)
export const MIN_EVENT_MIN = 30;           // 종료 시각이 없어도 카드가 이만큼은 보이게

export const weekDates = (weekStart: Date): Date[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));   // 월~일
export const weekStartOf = (d: Date): Date => mondayOf(d);
export const minToY = (min: number): number => (min / 60) * HOUR_PX;

// 위에서부터의 y(px) → 30분 단위 슬롯 번호(0~47)
export const slotFromY = (y: number): number => Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(y / ((SLOT_MIN / 60) * HOUR_PX))));
export const slotToMinutes = (slot: number): number => slot * SLOT_MIN;

export interface DayEvent {
  alarm: Alarm; startMin: number; endMin: number;
  col: number; cols: number;           // 같은 시간대에 겹치면 옆으로 나눠 그린다
  dim: boolean;                        // 꺼짐·오늘만 건너뜀·지난 한 번짜리 알람은 흐리게
  past: boolean;                       // 지난(완료된) 한 번짜리 알람
}

// 그 날의 알람 카드들. 자정을 넘는 일정(종료가 시작보다 이르면)은 시작한 날 기준으로 그 날 끝까지만 그린다.
export function dayEvents(alarms: Alarm[], day: Date, now: Date): DayEvent[] {
  const list: DayEvent[] = alarms.filter(a => a.time && occursOn(a, day)).map(a => {
    const startMin = toMin(a.time); const e = a.endTime ? toMin(a.endTime) : -1;
    const endMin = e > startMin ? e : e >= 0 && e < startMin ? 24 * 60 : startMin + MIN_EVENT_MIN;
    const past = isPastOneShot(a, now);
    return { alarm: a, startMin, endMin: Math.min(endMin, 24 * 60), col: 0, cols: 1, dim: !a.enabled || isSkipped(a, day) || past, past };
  }).sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin);
  // 겹치는 것끼리 묶어(클러스터) 칸 번호를 매긴다
  let cluster: DayEvent[] = []; let clusterEnd = -1;
  const flush = () => { const cols = Math.max(1, ...cluster.map(e => e.col + 1)); cluster.forEach(e => { e.cols = cols; }); cluster = []; clusterEnd = -1; };
  for (const ev of list) {
    if (cluster.length && ev.startMin >= clusterEnd) flush();
    const used = new Set(cluster.filter(c => c.endMin > ev.startMin).map(c => c.col)); let col = 0; while (used.has(col)) col++;
    ev.col = col; cluster.push(ev); clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();
  return list;
}

export const dayLabel = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`;
export const weekdayLabel = (d: Date): string => WEEKDAY_LABELS[d.getDay()];
export const weekRangeLabel = (weekStart: Date): string => {
  const end = addDays(weekStart, 6);
  return `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 – ${end.getMonth() + 1 === weekStart.getMonth() + 1 ? '' : `${end.getMonth() + 1}월 `}${end.getDate()}일`;
};

// 앞으로 울릴 "한 번짜리" 알람(날짜 지정·그 주만)을 시각 순으로. 캘린더가 다른 주에 있는 날짜 알람으로 이동하는 안내에 쓴다.
export interface UpcomingOneShot { alarm: Alarm; at: Date }
export function upcomingOneShots(alarms: Alarm[], now: Date): UpcomingOneShot[] {
  const out: UpcomingOneShot[] = [];
  for (const a of alarms) {
    const r = a.repeat; if (!a.enabled || !a.time || !r || r.kind === 'weekly') continue;
    const [h, m] = a.time.split(':').map(Number);
    const dates = r.kind === 'date' ? [parseYmd(r.date)] : r.days.map(d => addDays(parseYmd(r.weekStart), (d + 6) % 7));
    for (const day of dates) { if (isSkipped(a, day)) continue; const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m); if (at.getTime() >= now.getTime()) out.push({ alarm: a, at }); }
  }
  return out.sort((x, y) => x.at.getTime() - y.at.getTime());
}
export const hourLabel = (h: number): string => `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`;
