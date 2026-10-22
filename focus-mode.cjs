'use strict';
// 초집중 모드: 펫이 한자리에서 조금만 움직이고 시계만 띄워 두는 모드. 알람은 이 모드와 상관없이 평소처럼 울린다(알람 코드는 이 파일을 쓰지 않는다).
// 상태(켬/끔·시계 초 표시·기준 위치)는 메인이 소유하고 userData/focus-mode.json에 저장한다. 설정창·트레이·버디 창이 모두 메인을 거쳐 바꾸므로
// 서로 덮어쓰지 않고, 앱을 다시 켜도(로그인 자동 실행의 조용한 시작 포함) 같은 상태로 시작한다. 기본값은 꺼짐.
const fs = require('fs');

const DEFAULTS = Object.freeze({ enabled: false, seconds: false, anchor: null });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 저장값·IPC 입력을 안전한 모양으로 정리한다(켬/끔은 true일 때만 켬, 기준 위치는 숫자 두 개일 때만)
function sanitizeFocus(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const a = r.anchor;
  return { enabled: r.enabled === true, seconds: r.seconds === true, anchor: a && isNum(a.x) && isNum(a.y) ? { x: Math.round(a.x), y: Math.round(a.y) } : null };
}
function loadFocus(file) { try { return sanitizeFocus(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return { ...DEFAULTS }; } }
function saveFocus(file, state) { try { fs.writeFileSync(file, JSON.stringify(sanitizeFocus(state))); return true; } catch { return false; } }

// { enabled?, seconds?, anchor? } 중 "들어 있는" 키만 반영한다. → { state, changed, enabledChanged, onlyAnchor }
function applyFocusChange(state, change) {
  const c = change && typeof change === 'object' ? change : {};
  const next = { ...state };
  if (typeof c.enabled === 'boolean') next.enabled = c.enabled;
  if (typeof c.seconds === 'boolean') next.seconds = c.seconds;
  if (c.anchor === null || (c.anchor && isNum(c.anchor.x) && isNum(c.anchor.y))) next.anchor = c.anchor ? { x: Math.round(c.anchor.x), y: Math.round(c.anchor.y) } : null;
  const same = (a, b) => (a === b) || (!!a && !!b && a.x === b.x && a.y === b.y);
  const changed = next.enabled !== state.enabled || next.seconds !== state.seconds || !same(next.anchor, state.anchor);
  const enabledChanged = next.enabled !== state.enabled;
  return { state: next, changed, enabledChanged, onlyAnchor: changed && !enabledChanged && next.seconds === state.seconds };
}

const TRAY_LABEL = { on: '🎯 초집중 모드 끄기', off: '🎯 초집중 모드 켜기' };
const trayLabel = (enabled) => (enabled ? TRAY_LABEL.on : TRAY_LABEL.off);

// 클릭 통과: 초집중 모드에서는 버디 위가 아닌 곳의 클릭이 아래 창으로 통과한다(버디 위에서는 드래그·우클릭이 되도록 받는다). 모드가 꺼져 있으면 평소대로 항상 받는다.
const ignoreMouse = (state, petInteractive) => !!state.enabled && !petInteractive;
// 야르 타임(전체 화면 이모지)은 주의를 끄는 동작이라 초집중 모드에서는 돌리지 않는다. 꺼 두었다가 모드를 끄면 원래 간격으로 돌아간다.
const effectiveYarMinutes = (state, desiredMinutes) => (state.enabled ? 0 : (desiredMinutes > 0 ? desiredMinutes : 0));

module.exports = { DEFAULTS, sanitizeFocus, loadFocus, saveFocus, applyFocusChange, trayLabel, TRAY_LABEL, ignoreMouse, effectiveYarMinutes };
