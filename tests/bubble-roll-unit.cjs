// 평소 말풍선 롤링 단위 테스트: 종류별 비중(많은 번 시뮬레이션), 연속 금지, 셔플 백, 날씨 후보가 없을 때 기본 문구가 흡수, 새 문구 데이터 점검, 엔진 연결(정적).
// `node tests/bubble-roll-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, () => ({})); return m.exports; };
const R = load('src/utils/bubbleRoll.ts');
const P = load('src/data/bubblePhrases.ts');
const FFFD = String.fromCharCode(0xFFFD);
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// 종류를 N번 뽑는다(직전 종류를 이어서 넘긴다)
const simulate = (avail, N, seed = 7) => { const rand = lcg(seed); const counts = { phrase: 0, clock: 0, hello: 0, message: 0 }; const seq = []; let last = null; for (let i = 0; i < N; i++) { const k = R.pickRollKind(avail, last, rand); counts[k]++; seq.push(k); last = k; } return { counts, seq, share: (k) => counts[k] / N }; };
const near = (v, want, tol = 0.012) => assert.ok(Math.abs(v - want) < tol, `${v} ≈ ${want}`);

t('비중: 시계·날씨 안부·내 메시지는 각 20%, 나머지는 기본 문구 (10만 번 시뮬레이션, 오차 1.2%p 안)', () => {
  assert.deepStrictEqual({ ...R.ROLL_SHARE }, { clock: 0.2, hello: 0.2, message: 0.2 });
  const all = simulate({ clock: true, hello: true, message: true }, 100000);
  near(all.share('clock'), 0.2); near(all.share('hello'), 0.2); near(all.share('message'), 0.2); near(all.share('phrase'), 0.4);
  const noMsg = simulate({ clock: true, hello: true, message: false }, 100000);   // 내 메시지가 없는 흔한 경우: 기본 문구 60%
  near(noMsg.share('clock'), 0.2); near(noMsg.share('hello'), 0.2); assert.strictEqual(noMsg.counts.message, 0); near(noMsg.share('phrase'), 0.6);
});

t('날씨 후보가 없으면 날씨 몫이 기본 문구로 흡수된다(날씨 0%, 시계는 그대로 20%)', () => {
  const s = simulate({ clock: true, hello: false, message: false }, 100000);
  assert.strictEqual(s.counts.hello, 0); near(s.share('clock'), 0.2); near(s.share('phrase'), 0.8);
});

t('시계가 꺼져 있으면 시계는 나오지 않고 그 몫도 기본 문구가 가져간다. 아무 후보도 없으면 기본 문구', () => {
  const s = simulate({ clock: false, hello: true, message: false }, 50000);
  assert.strictEqual(s.counts.clock, 0); near(s.share('hello'), 0.2); near(s.share('phrase'), 0.8);
  const none = simulate({ clock: false, hello: false, message: false }, 1000);
  assert.strictEqual(none.counts.phrase, 1000);
});

t('연속 금지: 시계·날씨·내 메시지는 같은 종류가 이어지지 않는다(기본 문구는 종류로는 이어질 수 있다)', () => {
  const s = simulate({ clock: true, hello: true, message: true }, 100000, 31);
  for (let i = 1; i < s.seq.length; i++) if (s.seq[i] !== 'phrase') assert.notStrictEqual(s.seq[i], s.seq[i - 1], `연속 ${i}`);
  assert.ok(s.seq.some((k, i) => i && k === 'phrase' && s.seq[i - 1] === 'phrase'), '기본 문구는 종류가 이어지는 경우가 있다(몫이 절반 가까이라서)');
  // 직전이 특정 종류면 그 종류는 바로 다음에 나오지 않는다
  for (const k of ['clock', 'hello', 'message']) { const rand = lcg(5); for (let i = 0; i < 5000; i++) assert.notStrictEqual(R.pickRollKind({ clock: true, hello: true, message: true }, k, rand), k); }
});

