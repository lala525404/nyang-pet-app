// 초집중 모드 단위 테스트: 상태 저장·복원, 이동 범위 제한(시뮬레이션), 모드 중 알람 정상 발화, 시계 문구, 주의를 끄는 동작 연결(정적 확인).
// `node tests/focus-mode-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ts = require('typescript'); const F = require('../focus-mode.cjs'); const A = require('../alarms.cjs');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const load = (rel, deps = {}) => {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, (p) => deps[p] || ({ seedFreshTheme() {} }), { getItem: () => null, setItem() {} }, { location: { hash: '' } }); return m.exports;
};
const settingsTs = load('src/utils/settings.ts'); const U = load('src/utils/focusMode.ts', { './settings': settingsTs });

// ── 상태: 기본 꺼짐, 저장·복원 ───────────────────────────────────────────────
t('기본값은 꺼짐(켜지 않으면 아무것도 바뀌지 않는다), 시계 초 표시도 기본 꺼짐, 기준 위치 없음', () => {
  assert.deepStrictEqual(F.sanitizeFocus(undefined), { enabled: false, seconds: false, anchor: null });
  assert.deepStrictEqual(F.sanitizeFocus({ enabled: 'true', seconds: 1, anchor: { x: 'a', y: 2 } }), { enabled: false, seconds: false, anchor: null }, 'true가 아닌 값·잘못된 위치는 무시');
  assert.deepStrictEqual(F.loadFocus(path.join(os.tmpdir(), 'choeae-no-such-focus.json')), { enabled: false, seconds: false, anchor: null });
});
t('상태 저장·복원: 켬/끔·초 표시·기준 위치가 파일로 남아 앱을 다시 켜도 같다, 깨진 파일은 꺼짐', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choeae-focus-test-')), file = path.join(dir, 'focus-mode.json');
  try {
    assert.strictEqual(F.saveFocus(file, { enabled: true, seconds: true, anchor: { x: 1210.4, y: 640.6 } }), true);
    assert.deepStrictEqual(F.loadFocus(file), { enabled: true, seconds: true, anchor: { x: 1210, y: 641 } }, '다시 켜면 같은 상태(위치는 정수)');
    fs.writeFileSync(file, '{깨진 json'); assert.deepStrictEqual(F.loadFocus(file), { enabled: false, seconds: false, anchor: null });
    fs.writeFileSync(file, JSON.stringify({ enabled: true })); assert.deepStrictEqual(F.loadFocus(file), { enabled: true, seconds: false, anchor: null }, '일부만 있어도 나머지는 기본값');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
t('상태 변경: 들어 있는 키만 반영, 바뀌었는지·켬/끔이 바뀌었는지·위치만 바뀌었는지를 알려 준다', () => {
  const s0 = F.sanitizeFocus({});
  let r = F.applyFocusChange(s0, { enabled: true }); assert.deepStrictEqual([r.state.enabled, r.changed, r.enabledChanged, r.onlyAnchor], [true, true, true, false]);
  assert.strictEqual(F.applyFocusChange(r.state, { enabled: true }).changed, false, '같은 값은 바뀐 게 아님');
  const a = F.applyFocusChange(r.state, { anchor: { x: 10.2, y: 20.7 } }); assert.deepStrictEqual([a.state.anchor, a.onlyAnchor, a.enabledChanged], [{ x: 10, y: 21 }, true, false]);
  assert.strictEqual(F.applyFocusChange(a.state, { anchor: { x: 10, y: 21 } }).changed, false);
  const sec = F.applyFocusChange(a.state, { seconds: true }); assert.deepStrictEqual([sec.state.seconds, sec.onlyAnchor], [true, false]);
  assert.strictEqual(F.applyFocusChange(s0, { enabled: 'yes', seconds: 1, anchor: { x: NaN, y: 1 } }).changed, false, '잘못된 입력은 무시');
  assert.deepStrictEqual(F.applyFocusChange(s0, { enabled: true, seconds: undefined }).state.seconds, false);
});
t('트레이 메뉴 글자는 상태에 따라 켜기/끄기, 클릭 통과는 모드가 켜져 있고 버디 위가 아닐 때만, 야르는 모드 중에 멈추고 끄면 원래 간격', () => {
  assert.strictEqual(F.trayLabel(false), '🎯 초집중 모드 켜기'); assert.strictEqual(F.trayLabel(true), '🎯 초집중 모드 끄기');
  const on = { enabled: true }, off = { enabled: false };
  assert.deepStrictEqual([F.ignoreMouse(on, false), F.ignoreMouse(on, true), F.ignoreMouse(off, false), F.ignoreMouse(off, true)], [true, false, false, false]);
  assert.deepStrictEqual([F.effectiveYarMinutes(on, 60), F.effectiveYarMinutes(off, 60), F.effectiveYarMinutes(off, 0), F.effectiveYarMinutes(on, 0)], [0, 60, 0, 0]);
});

// ── 이동 범위 ────────────────────────────────────────────────────────────────
const WIN = { w: 240, h: 230 }, SCREEN = { x: 0, y: 0, w: 1920, h: 1080 };
t('이동 범위: 기준점에서 가로 ±40px·세로 ±24px 안, 모니터 안, 창이 화면 밖으로 안 나간다', () => {
  assert.deepStrictEqual([U.FOCUS_RANGE_X, U.FOCUS_RANGE_Y, U.FOCUS_TICK_MS, U.FOCUS_STEP_PX], [40, 24, 100, 1]);
  assert.deepStrictEqual(U.focusBounds({ x: 800, y: 500 }, SCREEN, WIN), { minX: 760, maxX: 840, minY: 476, maxY: 524 });
  const edge = U.focusBounds({ x: 1900, y: 1070 }, SCREEN, WIN); assert.deepStrictEqual(edge, { minX: 1640, maxX: 1680, minY: 826, maxY: 850 }, '기준점이 가장자리여도 창이 화면 안(1920-240, 1080-230)');
  const corner = U.focusBounds({ x: -500, y: -500 }, SCREEN, WIN); assert.deepStrictEqual(corner, { minX: 0, maxX: 40, minY: 0, maxY: 24 });
  const second = { x: 1920, y: 0, w: 2560, h: 1440 };   // 오른쪽 두 번째 모니터: 기준점이 그 모니터에 있으면 그 안에서만
  const b2 = U.focusBounds({ x: 1930, y: 100 }, second, WIN); assert.ok(b2.minX >= 1920 && b2.maxX <= 1920 + 2560 - 240, JSON.stringify(b2));
});
t('여러 모니터: 켠 시점에 버디가 있던 모니터(창 중심 기준)에 머문다', () => {
  const mons = [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }, { bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }];
  assert.deepStrictEqual(U.monitorRectAt(mons, { x: 2100, y: 300 }, WIN), { x: 1920, y: 0, w: 2560, h: 1440 });
  assert.deepStrictEqual(U.monitorRectAt(mons, { x: 100, y: 100 }, WIN), { x: 0, y: 0, w: 1920, h: 1080 });
  assert.deepStrictEqual(U.monitorRectAt(mons, { x: 1850, y: 100 }, WIN), { x: 1920, y: 0, w: 2560, h: 1440 }, '걸쳐 있으면 창 중심(1970)이 있는 모니터');
  assert.strictEqual(U.monitorRectAt(mons, { x: -5000, y: 0 }, WIN), null, '어느 모니터에도 없으면 null(전체 영역으로 대체)');
});
t('한 걸음은 각 축 최대 1px(≈ 초당 10px), 목표를 넘지 않고 정확히 닿는다', () => {
  assert.deepStrictEqual(U.stepToward({ x: 0, y: 0 }, { x: 5, y: -3 }), { x: 1, y: -1 });
  assert.deepStrictEqual(U.stepToward({ x: 4, y: 9 }, { x: 5, y: 9 }), { x: 5, y: 9 });
  assert.deepStrictEqual(U.stepToward({ x: 5, y: 9 }, { x: 5, y: 9 }), { x: 5, y: 9 });
  const b = { minX: 100, maxX: 140, minY: 50, maxY: 74 };
  assert.deepStrictEqual(U.nextFocusTarget(b, () => 0), { x: 100, y: 50 }); assert.deepStrictEqual(U.nextFocusTarget(b, () => 0.999999), { x: 140, y: 74 });
});
t('시뮬레이션: 무작위 목표점으로 1만 번 움직여도 기준점 ±40/±24px 밖으로 나가지 않고, 한 번에 1px 넘게 안 움직인다', () => {
  let seed = 12345; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const anchor = { x: 1500, y: 700 }; const b = U.focusBounds(anchor, SCREEN, WIN); let pos = { ...anchor }, target = null, maxDx = 0, maxDy = 0, maxStep = 0;
  for (let i = 0; i < 10000; i++) {
    if (!target) target = U.nextFocusTarget(b, rand); const next = U.stepToward(pos, target);
    maxStep = Math.max(maxStep, Math.abs(next.x - pos.x), Math.abs(next.y - pos.y)); pos = next; if (pos.x === target.x && pos.y === target.y) target = null;
    maxDx = Math.max(maxDx, Math.abs(pos.x - anchor.x)); maxDy = Math.max(maxDy, Math.abs(pos.y - anchor.y));
  }
  assert.ok(maxDx <= 40 && maxDy <= 24, `이동 범위 초과: dx=${maxDx} dy=${maxDy}`); assert.ok(maxStep <= 1, `한 걸음 ${maxStep}px`); assert.ok(maxDx > 10, '실제로는 움직인다(안 움직이는 게 아님)');
});

// ── 시계 ──────────────────────────────────────────────────────────────────────
t('시계 문구: 기존 시계와 같은 표기("오후 3:42"), 초 표시는 선택, 정오·자정·한 자리 분', () => {
  const d = (h, m, s) => new Date(2026, 9, 22, h, m, s);
  assert.strictEqual(U.focusClockText(d(15, 42, 7)), '오후 3:42'); assert.strictEqual(U.focusClockText(d(15, 42, 7), true), '오후 3:42:07');
  assert.strictEqual(U.focusClockText(d(0, 5, 0)), '오전 12:05'); assert.strictEqual(U.focusClockText(d(12, 0, 59), true), '오후 12:00:59'); assert.strictEqual(U.focusClockText(d(9, 3, 4)), '오전 9:03');
  assert.strictEqual(U.focusClockText(d(15, 42, 7)), settingsTs.clockText(d(15, 42, 7)), '말풍선 시계와 같은 표기');
});
t('클릭 통과 판정: 버디 영역 안에서만 받는다', () => {
  const r = { left: 100, top: 100, right: 200, bottom: 200 };
  assert.deepStrictEqual([U.isOverPet(r, 150, 150), U.isOverPet(r, 99, 150), U.isOverPet(r, 150, 201), U.isOverPet(null, 150, 150)], [true, false, false, false]);
});

// ── 알람은 모드와 상관없이 평소처럼 ────────────────────────────────────────────
t('모드 중에도 알람 발화는 똑같다: 제때 울림·미리 알림 토스트·놓친 알람 10분 창(스케줄러는 초집중 상태를 모른다)', () => {
  const settings = A.mergeAlarmSettings({}, { lunchEnabled: true, lunchTime: '12:00', alarms: [{ id: 'a', time: '14:00', enabled: true, name: '회의', preMinutes: 5 }] }).settings;
  const D = (h, m, s = 0) => new Date(2026, 9, 22, h, m, s);
  const run = () => { const sch = A.createScheduler(); sch.check(settings, D(13, 54, 50)); return [sch.check(settings, D(13, 55, 5)), sch.check(settings, D(14, 0, 5)), A.createScheduler().check(settings, D(14, 3, 10))]; };
  const [pre, on, missed] = run();
  assert.deepStrictEqual(pre.map(a => [a.type, a.kind, a.minutes]), [['toast', 'alarm', 5]], '사전 알림 토스트'); assert.ok(/5분 뒤 · 회의/.test(pre[0].text));
  assert.deepStrictEqual(on.map(a => [a.card, a.missed === true]), [['alarm', false]], '제때 울리는 알람 카드');
  assert.deepStrictEqual(missed.map(a => [a.card, a.missed === true]), [['alarm', true]], '놓친 알람 10분 창');
  assert.deepStrictEqual(JSON.stringify(run()), JSON.stringify(run()), '몇 번을 돌려도 같다');
  // 메인: 알람 코드는 초집중 상태를 전혀 보지 않는다
  const main = read('main.cjs');
  for (const fn of ['function createBreakTimeWindow', 'function runAlarmCheck', 'function restoreAlarms', 'function startBreakTimeChecker']) {
    const i = main.indexOf(fn); assert.ok(i > 0, fn); const body = main.slice(i, main.indexOf('\r\n}\r\n', i) > 0 ? main.indexOf('\r\n}\r\n', i) : main.indexOf('\n}\n', i));
    assert.ok(!/focusState|focusMode|petInteractive|applyPetMouse|updateFocus/.test(body), `${fn}는 초집중 상태를 보지 않는다`);
  }
  assert.ok(!/focusState|focusMode|초집중/.test(read('alarms.cjs')), 'alarms.cjs는 초집중과 무관');
});
t('모드 중에도 미리 알림 토스트·알림 상태는 평소 그대로 표시된다(정적 확인): 토스트는 모드와 무관, 알림 카드가 뜨면 시계를 숨긴다', () => {
  const pet = read('src/pages/PetPage.tsx');
  assert.match(pet, /\{toast && \(\s*<div className="pet-toast" role="status" key=\{toast\.id\}>/);                                        // 토스트 렌더는 focus로 감싸지 않는다
  assert.match(pet, /window\.electronAPI\?\.onShowToast\?\.\(\(msg, ms\) => showToast\(msg, ms\)\)/);                                    // 토스트 수신도 그대로
  assert.match(pet, /\{focus\.enabled && !alertActive && <FocusClock seconds=\{focus\.seconds\} \/>\}/);                                  // 알림 중에는 평소 표시, 끝나면 시계로 돌아감
  assert.match(pet, /const shownBubble = \(alertActive \|\| toast\) \? null/);
});

// ── 주의를 끄는 동작·CPU·연결 ──────────────────────────────────────────────────
t('주의를 끄는 동작은 모드에서 꺼진다(정적 확인): 반짝임·낮잠·순간이동·도망·졸림 방지·말풍선·안내 말풍선·클릭 반응', () => {
  const pet = read('src/pages/PetPage.tsx');
  for (const re of [/!focusRef\.current\.enabled && !stateRef\.current\.escaping && !isSleepingRef\.current\) \{\s*\/\/ 초집중 모드에서는 반짝임 없음/, /!focusRef\.current\.enabled && !isSleepingRef\.current && !stateRef\.current\.escaping\) \{\s*\/\/ 초집중 모드에서는 낮잠/,
    /!focusRef\.current\.enabled && !stateRef\.current\.escaping && !isSleepingRef\.current\) \{\s*\/\/ 초집중 모드에서는 순간이동/, /if \(focusRef\.current\.enabled\) return;\s*\/\/ 초집중 모드에서는 도망가지 않는다/,
    /!s\.distractEmoji \|\| focusRef\.current\.enabled\) \{ elapsed = 0; return; \}/, /cur\.bubbleEnabled !== false && !focusRef\.current\.enabled;/,
    /onShowBubble\?\.\(\(text, ms\) => \{ if \(!focusRef\.current\.enabled\) showBubble/, /if \(focusRef\.current\.enabled\) return;\s*\/\/ 초집중 모드에서는 반응 말풍선·파티클 없음/]) assert.match(pet, re, String(re));
  assert.match(read('main.cjs'), /yarDesired = settings\.yarEnabled && settings\.yarInterval > 0 \? settings\.yarInterval : 0;\s*applyYar\(\);/);   // 야르도 멈춘다
});
t('켜는 순간 버디 창이 자기 상태에도 기준점을 반영한다(메인은 위치만 바뀐 것을 다시 알리지 않으므로) — 안 그러면 이동 루프가 기준점을 못 얻어 멈춘다(실제 앱에서 발견한 버그)', () => {
  const pet = read('src/pages/PetPage.tsx');
  assert.match(pet, /const anchor = \{ x: Math\.round\(st\.wx\), y: Math\.round\(st\.wy\) \};\s*next = \{ \.\.\.next, anchor \}; focusRef\.current = next;\s*api\?\.reportFocusAnchor\(anchor\.x, anchor\.y\);/);
  assert.match(pet, /setFocus\(next\);/);   // 반영한 상태로 화면·이동 루프가 돈다
  assert.match(read('main.cjs'), /if \(!r\.onlyAnchor\) broadcastFocus\(\);/);   // 메인은 위치만 바뀐 경우 다시 알리지 않는다(그래서 위 반영이 필요)
});
t('CPU 절약(정적 확인): 기본 물리 루프(30fps)는 쉬고 느린 루프(0.1초)만 돈다, 시계는 분·초 경계에서만 갱신', () => {
  const pet = read('src/pages/PetPage.tsx'), clock = read('src/components/FocusClock.tsx');
  assert.match(pet, /if \(pausedRef\.current\) \{[\s\S]*?setTimeout\(\(\) => \{ frameRef\.current = requestAnimationFrame\(tick\); \}, 400\);\s*return;/);
  assert.match(pet, /\}, FOCUS_TICK_MS\);/); assert.match(read('src/styles/pet.css'), /\.pet-root\[data-focus\] \.cat-emoji \{ animation: none; \}/); assert.match(clock, /60000 - \(now\.getSeconds\(\) \* 1000 \+ now\.getMilliseconds\(\)\)/); assert.ok(!/setInterval/.test(clock), '시계는 setInterval을 쓰지 않는다');
});
t('연결(정적 확인): 시작 때 상태 복원(창보다 먼저), 켜면 클릭 통과·야르 정지·트레이 글자, IPC·preload·UI 문구·빌드 파일, 전역 단축키 없음', () => {
  const main = read('main.cjs'), pre = read('preload.cjs'), home = read('src/components/settings/HomePane.tsx'), pkg = JSON.parse(read('package.json'));
  assert.ok(main.indexOf('focusState = focusMode.loadFocus(focusFile());') < main.indexOf('createPetWindow();\r\n    createTray();') || main.indexOf('focusState = focusMode.loadFocus(focusFile());') < main.indexOf('createPetWindow();\n    createTray();'), '상태 복원이 창·트레이 생성보다 먼저');
  assert.match(main, /if \(r\.enabledChanged\) \{ petInteractive = false; applyPetMouse\(\); applyYar\(\); rebuildTrayMenu\(\); \}/);
  assert.match(main, /petWindow\.setIgnoreMouseEvents\(focusMode\.ignoreMouse\(focusState, petInteractive\), \{ forward: true \}\)/); assert.match(main, /applyPetMouse\(\);\s*\/\/ 초집중 모드로 시작하면 처음부터 클릭 통과/);
  assert.match(main, /label: focusMode\.trayLabel\(focusState\.enabled\),[^\n]*\s*click: \(\) => updateFocus\(\{ enabled: !focusState\.enabled \}\),/);
  for (const ch of ['focus-get', 'focus-set', 'focus-anchor', 'pet-interactive']) { assert.ok(main.includes(`'${ch}'`), `main ${ch}`); assert.ok(pre.includes(`'${ch}'`), `preload ${ch}`); }
  for (const s of ['getFocusMode', 'setFocusMode', 'reportFocusAnchor', 'setPetInteractive', 'onFocusMode']) assert.ok(pre.includes(s), s);
  for (const s of ['초집중 모드', '한자리에서 조금만 움직이고 시계만 보여요. 알람은 그대로 울려요', '시계에 초 표시']) assert.ok(home.includes(s), s);
  assert.ok(pkg.build.files.includes('focus-mode.cjs')); assert.ok(!/globalShortcut/.test(main), '전역 단축키는 넣지 않았다');
  assert.ok(!/localStorage|petSettings/.test(read('src/hooks/useFocusMode.ts')), '상태는 메인이 소유(렌더러 저장값과 충돌 없음)');
});

console.log(`\n${n}개 통과`);
