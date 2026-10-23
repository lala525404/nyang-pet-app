// 날씨 단위 테스트: 실제 API는 부르지 않는다(가짜 fetch와 가짜 시계). 도시 검색, 문구 선택, 캐시·실패 처리, 동의 전 호출 0건, 좌표 반올림, 개인정보 없음, 설정 호환.
// `node tests/weather-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const W = require('../weather.cjs');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, (p) => deps[p] || ({ seedFreshTheme() {} }), { getItem: () => null, setItem() {} }, { location: { hash: '' } }); return m.exports;
};
const cities = load('src/data/cities.ts');
const S = load('src/utils/citySearch.ts', { '../data/cities': cities });
const fortuneData = load('src/data/fortune.ts');
const fortune = load('src/utils/fortune.ts', { '../data/fortune': fortuneData });
const wdata = load('src/data/weatherText.ts');
const T = load('src/utils/weatherText.ts', { '../data/weatherText': wdata, './fortune': fortune });
const settingsTs = load('src/utils/settings.ts');
const FFFD = String.fromCharCode(0xFFFD);

// 실제 응답 구조(Open-Meteo, 2026-10-23에 한 번 호출해 확인한 모양)
const SAMPLE = { latitude: 37.75, longitude: 127.0625, utc_offset_seconds: 32400, timezone: 'Asia/Seoul',
  current_units: { temperature_2m: '°C' }, current: { time: '2026-10-23T13:15', interval: 900, temperature_2m: 18.2, apparent_temperature: 17.9, weather_code: 1 },
  daily_units: {}, daily: { time: ['2026-10-23'], weather_code: [2], temperature_2m_max: [19.1], temperature_2m_min: [4.9], precipitation_probability_max: [7], precipitation_sum: [0.0] } };
const okRes = (json = SAMPLE) => ({ ok: true, status: 200, json: async () => json });
const mk = (impl, opts = {}) => { const calls = []; let now = 1_000_000; const clock = { get: () => now, add: (ms) => { now += ms; } };
  const svc = W.createWeatherService({ fetch: async (url, o) => { calls.push({ url, o }); return impl(url, o, calls.length); }, now: clock.get, timeoutMs: opts.timeoutMs });
  return { svc, calls, clock }; };
const MIN = 60 * 1000;

