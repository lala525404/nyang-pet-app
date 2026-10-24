// 클릭 통과 단위 테스트: 투명 영역 판정(펫 원 위/밖, 말풍선, 퀵 메뉴 버튼·카드, 경계, 창이 움직일 때), 토글 히스테리시스(떨림 방지), 비상 스위치, 초집중 모드와의 결합, 연결(정적 확인).
// `node tests/click-through-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const CT = require('../click-through.cjs'), F = require('../focus-mode.cjs'), Q = require('../quick-menu.cjs');
const FFFD = String.fromCharCode(0xFFFD);

// 실제 펫 창(240×230)의 보이는 요소(측정값): 펫 클릭 원 130×130, 중심 (120,175) / 말풍선 (81,87) 77×39
const PET = { kind: 'ellipse', cx: 120, cy: 175, rx: 65, ry: 65 };
const BUBBLE = { kind: 'rect', x: 81, y: 87, w: 77, h: 39 };
const WIN = { x: 500, y: 300, width: 240, height: 230 };
const at = (dx, dy, win = WIN) => ({ x: win.x + dx, y: win.y + dy });   // 창 안 좌표 → 화면 커서
const run = (state, cursor, extra = {}) => CT.step(state, { cursor, bounds: WIN, regions: [PET, BUBBLE], ...extra });

