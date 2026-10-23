// 펫 우클릭 퀵 메뉴의 화면 쪽 순수 계산(시험: tests/quick-menu-unit.cjs). 호 배치·창 위치 계산은 메인 쪽 quick-menu.cjs에 있다.

export const QUICK_MAX_ITEMS = 8;     // 종료까지 포함해 최대 8개(호는 6개까지, 7개부터는 알약 바)
export const QUICK_ARC_MAX = 6;       // 호 배치는 6개까지(메인 quick-menu.cjs의 ARC_MAX와 같은 값), 7개 이상은 알약 바
export const QUIT_CONFIRM_MS = 3000;  // 종료 버튼을 한 번 누른 뒤 이 시간 안에 다시 눌러야 종료된다

// 항목 배열 + 종료 → 화면에 그릴 순서. 종료는 항상 마지막이고, 항목이 많으면 (최대 − 1)개까지만 쓴다.
// 새 항목은 배열에 추가만 하면 된다.
export function layoutQuickItems<T>(items: readonly T[], quit: T, max: number = QUICK_MAX_ITEMS): T[] {
  return [...items.slice(0, Math.max(0, max - 1)), quit];
}

// 키보드로 버튼 옮기기: 호/바는 한 줄 순서라서 좌우·상하 모두 앞뒤로 한 칸, Home/End는 처음/끝. 끝에서는 멈춘다.
export function moveQuickFocus(index: number, key: string, count: number): number {
  if (count <= 0) return 0;
  const last = count - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(last, index + 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, index - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return index;
}

// 알약 바(7개 이상) 버튼 사이 간격(px): 많을수록 줄어든다
export const quickGapPx = (count: number): number => (count <= 4 ? 8 : count <= 6 ? 6 : count <= 7 ? 4 : 2);

// 호 버튼마다 다른 비행 값(열림 모션): 회전 각도(-25~25도)와 지연(0~120ms). 같은 순서면 항상 같은 값이라 한 번 우클릭하는 동안 순서가 고정된다.
export const FLIGHT_ROTATIONS = [-22, 18, -14, 24, -18, 12] as const;
export const FLIGHT_DELAYS_MS = [0, 36, 72, 108, 24, 120] as const;
export function flightVars(index: number): { rot: number; delay: number } {
  const i = Math.max(0, Math.floor(index));
  return { rot: FLIGHT_ROTATIONS[i % FLIGHT_ROTATIONS.length], delay: FLIGHT_DELAYS_MS[i % FLIGHT_DELAYS_MS.length] };
}