// ── 요청 모양 ───────────────────────────────────────────────────────────────
t('요청 주소: 좌표는 소수점 2자리로 반올림, 필요한 필드만, 다른 키 없음', () => {
  const u = new URL(W.buildUrl(37.7449, 127.0551));
  assert.strictEqual(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.strictEqual(u.searchParams.get('latitude'), '37.74'); assert.strictEqual(u.searchParams.get('longitude'), '127.06');
  assert.deepStrictEqual([...u.searchParams.keys()].sort(), ['current', 'daily', 'forecast_days', 'latitude', 'longitude', 'timezone']);
  assert.strictEqual(u.searchParams.get('current'), 'temperature_2m,apparent_temperature,weather_code');
  assert.strictEqual(u.searchParams.get('daily'), 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum');
  assert.strictEqual(u.searchParams.get('timezone'), 'auto'); assert.strictEqual(u.searchParams.get('forecast_days'), '1');
  assert.strictEqual(new URL(W.buildUrl(35, 129)).searchParams.get('latitude'), '35.00');
});
t('요청에 좌표 외 개인정보·앱 식별자가 없다: 헤더는 Accept뿐, 주소에 사용자·앱 이름 없음', async () => {
  const { svc, calls } = mk(() => okRes()); svc.setConsent(true);
  await svc.get(37.7449, 127.0551);
  const { url, o } = calls[0];
  assert.deepStrictEqual(Object.keys(o.headers), ['Accept']);
  for (const w of ['choeae', 'nyang', '최애', 'user', 'name', 'email', 'id=', 'appid', 'key=', 'token', 'photo', 'alarm']) assert.ok(!url.toLowerCase().includes(w), w);
  assert.strictEqual(new URL(url).search.split('&').length, 6);
  assert.strictEqual(url.startsWith('https://'), true);
});
t('응답 파싱: 실제 구조 → 값, 모양이 다르면 null', () => {
  assert.deepStrictEqual(W.parseResponse(SAMPLE), { temp: 18.2, feels: 17.9, code: 1, max: 19.1, min: 4.9, pop: 7, precip: 0 });
  for (const bad of [null, {}, { current: {}, daily: {} }, { current: { temperature_2m: 'x', weather_code: 1 }, daily: { temperature_2m_max: [1], temperature_2m_min: [1] } }]) assert.strictEqual(W.parseResponse(bad), null);
  const noPop = JSON.parse(JSON.stringify(SAMPLE)); delete noPop.daily.precipitation_probability_max; delete noPop.current.apparent_temperature;
  const r = W.parseResponse(noPop); assert.strictEqual(r.pop, null); assert.strictEqual(r.feels, r.temp);
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
t('30분 캐시: 29분 안에는 다시 부르지 않고, 30분이 지나면 다시 부른다', async () => {
  const { svc, calls, clock } = mk(() => okRes()); svc.setConsent(true);
  const a = await svc.get(37.74, 127.05); assert.strictEqual(a.stale, false); assert.strictEqual(a.data.temp, 18.2);
  clock.add(29 * MIN); await svc.get(37.74, 127.05); assert.strictEqual(calls.length, 1);
  clock.add(2 * MIN); await svc.get(37.74, 127.05); assert.strictEqual(calls.length, 2);
  await svc.get(35.1, 129.03); assert.strictEqual(calls.length, 3, '다른 도시는 따로');
  await svc.get(37.7449, 127.0451); assert.strictEqual(calls.length, 3, '반올림하면 같은 좌표(37.74, 127.05)는 같은 캐시');
});
t('같은 시각 중복 요청 금지: 동시에 여러 번 불러도 요청은 하나', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const { svc, calls } = mk(async () => { await gate; return okRes(); }); svc.setConsent(true);
  const ps = [svc.get(37.74, 127.05), svc.get(37.74, 127.05), svc.get(37.7401, 127.0499)];
  release(); const rs = await Promise.all(ps);
  assert.strictEqual(calls.length, 1); assert.ok(rs.every(r => r && r.data.code === 1));
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
  clock.add(40 * MIN); const a = await svc.get(37.74, 127.05); assert.ok(a && a.stale === true && a.data.temp === 18.2);
  clock.add(5 * 60 * MIN + 30 * MIN + 10 * MIN); assert.strictEqual(await svc.get(37.74, 127.05), null, '6시간을 넘으면 쓰지 않는다');
});
t('8초 타임아웃: 응답이 오지 않으면 끊고 조용히 null(여기서는 40ms로 줄여 확인), 기본값은 8000', async () => {
  assert.strictEqual(W.TIMEOUT_MS, 8000);
  const { svc, calls } = mk(() => new Promise(() => {}), { timeoutMs: 40 }); svc.setConsent(true);
  const t0 = Date.now(); assert.strictEqual(await svc.get(37.74, 127.05), null); assert.ok(Date.now() - t0 < 1000);
  assert.ok(calls[0].o.signal, 'AbortSignal을 넘긴다');
});
t('이벤트 루프를 막지 않는다: 느린 응답을 기다리는 동안에도 타이머(알람 1초 인터벌 같은)가 제때 돈다', async () => {
  const { svc } = mk(() => new Promise(r => setTimeout(() => r(okRes()), 120))); svc.setConsent(true);
  const p = svc.get(37.74, 127.05); const ticks = [];
  const iv = setInterval(() => ticks.push(Date.now()), 10);
  await p; clearInterval(iv);
  assert.ok(ticks.length >= 8, `대기 중 틱 ${ticks.length}`);
  const gaps = ticks.slice(1).map((x, i) => x - ticks[i]); assert.ok(Math.max(...gaps) < 60, `최대 간격 ${Math.max(...gaps)}ms`);
});

// ── 도시 ────────────────────────────────────────────────────────────────────
t('내장 도시: 250개 이상, id 중복 없음, 좌표는 한국 범위, 필수 값이 있다', () => {
  const list = cities.CITIES; assert.ok(list.length >= 250, `도시 ${list.length}개`);
  assert.strictEqual(new Set(list.map(c => c.id)).size, list.length);
  for (const c of list) {
    assert.ok(c.id && c.name && c.parent, JSON.stringify(c)); assert.ok(c.id.includes(':'));
    assert.ok(c.lat >= 33 && c.lat <= 38.7 && c.lon >= 124.5 && c.lon <= 131, `${c.name} ${c.lat},${c.lon}`);
    assert.ok(!c.name.includes(FFFD) && !c.parent.includes(FFFD));
  }
  const ui = cities.CITIES.find(c => c.name === '의정부시'); assert.deepStrictEqual([ui.parent, ui.lat, ui.lon], ['경기도', 37.74, 127.05]);
  for (const id of cities.UNCERTAIN_CITY_IDS) assert.ok(cities.cityById(id), `불확실 목록의 id가 없음: ${id}`);
  assert.strictEqual(cities.cityById('없는'), null); assert.strictEqual(cities.cityById(''), null);
});
t('도시 검색: 부분 일치, 공백 무시, 시/군/구 생략, 초성, 상위 지역, 최대 3개, 없으면 빈 목록', () => {
  const names = (q) => S.searchCities(q).map(c => c.name);
  assert.strictEqual(names('의정부')[0], '의정부시'); assert.strictEqual(names('의정부시')[0], '의정부시');
  assert.strictEqual(names('의 정 부')[0], '의정부시'); assert.strictEqual(names('  의정부  ')[0], '의정부시');
  assert.strictEqual(names('ㅇㅈㅂ')[0], '의정부시', '초성');
  assert.deepStrictEqual(S.searchCities('부산 중구').map(c => c.id).slice(0, 1), ['bs:중구']); assert.strictEqual(S.searchCities('부산중구')[0].id, 'bs:중구');
  assert.strictEqual(S.searchCities('서울 강서')[0].id, 'sl:강서구');
  assert.ok(S.searchCities('중구').length === 3 && S.searchCities('중구').every(c => c.name === '중구'));
  assert.ok(S.searchCities('경기').length <= 3 && S.searchCities('경기').every(c => c.parent === '경기도'));
  assert.ok(names('수원')[0] === '수원시');
  assert.deepStrictEqual(S.searchCities(''), []); assert.deepStrictEqual(S.searchCities('   '), []); assert.deepStrictEqual(S.searchCities('zzzzqq'), []); assert.deepStrictEqual(S.searchCities('없는동네'), []);
  for (const q of ['시', '구', '군', 'ㅅ', '서', '광']) assert.ok(S.searchCities(q).length <= 3);
  assert.strictEqual(S.searchCities('제주')[0].name, '제주시');
  assert.ok(/^의정부시 · 경기$/.test(S.cityLabel(S.searchCities('의정부')[0])));
});

// ── 문구 ────────────────────────────────────────────────────────────────────
t('날씨 코드 → 종류: 맑음/흐림/안개/비/눈/뇌우, 강수 확률 60% 이상이면 비', () => {
  const k = T.weatherKind;
  for (const c of [0, 1]) assert.strictEqual(k(c, 0), 'clear');
  for (const c of [2, 3]) assert.strictEqual(k(c, 10), 'cloudy');
  for (const c of [45, 48]) assert.strictEqual(k(c, 0), 'fog');
  for (const c of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]) assert.strictEqual(k(c, 0), 'rain', String(c));
  for (const c of [71, 73, 75, 77, 85, 86]) assert.strictEqual(k(c, 0), 'snow', String(c));
  for (const c of [95, 96, 97, 99]) assert.strictEqual(k(c, 0), 'storm');
  assert.strictEqual(k(1, 60), 'rain'); assert.strictEqual(k(3, 59), 'cloudy'); assert.strictEqual(k(0, null), 'clear'); assert.strictEqual(k(75, 90), 'snow');
});
t('기온 구간 경계: 영하 / 쌀쌀 / 선선 / 따뜻 / 더움', () => {
  const b = T.tempBand;
  assert.deepStrictEqual([-10, -0.1, 0, 9.9, 10, 16.9, 17, 25.9, 26, 38].map(b), ['freezing', 'freezing', 'chilly', 'chilly', 'cool', 'cool', 'warm', 'warm', 'hot', 'hot']);
});
t('문구 풀: 항목마다 3개 이상, 중복·빈 문자열·U+FFFD·물음표 깨짐 없음, 불안·단정 표현 없음', () => {
  const bad = ['반드시', '무조건', '절대', '위험', '사고', '큰일', '재난', '피해', '사망', '병원', '약을'];
  for (const [name, pool] of [['MORNING', wdata.MORNING], ['EVENING', wdata.EVENING], ['CURRENT', wdata.CURRENT]]) {
    for (const [key, list] of Object.entries(pool)) {
      assert.ok(list.length >= 3, `${name}.${key} ${list.length}개`); assert.strictEqual(new Set(list).size, list.length);
      for (const s of list) { assert.ok(s.trim() === s && s.length > 0); assert.ok(!s.includes(FFFD) && !/\?\?/.test(s), s); for (const w of bad) assert.ok(!s.includes(w), `${w} in ${s}`); }
    }
  }
  assert.deepStrictEqual(Object.keys(wdata.MORNING).sort(), ['chilly', 'cool', 'fog', 'freezing', 'hot', 'rain', 'snow', 'storm', 'warm']);
  assert.deepStrictEqual(Object.keys(wdata.EVENING).sort(), Object.keys(wdata.MORNING).sort());
  assert.deepStrictEqual(Object.keys(wdata.CURRENT).sort(), ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm']);
});
t('문구 선택: 종류·기온 구간에 맞는 풀에서 고르고, 숫자 표기가 붙는다, 같은 날은 같은 문구', () => {
  const d = new Date(2026, 9, 23, 8, 30);
  const rain = { temp: 12.4, feels: 11, code: 63, max: 18.2, min: 8.6, pop: 90, precip: 5 };
  const m = T.morningText(rain, d); assert.ok(m.endsWith(' 최고 18° / 최저 9°'), m);
  assert.ok(wdata.MORNING.rain.some(s => m.startsWith(s)));
  assert.strictEqual(T.morningText(rain, d), T.morningText(rain, new Date(2026, 9, 23, 9, 45)));
  const cold = { temp: -3.2, feels: -7, code: 0, max: 1.4, min: -5.6, pop: 0, precip: 0 };   // 평균 -2.1 → 영하
  assert.ok(wdata.MORNING.freezing.some(s => T.morningText(cold, d).startsWith(s))); assert.ok(T.morningText(cold, d).endsWith('최고 1° / 최저 -6°'));
  const hot = { temp: 31, feels: 34, code: 1, max: 33, min: 24, pop: 10, precip: 0 }; assert.ok(wdata.MORNING.hot.some(s => T.morningText(hot, d).startsWith(s)));
  const e = T.eveningText({ temp: 12.2, feels: 9, code: 2, max: 19, min: 8, pop: 10, precip: 0 }, d);
  assert.ok(wdata.EVENING.chilly.some(s => e.startsWith(s)) && e.endsWith('(지금 12°)'), e);   // 체감 9° → 쌀쌀
  assert.ok(wdata.EVENING.snow.some(s => T.eveningText({ ...rain, code: 73 }, d).startsWith(s)));
  assert.ok(wdata.EVENING.storm.some(s => T.eveningText({ ...rain, code: 95 }, d).startsWith(s)));
  const cur = T.currentText({ temp: 21.6, feels: 21.0, code: 0, max: 24, min: 12, pop: 0, precip: 0 }, d); assert.ok(cur.includes('22°'), cur); assert.ok(!cur.includes('체감'));
  assert.ok(T.currentText({ temp: 5, feels: 0, code: 3, max: 8, min: 1, pop: 0, precip: 0 }, d).includes('(체감 0°)'));
  for (const code of [0, 2, 45, 61, 73, 95]) assert.ok(!T.currentText({ temp: 10, feels: 10, code, max: 12, min: 5, pop: 0, precip: 0 }, d).includes('{t}'));
});
t('문구 풀 전체 조합을 돌려도 비어 있거나 NaN·undefined가 나오지 않는다', () => {
  for (let code = 0; code <= 99; code += 1) for (const t of [-15, 0, 9, 12, 20, 30]) for (const pop of [null, 0, 70]) {
    const w = { temp: t, feels: t - 1, code, max: t + 4, min: t - 4, pop, precip: 0 }, d = new Date(2026, 0, 1 + (code % 28), 9);
    for (const s of [T.morningText(w, d), T.eveningText(w, d), T.currentText(w, d)]) assert.ok(s && !/NaN|undefined|\{t\}/.test(s) && !s.includes(FFFD), s);
  }
});

// ── 설정 호환 ───────────────────────────────────────────────────────────────
t('설정 기본값: 날씨는 꺼짐·동의 없음·도시 없음, 예전 저장값(키 없음)도 꺼짐으로 읽힌다', () => {
  const d = settingsTs.DEFAULT_SETTINGS; assert.deepStrictEqual([d.weatherEnabled, d.weatherConsent, d.weatherCityId], [false, false, '']);
  const old = { bubbleEnabled: true, bubbleClock: true, bubbleIdle: 'clock', bubbleMessages: ['a'] };
  const r = settingsTs.migrateSettings(old); for (const k of ['weatherEnabled', 'weatherConsent', 'weatherCityId']) assert.ok(!(k in r.settings), '마이그레이션이 날씨 키를 새로 채우지 않는다');
  const merged = { ...d, ...r.settings }; assert.strictEqual(merged.weatherEnabled, false); assert.strictEqual(merged.bubbleIdle, 'clock');
  assert.strictEqual(settingsTs.bubbleIdleOf('weather'), 'weather'); assert.strictEqual(settingsTs.bubbleIdleOf('x'), 'clock');
});
t('알람 설정 키와 섞이지 않는다: 알람 모듈 기본값에 날씨 키가 없고, 알람 병합이 날씨 키를 저장하지 않는다', () => {
  const A = require('../alarms.cjs');
  for (const k of ['weatherEnabled', 'weatherConsent', 'weatherCityId']) assert.ok(!(k in A.DEFAULTS));
  const r = A.mergeAlarmSettings({}, { weatherEnabled: true, weatherConsent: true, weatherCityId: 'gg:의정부시', lunchEnabled: true });
  assert.ok(!('weatherEnabled' in r.settings)); assert.strictEqual(r.settings.lunchEnabled, true);
});

// ── 연결(정적 확인) ─────────────────────────────────────────────────────────
t('메인: 네트워크는 weather.cjs 한 곳, 동의+켜짐일 때만 허용, 비동기 핸들러, 알람 체커 코드와 분리', () => {
  const main = read('main.cjs'), pre = read('preload.cjs');
  assert.ok(/require\('\.\/weather\.cjs'\)/.test(main)); assert.ok(/ipcMain\.handle\('weather-get', async/.test(main));
  assert.ok(/weatherService\.setConsent\(settings\.weatherEnabled && settings\.weatherConsent\)/.test(main), '동의 + 켜짐 둘 다');
  assert.ok(/typeof settings\.weatherEnabled === 'boolean' && typeof settings\.weatherConsent === 'boolean'/.test(main), '키가 없는 동기화가 동의를 바꾸지 못한다');
  const fetchLines = main.split('\n').filter(l => /fetch\(/.test(l)); assert.strictEqual(fetchLines.length, 1, 'main.cjs의 fetch 호출은 날씨 한 줄뿐'); assert.ok(fetchLines[0].includes('createWeatherService'));
  const alarmBlock = main.slice(main.indexOf('function runAlarmCheck'), main.indexOf('function startBreakTimeChecker'));
  assert.ok(!/weather/i.test(alarmBlock), '알람 체크 함수는 날씨와 무관');
  assert.ok(/setInterval\(runAlarmCheck, 1000\)/.test(main));
  assert.ok(/getWeather:\s+\(lat, lon\) => ipcRenderer\.invoke\('weather-get', \{ lat, lon \}\)/.test(pre), '렌더러는 좌표 두 개만 넘긴다');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(read('src/pages/PetPage.tsx') + read('src/components/PetAsk.tsx') + read('src/components/settings/WeatherModal.tsx')), '렌더러에서는 직접 요청하지 않는다');
  assert.ok(JSON.parse(read('package.json')).build.files.includes('weather.cjs'), '설치본에 weather.cjs 포함');
});
t('펫 대화: 초집중 모드·알림·토스트 중에는 열지 않고, 입력은 직접 눌렀을 때만 포커스, Esc로 닫힘', () => {
  const pet = read('src/pages/PetPage.tsx'), ask = read('src/components/PetAsk.tsx');
  assert.ok(/const askBlocked = focus\.enabled \|\| alertActive \|\| !!toast/.test(pet));
  assert.ok(/if \(askBlocked\) \{ setAskOpen\(false\); return; \}/.test(pet));
  assert.ok(!/autoFocus[=\s{]|\.focus\(\)/.test(ask.replace(/\/\/.*$/gm, '')), '자동 포커스 없음'); assert.ok(/Escape/.test(ask));
  assert.ok(/어느 동네에 있어요\?/.test(ask) && /못 찾았어요, 다른 이름으로 알려줄래요\?/.test(ask) && /날씨 알려드릴게요/.test(pet));
  assert.ok(/setPetInteractive\?\.\(true\)/.test(pet) && /setPetInteractive\?\.\(false\)/.test(pet), '클릭 통과 중에도 대화 동안만 입력 허용');
  assert.ok(/id\s*=|const\b/.test(ask) && (ask.match(/cityLabel|searchCities/g) || []).length >= 2);
});
t('표시: 출근 전후(-30~+90분)·퇴근 30분 전 하루 한 번, 클릭은 현재 날씨, 섞기 옵션 날씨(기본 꺼짐)', () => {
  const pet = read('src/pages/PetPage.tsx');
  assert.ok(/n >= ws - 30 && n <= ws \+ 90/.test(pet) && /n >= lv - 30 && n <= lv/.test(pet));
  assert.ok(/shown\.morning/.test(pet) && /shown\.evening/.test(pet) && /weatherShown/.test(pet));
  assert.ok(/currentText\(w\.data, new Date\(\)\)/.test(pet)); assert.ok(/idle === 'weather'/.test(pet));
  assert.ok(/focusRef\.current\.enabled \|\| alertRef\.current \|\| toastActiveRef\.current\) return;/.test(pet), '초집중·알림 중에는 미룬다');
  assert.ok(/cur\.bubbleEnabled === false/.test(pet), '말풍선 사용을 끄면 안내도 없다');
  assert.strictEqual((pet.match(/Date\.now\(\) >= briefingUntilRef\.current/g) || []).length, 3, '졸림 방지 말풍선 3곳이 안내를 덮어쓰지 않는다');
});
t('설정: 칩은 8개 그대로, 날씨는 말풍선 팝오버 안(동의 안내·도시 검색·삭제·표기)', () => {
  const home = read('src/components/settings/HomePane.tsx'), ws = read('src/components/settings/WeatherModal.tsx');
  assert.strictEqual((home.match(/^ {6}id: '/gm) || []).length, 8);
  assert.ok(/onClick=\{\(\) => \{ setOpenKey\(null\); onOpenWeather\(\); \}\}/.test(home), '말풍선 팝오버의 날씨 버튼'); assert.ok(home.includes('날씨 데이터: Open-Meteo (CC BY 4.0)'));
  assert.ok(ws.includes('날씨를 켜면 선택한 도시의 대략적인 좌표가 날씨 서비스(Open-Meteo)로 전송돼요. 이름·사진·알람 같은 개인 정보는 보내지 않아요.'));
  assert.ok(ws.includes('켤게요') && ws.includes('안 할래요') && ws.includes('도시 삭제') && ws.includes('도시 검색'));
  assert.ok(/weatherConsent: true, weatherEnabled: true/.test(ws), '켤게요를 눌러야 동의');
  assert.ok(/value: 'weather', label: '날씨'/.test(home));
});
t('위치 자동 감지 없음: geolocation·IP 조회 코드가 없다', () => {
  for (const f of ['main.cjs', 'weather.cjs', 'src/pages/PetPage.tsx', 'src/components/PetAsk.tsx', 'src/components/settings/WeatherModal.tsx', 'src/utils/citySearch.ts']) assert.ok(!/geolocation|ipapi|ipinfo|ip-api|getCurrentPosition/i.test(read(f)), f);
});
t('새 소스 파일에 U+FFFD 없음', () => {
  for (const f of ['weather.cjs', 'src/data/cities.ts', 'src/data/weatherText.ts', 'src/utils/citySearch.ts', 'src/utils/weatherText.ts', 'src/components/PetAsk.tsx', 'src/components/settings/WeatherModal.tsx', 'src/pages/PetPage.tsx', 'src/components/settings/HomePane.tsx', 'main.cjs']) assert.ok(!read(f).includes(FFFD), f);
});

(async () => {
  for (const [name, fn] of queue) { await fn(); n++; console.log(`  ok  ${name}`); }
  console.log(`\n${n} tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
