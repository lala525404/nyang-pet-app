import type { Alarm } from './settings';
import { MAX_ALARMS, isTimerAlarm, lastOccurrence, ymd } from './alarmSchedule';

// 지난 알람 자동 정리(화면·저장과 분리한 순수 계산: tests/alarm-cleanup-unit.cjs). 시각은 모두 인자(nowMs)로 받는다.
//  - 지우는 것: 날짜를 정해 한 번만 울리는 알람(repeat.kind === 'date')이고, 그 시각이 지난 지 7일이 넘은 것 하나뿐이다.
//    반복(매주·그 주만)·매일 알람·건너뛰기가 걸린 반복 알람·점심·퇴근 기본 설정은 어떤 경우에도 지우지 않는다.
//  - 시계 이상(지금 시각이 마지막으로 확인한 시각보다 크게 과거이거나 2026년 이전)이면 그날은 지우지 않고 보류한다.
//  - 지우기 직전에 대상 목록을 보관(undo)하고, 설정창이 "되돌리기"로 직전 정리분만 복원한다. 알람 스케줄러(alarms.cjs)는 건드리지 않는다.

export const CLEANUP_AFTER_DAYS = 7;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const CLEANUP_AFTER_MS = CLEANUP_AFTER_DAYS * DAY_MS;
export const CLOCK_BACK_TOLERANCE_MS = 60 * 60 * 1000;   // 서머타임·자동 시각 보정 정도(1시간)는 이상으로 보지 않는다
export const MIN_VALID_CLOCK_MS = new Date(2026, 0, 1).getTime();   // 이보다 이른 시각은 시계가 초기화된 것으로 본다
export const MARK_STEP_MS = 10 * 60 * 1000;   // 마지막으로 확인한 시각(alarmClockMark)을 새로 쓰는 최소 간격

export interface CleanupUndo { at: number; alarms: Alarm[]; shown: boolean }   // shown: 설정창 알람 화면이 "N개를 정리했어요 [되돌리기]"를 한 번 보여 줬는지
export interface CleanupMeta { alarmCleanupDay: string; alarmClockMark: number; alarmCleanupUndo: CleanupUndo | null }

export type ClockVerdict = 'ok' | 'clock-back' | 'clock-invalid';
export function clockVerdict(nowMs: number, mark: number): ClockVerdict {
  if (!Number.isFinite(nowMs) || nowMs < MIN_VALID_CLOCK_MS) return 'clock-invalid';
  if (Number.isFinite(mark) && mark > 0 && nowMs < mark - CLOCK_BACK_TOLERANCE_MS) return 'clock-back';
  return 'ok';
}

// 대화로 만든 타이머("timer-" id의 날짜 한 번짜리 알람)는 울린 지 1시간이 지나면 정리한다(7일 동안 목록·캘린더에 남지 않게). 반복·점심·퇴근은 그대로 보호.
export const TIMER_CLEANUP_AFTER_MS = 60 * 60 * 1000;

// 지울 수 있는 알람인가: 날짜 한 번짜리이고, 마지막으로 울릴 시각에서 7일을 넘게 지났을 때(정확히 7일은 아직 남긴다). 타이머는 1시간
export function isCleanable(a: Pick<Alarm, 'repeat' | 'time'> & { id?: string }, nowMs: number): boolean {
  if (!a || !a.repeat || a.repeat.kind !== 'date') return false;
  const last = lastOccurrence(a);
  if (!last || !Number.isFinite(last.getTime())) return false;
  return nowMs - last.getTime() > (isTimerAlarm(a) ? TIMER_CLEANUP_AFTER_MS : CLEANUP_AFTER_MS);
}
// 정리할 타이머가 있는가(펫 창이 1분마다 살피다가, 있을 때만 정리를 돌린다)
export const hasCleanableTimer = (alarms: Alarm[], nowMs: number): boolean => (Array.isArray(alarms) ? alarms : []).some(a => isTimerAlarm(a) && isCleanable(a, nowMs));

export function planCleanup(alarms: Alarm[], nowMs: number, mark: number): { verdict: ClockVerdict; removed: Alarm[]; kept: Alarm[] } {
  const list = Array.isArray(alarms) ? alarms : [];
  const verdict = clockVerdict(nowMs, mark);
  if (verdict !== 'ok') return { verdict, removed: [], kept: list };
  const removed: Alarm[] = [], kept: Alarm[] = [];
  for (const a of list) (isCleanable(a, nowMs) ? removed : kept).push(a);
  return { verdict, removed, kept };
}

