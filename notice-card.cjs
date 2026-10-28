'use strict';
// 펫 옆에 뜨는 안내 카드(업데이트 소식·새 버전 안내·부팅 브리핑)의 메인 쪽 순수 계산(창을 직접 만지지 않는다: tests/notice-card-unit.cjs).
//  - 카드는 한 번에 하나만 뜨고, 나머지는 큐에서 차례를 기다린다(먼저 들어온 순서).
//  - 초집중 모드·퀵 메뉴 열림·알람 울림(전체화면 알림)·펫이 안 보임·종료 중에는 끝날 때까지 기다린다(오늘 브리핑은 초집중 모드를 기다리지 않는다). 카드 사이에는 짧은 쉼(GAP)을 둔다.
//  - 위치·크기는 퀵 메뉴(quick-menu.cjs)와 같은 계산을 쓴다(반올림·유한값 검사·화면 가장자리 보정).
//  - 시험용 환경변수(기본 꺼짐, 배포 빌드에서는 무시): CHOEAE_FORCE_WHATSNEW=1, CHOEAE_FAKE_UPDATE_NOTES=<파일>, CHOEAE_FORCE_BRIEF=1, CHOEAE_FAKE_UPTIME_SEC=<초>
const quickMenu = require('./quick-menu.cjs');

const KINDS = ['whatsnew', 'update', 'brief'];
const RETRY_MS = 1500;          // 막혀 있을 때 다시 살피는 간격(큐에 카드가 있는 동안에만 돈다)
const GAP_MS = 1200;            // 한 카드가 닫힌 뒤 다음 카드가 뜨기까지의 쉼
const SHOW_FALLBACK_MS = 800;   // 카드 창이 크기를 알려 오지 않아도 이때는 보여 준다
const AUTO_CLOSE_MS = { brief: 60 * 1000 };   // 브리핑은 한 번 훑어보면 되는 카드라 60초 뒤 스스로 닫힌다(소식·새 버전 안내는 사용자가 누를 때까지)
const NOTICE_CLOSE_MS = 170;    // 닫힘 모션 뒤에 창을 없앤다(퀵 메뉴와 같다)

// 카드를 지금 띄우면 안 되는 이유(없으면 null). 모두 메인이 이미 알고 있는 상태다. kind를 주면 그 종류에는 해당하지 않는 이유는 뺀다:
// 오늘 브리핑(brief)은 초집중 모드 중에도 보인다(초집중은 이미 펫이 제자리라 카드를 펫 이미지에 붙여 띄워도 상태가 꼬이지 않는다).
// 소식·새 버전 안내 카드는 kind를 몰라도(생략) 초집중 중에 기다린다. 알람 울림·퀵 메뉴 열림은 모든 카드가 기다린다.
function blockReason(s, kind) {
  if (!s || s.quitting) return 'quitting';
  if (!s.petVisible) return 'pet-hidden';        // 펫이 없거나 숨겨져 있으면 붙을 곳이 없다
  if (s.focus && kind !== 'brief') return 'focus';   // 초집중 모드(브리핑만 예외)
  if (s.quickOpen) return 'quick-menu';          // 우클릭 퀵 메뉴가 열려 있는 동안
  if (s.alertCount > 0) return 'alarm';          // 점심·퇴근·알람 카드·야르 같은 전체화면 알림이 떠 있는 동안
  return null;
}

