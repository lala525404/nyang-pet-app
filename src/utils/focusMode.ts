import { formatTime } from './settings';

// 초집중 모드(렌더러 쪽 순수 계산): 이동 범위·목표점·시계 문구. 화면과 분리해 단위 테스트한다(tests/focus-mode-unit.cjs).
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export const FOCUS_RANGE_X = 40;     // 기준점에서 좌우로 이만큼(px)까지만
export const FOCUS_RANGE_Y = 24;     // 위아래로 이만큼(px)까지만
export const FOCUS_TICK_MS = 100;    // 이동 갱신 주기(기본 물리 루프 30fps보다 훨씬 드물게 → CPU 절약)
export const FOCUS_STEP_PX = 1;      // 한 번에 최대 1px(≈ 초당 10px: 아주 천천히)
export const FOCUS_PAUSE_MS: [number, number] = [1500, 4000];   // 목표점에 닿으면 이 시간만큼 쉰다

// 기준점(anchor) ± 범위 안, 그리고 기준점이 있는 모니터(area) 안으로 제한한 창 좌표 경계. 창 크기를 빼서 창이 모니터 밖으로 나가지 않게 한다.
export function focusBounds(anchor: Point, area: Rect, win: { w: number; h: number }, range = { x: FOCUS_RANGE_X, y: FOCUS_RANGE_Y }) {
  const areaMinX = area.x, areaMaxX = Math.max(area.x, area.x + area.w - win.w);
  const areaMinY = area.y, areaMaxY = Math.max(area.y, area.y + area.h - win.h);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const ax = clamp(anchor.x, areaMinX, areaMaxX), ay = clamp(anchor.y, areaMinY, areaMaxY);   // 기준점이 화면 가장자리에 있어도 안으로
  return { minX: clamp(ax - range.x, areaMinX, areaMaxX), maxX: clamp(ax + range.x, areaMinX, areaMaxX), minY: clamp(ay - range.y, areaMinY, areaMaxY), maxY: clamp(ay + range.y, areaMinY, areaMaxY) };
}

// 경계 안의 임의의 목표점(rand는 0~1 난수 함수를 주입: 테스트에서 고정)
export function nextFocusTarget(b: { minX: number; maxX: number; minY: number; maxY: number }, rand: () => number = Math.random): Point {
  return { x: Math.round(b.minX + rand() * (b.maxX - b.minX)), y: Math.round(b.minY + rand() * (b.maxY - b.minY)) };
}

// 현재 위치에서 목표점으로 한 걸음(각 축 최대 step px). 목표를 넘어서 가지 않는다.
export function stepToward(cur: Point, target: Point, step = FOCUS_STEP_PX): Point {
  const move = (a: number, b: number) => (Math.abs(b - a) <= step ? b : a + Math.sign(b - a) * step);
  return { x: move(cur.x, target.x), y: move(cur.y, target.y) };
}

// 기준점이 속한 모니터(창 중심 기준). 어느 모니터에도 없으면 전체 영역(또는 null)
export function monitorRectAt(monitors: { bounds: Rect | { x: number; y: number; width: number; height: number } }[], p: Point, win: { w: number; h: number }): Rect | null {
  const cx = p.x + win.w / 2, cy = p.y + win.h / 2;
  for (const m of monitors) {
    const b = m.bounds as { x: number; y: number; width: number; height: number };
    if (cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height) return { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  return null;
}

// 시계 문구: 기존 시계(말풍선·설정창)와 같은 표기("오후 3:42"), 초 표시를 켜면 "오후 3:42:07"
export function focusClockText(d: Date = new Date(), seconds = false): string {
  const base = formatTime(`${d.getHours()}:${d.getMinutes()}`);
  return seconds ? `${base}:${String(d.getSeconds()).padStart(2, '0')}` : base;
}

// 마우스가 버디 위인지(클릭 통과 판정): 버디 영역 안이면 true
export const isOverPet = (r: { left: number; top: number; right: number; bottom: number } | null, x: number, y: number): boolean => !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
