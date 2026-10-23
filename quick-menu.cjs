'use strict';
// 펫 우클릭 퀵 메뉴의 메인 쪽 순수 계산(창을 직접 만지지 않는다: tests/quick-menu-unit.cjs).

const QUICK_W = 340;            // 퀵 창 너비(src/styles/quick.css의 .qk-root width와 같은 값)
const QUICK_INITIAL_H = 140;    // 첫 크기 알림이 오기 전의 높이
const QUICK_MIN = { w: 200, h: 60 };
const QUICK_MAX = { w: 520, h: 640 };
const QUICK_SHOW_FALLBACK_MS = 600;   // 첫 크기 알림이 안 와도 이때는 보여 준다
const QUICK_BLUR_GRACE_MS = 250;      // 열린 직후의 포커스 흔들림으로는 닫지 않는다

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 렌더러가 알려 준 크기를 허용 범위로 맞춘다. 숫자가 아니면 null
function clampQuickSize(w, h) {
  if (!isNum(w) || !isNum(h)) return null;
  const c = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
  return { width: c(w, QUICK_MIN.w, QUICK_MAX.w), height: c(h, QUICK_MIN.h, QUICK_MAX.h) };
}

// 퀵 창의 위치: 펫 창의 가운데 위쪽, 위에 자리가 없으면 아래쪽, 그것도 모자라면 화면 안으로 밀어 넣는다. 항상 work(펫이 있는 모니터의 작업 영역) 안에 들어온다.
// pet: 펫 창 bounds { x, y, width, height }
function placeQuickWindow(pet, size, work, gap = 4) {
  const w = Math.min(size.width, work.width), h = Math.min(size.height, work.height);
  const catTop = pet.y + Math.round(pet.height * 0.4);   // 버디는 창 아래쪽에 있다: 머리 위쪽 선
  const catBottom = pet.y + pet.height;
  let y;
  if (catTop - gap - h >= work.y) y = catTop - gap - h;                              // 위
  else if (catBottom + gap + h <= work.y + work.height) y = catBottom + gap;          // 아래
  else y = catTop - gap - h;                                                          // 둘 다 모자라면 아래에서 보정
  let x = Math.round(pet.x + pet.width / 2 - w / 2);
  x = Math.max(work.x, Math.min(x, work.x + work.width - w));
  y = Math.max(work.y, Math.min(y, work.y + work.height - h));
  return { x, y, width: w, height: h };
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
const QUICK_ACTIONS = ['open', 'weather-setup', 'alarm-settings', 'quit'];
const isQuickAction = (a) => typeof a === 'string' && QUICK_ACTIONS.includes(a);

// 동작 → 설정창이 갈 곳(null이면 그냥 설정창 열기)
function settingsTargetFor(action) {
  if (action === 'weather-setup') return { page: 'home', focus: 'weather-city' };
  if (action === 'alarm-settings') return { page: 'alarm' };
  return null;
}

// 설정창이 받는 목적지: 알려진 값만 통과
function sanitizeTarget(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  if (t.page === 'home' || t.page === 'alarm') out.page = t.page;
  if (t.focus === 'weather-city') out.focus = t.focus;
  return Object.keys(out).length ? out : null;
}

// 스케줄러가 쓰는 "실제로 설정된" 알람 값에서 퀵 메뉴가 읽는 부분만 뽑는다(읽기 전용: alarms.cjs의 resolveAlarmSettings를 그대로 쓴다)
function quickAlarmSettings(resolveAlarmSettings, alarmSettings) {
  const r = resolveAlarmSettings(alarmSettings);
  return { lunchOn: r.lunchOn, leaveOn: r.leaveOn, lunchTime: r.lunchTime, leaveTime: r.leaveTime, alarms: r.alarms };
}

module.exports = {
  QUICK_W, QUICK_INITIAL_H, QUICK_MIN, QUICK_MAX, QUICK_SHOW_FALLBACK_MS, QUICK_BLUR_GRACE_MS, QUICK_ACTIONS,
  clampQuickSize, placeQuickWindow, pickWorkArea, isQuickAction, settingsTargetFor, sanitizeTarget, quickAlarmSettings,
};
