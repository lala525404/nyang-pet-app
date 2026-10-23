// 말풍선 우선순위·대화 보호 단위 테스트: 순위 규칙, 답변 표시 시간, 보호 시간(답변 20초·날씨 안내 10초), 보호 중 펫 위치 고정·제자리 모션, 마우스 올림 연장, 알람·초집중 규칙 불변.
// `node tests/bubble-priority-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const load = (rel) => {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, () => ({})); return m.exports;
};
const B = load('src/utils/bubblePriority.ts');
const { LEVEL } = B;
const S = (o = {}) => ({ talkOpen: false, forceUntil: 0, active: null, protectUntil: 0, ...o });
const act = (level, until) => ({ level, until });

t('순위 상수: 1 알람·토스트, 2 대화 답변, 3 아침·퇴근길 안내, 4 그 외', () => {
  assert.deepStrictEqual({ ...LEVEL }, { ALARM: 1, ANSWER: 2, BRIEFING: 3, OTHER: 4 });
});
t('낮은 순위는 높은 순위를 덮지 못하고(버림), 같거나 높은 순위는 바로 대체한다, 끝난 말풍선은 아무것도 막지 않는다', () => {
  const now = 1000;
  for (const [active, level, ok] of [[2, 3, false], [2, 4, false], [2, 2, true], [2, 1, true], [3, 4, false], [3, 3, true], [3, 2, true], [4, 4, true], [4, 3, true], [4, 2, true], [4, 1, true]]) {
    assert.strictEqual(B.canShow(act(active, now + 5000), level, now), ok, `${active}순위가 떠 있을 때 ${level}순위`);
  }
  assert.strictEqual(B.canShow(act(2, now), 4, now), true, '끝나는 순간부터는 막지 않는다'); assert.strictEqual(B.canShow(act(2, now - 1), 4, now), true); assert.strictEqual(B.canShow(null, 4, now), true);
});
t('admit: 4순위는 보호 중이면 버려지고, 물어서 보여 주는 운세·날씨가 떠 있으면 3·4순위가 못 뜨며, 대화 답변(2)은 언제나 뜬다', () => {
  const now = 5000;
  assert.strictEqual(B.admit(S(), 4, now), true);
  assert.strictEqual(B.admit(S({ talkOpen: true }), 4, now), false); assert.strictEqual(B.admit(S({ talkOpen: true }), 2, now), true);
  assert.strictEqual(B.admit(S({ forceUntil: now + 9000 }), 4, now), false); assert.strictEqual(B.admit(S({ forceUntil: now + 9000 }), 3, now), false); assert.strictEqual(B.admit(S({ forceUntil: now + 9000 }), 2, now), true);
  assert.strictEqual(B.admit(S({ protectUntil: now + 1 }), 4, now), false); assert.strictEqual(B.admit(S({ protectUntil: now + 1 }), 3, now), true, '답변 직후 보호 시간에도 3순위 안내는 뜰 수 있다(4순위만 쉰다)');
  assert.strictEqual(B.admit(S({ active: act(3, now + 9000) }), 4, now), false); assert.strictEqual(B.admit(S({ active: act(3, now + 9000) }), 2, now), true);
  assert.strictEqual(B.admit(S({ active: act(4, now + 4000) }), 4, now), true, '4순위끼리는 새 것이 대체');
  assert.strictEqual(B.admit(S({ active: act(4, now + 4000) }), 3, now), true);
});
t('보호 판정: 말 걸기 창·물어서 보여 주는 운세/날씨·답변/안내 말풍선·사라진 뒤 보호 시간 중이면 보호, 4순위 말풍선만 떠 있으면 보호 아님', () => {
  const now = 10000;
  assert.strictEqual(B.isProtected(S(), now), false);
  assert.strictEqual(B.isProtected(S({ talkOpen: true }), now), true);
  assert.strictEqual(B.isProtected(S({ forceUntil: now + 1 }), now), true); assert.strictEqual(B.isProtected(S({ forceUntil: now }), now), false);
  assert.strictEqual(B.isProtected(S({ active: act(2, now + 1) }), now), true); assert.strictEqual(B.isProtected(S({ active: act(3, now + 1) }), now), true);
  assert.strictEqual(B.isProtected(S({ active: act(4, now + 5000) }), now), false, '평소 말풍선은 보호를 만들지 않는다');
  assert.strictEqual(B.isProtected(S({ active: act(2, now - 1) }), now), false);
  assert.strictEqual(B.isProtected(S({ protectUntil: now + 1 }), now), true); assert.strictEqual(B.isProtected(S({ protectUntil: now }), now), false);
  assert.strictEqual(B.answerBusy(S({ talkOpen: true }), now), true); assert.strictEqual(B.answerBusy(S({ active: act(3, now + 9) }), now), false); assert.strictEqual(B.answerBusy(S({ protectUntil: now + 9 }), now), false, '보호 시간 꼬리는 안내를 미루지 않는다');
});
t('보호 꼬리: 답변이 사라진 뒤 20초, 아침·퇴근길 안내가 사라진 뒤 10초, 평소 말풍선은 0', () => {
  assert.strictEqual(B.PROTECT_TAIL_MS[2], 5000); assert.strictEqual(B.PROTECT_TAIL_MS[3], 3000);
  assert.deepStrictEqual([2, 3, 4].map(l => B.tailFor(l)), [5000, 3000, 0]);
  const end = 100000;   // 답변이 사라진 시각
  const prot = (dt) => B.isProtected(S({ protectUntil: end + B.tailFor(2) }), end + dt);
  assert.ok(prot(0) && prot(4999) && !prot(5000), '5초');
  const prot3 = (dt) => B.isProtected(S({ protectUntil: end + B.tailFor(3) }), end + dt);
  assert.ok(prot3(2999) && !prot3(3000), '3초');
});
t('답변 표시 시간: 최소 7초, 글자당 0.15초 추가, 최대 15초(이모지는 한 글자)', () => {
  assert.strictEqual(B.ANSWER_MIN_MS, 5000); assert.strictEqual(B.ANSWER_MAX_MS, 12000); assert.strictEqual(B.ANSWER_PER_CHAR_MS, 120);
  assert.strictEqual(B.answerMs(''), 5000); assert.strictEqual(B.answerMs('가'), 5120); assert.strictEqual(B.answerMs('가'.repeat(10)), 6200); assert.strictEqual(B.answerMs('가'.repeat(40)), 9800);
  assert.strictEqual(B.answerMs('가'.repeat(58)), 11960); assert.strictEqual(B.answerMs('가'.repeat(59)), 12000); assert.strictEqual(B.answerMs('가'.repeat(500)), 12000);
  assert.strictEqual(B.answerMs('🍀'.repeat(3)), 5360, '이모지 하나는 글자 하나');
  for (let i = 0; i < 300; i++) { const ms = B.answerMs('가'.repeat(i)); assert.ok(ms >= 5000 && ms <= 12000); if (i) assert.ok(ms >= B.answerMs('가'.repeat(i - 1)), '단조 증가'); }
  const lines = ['조금 서툴러도 귀엽게 넘어가는 날이에요', '업무운 · 동료의 도움이 딱 맞게 와요', '오늘 최고 19° / 최저 8°']; for (const l of lines) assert.ok(B.answerMs(l) > 5000 && B.answerMs(l) < 12000, '줄마다 같은 규칙');
});
t('마우스 올림 연장: 올려 둔 동안은 사라지지 않고, 벗어난 뒤 2초가 지나야 사라진다', () => {
  assert.strictEqual(B.HOVER_LINGER_MS, 2000); assert.strictEqual(B.HOVER_MAX_TOTAL_MS, 20000);
  // 연장 상한: 오래 올려 둬도 한 말풍선의 총 표시 시간(시작부터)이 20초를 넘으면 더 연장하지 않는다
  assert.strictEqual(B.hoverExtends(0, true, 0, 19999), true); assert.strictEqual(B.hoverExtends(0, true, 0, 20000), false, '총 20초가 상한'); assert.strictEqual(B.hoverExtends(5000, true, 0, 24999), true); assert.strictEqual(B.hoverExtends(5000, true, 0, 25000), false);
  assert.strictEqual(B.hoverExtends(0, false, 18500, 19999), true, '벗어난 뒤 2초는 상한 안에서만'); assert.strictEqual(B.hoverExtends(0, false, 5000, 8000), false);
  // 시뮬레이션: 마우스를 계속 올려 두는 답변은 표시 시간이 12초 한도가 아니라 20초에서 끝난다
  { const since = 1000; let until = since + B.answerMs('가'.repeat(30)); let t = since; while (t < since + 60000) { t += 100; if (B.hoverExtends(since, true, 0, t)) until = Math.max(until, t + 400); if (t >= until) break; } assert.ok(t - since >= 20000 && t - since < 20600, `최대 연장 ${t - since}ms`); }
  assert.strictEqual(B.hoverKeeps(true, 0, 99999), true); assert.strictEqual(B.hoverKeeps(false, 1000, 2999), true); assert.strictEqual(B.hoverKeeps(false, 1000, 3000), false); assert.strictEqual(B.hoverKeeps(false, 0, 50000), false, '올린 적 없으면 연장 없음');
});