t('영역 판정: 펫 원 위·말풍선 위는 받고, 투명한 부분(창 모서리·원 밖)은 통과. 경계는 원/사각형 모양 그대로', () => {
  const hit = (dx, dy, regions = [PET, BUBBLE]) => CT.hitAny(regions, dx, dy);
  assert.ok(hit(120, 175) && hit(120, 175 - 64) && hit(120 + 64, 175) && hit(120 - 64, 175), '원 안');
  assert.ok(!hit(120 + 66, 175) && !hit(120, 175 + 66), '원 밖(경계 바로 밖)');
  assert.ok(hit(120 + 45, 175 + 45), '대각선 안(거리 63.6 < 65)');
  assert.ok(!hit(120 + 50, 175 + 50), '원의 사각 모서리는 통과(거리 70.7 > 65: 130×130 상자가 아니라 원 모양)');
  for (const [x, y] of [[0, 0], [239, 0], [0, 229], [239, 229], [10, 100], [230, 100]]) assert.ok(!hit(x, y), `창 모서리·가장자리 ${x},${y}`);
  assert.ok(hit(90, 100) && hit(157, 125) && !hit(80, 100) && !hit(160, 100), '말풍선 사각형 안/밖');
  assert.ok(!CT.hitAny([PET], 90, 100), '말풍선이 없으면 그 자리는 통과');
  assert.ok(CT.inRegion(PET, 120 + 70, 175, 6) && !CT.inRegion(PET, 120 + 72, 175, 6), '여유(margin)만큼 넓게 본다');
  const r = { kind: 'rect', x: 10, y: 10, w: 20, h: 20 }; assert.ok(CT.inRegion(r, 10, 10) && CT.inRegion(r, 30, 30) && !CT.inRegion(r, 31, 30) && CT.inRegion(r, 33, 30, 3));
});
t('영역 목록 검증: 잘못된 값은 버리고 최대 8개, 배열이 아니면 null', () => {
  const ok = CT.sanitizeRegions([PET, BUBBLE, { kind: 'ellipse', cx: 1, cy: 1, rx: 0, ry: 5 }, { kind: 'rect', x: NaN, y: 0, w: 5, h: 5 }, { kind: 'circle' }, null, 'x', { kind: 'rect', x: 0, y: 0, w: -3, h: 5 }]);
  assert.deepStrictEqual(ok, [PET, BUBBLE]); assert.strictEqual(CT.sanitizeRegions(null), null); assert.strictEqual(CT.sanitizeRegions({}), null);
  assert.strictEqual(CT.sanitizeRegions(Array.from({ length: 20 }, () => BUBBLE)).length, CT.MAX_REGIONS);
});
t('통과 중에 영역 안으로 들어오면 즉시 받는다, 받는 중에는 영역(+여유) 밖이 연달아 2번 확인돼야 통과로 돌아간다', () => {
  let s = { interactive: false, miss: 0 };
  s = run(s, at(120, 175)); assert.strictEqual(s.interactive, true, '들어오면 즉시');
  s = run(s, at(5, 5)); assert.strictEqual(s.interactive, true, '밖 1번째는 아직 받는다'); assert.strictEqual(s.miss, 1);
  s = run(s, at(5, 5)); assert.strictEqual(s.interactive, false, '밖 2번째에서 통과'); assert.strictEqual(CT.LEAVE_CONFIRMS, 2); assert.strictEqual(CT.POLL_MS, 40);
  s = run(s, at(5, 5)); assert.strictEqual(s.interactive, false);
  s = run({ interactive: true, miss: 1 }, at(120, 175)); assert.deepStrictEqual(s, { interactive: true, miss: 0 }, '다시 들어오면 밖 횟수 초기화');
});
t('경계에서 떨리지 않는다: 가장자리 ±여유 안에서 커서가 흔들려도 받는 상태 유지, 통과 상태에서는 경계를 넘을 때만 한 번 바뀐다', () => {
  let s = { interactive: false, miss: 0 }; let flips = 0, prev = s.interactive;
  const edge = 65;   // 원 가장자리
  // 안→경계 흔들림(±4px, 여유 6px 안)
  for (let i = 0; i < 200; i++) { const dx = edge - 2 + ((i % 2) ? 4 : -4) * (i % 3 === 0 ? 1 : 0.5); s = run(s, at(120 + dx, 175)); if (s.interactive !== prev) { flips++; prev = s.interactive; } }
  assert.ok(s.interactive && flips === 1, `경계 흔들림에서 상태 변화 ${flips}번(처음 들어올 때 1번만)`);
  // 원 밖 멀리 → 통과 → 경계로 다시: 밖→안 한 번만
  for (let i = 0; i < 3; i++) s = run(s, at(5, 5)); assert.strictEqual(s.interactive, false);
  let enters = 0; prev = false; for (let i = 0; i < 50; i++) { s = run(s, at(120 + edge - 1 + ((i % 2) ? 2.5 : 0), 175)); if (s.interactive !== prev) { enters++; prev = s.interactive; } }
  assert.strictEqual(enters, 1, '경계를 넘나들어도 들어올 때 한 번');
});
t('드래그 중에는 항상 받는다(커서가 원 밖으로 잠깐 벗어나도 끊기지 않음), 영역을 아직 모르면 항상 받는다(안전하게 열어 둠)', () => {
  assert.deepStrictEqual(run({ interactive: false, miss: 0 }, at(2, 2), { dragging: true }), { interactive: true, miss: 0 });
  assert.deepStrictEqual(CT.step({ interactive: false, miss: 0 }, { cursor: at(2, 2), bounds: WIN, regions: [] }), { interactive: true, miss: 0 });
  assert.deepStrictEqual(CT.step(null, { cursor: at(2, 2), bounds: WIN, regions: null }), { interactive: true, miss: 0 });
  assert.deepStrictEqual(CT.step({ interactive: false, miss: 0 }, { cursor: null, bounds: WIN, regions: [PET] }), { interactive: true, miss: 0 });
});
t('펫이 움직일 때(창 위치가 바뀔 때)도 어긋나지 않는다: 커서가 가만히 있어도 창이 비켜나면 통과, 창이 커서 위로 오면 받는다', () => {
  const cursor = at(120, 175);   // 펫 위
  let s = run({ interactive: false, miss: 0 }, cursor); assert.strictEqual(s.interactive, true);
  const moved = { ...WIN, x: WIN.x + 300 };   // 펫이 오른쪽으로 달려감(커서는 그대로)
  s = CT.step(s, { cursor, bounds: moved, regions: [PET, BUBBLE] }); s = CT.step(s, { cursor, bounds: moved, regions: [PET, BUBBLE] }); assert.strictEqual(s.interactive, false, '펫이 떠난 자리는 통과');
  const back = { ...WIN, x: cursor.x - 120, y: cursor.y - 175 };   // 펫이 커서 위로 순간이동
  s = CT.step(s, { cursor, bounds: back, regions: [PET, BUBBLE] }); assert.strictEqual(s.interactive, true, '펫이 와서 커서 아래에 오면 즉시 받는다(마우스를 움직일 필요 없음)');
  // 시뮬레이션: 매 틱 창이 1~8px씩 움직이는 동안 커서를 펫 중심에 두면 계속 받고, 창이 멀어지면 어느 시점부터 통과
  let st = { interactive: true, miss: 0 }; let x = WIN.x; let passed = false;
  for (let i = 0; i < 200; i++) { x += 4; st = CT.step(st, { cursor: { x: WIN.x + 120, y: WIN.y + 175 }, bounds: { ...WIN, x }, regions: [PET] }); if (!st.interactive) { passed = true; assert.ok(x - WIN.x > 65, '원 밖으로 나간 뒤에만'); break; } }
  assert.ok(passed);
});

