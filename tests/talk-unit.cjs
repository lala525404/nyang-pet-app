// "펫에게 말 걸기" 단위 테스트: 입력 해석(단어 규칙), 동의 흐름, 지우기, 빈 시간 말풍선 자동 섞기 시뮬레이션, 별자리·띠·생일, 동네 검색(읍·면·동·별칭), 연결(정적 확인).
// `node tests/talk-unit.cjs` (npm test에 포함). 외부 호출이 없으므로 네트워크가 필요 없다.
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const queue = []; const t = (name, fn) => queue.push([name, fn]);
const mem = () => { const s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; };
const load = (rel, deps = {}, storage = mem()) => {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, (p) => { if (p in deps) return deps[p]; throw new Error('모르는 import ' + p); }, storage, { location: { hash: '' } }); return m.exports;
};
const FFFD = String.fromCharCode(0xFFFD);
const W = require('../weather.cjs');
const cities = load('src/data/cities.ts');
const aliases = load('src/data/placeAliases.ts');
const placesJson = JSON.parse(read('src/data/places.json'));
const search = load('src/utils/citySearch.ts', { '../data/cities': cities, '../data/places.json': { default: placesJson }, '../data/placeAliases': aliases });
const zt = load('src/data/zodiacText.ts');
const Z = load('src/utils/zodiac.ts', { '../data/zodiacText': zt });
const settingsTs = load('src/utils/settings.ts', { './theme': { seedFreshTheme() {} } });
const fortuneData = load('src/data/fortune.ts');
const F = load('src/utils/fortune.ts', { '../data/fortune': fortuneData, '../data/zodiacText': zt, './zodiac': Z });
const talk = load('src/utils/talk.ts', { './citySearch': search, './zodiac': Z, './settings': settingsTs, '../data/cities': cities });
const mix = load('src/utils/bubbleMix.ts', { './settings': settingsTs });
const ts2 = (storage) => load('src/utils/talkState.ts', {}, storage);
const TODAY = new Date(2026, 9, 23, 12, 0, 0);
const ctx = (o = {}) => ({ weatherEnabled: false, weatherConsent: false, weatherCityId: '', fortuneBirth: '', offKinds: [], today: TODAY, ...o });
const ON = { weatherEnabled: true, weatherConsent: true, weatherCityId: 'gg:의정부시' };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

// ── 1. 입력 해석 ────────────────────────────────────────────────────────────
const P = (s) => talk.parseTalk(s, TODAY);
t('입력 해석 24종: 날씨·운세·한마디 / 동네 / 생일 / 끄기·빼기·다시 넣기 / 지우기 / 모르는 말', () => {
  assert.deepStrictEqual(P('오늘 날씨 어때?'), { type: 'show', what: 'weather' });
  assert.deepStrictEqual(P('내일 날씨 알려줘'), { type: 'show', what: 'weather' });
  assert.deepStrictEqual(P('운세 봐줘'), { type: 'show', what: 'fortune' });
  assert.deepStrictEqual(P('오늘의 운세'), { type: 'show', what: 'fortune' });
  assert.deepStrictEqual(P('한마디 해줘'), { type: 'show', what: 'phrase' });
  assert.deepStrictEqual(P('힘나는 말 해줘'), { type: 'show', what: 'phrase' });
  assert.deepStrictEqual(P('의정부로 바꿔줘'), { type: 'city', query: '의정부', thenWeather: false });
  assert.deepStrictEqual(P('노량진으로 바꿔줘'), { type: 'city', query: '노량진', thenWeather: false });
  assert.deepStrictEqual(P('의정부 날씨'), { type: 'city', query: '의정부', thenWeather: true });
  assert.deepStrictEqual(P('내 동네는 홍대야'), { type: 'city', query: '홍대', thenWeather: true });
  assert.deepStrictEqual(P('동네 바꿔줘'), { type: 'city', query: '', thenWeather: false });
  assert.deepStrictEqual(P('날씨 꺼줘'), { type: 'weatherOff' });
  assert.deepStrictEqual(P('날씨 그만 보여줘'), { type: 'weatherOff' });
  assert.deepStrictEqual(P('날씨 빼줘'), { type: 'off', what: 'weather' });
  assert.deepStrictEqual(P('운세 그만 보여줘'), { type: 'off', what: 'fortune' });
  assert.deepStrictEqual(P('한마디 빼줘'), { type: 'off', what: 'phrase' });
  assert.deepStrictEqual(P('시계 빼줘'), { type: 'off', what: 'clock' });
  assert.deepStrictEqual(P('하루 진행 빼줘'), { type: 'off', what: 'progress' });
  assert.deepStrictEqual(P('날씨 다시 넣어줘'), { type: 'on', what: 'weather' });
  assert.deepStrictEqual(P('운세 다시 켜줘'), { type: 'on', what: 'fortune' });
  assert.deepStrictEqual(P('생일 지워줘'), { type: 'clearBirth' });
  assert.deepStrictEqual(P('내 정보 지워줘'), { type: 'clearAll' });
  assert.deepStrictEqual(P('기억한 것 지워줘'), { type: 'clearAll' });
  assert.deepStrictEqual(P('생일 알려줄게'), { type: 'askBirth' });
  for (const s of ['', '   ', 'asdf', '배고파', '?!?']) assert.deepStrictEqual(P(s), { type: 'unknown' }, s);
});
t('생일 문장: 5월 25일 / 1990-05-25 / 0525 / 19900525 / 1990.5.25 / 5/25, 잘못된 날짜는 실패', () => {
  const b = (s) => { const r = talk.parseBirthText(s, TODAY); return r && r.ok ? [r.birth.year, r.birth.month, r.birth.day] : r; };
  assert.deepStrictEqual(b('내 생일은 5월 25일'), [null, 5, 25]); assert.deepStrictEqual(b('1990-05-25'), [1990, 5, 25]); assert.deepStrictEqual(b('0525'), [null, 5, 25]);
  assert.deepStrictEqual(b('19900525'), [1990, 5, 25]); assert.deepStrictEqual(b('1990.5.25'), [1990, 5, 25]); assert.deepStrictEqual(b('1990년 5월 25일'), [1990, 5, 25]); assert.deepStrictEqual(b('5/25'), [null, 5, 25]);
  assert.deepStrictEqual(b('내 생일은 1990년 5월 25일이야'), [1990, 5, 25]);
  for (const bad of ['2월 30일', '13월 1일', '1990-02-30', '0431', '1800-01-01', '2999-01-01', '2023-02-29', '0000']) assert.deepStrictEqual(talk.parseBirthText(bad, TODAY), { ok: false }, bad);
  assert.strictEqual(talk.parseBirthText('안녕', TODAY), null);
  assert.deepStrictEqual(P('내 생일은 5월 25일'), { type: 'birth', result: { ok: true, birth: { year: null, month: 5, day: 25 } } });
  assert.deepStrictEqual(P('내 생일은 2월 30일').result, { ok: false });
  assert.strictEqual(P('0525').type, 'birth'); assert.strictEqual(P('19900525').type, 'birth');
});