t('같은 난수 열이어도 결정적이고, 난수가 어떤 값이어도 항상 유효한 종류를 돌려준다', () => {
  for (const r of [0, 0.0001, 0.2499, 0.25, 0.5, 0.74999, 0.75, 0.9999, 1 - 1e-12]) { const k = R.pickRollKind({ clock: true, hello: true, message: true }, null, () => r); assert.ok(['phrase', 'clock', 'hello', 'message'].includes(k)); }
  assert.strictEqual(R.pickRollKind({ clock: true, hello: true, message: true }, null, () => 0.999), 'phrase');
});

t('셔플 백: 한 바퀴를 다 돌 때까지 같은 문구를 반복하지 않고, 바퀴가 바뀌어도 직전 문구가 바로 이어지지 않는다', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']; const bag = R.createShuffleBag(lcg(11));
  let prev = null;
  for (let round = 0; round < 300; round++) {
    const seen = new Set();
    for (let i = 0; i < items.length; i++) { const x = bag.next(items); assert.ok(!seen.has(x), `라운드 ${round} 안에서 반복 ${x}`); seen.add(x); if (prev !== null) assert.notStrictEqual(x, prev, '바로 이어서 같은 문구'); prev = x; }
    assert.strictEqual(seen.size, items.length, '한 바퀴에 전부 한 번씩');
  }
});

t('셔플 백: 문구가 하나뿐이면 그 문구를 계속 낸다, 비어 있으면 null, 중간에 목록이 바뀌어도 이미 낸 문구는 건너뛴다', () => {
  const one = R.createShuffleBag(Math.random); assert.strictEqual(one.next(['x']), 'x'); assert.strictEqual(one.next(['x']), 'x'); assert.strictEqual(one.next([]), null);
  const bag = R.createShuffleBag(lcg(3)); const a = bag.next(['p', 'q', 'r']);
  const b = bag.next(['p', 'q', 'r', 's']); assert.notStrictEqual(b, a);   // 새 문구 's'가 생겨도 한 바퀴 안에서 이미 낸 것은 다시 나오지 않는다
  const seen = new Set([a, b]); for (let i = 0; i < 2; i++) seen.add(bag.next(['p', 'q', 'r', 's'])); assert.strictEqual(seen.size, 4);
  const dup = R.createShuffleBag(lcg(4)); const s = new Set(); for (let i = 0; i < 3; i++) s.add(dup.next(['k', 'k', 'l', 'm'])); assert.strictEqual(s.size, 3, '목록에 같은 문구가 겹쳐 있어도 한 번씩');
});

t('실제 문구 풀로 수천 번 뽑아도 한 바퀴 안에서 반복이 없다(시간대별)', () => {
  for (const cat of ['morning', 'afternoon', 'preLeave', 'leave', 'evening', 'work']) {
    const pool = P.newPhrasesFor(cat); const bag = R.createShuffleBag(lcg(21)); const n = new Set(pool).size;
    for (let round = 0; round < 50; round++) { const seen = new Set(); for (let i = 0; i < n; i++) { const x = bag.next(pool); assert.ok(!seen.has(x)); seen.add(x); } }
  }
});

