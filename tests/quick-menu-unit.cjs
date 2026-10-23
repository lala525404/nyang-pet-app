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
t('항목 배치: 종료는 항상 마지막, 항목이 늘면 최대 8개(종료 포함)까지만, 4개씩 줄바꿈', () => {
  assert.strictEqual(M.QUICK_COLUMNS, 4); assert.strictEqual(M.QUICK_MAX_ITEMS, 8);
  assert.deepStrictEqual(M.layoutQuickItems(['a', 'b', 'c'], 'Q'), ['a', 'b', 'c', 'Q']);
  const seven = ['1', '2', '3', '4', '5', '6', '7']; assert.deepStrictEqual(M.layoutQuickItems(seven, 'Q'), [...seven, 'Q']);
  const nine = [...seven, '8', '9']; const l = M.layoutQuickItems(nine, 'Q'); assert.strictEqual(l.length, 8); assert.strictEqual(l[7], 'Q');
  assert.deepStrictEqual(M.layoutQuickItems([], 'Q'), ['Q']);
  assert.strictEqual(M.quickRows(4), 1); assert.strictEqual(M.quickRows(5), 2); assert.strictEqual(M.quickRows(8), 2); assert.strictEqual(M.quickRows(9), 3);
});
t('키보드 이동: 좌우는 한 칸, 상하는 한 줄, 끝에서는 멈추고, 덜 찬 마지막 줄 아래로는 마지막 칸', () => {
  assert.strictEqual(M.moveQuickFocus(0, 'ArrowRight', 4), 1); assert.strictEqual(M.moveQuickFocus(3, 'ArrowRight', 4), 3);
  assert.strictEqual(M.moveQuickFocus(0, 'ArrowLeft', 4), 0); assert.strictEqual(M.moveQuickFocus(2, 'ArrowLeft', 4), 1);
  assert.strictEqual(M.moveQuickFocus(1, 'ArrowDown', 8), 5); assert.strictEqual(M.moveQuickFocus(5, 'ArrowUp', 8), 1); assert.strictEqual(M.moveQuickFocus(1, 'ArrowUp', 8), 1);
  assert.strictEqual(M.moveQuickFocus(3, 'ArrowDown', 6), 5, '마지막 줄이 덜 찼으면 마지막 칸'); assert.strictEqual(M.moveQuickFocus(5, 'ArrowDown', 6), 5);
  assert.strictEqual(M.moveQuickFocus(2, 'Home', 8), 0); assert.strictEqual(M.moveQuickFocus(2, 'End', 8), 7); assert.strictEqual(M.moveQuickFocus(0, 'x', 0), 0);
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
  assert.deepStrictEqual(list.map(x => `${x.time} ${x.title}`), ['09:00 스탠드업', '12:00 점심', '13:30 지금', '15:30 알람', '18:00 퇴근'], '꺼진 알람(14:00)은 빠진다');
  assert.deepStrictEqual(list.map(x => x.past), [true, true, false, false, false], '지금 이 분은 지난 게 아니다');
  assert.deepStrictEqual(list.map(x => x.next), [false, false, true, false, false]); assert.strictEqual(list[2].minutesUntil, 0); assert.strictEqual(list[3].minutesUntil, null);
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
  const sat = QA.todayAlarmList({ lunchOn: true, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [] }, at(2026, 10, 24)); assert.deepStrictEqual(sat.map(x => x.title), ['점심']);
  const resolved = A.resolveAlarmSettings({ lunchEnabled: true, leaveEnabled: false, lunchTime: '11:40', leaveTime: '17:30', alarms: [al({ id: 'z', time: '08:00' })] });
  const q = Q.quickAlarmSettings(A.resolveAlarmSettings, { lunchEnabled: true, leaveEnabled: false, lunchTime: '11:40', leaveTime: '17:30', alarms: [al({ id: 'z', time: '08:00' })] });
  assert.deepStrictEqual(q, { lunchOn: resolved.lunchOn, leaveOn: resolved.leaveOn, lunchTime: resolved.lunchTime, leaveTime: resolved.leaveTime, alarms: resolved.alarms });
});
t('알람이 없거나 설정을 못 읽으면 빈 목록, 문구·남은 시간 표기', () => {
  assert.deepStrictEqual(QA.todayAlarmList(null, new Date()), []); assert.deepStrictEqual(QA.todayAlarmList({ lunchOn: false, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [] }, new Date()), []);
  assert.strictEqual(QA.NO_ALARM_TEXT, '오늘은 알람이 없어요');
  assert.strictEqual(QA.untilText(0), '지금'); assert.strictEqual(QA.untilText(5), '5분 뒤'); assert.strictEqual(QA.untilText(60), '1시간 뒤'); assert.strictEqual(QA.untilText(135), '2시간 15분 뒤');
});

