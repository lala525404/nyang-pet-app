import type { WeatherData } from '../electron';
import { holidayName } from '../data/holidays';
import { todayAlarmList } from './quickAlarms';
import type { QuickAlarmSettings } from './quickAlarms';
import { KIND_LABEL } from './alarmKind';
import { formatTemp, todayDay, weatherLabel } from './weatherCard';

// 부팅 후 오늘 브리핑(화면·시계와 분리한 순수 계산: tests/brief-unit.cjs). 모든 입력(지금 시각·알람·공휴일·날씨 캐시)은 인자로 받는다.
//  - 언제 띄울지(부팅 3분)는 메인의 brief-schedule.cjs가 정하고, 여기서는 "띄울지 말지"와 "무엇을 보일지"만 정한다.
//  - 내용은 로컬 데이터뿐이다: 오늘 날짜·요일(+공휴일), 오늘 사용자 일정/알람(점심·퇴근 기본 알림은 세지 않는다), 이미 받아 둔 날씨 한 줄, 퇴근 시간 한 줄.

export const BRIEF_MAX_ITEMS = 3;
export const BRIEF_EMPTY_TEXT = '오늘은 등록된 일정이 없어요';
export const BRIEF_ALL_PAST_TEXT = '오늘 남은 일정은 없어요';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (n: number) => String(n).padStart(2, '0');
export const ymdOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export interface BriefItem { time: string; title: string; label: string }   // label: "일정" | "알람"
export interface BriefContent {
  dateText: string;            // "10월 26일 월요일"
  holiday: string | null;      // 공휴일이면 이름
  items: BriefItem[];          // 아직 안 지난 오늘 일정/알람, 시각순, 최대 3개
  more: number;                // 3개를 넘는 만큼("+N개 더보기")
  emptyText: string | null;    // 보일 항목이 없을 때의 문구
  hasToday: boolean;           // 오늘 사용자 일정/알람이 하나라도 있는가(이미 지난 것 포함: 주말·공휴일에 띄울지 정한다)
  weather: string | null;      // 캐시된 날씨 한 줄(없으면 생략)
  leave: string | null;        // "퇴근 18:00"(퇴근 시간 설정이 있을 때)
}

export interface BriefInput {
  now: Date;
  settings: QuickAlarmSettings | null;   // 알람 목록(설정의 alarms)
  leaveEnabled: boolean;
  leaveTime: string;
  weather: WeatherData | null;           // 이미 받아 둔 캐시만(없으면 null)
}

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);

// 날씨 한 줄: "맑음 18° · 최고 22° / 최저 12°" (+ 강수 확률이 높으면 " · 비 올 확률 60%")
export function weatherLine(data: WeatherData | null | undefined, nowMs: number): string | null {
  if (!data || typeof data.temp !== 'number' || !Number.isFinite(data.temp) || typeof data.code !== 'number') return null;
  const parts = [`${weatherLabel(data.code).text} ${formatTemp(data.temp)}`];
  const day = todayDay(data, nowMs);
  if (day && typeof day.max === 'number' && typeof day.min === 'number') parts.push(`최고 ${formatTemp(day.max)} / 최저 ${formatTemp(day.min)}`);
  if (day && typeof day.pop === 'number' && day.pop >= 50) parts.push(`비 올 확률 ${Math.round(day.pop)}%`);
  return parts.join(' · ');
}

export function buildBrief(input: BriefInput): BriefContent {
  const { now } = input;
  const all = todayAlarmList(input.settings, now);   // 오늘 켜져 있고 건너뛰지 않은 사용자 알람(시각순). 점심·퇴근 기본 알림은 목록에 없다
  const left = all.filter(a => !a.past);
  const items = left.slice(0, BRIEF_MAX_ITEMS).map(a => ({ time: a.time, title: a.title, label: KIND_LABEL[a.sched] }));
  const hol = holidayName(now);
  return {
    dateText: `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일`,
    holiday: hol,
    items,
    more: Math.max(0, left.length - BRIEF_MAX_ITEMS),
    emptyText: all.length === 0 ? BRIEF_EMPTY_TEXT : left.length === 0 ? BRIEF_ALL_PAST_TEXT : null,
    hasToday: all.length > 0,
    weather: weatherLine(input.weather, now.getTime()),
    leave: input.leaveEnabled && isTime(input.leaveTime) ? `퇴근 ${input.leaveTime.padStart(5, '0')}` : null,
  };
}

// 띄울지 말지. force(시험용·"지금 브리핑 보기")는 조건을 모두 무시한다.
//  - 끄면 띄우지 않는다(lastBriefDate도 건드리지 않는다). 오늘 이미 띄웠으면 다시 띄우지 않는다(같은 날 앱을 다시 켜도).
//  - 평일은 기본으로, 주말·공휴일은 오늘 사용자 일정/알람이 있을 때만.
export function shouldShowBrief(a: { enabled: unknown; lastBriefDate: unknown; now: Date; hasToday: boolean; force?: boolean }): boolean {
  if (a.force) return true;
  if (a.enabled === false) return false;
  if (a.lastBriefDate === ymdOf(a.now)) return false;
  const dow = a.now.getDay();
  const offDay = dow === 0 || dow === 6 || holidayName(a.now) !== null;
  return !offDay || a.hasToday;
}

export interface BriefPayload { day?: string; force?: boolean; manual?: boolean }
export type BriefDecision = { view: { kind: 'brief'; content: BriefContent; persist: boolean; day: string } } | { skip: true };

// 카드 창이 부르는 최종 판단. persist: 보인 날을 lastBriefDate로 저장할지(시험용·수동 보기는 저장하지 않는다)
//  - 기다리는 사이 날이 바뀌었으면(payload.day가 오늘이 아니면) 띄우지 않는다("같은 날 안에 한 번만")
//  - 저장된 설정이 아직 없는 새 설치(stored 없음)에서는 띄우지 않는다(기본값을 대신 저장하지 않는다)
export function decideBrief(p: BriefPayload | null, a: { stored: Record<string, unknown> | null; now: Date; settings: QuickAlarmSettings | null; leaveEnabled: boolean; leaveTime: string; weather: WeatherData | null }): BriefDecision {
  const force = !!(p && (p.force || p.manual));
  const today = ymdOf(a.now);
  if (!force) {
    if (!a.stored) return { skip: true };
    if (!p || p.day !== today) return { skip: true };
  }
  const content = buildBrief({ now: a.now, settings: a.settings, leaveEnabled: a.leaveEnabled, leaveTime: a.leaveTime, weather: a.weather });
  const ok = shouldShowBrief({ enabled: a.stored ? a.stored.briefEnabled : undefined, lastBriefDate: a.stored ? a.stored.lastBriefDate : undefined, now: a.now, hasToday: content.hasToday, force });
  if (!ok) return { skip: true };
  return { view: { kind: 'brief', content, persist: !force, day: today } };
}
