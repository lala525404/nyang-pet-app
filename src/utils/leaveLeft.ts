// 초집중 모드에 작게 보이는 하루 진행바 + "퇴근까지 남은 시간". 홈의 근무 시작·퇴근 시간만 기준으로 하고, 점심 시간은 빼지 않는다.
// 화면과 분리한 순수 계산이라 단위 테스트한다(tests/leave-left-unit.cjs).
//  - 분 단위(초는 무시): 17:59:59 → "퇴근까지 1분"
//  - 설정이 비어 있거나 형식이 틀리면 기본값(근무 시작 09:00, 퇴근 18:00)을 쓴다.
//  - 퇴근 시각이 근무 시작보다 이르거나 같으면 야간 근무로 보고 퇴근을 다음 날로 본다(자정을 넘기는 근무). 그 외에는 "오늘 퇴근 시간까지"만 계산한다.
//  - 진행바: 근무 시작~퇴근 사이 얼마나 지났는지(0~1). 시작 전은 0, 퇴근 후는 1(가득).
//  - 퇴근 시각이 지났으면 AFTER_LEAVE_SHOW_MIN분 동안만 "퇴근 시간이에요 🎉"(가득 찬 바와 함께), 그 뒤에는 전부 표시하지 않는다.

export const AFTER_LEAVE_SHOW_MIN = 60;
export const LEAVE_NOW_TEXT = '퇴근 시간이에요 🎉';
export const DEFAULT_WORK_START = '09:00';
export const DEFAULT_LEAVE = '18:00';

const toMin = (hm: string | undefined | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof hm === 'string' ? hm.trim() : '');
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h > 23 || mm > 59 ? null : h * 60 + mm;
};
const startMin = (workStart: string | undefined | null): number => toMin(workStart) ?? toMin(DEFAULT_WORK_START)!;
const leaveMin = (leaveTime: string | undefined | null): number => toMin(leaveTime) ?? toMin(DEFAULT_LEAVE)!;

// 1분 이상의 남은 시간: "2시간 15분" / "42분" / "1시간"
export function durationText(min: number): string {
  const m = Math.max(1, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`;
}

// 남은 분(양수), 정각(0), 지난 분(음수)
export function minutesUntilLeave(now: Date, workStart: string | undefined | null, leaveTime: string | undefined | null): number {
  const e = leaveMin(leaveTime), s = startMin(workStart), n = now.getHours() * 60 + now.getMinutes();
  if (e <= s && n >= s) return e + 1440 - n;   // 야간 근무(퇴근이 근무 시작보다 이르다)의 저녁 쪽: 퇴근은 다음 날
  return e - n;                                // 그 외: 오늘 퇴근 시간까지. 야간 근무의 자정 이후도 이 식(남은 시간이 양수, 정각 0, 지나면 음수)
}

// 오늘 얼마나 지났는지 0~1(근무 시작 전 0, 퇴근 후 1)
export function dayRatio(now: Date, workStart: string | undefined | null, leaveTime: string | undefined | null): number {
  const e = leaveMin(leaveTime), s = startMin(workStart);
  const total = e <= s ? e + 1440 - s : e - s;
  const left = minutesUntilLeave(now, workStart, leaveTime);
  return Math.min(1, Math.max(0, (total - left) / total));
}

export interface LeaveView { text: string; ratio: number }

// 표시할 내용. 퇴근 후 AFTER_LEAVE_SHOW_MIN분이 지나면 null(전부 숨김)
export function leaveView(now: Date, workStart: string | undefined | null, leaveTime: string | undefined | null): LeaveView | null {
  const left = minutesUntilLeave(now, workStart, leaveTime);
  const ratio = dayRatio(now, workStart, leaveTime);
  if (left > 0) return { text: `퇴근까지 ${durationText(left)}`, ratio };
  return -left < AFTER_LEAVE_SHOW_MIN ? { text: LEAVE_NOW_TEXT, ratio: 1 } : null;
}

export function leaveLeftText(now: Date, workStart: string | undefined | null, leaveTime: string | undefined | null): string | null {
  return leaveView(now, workStart, leaveTime)?.text ?? null;
}