// ── 연결(정적 확인) ──────────────────────────────────────────────────────────
t('연결: 우클릭 → 퀵 메뉴, 종료는 정상 종료 경로(requestQuit: 저장·정리 후 app.quit, 시간 초과 시 app.exit), 퀵 창이 보낸 요청만 받음', () => {
  const main = read('main.cjs'), pet = read('src/pages/PetPage.tsx'), page = read('src/pages/QuickPage.tsx');
  assert.ok(/ipcMain\.on\('pet-right-click', \(\) => openQuickMenu\(\)\)/.test(main));
  assert.ok(/if \(action === 'quit'\) \{ requestQuit\(\); return; \}/.test(main));
  assert.ok(/quitTimer = setTimeout\(\(\) => app\.exit\(0\), QUIT_TIMEOUT_MS\)/.test(main) && /QUIT_TIMEOUT_MS = 2000/.test(main) && /app\.quit\(\)/.test(main), '정상 종료를 먼저, 2초 안에 안 끝나면 강제');
  assert.ok(/const fromQuick = \(e\) =>/.test(main) && (main.match(/fromQuick\(e\)/g) || []).length === 4, '닫기·크기·알람 읽기·동작 4곳 모두 퀵 창이 보낸 것인지 확인');
  assert.ok(/win\.on\('blur'/.test(main) && /closeQuickMenu\(\)/.test(main), '포커스를 잃으면 닫힘');
  assert.ok(/if \(quickWindow && !quickWindow\.isDestroyed\(\)\) return;/.test(main.slice(main.indexOf('function startAlwaysOnTopKeepAlive'), main.indexOf('function stopAlwaysOnTopKeepAlive'))), '퀵 메뉴가 열려 있는 동안 항상 위 재설정은 쉰다(맥에서 포커스를 가져가 메뉴가 닫히는 문제)');
  assert.ok(/quickWindow = null;/.test(main.slice(main.indexOf('function finishQuit'), main.indexOf('function requestQuit'))), '종료 때 퀵 창도 정리');
  assert.ok(/quickOpenRef\.current/.test(pet) && /const paused = alertRef\.current \|\| toastActiveRef\.current \|\| quickOpenRef\.current/.test(pet), '퀵 메뉴가 열린 동안 평소 말풍선은 쉰다');
  assert.ok(/QUIT_CONFIRM_MS/.test(page) && /한 번 더 누르면 종료돼요/.test(page) && /종료하면 알람이 울리지 않아요/.test(page));
  assert.ok(/layoutQuickItems\(ITEMS, QUIT\)/.test(page) && /key === 'Escape'/.test(page) && /api\(\)\?\.quickClose\(\)/.test(page));
  assert.ok(!/fetch\(|XMLHttpRequest/.test(page), '렌더러는 네트워크를 쓰지 않는다(메인이 한다)');
  assert.ok(/s\.weatherConsent \? s\.weatherCityId : ''/.test(page) && /if \(!c\) \{ setPhase\('none'\); return; \}/.test(page), '동네나 동의가 없으면 날씨 요청을 하지 않는다');
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
