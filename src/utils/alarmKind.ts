import type { Alarm } from './settings';
import { isDefaultAlarmName } from './alarmText';
import { toMin } from './alarmSchedule';

// 일정/알람 구분(새 데이터 종류 없이 필드 유무로만 판정: tests/alarm-cleanup-unit.cjs). 저장된 옛 알람도 마이그레이션 없이 그대로 구분된다.
//  - 일정: 종료 시각(endTime)이나 참석자(attendees)나 이름(name)이 있는 것
//  - 알람: 시각만 있는 것(이름이 비었거나 "알람 1" 같은 자동 이름이면 이름이 없는 것으로 본다 — 알람 카드 제목 규칙과 같다)
export type AlarmKind = 'event' | 'alarm';
export const KIND_LABEL: Record<AlarmKind, string> = { event: '일정', alarm: '알람' };
export const KIND_LEGEND = { event: '일정: 이름·시간 범위·참석자가 있는 것', alarm: '알람: 시각만 있는 것' } as const;

const has = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

export function alarmKind(a: Partial<Pick<Alarm, 'endTime' | 'attendees' | 'name'>> | null | undefined): AlarmKind {
  if (!a) return 'alarm';
  return has(a.endTime) || has(a.attendees) || (has(a.name) && !isDefaultAlarmName(a.name)) ? 'event' : 'alarm';
}
export const kindLabel = (a: Parameters<typeof alarmKind>[0]): string => KIND_LABEL[alarmKind(a)];

// 일정 막대에 쓰는 글: 종료 시각이 시작보다 뒤면 "14:00–15:00", 아니면 시작 시각만("14:00")
export function rangeText(time: string, endTime?: string): string {
  if (!has(endTime) || !/^\d{1,2}:\d{2}$/.test(time) || !/^\d{1,2}:\d{2}$/.test(endTime as string)) return time;
  return toMin(endTime as string) > toMin(time) ? `${time}–${endTime}` : time;
}
