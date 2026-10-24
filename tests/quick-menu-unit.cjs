// 펫 우클릭 퀵 메뉴 단위 테스트: 항목 배치(최대 8개, 종료는 마지막), 키보드 이동, 창 위치 보정(다중 모니터), 날씨 카드 계산, 오늘 알람 목록(스케줄러 규칙과 같은 판정),
// 일별 날씨 요청·파싱, 종료 확인 단계, 동의 전 네트워크 0건, 연결(정적 확인).
// `node tests/quick-menu-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, (p) => (p in deps ? deps[p] : {})); return m.exports; };
const Q = require('../quick-menu.cjs'), A = require('../alarms.cjs'), W = require('../weather.cjs');
const M = load('src/utils/quickMenu.ts');
const C = load('src/utils/weatherCard.ts');
const sched = load('src/utils/alarmSchedule.ts', { './settings': load('src/utils/settings.ts', {}) });
const text = load('src/utils/alarmText.ts', { './settings': load('src/utils/settings.ts', {}) });
const QA = load('src/utils/quickAlarms.ts', { './alarmSchedule': sched, './alarmText': text });
const FFFD = String.fromCharCode(0xFFFD);
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);

// ── 항목 배치·키보드 ─────────────────────────────────────────────────────────
t('항목 배치: 종료는 항상 마지막, 항목이 늘면 최대 8개(종료 포함)까지만, 호는 6개까지 7개부터 알약 바', () => {
  assert.strictEqual(M.QUICK_MAX_ITEMS, 8); assert.strictEqual(M.QUICK_ARC_MAX, 6); assert.strictEqual(M.QUICK_ARC_MAX, Q.ARC_MAX, '화면과 메인의 호 최대 개수가 같다');
  assert.deepStrictEqual(M.layoutQuickItems(['a', 'b', 'c'], 'Q'), ['a', 'b', 'c', 'Q']);
  const seven = ['1', '2', '3', '4', '5', '6', '7']; assert.deepStrictEqual(M.layoutQuickItems(seven, 'Q'), [...seven, 'Q']);
  const nine = [...seven, '8', '9']; const l = M.layoutQuickItems(nine, 'Q'); assert.strictEqual(l.length, 8); assert.strictEqual(l[7], 'Q');
  assert.deepStrictEqual(M.layoutQuickItems([], 'Q'), ['Q']);
  // 배치 전환 상수: 기본은 항상 바. 'radial'로 바꾸면 6개까지 호, 7개 이상은 바
  assert.strictEqual(Q.QUICK_MENU_LAYOUT, 'bar'); for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.strictEqual(Q.modeFor(n), 'bar', `기본 ${n}개`);
  for (const n of [1, 2, 3, 4, 5, 6]) assert.strictEqual(Q.modeFor(n, 'radial'), 'arc'); for (const n of [7, 8]) assert.strictEqual(Q.modeFor(n, 'radial'), 'bar'); assert.strictEqual(Q.modeFor(4, 'bar'), 'bar');
  assert.ok(/QUICK_MENU_LAYOUT/.test(read('quick-menu.cjs')) && !/QUICK_MENU_LAYOUT/.test(read('src/components/settings/HomePane.tsx') + read('src/pages/SettingsPage.tsx') + read('src/components/settings/HelpPane.tsx')), '설정 UI에는 노출하지 않는다');
});
t('바 줄바꿈: 화면 폭이 충분하면 한 줄(완전한 알약), 좁으면 두 줄 이상. 폭 계산은 간격 규칙과 같다', () => {
  for (const n of [4, 5, 6, 7, 8]) { assert.strictEqual(M.barRows(n, 1920), 1, `${n}개 큰 화면`); assert.strictEqual(M.barRows(n, M.barWidthPx(n)), 1, `${n}개 딱 맞는 폭`); }
  assert.ok(M.barWidthPx(4) < M.barWidthPx(8) && M.barWidthPx(8) < 520, '8개도 일반 화면에 한 줄로 들어간다');
  assert.strictEqual(M.barRows(8, M.barWidthPx(8) - 1), 2, '1px 모자라면 두 줄'); assert.ok(M.barRows(8, 120) >= 3 && M.barRows(8, 120) <= 8, '아주 좁으면 여러 줄');
  assert.strictEqual(M.barRows(0, 500), 1); assert.strictEqual(M.barRows(4, NaN), 1); assert.strictEqual(M.barRows(4, 0), 1);
  for (let w = 100; w < 600; w += 7) for (const n of [4, 6, 8]) assert.ok(M.barRows(n, w) >= 1 && M.barRows(n, w) <= n, `${n}/${w}`);
  assert.strictEqual(Q.barMaxWidth({ x: 0, y: 0, width: 1728, height: 900 }), 1704); assert.strictEqual(Q.barMaxWidth({ x: 0, y: 0, width: 100, height: 900 }), 160);
});
t('바 위치: 펫 머리 위 중앙, 위가 모자라면 아래(side), 화면 밖으로 나가지 않는다(구석·다중 모니터), 카드가 붙으면 높이가 늘어도 안', () => {
  const work = { x: 0, y: 33, width: 1728, height: 1084 };
  const bar = { width: 330, height: 80 }, withCard = { width: 372, height: 560 };
  const mid = Q.placeQuickWindow({ x: 700, y: 850, width: 240, height: 230 }, bar, work); assert.strictEqual(mid.side, 'above'); assert.strictEqual(mid.x, 700 + 120 - 165, '가운데'); assert.ok(mid.y + mid.height <= 850 + 92 + 1, '머리 위');
  const top = Q.placeQuickWindow({ x: 700, y: 33, width: 240, height: 230 }, withCard, work); assert.strictEqual(top.side, 'below', '위에 자리가 없으면 아래(카드가 붙으면 카드는 바 아래로)');
  for (const [px, py] of [[0, 33], [1488, 33], [0, 887], [1488, 887], [-50, 400], [3000, 400]]) for (const size of [bar, withCard]) {
    const r = Q.placeQuickWindow({ x: px, y: py, width: 240, height: 230 }, size, work);
    assert.ok(r.x >= work.x && r.y >= work.y && r.x + r.width <= work.x + work.width && r.y + r.height <= work.y + work.height, `밖으로 나감 ${px},${py}`);
  }
  const left = { workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }, main = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const pet = { x: -240, y: 600, width: 240, height: 230 }; const r = Q.placeQuickWindow(pet, bar, Q.pickWorkArea(pet, [left, main])); assert.ok(r.x >= -1920 && r.x + r.width <= 0, '왼쪽 모니터 안');
});
t('호버 스파클: 3~5개, 약 0.6초, 아이콘당 쿨다운 400ms, 동시 상한, 위치·크기·방향 범위', () => {
  assert.deepStrictEqual([...M.SPARKLE_COUNT], [3, 5]); assert.strictEqual(M.SPARKLE_LIFETIME_MS, 600); assert.strictEqual(M.SPARKLE_COOLDOWN_MS, 400); assert.ok(M.SPARKLE_MAX_LIVE >= 10 && M.SPARKLE_MAX_LIVE <= 40);
  let seed = 7; const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const counts = new Set();
  for (let i = 0; i < 400; i++) {
    const b = M.sparkleBurst(100, 50, rand); counts.add(b.length); assert.ok(b.length >= 3 && b.length <= 5);
    for (const s of b) { assert.strictEqual(s.x, 100); assert.strictEqual(s.y, 50); assert.ok(s.size >= 6 && s.size <= 10, `크기 ${s.size}`); assert.ok(Math.hypot(s.dx, s.dy + 4) <= 32 + 1.5 && Math.hypot(s.dx, s.dy + 4) >= 16 - 1.5, '거리'); assert.ok(Math.abs(s.rot) <= 60 && s.delay >= 0 && s.delay <= 90); }
  }
  assert.deepStrictEqual([...counts].sort(), [3, 4, 5], '3·4·5개가 모두 나온다');
  assert.strictEqual(M.sparkleBurst(0, 0, rand, 4).length, 4);
  const edge = M.sparkleEdgeBurst({ left: 20, top: 30, width: 300, height: 56 }, rand); assert.ok(edge.length >= 3 && edge.length <= 5);
  assert.ok(edge.some(s => s.x < 60) && edge.some(s => s.x > 280), '바의 왼쪽·오른쪽 끝 가까이'); for (const s of edge) assert.ok(s.y >= 30 && s.y <= 86, '바 높이 안');
  // 쿨다운(아이콘당 400ms)
  assert.ok(M.canSparkle(undefined, 1000)); assert.ok(!M.canSparkle(1000, 1399)); assert.ok(M.canSparkle(1000, 1400)); assert.ok(M.canSparkle(1000, 5000));
  let last; let fired = 0; for (let t0 = 0; t0 < 10000; t0 += 50) { if (M.canSparkle(last, t0)) { last = t0; fired++; } } assert.strictEqual(fired, 25, '연속 호버를 10초 해도 아이콘당 초당 2.5번(400ms)을 넘지 않는다');
  // 동시 상한
  assert.strictEqual(M.sparkleRoom(0, 5), 5); assert.strictEqual(M.sparkleRoom(M.SPARKLE_MAX_LIVE - 2, 5), 2); assert.strictEqual(M.sparkleRoom(M.SPARKLE_MAX_LIVE, 5), 0); assert.strictEqual(M.sparkleRoom(M.SPARKLE_MAX_LIVE + 3, 5), 0);
});
t('스파클·바 연결(정적 확인): rAF 루프 없음, 호버 이벤트에서 추가하고 animationend에서 제거, 움직임 줄이기 생략, 닫히면 즉시 정리, 별 모양·색·글로우, 아이콘 20ms 간격 등장, 열림 200ms(튕김 3px 이내)', () => {
  const page = read('src/pages/QuickPage.tsx'), css = read('src/styles/quick.css');
  assert.ok(/onMouseEnter=\{\(ev\) => \{ if \(isBar\) sparkIcon\(e\.id, ev\.currentTarget\); \}\}/.test(page) && /onMouseEnter=\{sparkBarEnter\}/.test(page), '아이콘 호버·바 진입');
  assert.ok(/addEventListener\('animationend', remove, \{ once: true \}\)/.test(page) && /el\.remove\(\)/.test(page), 'animationend에서 제거');
  assert.ok(/prefers-reduced-motion: reduce\)'\)\.matches\) return;/.test(page) && /\.qk-sparks \{ display: none; \}/.test(css), '움직임 줄이기에서는 생략');
  assert.ok(/useEffect\(\(\) => \{ if \(closing\) clearSparks\(\); \}, \[closing, clearSparks\]\)/.test(page) && /layer\.textContent = ''/.test(page), '닫히면 남은 입자 즉시 정리');
  assert.ok(/sparkleRoom\(layer\.childElementCount, list\.length\)/.test(page) && /canSparkle\(sparkLastRef\.current\[key\], now, SPARKLE_COOLDOWN_MS\)/.test(page));
  assert.ok(!/setInterval\(|requestAnimationFrame\(\s*function/.test(page.replace(/const id = requestAnimationFrame\(\(\) => \{[\s\S]*?\}\);\s*return \(\) => cancelAnimationFrame\(id\);/, '')), 'rAF 루프 없음(포커스용 한 번뿐)');
  assert.ok(/clip-path: polygon\(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%\)/.test(css) && /\.qk-spark::before \{[^}]*background: var\(--quick-bar-fg\)/.test(css) && /drop-shadow\(0 0 3px var\(--quick-spark-glow\)\)/.test(css), '랜딩과 같은 4갈래 별, 현재 모드의 아이콘 색, 글로우');
  assert.ok(!/\.qk-spark[^{]*\{[^}]*(#fff|white)/i.test(css), '라이트 바에서 보이지 않는 흰색을 따로 쓰지 않는다');
  assert.ok(/qk-ico-in 200ms var\(--quick-ease\) calc\(var\(--i, 0\) \* 20ms \+ 40ms\)/.test(css) && /style=\{cssVars\(\{ '--i': String\(i\) \}\)\}/.test(page), '아이콘이 왼쪽부터 20ms 간격');
  assert.ok(/animation: qk-bar-in 200ms/.test(css) && /scaleX\(0\.7\)/.test(css) && /scaleX\(1\.008\)/.test(css), '열림 200ms, 0.7→1, 살짝 튕김');
  assert.ok(/animation: qk-bar-out 150ms ease-in both/.test(css), '닫힘 150ms');
  assert.ok(/flex-wrap: wrap/.test(css) && /max-width: var\(--qk-maxw, 560px\)/.test(css) && /border-radius: 999px/.test(css), '완전한 알약, 폭 넘으면 줄바꿈');
});
t('키보드 이동: 호·바는 한 줄 순서라 좌우·상하 모두 앞뒤 한 칸, 끝에서는 멈추고 Home/End', () => {
  assert.strictEqual(M.moveQuickFocus(0, 'ArrowRight', 4), 1); assert.strictEqual(M.moveQuickFocus(3, 'ArrowRight', 4), 3);
  assert.strictEqual(M.moveQuickFocus(0, 'ArrowLeft', 4), 0); assert.strictEqual(M.moveQuickFocus(2, 'ArrowLeft', 4), 1);
  assert.strictEqual(M.moveQuickFocus(1, 'ArrowDown', 8), 2); assert.strictEqual(M.moveQuickFocus(5, 'ArrowUp', 8), 4); assert.strictEqual(M.moveQuickFocus(0, 'ArrowUp', 8), 0);
  assert.strictEqual(M.moveQuickFocus(2, 'Home', 8), 0); assert.strictEqual(M.moveQuickFocus(2, 'End', 8), 7); assert.strictEqual(M.moveQuickFocus(2, 'x', 8), 2); assert.strictEqual(M.moveQuickFocus(0, 'ArrowRight', 0), 0);
});
t('알약 바 간격은 많을수록 줄고, 버튼마다 다른 비행 값(회전 -25~25도, 지연 0~120ms)이 순서대로 고정된다', () => {
  assert.ok(M.quickGapPx(4) >= M.quickGapPx(6) && M.quickGapPx(6) >= M.quickGapPx(7) && M.quickGapPx(7) >= M.quickGapPx(8) && M.quickGapPx(8) > 0);
  const seen = new Set();
  for (let i = 0; i < 8; i++) { const f = M.flightVars(i), g = M.flightVars(i); assert.deepStrictEqual(f, g, '같은 순서는 항상 같은 값'); assert.ok(f.rot >= -25 && f.rot <= 25 && f.delay >= 0 && f.delay <= 120); seen.add(`${f.rot}/${f.delay}`); }
  assert.ok(seen.size >= 6, '버튼마다 서로 다른 각도·지연');
});

// ── 호 배치(방사형) ──────────────────────────────────────────────────────────
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (b, w) => b.x >= w.x && b.y >= w.y && b.x + b.width <= w.x + w.width && b.y + b.height <= w.y + w.height;
t('호 각도: 4개는 위쪽 180도에 균등, 5·6개는 호를 넓히고(210·240도), 마지막(종료)이 호의 가장 바깥 끝', () => {
  assert.deepStrictEqual([4, 5, 6].map(Q.arcSpanDeg), [180, 210, 240]);
  const up4 = Q.arcAngles(4, 'up'); assert.deepStrictEqual(up4.map(Math.round), [-180, -120, -60, 0]);
  const gaps = (a) => a.slice(1).map((v, i) => Math.round((v - a[i]) * 1000) / 1000); for (const n of [2, 3, 4, 5, 6]) { const g = gaps(Q.arcAngles(n, 'up')); assert.ok(g.every(x => Math.abs(x - g[0]) < 1e-9), `${n}개 균등`); }
  const up6 = Q.arcAngles(6, 'up'); assert.ok(Math.abs(up6[5] - up6[0] - 240) < 1e-9 && Math.abs((up6[0] + up6[5]) / 2 + 90) < 1e-9, '가운데가 위쪽');
  for (const [dir, c] of [['up', -90], ['down', 90], ['left', 180], ['right', 0]]) { const a = Q.arcAngles(4, dir); assert.ok(Math.abs((a[0] + a[3]) / 2 - c) < 1e-9, dir); }
  assert.deepStrictEqual(Q.arcAngles(1, 'up'), [-90]);
});
t('호 반지름은 펫 크기에 비례, 버튼은 모두 같은 반지름 위·서로 겹치지 않음(2~6개)', () => {
  assert.ok(Q.arcRadius(150) > Q.arcRadius(100) && Q.arcRadius(100) > Q.arcRadius(70)); assert.ok(Math.abs(Q.arcRadius(200) / Q.arcRadius(100) - 2) < 0.02);
  const work = { x: 0, y: 0, width: 3000, height: 2000 }, origin = { x: 1500, y: 1000 };
  for (const n of [2, 3, 4, 5, 6]) for (const size of [70, 100, 150]) {
    const l = Q.layoutArc({ count: n, sizePct: size, origin, work, dir: 'up' }); const c = { x: l.bounds.x + l.pet.x + l.shift.x, y: l.bounds.y + l.pet.y + l.shift.y };
    for (const b of l.buttons) assert.ok(Math.abs(dist({ x: b.x, y: b.y }, l.pet) - l.radius) < 1.5, `반지름 ${n}/${size}`);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(dist(l.buttons[i], l.buttons[j]) >= Q.BTN + 8, `겹침 ${n}개 ${i}-${j}`);
    assert.strictEqual(l.buttons.length, n); assert.ok(inside({ x: l.bounds.x, y: l.bounds.y, width: l.bounds.width, height: l.bounds.height }, work)); void c;
  }
});
t('방향 선택: 펫이 아래쪽이면 위, 가장자리에서는 아래→왼쪽→오른쪽으로 돌려 호가 화면 안에 완전히 들어온다', () => {
  const work = { x: 0, y: 33, width: 1728, height: 1084 };
  const pick = (pet, n = 4) => Q.layoutArc({ count: n, sizePct: 100, origin: Q.petCenter({ ...pet, width: 240, height: 230 }, 100), work });
  assert.strictEqual(pick({ x: 700, y: 850 }).dir, 'up'); assert.strictEqual(pick({ x: 700, y: 400 }).dir, 'up');
  const topEdge = Q.layoutArc({ count: 4, sizePct: 100, origin: { x: 700, y: 70 }, work }); assert.strictEqual(topEdge.dir, 'down', '펫 중심이 위쪽 가장자리 가까이면 아래로(펫 창은 화면 위 가장자리에서도 중심이 160px 아래라 실제로는 드묾)');
  const tl = pick({ x: 0, y: 33 }); assert.strictEqual(tl.dir, 'right', '왼쪽 위 구석: 오른쪽으로'); const tr = pick({ x: 1488, y: 33 }); assert.strictEqual(tr.dir, 'left', '오른쪽 위 구석: 왼쪽으로');
  const left = pick({ x: 0, y: 300 }); assert.ok(['up', 'down', 'right'].includes(left.dir)); const right = pick({ x: 1488, y: 300 }); assert.ok(['up', 'down', 'left'].includes(right.dir));
  for (const [px, py] of [[0, 33], [1488, 33], [0, 854], [1488, 854], [700, 33], [700, 854], [0, 400], [1488, 400], [-100, 500], [5000, 5000]]) for (const n of [4, 5, 6]) {
    const l = pick({ x: px, y: py }, n);
    for (const b of l.buttons) assert.ok(b.x - 22 >= 0 && b.y - 22 >= 0 && b.x + 22 <= l.bounds.width && b.y + 22 <= l.bounds.height, `버튼이 창 밖 ${px},${py},${n}`);
    assert.ok(l.pet.x >= 0 && l.pet.y >= 0 && l.pet.x <= l.bounds.width && l.pet.y <= l.bounds.height, '시작점(펫 중심)은 창 안');
    if (Math.abs(px) < 3000 && Math.abs(py) < 3000) assert.ok(l.bounds.x >= work.x - 0 && l.bounds.y >= work.y && l.bounds.x + l.bounds.width <= work.x + work.width && l.bounds.y + l.bounds.height <= work.y + work.height, `화면 안 ${px},${py},${n}`);
  }
});
t('다중 모니터: 펫이 있는 모니터 기준으로 호가 놓이고(음수 좌표 포함), 모니터 경계를 넘지 않는다', () => {
  const left = { workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }, main = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const pet = { x: -240, y: 400, width: 240, height: 230 };   // 왼쪽 모니터의 오른쪽 가장자리
  const work = Q.pickWorkArea(pet, [left, main]); assert.deepStrictEqual(work, left.workArea);
  const l = Q.layoutArc({ count: 4, sizePct: 100, origin: Q.petCenter(pet, 100), work });
  assert.ok(l.bounds.x >= -1920 && l.bounds.x + l.bounds.width <= 0, `왼쪽 모니터 안: ${JSON.stringify(l.bounds)}`);
});
t('카드(날씨·알람)는 호 바깥쪽에 붙고 호와 겹치지 않으며, 카드를 열고 닫아도 방향은 그대로', () => {
  const work = { x: 0, y: 33, width: 1728, height: 1084 };
  const origin = Q.petCenter({ x: 700, y: 850, width: 240, height: 230 }, 100);
  const base = Q.layoutArc({ count: 4, sizePct: 100, origin, work });
  const withCard = Q.layoutArc({ count: 4, sizePct: 100, origin, work, card: { w: 320, h: 420 }, dir: base.dir });
  assert.strictEqual(withCard.dir, base.dir); assert.ok(withCard.card && withCard.card.w === 320 && withCard.card.h === 420);
  assert.ok(withCard.card.y + withCard.card.h <= Math.min(...withCard.buttons.map(b => b.y - 22)) + 0.5, '위로 열린 호의 카드는 호 위쪽');
  for (const b of withCard.buttons) assert.ok(!(b.x + 22 > withCard.card.x && b.x - 22 < withCard.card.x + withCard.card.w && b.y + 22 > withCard.card.y && b.y - 22 < withCard.card.y + withCard.card.h), '카드와 버튼이 겹치지 않음');
  assert.ok(inside(withCard.bounds, work)); assert.ok(withCard.card.x >= 0 && withCard.card.x + withCard.card.w <= withCard.bounds.width);
  for (const dir of ['down', 'left', 'right']) { const l = Q.layoutArc({ count: 4, sizePct: 100, origin: { x: 800, y: 500 }, work: { x: 0, y: 0, width: 2000, height: 1400 }, card: { w: 320, h: 300 }, dir });
    for (const b of l.buttons) assert.ok(!(b.x + 22 > l.card.x && b.x - 22 < l.card.x + l.card.w && b.y + 22 > l.card.y && b.y - 22 < l.card.y + l.card.h), `${dir} 카드 겹침`); }
  assert.deepStrictEqual(Q.clampCard(320, 420), { w: 320, h: 420 }); assert.deepStrictEqual(Q.clampCard(5000, 5000), { w: 420, h: 680 }); assert.strictEqual(Q.clampCard(0, 10), null); assert.strictEqual(Q.clampCard(NaN, 10), null);
});
t('종료 확인 안내 말풍선: 종료 버튼 위(창 안), 위가 모자라면 아래, 가로는 창 안', () => {
  const work = { x: 0, y: 33, width: 1728, height: 1084 };
  for (const [px, py] of [[700, 850], [0, 33], [1488, 33], [1488, 854], [0, 854]]) {
    const l = Q.layoutArc({ count: 4, sizePct: 100, origin: Q.petCenter({ x: px, y: py, width: 240, height: 230 }, 100), work }); const q = l.buttons[3], h = l.hint;
    assert.ok(h.x >= 0 && h.x + h.w <= l.bounds.width, `가로 안 ${px},${py}`); assert.ok(h.y >= 0, `세로 안 ${px},${py}`);
    assert.ok(h.y + h.h <= q.y - 22 + 1 || h.y >= q.y + 22 - 1, '종료 버튼 위 또는 아래(버튼을 가리지 않음)');
  }
});

// ── 창 위치 ──────────────────────────────────────────────────────────────────
const WORK = { x: 0, y: 0, width: 1920, height: 1040 };
t('창 위치: 펫 위쪽 가운데, 위가 모자라면 아래쪽, 어떤 경우에도 모니터 작업 영역 안', () => {
  const size = { width: 340, height: 140 };
  const pet = { x: 1000, y: 700, width: 240, height: 230 };
  const p = Q.placeQuickWindow(pet, size, WORK); assert.strictEqual(p.x, 1000 + 120 - 170); assert.ok(p.y + 140 <= 700 + 92, '펫 머리 위'); assert.ok(p.y >= 0);
  const top = Q.placeQuickWindow({ x: 1000, y: 0, width: 240, height: 230 }, size, WORK); assert.ok(top.y >= 230, '위가 모자라면 아래쪽');
  for (const px of [-300, 0, 500, 1800, 1900, 5000]) for (const py of [-200, 0, 400, 900, 1040, 3000]) for (const h of [100, 140, 300, 640]) {
    const r = Q.placeQuickWindow({ x: px, y: py, width: 240, height: 230 }, { width: 340, height: h }, WORK);
    assert.ok(r.x >= WORK.x && r.y >= WORK.y && r.x + r.width <= WORK.x + WORK.width && r.y + r.height <= WORK.y + WORK.height, `밖으로 나감 ${px},${py},${h}`);
  }
  const small = Q.placeQuickWindow({ x: 0, y: 0, width: 240, height: 230 }, { width: 340, height: 640 }, { x: 0, y: 0, width: 300, height: 400 });
  assert.ok(small.width <= 300 && small.height <= 400, '작업 영역보다 크면 줄인다');
});
t('다중 모니터: 펫 중심에서 가장 가까운 모니터 안에 놓이고, 음수 좌표 모니터도 된다', () => {
  const left = { workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }, main = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } }, below = { workArea: { x: 0, y: 1080, width: 1920, height: 1000 } };
  const displays = [left, main, below];
  assert.deepStrictEqual(Q.pickWorkArea({ x: -400, y: 500, width: 240, height: 230 }, displays), left.workArea);
  assert.deepStrictEqual(Q.pickWorkArea({ x: 500, y: 500, width: 240, height: 230 }, displays), main.workArea);
  assert.deepStrictEqual(Q.pickWorkArea({ x: 500, y: 1500, width: 240, height: 230 }, displays), below.workArea);
  assert.deepStrictEqual(Q.pickWorkArea({ x: 9999, y: 500, width: 240, height: 230 }, displays), main.workArea, '어느 모니터에도 없으면 가장 가까운 쪽');
  const pet = { x: -1900, y: 600, width: 240, height: 230 }; const r = Q.placeQuickWindow(pet, { width: 340, height: 200 }, Q.pickWorkArea(pet, displays));
  assert.ok(r.x >= -1920 && r.x + r.width <= 0, '왼쪽 모니터 가장자리 보정');
});
t('크기 알림은 허용 범위로 맞추고, 숫자가 아니면 버린다. 동작은 아는 것만, 설정창 목적지는 아는 값만', () => {
  assert.deepStrictEqual(Q.clampQuickSize(340.4, 150.6), { width: 340, height: 151 });
  assert.deepStrictEqual(Q.clampQuickSize(10, 10), { width: Q.QUICK_MIN.w, height: Q.QUICK_MIN.h }); assert.deepStrictEqual(Q.clampQuickSize(9999, 9999), { width: Q.QUICK_MAX.w, height: Q.QUICK_MAX.h });
  for (const bad of [[NaN, 1], ['a', 1], [1, undefined], [null, null], [Infinity, 5]]) assert.strictEqual(Q.clampQuickSize(...bad), null);
  for (const a of Q.QUICK_ACTIONS) assert.ok(Q.isQuickAction(a)); for (const a of ['', 'exit', 'quit ', null, 1, {}, 'OPEN']) assert.ok(!Q.isQuickAction(a));
  assert.deepStrictEqual(Q.settingsTargetFor('weather-setup'), { page: 'home', focus: 'weather-city' }); assert.deepStrictEqual(Q.settingsTargetFor('alarm-settings'), { page: 'alarm' }); assert.strictEqual(Q.settingsTargetFor('open'), null);
  assert.deepStrictEqual(Q.sanitizeTarget({ page: 'alarm', focus: 'x', evil: 1 }), { page: 'alarm' }); assert.strictEqual(Q.sanitizeTarget({ page: 'etc' }), null); assert.strictEqual(Q.sanitizeTarget(null), null);
});

// ── 날씨 카드 ────────────────────────────────────────────────────────────────
t('날씨 코드 → 한글 문구와 아이콘, 모르는 코드도 무난하게', () => {
  const cases = { 0: ['맑음', 'sun'], 1: ['대체로 맑음', 'sun'], 2: ['구름 조금', 'cloud-sun'], 3: ['흐림', 'cloud'], 45: ['안개', 'fog'], 53: ['이슬비', 'drizzle'], 63: ['비', 'rain'], 81: ['소나기', 'rain'], 73: ['눈', 'snow'], 86: ['소낙눈', 'snow'], 95: ['천둥 번개', 'storm'], 99: ['천둥 번개와 우박', 'storm'] };
  for (const [code, [txt, icon]] of Object.entries(cases)) { const l = C.weatherLabel(Number(code)); assert.strictEqual(l.text, txt, code); assert.strictEqual(l.icon, icon, code); }
  assert.strictEqual(C.weatherLabel(999).text, '흐림');
});
t('풍속 설명·표기: m/s 한 자리, 세기별 한 줄', () => {
  assert.strictEqual(C.formatWind(3.44), '3.4 m/s'); assert.strictEqual(C.formatWind(0), '0.0 m/s'); assert.strictEqual(C.formatWind(12), '12.0 m/s');
  assert.strictEqual(C.windText(0.2), '바람이 거의 없어요'); assert.strictEqual(C.windText(2), '약한 바람이에요'); assert.strictEqual(C.windText(6), '바람이 조금 불어요'); assert.strictEqual(C.windText(11), '바람이 강해요'); assert.strictEqual(C.windText(20), '바람이 매우 강해요');
  assert.strictEqual(C.formatTemp(12.4), '12°'); assert.strictEqual(C.formatTemp(-3.6), '-4°'); assert.strictEqual(C.formatTemp(0.2), '0°');
});
const day0 = at(2026, 10, 23).getTime();
const mkData = (nowMs, opts = {}) => ({ temp: 12, feels: 10, code: 2, wind: 3.4, hours: Array.from({ length: 48 }, (_, i) => ({ at: day0 + i * 3600000, temp: 10 + (i % 24) / 4, feels: 9, pop: i % 24 === 18 ? 70 : 10, code: 3, wind: 2 })), days: opts.noDays ? undefined : [{ at: day0, max: 14.2, min: 5.7, pop: 60 }, { at: day0 + 86400000, max: 9, min: 2, pop: 20 }] });
t('오늘 일별 값: 지금이 속한 날의 최고·최저·강수 확률(자정을 넘기면 다음 날), 없으면 null', () => {
  const now = at(2026, 10, 23, 14, 5).getTime(); const d = C.todayDay(mkData(now), now); assert.deepStrictEqual({ max: d.max, min: d.min, pop: d.pop }, { max: 14.2, min: 5.7, pop: 60 });
  const next = at(2026, 10, 24, 0, 30).getTime(); assert.strictEqual(C.todayDay(mkData(next), next).max, 9);
  assert.strictEqual(C.todayDay(mkData(now, { noDays: true }), now), null); assert.strictEqual(C.todayDay(mkData(now), at(2026, 10, 30).getTime()), null);
});
t('오늘 남은 시간 예보: 다음 정각부터 3시간 간격, 오늘 안에서만, 늦은 밤에는 비어 있다', () => {
  const now = at(2026, 10, 23, 14, 5).getTime(); const h = C.threeHourly(mkData(now), now);
  assert.deepStrictEqual(h.map(x => new Date(x.at).getHours()), [15, 18, 21]);
  const morning = at(2026, 10, 23, 6, 30).getTime(); assert.deepStrictEqual(C.threeHourly(mkData(morning), morning).map(x => new Date(x.at).getHours()), [7, 10, 13, 16, 19, 22]);
  const late = at(2026, 10, 23, 23, 10).getTime(); assert.deepStrictEqual(C.threeHourly(mkData(late), late), []);
  const exact = at(2026, 10, 23, 15, 0).getTime(); assert.strictEqual(new Date(C.threeHourly(mkData(exact), exact)[0].at).getHours(), 16, '정각이면 다음 정각');
  assert.strictEqual(C.hourLabel(at(2026, 10, 23, 0).getTime()), '오전 12시'); assert.strictEqual(C.hourLabel(at(2026, 10, 23, 12).getTime()), '오후 12시'); assert.strictEqual(C.hourLabel(at(2026, 10, 23, 15).getTime()), '오후 3시');
});
t('오래된 값 표시: N분 전 정보, 1시간 넘으면 시간 단위, 문구 고정', () => {
  const now = 10_000_000_000; assert.strictEqual(C.staleText(now - 7 * 60000, now), '7분 전 정보예요'); assert.strictEqual(C.staleText(now - 65 * 60000, now), '1시간 5분 전 정보예요'); assert.strictEqual(C.staleText(now - 120 * 60000, now), '2시간 전 정보예요'); assert.strictEqual(C.staleText(now + 5000, now), '0분 전 정보예요');
  assert.strictEqual(C.WEATHER_CREDIT_TEXT, '날씨 데이터: Open-Meteo (CC BY 4.0)'); assert.strictEqual(C.WEATHER_SETUP_TEXT, '동네를 정하면 날씨를 볼 수 있어요');
});

// ── 일별 날씨 요청·파싱 ──────────────────────────────────────────────────────
t('요청: 기존 필드에 일별 최고·최저·강수확률 최대 3개만 추가, 다른 변화 없음. 응답에서 days로 정리', () => {
  const u = new URL(W.buildUrl(37.5, 127)); assert.strictEqual(u.searchParams.get('daily'), 'temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  assert.strictEqual(u.searchParams.get('current'), 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m'); assert.strictEqual(u.searchParams.get('hourly'), 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m');
  assert.deepStrictEqual([...u.searchParams.keys()].sort(), ['current', 'daily', 'forecast_days', 'hourly', 'latitude', 'longitude', 'timeformat', 'timezone', 'wind_speed_unit']);
  const T0 = Date.UTC(2026, 9, 22, 15) / 1000;
  const json = { current: { temperature_2m: 6, weather_code: 3, apparent_temperature: 4, wind_speed_10m: 2 }, hourly: { time: [T0, T0 + 3600], temperature_2m: [6, 7], weather_code: [3, 3] },
    daily: { time: [T0, T0 + 86400], temperature_2m_max: [14.2, null], temperature_2m_min: [5.7, 2], precipitation_probability_max: [60, 20] } };
  const r = W.parseResponse(json); assert.deepStrictEqual(r.days, [{ at: T0 * 1000, max: 14.2, min: 5.7, pop: 60 }, { at: (T0 + 86400) * 1000, max: null, min: 2, pop: 20 }]);
  const none = W.parseResponse({ ...json, daily: undefined }); assert.deepStrictEqual(none.days, []); assert.strictEqual(none.hours.length, 2, '일별이 없어도 나머지는 그대로');
});
t('동의 전에는 어떤 요청도 없고, 캐시가 30분 안이면 새로 받지 않으며 30분을 넘으면 한 번 새로 받고, 실패하면 마지막 값을 stale로 돌려준다', async () => {
  let now = 1_000_000; const calls = []; let fail = false;
  const SAMPLE = { current: { temperature_2m: 6, weather_code: 3 }, hourly: { time: [1, 2], temperature_2m: [6, 7], weather_code: [3, 3] } };
  const svc = W.createWeatherService({ fetch: async (u) => { calls.push(u); if (fail) throw new Error('net'); return { ok: true, status: 200, json: async () => SAMPLE }; }, now: () => now });
  assert.strictEqual(await svc.get(37.5, 127), null); assert.strictEqual(calls.length, 0, '동의 전 요청 0건');
  svc.setConsent(true); const a = await svc.get(37.5, 127); assert.strictEqual(a.stale, false); assert.strictEqual(calls.length, 1);
  now += 29 * 60000; await svc.get(37.5, 127); assert.strictEqual(calls.length, 1, '30분 안 캐시');
  now += 2 * 60000; await svc.get(37.5, 127); assert.strictEqual(calls.length, 2, '30분 넘으면 한 번 새로');
  fail = true; now += 31 * 60000; const s = await svc.get(37.5, 127); assert.strictEqual(calls.length, 3); assert.strictEqual(s.stale, true); assert.strictEqual(s.at, now - 31 * 60000, '마지막 성공 시각');
  svc.setConsent(false); assert.strictEqual(await svc.get(37.5, 127), null); assert.strictEqual(calls.length, 3);
});

// ── 오늘 알람 목록 ───────────────────────────────────────────────────────────
const al = (o) => ({ id: o.id, time: o.time, enabled: o.enabled !== false, ...(o.name ? { name: o.name } : {}), ...(o.repeat ? { repeat: o.repeat } : {}), ...(o.skipDate ? { skipDate: o.skipDate } : {}) });
t('오늘 알람 목록: 켜진 것만, 시각순, 이름 없으면 종류 이름, 지난 알람 흐리게, 다음 알람에 N분 뒤', () => {
  const now = at(2026, 10, 23, 13, 30);   // 금요일
  const s = { lunchOn: true, leaveOn: true, lunchTime: '12:00', leaveTime: '18:00', alarms: [al({ id: 'a', time: '09:00', name: '스탠드업' }), al({ id: 'b', time: '15:30' }), al({ id: 'c', time: '14:00', name: '디자인 리뷰', enabled: false }), al({ id: 'd', time: '13:30', name: '지금' })] };
  const list = QA.todayAlarmList(s, now);
  assert.deepStrictEqual(list.map(x => `${x.time} ${x.title}`), ['09:00 스탠드업', '13:30 지금', '15:30 알람'], '꺼진 알람(14:00)은 빠지고, 점심·퇴근 기본 알림은 켜져 있어도 목록에 없다(표시만 뺀다)');
  assert.deepStrictEqual(list.map(x => x.past), [true, false, false], '지금 이 분은 지난 게 아니다');
  assert.deepStrictEqual(list.map(x => x.next), [false, true, false], '다음 알람 강조는 직접 설정한 알람만 기준'); assert.strictEqual(list[1].minutesUntil, 0); assert.strictEqual(list[2].minutesUntil, null);
  assert.ok(list.every(x => x.kind === 'alarm'));
  const later = QA.todayAlarmList(s, at(2026, 10, 23, 13, 31)); assert.strictEqual(later.find(x => x.next).title, '알람'); assert.strictEqual(later.find(x => x.next).minutesUntil, 119);
  const done = QA.todayAlarmList(s, at(2026, 10, 23, 23, 0)); assert.ok(done.every(x => x.past && !x.next), '모두 지난 뒤에는 다음 알람이 없다');
});
t('오늘 판정은 스케줄러(alarms.cjs)와 같다: 요일·날짜·그 주만·건너뛰기·켜짐. 점심·퇴근은 켜져 있으면 요일 무관', () => {
  const days = [at(2026, 10, 19), at(2026, 10, 23), at(2026, 10, 24), at(2026, 10, 25), at(2026, 10, 26), at(2026, 11, 2)];
  const repeats = [undefined, { kind: 'weekly', days: [1, 3, 5] }, { kind: 'weekly', days: [0, 6] }, { kind: 'date', date: '2026-10-24' }, { kind: 'week', weekStart: '2026-10-19', days: [5, 6] }, { kind: 'week', weekStart: '2026-10-26', days: [1] }];
  let checked = 0;
  for (const day of days) for (const repeat of repeats) for (const enabled of [true, false]) for (const skip of [null, '2026-10-23', '2026-10-24']) {
    const a = al({ id: 'x', time: '10:00', enabled, repeat, skipDate: skip || undefined });
    const want = enabled && A.occursOn(a, day) && !A.isSkipped(a, day);   // 스케줄러(dueActions)가 알람 카드를 내는 조건과 같은 식
    const got = QA.todayAlarmList({ lunchOn: false, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [a] }, day).length === 1;
    assert.strictEqual(got, want, `${day.toDateString()} ${JSON.stringify(repeat)} en=${enabled} skip=${skip}`); checked++;
  }
  assert.ok(checked > 100);
  // 실제 스케줄러로도 확인: 그 날 10:00에 카드가 나오는 경우와 목록이 일치
  for (const day of days) for (const repeat of repeats) {
    const a = al({ id: 'y', time: '10:00', repeat }); const fired = new Set();
    const due = A.dueActions({ alarms: [a] }, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0), fired).some(x => x.card === 'alarm');
    assert.strictEqual(QA.todayAlarmList({ lunchOn: false, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [a] }, day).length === 1, due);
  }
  const sat = QA.todayAlarmList({ lunchOn: true, leaveOn: true, lunchTime: '12:00', leaveTime: '18:00', alarms: [] }, at(2026, 10, 24)); assert.deepStrictEqual(sat, [], '점심·퇴근 기본 알림은 표시하지 않는다(알람이 하나도 없으면 빈 목록)');
  // 기본 알림이 울리는 동작은 그대로(표시만 뺐다): 스케줄러는 여전히 점심 카드를 낸다
  assert.ok(A.dueActions({ lunchEnabled: true, lunchTime: '12:00', alarms: [] }, at(2026, 10, 24, 12, 0), new Set()).some(x => x.card === 'lunch'), '점심 알림은 그대로 울린다');
  const resolved = A.resolveAlarmSettings({ lunchEnabled: true, leaveEnabled: false, lunchTime: '11:40', leaveTime: '17:30', alarms: [al({ id: 'z', time: '08:00' })] });
  const q = Q.quickAlarmSettings(A.resolveAlarmSettings, { lunchEnabled: true, leaveEnabled: false, lunchTime: '11:40', leaveTime: '17:30', alarms: [al({ id: 'z', time: '08:00' })] });
  assert.deepStrictEqual(q, { lunchOn: resolved.lunchOn, leaveOn: resolved.leaveOn, lunchTime: resolved.lunchTime, leaveTime: resolved.leaveTime, alarms: resolved.alarms });
});
t('알람이 없거나 설정을 못 읽으면 빈 목록, 문구·남은 시간 표기', () => {
  assert.deepStrictEqual(QA.todayAlarmList(null, new Date()), []); assert.deepStrictEqual(QA.todayAlarmList({ lunchOn: false, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [] }, new Date()), []);
  assert.strictEqual(QA.NO_ALARM_TEXT, '오늘 직접 설정한 알람이 없어요');
  assert.strictEqual(QA.noAlarmText(at(2026, 10, 24), at(2026, 10, 24, 9, 0)), '오늘 직접 설정한 알람이 없어요'); assert.strictEqual(QA.noAlarmText(at(2026, 10, 25), at(2026, 10, 24, 9, 0)), '10월 25일에 설정한 알람이 없어요');
  assert.ok(!/기본 알림|점심|퇴근/.test(QA.NO_ALARM_TEXT + QA.noAlarmText(at(2026, 10, 25), at(2026, 10, 24))), '기본 알림이 켜져 있다는 안내는 넣지 않는다');
  assert.strictEqual(QA.untilText(0), '지금'); assert.strictEqual(QA.untilText(5), '5분 뒤'); assert.strictEqual(QA.untilText(60), '1시간 뒤'); assert.strictEqual(QA.untilText(135), '2시간 15분 뒤');
});

// ── 연결(정적 확인) ──────────────────────────────────────────────────────────
t('연결: 우클릭 → 퀵 메뉴, 종료는 정상 종료 경로(requestQuit: 저장·정리 후 app.quit, 시간 초과 시 app.exit), 퀵 창이 보낸 요청만 받음', () => {
  const main = read('main.cjs'), pet = read('src/pages/PetPage.tsx'), page = read('src/pages/QuickPage.tsx');
  assert.ok(/ipcMain\.on\('pet-right-click', \(\) => openQuickMenu\(\)\)/.test(main));
  assert.ok(/if \(action === 'quit'\) \{ requestQuit\(\); return; \}/.test(main));
  assert.ok(/quitTimer = setTimeout\(\(\) => app\.exit\(0\), QUIT_TIMEOUT_MS\)/.test(main) && /QUIT_TIMEOUT_MS = 2000/.test(main) && /app\.quit\(\)/.test(main), '정상 종료를 먼저, 2초 안에 안 끝나면 강제');
  assert.ok(/const fromQuick = \(e\) =>/.test(main) && (main.match(/fromQuick\(e\)/g) || []).length === 7, '닫기·첫 알림·영역·카드·크기·알람 읽기·동작 7곳 모두 퀵 창이 보낸 것인지 확인');
  assert.ok(/win\.on\('blur'/.test(main) && /closeQuickMenu\(\)/.test(main), '포커스를 잃으면 닫힘');
  assert.ok(/if \(quickWindow && !quickWindow\.isDestroyed\(\)\) return;/.test(main.slice(main.indexOf('function startAlwaysOnTopKeepAlive'), main.indexOf('function stopAlwaysOnTopKeepAlive'))), '퀵 메뉴가 열려 있는 동안 항상 위 재설정은 쉰다(맥에서 포커스를 가져가 메뉴가 닫히는 문제)');
  assert.ok(/quickWindow = null;/.test(main.slice(main.indexOf('function finishQuit'), main.indexOf('function requestQuit'))), '종료 때 퀵 창도 정리');
  assert.ok(/quickOpenRef\.current/.test(pet) && /const paused = alertRef\.current \|\| toastActiveRef\.current \|\| quickOpenRef\.current/.test(pet), '퀵 메뉴가 열린 동안 평소 말풍선은 쉰다');
  assert.ok(/QUIT_CONFIRM_MS/.test(page) && /한 번 더 누르면 종료돼요/.test(page) && /종료하면 알람이 울리지 않아요/.test(page));
  assert.ok(/layoutQuickItems\(ITEMS, QUIT\)/.test(page) && /key === 'Escape'/.test(page) && /api\(\)\?\.quickClose\(\)/.test(page));
  assert.ok(!/fetch\(|XMLHttpRequest/.test(page), '렌더러는 네트워크를 쓰지 않는다(메인이 한다)');
  assert.ok(/s\.weatherConsent \? s\.weatherCityId : ''/.test(page) && /if \(!c\) \{ setPhase\('none'\); return; \}/.test(page), '동네나 동의가 없으면 날씨 요청을 하지 않는다');
});
t('방사형 모션·색(정적 확인): CSS 애니메이션만(rAF 루프 없음), 열림 약 500ms·닫힘 150ms, 버튼별 --dx --dy --rot --delay, 움직임 줄이기, 색 변수 4개, 붉은색은 종료 확인 한 곳', () => {
  const css = read('src/styles/quick.css'), page = read('src/pages/QuickPage.tsx'), main = read('main.cjs');
  assert.ok(!/requestAnimationFrame\(\s*function|setInterval\(|loop/.test(page.replace(/\/\/.*$/gm, '').replace(/const id = requestAnimationFrame\(\(\) => \{[\s\S]*?\}\);\s*return \(\) => cancelAnimationFrame\(id\);/, '')), '애니메이션을 돌리는 rAF/setInterval 루프 없음(포커스 이동용 rAF 한 번만)');
  assert.ok(/animation: qk-x 500ms var\(--delay, 0ms\) both/.test(css) && /animation: qk-y 500ms/.test(css) && /animation: qk-b 500ms/.test(css), '열림 500ms');
  assert.ok(/qk-x-out 150ms/.test(css) && /qk-y-out 150ms/.test(css) && /qk-b-out 150ms/.test(css), '닫힘 150ms'); assert.ok(Q.QUICK_CLOSE_MS >= 150 && Q.QUICK_CLOSE_MS <= 200);
  for (const v of ['--dx', '--dy', '--rot', '--delay']) assert.ok(css.includes(v) && page.includes(`'${v}'`), v);
  assert.ok(/prefers-reduced-motion: reduce[\s\S]*animation: none !important/.test(css), '움직임 줄이기: 모션 없이 최종 위치');
  for (const v of ['--quick-bar-bg', '--quick-bar-fg', '--quick-bar-border', '--quick-bar-hover']) { assert.ok(css.includes(`${v}:`), v); assert.ok(css.indexOf(`html[data-theme="dark"] .qk-root`) > 0); }
  assert.ok(/--quick-bar-bg: #ffffff;/.test(css) && /--quick-bar-fg: #111111;/.test(css) && /--quick-bar-bg: #111111;/.test(css) && /--quick-bar-fg: #ffffff;/.test(css), '라이트 흰 버튼+검정 아이콘, 다크 검은 버튼+흰 아이콘');
  assert.ok(/rgba\(17, 17, 17, 0\.08\)/.test(css) && /rgba\(255, 255, 255, 0\.14\)/.test(css), '호버: 라이트 검정 8%, 다크 흰색 14%');
  assert.ok(!/gradient|blur\(/.test(css), '그라데이션·번짐 없음'); assert.ok(/--quick-confirm: #e5484d/.test(css) && (css.match(/#e5484d/gi) || []).length === 1, '붉은색은 종료 확인 한 곳');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/#e5484d|#ffffff|#111111|#fff\b/gi, '')), '그 밖의 색 없음(블랙 앤 화이트)');
  assert.ok(/'quick-open'/.test(main) && /'quick-closing'/.test(main) && /QUICK_CLOSE_MS/.test(main), '열림·닫힘 모션은 메인이 신호를 주고 닫힘 뒤에 창을 없앤다');
  assert.ok(/ipcMain\.on\('pet-right-click', \(\) => openQuickMenu\(\)\)/.test(main) && /closeQuickMenu\(true\); return; \}   \/\/ 열려 있을 때의 우클릭은 닫는다/.test(main), '재우클릭은 닫는다');
  assert.ok(/if \(st && st\.closing\) return;/.test(main) && /\(quickState && quickState\.closing\)\) return;/.test(main), '닫히는 중의 반복 닫기·눌림은 무시(상태가 꼬이지 않음)');
});
t('퀵 메뉴가 열린 동안 펫은 제자리(정적 확인): 초집중 모드의 정지 플래그 재사용, 순간이동·도망·낮잠·반짝임·졸림 방지 멈춤, 모든 말풍선 경로는 showBubble 한 곳에서 쉼, 클릭·드래그 코드는 그대로', () => {
  const pet = read('src/pages/PetPage.tsx');
  assert.ok(/const quickOpenRef = useRef\(false\)/.test(pet) && /focusPausedRef\.current = focusRef\.current\.enabled \|\| open/.test(pet), '열림 알림이 같은 정지 플래그(focusPausedRef)를 켠다');
  assert.ok(/focusPausedRef\.current = next\.enabled \|\| quickOpenRef\.current/.test(pet), '초집중 모드를 켜고 끄는 중에도 메뉴가 열려 있으면 계속 정지');
  assert.ok(/const showBubble = useCallback\([^\n]*\n\s*if \(quickOpenRef\.current\) return;/.test(pet), '모든 말풍선 경로가 지나는 showBubble에서 막는다');
  for (const marker of ['반짝임 없음', '낮잠 연출 없음', '순간이동 없음']) assert.ok(new RegExp(`!quickOpenRef\\.current[^\\n]*${marker}`).test(pet), marker);
  assert.ok(/if \(focusRef\.current\.enabled \|\| quickOpenRef\.current\) return;   \/\/ 초집중 모드·퀵 메뉴가 열린 동안에는 도망가지 않는다/.test(pet), '도망 없음');
  assert.ok(/if \(quickOpenRef\.current\) return;   \/\/ 퀵 메뉴가 열린 동안은 졸림 방지/.test(pet), '졸림 방지 멈춤');
  assert.ok(/if \(open\) \{ setBubble\(null\); setIdleBubble\(null\); \}/.test(pet), '열리면 떠 있던 말풍선도 치운다');
  assert.ok(/const paused = alertRef\.current \|\| toastActiveRef\.current \|\| quickOpenRef\.current/.test(pet), '평소 말풍선 시간도 멈췄다가 이어서');
  // 클릭·더블클릭·드래그 코드는 이 변경에서 건드리지 않았다: 핸들러 본문이 그대로
  assert.ok(/const handleMouseDown = \(e: React\.MouseEvent\) => \{\s*if \(e\.button !== 0\) return;\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*isDragging\.current = true;/.test(pet), '드래그 시작 코드 그대로');
  assert.ok(/onMouseDown=\{handleMouseDown\}\s*onClick=\{handleCatClick\}\s*onMouseEnter=\{handleMouseEnter\}\s*onMouseLeave=\{handleMouseLeave\}/.test(pet), '클릭·호버 연결 그대로');
});
t('안내 문구: 우클릭이 설정을 바로 연다는 옛 문구가 없고, 새 동작("메뉴가 쏟아져요")으로 안내한다(첫 실행 말풍선·닫기 안내·온보딩·도움말·구역 토스트)', () => {
  const main = read('main.cjs'), pet = read('src/pages/PetPage.tsx'), ob = read('src/components/Onboarding.tsx'), help = read('src/components/settings/HelpPane.tsx');
  assert.ok(main.includes("const REOPEN_HINT = '나를 우클릭하면 메뉴가 쏟아져요 (메인 · 날씨 · 알람)';"));
  assert.ok(/버디를 우클릭하면 메뉴가 쏟아져요/.test(main) && /메뉴 막대 오른쪽/.test(main) && /작업 표시줄 오른쪽 \^ 안의 하트 아이콘/.test(main), '닫기 안내(맥/Windows)');
  assert.ok(ob.includes('버디를 우클릭해요') && ob.includes('메뉴가 쏟아져요'), '온보딩'); assert.ok(help.includes("'우클릭하면 메뉴가 쏟아져요 (메인 · 날씨 · 알람)'"), '도움말');
  assert.ok(pet.includes('우클릭 메뉴의 메인에서 바꿀 수 있어요'), '활동 구역 토스트');
  for (const [name, src] of [['main', main], ['pet', pet], ['onboarding', ob], ['help', help]]) { assert.ok(!/우클릭하면 설정(창|을)? ?(이 )?(열|열릴)/.test(src), `${name}: 옛 안내`); assert.ok(!/설정은 버디 우클릭/.test(src), `${name}: 옛 닫기 안내`); assert.ok(!src.includes(FFFD) && !/\?{3}/.test(src), `${name}: 깨짐`); }
});
t('화면: 아이콘은 이모지가 아니라 lucide, 새 홈 칩·설정 스위치 없음(칩 8개 유지), 한글 깨짐 없음', () => {
  const page = read('src/pages/QuickPage.tsx'), css = read('src/styles/quick.css'), home = read('src/components/settings/HomePane.tsx');
  assert.ok(!/[\u{1F000}-\u{1FFFF}☀-➿]/u.test(page), '이모지 없음'); assert.ok(/from 'lucide-react'/.test(page));
  assert.strictEqual((home.match(/^\s+id: '(mode|size|zone|display|speed|yar|distract|bubble)'/gm) || []).length, 8, '홈 칩 8개');
  assert.ok(!/id: 'quick'/.test(home));
  for (const f of ['src/pages/QuickPage.tsx', 'src/styles/quick.css', 'quick-menu.cjs', 'src/utils/quickMenu.ts', 'src/utils/weatherCard.ts', 'src/utils/quickAlarms.ts']) assert.ok(!read(f).includes(FFFD), f);
  assert.ok(/html\[data-theme="dark"\] \.qk-root/.test(css) && /prefers-reduced-motion/.test(css), '다크 테마·움직임 줄이기');
});

(async () => { let fail = 0; for (const [name, fn] of queue) { try { await fn(); console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } } if (fail) { console.log(`\n${fail}개 실패`); process.exit(1); } console.log(`\n${queue.length}개 통과`); })();