// ── 퀵 메뉴 창 ────────────────────────────────────────────────────────────────
t('퀵 메뉴: 호 모드에서는 버튼(원)과 카드 위에서만 받고 버튼 사이·주변은 통과, 알약 바 모드는 영역 없음(창 전체)', () => {
  const work = { x: 0, y: 33, width: 1728, height: 1084 }, origin = Q.petCenter({ x: 700, y: 850, width: 240, height: 230 }, 100);
  const lay = Q.layoutArc({ count: 4, sizePct: 100, origin, work, card: { w: 320, h: 300 } });
  const regions = CT.quickRegions(lay); assert.strictEqual(regions.length, 5); assert.strictEqual(regions.filter(r => r.kind === 'ellipse').length, 4);
  for (const b of lay.buttons) { assert.ok(CT.hitAny(regions, b.x, b.y), '버튼 중심'); assert.ok(CT.hitAny(regions, b.x + 21, b.y), '버튼 가장자리 안'); assert.ok(!CT.hitAny(regions, b.x + 40, b.y + 40) || lay.buttons.some(o => o !== b && Math.hypot(o.x - (b.x + 40), o.y - (b.y + 40)) < 30), '버튼 주변은 통과'); }
  const mid = { x: (lay.buttons[1].x + lay.buttons[2].x) / 2, y: lay.buttons[1].y + 5 }; assert.ok(!CT.hitAny(regions, mid.x, mid.y), '버튼 사이는 통과');
  assert.ok(CT.hitAny(regions, lay.card.x + 10, lay.card.y + 10) && !CT.hitAny(regions, lay.card.x - 10, lay.card.y + 10), '카드 위는 받는다');
  assert.ok(!CT.hitAny(regions, 2, lay.bounds.height - 2), '창 모서리는 통과');
  assert.strictEqual(CT.quickRegions({ mode: 'bar', side: 'above' }), null); assert.strictEqual(CT.quickRegions(null), null);
  assert.ok(Q.QUICK_FULL_CLICK_MS >= 500 && Q.QUICK_FULL_CLICK_MS <= 1000, '열림 모션 동안은 창 전체가 받는다(안착 전에도 누를 수 있음)');
});