function createNoticeQueue() {
  const waiting = [];          // 기다리는 카드(앞이 먼저)
  let active = null;           // 지금 떠 있는 카드
  let lastClosedAt = -Infinity;
  let seq = 0;
  const sameKey = (a, b) => a.kind === b.kind && a.key === b.key;
  return {
    // 같은 종류·같은 key의 카드가 이미 기다리거나 떠 있으면 새로 쌓지 않고 그 카드를 돌려준다(dup: true). 알 수 없는 종류는 거절(null)
    // priority: 사용자가 직접 요청한 카드(대화의 "브리핑해줘")는 자동 카드(소식·자동 브리핑)보다 앞에 선다. 떠 있는 카드를 끊지는 않고, 먼저 요청한 우선 카드 뒤에 선다
    enqueue({ kind, key = '', payload = null, priority = false }) {
      if (!KINDS.includes(kind)) return null;
      const probe = { kind, key: String(key) };
      const found = (active && sameKey(active, probe) && active) || waiting.find(w => sameKey(w, probe));
      if (found) return { item: found, dup: true };
      const item = { id: ++seq, kind, key: probe.key, payload, priority: priority === true };
      if (item.priority) { const at = waiting.findIndex(w => !w.priority); waiting.splice(at < 0 ? waiting.length : at, 0, item); }
      else waiting.push(item);
      return { item, dup: false };
    },
    // 지금 띄울 수 있는 카드: 떠 있는 카드가 없고, 막힌 이유가 없고, 앞 카드가 닫힌 지 GAP이 지났을 때 맨 앞 카드
    peek({ now, blockers }) {
      if (active || !waiting.length) return null;
      if (now - lastClosedAt < GAP_MS) return null;
      // 대기열 앞에서부터 "지금 띄울 수 있는" 첫 카드: 앞 카드가 자기 이유(예: 소식 카드의 초집중)로 막혀 있어도 뒤의 브리핑은 나갈 수 있다. 순서는 그대로 지킨다
      return waiting.find(w => !blockReason(blockers, w.kind)) || null;
    },
    start(id) {
      const i = waiting.findIndex(w => w.id === id);
      if (active || i < 0) return null;
      active = waiting.splice(i, 1)[0];
      return active;
    },
    // 닫혔다: 다음 카드는 GAP 뒤에. silent(보이지 않고 끝난 카드)이면 쉬지 않고 바로 다음 카드로
    finish(id, now, { silent = false } = {}) {
      if (!active || active.id !== id) return null;
      const done = active; active = null;
      if (!silent) lastClosedAt = now;
      return done;
    },
    // 닫지 않고 미룬다(퀵 메뉴가 열려 카드를 치워야 할 때 등): 떠 있던 카드를 맨 앞으로 되돌린다. 쉼은 두지 않는다
    defer(id) {
      if (!active || active.id !== id) return null;
      const it = active; active = null; waiting.unshift(it);
      return it;
    },
    drop(id) {   // 기다리는 카드를 지운다(떠 있는 카드는 finish로)
      const i = waiting.findIndex(w => w.id === id); if (i < 0) return false;
      waiting.splice(i, 1); return true;
    },
    get active() { return active; },
    get size() { return waiting.length; },
    get pending() { return waiting.length > 0 || !!active; },
    list() { return waiting.map(w => ({ id: w.id, kind: w.kind, key: w.key })); },
  };
}

// 렌더러가 알려 준 카드 크기를 허용 범위로 맞춘다(숫자가 아니면 null)
const clampSize = (w, h) => quickMenu.clampQuickSize(w, h);

// 카드 창의 위치: 퀵 메뉴의 알약 바와 같은 계산(펫 이미지 위, 자리가 없으면 아래, 화면 안으로 보정). pet: 펫 창 bounds, work: 펫이 있는 모니터의 작업 영역
// 반환: { x, y, width, height, side } (모두 정수) 또는 null(입력이 올바르지 않을 때)
function placeNotice({ pet, size, work, sizePct = 100, focus = false, measured = null }) {
  const p = quickMenu.safeBounds(pet), w = quickMenu.safeBounds(work), s = size && quickMenu.clampQuickSize(size.width, size.height);
  if (!p || !w || !s) return null;
  const r = quickMenu.placeQuickWindow(p, s, w, { sizePct, focus, measured });
  return quickMenu.safeBounds(r) ? { ...quickMenu.safeBounds(r), side: r.side } : null;
}

// ── 시험용 환경변수 ──
const on = (v) => { const s = String(v || '').toLowerCase(); return s === '1' || s === 'true'; };
// isPackaged(배포 빌드)이면 환경변수를 읽지 않고 전부 꺼진 값을 돌려준다(시험용 스위치와 임의 파일 읽기가 배포판에서 동작하지 않게)
function readTestEnv(env = {}, { isPackaged = false } = {}) {
  if (isPackaged) env = {};
  const sec = Number(env.CHOEAE_FAKE_UPTIME_SEC);
  return {
    forceWhatsNew: on(env.CHOEAE_FORCE_WHATSNEW),
    fakeNotesPath: typeof env.CHOEAE_FAKE_UPDATE_NOTES === 'string' && env.CHOEAE_FAKE_UPDATE_NOTES.trim() ? env.CHOEAE_FAKE_UPDATE_NOTES.trim() : null,
    forceBrief: on(env.CHOEAE_FORCE_BRIEF),
    fakeUptimeSec: env.CHOEAE_FAKE_UPTIME_SEC !== undefined && env.CHOEAE_FAKE_UPTIME_SEC !== '' && Number.isFinite(sec) && sec >= 0 ? sec : null,
  };
}

module.exports = { KINDS, RETRY_MS, GAP_MS, SHOW_FALLBACK_MS, AUTO_CLOSE_MS, NOTICE_CLOSE_MS, blockReason, createNoticeQueue, clampSize, placeNotice, readTestEnv };
