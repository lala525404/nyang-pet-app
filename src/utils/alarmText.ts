import { formatTime } from './settings';

// 알람 카드(제목 + 작은 문구)에 들어갈 글을 정하는 순수 함수들. 화면 모양은 BreakTimePage가 그대로 쓰고, 두 텍스트 칸의 내용만 여기서 정한다.
export const ALARM_NAME_MAX = 30;
export const ALARM_ATTENDEES_MAX = 80;
export const ALARM_MEMO_MAX = 60;
export const ATTENDEES_SHOWN = 3;
export const ALARM_DEFAULT_TITLE = '알람';
export const ALARM_DEFAULT_SUB = '알람이 울렸어요!';

export interface AlarmCardInfo {
  name?: string;       // 알람 이름(제목). 비었거나 "알람 1" 같은 기본 이름이면 "알람"
  time?: string;       // 시작 시각 HH:MM
  endTime?: string;    // 종료 시각 HH:MM (있을 때만 시간 범위로 표시)
  attendees?: string;  // 쉼표로 구분한 참석자
  memo?: string;
  missed?: boolean;    // 앱이 꺼져 있던 동안 지난 알람(최근 10분 이내)을 늦게 보여 주는 카드
}

// 이름이나 설명을 넣은 알람은 팝업을 2초 더 오래 보여 준다(메인의 alarms.cjs와 같은 규칙)
export const ALARM_TEXT_EXTRA_MS = 2000;
export const alarmHasText = (info: AlarmCardInfo): boolean => !isDefaultAlarmName(info.name) || !!info.endTime || !!info.attendees || !!info.memo;

// 비어 있거나 설정창이 붙여 주는 자동 이름("알람", "알람 1")이면 기본 이름으로 본다
export const isDefaultAlarmName = (name?: string): boolean => { const t = (name || '').trim(); return !t || /^알람\s*\d*$/.test(t); };

export const alarmTitle = (info: AlarmCardInfo): string => (isDefaultAlarmName(info.name) ? ALARM_DEFAULT_TITLE : (info.name as string).trim());

// 제목이 길면 글자 크기를 단계적으로 줄인다(마지막 단계는 2줄까지). 카드 높이가 변하지 않도록 단계마다 제목 칸의 높이 안에 들어오는 크기만 쓴다.
export type TitleSize = 'xl' | 'l' | 'm' | 's';
export function titleSize(title: string): TitleSize {
  const n = Array.from(title).length;
  return n <= 6 ? 'xl' : n <= 9 ? 'l' : n <= 14 ? 'm' : 's';
}

export const splitAttendees = (raw?: string): string[] =>
  (raw || '').split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);

// "참석 김OO, 이OO 외 2명" (3명까지 표시, 나머지는 "외 N명")
export function formatAttendees(raw?: string): string {
  const all = splitAttendees(raw);
  if (!all.length) return '';
  const shown = all.slice(0, ATTENDEES_SHOWN).join(', ');
  return `참석 ${shown}${all.length > ATTENDEES_SHOWN ? ` 외 ${all.length - ATTENDEES_SHOWN}명` : ''}`;
}

// "오후 2:00 – 오후 3:00": 종료 시각이 있을 때만
export function formatRange(time?: string, endTime?: string): string {
  return time && endTime ? `${formatTime(time)} – ${formatTime(endTime)}` : '';
}

// 작은 문구: 시간 → 참석자 → 메모 순서로 · 로 이어 붙인다(화면에서 2줄까지 보이고 넘치면 말줄임). 아무것도 없으면 기존 문구.
export function alarmSubText(info: AlarmCardInfo): string {
  const missed = info.missed ? `놓친 알람${info.time ? ` · ${formatTime(info.time)}` : ''}` : '';
  const parts = [missed, formatRange(info.time, info.endTime), formatAttendees(info.attendees), (info.memo || '').trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : ALARM_DEFAULT_SUB;
}
