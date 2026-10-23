// 펫 우클릭 퀵 메뉴의 화면 쪽 순수 계산(시험: tests/quick-menu-unit.cjs). 창 위치 계산은 메인 쪽 quick-menu.cjs에 있다.

export const QUICK_COLUMNS = 4;       // 아이콘 격자는 한 줄 4개 기준으로 자동 줄바꿈
export const QUICK_MAX_ITEMS = 8;     // 종료까지 포함해 최대 8개(2줄)
export const QUIT_CONFIRM_MS = 3000;  // 종료 아이콘을 한 번 누른 뒤 이 시간 안에 다시 눌러야 종료된다

// 항목 배열 + 종료 → 화면에 그릴 순서. 종료는 항상 마지막이고, 항목이 많으면 (최대 − 1)개까지만 쓴다.
// 새 항목은 배열에 추가만 하면 된다.
export function layoutQuickItems<T>(items: readonly T[], quit: T, max: number = QUICK_MAX_ITEMS): T[] {
  return [...items.slice(0, Math.max(0, max - 1)), quit];
}

export const quickRows = (count: number, columns: number = QUICK_COLUMNS): number => Math.max(1, Math.ceil(count / columns));

// 키보드로 칸 옮기기: 방향키로 한 칸/한 줄씩(끝에서는 멈춘다), 마지막 줄이 덜 찼으면 아래로 내려갈 때 마지막 칸으로 맞춘다.
export function moveQuickFocus(index: number, key: string, count: number, columns: number = QUICK_COLUMNS): number {
  if (count <= 0) return 0;
  const last = count - 1;
  let next = index;
  if (key === 'ArrowRight') next = index + 1;
  else if (key === 'ArrowLeft') next = index - 1;
  else if (key === 'ArrowDown') next = index + columns;
  else if (key === 'ArrowUp') next = index - columns;
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = last;
  if (next < 0) return key === 'ArrowUp' ? index : 0;
  if (next > last) return key === 'ArrowDown' ? (Math.floor(index / columns) < Math.floor(last / columns) ? last : index) : last;
  return next;
}
