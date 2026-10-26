// 날씨 안부 단위 테스트: 실제 API는 부르지 않는다(가짜 fetch와 가짜 시계). 동의 전 호출 0건, 좌표 반올림·개인정보 없음, 캐시·실패 처리,
// 동네 검색, 점심·퇴근 예보 판단, 문구 조건, 롤링 비중·연속 중복, 초집중·알람 중 건너뜀, stale, 기본값 호환.
// `node tests/weather-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const W = require('../weather.cjs');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, (p) => (p in deps ? deps[p] : ({ seedFreshTheme() {} })), { getItem: () => null, setItem() {} }, { location: { hash: '' } }); return m.exports;
};
const cities = load('src/data/cities.ts');
const aliases = load('src/data/placeAliases.ts');
const places = JSON.parse(read('src/data/places.json'));
const search = load('src/utils/citySearch.ts', { '../data/cities': cities, '../data/placeAliases': aliases, '../data/places.json': { default: places } });
const helloData = load('src/data/weatherHello.ts');
const H = load('src/utils/weatherHello.ts', { '../data/weatherHello': helloData });
const settingsTs = load('src/utils/settings.ts');
const FFFD = String.fromCharCode(0xFFFD);
const MIN = 60 * 1000, HOUR = 60 * MIN;

// 실제 응답 구조(Open-Meteo, timeformat=unixtime): 현재 + 시간별 배열
const T0 = Date.UTC(2026, 9, 23, 0, 0) / 1000;   // 2026-10-23 09:00 KST
const hourly = (n, f) => ({ time: Array.from({ length: n }, (_, i) => T0 + i * 3600), temperature_2m: Array.from({ length: n }, (_, i) => f(i).temp ?? 12), apparent_temperature: Array.from({ length: n }, (_, i) => f(i).feels ?? f(i).temp ?? 12),
  precipitation_probability: Array.from({ length: n }, (_, i) => f(i).pop ?? 0), weather_code: Array.from({ length: n }, (_, i) => f(i).code ?? 1), wind_speed_10m: Array.from({ length: n }, (_, i) => f(i).wind ?? 2) });
const SAMPLE = { latitude: 37.5, longitude: 126.94, utc_offset_seconds: 32400, timezone: 'Asia/Seoul',
  current: { time: T0, interval: 900, temperature_2m: 6.2, apparent_temperature: 3.1, weather_code: 3, wind_speed_10m: 3.4 }, hourly: hourly(48, () => ({})) };
const okRes = (json = SAMPLE) => ({ ok: true, status: 200, json: async () => json });
const mk = (impl, opts = {}) => { const calls = []; let now = 1_000_000; const clock = { get: () => now, add: (ms) => { now += ms; } };
  const svc = W.createWeatherService({ fetch: async (url, o) => { calls.push({ url, o }); return impl(url, o, calls.length); }, now: clock.get, timeoutMs: opts.timeoutMs });
  return { svc, calls, clock }; };