t('퀵 메뉴 바 모드: 렌더러가 알려 준 바·카드 사각형 위에서만 받고(투명 여백 24px는 통과), 열림 직후에는 창 전체가 받는다. 연결(정적 확인)', () => {
  const bar = { kind: 'rect', x: 24, y: 24, w: 300, h: 56 }, card = { kind: 'rect', x: 24, y: 90, w: 320, h: 400 };
  const regions = CT.sanitizeRegions([bar, card]); assert.strictEqual(regions.length, 2);
  const win = { x: 600, y: 200, width: 372, height: 520 }; const cur = (dx, dy) => ({ x: win.x + dx, y: win.y + dy });
  const st = (dx, dy, prev) => CT.step(prev || { interactive: false, miss: 0 }, { cursor: cur(dx, dy), bounds: win, regions });
  assert.strictEqual(st(100, 50).interactive, true, '바 위'); assert.strictEqual(st(100, 200).interactive, true, '카드 위');
  assert.strictEqual(st(8, 8).interactive, false, '바 바깥 투명 여백'); assert.strictEqual(st(350, 50).interactive, false, '바 오른쪽 여백'); assert.strictEqual(st(100, 500).interactive, false, '카드 아래 여백');
  assert.strictEqual(st(324, 50).interactive, true, '바 오른쪽 경계'); assert.strictEqual(st(325, 50).interactive, false, '경계 1px 밖');
  const main = read('main.cjs'), page = read('src/pages/QuickPage.tsx'), pre = read('preload.cjs');
  assert.match(main, /ipcMain\.on\('quick-regions', \(e, list\) => \{\s*if \(!fromQuick\(e\) \|\| !quickState \|\| quickState\.mode !== 'bar'\) return;/);
  assert.match(main, /quickState\.regions = r && r\.length \? r : null;/); assert.match(pre, /quickRegions:\s*\(regions\) => ipcRenderer\.send\('quick-regions', regions\)/);
  assert.match(page, /for \(const sel of \['\.qk-bar', '\.qk-card'\]\)/); assert.match(page, /api\(\)\?\.quickRegions\(list\)/);
  assert.ok(Q.QUICK_FULL_CLICK_MS > 0, '열림 직후 전체 클릭');
});

// ── 비상 스위치·초집중 모드 ───────────────────────────────────────────────────
t('비상 스위치: CHOEAE_DISABLE_CLICKTHROUGH=1(또는 true)이면 꺼진다. 기본(없음·0·빈 값)은 켜짐', () => {
  for (const v of ['1', 'true', 'TRUE']) assert.strictEqual(CT.isEnabled({ CHOEAE_DISABLE_CLICKTHROUGH: v }), false, v);
  for (const v of [undefined, '', '0', 'false', 'no']) assert.strictEqual(CT.isEnabled({ CHOEAE_DISABLE_CLICKTHROUGH: v }), true, String(v));
  assert.strictEqual(CT.isEnabled({}), true); assert.strictEqual(CT.isEnabled(undefined), true);
  const out = (v) => execFileSync(process.execPath, ['-e', `process.stdout.write(String(require(${JSON.stringify(path.join(root, 'click-through.cjs'))}).isEnabled(process.env)))`], { env: { ...process.env, ...(v === undefined ? {} : { CHOEAE_DISABLE_CLICKTHROUGH: v }) } }).toString();
  assert.strictEqual(out('1'), 'false'); assert.strictEqual(out(undefined), 'true');
});
t('창이 클릭을 통과시킬지: 스위치가 꺼져 있으면 예전과 똑같고(초집중 모드에서 버디 위가 아닐 때만), 켜져 있으면 판정과 초집중 판정의 합', () => {
  for (const focusEnabled of [false, true]) for (const rendererInteractive of [false, true]) for (const hit of [false, true]) {
    assert.strictEqual(CT.shouldIgnore({ enabled: false, focusEnabled, rendererInteractive, hit }), F.ignoreMouse({ enabled: focusEnabled }, rendererInteractive), `꺼짐 ${focusEnabled}/${rendererInteractive}/${hit}`);
    const want = !hit && !(focusEnabled && rendererInteractive); assert.strictEqual(CT.shouldIgnore({ enabled: true, focusEnabled, rendererInteractive, hit }), want, `켜짐 ${focusEnabled}/${rendererInteractive}/${hit}`);
  }
  assert.strictEqual(CT.shouldIgnore({ enabled: true, focusEnabled: false, rendererInteractive: false, hit: true }), false, '평소: 펫 위면 받는다');
  assert.strictEqual(CT.shouldIgnore({ enabled: true, focusEnabled: false, rendererInteractive: false, hit: false }), true, '평소: 투명 영역은 통과');
  assert.strictEqual(CT.shouldIgnore({ enabled: true, focusEnabled: true, rendererInteractive: true, hit: false }), false, '초집중: 렌더러가 버디 위라고 하면 받는다(예전 동작 유지)');
});

// ── 연결(정적 확인) ──────────────────────────────────────────────────────────
t('연결: 메인이 커서로 판정(40ms), 종료 때 멈춤, 영역 알림은 버디 창이 보낸 것만, 드래그 중 항상 받음, 새 창은 영역을 알 때까지 열어 둠, 드래그·우클릭·더블클릭·호버 코드는 그대로', () => {
  const main = read('main.cjs'), pet = read('src/pages/PetPage.tsx'), pre = read('preload.cjs'), pkg = read('package.json');
  assert.match(main, /const clickThroughOn = clickThrough\.isEnabled\(process\.env\);/); assert.match(main, /setInterval\(pollClickThrough, clickThrough\.POLL_MS\)/);
  assert.match(main, /dragging: !!petWindow\._dragging/); assert.match(main, /screen\.getCursorScreenPoint\(\)/);
  assert.match(main.slice(main.indexOf('function stopAllTimers'), main.indexOf('function flushSettings')), /stopClickThrough\(\);/);
  assert.match(main, /ipcMain\.on\('pet-regions', \(e, list\) => \{\s*if \(!petWindow \|\| petWindow\.isDestroyed\(\) \|\| e\.sender !== petWindow\.webContents\) return;/);
  assert.match(main, /petRegions = \[\]; petCT = \{ interactive: true, miss: 0 \};/);
  assert.match(main, /quickState\.regions = clickThroughOn \? clickThrough\.quickRegions\(lay\) : null;/); assert.match(main, /Date\.now\(\) - quickShownAt < quickMenu\.QUICK_FULL_CLICK_MS/);
  assert.match(pet, /api\?\.setPetRegions\?\.\(list\)/); assert.match(pet, /document\.querySelectorAll<HTMLElement>\('\.bubble, \.pet-toast'\)/); assert.match(pre, /setPetRegions:\s*\(regions\) => ipcRenderer\.send\('pet-regions', regions\)/);
  assert.match(pkg, /"click-through\.cjs"/);
  // 펫 이동·드래그·우클릭·클릭·호버 핸들러는 이 변경으로 바뀌지 않았다
  assert.match(pet, /const handleMouseDown = \(e: React\.MouseEvent\) => \{\s*if \(e\.button !== 0\) return;\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*isDragging\.current = true;/);
  assert.match(pet, /onMouseDown=\{handleMouseDown\}\s*onClick=\{handleCatClick\}\s*onMouseEnter=\{handleMouseEnter\}\s*onMouseLeave=\{handleMouseLeave\}\s*onContextMenu=\{\(e\) => \{ e\.preventDefault\(\); window\.electronAPI\?\.petRightClick\(\); \}\}/);
  assert.match(main, /ipcMain\.on\('start-drag'/); assert.match(main, /petWindow\._dragging = true;/);
  for (const f of ['click-through.cjs', 'tests/click-through-unit.cjs']) assert.ok(!read(f).includes(FFFD), f);
});

(async () => { let fail = 0; for (const [name, fn] of queue) { try { await fn(); console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } } if (fail) { console.log(`\n${fail}개 실패`); process.exit(1); } console.log(`\n${queue.length}개 통과`); })();