// ── 2. 흐름: 동의·동네·꺼짐·지우기 ───────────────────────────────────────────
t('동의 전에는 날씨를 물어도 동의 대화부터(저장·요청 없음), [괜찮아요] 뒤에야 켜짐·동의 저장', () => {
  const c0 = ctx();
  assert.deepStrictEqual(talk.interpret('오늘 날씨 어때', c0), { type: 'consent' });
  assert.ok(talk.CONSENT_TEXT.includes('좌표가 날씨 서비스(Open-Meteo)로 전송돼요') && talk.CONSENT_TEXT.includes('괜찮아요?'));
  assert.ok(talk.CONSENT_DETAIL.includes('이름·사진·알람 같은 개인 정보는 보내지 않아요'));
  const s1 = talk.interpret('의정부로 바꿔줘', c0); assert.deepStrictEqual(s1, { type: 'consent', pendingCityId: 'gg:의정부시' });   // 동의가 없으면 도시만 정해도 동의부터
  assert.deepStrictEqual(talk.CONSENT_PATCH, { weatherConsent: true, weatherEnabled: true });
  const s2 = talk.afterConsent('gg:의정부시', c0); assert.strictEqual(s2.type, 'say'); assert.deepStrictEqual(s2.patch, { weatherConsent: true, weatherEnabled: true, weatherCityId: 'gg:의정부시' }); assert.strictEqual(s2.then, 'weather'); assert.strictEqual(s2.text, '의정부시군요! 날씨 알려드릴게요');
  const s3 = talk.afterConsent(undefined, c0); assert.strictEqual(s3.type, 'ask'); assert.strictEqual(s3.ask, 'city'); assert.strictEqual(s3.text, '어느 동네에 있어요?');
  assert.strictEqual(talk.interpret('날씨', ctx({ weatherConsent: true, weatherEnabled: true })).type, 'ask');   // 동의는 했는데 동네가 없으면 동네부터
  assert.deepStrictEqual(talk.interpret('날씨', ctx(ON)), { type: 'show', what: 'weather' });
});
t('동의 후 네트워크: 동의 전 0건 → 동의 뒤에만 요청(서비스 게이트와 대화 흐름을 이어서 시뮬레이션)', async () => {
  let calls = 0; const svc = W.createWeatherService({ fetch: async () => { calls++; return { ok: true, json: async () => ({ current: { temperature_2m: 10, weather_code: 0 }, daily: { temperature_2m_max: [12], temperature_2m_min: [3] } }) }; } });
  let cur = ctx(); const city = cities.cityById('sl:동작구');
  for (let i = 0; i < 3; i++) { talk.interpret('노량진 날씨', cur); await svc.get(city.lat, city.lon); }
  assert.strictEqual(calls, 0, '동의 전 요청 0건');
  const step = talk.afterConsent('sl:동작구', cur); cur = { ...cur, ...step.patch }; svc.setConsent(cur.weatherEnabled && cur.weatherConsent);
  await svc.get(city.lat, city.lon); assert.strictEqual(calls, 1);
  const off = talk.interpret('날씨 꺼줘', cur); assert.strictEqual(off.type, 'confirm'); cur = { ...cur, ...off.yes }; svc.setConsent(cur.weatherEnabled && cur.weatherConsent);
  await svc.get(city.lat, city.lon); assert.strictEqual(calls, 1, '끄면 요청 없음(캐시가 있어도 동의가 없으면 null)');
});
t('동의 대화 구성: [괜찮아요] [싫어요] [자세히](접이식)이고, [괜찮아요] 경로에서만 동의가 저장된다(정적 확인)', () => {
  const tk = read('src/components/PetTalk.tsx'), tt = read('src/utils/talk.ts');
  for (const w of ['괜찮아요', '싫어요', '자세히', 'CONSENT_DETAIL', 'aria-expanded={detail}']) assert.ok(tk.includes(w), w);
  const ans = tk.slice(tk.indexOf('const answerConsent'), tk.indexOf('const memory'));
  assert.ok(ans.indexOf('if (!yes)') < ans.indexOf('apply(CONSENT_PATCH)'), '싫어요는 저장 없이 끝');
  assert.strictEqual((tk.match(/CONSENT_PATCH/g) || []).length, 2, 'PetTalk에서 동의를 저장하는 곳은 [괜찮아요] 하나');
  const applyCityBody = tt.slice(tt.indexOf('export function applyCity'), tt.indexOf('// 동의 대화에서'));
  assert.ok(!/weatherConsent: true/.test(applyCityBody), 'applyCity는 동의를 저장하지 않는다(동의가 없으면 동의 대화로)');
});
t('날씨 끄기·지우기: 날씨 꺼줘는 확인 한 번 뒤 끄고 동네 삭제, 이미 꺼져 있으면 알림만, 생일 지우기·내 정보 지우기(동의 철회까지)', () => {
  const off = talk.interpret('날씨 꺼줘', ctx(ON)); assert.strictEqual(off.type, 'confirm'); assert.deepStrictEqual(off.yes, { weatherEnabled: false, weatherCityId: '' });
  assert.deepStrictEqual(talk.interpret('날씨 꺼줘', ctx()), { type: 'say', text: '날씨는 이미 꺼져 있어요' });
  assert.deepStrictEqual(talk.interpret('생일 지워줘', ctx({ fortuneBirth: '1990-05-25' })).patch, { fortuneBirth: '' });
  assert.strictEqual(talk.interpret('생일 지워줘', ctx()).text, '저장된 생일이 없어요');
  const all = talk.interpret('내 정보 지워줘', ctx({ ...ON, fortuneBirth: '05-25' })); assert.strictEqual(all.type, 'confirm');
  assert.deepStrictEqual(all.yes, { weatherEnabled: false, weatherConsent: false, weatherCityId: '', fortuneBirth: '' }, '동네·생일 삭제 + 날씨 동의 철회');
  assert.ok(!('bubbleOffKinds' in all.yes), '빼 둔 종류는 개인정보가 아니라 그대로');
  const again = talk.interpret('날씨 다시 넣어줘', ctx({ weatherConsent: true, weatherEnabled: false, weatherCityId: 'gg:의정부시' })); assert.deepStrictEqual(again.patch, { weatherEnabled: true });
});
t('기억한 것 한 줄: 동네 이름만 보이고 생일 날짜는 보이지 않는다', () => {
  const line = talk.memoryLine(ctx({ weatherCityId: 'sl:동작구', fortuneBirth: '1990-05-25' }));
  assert.strictEqual(line, '기억한 것: 동네 동작구 · 생일 입력함'); for (const x of ['1990', '05-25', '5월', '25일']) assert.ok(!line.includes(x), x);
  assert.strictEqual(talk.memoryLine(ctx()), '기억한 것: 동네 없음 · 생일 없음');
});
t('빼기·다시 넣기: bubbleOffKinds에 담고 빼며, 중복·이미 빠진 경우를 알려 준다', () => {
  const s = talk.interpret('운세 빼줘', ctx()); assert.deepStrictEqual(s.patch, { bubbleOffKinds: ['fortune'] });
  const s2 = talk.interpret('한마디 빼줘', ctx({ offKinds: ['fortune'] })); assert.deepStrictEqual(s2.patch, { bubbleOffKinds: ['phrase', 'fortune'] });
  assert.ok(talk.interpret('운세 빼줘', ctx({ offKinds: ['fortune'] })).text.includes('이미 빼 두었어요'));
  assert.deepStrictEqual(talk.interpret('운세 다시 넣어줘', ctx({ offKinds: ['fortune', 'phrase'] })).patch, { bubbleOffKinds: ['phrase'] });
  assert.ok(talk.interpret('운세 다시 넣어줘', ctx()).text.includes('원래 나오고 있어요'));
});
t('못 알아들으면 안내 문구, 생일 입력이 틀리면 "다시 알려줄래요?"', () => {
  assert.deepStrictEqual(talk.interpret('배고파', ctx()), { type: 'say', text: '그건 아직 잘 몰라요. 날씨, 운세, 한마디는 알려줄 수 있어요' });
  const bad = talk.interpret('내 생일은 2월 30일', ctx()); assert.strictEqual(bad.type, 'ask'); assert.ok(bad.text.startsWith('다시 알려줄래요?'));
  const ok = talk.interpret('내 생일은 1990-05-25', ctx()); assert.deepStrictEqual(ok.patch, { fortuneBirth: '1990-05-25' }); assert.strictEqual(ok.text, '쌍둥이자리에 말띠네요! 오늘 운세 볼까요?'); assert.strictEqual(ok.then, 'fortune');
  assert.strictEqual(talk.interpret('내 생일은 5월 25일', ctx()).text, '쌍둥이자리네요! 오늘 운세 볼까요?'); assert.deepStrictEqual(talk.interpret('내 생일은 5월 25일', ctx()).patch, { fortuneBirth: '05-25' });
});