// 저장값이 깨져 있어도 안전하게: 알람 배열·숫자 시각·불리언이 맞을 때만 인정한다
export function sanitizeUndo(raw: unknown): CleanupUndo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at) || !Array.isArray(r.alarms)) return null;
  const alarms = r.alarms.filter((a): a is Alarm => !!a && typeof a === 'object' && typeof (a as Alarm).id === 'string' && typeof (a as Alarm).time === 'string').slice(0, MAX_ALARMS);
  return alarms.length ? { at: r.at, alarms, shown: r.shown === true } : null;
}

export interface CleanupRun { alarms: Alarm[]; meta: CleanupMeta; removedCount: number; verdict: ClockVerdict; changed: boolean }

// 한 번의 정리. reason: 'start'(앱 시작) | 'daily'(자정 이후 첫 확인).
//  - 시계 이상이면 지우지 않는다. 'clock-back'은 새 시각을 받아들이고(마지막 확인 시각을 지금으로) 오늘은 건너뛴다. 'clock-invalid'는 아무것도 바꾸지 않는다.
//  - 지울 게 있으면 그 목록을 undo로 보관한다(이전 undo는 대체). 앱 시작에서는 이미 보여 준 undo를 비운다("다음 실행 때까지 보관").
export function runCleanup(input: { alarms: Alarm[] } & Partial<CleanupMeta>, nowMs: number, reason: 'start' | 'daily' | 'timer'): CleanupRun {   // 'timer': 울린 지 1시간이 지난 타이머를 치우는 중간 정리(그 밖에는 'daily'와 같다)
  const alarms = Array.isArray(input.alarms) ? input.alarms : [];
  const prev: CleanupMeta = { alarmCleanupDay: typeof input.alarmCleanupDay === 'string' ? input.alarmCleanupDay : '', alarmClockMark: Number(input.alarmClockMark) || 0, alarmCleanupUndo: sanitizeUndo(input.alarmCleanupUndo) };
  const plan = planCleanup(alarms, nowMs, prev.alarmClockMark);
  if (plan.verdict === 'clock-invalid') return { alarms, meta: prev, removedCount: 0, verdict: plan.verdict, changed: false };
  const today = ymd(new Date(nowMs));
  let undo = prev.alarmCleanupUndo;
  if (reason === 'start' && undo && undo.shown) undo = null;
  let next = alarms;
  // 설정창이 아직 안 보여 준 보관분이 있으면 합친다(타이머가 하루에 여러 번 정리돼도 앞선 정리분이 사라지지 않게). 이미 보여 준 것은 대체한다
  if (plan.removed.length > 0) { next = plan.kept; undo = { at: nowMs, alarms: [...(undo && !undo.shown ? undo.alarms : []), ...plan.removed].slice(-MAX_ALARMS), shown: false }; }
  const meta: CleanupMeta = { alarmCleanupDay: today, alarmClockMark: nowMs, alarmCleanupUndo: undo };
  const changed = next !== alarms || meta.alarmCleanupDay !== prev.alarmCleanupDay || meta.alarmClockMark !== prev.alarmClockMark || JSON.stringify(meta.alarmCleanupUndo) !== JSON.stringify(prev.alarmCleanupUndo);
  return { alarms: next, meta, removedCount: plan.removed.length, verdict: plan.verdict, changed };
}

// 오늘 아직 확인하지 않았는가(자정 이후 첫 틱에서 다시 돌릴지)
export const isNewDay = (day: unknown, nowMs: number): boolean => day !== ymd(new Date(nowMs));

// 마지막으로 확인한 시각을 가끔 새로 쓴다(앱이 켜져 있는 동안 시계가 과거로 가는 것을 알아차리기 위한 기준). 시계가 정상일 때만, MARK_STEP_MS보다 오래됐을 때만
export function nextMark(mark: number, nowMs: number): number | null {
  if (clockVerdict(nowMs, mark) !== 'ok') return null;
  return !Number.isFinite(mark) || mark <= 0 || nowMs - mark >= MARK_STEP_MS ? nowMs : null;
}

// 되돌리기: 직전 정리분을 알람 목록에 다시 넣는다(이미 같은 id가 있으면 건너뛰고, 알람 최대 개수를 넘지 않게 자리만큼만)
export function restoreCleaned(alarms: Alarm[], undo: CleanupUndo | null): { alarms: Alarm[]; restored: number; skipped: number } {
  const list = Array.isArray(alarms) ? alarms : [];
  const u = sanitizeUndo(undo);
  if (!u) return { alarms: list, restored: 0, skipped: 0 };
  const have = new Set(list.map(a => a.id));
  const out = [...list]; let restored = 0, skipped = 0;
  for (const a of u.alarms) {
    if (have.has(a.id) || out.length >= MAX_ALARMS) { skipped++; continue; }
    out.push(a); have.add(a.id); restored++;
  }
  return { alarms: out, restored, skipped };
}

// 설정창 알람 화면 하단 문구
export const cleanupNoticeText = (n: number): string => `지난 알람 ${n}개를 정리했어요`;
