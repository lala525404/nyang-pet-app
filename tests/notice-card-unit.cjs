// 안내 카드 큐·배치 단위 테스트: 한 번에 하나, 막힌 이유(초집중·퀵 메뉴·알람·펫 숨김·종료), 카드 사이 쉼, 같은 카드 중복 방지, 미루기,
// 배치(화면 가장자리·두 모니터·이상한 값), 시험용 환경변수(기본 꺼짐), 메인 연결(정적 확인).
// `node tests/notice-card-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const N = require('../notice-card.cjs'), Q = require('../quick-menu.cjs');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const FFFD = String.fromCharCode(0xFFFD);
const FREE = { petVisible: true, focus: false, quickOpen: false, alertCount: 0, quitting: false };

t('막힌 이유: 종료 중·펫 안 보임·초집중·퀵 메뉴·알람(전체화면 알림) 순서로 알려 주고, 모두 아니면 null', () => {
  assert.strictEqual(N.blockReason(FREE), null);
  assert.strictEqual(N.blockReason({ ...FREE, quitting: true }), 'quitting');
  assert.strictEqual(N.blockReason({ ...FREE, petVisible: false }), 'pet-hidden');
  assert.strictEqual(N.blockReason({ ...FREE, focus: true }), 'focus');
  assert.strictEqual(N.blockReason({ ...FREE, quickOpen: true }), 'quick-menu');
  assert.strictEqual(N.blockReason({ ...FREE, alertCount: 1 }), 'alarm');
  assert.strictEqual(N.blockReason({ ...FREE, alertCount: 0 }), null);
  assert.strictEqual(N.blockReason(null), 'quitting');   // 상태를 모르면 띄우지 않는다
});
t('한 번에 하나: 먼저 들어온 카드부터, 떠 있는 동안에는 다음 카드가 나오지 않는다', () => {
  const q = N.createNoticeQueue();
  q.enqueue({ kind: 'whatsnew', key: '1.7.0' }); q.enqueue({ kind: 'brief', key: '2026-10-26' }); q.enqueue({ kind: 'update', key: '1.8.0' });
  const a = q.peek({ now: 10000, blockers: FREE }); assert.strictEqual(a.kind, 'whatsnew');
  assert.ok(q.start(a.id));
  assert.strictEqual(q.peek({ now: 10001, blockers: FREE }), null, '떠 있는 동안에는 없다');
  assert.strictEqual(q.start(q.list()[0].id), null, '두 번째 카드를 동시에 시작할 수 없다');
  q.finish(a.id, 20000);
  assert.strictEqual(q.peek({ now: 20000 + N.GAP_MS - 1, blockers: FREE }), null, '닫힌 직후에는 쉰다');
  const b = q.peek({ now: 20000 + N.GAP_MS, blockers: FREE }); assert.strictEqual(b.kind, 'brief');
  q.start(b.id); q.finish(b.id, 30000);
  assert.strictEqual(q.peek({ now: 40000, blockers: FREE }).kind, 'update');
});
t('막힌 동안에는 카드를 내보내지 않고 큐에 남아 있다가, 풀리면 나온다(끝날 때까지 대기)', () => {
  const q = N.createNoticeQueue(); q.enqueue({ kind: 'brief', key: 'd' });
  for (const b of [{ focus: true }, { quickOpen: true }, { alertCount: 2 }, { petVisible: false }, { quitting: true }]) {
    assert.strictEqual(q.peek({ now: 1e6, blockers: { ...FREE, ...b } }), null, JSON.stringify(b));
    assert.strictEqual(q.size, 1);
  }
  assert.strictEqual(q.peek({ now: 1e6, blockers: FREE }).kind, 'brief');
});
t('같은 종류·같은 key는 중복으로 쌓이지 않는다(기다리는 중이든 떠 있든). key가 다르면 따로', () => {
  const q = N.createNoticeQueue();
  const a = q.enqueue({ kind: 'update', key: '1.8.0', payload: { n: 1 } }), b = q.enqueue({ kind: 'update', key: '1.8.0', payload: { n: 2 } });
  assert.strictEqual(a.dup, false); assert.strictEqual(b.dup, true); assert.strictEqual(b.item.id, a.item.id); assert.strictEqual(b.item.payload.n, 1);
  q.start(a.item.id);
  assert.strictEqual(q.enqueue({ kind: 'update', key: '1.8.0' }).dup, true, '떠 있는 카드와도 중복');
  assert.strictEqual(q.enqueue({ kind: 'update', key: '1.9.0' }).dup, false);
  assert.strictEqual(q.size, 1);
});
t('알 수 없는 종류·이상한 입력은 거절하고 큐를 망가뜨리지 않는다', () => {
  const q = N.createNoticeQueue();
  for (const k of ['', 'x', null, undefined, 5, '__proto__', 'WHATSNEW']) assert.strictEqual(q.enqueue({ kind: k }), null, String(k));
  assert.strictEqual(q.size, 0); assert.strictEqual(q.pending, false);
  assert.strictEqual(q.finish(99, 1), null); assert.strictEqual(q.defer(99), null); assert.strictEqual(q.start(99), null); assert.strictEqual(q.drop(99), false);
});
t('미루기(defer): 떠 있던 카드를 닫지 않고 맨 앞으로 되돌린다(쉼 없이), 다시 막힘이 풀리면 같은 카드가 나온다', () => {
  const q = N.createNoticeQueue(); const a = q.enqueue({ kind: 'whatsnew', key: 'v' }).item; q.enqueue({ kind: 'brief', key: 'd' });
  q.start(a.id); const back = q.defer(a.id);
  assert.strictEqual(back.id, a.id); assert.strictEqual(q.active, null); assert.strictEqual(q.list()[0].id, a.id);
  assert.strictEqual(q.peek({ now: 5, blockers: FREE }).id, a.id);
});
t('보이지 않고 끝난 카드(silent)는 쉼 없이 바로 다음 카드가 나온다', () => {
  const q = N.createNoticeQueue(); const a = q.enqueue({ kind: 'update', key: 'v' }).item; q.enqueue({ kind: 'brief', key: 'd' });
  q.start(a.id); q.finish(a.id, 1000, { silent: true });
  assert.strictEqual(q.peek({ now: 1000, blockers: FREE }).kind, 'brief');
});
t('상태: pending은 기다리거나 떠 있을 때 true, 다 끝나면 false(타이머를 더 돌릴 이유가 없다)', () => {
  const q = N.createNoticeQueue(); assert.strictEqual(q.pending, false);
  const a = q.enqueue({ kind: 'brief', key: 'd' }).item; assert.strictEqual(q.pending, true);
  q.start(a.id); assert.strictEqual(q.pending, true); q.finish(a.id, 1); assert.strictEqual(q.pending, false);
});

