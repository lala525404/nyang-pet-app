import { addDays } from './alarmSchedule';

// "N월 N주차" 계산(순수 함수, 화면·설정과 무관: tests/alarm-command-unit.cjs).
// 회사마다 주차를 세는 방법이 달라서 기준은 아래 상수 하나로 모았다. 기본은 ISO 8601 방식이다:
//   - 주는 월요일에 시작해 일요일에 끝난다.
//   - 한 주는 그 주의 "기준 요일"(목요일)이 든 달에 속한다. 그래서 주차는 그 달의 첫 목요일이 든 주가 1주차다.
// 월초가 금·토·일이면 그 주는 앞 달의 마지막 주차이고, 월말이 월·화·수이면 그 주는 다음 달의 1주차다(연말·연초의 12월 5주차 ↔ 1월 1주차도 같은 규칙).
export const WEEK_BASIS = { weekStartsOn: 1, anchorWeekday: 4 } as const;   // 0=일 … 6=토. 기준 요일을 1(월)로 바꾸면 "그 달 첫 월요일이 든 주가 1주차" 방식이 된다

const anchorOffset = (WEEK_BASIS.anchorWeekday - WEEK_BASIS.weekStartsOn + 7) % 7;   // 주 시작일에서 기준 요일까지의 날수
const startOfWeek = (d: Date): Date => addDays(d, -((d.getDay() - WEEK_BASIS.weekStartsOn + 7) % 7));
const anchorOf = (weekStart: Date): Date => addDays(weekStart, anchorOffset);

// year년 month월(1~12)의 1주차 시작일
function firstWeekStart(year: number, month: number): Date {
  const first = new Date(year, month - 1, 1);
  const anchor = addDays(first, (WEEK_BASIS.anchorWeekday - first.getDay() + 7) % 7);   // 그 달 첫 기준 요일
  return addDays(anchor, -anchorOffset);
}

// 그 달의 주 수(4 또는 5)
export function weeksInMonth(year: number, month: number): number {
  const w1 = firstWeekStart(year, month);
  let n = 0;
  while (anchorOf(addDays(w1, 7 * n)).getMonth() === month - 1) n++;
  return n;
}

// n주차(1부터)의 시작일(월요일). 그 달에 없는 주차면 null
export function weekOfMonthStart(year: number, month: number, n: number): Date | null {
  if (!Number.isInteger(n) || n < 1 || n > weeksInMonth(year, month)) return null;
  return addDays(firstWeekStart(year, month), 7 * (n - 1));
}

// 어떤 날이 든 주가 어느 달의 몇 주차인지(주차 계산의 역방향)
export function weekOfMonthOf(day: Date): { year: number; month: number; n: number; start: Date } {
  const start = startOfWeek(day), anchor = anchorOf(start);
  const year = anchor.getFullYear(), month = anchor.getMonth() + 1;
  const w1 = firstWeekStart(year, month);
  return { year, month, n: Math.round((start.getTime() - w1.getTime()) / (7 * 86400000)) + 1, start };
}
