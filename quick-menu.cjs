'use strict';
// 펫 우클릭 퀵 메뉴의 메인 쪽 순수 계산(창을 직접 만지지 않는다: tests/quick-menu-unit.cjs).
//  - 호(arc) 배치: 펫 중심을 기준으로 버튼을 반원 호에 놓고, 화면 가장자리에서는 방향(위→아래→왼쪽→오른쪽)을 돌려 잘리지 않게 한다. 7개 이상은 알약 바(bar)로 바꾼다.
//  - 퀵 창은 호와 카드(날씨·알람)를 모두 담는 하나의 투명 창이고, 크기와 위치는 여기서 계산한다.

const BTN = 44;                 // 원형 버튼 지름
const SHADOW_PAD = 26;          // 그림자·호버 확대·열림 모션의 솟구침(overshoot 16px)이 잘리지 않게 하는 여백
const CARD_GAP = 10;            // 호와 카드 사이
const ARC_MAX = 6;              // 호는 6개까지, 7개 이상은 알약 바
const PET_BASE_PX = 64;         // 펫 이모지 기본 크기(PetPage의 64 * 크기%)
const RADIUS_PER_PET = 1.7;     // 호 반지름 = 펫 크기 × 이 값(펫이 크면 호도 커진다)
const HINT = { w: 176, h: 34 }; // 종료 확인 말풍선(버튼 위)
const DIRS = ['up', 'down', 'left', 'right'];   // 먼저 시도하는 순서
const DIR_ANGLE = { up: -90, down: 90, left: 180, right: 0 };   // 호 가운데가 향하는 각도(화면 좌표: 오른쪽 0도, 아래 90도)
const PET_CENTER_LIFT = 8;      // 펫 중심에서 약간 위에서 시작한다
// 펫 창(240×230) 안에서 보이는 펫의 중심: 아래 여백 17px, 이모지는 64×크기% 의 약 1.19배
const PET_WIN = { w: 240, h: 230, bottom: 17, emojiRatio: 1.19 };

const QUICK_W = 340;            // 알약 바 모드의 첫 창 너비
const QUICK_INITIAL_H = 140;    // 첫 크기 알림이 오기 전의 높이
const QUICK_MIN = { w: 100, h: 60 };
const QUICK_MAX = { w: 560, h: 700 };
const QUICK_SHOW_FALLBACK_MS = 600;   // 첫 알림이 안 와도 이때는 보여 준다
const QUICK_BLUR_GRACE_MS = 250;      // 열린 직후의 포커스 흔들림으로는 닫지 않는다
const QUICK_CLOSE_MS = 170;           // 닫힘 모션(0.15초) 뒤에 창을 없앤다
const QUICK_FULL_CLICK_MS = 700;      // 열린 직후(버튼이 날아가는 동안)는 창 전체가 클릭을 받는다 → 안착 전에도 누를 수 있다. 그 뒤에는 버튼·카드 위에서만 받는다
const CARD_MAX = { w: 420, h: 680 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rad = (deg) => (deg * Math.PI) / 180;

// 렌더러가 알려 준 크기를 허용 범위로 맞춘다. 숫자가 아니면 null
function clampQuickSize(w, h) {
  if (!isNum(w) || !isNum(h)) return null;
  return { width: clampN(Math.round(w), QUICK_MIN.w, QUICK_MAX.w), height: clampN(Math.round(h), QUICK_MIN.h, QUICK_MAX.h) };
}
const clampCard = (w, h) => (isNum(w) && isNum(h) && w > 0 && h > 0 ? { w: clampN(Math.round(w), 100, CARD_MAX.w), h: clampN(Math.round(h), 40, CARD_MAX.h) } : null);

// 퀵 메뉴의 기본 배치. 'bar'(가로 알약 바)가 기본이다. 'radial'(방사형으로 쏟아지는 호)은 코드에 남겨 두었고 이 상수만 바꾸면 전환된다(설정 UI에는 노출하지 않는다).
// 호 배치는 6개까지이고 그보다 많으면 바로 바뀐다.
const QUICK_MENU_LAYOUT = 'bar';
const modeFor = (count, layout = QUICK_MENU_LAYOUT) => (layout === 'radial' && count <= ARC_MAX ? 'arc' : 'bar');
// 바가 한 줄로 쓸 수 있는 최대 폭: 작업 영역 폭에서 양쪽 여백을 뺀 값(넘으면 CSS가 두 줄로 줄바꿈한다)
const barMaxWidth = (work) => Math.max(160, Math.round(work.width - 2 * 12));

// 호가 벌어지는 각도(도): 4개 180, 5개 210, 6개 240(많을수록 넓힌다)
function arcSpanDeg(n) { return n <= 1 ? 0 : n === 2 ? 60 : n === 3 ? 120 : n === 4 ? 180 : n === 5 ? 210 : 240; }
// 호 반지름(px): 펫 크기(%)에 비례
const arcRadius = (sizePct) => Math.round(RADIUS_PER_PET * PET_BASE_PX * clampN(Number(sizePct) || 100, 50, 200) / 100);
// 방향 dir로 n개를 균등 배치한 각도들(도). 처음 버튼이 호의 시작, 마지막(종료)이 가장 바깥 끝이다.
function arcAngles(n, dir) {
  const center = DIR_ANGLE[dir] ?? -90;
  if (n <= 1) return [center];
  const span = arcSpanDeg(n);
  return Array.from({ length: n }, (_, i) => center - span / 2 + (i * span) / (n - 1));
}
// 펫 창 bounds → 보이는 펫의 중심(화면 좌표). 호는 여기서 약간 위를 기준으로 퍼진다.
function petCenter(pet, sizePct) {
  const emoji = PET_BASE_PX * clampN(Number(sizePct) || 100, 50, 200) / 100 * PET_WIN.emojiRatio;
  return { x: pet.x + pet.width / 2, y: pet.y + pet.height - PET_WIN.bottom - emoji / 2 - PET_CENTER_LIFT };
}

const union = (a, b) => (a ? { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) } : { ...b });
const rectBox = (x, y, w, h) => ({ minX: x, minY: y, maxX: x + w, maxY: y + h });

