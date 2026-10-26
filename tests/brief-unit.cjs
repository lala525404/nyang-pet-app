// 부팅 후 오늘 브리핑 단위 테스트: 부팅 3분 경계(179초·180초), 앱이 늦게 켜졌을 때, 자정 넘김, 하루 한 번, 켜기/끄기,
// 평일/주말/공휴일, 일정 없음·4개 이상, 날씨 없음(캐시만: 새 요청 없음), 점심·퇴근 기본 알림은 항목에 세지 않음, 메인 연결(정적 확인).
// `node tests/brief-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, (p) => (p in deps ? deps[p] : {})); return m.exports; };
const S = require('../brief-schedule.cjs'), W = require('../weather.cjs'), N = require('../notice-card.cjs');
const settingsTs = load('src/utils/settings.ts', { './theme': { seedFreshTheme() {} } });
const sched = load('src/utils/alarmSchedule.ts', { './settings': settingsTs });
const text = load('src/utils/alarmText.ts', { './settings': settingsTs });
const kind = load('src/utils/alarmKind.ts', { './alarmText': text, './alarmSchedule': sched });
const quick = load('src/utils/quickAlarms.ts', { './alarmSchedule': sched, './alarmText': text, './alarmKind': kind });
const holidays = load('src/data/holidays.ts');
const wcard = load('src/utils/weatherCard.ts');
const B = load('src/utils/brief.ts', { '../data/holidays': holidays, './quickAlarms': quick, './alarmKind': kind, './weatherCard': wcard });
const FFFD = String.fromCharCode(0xFFFD);
const D = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const MON = D(2026, 10, 26, 8, 30), SAT = D(2026, 10, 31, 9, 0), SUN = D(2026, 11, 1, 9, 0), HOL = D(2026, 10, 9, 9, 0);   // 월 / 토 / 일 / 한글날(금)
const al = (o = {}) => ({ id: 'a' + Math.random().toString(36).slice(2, 8), time: '09:00', enabled: true, repeat: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] }, ...o });
const cfg = (alarms = []) => ({ lunchOn: true, leaveOn: true, lunchTime: '12:00', leaveTime: '18:00', alarms });
const wx = (nowMs) => ({ temp: 18.4, feels: 17, code: 0, wind: 2, hours: [], days: [{ at: new Date(nowMs).setHours(0, 0, 0, 0), max: 22.2, min: 12.1, pop: 70 }] });
const IN = (now, o = {}) => ({ now, settings: cfg(), leaveEnabled: false, leaveTime: '18:00', weather: null, ...o });

