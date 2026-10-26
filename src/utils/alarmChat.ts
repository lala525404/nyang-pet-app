import type { Alarm, PetSettings } from './settings';
import { MAX_ALARMS, WEEKDAY_LABELS, addDays, isPastOneShot, isSkipped, occursOn, parseYmd, startOfDay, toMin } from './alarmSchedule';
import { alarmTitle } from './alarmText';
import type { AlarmCommand, Meridiem } from './alarmCommand';

// 알람 대화의 "해석 결과 → 실제 알람" 쪽(순수 함수): 만들 알람 만들기, 지울 알람 찾기, 확인 문구, 설정 값 바꾸기(만들기·지우기·끄기·되돌리기).
// 저장 경로는 설정창과 같다(saveSettings + syncSettings): 별도 저장소를 만들지 않는다. 입력 문장은 여기에 들어오지 않는다(해석 결과만).

export type CreateCommand = Extract<AlarmCommand, { kind: 'create' }>;
export type CancelCommand = Extract<AlarmCommand, { kind: 'cancel' }>;

export const newAlarmId = (): string => `${Date.now()}${Math.floor(Math.random() * 1000)}`;   // 설정창(AlarmPane)과 같은 형식

// 날짜 한 번짜리 알람(repeat: date): 설정창 캘린더가 만드는 것과 같은 모양. 그날 그 시각에 한 번만 울리고 지나면 "완료"로 흐려진다(스케줄러 규칙 그대로)
export function buildAlarm(cmd: CreateCommand, id: string): Alarm {
  return { id, time: cmd.time, enabled: true, ...(cmd.title ? { name: cmd.title } : {}), repeat: { kind: 'date', date: cmd.date } };
}