// ── 배치 ──
const work = { x: 0, y: 0, width: 1920, height: 1040 };
const petAt = (x, y) => ({ x, y, width: 240, height: 230 });
const inside = (r, w) => r.x >= w.x && r.y >= w.y && r.x + r.width <= w.x + w.width && r.y + r.height <= w.y + w.height;
const isInt = (r) => ['x', 'y', 'width', 'height'].every(k => Number.isInteger(r[k]));
t('배치: 화면 네 모서리·가운데에서도 카드 창이 작업 영역 안에 들어오고 정수다. 위에 자리가 없으면 아래', () => {
  const size = { width: 368, height: 260 };
  for (const [x, y] of [[0, 0], [1680, 0], [0, 810], [1680, 810], [840, 400], [1680, 810]]) {
    const r = N.placeNotice({ pet: petAt(x, y), size, work }); assert.ok(r, `${x},${y}`);
    assert.ok(inside(r, work), JSON.stringify(r)); assert.ok(isInt(r));
  }
  assert.strictEqual(N.placeNotice({ pet: petAt(840, 810), size, work }).side, 'above');
  assert.strictEqual(N.placeNotice({ pet: petAt(840, 0), size, work }).side, 'below');
});
t('배치: 카드의 보이는 부분이 펫 이미지와 겹치지 않는다(위: 카드 아래 끝 ≤ 이미지 위, 아래: 카드 위 끝 ≥ 이미지 아래)', () => {
  const size = { width: 368, height: 260 };
  for (const [x, y] of [[840, 810], [840, 400], [840, 0]]) {
    const pet = petAt(x, y), r = N.placeNotice({ pet, size, work }), img = Q.petImageRect(pet, 100, {});
    if (r.side === 'above') assert.ok(r.y + r.height - Q.QUICK_WIN_PAD <= img.y + 0.5, `above ${x},${y}`);
    else assert.ok(r.y + Q.QUICK_WIN_PAD >= img.y + img.height - 0.5, `below ${x},${y}`);
  }
});
t('배치: 두 번째 모니터(음수 좌표·오른쪽 모니터)에서도 그 모니터 작업 영역 안에 놓인다', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1040 }, right = { x: 1920, y: -200, width: 1280, height: 720 };
  assert.ok(inside(N.placeNotice({ pet: petAt(-300, 780), size: { width: 368, height: 200 }, work: left }), left));
  assert.ok(inside(N.placeNotice({ pet: petAt(3000, -190), size: { width: 368, height: 200 }, work: right }), right));
  assert.strictEqual(Q.pickWorkArea(petAt(-300, 780), [{ workArea: left }, { workArea: work }, { workArea: right }]), left);
});
t('배치: 초집중 모드·펫 크기 설정을 반영하고, 큰·작은 카드는 허용 범위로 맞추며, NaN·문자열·Infinity는 null(예외 없음)', () => {
  const big = N.placeNotice({ pet: petAt(840, 810), size: { width: 9999, height: 9999 }, work }); assert.ok(big && inside(big, work) && big.width <= Q.QUICK_MAX.w && big.height <= Q.QUICK_MAX.h);
  assert.ok(N.placeNotice({ pet: petAt(840, 810), size: { width: 368, height: 200 }, work, focus: true, sizePct: 200 }));
  for (const bad of [null, {}, { width: NaN, height: 10 }, { width: '368', height: 200 }, { width: Infinity, height: 200 }])
    assert.strictEqual(N.placeNotice({ pet: petAt(0, 0), size: bad, work }), null, JSON.stringify(bad));
  const tiny = N.placeNotice({ pet: petAt(0, 0), size: { width: 0, height: 0 }, work });   // 숫자지만 너무 작으면 최소 크기로 맞춘다(퀵 메뉴와 같은 규칙)
  assert.ok(tiny && tiny.width === Q.QUICK_MIN.w && tiny.height === Q.QUICK_MIN.h && inside(tiny, work));
  for (const bad of [null, { x: NaN, y: 0, width: 240, height: 230 }, { x: 0, y: 0, width: 0, height: 230 }])
    assert.strictEqual(N.placeNotice({ pet: bad, size: { width: 368, height: 200 }, work }), null);
  assert.strictEqual(N.placeNotice({ pet: petAt(0, 0), size: { width: 368, height: 200 }, work: null }), null);
});
t('크기: 렌더러가 알려 준 크기는 퀵 메뉴와 같은 범위로 맞춘다', () => {
  assert.deepStrictEqual(N.clampSize(368.4, 120.2), { width: 368, height: 120 });
  assert.strictEqual(N.clampSize('a', 1), null);
});