// 호의 기본 모양(호 중심 기준 상대 좌표): 버튼 중심들, 버튼·종료 안내가 차지하는 상자
function arcShape(n, radius, dir) {
  const pts = arcAngles(n, dir).map(a => ({ x: Math.cos(rad(a)) * radius, y: Math.sin(rad(a)) * radius }));
  let box = null;
  for (const p of pts) box = union(box, rectBox(p.x - BTN / 2, p.y - BTN / 2, BTN, BTN));
  return { pts, box };   // 종료 안내 말풍선은 방향·위치 판단에 넣지 않는다(아래 layoutArc에서 자리를 잡는다)
}

// 상자가 work 밖으로 나간 넓이(px²). 0이면 완전히 들어온다
function overflowOf(box, work) {
  const w = box.maxX - box.minX, h = box.maxY - box.minY;
  const ox = Math.max(0, work.x - box.minX) + Math.max(0, box.maxX - (work.x + work.width));
  const oy = Math.max(0, work.y - box.minY) + Math.max(0, box.maxY - (work.y + work.height));
  return ox * h + oy * w - ox * oy;
}

// 카드 상자(호 중심 기준 상대): 호 바깥쪽(방향 쪽)에 붙인다
function cardRect(dir, shapeBox, card) {
  if (!card) return null;
  if (dir === 'up') return { x: -card.w / 2, y: shapeBox.minY - CARD_GAP - card.h, w: card.w, h: card.h };
  if (dir === 'down') return { x: -card.w / 2, y: shapeBox.maxY + CARD_GAP, w: card.w, h: card.h };
  if (dir === 'left') return { x: shapeBox.minX - CARD_GAP - card.w, y: -card.h / 2, w: card.w, h: card.h };
  return { x: shapeBox.maxX + CARD_GAP, y: -card.h / 2, w: card.w, h: card.h };
}

// 방향 고르기: 위 → 아래 → 왼쪽 → 오른쪽 순으로 처음 완전히 들어오는 방향. 모두 안 들어오면 넘치는 넓이가 가장 작은 방향.
function chooseDirection({ count, radius, origin, work }) {
  let best = null;
  for (const dir of DIRS) {
    const s = arcShape(count, radius, dir);
    const ov = overflowOf({ minX: origin.x + s.box.minX - SHADOW_PAD, minY: origin.y + s.box.minY - SHADOW_PAD, maxX: origin.x + s.box.maxX + SHADOW_PAD, maxY: origin.y + s.box.maxY + SHADOW_PAD }, work);
    if (ov === 0) return dir;
    if (!best || ov < best.ov) best = { dir, ov };
  }
  return best.dir;
}

// 종료 확인 안내 말풍선: 종료 버튼 위(창 안 좌표). 위에 자리가 없으면 아래에 둔다. 가로는 창 안으로 맞춘다. last: 종료 버튼 중심(창 안)
function placeHint(last, bounds, work) {
  const aboveY = last.y - BTN / 2 - 6 - HINT.h;
  const fitsAbove = bounds.y + aboveY >= work.y + 2 && aboveY >= 0;
  const y = fitsAbove ? aboveY : last.y + BTN / 2 + 6;
  const x = clampN(Math.round(last.x - HINT.w / 2), 0, Math.max(0, bounds.width - HINT.w));
  return { x, y: Math.round(y), w: HINT.w, h: HINT.h };
}

