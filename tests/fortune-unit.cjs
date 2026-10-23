// 오늘의 한마디·운세·하루 진행 단위 테스트: 같은 날짜는 같은 결과, 문구 중복·깨짐 없음, 설정 기본값/호환, 진행 바 계산(야간 근무 포함), 연결(정적 확인).
// `node tests/fortune-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const load = (rel, deps = {}) => {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, (p) => deps[p] || ({ seedFreshTheme() {} }), { getItem: () => null, setItem() {} }, { location: { hash: '' } }); return m.exports;
};
const FFFD = String.fromCharCode(0xFFFD);   // 깨진 글자(대체 문자). 소스에 문자 그대로 쓰지 않는다
const D = load('src/data/fortune.ts');
const ZT = load('src/data/zodiacText.ts');
const Z = load('src/utils/zodiac.ts', { '../data/zodiacText': ZT });
const F = load('src/utils/fortune.ts', { '../data/fortune': D, '../data/zodiacText': ZT, './zodiac': Z });
const P = load('src/utils/dayProgress.ts');
const S = load('src/utils/settings.ts');
const day = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi, 30);
const v = D.voiceFor();

t('문구 개수: 한마디 150+, 총운 40, 업무·금전·인간관계 각 25, 색 20, 간식 20', () => {
  assert.ok(v.phrases.length >= 150, `한마디 ${v.phrases.length}`);
  assert.ok(v.total.length >= 40, `총운 ${v.total.length}`);
  for (const k of ['work', 'money', 'people']) assert.ok(v[k].length >= 25, k);
  assert.ok(v.colors.length >= 20); assert.ok(v.snacks.length >= 20);
});
t('문구 품질: 비어 있지 않고, 중복 없고, U+FFFD·물음표 깨짐 없음, 길이가 말풍선에 들어간다', () => {
  for (const k of ['phrases', 'total', 'work', 'money', 'people', 'colors', 'snacks', 'footers']) {
    const list = v[k];
    assert.strictEqual(new Set(list).size, list.length, `${k} 중복`);
    for (const s of list) {
      assert.ok(typeof s === 'string' && s.trim() === s && s.length > 0, `${k} 빈/공백: "${s}"`);
      assert.ok(!s.includes(FFFD) &&!/\?\?|\?$/.test(s), `${k} 깨짐: ${s}`);
    }
  }
  for (const s of v.phrases) assert.ok(Array.from(s).length <= 22, `한마디 길이 ${Array.from(s).length}: ${s}`);
  for (const k of ['total', 'work', 'money', 'people']) for (const s of v[k]) assert.ok(Array.from(s).length <= 24, `${k} 길이: ${s}`);
});
t('금지 표현: 불안·단정·의학·금융 조언 단어가 없다', () => {
  const bad = ['반드시', '무조건', '절대', '확실히', '병원', '약을', '치료', '진단', '투자', '주식', '대출', '코인', '저축', '재앙', '불행', '조심하지 않으면', '큰일'];
  const all = [...v.phrases, ...v.total, ...v.work, ...v.money, ...v.people, ...v.footers];
  for (const s of all) for (const b of bad) assert.ok(!s.includes(b), `"${b}" in ${s}`);
});
t('한마디: 목록에서 무작위로 고르되 직전 문구와 같은 문구는 연속으로 나오지 않는다(수천 번 시뮬레이션), 난수가 같은 값이어도 직전 문구는 피한다', () => {
  let prev = null; const distinct = new Set();
  for (let i = 0; i < 5000; i++) {
    const cur = F.randomPhrase(prev); assert.ok(v.phrases.includes(cur)); assert.notStrictEqual(cur, prev, `연속 중복 i=${i}`); prev = cur; distinct.add(cur);
  }
  assert.ok(distinct.size > 140, `다양성 ${distinct.size}`);
  const first = F.randomPhrase(null, () => 0); assert.notStrictEqual(F.randomPhrase(first, () => 0), first, '같은 난수여도 직전 문구는 피한다');
  assert.ok(first === v.phrases[0]);
});
t('운세: 같은 날짜는 몇 번을 불러도 같은 결과(시각이 달라도)', () => {
  const a = F.fortuneFor(day(2026, 10, 23, 0, 1)), b = F.fortuneFor(day(2026, 10, 23, 23, 59));
  assert.deepStrictEqual(a, b);
  for (let i = 0; i < 20; i++) assert.deepStrictEqual(F.fortuneFor(day(2026, 10, 23, 9, i)), a);
});
t('운세 구성: 총운 + 업무/금전/인간관계 중 하나 + 행운(색·숫자·간식) + 마지막 "재미로" 줄, 문구는 목록에서 나온다', () => {
  for (let i = 0; i < 60; i++) {
    const f = F.fortuneFor(day(2026, 11, 1 + i % 28, 9, i)), [total, topic, lucky, footer] = f.pages;
    assert.strictEqual(f.pages.length, 4); assert.ok(v.total.includes(total));
    const m = /^(업무운|금전운|인간관계운) · (.+)$/.exec(topic); assert.ok(m, topic);
    assert.ok(v[{ 업무운: 'work', 금전운: 'money', 인간관계운: 'people' }[m[1]]].includes(m[2]));
    assert.ok(/^행운의 색 \S+ · 숫자 \d+ · 간식 \S+$/.test(lucky), 'NBSP로 항목이 안 끊긴다: ' + lucky);
    const l = /^행운의 색 (.+) · 숫자 (\d+) · 간식 (.+)$/.exec(lucky.replace(/ /g, ' ')); assert.ok(l, lucky);
    assert.ok(v.colors.includes(l[1]) && v.snacks.includes(l[3])); assert.ok(+l[2] >= 1 && +l[2] <= 99);
    assert.ok(v.footers.includes(footer) && /재미|심심풀이/.test(footer));
    for (const p of f.pages) assert.ok(Array.from(p).length <= 36, `한 줄 길이: ${p}`);
  }
});
t('운세: 날짜가 바뀌면 (대부분) 달라진다 — 365일 중 같은 결과가 이웃 날짜에 연속되지 않고 서로 다른 조합이 대부분', () => {
  const seen = new Set(); let same = 0;
  for (let i = 0; i < 365; i++) {
    const a = F.fortuneFor(new Date(2026, 0, 1 + i, 12)), b = F.fortuneFor(new Date(2026, 0, 2 + i, 12));
    if (JSON.stringify(a.pages) === JSON.stringify(b.pages)) same++;
    seen.add(a.pages.join('|'));
  }
  assert.strictEqual(same, 0); assert.ok(seen.size > 350, `서로 다른 조합 ${seen.size}`);
});
t('말투 구조: 알 수 없는 말투 id도 기본 말투로 동작', () => {
  assert.strictEqual(D.voiceFor('없는펫'), D.voiceFor()); assert.strictEqual(D.voiceFor(undefined).id, 'default');
  assert.deepStrictEqual(F.fortuneFor(day(2026, 10, 23), 'x'), F.fortuneFor(day(2026, 10, 23)));
});
t('날짜 키는 로컬 날짜(자정 직전/직후에 바뀐다)', () => {
  assert.strictEqual(F.dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05'); assert.strictEqual(F.dateKey(new Date(2026, 0, 6, 0, 0)), '2026-01-06');
});

// ── 설정 기본값·호환 ────────────────────────────────────────────────────────
t('설정 기본값: bubbleClock 켜짐(예전과 동일), 뺀 종류 없음, 생일 비어 있음, 이전 베타의 bubbleIdle 키는 없다', () => {
  const d = S.DEFAULT_SETTINGS;
  assert.strictEqual(d.bubbleClock, true); assert.deepStrictEqual(d.bubbleOffKinds, []); assert.strictEqual(d.fortuneBirth, ''); assert.ok(!('bubbleIdle' in d));
  assert.deepStrictEqual(S.cleanOffKinds(['fortune', 'xx', 'fortune', 'clock', 3]), ['clock', 'fortune']); assert.deepStrictEqual(S.cleanOffKinds(undefined), []); assert.deepStrictEqual(S.cleanOffKinds('fortune'), []);
});
t('예전 저장 설정(새 키 없음)은 마이그레이션이 건드리지 않고, 읽으면 기본값으로 채워진다', () => {
  const old = { bubbleEnabled: true, bubbleClock: true, bubbleMessages: ['a'] };
  const r = S.migrateSettings(old); for (const k of ['bubbleOffKinds', 'fortuneBirth', 'weatherEnabled']) assert.ok(!(k in r.settings), k);
  const merged = { ...S.DEFAULT_SETTINGS, ...r.settings }; assert.strictEqual(merged.bubbleClock, true); assert.deepStrictEqual(merged.bubbleOffKinds, []);
});

// ── 하루 진행 ───────────────────────────────────────────────────────────────
const at = (h, m) => new Date(2026, 9, 23, h, m, 45);
t('진행 바: 출근 전/근무 중/퇴근 후 문구와 비율', () => {
  assert.deepStrictEqual(P.dayProgress(at(8, 30), '09:00', '12:00', '18:00'), { phase: 'before', ratio: 0, label: '출근까지 30분', lunchRatio: 1 / 3 });
  const mid = P.dayProgress(at(13, 30), '09:00', '12:00', '18:00'); assert.strictEqual(mid.phase, 'working'); assert.strictEqual(mid.ratio, 0.5); assert.strictEqual(mid.label, '퇴근까지 4시간 30분');
  assert.strictEqual(P.dayProgress(at(15, 46), '09:00', '12:00', '18:00').label, '퇴근까지 2시간 14분');
  assert.strictEqual(P.dayProgress(at(17, 59), '09:00', '12:00', '18:00').label, '퇴근까지 1분');
  assert.strictEqual(P.dayProgress(at(9, 0), '09:00', '12:00', '18:00').ratio, 0);
  const end = P.dayProgress(at(18, 0), '09:00', '12:00', '18:00'); assert.deepStrictEqual([end.phase, end.ratio, end.label], ['after', 1, '오늘도 수고했어요']);
  assert.strictEqual(P.dayProgress(at(23, 0), '09:00', '12:00', '18:00').phase, 'after');
  assert.strictEqual(P.dayProgress(at(8, 0), '09:00', '12:00', '18:00').label, '출근까지 1시간');
});
t('진행 바: 점심 눈금은 근무 시간 안에서만, 위치는 비율', () => {
  assert.strictEqual(P.dayProgress(at(10, 0), '09:00', '13:30', '18:00').lunchRatio, 0.5);
  assert.strictEqual(P.dayProgress(at(10, 0), '09:00', '08:00', '18:00').lunchRatio, null);
  assert.strictEqual(P.dayProgress(at(10, 0), '09:00', '19:00', '18:00').lunchRatio, null);
});
t('진행 바: 야간 근무(22:00→06:00)와 자정 넘김, 퇴근=출근, 이상한 값도 깨지지 않는다', () => {
  const n1 = P.dayProgress(at(23, 0), '22:00', '02:00', '06:00'); assert.strictEqual(n1.phase, 'working'); assert.strictEqual(n1.label, '퇴근까지 7시간'); assert.strictEqual(n1.ratio, 1 / 8);
  const n2 = P.dayProgress(at(1, 0), '22:00', '02:00', '06:00'); assert.strictEqual(n2.phase, 'working'); assert.strictEqual(n2.label, '퇴근까지 5시간'); assert.strictEqual(n2.ratio, 3 / 8);
  assert.strictEqual(P.dayProgress(at(2, 0), '22:00', '02:00', '06:00').lunchRatio, 0.5);
  assert.strictEqual(P.dayProgress(at(6, 0), '22:00', '02:00', '06:00').phase, 'before');
  assert.strictEqual(P.dayProgress(at(12, 0), '22:00', '02:00', '06:00').label, '출근까지 10시간');
  for (const [s, l, e] of [['09:00', '12:00', '09:00'], ['', '', ''], ['xx', '99:99', '25:00'], [undefined, undefined, undefined]]) {
    for (let h = 0; h < 24; h++) { const p = P.dayProgress(at(h, 7), s, l, e); assert.ok(p.ratio >= 0 && p.ratio <= 1 && p.label.length > 0 && !p.label.includes('NaN'), `${s}/${e} ${h}`); }
  }
});
t('진행 바: 하루 전체를 돌려도 비율이 0~1이고 근무 중에는 단조 증가', () => {
  let prev = -1;
  for (let m = 9 * 60; m < 18 * 60; m++) { const p = P.dayProgress(at(Math.floor(m / 60), m % 60), '09:00', '12:00', '18:00'); assert.strictEqual(p.phase, 'working'); assert.ok(p.ratio > prev); prev = p.ratio; }
});

// ── 연결(정적 확인) ─────────────────────────────────────────────────────────
t('설정 화면은 v1.4.1 그대로: 홈 칩 8개, 말풍선 팝오버에 "메시지가 없는 동안" 선택·날씨 버튼·표기가 없다', () => {
  const src = read('src/components/settings/HomePane.tsx');
  assert.strictEqual((src.match(/^ {6}id: '/gm) || []).length, 8, '칩 8개');
  for (const w of ['메시지가 없는 동안 보여줄 것', 'bubbleIdle', 'st-idle', 'WeatherModal', 'WeatherSettings', 'onOpenWeather', 'Open-Meteo', 'fortuneBirth', '섞어서']) assert.ok(!src.includes(w), `HomePane에 ${w} 없음`);
  assert.ok(src.includes('말풍선 사용') && src.includes('시계 표시') && src.includes('메시지 편집') && src.includes('표시 시간') && src.includes('간격') && src.includes('고급'));
});
t('버디 클릭: 더블클릭이 말 걸기를 열고, 한 번 클릭은 운세 → 날씨 줄 넘김 → 평소 반응 순서', () => {
  const src = read('src/pages/PetPage.tsx');
  const click = src.slice(src.indexOf('const handleCatClick'));
  assert.ok(click.indexOf('focusRef.current.enabled') < click.indexOf('openTalk'), '초집중 → 더블클릭 순서');
  assert.ok(click.indexOf("idleBubble?.kind === 'fortune'") < click.indexOf("idleBubble?.kind === 'weather'") && click.indexOf("idleBubble?.kind === 'weather'") < click.indexOf('showBubble(rand(reactions)'));
  assert.ok(/fortunePageRef\.current \+= 1/.test(click));
});
t('초집중 모드: 시계는 버디 위, 진행 바(compact)는 버디 바로 아래, 1분 갱신·애니메이션 없음, 창 아래 안쪽 여유', () => {
  const pet = read('src/pages/PetPage.tsx'), bar = read('src/components/DayProgressBar.tsx'), css = read('src/styles/pet.css');
  const iClock = pet.indexOf('<FocusClock'), iCat = pet.indexOf('<div className="cat-wrapper">'), iBar = pet.indexOf('<DayProgressBar compact');
  assert.ok(iClock > 0 && iClock < iCat && iCat < iBar, '시계 → 버디 → 진행 바');
  assert.ok(/\.pet-root\[data-focus\] \{[^}]*padding-bottom: 16px/.test(css), '창 아래 여유');
  assert.ok(/focus\.enabled && !alertActive && <DayProgressBar compact/.test(pet));
  assert.ok(/60000 - \(d\.getSeconds\(\)/.test(bar));
  const block = css.slice(css.indexOf('.day-progress {'));
  assert.ok(!/transition|animation/.test(block.split('/*')[0] + block.slice(0, block.length)), '진행 바 CSS에 transition/animation 없음');
});
t('네트워크 호출 없음: 운세·한마디 코드에 fetch/http/WebSocket이 없다', () => {
  for (const f of ['src/data/fortune.ts', 'src/utils/fortune.ts', 'src/utils/dayProgress.ts', 'src/components/DayProgressBar.tsx']) assert.ok(!/fetch\(|https?:|XMLHttpRequest|WebSocket|axios/.test(read(f)), f);
});
t('소스 파일에 U+FFFD 없음', () => {
  for (const f of ['src/data/fortune.ts', 'src/utils/fortune.ts', 'src/utils/dayProgress.ts', 'src/components/DayProgressBar.tsx', 'src/components/settings/HomePane.tsx', 'src/pages/PetPage.tsx']) assert.ok(!read(f).includes(FFFD), f);
});

console.log(`\n${n} tests passed`);
