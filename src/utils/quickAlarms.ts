import type { Alarm } from './settings';
import { isSkipped, occursOn, toMin } from './alarmSchedule';
import { alarmTitle } from './alarmText';

// 퀵 메뉴의 "오늘 울리는 알람" 목록(화면과 분리해 시험한다: tests/quick-menu-unit.cjs).
// 오늘 울리는지는 스케줄러(alarms.cjs의 dueActions)와 같은 규칙이다: 켜져 있고, 반복(요일·날짜·그 주만)이 오늘에 해당하고, "오늘만 건너뛰기"가 아닐 때.
// 점심·퇴근 알림은 켜져 있으면 요일과 상관없이 매일 울린다. 읽기만 하고 알람 설정이나 스케줄러는 바꾸지 않는다.

export interface QuickAlarmSettings { lunchOn: boolean; leaveOn: boolean; lunchTime: string; leaveTime: string; alarms: Alarm[] }

export interface TodayAlarmItem {
  id: string;
  time: string;          // HH:MM
  title: string;         // 알람 이름, 이름이 없으면 종류 이름(점심·퇴근·알람)
  kind: 'lunch' | 'leave' | 'alarm';
  past: boolean;         // 이미 지난 시각(분 단위로 비교: 지금 이 분은 지난 게 아니다)
  next: boolean;         // 아직 안 지난 것 중 가장 이른 것
  minutesUntil: number | null;   // next일 때만: 몇 분 뒤
}

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);
const pad = (n: number) => String(n).padStart(2, '0');
const normTime = (v: string) => { const [h, m] = v.split(':'); return `${pad(Number(h))}:${m}`; };

// day를 주면 그날의 목록(알람 대화의 조회). 오늘이 아니면 지난 알람·다음 알람 표시는 없다.
export function todayAlarmList(s: QuickAlarmSettings | null, now: Date, day: Date = now): TodayAlarmItem[] {
  if (!s) return [];
  const sameDay = day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate();
  const nowMin = sameDay ? now.getHours() * 60 + now.getMinutes() : -1;
  const raw: { id: string; time: string; title: string; kind: TodayAlarmItem['kind']; order: number }[] = [];
  if (s.lunchOn && isTime(s.lunchTime)) raw.push({ id: 'lunch', time: normTime(s.lunchTime), title: '점심', kind: 'lunch', order: 0 });
  if (s.leaveOn && isTime(s.leaveTime)) raw.push({ id: 'leave', time: normTime(s.leaveTime), title: '퇴근', kind: 'leave', order: 0 });
  for (const a of s.alarms ?? []) {
    if (!a || !a.enabled || !isTime(a.time)) continue;
    if (!occursOn(a, day) || isSkipped(a, day)) continue;
    raw.push({ id: a.id, time: normTime(a.time), title: alarmTitle({ name: a.name }), kind: 'alarm', order: 1 });
  }
  raw.sort((x, y) => toMin(x.time) - toMin(y.time) || x.order - y.order || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  let nextSeen = false;
  return raw.map(r => {
    const past = sameDay && toMin(r.time) < nowMin;
    const next = sameDay && !past && !nextSeen;
    if (next) nextSeen = true;
    return { id: r.id, time: r.time, title: r.title, kind: r.kind, past, next, minutesUntil: next ? toMin(r.time) - nowMin : null };
  });
}

// "N분 뒤" / "1시간 20분 뒤" / 지금 울리는 분이면 "지금"
export function untilText(minutes: number): string {
  if (minutes <= 0) return '지금';
  if (minutes < 60) return `${minutes}분 뒤`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h}시간 ${m}분 뒤` : `${h}시간 뒤`;
}

export const NO_ALARM_TEXT = '오늘은 알람이 없어요';
// 날짜를 지정한 조회의 제목·빈 문구: "10월 25일(일) 알람" / "이 날은 알람이 없어요"
export const NO_ALARM_DAY_TEXT = '이 날은 알람이 없어요';
export function dayTitle(day: Date, now: Date): string {
  const diff = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  const label = ['일', '월', '화', '수', '목', '금', '토'][day.getDay()];
  const base = `${day.getMonth() + 1}월 ${day.getDate()}일(${label})`;
  return diff === 0 ? '오늘 알람' : diff === 1 ? `내일 알람 · ${base}` : `${base} 알람`;
}