t('부팅 3분 경계: 179초면 1초 더 기다리고, 180초면 이미 지난 것(앱이 늦게 켜짐 → 약 10초 뒤). 대기 시간은 BRIEF_DELAY_SEC 한 곳', () => {
  assert.strictEqual(S.BRIEF_DELAY_SEC, 180);
  assert.strictEqual(S.planBrief({ uptimeSec: 0 }), 180000);
  assert.strictEqual(S.planBrief({ uptimeSec: 60 }), 120000);
  assert.strictEqual(S.planBrief({ uptimeSec: 179 }), 1000, '179초: 1초 뒤(= 부팅 180초 시점)');
  assert.strictEqual(S.planBrief({ uptimeSec: 179.5 }), 500);
  assert.strictEqual(S.planBrief({ uptimeSec: 180 }), S.LATE_START_DELAY_MS, '180초: 3분이 지났으니 앱 준비 후 약 10초');
  assert.strictEqual(S.planBrief({ uptimeSec: 86400 * 5 }), S.LATE_START_DELAY_MS);
  assert.strictEqual(S.LATE_START_DELAY_MS, 10000);
  for (const bad of [-1, NaN, Infinity, '180', null, undefined]) assert.strictEqual(S.planBrief({ uptimeSec: bad }), null, String(bad));
  assert.strictEqual(S.planBrief({ uptimeSec: 5, force: true }), S.FORCE_DELAY_MS, '시험용: 조건을 무시하고 곧');
  assert.strictEqual(S.planBrief({ uptimeSec: NaN, force: true }), S.FORCE_DELAY_MS);
  // 180이라는 숫자가 다른 코드에 따로 박혀 있지 않다(상수 한 곳)
  assert.ok(!/\b180\b/.test(read('main.cjs').split('\n').filter(l => /brief|Brief/.test(l)).join('\n')), 'main.cjs는 상수를 쓴다');
  assert.ok(!/\b180\b/.test(read('src/utils/brief.ts').replace(/180\d/g, '')), 'brief.ts에는 대기 시간이 없다');
});
t('자정 넘김: 앱을 시작한 날과 같은 날일 때만 쌓는다(오래 켜 둔 PC가 날짜가 바뀌어 띄우지 않음). 시험용은 항상', () => {
  assert.strictEqual(S.shouldEnqueue({ startDay: '2026-10-26', now: D(2026, 10, 26, 23, 59) }), true);
  assert.strictEqual(S.shouldEnqueue({ startDay: '2026-10-26', now: D(2026, 10, 27, 0, 0) }), false);
  assert.strictEqual(S.shouldEnqueue({ startDay: '2026-10-26', now: D(2026, 10, 27, 0, 0), force: true }), true);
  assert.strictEqual(S.shouldEnqueue({ startDay: undefined, now: MON }), false);
});
t('주 시작일: 월~일 모두 그 주 월요일(설정창 알람 캘린더의 오늘 주)', () => {
  for (const d of [26, 27, 28, 29, 30, 31]) assert.strictEqual(S.weekStartOf(D(2026, 10, d)), '2026-10-26', String(d));
  assert.strictEqual(S.weekStartOf(D(2026, 11, 1)), '2026-10-26', '일요일은 직전 월요일');
  assert.strictEqual(S.weekStartOf(D(2026, 11, 2)), '2026-11-02');
  assert.strictEqual(S.weekStartOf(D(2027, 1, 1)), '2026-12-28', '해를 넘겨도');
});
t('띄울지: 평일은 기본, 주말·공휴일은 오늘 일정/알람이 있을 때만', () => {
  const ok = (now, hasToday, extra = {}) => B.shouldShowBrief({ enabled: true, lastBriefDate: '', now, hasToday, ...extra });
  assert.strictEqual(ok(MON, false), true, '평일·일정 없음');
  assert.strictEqual(ok(MON, true), true);
  assert.strictEqual(ok(SAT, false), false, '토요일·일정 없음'); assert.strictEqual(ok(SAT, true), true, '토요일·일정 있음');
  assert.strictEqual(ok(SUN, false), false); assert.strictEqual(ok(SUN, true), true);
  assert.strictEqual(B.ymdOf(HOL), '2026-10-09'); assert.strictEqual(HOL.getDay(), 5, '금요일');
  assert.strictEqual(ok(HOL, false), false, '평일 공휴일(한글날)·일정 없음'); assert.strictEqual(ok(HOL, true), true, '공휴일·일정 있음');
  assert.strictEqual(ok(D(2026, 10, 5), false), false, '대체공휴일');
});
t('하루 한 번·켜기/끄기: 오늘 이미 띄웠으면 안 띄우고(앱을 다시 켜도), 어제 기록이면 띄운다. 끄면 안 띄우고, 값이 없으면 켜짐(기본)', () => {
  const f = (o) => B.shouldShowBrief({ enabled: true, lastBriefDate: '', now: MON, hasToday: false, ...o });
  assert.strictEqual(f({ lastBriefDate: '2026-10-26' }), false, '오늘 이미 띄움');
  assert.strictEqual(f({ lastBriefDate: '2026-10-25' }), true, '어제 기록');
  assert.strictEqual(f({ lastBriefDate: undefined }), true);
  assert.strictEqual(f({ enabled: false }), false, '끔');
  assert.strictEqual(f({ enabled: undefined }), true, '예전 설정(키 없음)은 기본 켜짐');
  assert.strictEqual(f({ enabled: false, force: true }), true, 'force(시험용·지금 보기)는 조건을 무시');
  assert.strictEqual(f({ lastBriefDate: '2026-10-26', force: true }), true);
});
t('내용: 날짜·요일, 일정 없으면 안내 문구, 공휴일이면 이름', () => {
  const c = B.buildBrief(IN(MON));
  assert.strictEqual(c.dateText, '10월 26일 월요일'); assert.strictEqual(c.holiday, null);
  assert.deepStrictEqual(c.items, []); assert.strictEqual(c.emptyText, '오늘은 등록된 일정이 없어요'); assert.strictEqual(c.hasToday, false); assert.strictEqual(c.more, 0);
  const h = B.buildBrief(IN(HOL)); assert.strictEqual(h.holiday, '한글날'); assert.strictEqual(h.dateText, '10월 9일 금요일');
  assert.strictEqual(B.buildBrief(IN(D(2026, 10, 5))).holiday, '대체공휴일(개천절)');
});
t('내용: 오늘 일정/알람을 시각순으로 최대 3개, 4개 이상이면 "+N개 더보기"', () => {
  const alarms = [al({ time: '15:00', name: '치과' }), al({ time: '09:00' }), al({ time: '10:30', endTime: '11:30', name: '회의' }), al({ time: '13:00', attendees: '김팀장' }), al({ time: '17:45' })];
  const c = B.buildBrief(IN(MON, { settings: cfg(alarms) }));
  assert.deepStrictEqual(c.items.map(i => i.time), ['09:00', '10:30', '13:00'], '시각순 3개');
  assert.strictEqual(c.more, 2, '5개 중 3개 보이고 2개 더'); assert.strictEqual(c.emptyText, null); assert.strictEqual(c.hasToday, true);
  assert.deepStrictEqual(c.items.map(i => i.label), ['알람', '일정', '일정'], '일정/알람 라벨');
  const four = B.buildBrief(IN(MON, { settings: cfg(alarms.slice(0, 4)) })); assert.strictEqual(four.items.length, 3); assert.strictEqual(four.more, 1);
  const three = B.buildBrief(IN(MON, { settings: cfg(alarms.slice(0, 3)) })); assert.strictEqual(three.items.length, 3); assert.strictEqual(three.more, 0);
});
t('내용: 점심·퇴근 기본 알림은 항목으로 세지 않고, 꺼진 알람·오늘 건너뜀·다른 요일·다른 날짜 알람도 빠진다', () => {
  const onlyDefaults = B.buildBrief(IN(MON, { settings: cfg([]), leaveEnabled: true })); assert.deepStrictEqual(onlyDefaults.items, []); assert.strictEqual(onlyDefaults.hasToday, false);
  const alarms = [al({ enabled: false }), al({ skipDate: '2026-10-26' }), al({ repeat: { kind: 'weekly', days: [2] } }), al({ repeat: { kind: 'date', date: '2026-10-27' } }), al({ time: '14:00', repeat: { kind: 'date', date: '2026-10-26' } })];
  const c = B.buildBrief(IN(MON, { settings: cfg(alarms) })); assert.deepStrictEqual(c.items.map(i => i.time), ['14:00']);
  assert.strictEqual(B.buildBrief(IN(MON, { settings: null })).hasToday, false, '설정이 없어도 깨지지 않는다');
});
t('내용: 이미 지난 시각의 항목은 목록에서 빠지지만, 오늘 일정이 있었다는 사실(주말에 띄울지)은 남는다', () => {
  const noon = D(2026, 10, 31, 12, 0);
  const c = B.buildBrief(IN(noon, { settings: cfg([al({ time: '09:00' }), al({ time: '13:00' })]) }));
  assert.deepStrictEqual(c.items.map(i => i.time), ['13:00']);
  const allPast = B.buildBrief(IN(D(2026, 10, 31, 20, 0), { settings: cfg([al({ time: '09:00' })]) }));
  assert.deepStrictEqual(allPast.items, []); assert.strictEqual(allPast.emptyText, '오늘 남은 일정은 없어요'); assert.strictEqual(allPast.hasToday, true);
});
t('내용: 날씨는 캐시가 있을 때만 한 줄(없거나 깨졌으면 생략), 퇴근 시간은 설정이 켜져 있을 때만 "퇴근 18:00"', () => {
  const now = MON;
  assert.strictEqual(B.buildBrief(IN(now, { weather: wx(now.getTime()) })).weather, '맑음 18° · 최고 22° / 최저 12° · 비 올 확률 70%');
  assert.strictEqual(B.buildBrief(IN(now)).weather, null, '캐시 없음');
  assert.strictEqual(B.buildBrief(IN(now, { weather: { temp: NaN, code: 0, hours: [] } })).weather, null);
  assert.strictEqual(B.buildBrief(IN(now, { weather: { ...wx(now.getTime()), days: [] } })).weather, '맑음 18°', '일별 값이 없어도 현재 기온은');
  assert.strictEqual(B.buildBrief(IN(now, { leaveEnabled: true, leaveTime: '18:00' })).leave, '퇴근 18:00');
  assert.strictEqual(B.buildBrief(IN(now, { leaveEnabled: true, leaveTime: '9:05' })).leave, '퇴근 09:05');
  assert.strictEqual(B.buildBrief(IN(now, { leaveEnabled: false })).leave, null);
  assert.strictEqual(B.buildBrief(IN(now, { leaveEnabled: true, leaveTime: 'abc' })).leave, null);
});
t('카드 판단(decideBrief): 새 설치·날짜가 지난 대기·오늘 이미 띄움·끔은 조용히 넘기고, 보일 때만 오늘을 기록하라고 알린다', () => {
  const base = (o = {}) => ({ stored: { briefEnabled: true, lastBriefDate: '' }, now: MON, settings: cfg(), leaveEnabled: false, leaveTime: '18:00', weather: null, ...o });
  const day = '2026-10-26';
  const shown = B.decideBrief({ day }, base()); assert.ok('view' in shown); assert.strictEqual(shown.view.persist, true); assert.strictEqual(shown.view.day, day);
  assert.ok('skip' in B.decideBrief({ day }, base({ stored: null })), '저장된 설정이 없는 새 설치는 띄우지 않는다');
  assert.ok('skip' in B.decideBrief({ day: '2026-10-25' }, base()), '기다리는 사이 날이 바뀌면 포기');
  assert.ok('skip' in B.decideBrief(null, base()));
  assert.ok('skip' in B.decideBrief({ day }, base({ stored: { briefEnabled: true, lastBriefDate: day } })), '오늘 이미 띄움(앱을 다시 켜도)');
  assert.ok('skip' in B.decideBrief({ day }, base({ stored: { briefEnabled: false, lastBriefDate: '' } })), '끔');
  assert.ok('skip' in B.decideBrief({ day: '2026-11-01' }, base({ now: SUN })), '일요일·일정 없음');
  const sunWith = B.decideBrief({ day: '2026-11-01' }, base({ now: SUN, settings: cfg([al()]) })); assert.ok('view' in sunWith, '일요일이어도 일정이 있으면');
  const manual = B.decideBrief({ day, manual: true }, base({ stored: { briefEnabled: false, lastBriefDate: day }, now: SAT })); assert.ok('view' in manual, '지금 보기: 끔·이미 띄움·주말이어도 보인다'); assert.strictEqual(manual.view.persist, false, '그 기록은 바꾸지 않는다');
  const forced = B.decideBrief({ force: true }, base({ stored: null })); assert.ok('view' in forced); assert.strictEqual(forced.view.persist, false);
});
t('날씨는 캐시만: peek는 요청을 보내지 않는다(요청 수 변화 없음), 동의가 없거나 캐시가 없거나 6시간이 지났으면 null', async () => {
  let clock = 1e12, calls = 0;
  const json = { current: { temperature_2m: 10, weather_code: 3 }, hourly: { time: [clock / 1000], temperature_2m: [10], weather_code: [3] }, daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [] } };
  const svc = W.createWeatherService({ fetch: async () => { calls++; return { ok: true, json: async () => json }; }, now: () => clock });
  assert.strictEqual(svc.peek(37.5, 127), null, '동의 전');
  svc.setConsent(true);
  assert.strictEqual(svc.peek(37.5, 127), null, '캐시 없음 → 요청하지 않고 null'); assert.strictEqual(calls, 0); assert.strictEqual(svc.stats.requests, 0);
  await svc.get(37.5, 127); assert.strictEqual(calls, 1);
  const p = svc.peek(37.5, 127); assert.ok(p && p.data.code === 3 && p.stale === false); assert.strictEqual(calls, 1, 'peek는 새 요청이 아니다');
  clock += W.CACHE_MS + 1; const old = svc.peek(37.5, 127); assert.ok(old && old.stale === true, '30분이 지난 값은 오래된 값으로 표시'); assert.strictEqual(calls, 1);
  clock += W.STALE_MAX_MS; assert.strictEqual(svc.peek(37.5, 127), null, '6시간이 지나면 버린다');
  assert.strictEqual(svc.peek(NaN, 127), null); assert.strictEqual(calls, 1);
});
t('큐: 브리핑도 한 번에 하나, 퀵 메뉴·알람 울림 중에는 끝날 때까지 대기(초집중 중에는 대기하지 않음), 같은 날 같은 브리핑은 중복 안 됨', () => {
  const FREE = { petVisible: true, focus: false, quickOpen: false, alertCount: 0, quitting: false };
  const q = N.createNoticeQueue(); const a = q.enqueue({ kind: 'brief', key: '2026-10-26', payload: { day: '2026-10-26' } });
  assert.ok(a && !a.dup); assert.strictEqual(q.enqueue({ kind: 'brief', key: '2026-10-26' }).dup, true, '같은 날은 한 장');
  for (const b of [{ quickOpen: true }, { alertCount: 1 }]) assert.strictEqual(q.peek({ now: 1e9, blockers: { ...FREE, ...b } }), null);
  assert.strictEqual(q.peek({ now: 1e9, blockers: { ...FREE, focus: true } }).kind, 'brief', '초집중 중에도 브리핑은 나온다(v1.7.0 수정)');
  assert.strictEqual(q.peek({ now: 1e9, blockers: FREE }).kind, 'brief');
  assert.strictEqual(N.AUTO_CLOSE_MS.brief, 60000, '브리핑은 60초 뒤 스스로 닫힌다');
});
t('연결(정적): 앱 시작 때 한 번 판단(os.uptime·시험용 업타임), 타이머 정리, 지금 보기·날씨 캐시 IPC, 알람 스케줄러는 브리핑을 모른다', () => {
  const main = read('main.cjs'), pre = read('preload.cjs');
  assert.ok(/startBriefCheck\(\);/.test(main) && /function startBriefCheck/.test(main), '시작 때 호출');
  assert.ok(/require\('os'\)\.uptime\(\)/.test(main) && /testEnv\.fakeUptimeSec/.test(main) && /testEnv\.forceBrief/.test(main));
  assert.ok(/briefSchedule\.shouldEnqueue\(/.test(main) && /briefSchedule\.planBrief\(/.test(main));
  assert.ok(/if \(briefTimer\) \{ clearTimeout\(briefTimer\)/.test(main), '종료 때 타이머 정리');
  assert.ok(/ipcMain\.on\('brief-show'/.test(main) && /ipcMain\.handle\('weather-peek'/.test(main) && /weatherService\.peek\(/.test(main));
  assert.ok(/showBrief:/.test(pre) && /peekWeather:/.test(pre) && /weather-peek/.test(pre) && /brief-show/.test(pre));
  assert.ok(/'week'/.test(main) && /alarm-calendar/.test(main), '+N개 더보기 → 알람 캘린더의 오늘 주');
  const page = read('src/pages/NoticePage.tsx'); assert.ok(/peekWeather/.test(page) && !/getWeather/.test(page), '브리핑은 캐시만 쓴다(getWeather 없음)');
  assert.ok(!/fetch\(|XMLHttpRequest|net\.fetch/.test(read('src/utils/brief.ts') + read('brief-schedule.cjs')), '순수 계산에는 네트워크가 없다');
  assert.ok(!/brief/i.test(read('alarms.cjs')), 'alarms.cjs는 브리핑을 모른다');
  assert.ok(!/brief/i.test(read('src/pages/PetPage.tsx')), 'PetPage(클릭·더블클릭·드래그)는 그대로');
});
t('설정 키: briefEnabled(기본 켬)·lastBriefDate가 새 키로 추가되고, 기록 키는 설정창이 덮어쓰지 않으며, 설정창에 토글과 "지금 브리핑 보기"가 있다', () => {
  assert.strictEqual(settingsTs.DEFAULT_SETTINGS.briefEnabled, true); assert.strictEqual(settingsTs.DEFAULT_SETTINGS.lastBriefDate, '');
  assert.ok(settingsTs.OTHER_WINDOW_KEYS.includes('lastBriefDate')); assert.ok(!settingsTs.OTHER_WINDOW_KEYS.includes('briefEnabled'), '켜기/끄기는 설정창이 정한다');
  const row = read('src/components/settings/BriefRow.tsx'); assert.ok(/부팅 후 오늘 브리핑/.test(row) && /지금 브리핑 보기/.test(row) && /briefEnabled/.test(row));
  assert.ok(/<BriefRow /.test(read('src/components/settings/HomePane.tsx')));
});
t('파일에 깨진 글자(U+FFFD)·???가 없다', () => {
  for (const f of ['brief-schedule.cjs', 'src/utils/brief.ts', 'src/components/settings/BriefRow.tsx', 'src/pages/NoticePage.tsx', 'src/styles/notice.css']) {
    const s = read(f); assert.ok(!s.includes(FFFD), f + ' U+FFFD'); assert.ok(!/\?\?\?/.test(s), f + ' ???');
  }
});

(async () => { let pass = 0; for (const [name, fn] of queue) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n', e); process.exitCode = 1; } } if (!process.exitCode) console.log(`\n${pass}개 통과`); })();
