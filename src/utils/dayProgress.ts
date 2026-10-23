// 하루 진행 바 계산: 출근·점심·퇴근 시각(HH:MM)과 지금 시각으로 오늘 얼마나 지났는지 구한다.
// 로컬 시간 기준, 분 단위. 퇴근이 출근보다 이르거나 같으면(야간 근무) 퇴근을 다음 날로 본다.

export type DayPhase = 'before' | 'working' | 'after';
export interface DayProgress {
  phase: DayPhase;
  ratio: number;            // 0~1
  label: string;            // "퇴근까지 2시간 14분" / "출근까지 …" / "오늘도 수고했어요"
  lunchRatio: number | null; // 점심 눈금 위치(0~1). 근무 시간 밖이면 null
}

const toMin = (hm: string | undefined, fallback: number): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm ?? '');
  if (!m) return fallback;
  const h = Number(m[1]), mm = Number(m[2]);
  return h > 23 || mm > 59 ? fallback : h * 60 + mm;
};

export function durationText(min: number): string {
  const m = Math.max(1, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`;
}

export function dayProgress(now: Date, workStart: string, lunchTime: string, leaveTime: string): DayProgress {
  const s = toMin(workStart, 540);
  let e = toMin(leaveTime, 1080);
  if (e <= s) e += 1440;                       // 야간 근무: 퇴근은 다음 날
  let n = now.getHours() * 60 + now.getMinutes();
  if (e > 1440 && n < e - 1440) n += 1440;     // 자정을 넘긴 뒤 아직 근무 중
  let l = toMin(lunchTime, 720);
  if (l < s) l += 1440;
  const lunchRatio = l > s && l < e ? (l - s) / (e - s) : null;
  if (n < s) return { phase: 'before', ratio: 0, label: `출근까지 ${durationText(s - n)}`, lunchRatio };
  if (n >= e) return { phase: 'after', ratio: 1, label: '오늘도 수고했어요', lunchRatio };
  return { phase: 'working', ratio: (n - s) / (e - s), label: `퇴근까지 ${durationText(e - n)}`, lunchRatio };
}
