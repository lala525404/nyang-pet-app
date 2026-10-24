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

// 알약 바 버튼 사이 간격(px): 많을수록 줄어든다
export const quickGapPx = (count: number): number => (count <= 4 ? 8 : count <= 6 ? 6 : count <= 7 ? 4 : 2);

// 바 모양(CSS와 같은 값): 버튼 지름, 바 안쪽 여백, 종료 앞 구분선이 차지하는 폭
export const BAR_BTN_PX = 44;
export const BAR_PAD_PX = 6;
export const BAR_SEP_PX = 1;
// 바가 한 줄에 들어가는 폭(px)과, maxWidth(화면 폭에서 여백을 뺀 값)를 넘으면 몇 줄이 되는지(줄바꿈은 CSS flex-wrap이 하고, 이 계산은 줄 수에 따라 모서리 모양을 정하고 시험하는 데 쓴다)
export const barWidthPx = (count: number): number => { const gap = quickGapPx(count); return BAR_PAD_PX * 2 + 2 + count * BAR_BTN_PX + (count - 1) * gap + (count > 1 ? BAR_SEP_PX + gap : 0); };
export function barRows(count: number, maxWidth: number): number {
  if (count <= 0) return 1;
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return 1;
  const gap = quickGapPx(count), per = BAR_BTN_PX + gap;
  const perRow = Math.max(1, Math.floor((maxWidth - BAR_PAD_PX * 2 - 2 - (count > 1 ? BAR_SEP_PX + gap : 0) + gap) / per));   // 종료 앞 구분선(+간격)은 고정 폭으로 뺀다
  return Math.max(1, Math.ceil(count / perRow));
}

// ── 호버 스파클("뾰로롱"): 개별 아이콘에 호버하면 그 주변에서, 바에 처음 진입하면 바 가장자리에서 작은 ✦ 몇 개가 튀어나왔다 사라진다 ──
export const SPARKLE_COUNT: readonly [number, number] = [3, 5];   // 한 번에 3~5개
export const SPARKLE_LIFETIME_MS = 600;                           // 약 0.6초
export const SPARKLE_COOLDOWN_MS = 400;                           // 같은 아이콘(또는 바 진입)은 이 시간 안에 다시 터지지 않는다
export const SPARKLE_MAX_LIVE = 20;                               // 동시에 떠 있는 입자 상한
export const SPARKLE_SIZE_PX: readonly [number, number] = [6, 10];
export const SPARKLE_DISTANCE_PX: readonly [number, number] = [16, 32];

export interface Sparkle { x: number; y: number; dx: number; dy: number; rot: number; size: number; delay: number }
// 한 번의 터짐: 중심 (cx, cy)에서 사방으로(위쪽으로 조금 더). rand를 주입해 시험한다.
export function sparkleBurst(cx: number, cy: number, rand: () => number = Math.random, count?: number): Sparkle[] {
  const n = count ?? SPARKLE_COUNT[0] + Math.floor(rand() * (SPARKLE_COUNT[1] - SPARKLE_COUNT[0] + 1));
  const out: Sparkle[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + rand() * 0.6) / n) * Math.PI * 2 - Math.PI / 2;   // 균등하게 퍼지되 조금 흩뜨린다
    const far = SPARKLE_DISTANCE_PX[0] + rand() * (SPARKLE_DISTANCE_PX[1] - SPARKLE_DISTANCE_PX[0]);
    out.push({
      x: cx, y: cy, dx: Math.round(Math.cos(a) * far), dy: Math.round(Math.sin(a) * far - 4),
      rot: Math.round((rand() - 0.5) * 120), size: Math.round(SPARKLE_SIZE_PX[0] + rand() * (SPARKLE_SIZE_PX[1] - SPARKLE_SIZE_PX[0])), delay: Math.round(rand() * 90),
    });
  }
  return out;
}
// 바 가장자리에서 터짐: 바 상자(left, top, width, height)의 왼쪽·오른쪽 끝 가까이에서 번갈아
export function sparkleEdgeBurst(box: { left: number; top: number; width: number; height: number }, rand: () => number = Math.random): Sparkle[] {
  const n = SPARKLE_COUNT[0] + Math.floor(rand() * (SPARKLE_COUNT[1] - SPARKLE_COUNT[0] + 1));
  const out: Sparkle[] = [];
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0, x = left ? box.left + box.height * 0.35 : box.left + box.width - box.height * 0.35;
    const [s] = sparkleBurst(x, box.top + box.height * (0.2 + rand() * 0.6), rand, 1);
    out.push({ ...s, dx: Math.round((left ? -1 : 1) * Math.abs(s.dx) * 0.8), delay: Math.round(i * 40 + rand() * 40) });
  }
  return out;
}
// 쿨다운: 마지막으로 터진 시각(없으면 undefined)과 지금 시각으로 터져도 되는지
export const canSparkle = (lastAt: number | undefined, now: number, cooldown: number = SPARKLE_COOLDOWN_MS): boolean => lastAt === undefined || now - lastAt >= cooldown;
// 남은 자리만큼만 만든다(동시 입자 상한)
export const sparkleRoom = (live: number, want: number, max: number = SPARKLE_MAX_LIVE): number => Math.max(0, Math.min(want, max - live));

// 호 버튼마다 다른 비행 값(열림 모션): 회전 각도(-25~25도)와 지연(0~120ms). 같은 순서면 항상 같은 값이라 한 번 우클릭하는 동안 순서가 고정된다.
export const FLIGHT_ROTATIONS = [-22, 18, -14, 24, -18, 12] as const;
export const FLIGHT_DELAYS_MS = [0, 36, 72, 108, 24, 120] as const;
export function flightVars(index: number): { rot: number; delay: number } {
  const i = Math.max(0, Math.floor(index));
  return { rot: FLIGHT_ROTATIONS[i % FLIGHT_ROTATIONS.length], delay: FLIGHT_DELAYS_MS[i % FLIGHT_DELAYS_MS.length] };
}
