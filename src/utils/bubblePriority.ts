// 말풍선 우선순위와 대화 보호(순수 함수, 단위 테스트됨).
// 순위: 1 알람·미리 알림 토스트(별도 표시라 이 규칙과 무관하게 항상 즉시 최우선) > 2 대화 답변 > 3 아침·퇴근길 날씨 안내 > 4 그 외(자동 섞기·평소 반응·졸림 방지·낮잠·순간이동·야르 타임 등).
// 높은 순위가 떠 있는 동안 낮은 순위는 띄우지 못하고(대기 없이 버림), 높은 순위는 낮은 순위를 바로 대체한다.

export type BubbleLevel = 1 | 2 | 3 | 4;
export const LEVEL = { ALARM: 1, ANSWER: 2, BRIEFING: 3, OTHER: 4 } as const;

// 보호가 끝난 뒤 4순위 말풍선과 펫 이동을 더 쉬는 시간(밀리초): 대화 답변 20초, 아침·퇴근길 날씨 안내 10초
export const PROTECT_TAIL_MS: Record<2 | 3, number> = { 2: 20000, 3: 10000 };
// 마우스가 펫이나 말풍선에서 벗어난 뒤 답변이 남아 있는 시간
export const HOVER_LINGER_MS = 2000;

// 대화 답변 표시 시간: 최소 7초, 글자당 0.15초 추가, 최대 15초. 줄마다(운세·날씨 줄 넘김) 같은 규칙을 쓴다.
export const ANSWER_MIN_MS = 7000, ANSWER_MAX_MS = 15000, ANSWER_PER_CHAR_MS = 150;
export function answerMs(text: string): number {
  return Math.min(ANSWER_MAX_MS, Math.max(ANSWER_MIN_MS, ANSWER_MIN_MS + ANSWER_PER_CHAR_MS * Array.from(text).length));
}

export interface ActiveBubble { level: BubbleLevel; until: number }

// 지금 떠 있는(아직 끝나지 않은) 말풍선이 새 말풍선을 막는지: 새 순위가 더 낮으면(숫자가 크면) 못 띄운다. 같거나 높으면 대체한다.
export function canShow(active: ActiveBubble | null, level: BubbleLevel, now: number): boolean {
  if (!active || now >= active.until) return true;
  return level <= active.level;
}

export interface ProtectState {
  talkOpen: boolean;                       // 말 걸기 창이 열려 있음
  forceUntil: number;                      // 물어서 보여 주는 운세·날씨(대화 답변)가 이 시각까지 떠 있음(0이면 없음)
  active: ActiveBubble | null;             // 말풍선 하나(대화 답변·날씨 안내 포함)
  protectUntil: number;                    // 답변·안내가 사라진 뒤의 보호 시간이 끝나는 시각
}
// 보호 중이면: 4순위 말풍선을 띄우지 않고 펫의 위치·상태가 바뀌는 동작(순간이동·낮잠·랜덤 이동·도망)을 멈춘다.
export function isProtected(s: ProtectState, now: number): boolean {
  if (s.talkOpen || now < s.forceUntil || now < s.protectUntil) return true;
  return !!s.active && now < s.active.until && s.active.level <= 3;
}
// 대화 답변이 떠 있거나 말 걸기 창이 열려 있는 동안(아침·퇴근길 안내를 미루는 조건)
export function answerBusy(s: ProtectState, now: number): boolean {
  return s.talkOpen || now < s.forceUntil || (!!s.active && now < s.active.until && s.active.level === 2);
}
// 새 말풍선을 띄워도 되는지(showBubble이 쓴다): 4순위는 보호 중이면 버리고, 어떤 순위든 더 높은 순위가 떠 있으면 버린다.
// 물어서 보여 주는 운세·날씨(대화 답변, forceUntil)가 떠 있는 동안은 2순위보다 낮은 말풍선(3·4순위)도 못 띄운다. 알람·토스트(1순위)는 이 함수를 거치지 않고 항상 즉시 표시된다.
export function admit(s: ProtectState, level: BubbleLevel, now: number): boolean {
  if (level === LEVEL.OTHER && isProtected(s, now)) return false;
  if (!canShow(s.active, level, now)) return false;
  if (level > LEVEL.ANSWER && now < s.forceUntil) return false;
  return true;
}

// 보호 중 펫의 물리 상태(위치·속도·기울기·크기). 위치는 고정하고 속도·기울기·크기만 가라앉힌다.
export interface HoldBody { wx: number; wy: number; vx: number; vy: number; vr: number; rotate: number; scale: number; targetScale: number; escaping: boolean }
export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
export interface Correction { x: number; y: number }
// 보호가 시작된 첫 프레임(first)에만 가장자리 밖에 걸친 펫을 안쪽으로 한 번 부드럽게 보정할 목표를 정한다(순간이동 연출 없음). 드래그 중에는 보정하지 않는다.
export function holdStep(s: HoldBody, bounds: Bounds, first: boolean, corr: Correction | null, dragging: boolean): { corr: Correction | null; moved: boolean } {
  if (first) {
    s.vx = 0; s.vy = 0; s.vr = 0; s.targetScale = 1; s.escaping = false;
    const cx = Math.min(Math.max(s.wx, bounds.minX), bounds.maxX), cy = Math.min(Math.max(s.wy, bounds.minY), bounds.maxY);
    corr = cx !== s.wx || cy !== s.wy ? { x: cx, y: cy } : null;
  }
  let moved = false;
  if (corr && !dragging) {
    s.wx += (corr.x - s.wx) * 0.2; s.wy += (corr.y - s.wy) * 0.2;
    if (Math.abs(corr.x - s.wx) < 1 && Math.abs(corr.y - s.wy) < 1) { s.wx = corr.x; s.wy = corr.y; corr = null; }
    moved = true;
  }
  s.rotate += (0 - s.rotate) * 0.25; s.scale += (1 - s.scale) * 0.25;
  if (Math.abs(s.rotate) < 0.01) s.rotate = 0;
  if (Math.abs(s.scale - 1) < 0.001) s.scale = 1;
  return { corr, moved };
}

// 마우스가 펫·말풍선 위에 있거나 벗어난 지 2초가 안 됐으면 답변은 사라지지 않는다
export const hoverKeeps = (hovering: boolean, leftAt: number, now: number): boolean => hovering || now - leftAt < HOVER_LINGER_MS;
// 순위별 사라진 뒤 보호 시간(4순위는 없음)
export const tailFor = (level: BubbleLevel): number => (level === 2 ? PROTECT_TAIL_MS[2] : level === 3 ? PROTECT_TAIL_MS[3] : 0);
