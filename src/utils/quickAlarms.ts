import type { Alarm } from './settings';
import { addDays, isSkipped, occursOn, startOfDay, toMin, ymd } from './alarmSchedule';
import { alarmTitle } from './alarmText';

// 퀵 메뉴의 "오늘 울리는 알람" 목록(화면과 분리해 시험한다: tests/quick-menu-unit.cjs).
// 오늘 울리는지는 스케줄러(alarms.cjs의 dueActions)와 같은 규칙이다: 켜져 있고, 반복(요일·날짜·그 주만)이 오늘에 해당하고, "오늘만 건너뛰기"가 아닐 때.
// 목록에는 사용자가 직접 설정한 알람(설정의 alarms 항목: 캘린더·알람 화면·알람 대화로 만든 것)만 보인다.
// 점심·퇴근 기본 알림은 표시만 뺀다(울리는 동작과 설정은 그대로이고, "점심 알람 꺼줘" 같은 끄기 흐름도 그대로다). 읽기만 하고 알람 설정이나 스케줄러는 바꾸지 않는다.

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

// ── 주 단위 조회 ─────────────────────────────────────────────────────────────
// 카드에는 최대 CARD_MAX_ITEMS개만 보이고, 더 있으면 "+N개 더보기"로 설정창 알람 화면의 주간 캘린더로 보낸다.
export const CARD_MAX_ITEMS = 3;
export interface WeekAlarmItem extends TodayAlarmItem { date: string; heading: string }   // heading: "월 10/26"
const DAY_CHARS = ['일', '월', '화', '수', '목', '금', '토'];

// weekStart(월요일)부터 7일의 직접 설정한 알람(반복은 날마다 occursOn으로 펼친다). 날짜·시각 순. 점심·퇴근은 넣지 않는다.
// 오늘이 든 주면 지난 알람은 흐리게, 다음 알람은 오늘 것에만 붙는다. 다른 주는 지남·다음 표시가 없다.
export function weekAlarmList(s: QuickAlarmSettings | null, now: Date, weekStart: Date): WeekAlarmItem[] {
  const out: WeekAlarmItem[] = [];
  let nextSeen = false;
  const todayYmd = ymd(now);
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const isToday = ymd(day) === todayYmd;
    const past = day.getTime() < startOfDay(now).getTime();
    const heading = `${DAY_CHARS[day.getDay()]} ${day.getMonth() + 1}/${day.getDate()}`;
    for (const it of todayAlarmList(s, now, day)) {
      let next = false;
      if (isToday && it.next && !nextSeen) { next = true; nextSeen = true; }
      out.push({ ...it, date: ymd(day), heading, past: past || it.past, next, minutesUntil: next ? it.minutesUntil : null });
    }
  }
  return out;
}

// 카드에 보일 몫과 남은 개수: 전체 합계가 기준이다(요일 묶음별이 아니다)
export function limitItems<T>(items: T[], max: number = CARD_MAX_ITEMS): { shown: T[]; more: number } {
  return items.length > max ? { shown: items.slice(0, max), more: items.length - max } : { shown: items, more: 0 };
}

// 주 조회의 머리글: "이번 주 · 10/19(월)~10/25(일)"
export function weekTitle(label: string, weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const f = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${DAY_CHARS[d.getDay()]})`;
  return `${label} · ${f(weekStart)}~${f(end)}`;
}
// 그 주에 직접 설정한 알람이 없을 때: "다음 주에 직접 설정한 알람이 없어요"
export function noWeekAlarmText(label: string): string { return `${label}에 직접 설정한 알람이 없어요`; }

// "N분 뒤" / "1시간 20분 뒤" / 지금 울리는 분이면 "지금"
export function untilText(minutes: number): string {
  if (minutes <= 0) return '지금';
  if (minutes < 60) return `${minutes}분 뒤`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h}시간 ${m}분 뒤` : `${h}시간 뒤`;
}

// 보여 줄 알람이 없을 때의 안내(기본 알림이 켜져 있다는 말은 넣지 않는다): 오늘은 "오늘 직접 설정한 알람이 없어요", 날짜를 지정하면 "10월 25일에 설정한 알람이 없어요"
export const NO_ALARM_TEXT = '오늘 직접 설정한 알람이 없어요';
export function noAlarmText(day: Date, now: Date): string {
  const same = day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate();
  return same ? NO_ALARM_TEXT : `${day.getMonth() + 1}월 ${day.getDate()}일에 설정한 알람이 없어요`;
}
// 날짜를 지정한 조회의 제목: "10월 25일(일) 알람"
export function dayTitle(day: Date, now: Date): string {
  const diff = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  const label = ['일', '월', '화', '수', '목', '금', '토'][day.getDay()];
  const base = `${day.getMonth() + 1}월 ${day.getDate()}일(${label})`;
  return diff === 0 ? '오늘 알람' : diff === 1 ? `내일 알람 · ${base}` : `${base} 알람`;
}