// ── 시험용 환경변수 ──
t('환경변수: 아무것도 없으면 전부 꺼짐. 1·true만 켜짐, 업타임은 0 이상의 숫자만', () => {
  assert.deepStrictEqual(N.readTestEnv({}), { forceWhatsNew: false, fakeNotesPath: null, forceBrief: false, fakeUptimeSec: null });
  assert.deepStrictEqual(N.readTestEnv(undefined), { forceWhatsNew: false, fakeNotesPath: null, forceBrief: false, fakeUptimeSec: null });
  const e = N.readTestEnv({ CHOEAE_FORCE_WHATSNEW: '1', CHOEAE_FORCE_BRIEF: 'TRUE', CHOEAE_FAKE_UPDATE_NOTES: ' C:\\x\\notes.md ', CHOEAE_FAKE_UPTIME_SEC: '179' });
  assert.deepStrictEqual(e, { forceWhatsNew: true, fakeNotesPath: 'C:\\x\\notes.md', forceBrief: true, fakeUptimeSec: 179 });
  for (const v of ['0', 'false', '', 'yes', '2']) assert.strictEqual(N.readTestEnv({ CHOEAE_FORCE_BRIEF: v, CHOEAE_FORCE_WHATSNEW: v }).forceBrief, false, v);
  for (const v of ['abc', '-1', 'NaN', 'Infinity', '']) assert.strictEqual(N.readTestEnv({ CHOEAE_FAKE_UPTIME_SEC: v }).fakeUptimeSec, null, v);
  assert.strictEqual(N.readTestEnv({ CHOEAE_FAKE_UPTIME_SEC: '0' }).fakeUptimeSec, 0);
  assert.strictEqual(N.readTestEnv({ CHOEAE_FAKE_UPDATE_NOTES: '   ' }).fakeNotesPath, null);
});
t('파일에 깨진 글자(U+FFFD)·???가 없다', () => {
  const src = read('notice-card.cjs'); assert.ok(!src.includes(FFFD) && !/\?{3}/.test(src));
});

(async () => {
  let n = 0;
  for (const [name, fn] of queue) { await fn(); n++; console.log('  ok  ' + name); }
  console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