// ── 시뮬레이션: 대화 → 답변 → 보호 꼬리 동안 4순위가 끼어들지 못하고 펫이 제자리에 있다 ────────────
t('대화 시나리오 시뮬레이션(0.1초 단위): 창 열림 → 답변 → 20초 보호 → 풀림. 보호 구간에 4순위 말풍선(섞기·반응·졸림 방지·낮잠·순간이동·야르)은 한 번도 뜨지 않고, 풀린 뒤에는 뜬다', () => {
  let active = null, protectUntil = 0, talkOpen = false, forceUntil = 0; let shown4Inside = 0, shown4After = 0; let answerStart = null, answerEnd = null, shownAnswer = 0;
  const state = (now) => ({ talkOpen, forceUntil, active, protectUntil });
  const show = (level, ms, now) => {   // PetPage.showBubble과 같은 규칙
    if (!B.admit(state(now), level, now)) return false;
    active = { level, until: now + ms }; return true;
  };
  const tick = (now) => {   // 끝난 말풍선 정리 + 꼬리 보호
    if (active && now >= active.until) { const tail = B.tailFor(active.level); if (tail) protectUntil = Math.max(protectUntil, now + tail); if (active.level === 2) answerEnd = now; active = null; }
  };
  const text = '날씨를 아직 못 가져왔어요. 잠시 뒤에 다시 물어봐 줄래요?'; const ms = B.answerMs(text);
  for (let now = 0; now <= 120000; now += 100) {
    if (now === 2000) talkOpen = true;
    if (now === 8000) { talkOpen = false; if (show(LEVEL.ANSWER, ms, now)) { answerStart = now; shownAnswer++; } }
    tick(now);
    // 4순위 시도: 섞기·반응·졸림 방지·낮잠·순간이동·야르 타임이 계속 두드린다
    for (let k = 0; k < 6; k++) if (show(LEVEL.OTHER, 3000, now)) { if (now >= 2000 && answerEnd === null) shown4Inside++; else if (answerEnd !== null && now < answerEnd + B.tailFor(2)) shown4Inside++; else if (answerEnd !== null) shown4After++; }
    // 보호 중 판정과 4순위 시도의 일치: 보호 중에는 4순위가 active를 차지하지 못한다
  }
  assert.strictEqual(shownAnswer, 1); assert.ok(answerStart === 8000 && answerEnd >= 8000 + ms && answerEnd < 8000 + ms + 100, `답변 ${answerStart}~${answerEnd}`);
  assert.strictEqual(shown4Inside, 0, '대화 중·답변 중·답변 직후 20초 동안 4순위는 0번');
  assert.ok(shown4After > 0, '보호가 끝나면 4순위가 다시 뜬다');
});
t('아침·퇴근길 안내(3순위): 떠 있는 동안 4순위가 덮지 못하고 사라진 뒤 10초 쉰다. 답변(2순위)은 안내를 바로 대체하고 안내는 답변을 덮지 못한다', () => {
  let active = null, protectUntil = 0; const st = (now) => ({ talkOpen: false, forceUntil: 0, active, protectUntil });
  const show = (level, ms, now) => { if (!B.admit(st(now), level, now)) return false; active = { level, until: now + ms }; return true; };
  assert.ok(show(3, 9000, 0)); assert.ok(!show(4, 3000, 1000)); assert.ok(!show(4, 3000, 8999));
  const endAt = 9000; protectUntil = endAt + B.tailFor(3); active = null;
  assert.ok(!show(4, 3000, endAt)); assert.ok(!show(4, 3000, endAt + 2999)); assert.ok(show(4, 3000, endAt + 3000), '3초 뒤에는 뜬다');
  active = null; protectUntil = 0; assert.ok(show(3, 9000, 20000)); assert.ok(show(2, 8000, 21000), '답변이 안내를 바로 대체'); assert.ok(!show(3, 9000, 22000), '안내는 답변을 덮지 못한다'); assert.ok(!show(4, 1000, 22000));
});
t('알람·미리 알림(1순위)은 이 규칙을 거치지 않는다: 렌더링이 알림·토스트가 있으면 모든 말풍선을 가리고, 알림이 뜨면 보호를 풀며 보호를 만들지 않는다(정적 확인)', () => {
  const pet = read('src/pages/PetPage.tsx');
  assert.ok(/const shownBubble = \(alertActive \|\| toast\) \? null/.test(pet), '알림·토스트가 있으면 말풍선은 가려진다');
  assert.ok(/if \(alertActive \|\| toast\) \{ forceRef\.current = null; protectUntilRef\.current = 0; holdRef\.current = false; \}/.test(pet), '알림이 뜨면 붙잡아 둔 답변·보호 시간을 푼다');
  assert.ok(/const p = !focusRef\.current\.enabled && !alertRef\.current && !toastActiveRef\.current && isProt\(\)/.test(pet), '알람 중·초집중 모드에서는 보호(이동 정지)를 걸지 않는다');
  assert.ok(/talkBlocked = focus\.enabled \|\| alertActive \|\| !!toast/.test(pet), '알림·초집중 중에는 말 걸기가 열리지 않는다');
  for (const f of ['alarms.cjs']) assert.ok(!/petProtect|pet-protect|isProtected|bubblePriority/.test(read(f)), `${f}는 보호 상태를 보지 않는다`);
  const main = read('main.cjs'); const alarmBlock = main.slice(main.indexOf('function runAlarmCheck'), main.indexOf('function startBreakTimeChecker'));
  assert.ok(!/petProtect/.test(alarmBlock), '알람 체크 함수는 보호와 무관'); assert.ok(/setInterval\(runAlarmCheck, 1000\)/.test(main));
  assert.ok(/ipcMain\.on\('pet-protect'/.test(main) && /if \(petProtect\) return;[^\n]*\n\s*createYarWindow\(\);/.test(main), '야르 타임만 보호 중에 건너뛴다');
});
t('답변 출처는 모두 2순위, 아침·퇴근길 안내·생일 축하는 3순위, 나머지는 기본 4순위(정적 확인)', () => {
  const pet = read('src/pages/PetPage.tsx');
  assert.ok(/showBubble\(msg, 'normal', false, answerMs\(msg\), LEVEL\.ANSWER\)/.test(pet), '날씨 못 가져옴 안내');
  assert.ok(/showBubble\(lastPhraseRef\.current, 'happy', false, answerMs\(lastPhraseRef\.current\), LEVEL\.ANSWER\)/.test(pet), '한마디 답변');
  assert.ok(/showBubble\(text, 'happy', false, then \? 3500 : answerMs\(text\), LEVEL\.ANSWER\)/.test(pet), '말 걸기 답변');
  assert.ok(/const setForce = \(kind: 'fortune' \| 'weather', text: string\) => \{ const t = Date\.now\(\); forceRef\.current = \{ kind, until: t \+ answerMs\(text\), since: t \}; holdRef\.current = true; \}/.test(pet), '붙잡는 시간은 줄의 글자 수에 비례');
  assert.ok(/setForce\('weather', weatherLines\(w\.data, new Date\(\)\)\[0\]\)/.test(pet), '날씨 답변');
  assert.ok(/setForce\('fortune', fortuneFor\(/.test(pet), '운세 답변');
  assert.ok(/setForce\('fortune', pages\[fortunePageRef\.current % pages\.length\]\)/.test(pet), '운세 줄 넘김');
  assert.ok(/setForce\('weather', lines\[weatherPageRef\.current\]\)/.test(pet), '날씨 줄 넘김');
  assert.ok(/hoverExtends\(forceRef\.current\.since, hoverRef\.current\.over, hoverRef\.current\.leftAt, now\)/.test(pet) && /hoverExtends\(now, hoverRef\.current\.over/.test(pet), '마우스 올림 연장은 총 20초 한도');
  assert.ok(/showBubble\(text, 'happy', false, BRIEFING_MS, LEVEL\.BRIEFING\)/.test(pet), '아침·퇴근길 안내와 생일 축하');
  for (const re of [/showBubble\('z z z 💤', 'sleepy'\)/, /showBubble\('순간이동! 💨', 'surprised'\)/, /showBubble\(rand\(reactions\), 'surprised'\)/, /showBubble\('여기 있어요! 🐾', 'happy'\)/]) assert.ok(re.test(pet), String(re));
  assert.ok(/bubbleEnabled !== false && nagOk\(\)/.test(pet));
});
t('대화 보호 중 이동 정지: 순간이동·낮잠·도망·반짝임·랜덤 이동 점프(물리 루프)·야르 타임이 모두 같은 isProt()/holdRef로 막힌다(정적 확인)', () => {
  const pet = read('src/pages/PetPage.tsx');
  for (const re of [/!isSleepingRef\.current && !isProt\(\)\) \{\s*\/\/ 초집중 모드·대화 보호 중에는 순간이동 없음/, /if \(isProt\(\)\) \{ setMotionClass\(''\); return; \}\s*\/\/ 연기 효과 사이에/, /if \(isProt\(\)\) \{ setMotionClass\(''\); return; \}\s*\/\/ 디스플레이 정보를/,
    /!stateRef\.current\.escaping && !isProt\(\)\) \{\s*\/\/ 대화 보호 중에는 도망/, /!stateRef\.current\.escaping && !isProt\(\)\) \{\s*\/\/ 초집중 모드·대화 보호 중에는 낮잠/, /if \(holdRef\.current\) \{/, /holdStep\(s, getMovementBounds/, /if \(p && isSleepingRef\.current\)/, /window\.electronAPI\?\.setPetProtect\?\.\(p\)/]) assert.ok(re.test(pet), String(re));
  assert.ok(/if \(wasHold\) \{ wasHold = false; corr = null; nextEventRef\.current = Date\.now\(\) \+ 800; \}/.test(pet), '보호가 끝나면 그 자리에서 이동 재개');
  assert.ok(/\.cat-wrapper\[data-hold\] \.cat-emoji \{ animation: catBoing/.test(read('src/styles/pet.css')) && /data-hold=\{holding \? '' : undefined\}/.test(pet), '제자리 바운스 모션');
  assert.ok(/draggingRef\.current/.test(pet.slice(pet.indexOf('holdStep(s,'), pet.indexOf('holdStep(s,') + 200)), '드래그는 막지 않는다');
});

// ── 시뮬레이션: 보호 중 펫 위치 ─────────────────────────────────────────────
t('보호 중 위치 고정 시뮬레이션: 속도가 붙은 펫도 보호가 시작되면 좌표가 변하지 않고(20초 × 30fps), 기울기·크기는 제자리로 돌아온다', () => {
  const bounds = { minX: 0, maxX: 1600, minY: 0, maxY: 800 };
  const s = { wx: 500, wy: 300, vx: 17, vy: -9, vr: 4, rotate: 30, scale: 1.1, targetScale: 1.1, escaping: true };
  let corr = null, first = true; const start = { wx: s.wx, wy: s.wy };
  for (let f = 0; f < 20 * 30; f++) { const r = B.holdStep(s, bounds, first, corr, false); first = false; corr = r.corr; assert.ok(!r.moved); assert.strictEqual(s.wx, start.wx); assert.strictEqual(s.wy, start.wy); assert.strictEqual(s.vx, 0); assert.strictEqual(s.vy, 0); }
  assert.strictEqual(s.rotate, 0); assert.strictEqual(s.scale, 1); assert.strictEqual(s.escaping, false);
});
t('보호 시작 시 가장자리 밖에 걸친 펫은 한 번만 부드럽게 안쪽으로 보정(순간이동 없음), 이후 고정. 드래그 중에는 보정하지 않는다', () => {
  const bounds = { minX: 0, maxX: 1600, minY: 0, maxY: 800 };
  const s = { wx: 1900, wy: -40, vx: 5, vy: 5, vr: 0, rotate: 0, scale: 1, targetScale: 1, escaping: false };
  let corr = null, first = true, frames = 0, maxStep = 0, prevX = s.wx, prevY = s.wy, stops = 0;
  for (let f = 0; f < 120; f++) { const r = B.holdStep(s, bounds, first, corr, false); first = false; corr = r.corr; if (r.moved) { frames++; maxStep = Math.max(maxStep, Math.abs(s.wx - prevX), Math.abs(s.wy - prevY)); } else stops++; prevX = s.wx; prevY = s.wy; }
  assert.deepStrictEqual([s.wx, s.wy], [1600, 0]); assert.ok(frames > 5 && frames < 40, `여러 프레임에 걸쳐 부드럽게 ${frames}`); assert.ok(maxStep < 100 && maxStep > 0, `한 프레임 최대 ${maxStep}px`); assert.ok(stops > 80, '보정 뒤에는 움직이지 않는다');
  const d = { wx: 1900, wy: -40, vx: 0, vy: 0, vr: 0, rotate: 0, scale: 1, targetScale: 1, escaping: false }; let c2 = null, first2 = true;
  for (let f = 0; f < 60; f++) { const r = B.holdStep(d, bounds, first2, c2, true); first2 = false; c2 = r.corr; assert.ok(!r.moved); }
  assert.deepStrictEqual([d.wx, d.wy], [1900, -40], '드래그 중에는 보정하지 않는다(드래그는 막지 않는다)');
  const inside = { wx: 200, wy: 200, vx: 3, vy: 3, vr: 0, rotate: 0, scale: 1, targetScale: 1, escaping: false }; assert.strictEqual(B.holdStep(inside, bounds, true, null, false).corr, null, '안쪽이면 보정 없음');
});

// ── 기존 규칙 불변 ──────────────────────────────────────────────────────────
t('초집중 모드 규칙 불변: 말풍선 엔진·대화·보호가 모두 초집중 모드를 먼저 막고, 클릭 통과·이동 루프 코드는 그대로', () => {
  const pet = read('src/pages/PetPage.tsx'), foc = read('focus-mode.cjs');
  assert.ok(/!paused && !focusRef\.current\.enabled && \(force \|\| /.test(pet)); assert.ok(/if \(focusRef\.current\.enabled\) return;\s*\/\/ 초집중 모드에서는 반응 말풍선·파티클 없음/.test(pet));
  assert.ok(/ignoreMouse = \(state, petInteractive\) => !!state\.enabled && !petInteractive/.test(foc));
  assert.ok(/focus\.enabled \? '' : undefined/.test(pet));
  assert.ok(/if \(!focus\.enabled\) return;\s*const api = window\.electronAPI;\s*const win = /.test(pet), '초집중 모드의 느린 이동 루프는 그대로');
});
t('새 소스 파일에 U+FFFD 없음', () => {
  const FFFD = String.fromCharCode(0xFFFD);
  for (const f of ['src/utils/bubblePriority.ts', 'src/pages/PetPage.tsx', 'main.cjs', 'preload.cjs']) assert.ok(!read(f).includes(FFFD), f);
});

// ── 빨리 돌아오기: 자동 닫힘·수동 종료 ──────────────────────────────────────
t('시간 상수는 한 곳(bubblePriority.ts)에 모여 있고 값이 요청대로다', () => {
  assert.deepStrictEqual([B.ANSWER_MIN_MS, B.ANSWER_PER_CHAR_MS, B.ANSWER_MAX_MS, B.PROTECT_TAIL_MS[2], B.PROTECT_TAIL_MS[3], B.HOVER_MAX_TOTAL_MS, B.TALK_IDLE_CLOSE_MS, B.HOVER_LINGER_MS], [5000, 120, 12000, 5000, 3000, 20000, 20000, 2000]);
  const src = read('src/utils/bubblePriority.ts'); for (const k of ['ANSWER_MIN_MS', 'ANSWER_MAX_MS', 'ANSWER_PER_CHAR_MS', 'PROTECT_TAIL_MS', 'HOVER_MAX_TOTAL_MS', 'TALK_IDLE_CLOSE_MS']) assert.ok(new RegExp(`export const [^\\n]*${k}`).test(src), k);
  for (const f of ['src/pages/PetPage.tsx', 'src/components/PetTalk.tsx']) assert.ok(!/\b(5000|12000|20000|3000)\b[^\n]*(꼬리|tail|IDLE)/i.test(read(f)), `${f}에 시간 숫자를 따로 박아 두지 않았다`);
});
t('자동 닫힘: 활동 없이 20초가 지나면 닫고(19.9초는 아님), 활동이 있으면 다시 20초, 글자를 치는 중이면 닫지 않는다(입력을 지우고 20초 뒤 닫힘)', () => {
  const last = 50000;
  assert.strictEqual(B.talkIdleExpired(last, last + 19999, false), false); assert.strictEqual(B.talkIdleExpired(last, last + 20000, false), true);
  assert.strictEqual(B.talkIdleExpired(last + 15000, last + 34999, false), false, '활동(키·클릭·입력)이 있으면 그때부터 다시 20초'); assert.strictEqual(B.talkIdleExpired(last + 15000, last + 35000, false), true);
  assert.strictEqual(B.talkIdleExpired(last, last + 120000, true), false, '글자를 치는 중(포커스 + 글자)이면 닫지 않는다');
  assert.strictEqual(B.talkIdleExpired(last + 100000, last + 119999, false), false);
  const tk = read('src/components/PetTalk.tsx');
  assert.ok(/\['keydown', 'pointerdown', 'input', 'wheel'\]/.test(tk) && /document\.activeElement === i && i\.value\.length > 0/.test(tk) && /talkIdleExpired\(lastActivityRef\.current, Date\.now\(\), typing\)\) onCancel\(\)/.test(tk));
});
t('수동 종료 트리거: Esc·닫기 버튼·자동 닫힘은 onCancel, 펫 더블클릭·빈 곳 더블클릭·창 blur는 endConversation으로 간다(정적 확인)', () => {
  const tk = read('src/components/PetTalk.tsx'), pet = read('src/pages/PetPage.tsx');
  assert.ok(/e\.key === 'Escape'\) \{ e\.stopPropagation\(\); onCancel\(\); \}/.test(tk)); assert.ok(/className="pet-talk-x" onClick=\{onCancel\}/.test(tk));
  assert.ok(/onCancel=\{endConversation\}/.test(pet), 'onCancel은 대화 상태 종료');
  assert.ok(/if \(inConversationFn\(protectState\(\), Date\.now\(\)\)\) endConversation\(\); else openTalk\('menu'\)/.test(pet), '펫 더블클릭: 대화 상태면 종료, 아니면 말 걸기 열기');
  assert.ok(/el\.closest\('\.cat-area, \.pet-talk, \.bubble, \.pet-toast'\)\) return;\s+if \(inConversationFn\(protectState\(\), Date\.now\(\)\)\) endConversation\(\)/.test(pet) && /document\.addEventListener\('dblclick', onDbl\)/.test(pet), '빈 곳 더블클릭');
  assert.ok(/if \(!talk\) return;\s+window\.addEventListener\('blur', endConversation\)/.test(pet), '말 걸기 창이 열려 있을 때 포커스가 창 밖으로 나가면 종료');
  assert.ok(!/addEventListener\('click'|onClick=\{[^}]*endConversation/.test(pet), '한 번 클릭은 종료가 아니다');
});
t('종료는 즉시·꼬리 없이: 말풍선·붙잡은 운세/날씨·보호 시간·말 걸기 창·제자리 모션을 모두 치우고 이동을 재개시킨다(정적 확인), 자연스럽게 사라질 때만 꼬리(5초/3초)', () => {
  const pet = read('src/pages/PetPage.tsx');
  const end = pet.slice(pet.indexOf('const endConversation = useCallback'), pet.indexOf('// 펫 창 안의 빈 곳'));
  for (const re of [/forceRef\.current = null; protectUntilRef\.current = 0;/, /a\.level <= LEVEL\.BRIEFING/, /setBubble\(null\)/, /setTalk\(null\); setBirthAsk\(false\)/, /holdRef\.current = false; setHolding\(false\); window\.electronAPI\?\.setPetProtect\?\.\(false\)/]) assert.ok(re.test(end), String(re));
  assert.ok(!/tailFor|PROTECT_TAIL_MS/.test(end), '종료에는 꼬리가 없다');
  assert.ok(/mixRef\.current = \{ slot: -1, kind: null, last: mixRef\.current\.last \}/.test(end) && /setIdleBubble\(null\); quietUntilRef\.current = Date\.now\(\) \+ 1500/.test(end), '남은 운세·날씨 줄을 정리하고 잠깐 쉰 뒤 평소 말풍선 재개');
  assert.ok(/const tail = tailFor\(level\); if \(tail\) protectUntilRef\.current/.test(pet) && /protectUntilRef\.current = Math\.max\(protectUntilRef\.current, now \+ PROTECT_TAIL_MS\[2\]\)/.test(pet), '자연스럽게 사라질 때만 꼬리');
  assert.ok(/if \(wasHold\) \{ wasHold = false; corr = null; nextEventRef\.current = Date\.now\(\) \+ 800; \}/.test(pet), '보호가 풀리면 이동 재개');
});
t('종료 시뮬레이션: 종료 직후에는 보호가 아니어서 4순위가 바로 뜨고 위치 고정이 풀린다(꼬리 없음). 자연 종료는 꼬리 동안 보호', () => {
  const now = 200000;
  const during = S({ talkOpen: true, forceUntil: now + 9000, active: act(2, now + 9000), protectUntil: now + 9000 });
  assert.strictEqual(B.inConversation(during, now), true); assert.strictEqual(B.admit(during, 4, now), false);
  const afterEnd = S();   // endConversation: 모두 초기화
  assert.strictEqual(B.inConversation(afterEnd, now), false); assert.strictEqual(B.isProtected(afterEnd, now), false); assert.strictEqual(B.admit(afterEnd, 4, now), true);
  const natural = S({ protectUntil: now + B.tailFor(2) }); assert.strictEqual(B.isProtected(natural, now), true); assert.strictEqual(B.isProtected(natural, now + 5000), false);
  assert.strictEqual(B.inConversation(S(), now), false, '대화 상태가 아니면 펫 더블클릭은 말 걸기 열기');
  assert.strictEqual(B.inConversation(S({ active: act(4, now + 5000) }), now), false, '평소 말풍선만 떠 있을 때도 열기');
});
t('알람·초집중·드래그·우선순위 규칙 불변(정적 확인): 알림이 뜨면 보호를 풀고 알림은 항상 위, 초집중·알림 중 말 걸기 안 열림, 드래그 허용', () => {
  const pet = read('src/pages/PetPage.tsx');
  assert.ok(/if \(alertActive \|\| toast\) \{ forceRef\.current = null; protectUntilRef\.current = 0; holdRef\.current = false; \}/.test(pet));
  assert.ok(/const shownBubble = \(alertActive \|\| toast\) \? null/.test(pet)); assert.ok(/talkBlocked = focus\.enabled \|\| alertActive \|\| !!toast/.test(pet));
  assert.ok(/if \(focusRef\.current\.enabled \|\| alertRef\.current \|\| toastActiveRef\.current\) return;\s+setBirthAsk\(false\); setTalk\(start\)/.test(pet));
  assert.deepStrictEqual({ ...LEVEL }, { ALARM: 1, ANSWER: 2, BRIEFING: 3, OTHER: 4 });
  assert.ok(/draggingRef\.current/.test(pet.slice(pet.indexOf('holdStep(s,'), pet.indexOf('holdStep(s,') + 200)));
  assert.ok(!/petProtect|bubblePriority/.test(read('alarms.cjs')));
});

console.log(`\n${n} tests passed`);