// ── 3. 동네 이름으로 찾기 ───────────────────────────────────────────────────
const L = (q, max) => search.searchPlaces(q, max).map(h => h.label);
t('동네 검색: 노량진 → 서울 동작구, 홍대 → 마포구, 판교 → 성남시 분당구, 해운대·강남역·여의도·잠실', () => {
  const first = (q) => search.searchPlaces(q)[0];
  assert.strictEqual(first('노량진').label, '노량진동 · 서울 동작구'); assert.strictEqual(first('노량진').city.id, 'sl:동작구');
  assert.strictEqual(first('홍대').city.id, 'sl:마포구'); assert.strictEqual(first('판교').city.id, 'gg:성남시 분당구'); assert.strictEqual(first('강남역').city.id, 'sl:강남구');
  assert.strictEqual(first('여의도').city.id, 'sl:영등포구'); assert.strictEqual(first('잠실').city.id, 'sl:송파구'); assert.ok(search.searchPlaces('해운대').some(h => h.city.id === 'bs:해운대구'));
  assert.strictEqual(first('의정부').city.id, 'gg:의정부시'); assert.strictEqual(first('의 정 부').city.id, 'gg:의정부시');
});
t('동네 검색: 같은 이름이 여러 곳이면 상위 지역으로 구분(중앙동), 후보는 최대 5개, 라벨은 "이름 · 시·도 시·군·구"', () => {
  const hits = search.searchPlaces('중앙동'); assert.ok(hits.length >= 2 && hits.length <= 5, `${hits.length}`);
  assert.strictEqual(new Set(hits.map(h => h.label)).size, hits.length, '라벨이 겹치지 않는다');
  for (const h of hits) assert.ok(/^중앙동.* · \S+ \S+/.test(h.label), h.label);
  assert.strictEqual(new Set(hits.map(h => h.city.id)).size, hits.length, '서로 다른 시·군·구');
  assert.ok(search.searchPlaces('중구').length === 5 && search.searchPlaces('송정동').length <= 5 && search.searchPlaces('동').length <= 5 && search.MAX_PLACE_RESULTS === 5);
  assert.strictEqual(search.searchPlaces('중앙동', 2).length, 2);
  assert.ok(search.searchPlaces('서울 중앙동').length === 0 || search.searchPlaces('서울 중앙동').every(h => h.city.short === '서울'));
  assert.ok(search.searchPlaces('과천 중앙동')[0].city.id === 'gg:과천시', '시 이름을 함께 쓰면 그곳');
});
t('동네 검색: 초성("ㄴㄹㅈ"), "동작구 노량진", "서울 노량진", "서울동작구노량진", 앞부분·부분 일치, 없는 이름은 빈 결과', () => {
  assert.strictEqual(search.searchPlaces('ㄴㄹㅈ')[0].city.id, 'sl:동작구');
  for (const q of ['동작구 노량진', '서울 노량진', '서울동작구노량진', '서울 동작구 노량진동']) assert.strictEqual(search.searchPlaces(q)[0].city.id, 'sl:동작구', q);
  assert.strictEqual(search.searchPlaces('노량')[0].city.id, 'sl:동작구'); assert.ok(search.searchPlaces('량진').some(h => h.city.id === 'sl:동작구'));
  assert.strictEqual(search.searchPlaces('수원 영통')[0].city.id, 'gg:수원시 영통구'); assert.strictEqual(search.searchPlaces('부산 중구')[0].city.id, 'bs:중구');
  for (const q of ['', '   ', 'zzzzqq', '없는동네이름']) assert.deepStrictEqual(search.searchPlaces(q), [], q);
  assert.strictEqual(search.searchPlaces('의정부동')[0].label, '의정부동 · 경기 의정부시');
});
t('동네를 고르면 시·군·구 id로 저장되고, 날씨 요청 좌표는 그 시·군·구의 대표 좌표(소수점 2자리)다', () => {
  const hit = search.searchPlaces('노량진')[0]; const step = talk.applyCity(hit.city.id, ctx({ weatherConsent: true, weatherEnabled: true }));
  assert.deepStrictEqual(step.patch, { weatherEnabled: true, weatherCityId: 'sl:동작구' }, '동네(동) 이름이 아니라 시·군·구 id만 저장');
  const url = new URL(W.buildUrl(hit.city.lat, hit.city.lon)); assert.strictEqual(url.searchParams.get('latitude'), hit.city.lat.toFixed(2)); assert.strictEqual(url.searchParams.get('longitude'), hit.city.lon.toFixed(2));
  assert.deepStrictEqual([hit.city.lat, hit.city.lon], [cities.cityById('sl:동작구').lat, cities.cityById('sl:동작구').lon]);
  const viaTalk = talk.interpret('노량진으로 바꿔줘', ctx({ weatherConsent: true, weatherEnabled: true })); assert.strictEqual(viaTalk.type, 'say'); assert.strictEqual(viaTalk.patch.weatherCityId, 'sl:동작구'); assert.strictEqual(viaTalk.text, '동작구군요! 날씨 알려드릴게요'.replace('동작구군요', '동작구군요'));
  const ambiguous = talk.interpret('중앙동으로 바꿔줘', ctx({ weatherConsent: true, weatherEnabled: true })); assert.strictEqual(ambiguous.type, 'pick'); assert.ok(ambiguous.hits.length >= 2, '후보가 여러 개면 버튼으로 고른다');
  const none = talk.interpret('없는동네이름으로 바꿔줘', ctx(ON)); assert.deepStrictEqual(none, { type: 'ask', ask: 'city', text: '못 찾았어요, 다른 이름으로 알려줄래요?' });
});
t('동네 자료: 법정동 대응표(공공데이터) 5,000개 이상, 모두 내장 시·군·구 id, 별칭 200개 이상·모두 유효, 새 행정구역 반영, UTF-8(BOM 없음)', () => {
  const ids = new Set(cities.CITIES.map(c => c.id)); let dongs = 0;
  for (const [id, s] of Object.entries(placesJson.cities)) { assert.ok(ids.has(id), id); dongs += s.split('|').length; assert.ok(!s.includes(FFFD)); }
  assert.ok(dongs >= 5000, `읍·면·동 ${dongs}`); assert.ok(/국토교통부_전국 법정동/.test(placesJson._source) && /이용허락범위 제한 없음/.test(placesJson._source));
  const A = aliases.PLACE_ALIASES; assert.ok(new Set(A.map(a => a[0])).size >= 200, `별칭 ${new Set(A.map(a => a[0])).size}`);
  for (const [alias, ...targets] of A) { assert.ok(alias && targets.length >= 1); for (const id of targets) assert.ok(ids.has(id), `${alias} → ${id}`); }
  for (const u of aliases.UNCERTAIN_ALIASES) assert.ok(A.some(a => a[0] === u), `불확실 목록에 있는 별칭이 없음: ${u}`);
  for (const id of ['ic:제물포구', 'ic:영종구', 'ic:서해구', 'ic:검단구', 'gg:부천시 원미구', 'gg:화성시 동탄구']) assert.ok(ids.has(id), id);
  for (const id of ['ic:중구', 'ic:동구', 'ic:서구']) assert.ok(!ids.has(id), `${id}는 2026년 개편으로 없어졌다`);
  const raw = fs.readFileSync(path.join(root, 'src/data/places.json')); assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb), 'BOM 없음'); assert.ok(!raw.toString('utf8').includes(FFFD));
  for (const c of cities.CITIES) assert.ok(c.short && c.parent);
});
t('동네 검색 코드와 자료에 네트워크·위치 감지가 없다', () => {
  for (const f of ['src/utils/citySearch.ts', 'src/utils/talk.ts', 'src/utils/zodiac.ts', 'src/utils/bubbleMix.ts', 'src/data/placeAliases.ts', 'src/components/PetTalk.tsx']) assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|https?:\/\/|geolocation/.test(read(f)), f);
});

