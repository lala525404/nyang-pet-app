import type { Alarm } from './settings';
import { addDays, isPastOneShot, isSkipped, mondayOf, occursOn, parseYmd, repeatSummary, startOfDay, toMin, ymd, WEEKDAY_LABELS } from './alarmSchedule';
import { alarmTitle, formatAttendees, formatRange } from './alarmText';
import { formatTime } from './settings';

// 주간 캘린더 계산(화면과 분리해 시험한다). 시간 축은 없다: 일자(월~일) 열 아래로 그날의 알람이 시각 순으로 쌓이고,
// 오전/오후만 구분선으로 나눈다. 알람이 많은 날은 길어지고 없는 날은 비어 있어 한눈에 차이가 보인다(구글 시트처럼).
export const NOON_MIN = 12 * 60;           // 정오부터 오후
export const DEFAULT_AM_TIME = '09:00';    // 오전 칸의 빈 곳을 눌렀을 때 새 알람의 기본 시각
export const DEFAULT_PM_TIME = '14:00';    // 오후 칸

export type Zone = 'am' | 'pm';
export const zoneOf = (startMin: number): Zone => (startMin < NOON_MIN ? 'am' : 'pm');
export const defaultTimeFor = (zone: Zone): string => (zone === 'am' ? DEFAULT_AM_TIME : DEFAULT_PM_TIME);

// 오늘보다 이전 날짜인지(날짜만 비교, 시각은 보지 않는다). 지난 날짜의 빈 칸에는 새 알람을 만들 수 없다. 오늘은 지났어도 만들 수 있다.
export const PAST_DAY_NOTICE = '지난 날짜에는 알람을 만들 수 없어요';
export const isPastDay = (day: Date, now: Date): boolean => startOfDay(day).getTime() < startOfDay(now).getTime();

export const weekDates = (weekStart: Date): Date[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));   // 월~일
export const weekStartOf = (d: Date): Date => mondayOf(d);

export interface DayEvent {
  alarm: Alarm; startMin: number; endMin: number;
  dim: boolean;                        // 꺼짐·오늘만 건너뜀·지난 한 번짜리 알람은 흐리게
  past: boolean;                       // 지난(완료된) 한 번짜리 알람
}

// 그 날의 알람들을 시각 순으로(같으면 종료 시각, id 순). 자정을 넘는 일정(종료가 시작보다 이르면)도 시작한 날에만 둔다.
export function dayEvents(alarms: Alarm[], day: Date, now: Date): DayEvent[] {
  return alarms.filter(a => a.time && occursOn(a, day)).map(a => {
    const startMin = toMin(a.time); const e = a.endTime ? toMin(a.endTime) : -1;
    const past = isPastOneShot(a, now);
    return { alarm: a, startMin, endMin: e > startMin ? e : startMin, dim: !a.enabled || isSkipped(a, day) || past, past };
  }).sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin || (x.alarm.id < y.alarm.id ? -1 : 1));
}

export interface DayStack {
  am: DayEvent[]; pm: DayEvent[];
  count: number;                                       // 그날 알람 수(꺼진 것 포함)
  nowAt: { zone: Zone; index: number } | null;         // 오늘이면 "지금" 표시가 들어갈 자리: 그 칸에서 지금보다 이른 알람 수
}
export function stackDay(alarms: Alarm[], day: Date, now: Date): DayStack {
  const all = dayEvents(alarms, day, now);
  const am = all.filter(e => zoneOf(e.startMin) === 'am'), pm = all.filter(e => zoneOf(e.startMin) === 'pm');
  let nowAt: DayStack['nowAt'] = null;
  if (ymd(day) === ymd(now)) {
    const nowMin = now.getHours() * 60 + now.getMinutes(); const zone = zoneOf(nowMin); const list = zone === 'am' ? am : pm;
    if (list.length) nowAt = { zone, index: list.filter(e => e.startMin <= nowMin).length };
  }
  return { am, pm, count: all.length, nowAt };
}

export const dayLabel = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`;
export const weekdayLabel = (d: Date): string => WEEKDAY_LABELS[d.getDay()];
export const weekRangeLabel = (weekStart: Date): string => {
  const end = addDays(weekStart, 6);
  return `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 – ${end.getMonth() + 1 === weekStart.getMonth() + 1 ? '' : `${end.getMonth() + 1}월 `}${end.getDate()}일`;
};

// 블록에 마우스를 올렸을 때 뜨는 간단한 정보(이름 → 시간 → 반복 → 참석자 → 메모 → 미리 알림 → 상태)
export interface TipInfo { title: string; lines: string[]; status: string }
export function tooltipInfo(a: Alarm, day: Date, past: boolean): TipInfo {
  const lines: string[] = [];
  lines.push(formatRange(a.time, a.endTime) || formatTime(a.time));
  lines.push(repeatSummary(a));
  const att = formatAttendees(a.attendees); if (att) lines.push(att);
  const memo = (a.memo || '').trim(); if (memo) lines.push(memo);
  if ((a.preMinutes ?? 0) > 0) lines.push(`${a.preMinutes}분 전에 미리 알림`);
  const status = past ? '지남' : !a.enabled ? '꺼짐' : isSkipped(a, day) ? '오늘은 건너뜀' : '';
  return { title: alarmTitle(a), lines, status };
}

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