// 호 + 카드 + 창 계산. origin: 펫 중심(화면 좌표, 버튼들이 날아 나오는 곳), work: 펫이 있는 모니터의 작업 영역, card: { w, h } | null
// 반환: { mode: 'arc', dir, bounds(창, 화면 좌표), pet(창 안 시작점), buttons[{x,y,dx,dy}](창 안 중심과 시작점→중심 벡터), card(창 안 상자)|null, hint(창 안 상자), radius }
// 호가 화면 밖으로 나가면 호 전체를 안쪽으로 밀어 넣는다(펫 중심에서 날아 나오는 시작점은 그대로).
function layoutArc({ count, sizePct = 100, origin, work, card = null, dir = null }) {
  const radius = arcRadius(sizePct);
  const d = dir || chooseDirection({ count, radius, origin, work });
  const shape = arcShape(count, radius, d);
  const cr = cardRect(d, shape.box, card);
  let all = shape.box;
  if (cr) all = union(all, rectBox(cr.x, cr.y, cr.w, cr.h));
  // 호 중심이 펫 중심에 있을 때의 창 상자. 시작점(펫 중심)도 창 안에 있어야 한다.
  const pad = SHADOW_PAD;
  let box = { minX: all.minX - pad, minY: all.minY - pad, maxX: all.maxX + pad, maxY: all.maxY + pad };
  box = union(box, rectBox(-BTN / 2 - pad, -BTN / 2 - pad, BTN + pad * 2, BTN + pad * 2));
  let w = box.maxX - box.minX, h = box.maxY - box.minY;
  let sx = 0, sy = 0;   // 호를 밀어 넣는 양
  const left = origin.x + box.minX, top = origin.y + box.minY;
  if (w >= work.width) sx = work.x - left; else if (left < work.x) sx = work.x - left; else if (left + w > work.x + work.width) sx = work.x + work.width - (left + w);
  if (h >= work.height) sy = work.y - top; else if (top < work.y) sy = work.y - top; else if (top + h > work.y + work.height) sy = work.y + work.height - (top + h);
  // 시작점(펫 중심)은 밀지 않지만 창은 호와 함께 움직인다 → 시작점이 창 밖으로 나가면 창 상자를 시작점까지 넓힌다
  const arcCenter = { x: origin.x + sx, y: origin.y + sy };
  let wbox = { minX: box.minX + sx, minY: box.minY + sy, maxX: box.maxX + sx, maxY: box.maxY + sy };   // origin 기준 상대
  wbox = union(wbox, rectBox(-BTN / 2 - pad, -BTN / 2 - pad, BTN + pad * 2, BTN + pad * 2));
  // 창 경계는 정수로: 시작은 내림, 끝은 올림. 화면 안에 들어온 상자가 반올림 때문에 1px 넘치지 않게 안쪽으로 한 번 더 민다.
  let x0 = Math.floor(origin.x + wbox.minX), y0 = Math.floor(origin.y + wbox.minY);
  let x1 = Math.ceil(origin.x + wbox.maxX), y1 = Math.ceil(origin.y + wbox.maxY);
  if (x1 > work.x + work.width && x1 - x0 <= work.width) { x0 -= x1 - (work.x + work.width); x1 = work.x + work.width; }
  if (y1 > work.y + work.height && y1 - y0 <= work.height) { y0 -= y1 - (work.y + work.height); y1 = work.y + work.height; }
  if (x0 < work.x && x1 - x0 <= work.width) { x1 += work.x - x0; x0 = work.x; }
  if (y0 < work.y && y1 - y0 <= work.height) { y1 += work.y - y0; y0 = work.y; }
  const bounds = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const toWin = (px, py) => ({ x: Math.round((arcCenter.x + px) - bounds.x), y: Math.round((arcCenter.y + py) - bounds.y) });
  const petWin = { x: Math.round(origin.x - bounds.x), y: Math.round(origin.y - bounds.y) };
  const buttons = shape.pts.map((p) => { const c = toWin(p.x, p.y); return { x: c.x, y: c.y, dx: c.x - petWin.x, dy: c.y - petWin.y }; });
  const cardWin = cr ? { ...toWin(cr.x, cr.y), w: cr.w, h: cr.h } : null;
  const hintWin = placeHint(buttons[buttons.length - 1], bounds, work);
  return { mode: 'arc', dir: d, bounds, pet: petWin, buttons, card: cardWin, hint: hintWin, radius, shift: { x: sx, y: sy } };
}