// ── 4. 별자리·띠·생일 ───────────────────────────────────────────────────────
t('별자리 경계: 3/20 물고기, 3/21 양, 12/21 사수, 12/22 염소, 1/19 염소, 1/20 물병, 2/18 물병, 2/19 물고기 … 12종 전부', () => {
  const z = (m, d) => Z.zodiacOf(m, d).name;
  assert.strictEqual(z(3, 20), '물고기자리'); assert.strictEqual(z(3, 21), '양자리'); assert.strictEqual(z(12, 21), '사수자리'); assert.strictEqual(z(12, 22), '염소자리');
  assert.strictEqual(z(1, 19), '염소자리'); assert.strictEqual(z(1, 20), '물병자리'); assert.strictEqual(z(2, 18), '물병자리'); assert.strictEqual(z(2, 19), '물고기자리');
  assert.strictEqual(z(4, 19), '양자리'); assert.strictEqual(z(4, 20), '황소자리'); assert.strictEqual(z(5, 20), '황소자리'); assert.strictEqual(z(5, 21), '쌍둥이자리'); assert.strictEqual(z(6, 21), '쌍둥이자리'); assert.strictEqual(z(6, 22), '게자리');
  assert.strictEqual(z(7, 22), '게자리'); assert.strictEqual(z(7, 23), '사자자리'); assert.strictEqual(z(8, 22), '사자자리'); assert.strictEqual(z(8, 23), '처녀자리'); assert.strictEqual(z(9, 22), '처녀자리'); assert.strictEqual(z(9, 23), '천칭자리');
  assert.strictEqual(z(10, 22), '천칭자리'); assert.strictEqual(z(10, 23), '전갈자리'); assert.strictEqual(z(11, 22), '전갈자리'); assert.strictEqual(z(11, 23), '사수자리'); assert.strictEqual(z(2, 29), '물고기자리'); assert.strictEqual(z(1, 1), '염소자리'); assert.strictEqual(z(12, 31), '염소자리');
  const seen = new Set(); for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) seen.add(z(m, d)); assert.strictEqual(seen.size, 12);
});
t('띠: 양력 연도 기준 12지(1990 말, 2000 용, 1984 쥐, 2023 토끼, 2024 용, 1900 쥐)', () => {
  const a = (y) => Z.animalOf(y).name;
  assert.strictEqual(a(1990), '말띠'); assert.strictEqual(a(2000), '용띠'); assert.strictEqual(a(1984), '쥐띠'); assert.strictEqual(a(2023), '토끼띠'); assert.strictEqual(a(2024), '용띠'); assert.strictEqual(a(1900), '쥐띠'); assert.strictEqual(a(2008), '쥐띠'); assert.strictEqual(a(1999), '토끼띠');
  assert.strictEqual(new Set(Array.from({ length: 12 }, (_, i) => a(2000 + i))).size, 12);
  assert.deepStrictEqual(Array.from({ length: 12 }, (_, i) => a(1984 + i)), ['쥐띠', '소띠', '호랑이띠', '토끼띠', '용띠', '뱀띠', '말띠', '양띠', '원숭이띠', '닭띠', '개띠', '돼지띠']);
});
t('날짜 검증: 윤년 2/29, 평년 2/29 불가, 연도 없는 2/29 가능, 31일/13월/0일/미래/1900 이전 불가', () => {
  const v = (y, m, d) => Z.validBirth(y, m, d, TODAY);
  assert.ok(v(2000, 2, 29) && v(2024, 2, 29) && v(null, 2, 29)); assert.ok(!v(2023, 2, 29) && !v(1900, 2, 29) && !v(2100, 2, 29, TODAY));
  assert.ok(v(1990, 5, 25) && v(1900, 1, 1) && v(null, 12, 31)); assert.ok(!v(1990, 4, 31) && !v(1990, 13, 1) && !v(1990, 0, 5) && !v(1990, 5, 0) && !v(1899, 12, 31) && !v(2027, 1, 1) && !v(2026, 12, 25) && !v(1990, 1.5, 3));
  assert.ok(v(2026, 10, 23) && !v(2026, 10, 24), '오늘까지만');
});
t('생일 저장 형식 왕복과 생일 당일(2월 29일생은 평년 2월 28일)', () => {
  assert.strictEqual(Z.formatBirth({ year: 1990, month: 5, day: 25 }), '1990-05-25'); assert.strictEqual(Z.formatBirth({ year: null, month: 5, day: 5 }), '05-05');
  assert.deepStrictEqual(Z.readBirth('1990-05-25', TODAY), { year: 1990, month: 5, day: 25 }); assert.deepStrictEqual(Z.readBirth('05-25', TODAY), { year: null, month: 5, day: 25 });
  for (const bad of ['', 'abc', '1990-13-01', '2023-02-29', undefined, null, 5]) assert.strictEqual(Z.readBirth(bad, TODAY), null, String(bad));
  assert.ok(Z.isBirthday({ year: 1990, month: 10, day: 23 }, new Date(2026, 9, 23)) && !Z.isBirthday({ year: 1990, month: 10, day: 23 }, new Date(2026, 9, 24)));
  const leap = { year: 2000, month: 2, day: 29 }; assert.ok(Z.isBirthday(leap, new Date(2027, 1, 28)) && !Z.isBirthday(leap, new Date(2027, 2, 1)) && Z.isBirthday(leap, new Date(2028, 1, 29)) && !Z.isBirthday(leap, new Date(2028, 1, 28)));
  assert.strictEqual(zt.BIRTHDAY_MESSAGE, '생일 축하해요! 🎂');
  assert.strictEqual(Z.birthGreeting({ year: 1990, month: 5, day: 25 }), '쌍둥이자리에 말띠네요! 오늘 운세 볼까요?');
});
t('별자리·띠 문구: 각 12종 × 5개 이상, 중복·깨짐·금지어 없음, 길이가 말풍선에 들어간다', () => {
  assert.strictEqual(zt.ZODIAC.length, 12); assert.strictEqual(zt.ANIMALS.length, 12);
  const bad = ['반드시', '무조건', '절대', '병원', '약을', '투자', '주식', '대출', '재앙', '불행', '큰일'];
  const all = []; for (const s of [...zt.ZODIAC, ...zt.ANIMALS]) { assert.ok(s.lines.length >= 5, s.name); assert.strictEqual(new Set(s.lines).size, s.lines.length); for (const l of s.lines) { all.push(l); assert.ok(l.trim() === l && l.length > 0 && Array.from(l).length <= 24 && !l.includes(FFFD) && !/\?\?/.test(l), l); for (const b of bad) assert.ok(!l.includes(b), l); } }
  assert.strictEqual(new Set(all).size, all.length, '전체 중복 없음'); assert.strictEqual(new Set([...zt.ZODIAC, ...zt.ANIMALS].map(s => s.name)).size, 24);
});