// ── 요청 모양 ───────────────────────────────────────────────────────────────
t('요청 주소: 좌표는 소수점 2자리, 필요한 필드만(현재 4 + 시간별 5 + 일별 3), 다른 키 없음, 풍속 m/s·unixtime', () => {
  const u = new URL(W.buildUrl(37.7449, 127.0551));
  assert.strictEqual(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.strictEqual(u.searchParams.get('latitude'), '37.74'); assert.strictEqual(u.searchParams.get('longitude'), '127.06');
  assert.deepStrictEqual([...u.searchParams.keys()].sort(), ['current', 'daily', 'forecast_days', 'hourly', 'latitude', 'longitude', 'timeformat', 'timezone', 'wind_speed_unit']);
  assert.strictEqual(u.searchParams.get('current'), 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m');
  assert.strictEqual(u.searchParams.get('hourly'), 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m');
  assert.strictEqual(u.searchParams.get('timezone'), 'auto'); assert.strictEqual(u.searchParams.get('forecast_days'), '2');
  assert.strictEqual(u.searchParams.get('wind_speed_unit'), 'ms'); assert.strictEqual(u.searchParams.get('timeformat'), 'unixtime');
  assert.strictEqual(new URL(W.buildUrl(35, 129)).searchParams.get('latitude'), '35.00');
});
t('요청에 좌표 외 개인정보·앱 식별자가 없다: 헤더는 Accept뿐, 주소에 사용자·앱 이름 없음', async () => {
  const { svc, calls } = mk(() => okRes()); svc.setConsent(true);
  await svc.get(37.7449, 127.0551);
  const { url, o } = calls[0];
  assert.deepStrictEqual(Object.keys(o.headers), ['Accept']);
  for (const w of ['choeae', 'nyang', '최애', 'user', 'name', 'email', 'id=', 'appid', 'key=', 'token', 'photo', 'alarm']) assert.ok(!url.toLowerCase().includes(w), w);
  assert.strictEqual(new URL(url).search.split('&').length, 9);   // 좌표 2 + current + hourly + daily + 풍속 단위 + 시각 형식 + 시간대 + 예보 일수
  assert.strictEqual(url.startsWith('https://'), true);
});
t('응답 파싱: 실제 구조 → 현재 값 + 시간별 배열(ms), 모양이 다르면 null, 빠진 시간은 건너뜀', () => {
  const r = W.parseResponse(SAMPLE);
  assert.strictEqual(r.temp, 6.2); assert.strictEqual(r.feels, 3.1); assert.strictEqual(r.code, 3); assert.strictEqual(r.wind, 3.4);
  assert.strictEqual(r.hours.length, 48); assert.strictEqual(r.hours[0].at, T0 * 1000); assert.strictEqual(r.hours[1].at - r.hours[0].at, HOUR);
  assert.deepStrictEqual(Object.keys(r.hours[0]).sort(), ['at', 'code', 'feels', 'pop', 'temp', 'wind']);
  for (const bad of [null, {}, { current: {}, hourly: {} }, { current: { temperature_2m: 'x', weather_code: 1 }, hourly: { time: [1] } }, { current: SAMPLE.current, hourly: { time: [] } }]) assert.strictEqual(W.parseResponse(bad), null);
  const holes = JSON.parse(JSON.stringify(SAMPLE)); holes.hourly.temperature_2m[3] = null; delete holes.current.wind_speed_10m; delete holes.hourly.apparent_temperature; holes.hourly.precipitation_probability = null;
  const h = W.parseResponse(holes); assert.strictEqual(h.hours.length, 47); assert.strictEqual(h.wind, null); assert.strictEqual(h.hours[0].feels, h.hours[0].temp); assert.strictEqual(h.hours[0].pop, null);
});
t('좌표 검증: 숫자·범위가 아니면 요청하지 않는다', async () => {
  const { svc, calls } = mk(() => okRes()); svc.setConsent(true);
  for (const [a, b] of [[NaN, 1], ['37', '127'], [91, 0], [0, 181], [null, null], [undefined, 3]]) assert.strictEqual(await svc.get(a, b), null);
  assert.strictEqual(calls.length, 0);
});

// ── 동의·캐시·실패 ──────────────────────────────────────────────────────────
t('동의 전에는 네트워크 호출 0건(기본 상태, 동의 거둠 포함)', async () => {
  const { svc, calls } = mk(() => okRes());
  assert.strictEqual(svc.hasConsent(), false);
  for (let i = 0; i < 5; i++) assert.strictEqual(await svc.get(37.74, 127.05), null);
  svc.setConsent(true); await svc.get(37.74, 127.05); assert.strictEqual(calls.length, 1);
  svc.setConsent(false); svc.setConsent('yes'); assert.strictEqual(svc.hasConsent(), false, 'true가 아닌 값은 동의가 아니다');
  assert.strictEqual(await svc.get(35.1, 129.0), null); assert.strictEqual(calls.length, 1);
});
t('30분 캐시: 29분 안에는 다시 부르지 않고, 30분이 지나면 다시 부른다, 받은 시각(at)을 돌려준다', async () => {
  const { svc, calls, clock } = mk(() => okRes()); svc.setConsent(true);
  const a = await svc.get(37.74, 127.05); assert.strictEqual(a.stale, false); assert.strictEqual(a.data.temp, 6.2); assert.strictEqual(a.at, 1_000_000);
  clock.add(29 * MIN); await svc.get(37.74, 127.05); assert.strictEqual(calls.length, 1);
  clock.add(2 * MIN); const b = await svc.get(37.74, 127.05); assert.strictEqual(calls.length, 2); assert.strictEqual(b.at, 1_000_000 + 31 * MIN);
  await svc.get(35.1, 129.03); assert.strictEqual(calls.length, 3, '다른 도시는 따로');
  await svc.get(37.7449, 127.0451); assert.strictEqual(calls.length, 3, '반올림하면 같은 좌표(37.74, 127.05)는 같은 캐시');
});
t('같은 시각 중복 요청 금지: 동시에 여러 번 불러도 요청은 하나', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const { svc, calls } = mk(async () => { await gate; return okRes(); }); svc.setConsent(true);
  const ps = [svc.get(37.74, 127.05), svc.get(37.74, 127.05), svc.get(37.7401, 127.0499)];
  release(); const rs = await Promise.all(ps);
  assert.strictEqual(calls.length, 1); assert.ok(rs.every(r => r && r.data.code === 3));
});
t('실패는 조용히 건너뛴다(예외 없음): 네트워크 오류·HTTP 오류·이상한 응답, 이후 5분 동안은 다시 부르지 않는다', async () => {
  for (const impl of [() => { throw new Error('offline'); }, () => ({ ok: false, status: 500, json: async () => ({}) }), () => okRes({ nope: 1 }), () => ({ ok: true, json: async () => { throw new Error('bad json'); } })]) {
    const { svc, calls, clock } = mk(impl); svc.setConsent(true);
    assert.strictEqual(await svc.get(37.74, 127.05), null);
    clock.add(4 * MIN); assert.strictEqual(await svc.get(37.74, 127.05), null); assert.strictEqual(calls.length, 1, '5분 안에는 재시도하지 않는다');
    clock.add(2 * MIN); await svc.get(37.74, 127.05); assert.strictEqual(calls.length, 2, '5분이 지나면 다시 시도');
  }
});
t('실패했을 때 마지막 성공 값이 6시간 이내면 그 값을 쓰고(stale), 넘으면 null', async () => {
  let fail = false; const { svc, clock } = mk(() => { if (fail) throw new Error('offline'); return okRes(); }); svc.setConsent(true);
  await svc.get(37.74, 127.05); fail = true;
  clock.add(40 * MIN); const a = await svc.get(37.74, 127.05); assert.ok(a && a.stale === true && a.data.temp === 6.2 && a.at === 1_000_000);
  clock.add(5 * HOUR + 30 * MIN + 10 * MIN); assert.strictEqual(await svc.get(37.74, 127.05), null, '6시간을 넘으면 쓰지 않는다');
});
t('8초 타임아웃: 응답이 오지 않으면 끊고 조용히 null(여기서는 40ms로 줄여 확인), 기본값은 8000', async () => {
  assert.strictEqual(W.TIMEOUT_MS, 8000);
  const { svc, calls } = mk(() => new Promise(() => {}), { timeoutMs: 40 }); svc.setConsent(true);
  const t0 = Date.now(); assert.strictEqual(await svc.get(37.74, 127.05), null); assert.ok(Date.now() - t0 < 1000);
  assert.ok(calls[0].o.signal, 'AbortSignal을 넘긴다');
});
t('알람과 충돌하지 않는다: 날씨 요청을 몰아 보내도(느린 응답 40건) 1초 알람 타이머 같은 인터벌이 제때 돈다', async () => {
  const { svc } = mk(() => new Promise(r => setTimeout(() => r(okRes()), 120))); svc.setConsent(true);
  const ps = []; for (let i = 0; i < 40; i++) ps.push(svc.get(30 + i * 0.1, 127 + i * 0.1));
  const ticks = []; const iv = setInterval(() => ticks.push(Date.now()), 10);
  await Promise.all(ps); clearInterval(iv);
  assert.ok(ticks.length >= 5, `대기 중 틱 ${ticks.length}`);   // 120ms 동안 10ms 간격이면 이론상 12개지만, Windows 타이머 해상도(약 15.6ms)에서는 7~8개라 8 이상을 요구하면 가끔 실패했다. 막힘 여부는 아래 최대 간격 검사가 본다
  const gaps = ticks.slice(1).map((x, i) => x - ticks[i]); assert.ok(Math.max(...gaps) < 60, `최대 간격 ${Math.max(...gaps)}ms`);
  assert.ok(!/weather/.test(read('alarms.cjs')), '알람 스케줄러는 날씨 코드를 쓰지 않는다');
});

// ── 동네 검색 ───────────────────────────────────────────────────────────────
t('내장 도시: 250개 이상, id 중복 없음, 좌표는 한국 범위', () => {
  const list = cities.CITIES; assert.ok(list.length >= 250, `도시 ${list.length}개`);
  assert.strictEqual(new Set(list.map(c => c.id)).size, list.length);
  for (const c of list) { assert.ok(c.id && c.name && c.parent && c.id.includes(':'), JSON.stringify(c)); assert.ok(c.lat > 33 && c.lat < 39 && c.lon > 124.5 && c.lon < 132, c.id); }
  assert.strictEqual(cities.cityById(''), null); assert.strictEqual(cities.cityById('없는id'), null);
});
t('동네 검색: 노량진 → 동작구 · 노량진동, 홍대·판교·해운대, 후보는 최대 5개', () => {
  const s = (q) => search.searchPlaces(q);
  assert.strictEqual(s('노량진')[0].label, '동작구 · 노량진동'); assert.strictEqual(s('노량진')[0].city.name, '동작구');
  assert.ok(/마포구/.test(s('홍대')[0].label)); assert.ok(/분당/.test(s('판교')[0].city.name + s('판교')[0].label));
  assert.ok(s('해운대').some(h => /해운대/.test(h.label)));
  for (const q of ['중앙동', '동', '서울', '구']) assert.ok(s(q).length <= 5, q);
});
t('동네 검색: 같은 이름(중앙동)은 시·군·구로 구분되고 같은 글이 겹치지 않는다', () => {
  const hits = search.searchPlaces('중앙동'); assert.ok(hits.length >= 2);
  assert.strictEqual(new Set(hits.map(h => h.label)).size, hits.length, '라벨 중복 없음');
  assert.ok(hits.every(h => h.label.includes(' · ') && h.label.includes('중앙동')));
});
t('동네 검색: 초성("ㄴㄹㅈ")·"동작구 노량진"·"서울 노량진"·앞부분/부분 일치·없는 이름은 빈 결과', () => {
  const s = (q) => search.searchPlaces(q);
  assert.ok(s('ㄴㄹㅈ').some(h => h.name.startsWith('노량진')), '초성'); assert.strictEqual(s('동작구 노량진')[0].label, '동작구 · 노량진동');
  assert.strictEqual(s('서울 노량진')[0].label, '동작구 · 노량진동'); assert.strictEqual(s('동작구노량진')[0].label, '동작구 · 노량진동');
  assert.ok(s('노량').some(h => h.label === '동작구 · 노량진동'), '앞부분'); assert.deepStrictEqual(s('쀍쀍쀍'), []); assert.deepStrictEqual(s('   '), []);
});
t('시·군·구 이름이 겹치면(중구·동구…) 시·도를 붙여 구분한다', () => {
  assert.strictEqual(search.cityLabel(cities.cityById('sl:중구')), '서울 중구'); assert.strictEqual(search.cityLabel(cities.cityById('sl:동작구')), '동작구');
  assert.ok(cities.CITIES.filter(c => c.name === '중구').length > 1);
});
t('동네 고르면 시·군·구 id와 좌표를 쓴다(동네 이름·주소는 저장하지 않는다), 자료는 UTF-8(BOM 없음)', () => {
  const c = search.searchPlaces('노량진')[0].city; assert.ok(c.id.includes(':') && Number.isFinite(c.lat) && Number.isFinite(c.lon));
  for (const f of ['src/data/cities.ts', 'src/data/places.json', 'src/data/placeAliases.ts', 'src/data/weatherHello.ts', 'src/utils/citySearch.ts', 'src/utils/weatherHello.ts', 'src/components/settings/WeatherCityRow.tsx', 'weather.cjs']) {
    const buf = fs.readFileSync(path.join(root, f)); assert.ok(!(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF), `${f} BOM`); assert.ok(!buf.toString('utf8').includes(FFFD), `${f} 깨짐`);
  }
  assert.ok(Object.keys(places.cities).length > 200); assert.ok(Object.values(places.cities).join('|').split('|').length > 5000);
  assert.ok(aliases.PLACE_ALIASES.length > 200 && aliases.PLACE_ALIASES.every(([a, ...ids]) => a && ids.every(id => cities.cityById(id))), '별칭은 모두 유효한 시·군·구');
  assert.ok(!/fetch|XMLHttpRequest|geolocation/.test(read('src/utils/citySearch.ts')), '검색에 네트워크·위치 감지 없음');
});

// ── 안부 판단 ───────────────────────────────────────────────────────────────
// 기준 시각: 2026-10-23 09:00 (로컬). 시간별 값은 now부터 1시간 간격.
const NOW = new Date(2026, 9, 23, 9, 0, 0).getTime();
const mkSnap = (cur = {}, f = () => ({}), at = NOW) => ({ at, data: { temp: 12, feels: 12, code: 3, wind: 2, ...cur, hours: Array.from({ length: 36 }, (_, i) => ({ at: NOW + (i - 0) * HOUR, temp: 12, feels: 12, pop: 0, code: 3, wind: 2, ...f(i) })) } });
const kinds = (snap, times = {}, now = NOW) => H.helloCandidates(snap, now, times).map(c => c.kind);

t('지금 기온: "지금은 6도예요", 체감과 3도 이상 차이 나면 체감도 말한다, 영하 표기', () => {
  const a = H.helloCandidates(mkSnap({ temp: 6, feels: 5 }), NOW); assert.deepStrictEqual(a.map(c => c.kind), ['now']);
  assert.ok(a[0].texts.length >= 3 && a[0].texts.every(x => x.includes('6도') && !x.includes('{')));
  const b = H.helloCandidates(mkSnap({ temp: 6, feels: 3 }), NOW)[0]; assert.ok(b.texts.every(x => x.includes('6도') && x.includes('3도') && x.includes('체감')), JSON.stringify(b.texts));
  const c = H.helloCandidates(mkSnap({ temp: -2, feels: -6 }), NOW)[0]; assert.ok(c.texts.every(x => x.includes('영하 2도') && x.includes('영하 6도')));
  assert.ok(helloData.HELLO_TEXTS.now.includes('지금은 {t}예요'));
});
t('점심·퇴근 예보: 추움·더움·비(확률 60%/비 코드)·눈·바람, 설정된 시간만, 기준값은 상수', () => {
  const at = (h) => h; // 시간별 f(i): i = now로부터의 시간
  const times = { lunch: '12:00', leave: '17:00' };
  assert.deepStrictEqual(kinds(mkSnap({}, (i) => (i === 8? { feels: 3 } : {})), times), ['leaveCold', 'now']);
  assert.deepStrictEqual(kinds(mkSnap({}, (i) => (i === 3 ? { feels: 30, temp: 30 } : {})), times), ['lunchHot', 'now']);
  assert.ok(kinds(mkSnap({}, (i) => (i === 8? { pop: 60 } : {})), times).includes('leaveRain'), '확률 60%');
  assert.ok(!kinds(mkSnap({}, (i) => (i === 8? { pop: 59 } : {})), times).includes('leaveRain'), '확률 59%는 비 아님');
  assert.ok(kinds(mkSnap({}, (i) => (i === 8? { code: 61 } : {})), times).includes('leaveRain'), '비 날씨 코드');
  assert.ok(kinds(mkSnap({}, (i) => (i === 3 ? { code: 73 } : {})), times).includes('lunchSnow'));
  assert.ok(kinds(mkSnap({}, (i) => (i === 8? { wind: 8 } : {})), times).includes('leaveWind')); assert.ok(!kinds(mkSnap({}, (i) => (i === 8? { wind: 7.9 } : {})), times).includes('leaveWind'));
  assert.ok(kinds(mkSnap({}, (i) => (i === 8? { feels: 5 } : {})), times).includes('leaveCold')); assert.ok(!kinds(mkSnap({}, (i) => (i === 8? { feels: 6 } : {})), times).includes('leaveCold'));
  assert.ok(kinds(mkSnap({}, (i) => (i === 8? { feels: 28 } : {})), times).includes('leaveHot'));
  assert.strictEqual(H.forecastKind({ at: 0, temp: 0, feels: 0, pop: 90, code: 73, wind: 20 }), 'Snow', '눈 > 비 > 바람 > 추움 > 더움');
  assert.strictEqual(H.forecastKind({ at: 0, temp: 0, feels: 0, pop: 90, code: 3, wind: 20 }), 'Rain');
  assert.strictEqual(H.forecastKind({ at: 0, temp: 0, feels: 0, pop: 0, code: 3, wind: 20 }), 'Wind');
  assert.strictEqual(H.forecastKind({ at: 0, temp: 0, feels: 0, pop: 0, code: 3, wind: 1 }), 'Cold');
  // 알람 켜짐 여부와 상관없이 홈의 시간 설정값이 기준: 설정이 없으면(비어 있으면) 기본값 점심 12:00·퇴근 17:00이 아니라 18:00 — 8시간 규칙은 그대로 적용된다
  assert.strictEqual(H.DEFAULT_LUNCH_TIME, '12:00'); assert.strictEqual(H.DEFAULT_LEAVE_TIME, '18:00');
  const coldAt = (idx) => mkSnap({}, (i) => (i === idx ? { feels: 0 } : {}));
  assert.ok(kinds(coldAt(3), {}).includes('lunchCold'), '설정이 없으면 점심 12:00 기본값(지금 09:00 → 3시간 뒤)');
  for (const empty of [null, undefined, '', 'abc', '25:99']) assert.ok(kinds(coldAt(3), { lunch: empty, leave: empty }).includes('lunchCold'), `비어 있거나 틀리면 기본값: ${empty}`);
  assert.ok(!kinds(coldAt(9), {}).includes('leaveCold'), '기본 퇴근 18:00은 지금(09:00)부터 9시간 뒤라 8시간 규칙으로 제외');
  const late = new Date(2026, 9, 23, 12, 30).getTime(); const s3 = { at: late, data: { temp: 12, feels: 12, code: 3, wind: 2, hours: Array.from({ length: 12 }, (_, i) => ({ at: new Date(2026, 9, 23, 12 + i, 0).getTime(), temp: 5, feels: i === 6 ? 0 : 12, pop: 0, code: 3, wind: 2 })) } };
  assert.ok(kinds(s3, {}, late).includes('leaveCold'), '기본 퇴근 18:00(5.5시간 뒤)은 예보'); assert.ok(!kinds(s3, {}, late).includes('lunchCold'), '점심 12:00은 이미 지남');
  // 사용자가 시간을 바꾸면 그 시간 기준으로 문구가 바뀐다(퇴근 19:00 → 7시간 뒤 예보 시각이 달라진다)
  assert.ok(!kinds(s3, { leave: '19:00' }, late).includes('leaveCold'), '퇴근 19:00으로 바꾸면 18시 예보가 아니라 19시 값을 본다');
  const s4 = { at: late, data: { ...s3.data, hours: s3.data.hours.map((h, i) => ({ ...h, feels: i === 7 ? 0 : 12 })) } };
  assert.ok(kinds(s4, { leave: '19:00' }, late).includes('leaveCold'), '바뀐 퇴근 시간(19:00)의 예보로 "퇴근할 땐 …" 문구'); assert.ok(!kinds(s4, {}, late).includes('leaveCold'));
  assert.ok(kinds(s4, { leave: '19:00', lunch: '14:00' }, late).includes('leaveCold') && !kinds(s4, { lunch: '14:00' }, late).includes('lunchCold'), '점심 14:00으로 바꾸면 그 시간 값(추위 없음)');
});
t('점심·퇴근 예보: 이미 지난 시간 제외, 정각이면 지난 것으로 보고, 8시간 넘게 남으면 제외, 8시간 이내만', () => {
  const cold = () => ({ feels: 0 });
  const snap = mkSnap({}, cold);
  assert.ok(!kinds(snap, { leave: '08:59' }).some(k => k.startsWith('leave')), '1분 전');
  assert.ok(!kinds(snap, { leave: '09:00' }).some(k => k.startsWith('leave')), '정각은 지난 것');
  assert.ok(kinds(snap, { leave: '09:01' }).includes('leaveCold'));
  assert.ok(kinds(snap, { leave: '17:00' }).includes('leaveCold'), '정확히 8시간 뒤');
  assert.ok(!kinds(snap, { leave: '17:01' }).some(k => k.startsWith('leave')), '8시간 1분 뒤는 제외');
  assert.ok(!kinds(snap, { leave: '25:00' }).some(k => k.startsWith('leave')) && !kinds(snap, { leave: 'abc' }).some(k => k.startsWith('leave')), '잘못된 시각');
  // 자정 근처: 23:30에 내일 아침 예보는 보지 않는다(오늘 시각만), 23:50에 퇴근 23:55는 예보
  const late = new Date(2026, 9, 23, 23, 50).getTime(); const s2 = { at: late, data: { temp: 5, feels: 5, code: 3, wind: 1, hours: Array.from({ length: 10 }, (_, i) => ({ at: late - 50 * MIN + i * HOUR, temp: 5, feels: 0, pop: 0, code: 3, wind: 1 })) } };
  assert.ok(kinds(s2, { leave: '23:55' }, late).includes('leaveCold')); assert.ok(!kinds(s2, { leave: '00:30' }, late).some(k => k.startsWith('leave')), '자정 넘긴 시각은 오늘 기준으로 이미 지남');
});
t('stale: 값이 5시간을 넘게 오래됐으면 시간이 들어간 예보 문구를 쓰지 않고, 2시간 넘으면 "지금" 문구도 쓰지 않는다', () => {
  const f = (i) => ({ feels: 0 });
  const fresh = mkSnap({ code: 61 }, f, NOW - 20 * MIN); assert.ok(kinds(fresh, { leave: '17:00' }).includes('leaveCold'));
  const old = mkSnap({ code: 61 }, f, NOW - 3 * HOUR); const ks = kinds(old, { leave: '17:00' }); assert.ok(ks.includes('leaveCold') === true && !ks.includes('now'), '3시간: 예보는 되고 지금 문구는 없음');
  const older = mkSnap({ code: 61 }, f, NOW - (5 * HOUR + MIN)); assert.deepStrictEqual(kinds(older, { leave: '17:00', lunch: '12:00' }), []);
  assert.deepStrictEqual(kinds(null), []); assert.deepStrictEqual(kinds(mkSnap({}, () => ({}), NOW + HOUR)), [], '시계가 거꾸로 간 값은 쓰지 않는다');
});
t('지금 비·눈·바람·맑음: 해당할 때만 후보', () => {
  assert.ok(kinds(mkSnap({ code: 63 })).includes('nowRain')); assert.ok(kinds(mkSnap({ code: 81 })).includes('nowRain')); assert.ok(kinds(mkSnap({ code: 95 })).includes('nowRain'));
  assert.ok(kinds(mkSnap({ code: 71 })).includes('nowSnow')); assert.ok(kinds(mkSnap({ code: 86 })).includes('nowSnow')); assert.ok(!kinds(mkSnap({ code: 71 })).includes('nowRain'));
  assert.ok(kinds(mkSnap({ wind: 9 })).includes('wind')); assert.ok(!kinds(mkSnap({ wind: 3 })).includes('wind')); assert.ok(!kinds(mkSnap({ wind: null })).includes('wind'));
  assert.ok(kinds(mkSnap({ code: 0, temp: 18 })).includes('fair')); assert.ok(kinds(mkSnap({ code: 1, temp: 10 })).includes('fair')); assert.ok(kinds(mkSnap({ code: 1, temp: 25 })).includes('fair'));
  assert.ok(!kinds(mkSnap({ code: 1, temp: 9 })).includes('fair')); assert.ok(!kinds(mkSnap({ code: 1, temp: 26 })).includes('fair')); assert.ok(!kinds(mkSnap({ code: 3, temp: 18 })).includes('fair'), '흐림은 아님');
});
t('평범한 날에는 지금 기온 문구만 후보, 후보가 하나도 없으면 안부는 나오지 않는다', () => {
  assert.deepStrictEqual(kinds(mkSnap({ temp: 15, feels: 15, code: 3 }), { lunch: '12:00', leave: '17:00' }), ['now']);
  assert.strictEqual(H.pickHello([], { kind: null, text: null }), null);
});
t('문구: 종류마다 3개 이상, 해요체, 깨짐·금지어 없음, 말풍선 두 줄 안에 들어가는 길이, 요청한 문구 포함', () => {
  const bad = ['반드시', '무조건', '절대', '위험', '큰일', '재난', '??'];
  const all = [];
  for (const [k, list] of Object.entries(helloData.HELLO_TEXTS)) { assert.ok(list.length >= 3, k); assert.strictEqual(new Set(list).size, list.length, `${k} 중복`); for (const x of list) { all.push(x); } }
  for (const x of [...all, ...helloData.HELLO_NOW_FEELS]) { assert.ok(!x.includes(FFFD) && x.trim() === x, x); for (const b of bad) assert.ok(!x.includes(b), x); assert.ok(Array.from(x.replace('{t}', '12도').replace('{f}', '영하 10도')).length <= 28, `${x} 길이`); assert.ok(/[요네까]|☔|❄️|🍃|💧|🧥|☀️/.test(x.slice(-3)) || /요|네/.test(x), x); }
  assert.ok(helloData.HELLO_NOW_FEELS.length >= 3);
  assert.ok(helloData.HELLO_TEXTS.leaveCold.includes('퇴근할 땐 추울 것 같아요, 겉옷 챙겨요')); assert.ok(helloData.HELLO_TEXTS.lunchHot.includes('점심 때는 더울 것 같아요'));
  assert.ok(helloData.HELLO_TEXTS.leaveRain.includes('퇴근길에 비 올 것 같아요, 우산 챙겨요 ☔')); assert.ok(helloData.HELLO_TEXTS.leaveSnow.includes('퇴근할 땐 눈 올 것 같아요'));
  assert.ok(helloData.HELLO_TEXTS.wind.includes('오늘은 바람이 많이 부네요')); assert.ok(helloData.HELLO_TEXTS.nowRain.includes('밖에 비가 오네요, 우산 챙겼어요?')); assert.ok(helloData.HELLO_TEXTS.nowSnow.includes('눈이 오고 있어요 ❄️')); assert.ok(helloData.HELLO_TEXTS.fair.includes('날씨가 좋아요, 잠깐 산책 어때요'));
});
t('고르기: 직전과 같은 종류·같은 문구가 연속하지 않는다(5,000번), 후보가 하나뿐이면 문구만 바뀐다', () => {
  let seed = 7; const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const cands = H.helloCandidates(mkSnap({ code: 61, wind: 9, temp: 18 }, (i) => (i === 8? { feels: 0 } : {})), NOW, { leave: '17:00' });
  assert.ok(cands.length >= 4); const last = { kind: null, text: null }; let prev = null; const seen = new Set();
  for (let i = 0; i < 5000; i++) { const p = H.pickHello(cands, last, rand); assert.ok(p); if (prev) { assert.notStrictEqual(p.kind, prev.kind); assert.notStrictEqual(p.text, prev.text); } prev = p; last.kind = p.kind; last.text = p.text; seen.add(p.kind); }
  assert.strictEqual(seen.size, cands.length, '모든 종류가 나온다');
  const one = H.helloCandidates(mkSnap({ temp: 15, feels: 15 }), NOW); const l2 = { kind: null, text: null }; let pv = null;
  for (let i = 0; i < 300; i++) { const p = H.pickHello(one, l2, rand); if (pv) assert.notStrictEqual(p.text, pv.text); pv = p; l2.text = p.text; l2.kind = p.kind; }
});
// 롤링 비중·연속 금지·셔플 백은 tests/bubble-roll-unit.cjs에서 확인한다(날씨 안부 몫은 20%로 바뀌었다).

// ── 엔진 연결·설정 호환(정적 확인) ──────────────────────────────────────────
t('엔진: 날씨 안부는 기존 말풍선 경로(idleBubble kind message)로만, 새 종류·우선순위·보호 없음, 초집중·알람 중에는 건너뜀', () => {
  const pet = read('src/pages/PetPage.tsx'); const eng = pet.slice(pet.indexOf('★ 말풍선 엔진'), pet.indexOf('// ★ 졸림방지'));
  assert.ok(/helloCandidates\(weatherRef\.current, now/.test(eng) && /pickRollKind\(/.test(eng) && /pickHello\(cands, lastHello, Math\.random/.test(eng));
  assert.ok(/const active = !paused && cur\.bubbleEnabled !== false && !focusRef\.current\.enabled/.test(eng), '알림·토스트 중(paused)·초집중·말풍선 끔에서는 안부 후보 자체를 만들지 않는다');
  assert.ok(/if \(active && !picked\)/.test(eng) && /const cands = weatherRef\.current \?/.test(eng), '활성일 때만 종류를 뽑는다');
  assert.ok(/kind: 'message' \| 'clock'/.test(pet) && !/'weather'/.test(pet.replace(/\/\/.*$/gm, '')), "새 말풍선 종류('weather') 없음");
  assert.ok(/\{ lunch: cur\.lunchTime, leave: cur\.leaveTime \}/.test(eng) && !/lunchEnabled|leaveEnabled/.test(eng), '점심·퇴근 시간은 홈의 시간 설정값을 알람 켜짐과 상관없이 따른다');
  assert.ok(/bubbleShowSec/.test(eng) && /bubbleGapSec/.test(eng), '표시 시간·간격은 기존 설정 그대로');
  assert.ok(!/priority|protect|LEVEL/i.test(read('src/utils/weatherHello.ts')), '우선순위·보호 없음');
});
t('날씨 값 가져오기: 동네와 동의가 모두 있을 때만 메인에 부탁하고, 25분 안에는 다시 부탁하지 않고, 동네가 바뀌면 이전 값은 버린다', () => {
  const pet = read('src/pages/PetPage.tsx'); const fx = pet.slice(pet.indexOf('★ 날씨 안부'), pet.indexOf('// ★ 말풍선 엔진'));
  assert.ok(/!cur\.weatherConsent \|\| !city\) \{ weatherRef\.current = null/.test(fx) && /Date\.now\(\) - w\.at < 25 \* 60 \* 1000\) return/.test(fx) && /weatherCityRef\.current !== city\.id/.test(fx));
  assert.ok(/getWeather\?\.\(city\.lat, city\.lon\)/.test(fx) && /clearInterval\(timer\)/.test(fx) && /catch/.test(fx));
  const main = read('main.cjs'); assert.ok(/weatherService\.setConsent\(settings\.weatherConsent && typeof settings\.weatherCityId === 'string' && settings\.weatherCityId !== ''\)/.test(main), '메인은 동의와 동네가 모두 있을 때만 요청을 허용');
  assert.ok(/ipcMain\.handle\('weather-get'/.test(main) && /getWeather:\s+\(lat, lon\) => ipcRenderer\.invoke\('weather-get'/.test(read('preload.cjs')));
  assert.ok(!/fetch\(|XMLHttpRequest/.test(read('src/pages/PetPage.tsx')) && !/fetch\(|XMLHttpRequest/.test(read('src/components/settings/WeatherCityRow.tsx')), '렌더러는 네트워크를 쓰지 않는다');
  assert.ok(read('package.json').includes('"weather.cjs"'), '패키지에 weather.cjs 포함');
});
t('설정 호환: weatherCityId 기본 빈 문자열·weatherConsent 기본 false, 예전 설정은 그대로 읽힌다, 마이그레이션은 건드리지 않음', () => {
  assert.strictEqual(settingsTs.DEFAULT_SETTINGS.weatherCityId, ''); assert.strictEqual(settingsTs.DEFAULT_SETTINGS.weatherConsent, false);
  const old = { bubbleClock: false, lunchTime: '11:30' }; const merged = { ...settingsTs.DEFAULT_SETTINGS, ...old };
  assert.strictEqual(merged.weatherCityId, ''); assert.strictEqual(merged.weatherConsent, false); assert.strictEqual(merged.bubbleClock, false);
  const m = settingsTs.migrateSettings({ breakTimeEnabled: true }); assert.ok(!('weatherCityId' in m.settings) && !('weatherConsent' in m.settings), '마이그레이션이 새 키를 만들지 않는다');
  const pet = read('src/pages/PetPage.tsx'); assert.ok(/weatherCityId: '', weatherConsent: false/.test(pet));
});
t('설정 화면: 동의 전에는 저장하지 않고 [좋아요]에서만 동네와 동의를 함께 저장, [지우기]는 동네 삭제와 동의 철회, 표기·칩 8개 유지', () => {
  const row = read('src/components/settings/WeatherCityRow.tsx'), home = read('src/components/settings/HomePane.tsx');
  const yes = row.slice(row.indexOf('const yes = () =>'), row.indexOf('return (\n    <div className="st-weather">'));
  assert.ok(/patch\(\{ weatherCityId: pending\.id, weatherConsent: true \}\)/.test(yes), '[좋아요]에서 둘을 함께 저장');
  assert.strictEqual((row.match(/patch\(/g) || []).length, 2, 'patch는 [좋아요]와 [지우기] 두 곳뿐(후보를 고르기만 해서는 저장 없음)');
  assert.ok(/onClick=\{\(\) => setPending\(h\.city\)\}/.test(row) && /patch\(\{ weatherCityId: '', weatherConsent: false \}\)/.test(row));
  assert.ok(row.includes('이 동네의 날씨를 안부처럼 전해드릴게요. 선택한 동네의 대략적인 좌표가 날씨 서비스(Open-Meteo)로 전송돼요. 이름·사진·알람 같은 정보는 보내지 않아요.'));
  assert.ok(row.includes('좋아요') && row.includes('취소') && row.includes('날씨 안부: 동네') && row.includes('날씨 데이터: Open-Meteo (CC BY 4.0)'));
  assert.ok(home.includes('<WeatherCityRow settings={s} patch={patch} />') && home.includes('{WEATHER_CREDIT}'));
  const ids = [...home.matchAll(/^\s+id: '([a-z]+)', label:/gm)].map(m => m[1]); assert.strictEqual(ids.length, 8, `홈 칩 ${ids.length}개`);
});

(async () => {
  let n = 0;
  for (const [name, fn] of queue) { try { await fn(); n++; console.log(`  ok  ${name}`); } catch (e) { console.error(`FAIL  ${name}\n`, e); process.exit(1); } }
  console.log(`\n${n}개 통과`);
})();
