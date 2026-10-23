'use strict';
// 클릭 통과: 펫 창(240×230)은 보이는 펫(약 76px)보다 훨씬 커서, 투명한 부분이 펫 주변의 바탕화면·다른 앱 클릭을 막았다.
// 그래서 창은 평소 클릭을 통과시키고(setIgnoreMouseEvents(true, { forward: true })), 마우스가 "실제 보이는 요소"(펫 원·말풍선·토스트, 퀵 메뉴의 버튼·카드) 위에 있을 때만 클릭을 받는다.
// 판정은 메인이 커서 위치(screen.getCursorScreenPoint)와 창 위치로 한다 → 펫이 이동·순간이동하는 동안 커서가 가만히 있어도 판정이 낡지 않는다.
// 이 모듈은 창을 직접 만지지 않는 순수 계산이다(tests/click-through-unit.cjs). 비상 스위치: 환경변수 CHOEAE_DISABLE_CLICKTHROUGH=1 이면 전부 예전 동작(창 전체가 클릭을 받음).

const POLL_MS = 40;           // 커서를 확인하는 간격
const LEAVE_MARGIN = 6;       // 이미 받는 중일 때는 영역을 이만큼 넓게 본다(경계에서 떨리지 않게)
const LEAVE_CONFIRMS = 2;     // 영역 밖이 이만큼 연달아 확인돼야 클릭 통과로 돌아간다(80ms)
const MAX_REGIONS = 8;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 비상 스위치: CHOEAE_DISABLE_CLICKTHROUGH=1(또는 true)이면 끈다. 기본은 켜짐
const isEnabled = (env) => { const v = String((env && env.CHOEAE_DISABLE_CLICKTHROUGH) || '').toLowerCase(); return !(v === '1' || v === 'true'); };

// 렌더러가 알려 준 영역 목록을 걸러 낸다. 영역: { kind: 'ellipse', cx, cy, rx, ry } | { kind: 'rect', x, y, w, h } (창 안 좌표). 잘못된 값은 버린다.
function sanitizeRegions(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const r of list.slice(0, MAX_REGIONS)) {
    if (!r || typeof r !== 'object') continue;
    if (r.kind === 'ellipse' && isNum(r.cx) && isNum(r.cy) && isNum(r.rx) && isNum(r.ry) && r.rx > 0 && r.ry > 0) out.push({ kind: 'ellipse', cx: r.cx, cy: r.cy, rx: r.rx, ry: r.ry });
    else if (r.kind === 'rect' && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && r.w > 0 && r.h > 0) out.push({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h });
  }
  return out;
}

// 점 (x, y)(창 안 좌표)가 영역 안인지. margin만큼 영역을 넓혀서 본다.
function inRegion(r, x, y, margin = 0) {
  if (r.kind === 'ellipse') { const dx = (x - r.cx) / (r.rx + margin), dy = (y - r.cy) / (r.ry + margin); return dx * dx + dy * dy <= 1; }
  return x >= r.x - margin && x <= r.x + r.w + margin && y >= r.y - margin && y <= r.y + r.h + margin;
}
const hitAny = (regions, x, y, margin = 0) => regions.some(r => inRegion(r, x, y, margin));

// 한 번의 판정. state: { interactive, miss }. 반환: 새 state.
//  - regions가 없거나 비어 있으면(아직 알려 주지 않음) 항상 받는다(안전하게 열어 둔다).
//  - 드래그 중이면 항상 받는다(커서가 펫 원 밖으로 잠깐 벗어나도 드래그가 끊기지 않게).
//  - 통과 중일 때: 영역 안에 들어오면 즉시 받는다. 받는 중일 때: 넓힌 영역(margin) 밖이 LEAVE_CONFIRMS번 연속이어야 통과로 돌아간다.
function step(state, { cursor, bounds, regions, dragging = false }) {
  const s = state || { interactive: true, miss: 0 };
  if (dragging || !regions || regions.length === 0 || !cursor || !bounds) return { interactive: true, miss: 0 };
  const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
  if (!s.interactive) return hitAny(regions, x, y, 0) ? { interactive: true, miss: 0 } : { interactive: false, miss: 0 };
  if (hitAny(regions, x, y, LEAVE_MARGIN)) return { interactive: true, miss: 0 };
  const miss = s.miss + 1;
  return miss >= LEAVE_CONFIRMS ? { interactive: false, miss: 0 } : { interactive: true, miss };
}

// 창이 클릭을 통과시킬지: 스위치가 꺼져 있으면 예전 동작(초집중 모드에서 마우스가 펫 위가 아닐 때만 통과). 켜져 있으면 판정(hit)이 아니고 초집중 모드의 렌더러 판정도 아닐 때 통과.
function shouldIgnore({ enabled, focusEnabled, rendererInteractive, hit }) {
  if (!enabled) return !!focusEnabled && !rendererInteractive;
  return !hit && !(focusEnabled && rendererInteractive);
}

// 퀵 메뉴 창의 영역: 호의 버튼(원)과 카드(사각형). 호 모드가 아니면 null(= 창 전체가 받는다)
function quickRegions(layout, btnSize = 44) {
  if (!layout || layout.mode !== 'arc') return null;
  const regions = layout.buttons.map(b => ({ kind: 'ellipse', cx: b.x, cy: b.y, rx: btnSize / 2, ry: btnSize / 2 }));
  if (layout.card) regions.push({ kind: 'rect', x: layout.card.x, y: layout.card.y, w: layout.card.w, h: layout.card.h });
  return regions;
}

module.exports = { POLL_MS, LEAVE_MARGIN, LEAVE_CONFIRMS, MAX_REGIONS, isEnabled, sanitizeRegions, inRegion, hitAny, step, shouldIgnore, quickRegions };