// ── 5. 생일이 들어간 운세 ───────────────────────────────────────────────────
t('운세: 같은 날·같은 생일이면 항상 같고, 생일이 다르면 충분히 갈린다(300가지 생일), 생일이 없으면 이전과 똑같다', () => {
  const d1 = new Date(2026, 9, 23, 9), d2 = new Date(2026, 9, 23, 22);
  assert.deepStrictEqual(F.fortuneFor(d1, undefined, '1990-05-25'), F.fortuneFor(d2, undefined, '1990-05-25'));
  const set = new Set(); for (let i = 0; i < 300; i++) set.add(JSON.stringify(F.fortuneFor(d1, undefined, `${1950 + (i % 60)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`).pages));
  assert.ok(set.size > 250, `서로 다른 결과 ${set.size}/300`);
  const plain = F.fortuneFor(d1); for (const nob of ['', undefined, 'abc', '1990-13-01']) assert.deepStrictEqual(F.fortuneFor(d1, undefined, nob), plain, String(nob));
  assert.strictEqual(plain.pages.length, 4);
  assert.strictEqual(F.fortuneFor(new Date(2026, 9, 23)).pages[0], '조금 서툴러도 귀엽게 넘어가는 날이에요', '생일 미입력 시 v1.5.0과 같은 결과');
  assert.strictEqual(F.fortuneFor(new Date(2026, 9, 24)).pages[0], '소소한 행복이 곳곳에 숨어 있는 날이에요');
});
t('운세: 생일이 있으면 가끔(약 60%) 별자리·띠 한 줄이 두 번째 줄로 끼고, 연도 없는 생일은 별자리만', () => {
  let withExtra = 0, animal = 0, zodiac = 0;
  for (let i = 0; i < 365; i++) {
    const f = F.fortuneFor(new Date(2026, 0, 1 + i), undefined, '1990-05-25');
    if (f.pages.length === 5) { withExtra++; const m = /^(\S+) · (.+)$/.exec(f.pages[1]); const z = zt.ZODIAC.find(s => s.name === m[1]), a = zt.ANIMALS.find(s => s.name === m[1]); assert.ok((z && z.lines.includes(m[2])) || (a && a.lines.includes(m[2])), f.pages[1]); if (a) { assert.strictEqual(a.name, '말띠'); animal++; } else { assert.strictEqual(z.name, '쌍둥이자리'); zodiac++; } }
    else assert.strictEqual(f.pages.length, 4);
    assert.ok(/재미|심심풀이/.test(f.pages[f.pages.length - 1]), '마지막은 "재미로" 줄');
  }
  assert.ok(withExtra > 365 * 0.45 && withExtra < 365 * 0.75, `끼어든 날 ${withExtra}`); assert.ok(animal > 40 && zodiac > 40);
  for (let i = 0; i < 100; i++) { const f = F.fortuneFor(new Date(2026, 0, 1 + i), undefined, '05-25'); if (f.pages.length === 5) assert.strictEqual(f.pages[1].split(' · ')[0], '쌍둥이자리'); }
});