// ── 문구 ─────────────────────────────────────────────────────────────────────
export function whenParts(date: string, time: string): { dateText: string; timeText: string; noteText: string } {
  const d = parseYmd(date), [h, m] = time.split(':').map(Number);
  const dateText = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY_LABELS[d.getDay()]}요일`;
  const period = h < 12 ? '오전' : '오후', hh = h % 12 === 0 ? 12 : h % 12;
  const timeText = `${period} ${hh}시${m ? ` ${m}분` : ''}`;
  const noteText = h === 12 && m === 0 ? '정오' : h === 0 && m === 0 ? '자정' : '';
  return { dateText, timeText, noteText };
}
export function createQuestion(cmd: CreateCommand): { head: string; big: string; note: string; question: string } {
  const p = whenParts(cmd.date, cmd.time);
  const prev = cmd.midnight ? parseYmd(cmd.date) : null;
  const night = prev ? `${addDays(prev, -1).getMonth() + 1}월 ${addDays(prev, -1).getDate()}일 밤 12시` : '';
  return {
    head: p.dateText,
    big: `${p.timeText}${p.noteText ? ` (${p.noteText})` : ''}`,
    note: night ? `${night}이에요` : '',
    question: `${p.dateText} ${p.timeText}에 ${cmd.title ? `'${cmd.title}' ` : ''}알람을 만들까요?`,
  };
}

// ── 오전/오후 되묻기 ─────────────────────────────────────────────────────────
// "3시"처럼 구분이 없는 시각은 두 개의 큰 버튼으로 고르게 한다. 12시는 [정오 12시] [자정 12시(밤 12시)].
export type MeridiemAsk = Extract<AlarmCommand, { kind: 'needsMeridiem' }>;
export function meridiemQuestion(cmd: MeridiemAsk): { title: string; choices: { label: string; meridiem: Meridiem }[] } {
  const mm = cmd.minute ? ` ${cmd.minute}분` : '';
  const when = `${cmd.hour}시${mm}`;
  return {
    title: `몇 시인가요? ${when}${cmd.minute ? '이' : '가'} ${cmd.hour === 12 ? '정오인지 자정인지' : '오전인지 오후인지'} 골라 주세요`,
    choices: cmd.hour === 12
      ? [{ label: `정오 ${when}`, meridiem: 'pm' }, { label: `자정 ${when}(밤 12시)`, meridiem: 'night' }]
      : [{ label: `오전 ${when}`, meridiem: 'am' }, { label: `오후 ${when}`, meridiem: 'pm' }],
  };
}

// ── 지울 알람 찾기 ─────────────────────────────────────────────────────────────
export interface DeleteContext { alarms: Alarm[]; lunchOn: boolean; leaveOn: boolean; lunchTime: string; leaveTime: string }
export type Target =
  | { kind: 'alarm'; alarm: Alarm; label: string; sortKey: number }
  | { kind: 'lunch' | 'leave'; time: string; label: string; sortKey: number };   // 점심·퇴근 기본 알람: 지우지 않고 "끄기"만

// 다음에 울리는 시각(없으면 null): 켜짐 여부와 상관없이 일정상의 다음 날짜(오늘 시각이 지났으면 내일부터)
export function nextOccurrence(a: Alarm, now: Date): Date | null {
  for (let i = 0; i < 400; i++) {
    const day = addDays(startOfDay(now), i);
    if (!occursOn(a, day) || isSkipped(a, day)) continue;
    const [h, m] = a.time.split(':').map(Number);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
    if (i === 0 && at.getTime() <= now.getTime()) continue;   // 오늘 시각이 이미 지났으면 다음 날짜부터
    return at;
  }
  return null;
}
const pad2 = (n: number) => String(n).padStart(2, '0');
function labelOf(at: Date | null, title: string): string {
  if (!at) return title;
  const hh = at.getHours() % 12 === 0 ? 12 : at.getHours() % 12;
  return `${at.getMonth() + 1}월 ${at.getDate()}일(${WEEKDAY_LABELS[at.getDay()]}) ${at.getHours() < 12 ? '오전' : '오후'} ${hh}:${pad2(at.getMinutes())} · ${title}`;
}

export function findTargets(cmd: CancelCommand, ctx: DeleteContext, now: Date): Target[] {
  const out: Target[] = [];
  const q = cmd.title.trim().toLowerCase();
  const day = cmd.date ? parseYmd(cmd.date) : null;
  const matchTime = (t: string): boolean => {
    if (cmd.time) return t === cmd.time;
    if (cmd.hour12 !== null) { const [h, m] = t.split(':').map(Number); return h % 12 === cmd.hour12 && m === (cmd.minute ?? 0); }
    return true;
  };
  for (const a of ctx.alarms) {
    if (isPastOneShot(a, now)) continue;   // 오늘 이후의 알람만(이미 지난 한 번짜리는 대상이 아니다)
    if (day && !occursOn(a, day)) continue;
    if (!matchTime(a.time)) continue;
    if (q && !(a.name ?? '').toLowerCase().includes(q)) continue;
    const next = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(a.time.slice(0, 2)), Number(a.time.slice(3, 5))) : nextOccurrence(a, now);
    out.push({ kind: 'alarm', alarm: a, label: labelOf(next, alarmTitle(a)), sortKey: next ? next.getTime() : Number.MAX_SAFE_INTEGER });
  }
  // 점심·퇴근: 이름을 말했거나(시각이 같으면) 켜져 있을 때만. 지우지 않고 끄기만 한다
  if (!cmd.all) {
    for (const [kind, name, on, time] of [['lunch', '점심', ctx.lunchOn, ctx.lunchTime], ['leave', '퇴근', ctx.leaveOn, ctx.leaveTime]] as const) {
      if (!on) continue;
      const named = q.includes(name);
      const byTime = !q && (cmd.time !== null || cmd.hour12 !== null) && matchTime(time) && !day;
      if (!named && !byTime) continue;
      if (q && !named) continue;
      if (cmd.time !== null || cmd.hour12 !== null) { if (!matchTime(time)) continue; }
      out.push({ kind, time, label: `매일 ${name} 알림 · ${time}`, sortKey: toMin(time) });
    }
  }
  return out.sort((a, b) => a.sortKey - b.sortKey);
}

// ── 설정 값 바꾸기(순수) ─────────────────────────────────────────────────────────
export type Mutation = { ok: true; settings: PetSettings } | { ok: false; reason: 'limit' };
export function withAlarmAdded(s: PetSettings, alarm: Alarm): Mutation {
  if (s.alarms.length >= MAX_ALARMS) return { ok: false, reason: 'limit' };
  return { ok: true, settings: { ...s, alarms: [...s.alarms, alarm] } };
}
export function withAlarmsRemoved(s: PetSettings, ids: string[]): PetSettings { const set = new Set(ids); return { ...s, alarms: s.alarms.filter(a => !set.has(a.id)) }; }
export function withDefaultOff(s: PetSettings, kind: 'lunch' | 'leave'): PetSettings { return kind === 'lunch' ? { ...s, lunchEnabled: false } : { ...s, leaveEnabled: false }; }
export function withDefaultOn(s: PetSettings, kind: 'lunch' | 'leave'): PetSettings { return kind === 'lunch' ? { ...s, lunchEnabled: true } : { ...s, leaveEnabled: true }; }
// 되돌리기: 지웠던 알람을 다시 넣는다(이미 같은 id가 있으면 건너뛴다, 상한을 넘기지 않는다)
export function withAlarmsRestored(s: PetSettings, alarms: Alarm[]): PetSettings {
  const have = new Set(s.alarms.map(a => a.id)); const room = Math.max(0, MAX_ALARMS - s.alarms.length);
  return { ...s, alarms: [...s.alarms, ...alarms.filter(a => !have.has(a.id)).slice(0, room)] };
}

export const DELETE_ALL_MAX_SHOWN = 4;   // "다 지워줘" 확인 카드에 이름을 보여 주는 개수
export const EXAMPLES = ['내일 오후 3시에 회의 알람 만들어줘', '내일 오후 3시 알람 취소해줘', '다음 주 알람 알려줘', '오늘 브리핑해줘'] as const;
export const CHAT_PLACEHOLDER = '예: 내일 오후 3시에 회의 알람 만들어줘';
export const UNDO_MS = 10000;   // 되돌리기 버튼이 보이는 시간