// 알약 바 모드(7개 이상)의 창 위치: 펫 창의 가운데 위쪽, 위에 자리가 없으면 아래쪽, 그것도 모자라면 화면 안으로 밀어 넣는다.
// pet: 펫 창 bounds. 반환: { x, y, width, height, side: 'above' | 'below' }
function placeQuickWindow(pet, size, work, gap = 4) {
  const w = Math.min(size.width, work.width), h = Math.min(size.height, work.height);
  const catTop = pet.y + Math.round(pet.height * 0.4);   // 버디는 창 아래쪽에 있다: 머리 위쪽 선
  const catBottom = pet.y + pet.height;
  let y, side = 'above';
  if (catTop - gap - h >= work.y) y = catTop - gap - h;                              // 위
  else if (catBottom + gap + h <= work.y + work.height) { y = catBottom + gap; side = 'below'; }   // 아래
  else y = catTop - gap - h;                                                          // 둘 다 모자라면 아래에서 보정
  let x = Math.round(pet.x + pet.width / 2 - w / 2);
  x = Math.max(work.x, Math.min(x, work.x + work.width - w));
  y = Math.max(work.y, Math.min(y, work.y + work.height - h));
  return { x, y, width: w, height: h, side };
}

// 펫 창 중심에서 가장 가까운 모니터를 고른다(다중 모니터: 펫이 있는 모니터 안에 둔다). displays: [{ workArea }]
function pickWorkArea(pet, displays) {
  const cx = pet.x + pet.width / 2, cy = pet.y + pet.height / 2;
  let best = null, bestD = Infinity;
  for (const d of displays) {
    const a = d.workArea;
    const dx = cx < a.x ? a.x - cx : cx > a.x + a.width ? cx - (a.x + a.width) : 0;
    const dy = cy < a.y ? a.y - cy : cy > a.y + a.height ? cy - (a.y + a.height) : 0;
    const dist = dx * dx + dy * dy;
    if (dist < bestD) { bestD = dist; best = a; }
  }
  return best;
}

// 퀵 창이 보낸 동작만 받는다
const QUICK_ACTIONS = ['open', 'weather-setup', 'alarm-settings', 'alarm-calendar', 'quit'];
const isQuickAction = (a) => typeof a === 'string' && QUICK_ACTIONS.includes(a);

// 동작 → 설정창이 갈 곳(null이면 그냥 설정창 열기)
function settingsTargetFor(action, arg) {
  if (action === 'weather-setup') return { page: 'home', focus: 'weather-city' };
  if (action === 'alarm-settings') return { page: 'alarm' };
  if (action === 'alarm-calendar') return { page: 'alarm', week: arg && arg.weekStart };   // 알람 화면을 열고 주간 캘린더를 그 주로(잘못된 값이면 sanitizeTarget이 week만 뺀다)
  return null;
}

// YYYY-MM-DD이고 실제로 있는 날짜인지
function isYmdString(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// 설정창이 받는 목적지: 알려진 값만 통과
function sanitizeTarget(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  if (t.page === 'home' || t.page === 'alarm') out.page = t.page;
  if (t.focus === 'weather-city') out.focus = t.focus;
  if (isYmdString(t.week)) out.week = t.week;
  return Object.keys(out).length ? out : null;
}

// 스케줄러가 쓰는 "실제로 설정된" 알람 값에서 퀵 메뉴가 읽는 부분만 뽑는다(읽기 전용: alarms.cjs의 resolveAlarmSettings를 그대로 쓴다)
function quickAlarmSettings(resolveAlarmSettings, alarmSettings) {
  const r = resolveAlarmSettings(alarmSettings);
  return { lunchOn: r.lunchOn, leaveOn: r.leaveOn, lunchTime: r.lunchTime, leaveTime: r.leaveTime, alarms: r.alarms };
}

module.exports = {
  QUICK_MENU_LAYOUT, barMaxWidth, BTN, SHADOW_PAD, CARD_GAP, ARC_MAX, RADIUS_PER_PET, HINT, DIRS, PET_WIN,
  QUICK_W, QUICK_INITIAL_H, QUICK_MIN, QUICK_MAX, QUICK_SHOW_FALLBACK_MS, QUICK_BLUR_GRACE_MS, QUICK_CLOSE_MS, QUICK_FULL_CLICK_MS, QUICK_ACTIONS,
  clampQuickSize, clampCard, modeFor, arcSpanDeg, arcRadius, arcAngles, petCenter, chooseDirection, layoutArc,
  placeQuickWindow, pickWorkArea, isQuickAction, settingsTargetFor, sanitizeTarget, quickAlarmSettings,
};