// ── 6. 빈 시간 말풍선 자동 섞기 ─────────────────────────────────────────────
t('섞기 가중치: 시계 25 · 한마디 30 · 하루 진행 15 · 운세 15 · 날씨 15, 날씨가 없으면 나머지에 비율대로 나눔, 뺀 종류는 후보에서 제외', () => {
  assert.deepStrictEqual(mix.MIX_WEIGHTS, { clock: 25, phrase: 30, progress: 15, fortune: 15, weather: 15 });
  const w = mix.mixWeights([], true); assert.deepStrictEqual(Object.keys(w), ['clock', 'phrase', 'progress', 'fortune', 'weather']); assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b) - 100) < 1e-9);
  const nw = mix.mixWeights([], false); assert.ok(!('weather' in nw)); assert.ok(Math.abs(nw.clock - 25 / 85 * 100) < 1e-9 && Math.abs(nw.phrase - 30 / 85 * 100) < 1e-9 && Math.abs(nw.fortune - 15 / 85 * 100) < 1e-9);
  assert.ok(!('phrase' in mix.mixWeights(['phrase'], true))); assert.deepStrictEqual(mix.mixCandidates(['clock', 'phrase', 'progress', 'fortune'], true), ['weather']); assert.deepStrictEqual(mix.mixCandidates(['clock', 'phrase', 'progress', 'fortune', 'weather'], true), []);
  assert.strictEqual(mix.pickKind({ off: ['clock', 'phrase', 'progress', 'fortune', 'weather'], weatherReady: true, last: null }), null);
});
t('섞기 시뮬레이션 20,000번: 직전과 같은 종류 연속 없음, 날씨 후보 조건·뺀 종류 반영, 비율이 가중치 근처', () => {
  const r = rng(12345); let last = null; const cnt = { clock: 0, phrase: 0, progress: 0, fortune: 0, weather: 0 };
  for (let i = 0; i < 20000; i++) { const k = mix.pickKind({ off: [], weatherReady: true, last, rand: r }); assert.notStrictEqual(k, last, `연속 i=${i}`); cnt[k]++; last = k; }
  const share = (k) => cnt[k] / 20000; assert.ok(share('phrase') > 0.24 && share('phrase') < 0.36, `한마디 ${share('phrase')}`); assert.ok(share('clock') > 0.19 && share('clock') < 0.31, `시계 ${share('clock')}`);
  for (const k of ['progress', 'fortune', 'weather']) assert.ok(share(k) > 0.10 && share(k) < 0.22, `${k} ${share(k)}`);
  last = null; const c2 = { clock: 0, phrase: 0, progress: 0, fortune: 0, weather: 0 };
  for (let i = 0; i < 20000; i++) { const k = mix.pickKind({ off: [], weatherReady: false, last, rand: r }); assert.notStrictEqual(k, last); c2[k]++; last = k; }
  assert.strictEqual(c2.weather, 0, '날씨가 없으면 후보가 아님');
  last = null; const c3 = { clock: 0, phrase: 0, progress: 0, fortune: 0, weather: 0 };
  for (let i = 0; i < 5000; i++) { const k = mix.pickKind({ off: ['phrase', 'fortune'], weatherReady: true, last, rand: r }); assert.notStrictEqual(k, last); c3[k]++; last = k; }
  assert.strictEqual(c3.phrase + c3.fortune, 0, '뺀 종류는 나오지 않음'); assert.ok(c3.clock > 0 && c3.progress > 0 && c3.weather > 0);
  const only = [mix.pickKind({ off: ['clock', 'phrase', 'progress', 'fortune'], weatherReady: true, last: 'weather', rand: r }), mix.pickKind({ off: ['clock', 'phrase', 'progress', 'fortune'], weatherReady: false, last: null, rand: r })];
  assert.deepStrictEqual(only, ['weather', null], '후보가 하나뿐이면 반복 허용, 없으면 null');
});
t('섞기 연결: 엔진은 설정의 표시 시간·간격을 따르고, 운세는 첫 줄만(클릭하면 다음 줄), 날씨는 줄 넘김, 초집중·알림 중에는 없음(정적 확인)', () => {
  const pet = read('src/pages/PetPage.tsx'); const eng = pet.slice(pet.indexOf('★ 말풍선 엔진'), pet.indexOf('// ★ 날씨: 켜짐'));
  assert.ok(/bubbleShowSec/.test(eng) && /bubbleGapSec/.test(eng) && /pickKind\(\{ off, weatherReady, last: mixRef\.current\.last \}\)/.test(eng));
  assert.ok(/cleanOffKinds\(cur\.bubbleOffKinds\)/.test(eng) && /weatherReady = cur\.weatherEnabled === true && cur\.weatherConsent === true && !!weatherRef\.current/.test(eng), '날씨는 켜짐+동의+값이 있을 때만 후보');
  assert.ok(/fortunePageRef\.current = 0; weatherPageRef\.current = 0/.test(eng), '새로 고를 때 첫 줄부터');
  assert.ok(/randomPhrase\(lastPhraseRef\.current\)/.test(eng), '한마디는 직전 문구와 다르게');
  assert.ok(/!focusRef\.current\.enabled/.test(eng) && /!paused/.test(eng), '초집중 모드·알림 중에는 말풍선 없음');
  assert.ok(/cur\.bubbleClock !== false/.test(eng), 'bubbleClock이 꺼져 있으면 빈 시간 말풍선 없음');
  assert.ok(!/bubbleIdle|phraseFor|PetAsk/.test(pet));
});