t('새 기본 문구: 30개 이상, 서로 중복 없음, 기존 문구(동물 말투·시간대·특별한 날)와 겹치지 않음, 한 줄 길이, 깨짐 없음, 이모지 없이 해요체', () => {
  const all = P.ALL_NEW_PHRASES; assert.ok(all.length >= 30, `${all.length}개`);
  assert.strictEqual(new Set(all).size, all.length, '새 문구끼리 중복');
  const strings = (src) => [...src.matchAll(/'([^'\n]{2,})'/g)].map(m => m[1]);
  const pet = read('src/pages/PetPage.tsx'), animals = read('src/data/animals.ts');
  const legacy = new Set([...strings(pet.slice(pet.indexOf('const TIME_MESSAGES'), pet.indexOf('const CUSTOM_REACTIONS'))), ...strings(pet.slice(pet.indexOf('function getSpecialMessages'), pet.indexOf('const CLICK_PARTICLES'))), ...strings(animals)]);
  assert.ok(legacy.size > 40, `기존 문구를 읽었다 ${legacy.size}`);
  for (const p of all) assert.ok(!legacy.has(p), `기존 문구와 겹침: ${p}`);
  for (const p of all) {
    assert.ok(!p.includes(FFFD) && !/\?{3}/.test(p), `깨짐 ${p}`);
    assert.ok(Array.from(p).length <= 24, `너무 길다(${Array.from(p).length}자): ${p}`);
    assert.ok(/[가-힣]/.test(p) && !/[\u{1F000}-\u{1FFFF}☀-➿]/u.test(p), `이모지 없는 한글 문구: ${p}`);
    assert.ok(/(요|죠|까요|세요|봐요|해요|예요|이에요|어요|아요|어때요)$/.test(p.replace(/[.!?,]+$/, '')), `해요체로 끝나야 함: ${p}`);
    assert.ok(!/(불안|걱정|위험|큰일|반드시|무조건|틀림없|건강에|아플|병)/.test(p), `불안·단정·건강 표현: ${p}`);
  }
  for (const k of Object.keys(P.PHRASES_BY_TIME)) assert.ok(P.PHRASES_BY_TIME[k].length >= 5, `${k} 시간대 문구`);
  assert.ok(read('src/data/bubblePhrases.ts').length > 0 && !read('src/data/bubblePhrases.ts').includes(FFFD));
});

t('엔진 연결(정적): 종류는 차례마다 한 번, 알림·토스트·초집중·말풍선 끔에서는 뽑지 않음, 시계는 시계 차례에만, 표시 시간·간격은 기존 설정 그대로', () => {
  const pet = read('src/pages/PetPage.tsx'); const eng = pet.slice(pet.indexOf('★ 말풍선 엔진'), pet.indexOf('// ★ 졸림방지'));
  assert.ok(/const active = !paused && cur\.bubbleEnabled !== false && !focusRef\.current\.enabled/.test(eng));
  assert.ok(/if \(nowSlot !== slot\) \{ slot = nowSlot; picked = false; \}/.test(eng) && /if \(active && !picked\)/.test(eng));
  assert.ok(/pickRollKind\(\{ clock: cur\.bubbleClock !== false, hello: cands\.length > 0, message: msgs\.length > 0 \}, lastRoll\)/.test(eng));
  assert.ok(/phraseBag\.next\(getPhrasePool\(\)\)/.test(eng) && /createShuffleBag\(\)/.test(eng));
  assert.ok(/if \(slotKind === 'clock'\)/.test(eng) && !/else if \(cur\.bubbleClock !== false\)/.test(eng), '시계는 시계 차례에만');
  assert.ok(/const inShow = show >= gap \|\| elapsed % gap < show/.test(eng) && /elapsed % gap/.test(eng) && /BUBBLE_SHOW_RANGE/.test(eng) && /BUBBLE_GAP_RANGE/.test(eng), '표시 시간·간격 계산은 그대로');
  assert.ok(/const dt = Math\.min\(now - last, 1500\)/.test(eng) && /setInterval\(tick, 250\)/.test(eng));
  assert.ok(/getPhrasePool = useCallback/.test(pet) && /\.\.\.newPhrasesFor\(cat\)/.test(pet), '기존 문구 + 새 문구');
  assert.ok(/getLegacyNag = useCallback/.test(pet), '졸림 방지 말풍선의 기존 문구 경로는 그대로');
});

(async () => { let fail = 0; for (const [name, fn] of queue) { try { await fn(); console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } } if (fail) { console.log(`\n${fail}개 실패`); process.exit(1); } console.log(`\n${queue.length}개 통과`); })();