// ── 7. 한 번 클릭 우선순위·열림 조건 ────────────────────────────────────────
t('클릭 우선순위: 더블클릭 → 말 걸기, 운세가 떠 있으면 다음 줄, 날씨가 떠 있으면 현재 → 최고/최저 → 강수 확률, 마지막 다음은 평소 반응', () => {
  const pet = read('src/pages/PetPage.tsx'), click = pet.slice(pet.indexOf('const handleCatClick'), pet.indexOf('const currentCustomImage'));
  assert.ok(click.indexOf('isDoubleClick') < click.indexOf("idleBubble?.kind === 'fortune'") && click.indexOf("idleBubble?.kind === 'fortune'") < click.indexOf("idleBubble?.kind === 'weather'") && click.indexOf("idleBubble?.kind === 'weather'") < click.indexOf('showBubble(rand(reactions)'));
  assert.ok(/openTalk\('menu'\)/.test(click) && !/spawnParticles\(14\)/.test(click), '예전 더블클릭 놀람 반응은 말 걸기로 대체');
  assert.ok(/weatherPageRef\.current < last/.test(click) && /weatherPageRef\.current \+= 1/.test(click));
  const WT = load('src/utils/weatherText.ts', { '../data/weatherText': load('src/data/weatherText.ts'), './fortune': F });
  const lines = WT.weatherLines({ temp: 12, feels: 10, code: 3, max: 18, min: 9, pop: 30, precip: 0 }, TODAY);
  assert.strictEqual(lines.length, 3); assert.ok(/구름|12°/.test(lines[0]) && lines[1] === '오늘 최고 18° / 최저 9°' && lines[2] === '비 올 확률은 30%예요');
  assert.strictEqual(WT.weatherLines({ temp: 12, feels: 12, code: 3, max: 18, min: 9, pop: null, precip: null }, TODAY).length, 2);
});
t('말 걸기 열림 조건: 초집중·알람 울림·알람 팝업(알림 카드)·미리 알림 토스트 중에는 열리지 않고 열려 있다면 닫힌다, 열려 있는 동안만 입력 허용, Esc로 닫음', () => {
  const pet = read('src/pages/PetPage.tsx'), tk = read('src/components/PetTalk.tsx');
  assert.ok(/const talkBlocked = focus\.enabled \|\| alertActive \|\| !!toast/.test(pet)); assert.ok(/if \(focusRef\.current\.enabled \|\| alertRef\.current \|\| toastActiveRef\.current\) return;\s+setBirthAsk\(false\); setTalk\(start\)/.test(pet));
  assert.ok(/useEffect\(\(\) => \{ if \(talkBlocked\) \{ setTalk\(null\); setBirthAsk\(false\); \} \}, \[talkBlocked\]\)/.test(pet));
  assert.ok(/if \(!talk\) return;\s+window\.electronAPI\?\.setPetInteractive\?\.\(true\);/.test(pet) && /return \(\) => \{ window\.electronAPI\?\.setPetInteractive\?\.\(false\); \}/.test(pet));
  assert.ok(/Escape/.test(tk) && /inputRef\.current\?\.focus\(\)/.test(tk));
  assert.ok(/onOpenTalk\?\.\(\(start\) => openTalk\(/.test(pet), '트레이 요청도 같은 openTalk를 거친다(같은 차단 규칙)');
  assert.ok(/alertCount/.test(read('main.cjs')) && /trackAlertWindow\(breakTimeWindow\)|trackAlertWindow\(/.test(read('main.cjs')), '알람 카드 창은 alert-state로 버디 창에 알려진다');
});
t('트레이 메뉴: "💬 펫에게 말 걸기"·"☀️ 지금 날씨", 직접 눌렀을 때만 버디 창에 포커스, 날씨가 꺼져 있으면 날씨 켜기 대화로', () => {
  const main = read('main.cjs'), pre = read('preload.cjs');
  assert.ok(main.includes("label: '💬 펫에게 말 걸기'") && main.includes("label: '☀️ 지금 날씨'") && main.includes("openPetTalk('menu')") && main.includes("openPetTalk('weather')"));
  assert.ok(/petWindow\.focus\(\); petWindow\.webContents\.send\('open-talk', start\)/.test(main) && /onOpenTalk:/.test(pre) && /ipcRenderer\.on\('open-talk'/.test(pre));
  assert.ok(/start === 'weather'\) run\(stepForWeather/.test(read('src/components/PetTalk.tsx')), '지금 날씨 → 동의·동네·날씨 순서의 대화');
});
t('말 걸기 창 구성: 인사, 버튼 5개, 입력칸, 기억한 것 지우기, 날씨 표기, 대화 기록을 저장하지 않는다(정적 확인)', () => {
  const tk = read('src/components/PetTalk.tsx'), tt = read('src/utils/talk.ts');
  for (const w of ['GREETING', '☀️ 날씨', '🍀 운세', '💬 한마디', '🎂', '생일 알려주기', '📍 동네 바꾸기', '기억한 것 지우기', 'CREDIT', 'placeholder']) assert.ok(tk.includes(w), w);
  const menuBlock = tk.slice(tk.indexOf("{view.mode === 'menu' && ("), tk.indexOf("{view.mode === 'fortune' && ("));
  assert.ok(!menuBlock.includes('생일'), '생일 알려주기는 첫 화면이 아니라 운세 안에 있다');
  const fortuneBlock = tk.slice(tk.indexOf("{view.mode === 'fortune' && ("), tk.indexOf("{view.mode === 'consent' && ("));
  assert.ok(fortuneBlock.includes('오늘 운세 보기') && fortuneBlock.includes('생일 알려주기') && fortuneBlock.includes('생일 바꾸기'), '운세 안: 오늘 운세 보기 / 생일 알려주기(입력했으면 바꾸기)');
  assert.strictEqual(talk.GREETING, '뭐 해줄까요?'); assert.strictEqual(talk.CREDIT, '날씨 데이터: Open-Meteo (CC BY 4.0)');
  assert.ok(!/localStorage|sessionStorage|console\.(log|info|debug)/.test(tk + tt), '대화 내용을 저장·기록하지 않는다');
  assert.ok(/인사|뭐 해줄까요/.test(tt));
  const help = read('src/components/settings/HelpPane.tsx'); assert.ok(help.includes('더블클릭하면 버디와 얘기할 수 있어요') && help.includes('날씨 데이터: Open-Meteo (CC BY 4.0)'));
});

// ── 8. 첫 안내·생일 묻기·생일 축하 ─────────────────────────────────────────
t('talkState: 첫 안내 한 번만, 생일 묻기 7일 쉬기(오늘+7일부터 다시), 생일 축하 날짜 기록', () => {
  const st = mem(); const S1 = ts2(st);
  assert.deepStrictEqual(S1.readTalkState(), {}); S1.writeTalkState({ introShown: true }); assert.strictEqual(ts2(st).readTalkState().introShown, true);
  const d = new Date(2026, 9, 23); const until = S1.snoozedUntil(d); assert.strictEqual(until, '2026-10-30'); S1.writeTalkState({ birthSnoozeUntil: until });
  for (let i = 0; i < 7; i++) assert.ok(S1.isSnoozed(S1.readTalkState(), new Date(2026, 9, 23 + i)), `${i}일째`);
  assert.ok(!S1.isSnoozed(S1.readTalkState(), new Date(2026, 9, 30)) && !S1.isSnoozed({}, d));
  S1.writeTalkState({ birthdayShown: '2026-10-23' }); assert.deepStrictEqual(Object.keys(S1.readTalkState()).sort(), ['birthSnoozeUntil', 'birthdayShown', 'introShown']);
  assert.strictEqual(ts2({ getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } }).readTalkState().introShown, undefined, '저장소가 막혀도 예외 없음');
});
t('첫 안내·생일 묻기·생일 축하 연결(정적 확인)', () => {
  const pet = read('src/pages/PetPage.tsx'), tk = read('src/components/PetTalk.tsx');
  assert.ok(/더블클릭하면 저랑 얘기할 수 있어요 💬/.test(pet) && /introShown/.test(pet) && /writeTalkState\(\{ introShown: true \}\)/.test(pet));
  assert.ok(tk.includes('운세를 더 잘 맞춰 볼까요? 생일을 알려줄래요?') && tk.includes('알려줄게요') && tk.includes('다음에요'));
  assert.ok(/birthSnoozeUntil: snoozedUntil\(new Date\(\)\)/.test(pet) && /isSnoozed\(readTalkState\(\), new Date\(\)\)/.test(pet) && /setTimeout\(birthLater, 25000\)/.test(pet));
  assert.ok(/readBirth\(cur\.fortuneBirth\)/.test(pet) && /k === 'fortune'|if \(k === 'fortune'\) birthAskRequestRef/.test(pet), '운세가 나온 뒤 생일이 없으면 묻는다');
  assert.ok(/isBirthday\(birth, now\) && readTalkState\(\)\.birthdayShown !== day/.test(pet) && /announce\(BIRTHDAY_MESSAGE\)/.test(pet), '생일 당일 한 번');
  assert.strictEqual(talkStateBIRTH(), 7);
  function talkStateBIRTH() { return Number(/BIRTH_SNOOZE_DAYS = (\d+)/.exec(read('src/utils/talkState.ts'))[1]); }
});

// ── 9. 설정 화면 원복·저장 키 ───────────────────────────────────────────────
t('설정 팝오버·말풍선 모달은 v1.4.1 문구 그대로, 날씨·생일 설정 UI와 v1.5 베타 키(bubbleIdle)는 어디에도 없다', () => {
  const home = read('src/components/settings/HomePane.tsx'), modal = read('src/components/settings/BubbleModal.tsx');
  assert.ok(home.includes('메시지가 없는 동안에는 현재 시간을 보여줘요.') && modal.includes('메시지가 없으면 시계만 보여요.'));
  assert.ok(!fs.existsSync(path.join(root, 'src/components/settings/WeatherModal.tsx')) && !fs.existsSync(path.join(root, 'src/components/settings/WeatherSettings.tsx')) && !fs.existsSync(path.join(root, 'src/components/PetAsk.tsx')));
  for (const f of ['src/pages/PetPage.tsx', 'src/pages/SettingsPage.tsx', 'src/utils/settings.ts', 'src/components/settings/HomePane.tsx']) assert.ok(!/bubbleIdle|BubbleIdle|bubbleIdleOf|IDLE_NAME|WeatherModal/.test(read(f)), f);
  assert.deepStrictEqual([...settingsTs.PET_OWNED_KEYS], ['weatherEnabled', 'weatherConsent', 'weatherCityId', 'fortuneBirth', 'bubbleOffKinds']);
  assert.ok(/PET_OWNED_KEYS/.test(read('src/pages/SettingsPage.tsx')), '설정창이 대화로 바뀐 키를 낡은 값으로 되돌리지 않는다');
  const d = settingsTs.DEFAULT_SETTINGS; assert.deepStrictEqual([d.weatherEnabled, d.weatherConsent, d.weatherCityId, d.fortuneBirth, d.bubbleOffKinds, d.bubbleClock], [false, false, '', '', [], true]);
});
t('새 소스 파일에 U+FFFD 없음', () => {
  for (const f of ['src/utils/talk.ts', 'src/utils/zodiac.ts', 'src/utils/bubbleMix.ts', 'src/utils/talkState.ts', 'src/utils/fortune.ts', 'src/utils/citySearch.ts', 'src/data/zodiacText.ts', 'src/data/placeAliases.ts', 'src/data/cities.ts', 'src/components/PetTalk.tsx', 'src/pages/PetPage.tsx', 'src/components/settings/HelpPane.tsx', 'scripts/build-places.cjs']) assert.ok(!read(f).includes(FFFD), f);
});

(async () => {
  for (const [name, fn] of queue) { await fn(); n++; console.log(`  ok  ${name}`); }
  console.log(`\n${n} tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
