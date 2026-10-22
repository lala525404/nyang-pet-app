// 알람 로직 단위 테스트: 시각(Date)과 발화 기록(Set)을 주입하므로 실제 시계를 기다리지 않는다(1초 안에 끝난다).
// `node tests/alarms-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ts = require('typescript');
const A = require('../alarms.cjs');
const root = path.join(__dirname, '..');
let n = 0; const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const at = (hm, day = 22) => { const [h, m] = hm.split(':').map(Number); return new Date(2026, 9, day, h, m, 30); };   // 2026-10-22 hh:mm:30
const cards = (acts) => acts.filter(a => a.type === 'card').map(a => a.card);
const toasts = (acts) => acts.filter(a => a.type === 'toast').map(a => `${a.kind}${a.minutes}`);
const merge = (...ins) => ins.reduce((cur, i) => A.mergeAlarmSettings(cur, i).settings, {});

t('기본값: 모두 꺼짐, 기본 시각 12:00/18:00, 미리 알림 5분 — 아무것도 안 울린다', () => {
  assert.deepStrictEqual({ ...A.DEFAULTS }, { lunchEnabled: false, leaveEnabled: false, lunchTime: '12:00', leaveTime: '18:00', lunchPreAlertMinutes: 5, leavePreAlertMinutes: 5, alarms: [] });
  const fired = new Set();
  for (const hm of ['11:55', '12:00', '17:55', '18:00']) assert.deepStrictEqual(A.dueActions({}, at(hm), fired), []);
});
t('앱 기본 설정(src/utils/settings.ts)과 알람 기본값이 같다', () => {
  const out = ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils/settings.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, () => ({ seedFreshTheme() {} }), { getItem: () => null, setItem() {} }, { location: { hash: '' } });
  for (const k of Object.keys(A.DEFAULTS)) assert.deepStrictEqual(m.exports.DEFAULT_SETTINGS[k], A.DEFAULTS[k], k);
});
t('키가 없는 설정(펫 창이 저장값 없이 보낸 시작 동기화)은 기존 알람 설정을 지우지 못한다', () => {
  const stored = merge({ lunchEnabled: true, lunchTime: '12:30', alarms: [{ id: 'a', time: '09:00', enabled: true }] });
  const after = A.mergeAlarmSettings(stored, { animalId: 'heart', size: 100 });   // 알람 키 없는 설정
  assert.strictEqual(after.changed, false); assert.deepStrictEqual(after.settings, stored);
  assert.deepStrictEqual(cards(A.dueActions(after.settings, at('12:30'), new Set())), ['lunch']);
});
t('들어 있는 키만 덮어쓴다 / 잘못된 값은 무시 / 시각은 HH:MM으로 정리', () => {
  const s = merge({ lunchTime: '12:30' }, { lunchTime: '25:99', leaveTime: '9:05', lunchPreAlertMinutes: 'x', alarms: [{ id: 'a', time: '7:00', enabled: 1 }, { id: 5, time: '08:00' }, { id: 'b', time: 'zz' }] });
  assert.strictEqual(s.lunchTime, '12:30'); assert.strictEqual(s.leaveTime, '09:05'); assert.strictEqual('lunchPreAlertMinutes' in s, false);
  assert.deepStrictEqual(s.alarms, [{ id: 'a', time: '07:00', enabled: true }]);
});
t('점심 카드는 하루 한 번(같은 분에 여러 번 확인해도 한 번)', () => {
  const s = merge({ lunchEnabled: true, lunchTime: '12:00' }); const fired = new Set();
  assert.deepStrictEqual(cards(A.dueActions(s, at('12:00'), fired)), ['lunch']);
  assert.deepStrictEqual(A.dueActions(s, at('12:00'), fired), []); assert.deepStrictEqual(A.dueActions(s, at('12:00'), fired), []);
});
t('같은 날 울린 뒤 시각을 바꾸면 바뀐 시각에 다시 울린다(날짜+알람 시각 기준)', () => {
  const fired = new Set(); let s = merge({ lunchEnabled: true, lunchTime: '12:00' });
  assert.deepStrictEqual(cards(A.dueActions(s, at('12:00'), fired)), ['lunch']);
  s = merge(s, { lunchTime: '15:20' });
  assert.deepStrictEqual(cards(A.dueActions(s, at('15:20'), fired)), ['lunch']);
  assert.deepStrictEqual(A.dueActions(s, at('15:20'), fired), []);   // 같은 시각은 다시 안 울림
  s = merge(s, { lunchTime: '12:00' });
  assert.deepStrictEqual(A.dueActions(s, at('12:00'), fired), []);   // 이미 울린 (날짜, 시각)은 그대로
});
t('다음 날에는 같은 시각에 다시 울린다, 지난 날짜 기록은 비워진다', () => {
  const fired = new Set(); const s = merge({ lunchEnabled: true, lunchTime: '12:00' });
  A.dueActions(s, at('12:00', 22), fired); assert.strictEqual(fired.size, 1);
  assert.deepStrictEqual(cards(A.dueActions(s, at('12:00', 23), fired)), ['lunch']);
  assert.strictEqual(fired.size, 1); assert.ok([...fired][0].startsWith(at('12:00', 23).toDateString()));
});
t('미리 알림 토스트: 시각-분 전에 한 번, 분을 바꾸면 바뀐 시각에 다시', () => {
  const fired = new Set(); let s = merge({ leaveEnabled: true, leaveTime: '18:00', leavePreAlertMinutes: 5 });
  assert.deepStrictEqual(toasts(A.dueActions(s, at('17:55'), fired)), ['leave5']);
  assert.deepStrictEqual(A.dueActions(s, at('17:55'), fired), []);
  s = merge(s, { leavePreAlertMinutes: 10 });
  assert.deepStrictEqual(toasts(A.dueActions(s, at('17:50'), fired)), ['leave10']);
  assert.strictEqual(A.getPreAlertTime('00:03', 5), '23:58');   // 자정을 넘기는 계산
});
t('일반 알람: id+시각으로 한 번, 시각을 바꾸면 다시, 꺼진 알람은 건너뜀', () => {
  const fired = new Set(); let s = merge({ alarms: [{ id: 'a', time: '09:00', enabled: true }, { id: 'b', time: '09:00', enabled: false }] });
  assert.deepStrictEqual(cards(A.dueActions(s, at('09:00'), fired)), ['alarm']);
  assert.deepStrictEqual(A.dueActions(s, at('09:00'), fired), []);
  s = merge(s, { alarms: [{ id: 'a', time: '09:05', enabled: true }] });
  assert.deepStrictEqual(cards(A.dueActions(s, at('09:05'), fired)), ['alarm']);
});
t('옛 키(breakTimeEnabled/preAlertMinutes)는 새 키가 없을 때만 쓰고, 새 키가 있으면 새 키가 이긴다', () => {
  let s = merge({ breakTimeEnabled: true, lunchTime: '12:00', preAlertMinutes: 3 });
  assert.deepStrictEqual(toasts(A.dueActions(s, at('11:57'), new Set())), ['lunch3']);
  assert.deepStrictEqual(cards(A.dueActions(s, at('12:00'), new Set())), ['lunch']);
  s = merge(s, { lunchEnabled: false });
  assert.deepStrictEqual(A.dueActions(s, at('12:00'), new Set()), []);
});
t('저장·복원: 파일에 저장하면 새로 시작해도 같은 설정, 깨진 파일은 빈 설정', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choeae-alarm-unit-')); const f = path.join(dir, 'alarm-settings.json');
  try {
    assert.deepStrictEqual(A.loadAlarmSettings(f), {});   // 파일 없음
    const s = merge({ lunchEnabled: true, lunchTime: '12:40', alarms: [{ id: 'a', time: '08:10', enabled: true }] });
    assert.strictEqual(A.saveAlarmSettings(f, s), true); assert.deepStrictEqual(A.loadAlarmSettings(f), s);
    assert.deepStrictEqual(cards(A.dueActions(A.loadAlarmSettings(f), at('12:40'), new Set())), ['lunch']);   // 복원만으로 울린다(IPC 없이)
    fs.writeFileSync(f, '{깨짐'); assert.deepStrictEqual(A.loadAlarmSettings(f), {});
    fs.writeFileSync(f, '[1,2]'); assert.deepStrictEqual(A.loadAlarmSettings(f), {});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
t('main.cjs·package.json·렌더러가 새 구조를 쓴다(정적 확인)', () => {
  const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8'), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pet = fs.readFileSync(path.join(root, 'src/pages/PetPage.tsx'), 'utf8');
  assert.ok(pkg.build.files.includes('alarms.cjs'), '패키지에 alarms.cjs 포함');
  assert.match(main, /require\('\.\/alarms\.cjs'\)/); assert.match(main, /restoreAlarms\(\);/); assert.match(main, /applyAlarmSettings\(settings\);/);
  assert.ok(!/lastBreakTrigger/.test(main), '날짜만 보는 옛 발화 기록 제거');
  for (const k of ['lunchEnabled: false', "lunchTime: '12:00'", 'alarms: []']) assert.ok(pet.includes(k), `펫 창 기본값에 ${k}`);
  assert.match(pet, /rawNow !== lastSyncedRawRef\.current/);
});
// ── 알람 이름·설명(v1.2.2 기능): 카드 두 텍스트 칸과 미리 알림 토스트 ─────────────────────────────
const load = (rel, deps = {}) => {
  const out = ts.transpileModule(fs.readFileSync(path.join(root, rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, (p) => deps[p] || ({ seedFreshTheme() {} }), { getItem: () => null, setItem() {} }, { location: { hash: '' } }); return m.exports;
};
const settingsTs = load('src/utils/settings.ts');
const T = load('src/utils/alarmText.ts', { './settings': settingsTs });
const MEET = { id: 'm', time: '14:00', enabled: true, name: '디자인 리뷰 회의', endTime: '15:00', attendees: '김OO, 이OO, 박OO, 최OO, 정OO', memo: '시안 3종 준비', preMinutes: 10 };

t('알람 한 개의 이름·종료 시각·참석자·메모·미리 알림이 저장 정리에서 보존되고 길이는 제한된다', () => {
  const s = merge({ alarms: [{ ...MEET, name: '가'.repeat(50), memo: '메'.repeat(90), attendees: ' a '.repeat(60) }] });
  const a = s.alarms[0];
  assert.strictEqual(Array.from(a.name).length, A.LIMITS.name); assert.strictEqual(Array.from(a.memo).length, A.LIMITS.memo); assert.ok(Array.from(a.attendees).length <= A.LIMITS.attendees);
  assert.strictEqual(a.endTime, '15:00'); assert.strictEqual(a.preMinutes, 10);
  const plain = merge({ alarms: [{ id: 'p', time: '9:00', enabled: true, name: '  ', endTime: 'zz', preMinutes: -3 }] }).alarms[0];
  assert.deepStrictEqual(plain, { id: 'p', time: '09:00', enabled: true });   // 비어 있거나 잘못된 값은 남기지 않는다(기존 모양 그대로)
});
t('알람 카드가 뜰 때 이름·시간·참석자·메모가 카드로 전달된다', () => {
  const acts = A.dueActions(merge({ alarms: [MEET] }), at('14:00'), new Set());
  assert.deepStrictEqual(acts.filter(a => a.type === 'card').map(a => a.alarm), [{ name: '디자인 리뷰 회의', time: '14:00', endTime: '15:00', attendees: MEET.attendees, memo: '시안 3종 준비' }]);
  const bare = A.dueActions(merge({ alarms: [{ id: 'b', time: '09:00', enabled: true }] }), at('09:00'), new Set())[0];
  assert.strictEqual(bare.card, 'alarm'); assert.strictEqual(bare.alarm.name, undefined);   // 아무것도 없으면 기본 카드
});
t('알람 미리 알림 토스트: 이름이 있으면 "10분 뒤 · 이름 · 시각", 없으면 "알람 N분 전이에요!", 설정이 없으면 안 뜬다', () => {
  const fired = new Set();
  const named = A.dueActions(merge({ alarms: [MEET] }), at('13:50'), fired);
  assert.deepStrictEqual(named, [{ type: 'toast', kind: 'alarm', minutes: 10, text: '10분 뒤 · 디자인 리뷰 회의 · 오후 2:00', ms: 5000 }]);
  assert.deepStrictEqual(A.dueActions(merge({ alarms: [MEET] }), at('13:50'), fired), []);   // 한 번만
  for (const name of [undefined, '', '알람 1', '알람']) {
    const un = A.dueActions(merge({ alarms: [{ id: 'u', time: '09:30', enabled: true, preMinutes: 5, ...(name === undefined ? {} : { name }) }] }), at('09:25'), new Set());
    assert.deepStrictEqual(un.map(a => a.text), ['알람 5분 전이에요!'], String(name));
  }
  assert.deepStrictEqual(A.dueActions(merge({ alarms: [{ id: 'n', time: '09:30', enabled: true, name: '회의' }] }), at('09:20'), new Set()), []);   // 미리 알림 기본은 꺼짐
});
t('알람 시각을 바꾸면 미리 알림도 바뀐 시각 기준으로 다시 뜬다', () => {
  const fired = new Set(); let s = merge({ alarms: [MEET] });
  A.dueActions(s, at('13:50'), fired); s = merge(s, { alarms: [{ ...MEET, time: '16:00' }] });
  assert.deepStrictEqual(A.dueActions(s, at('15:50'), fired).map(a => a.text), ['10분 뒤 · 디자인 리뷰 회의 · 오후 4:00']);
});
t('알람 테스트(미리보기) 정보는 같은 규칙으로 정리된다', () => {
  assert.deepStrictEqual(A.cardInfo({ name: ' 회의 ', time: '14:00', memo: 'x' }), { name: '회의', time: '14:00', endTime: undefined, attendees: undefined, memo: 'x' });
  assert.strictEqual(A.cardInfo({}).name, undefined);
});
t('카드 큰 제목: 이름이 비었거나 "알람 1" 같은 기본 이름이면 "알람", 아니면 입력한 이름', () => {
  for (const nm of [undefined, '', '  ', '알람', '알람 1', '알람12']) assert.strictEqual(T.alarmTitle({ name: nm }), '알람', String(nm));
  assert.strictEqual(T.alarmTitle({ name: ' 디자인 리뷰 회의 ' }), '디자인 리뷰 회의'); assert.strictEqual(T.alarmTitle({ name: '알람 시계 점검' }), '알람 시계 점검');
  assert.strictEqual(A.isDefaultAlarmName('알람 3'), T.isDefaultAlarmName('알람 3'));
});
t('카드 작은 문구: 시간 → 참석자 → 메모 순서, 아무것도 없으면 "알람이 울렸어요!"', () => {
  assert.strictEqual(T.alarmSubText({}), '알람이 울렸어요!'); assert.strictEqual(T.alarmSubText({ name: '이름만', time: '14:00' }), '알람이 울렸어요!');
  assert.strictEqual(T.alarmSubText({ time: '14:00', endTime: '15:00' }), '오후 2:00 – 오후 3:00');
  assert.strictEqual(T.alarmSubText({ attendees: '김OO, 이OO' }), '참석 김OO, 이OO');
  assert.strictEqual(T.alarmSubText({ memo: ' 시안 준비 ' }), '시안 준비');
  assert.strictEqual(T.alarmSubText({ time: '14:00', endTime: '15:00', attendees: '김OO, 이OO', memo: '시안 준비' }), '오후 2:00 – 오후 3:00 · 참석 김OO, 이OO · 시안 준비');
  assert.strictEqual(T.alarmSubText({ time: '14:00', endTime: '15:00', memo: '시안' }), '오후 2:00 – 오후 3:00 · 시안');   // 참석자가 없으면 건너뜀
});
t('참석자: 3명까지 표시하고 나머지는 "외 N명"', () => {
  assert.strictEqual(T.formatAttendees('김OO'), '참석 김OO'); assert.strictEqual(T.formatAttendees('김OO, 이OO, 박OO'), '참석 김OO, 이OO, 박OO');
  assert.strictEqual(T.formatAttendees('김OO, 이OO, 박OO, 최OO, 정OO'), '참석 김OO, 이OO, 박OO 외 2명');
  assert.strictEqual(T.formatAttendees('김OO，이OO、 ,박OO\n최OO'), '참석 김OO, 이OO, 박OO 외 1명'); assert.strictEqual(T.formatAttendees(' , '), '');
});
t('제목 글자 크기는 길이에 따라 단계적으로 줄어든다(2줄까지 허용하는 마지막 단계 포함)', () => {
  assert.deepStrictEqual(['알람', '디자인 리뷰', '디자인 리뷰 회의', '디자인 리뷰 회의 준비', '아주 아주 아주 긴 이름의 알람 제목입니다'].map(T.titleSize), ['xl', 'xl', 'l', 'm', 's']);
  assert.strictEqual(T.titleSize('가'.repeat(7)), 'l'); assert.strictEqual(T.titleSize('가'.repeat(10)), 'm'); assert.strictEqual(T.titleSize('😀'.repeat(6)), 'xl');   // 이모지는 한 글자
});
t('화면 연결(정적 확인): 설정창 이름 칸·자세히 접기, 카드, 메인 전달, 테스트 버튼', () => {
  const pane = fs.readFileSync(path.join(root, 'src/components/settings/AlarmPane.tsx'), 'utf8'), card = fs.readFileSync(path.join(root, 'src/pages/BreakTimePage.tsx'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8'), css = fs.readFileSync(path.join(root, 'src/styles/breaktime.css'), 'utf8');
  assert.match(pane, /placeholder=\{`알람 \$\{idx \+ 1\}`\}/); assert.match(pane, /aria-expanded=\{open\}/); assert.match(pane, /<span>자세히<\/span>/);
  assert.ok(!/<span className="st-li-label">알람/.test(pane), '정적인 "알람 N" 글자 대신 이름 입력 칸');
  assert.match(pane, /testBreakTime\('alarm', target \?/);
  assert.match(card, /alarmTitle\(alarmInfo\)/); assert.match(card, /alarmSubText\(alarmInfo\)/); assert.match(css, /\.bt-word\[data-size="s"\]/);
  assert.match(main, /createBreakTimeWindow\(a\.card, a\.alarm\)/); assert.match(main, /a\.text \|\|/);
});
t('글(이름·설명)이 있는 알람은 팝업을 2초 더 보여 준다: 판정, 미리 알림 토스트 시간, 카드 창/페이지 연결', () => {
  assert.strictEqual(A.TEXT_EXTRA_MS, 2000); assert.strictEqual(T.ALARM_TEXT_EXTRA_MS, A.TEXT_EXTRA_MS);
  for (const [info, want] of [[{}, false], [{ name: '알람 1' }, false], [{ name: '  ' }, false], [{ name: '회의' }, true], [{ endTime: '15:00' }, true], [{ attendees: '김OO' }, true], [{ memo: '준비' }, true]]) {
    assert.strictEqual(A.alarmHasText(info), want, JSON.stringify(info)); assert.strictEqual(T.alarmHasText(info), want, JSON.stringify(info));
  }
  // 이름 있는 알람의 미리 알림 토스트는 3초 + 2초 = 5초, 이름 없는 알람·점심·퇴근은 기본(지정 안 함) 그대로
  const named = A.dueActions(merge({ alarms: [MEET] }), at('13:50'), new Set())[0]; assert.strictEqual(named.ms, 5000);
  const unnamed = A.dueActions(merge({ alarms: [{ id: 'u', time: '09:30', enabled: true, preMinutes: 5 }] }), at('09:25'), new Set())[0]; assert.strictEqual('ms' in unnamed, false);
  const lunch = A.dueActions(merge({ lunchEnabled: true, lunchTime: '12:00' }), at('11:55'), new Set())[0]; assert.strictEqual('ms' in lunch, false);
  const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8'), card = fs.readFileSync(path.join(root, 'src/pages/BreakTimePage.tsx'), 'utf8');
  assert.match(main, /3000 \+ \(type === 'alarm' && alarms\.alarmHasText\(info\) \? alarms\.TEXT_EXTRA_MS : 0\)/); assert.match(main, /\}, showMs\);/); assert.match(main, /\}분 전이에요!`, a\.ms\);/);
  assert.match(card, /2600 \+ \(type === 'alarm' && alarmHasText\(alarmInfo\) \? ALARM_TEXT_EXTRA_MS : 0\)/);
});
// ── 반복 알람(위클리 캘린더): 요일·날짜·그 주만·건너뛰기·놓친 알람·상한 ──────────────────────────────
const S = load('src/utils/alarmSchedule.ts');
const CAL = load('src/utils/alarmCalendar.ts', { './settings': settingsTs, './alarmSchedule': S, './alarmText': T });
const D = (y, m, d, h = 0, mi = 0, s = 30) => new Date(y, m - 1, d, h, mi, s);   // 2026-10-26은 월요일
const MON = 26, TUE = 27, WED = 28;   // 2026년 10월의 월·화·수
const al = (extra = {}) => ({ id: 'a', time: '10:00', enabled: true, name: '주간회의', ...extra });
const fires = (alarm, when, fired = new Set()) => cards(A.dueActions(merge({ alarms: [alarm] }), when, fired)).includes('alarm');

t('매주 반복: 지정한 요일에만 울린다(월·수), 프리셋(평일/주말)과 일치', () => {
  const mw = al({ repeat: { kind: 'weekly', days: [1, 3] } });
  assert.ok(fires(mw, D(2026, 10, MON, 10, 0)) && fires(mw, D(2026, 10, WED, 10, 0)));
  assert.ok(!fires(mw, D(2026, 10, TUE, 10, 0)) && !fires(mw, D(2026, 10, 29, 10, 0)) && !fires(mw, D(2026, 10, 31, 10, 0)));
  const weekdays = al({ repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5] } }), weekend = al({ repeat: { kind: 'weekly', days: [0, 6] } });
  for (let d = 26; d <= 32; d++) { const day = new Date(2026, 9, d); const wd = day.getDay() >= 1 && day.getDay() <= 5; assert.strictEqual(fires(weekdays, new Date(2026, 9, d, 10, 0, 30)), wd); assert.strictEqual(fires(weekend, new Date(2026, 9, d, 10, 0, 30)), !wd); }
  assert.deepStrictEqual(S.DAY_PRESETS.map(p => p.label), ['매일', '평일', '주말']);
});
t('특정 날짜 한 번: 그 날 한 번만 울리고, 다음 날·다음 해·같은 요일에는 안 울리며, 지난 뒤에는 완료로 본다', () => {
  const one = al({ name: '1차시안 전달예정', time: '15:00', repeat: { kind: 'date', date: '2026-10-27' } });
  const fired = new Set();
  assert.ok(!fires(one, D(2026, 10, MON, 15, 0), fired));                       // 전날은 안 울림
  assert.ok(fires(one, D(2026, 10, TUE, 15, 0), fired)); assert.ok(!fires(one, D(2026, 10, TUE, 15, 0), fired));   // 그 날 한 번만
  assert.ok(!fires(one, D(2026, 10, WED, 15, 0), fired)); assert.ok(!fires(one, D(2026, 11, 3, 15, 0)));            // 다음 날·다음 주 같은 요일
  assert.ok(!fires(one, D(2027, 10, 27, 15, 0)));                               // 다음 해 같은 날짜도 아님(연도 포함)
  assert.strictEqual(S.isPastOneShot(one, D(2026, 10, TUE, 14, 59)), false); assert.strictEqual(S.isPastOneShot(one, D(2026, 10, TUE, 15, 1)), true);
  assert.strictEqual(S.isPastOneShot(al({ repeat: { kind: 'weekly', days: [1] } }), D(2030, 1, 1)), false);   // 반복 알람은 완료가 없다
});
t('그 주만(요일 지정): 그 주의 지정 요일에만, 다음 주에는 안 울리고, 주가 지나면 완료', () => {
  const wk = al({ repeat: { kind: 'week', weekStart: '2026-10-26', days: [3, 5] } });   // 이번 주 수·금만
  assert.ok(fires(wk, D(2026, 10, WED, 10, 0)) && fires(wk, D(2026, 10, 30, 10, 0)));
  assert.ok(!fires(wk, D(2026, 10, TUE, 10, 0)) && !fires(wk, D(2026, 11, 4, 10, 0)) && !fires(wk, D(2026, 11, 6, 10, 0)) && !fires(wk, D(2026, 10, 21, 10, 0)));
  assert.strictEqual(S.isPastOneShot(wk, D(2026, 10, 30, 9, 0)), false); assert.strictEqual(S.isPastOneShot(wk, D(2026, 10, 30, 10, 5)), true);
  assert.strictEqual(A.sanitizeRepeat({ kind: 'week', weekStart: '2026-10-28', days: [3] }).weekStart, '2026-10-26');   // 주 시작은 월요일로 정리
});
t('오늘만 건너뛰기: 그 날짜 하루만 안 울리고(미리 알림 포함) 다음 주에는 다시 울린다', () => {
  const mon = al({ preMinutes: 10, repeat: { kind: 'weekly', days: [1] }, skipDate: '2026-10-26' });
  assert.ok(!fires(mon, D(2026, 10, MON, 10, 0)));
  assert.deepStrictEqual(A.dueActions(merge({ alarms: [mon] }), D(2026, 10, MON, 9, 50), new Set()), []);   // 미리 알림도 건너뜀
  assert.ok(fires(mon, D(2026, 11, 2, 10, 0)));
  assert.deepStrictEqual(toasts(A.dueActions(merge({ alarms: [{ ...mon, skipDate: undefined }] }), D(2026, 11, 2, 9, 50), new Set())), ['alarm10']);
});
t('알람 끔: 꺼진 알람은 반복·날짜와 상관없이 안 울린다', () => {
  assert.ok(!fires(al({ enabled: false, repeat: { kind: 'weekly', days: [1] } }), D(2026, 10, MON, 10, 0)));
  assert.ok(!fires(al({ enabled: false, repeat: { kind: 'date', date: '2026-10-26' } }), D(2026, 10, MON, 10, 0)));
});
t('기존 알람 호환: 반복 정보가 없으면 매일 울리고, 저장 정리 후에도 모양이 그대로(반복 키를 만들지 않음)', () => {
  const old = { id: 'o1', time: '09:00', enabled: true }; const fired = new Set();
  for (let d = 26; d <= 32; d++) assert.ok(fires(old, new Date(2026, 9, d, 9, 0, 30), fired));
  assert.deepStrictEqual(merge({ alarms: [old] }).alarms, [old]);
  const five = Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, time: `0${i + 1}:00`, enabled: i % 2 === 0, name: i ? `이름${i}` : undefined })).map(a => (a.name ? a : { id: a.id, time: a.time, enabled: a.enabled }));
  assert.deepStrictEqual(merge({ alarms: five }).alarms, five);
  assert.strictEqual(S.repeatSummary(old), '매일'); assert.deepStrictEqual(S.effectiveDays(old), [0, 1, 2, 3, 4, 5, 6]);
});
t('알람 상한 50개: 저장 정리가 50개까지만 남기고 앞쪽을 유지한다(점심·퇴근은 별도)', () => {
  assert.strictEqual(A.MAX_ALARMS, 50); assert.strictEqual(S.MAX_ALARMS, 50);
  const many = Array.from({ length: 73 }, (_, i) => ({ id: `m${i}`, time: `${String(i % 24).padStart(2, '0')}:00`, enabled: true }));
  const out = merge({ lunchEnabled: true, alarms: many }); assert.strictEqual(out.alarms.length, 50); assert.strictEqual(out.alarms[0].id, 'm0'); assert.strictEqual(out.alarms[49].id, 'm49'); assert.strictEqual(out.lunchEnabled, true);
});
t('잘못된 반복·건너뛰기 값은 버린다(요일 없음·없는 날짜·모르는 종류)', () => {
  for (const bad of [{ kind: 'weekly', days: [] }, { kind: 'weekly', days: [9, -1] }, { kind: 'date', date: '2026-02-30' }, { kind: 'date', date: '10/27' }, { kind: 'week', weekStart: 'x', days: [1] }, { kind: 'month' }, 'x', null]) assert.strictEqual(A.sanitizeRepeat(bad), undefined, JSON.stringify(bad));
  assert.strictEqual(merge({ alarms: [{ id: 'z', time: '09:00', enabled: true, skipDate: '2026-13-01' }] }).alarms[0].skipDate, undefined);
  assert.deepStrictEqual(A.sanitizeRepeat({ kind: 'weekly', days: [3, 1, 1, 3] }), { kind: 'weekly', days: [1, 3] });
});
t('놓친 알람: 앱이 꺼져 있던 동안 지난 알람은 최근 10분 이내만 "놓친 알람"으로 한 번, 점심·퇴근은 그대로 건너뜀', () => {
  assert.strictEqual(A.MISSED_WINDOW_MIN, 10);
  const settings = merge({ lunchEnabled: true, lunchTime: '10:02', alarms: [al({ id: 'recent', time: '10:00' }), al({ id: 'old', time: '09:40', name: '오래됨' })] });
  const sch = A.createScheduler();   // 방금 앱을 켰다(10:05) — 마지막 확인 기록이 없다
  const first = sch.check(settings, D(2026, 10, MON, 10, 5, 10));
  assert.deepStrictEqual(first.map(a => [a.card, a.missed === true, a.alarm && a.alarm.name]), [['alarm', true, '주간회의']]);   // 10분 안: 놓친 카드 1장, 25분 전·점심은 없음
  assert.deepStrictEqual(sch.check(settings, D(2026, 10, MON, 10, 5, 40)), []);                // 같은 분 다시 확인해도 중복 없음
  assert.deepStrictEqual(sch.check(settings, D(2026, 10, MON, 10, 6, 10)), []);                // 다음 분에도 다시 안 울림
  // 앱을 다시 켜도(저장해 둔 발화 기록을 넘겨 주면) 같은 알람이 또 울리지 않는다
  const again = A.createScheduler({ fired: new Set(sch.fired) }); assert.deepStrictEqual(again.check(settings, D(2026, 10, MON, 10, 7, 0)), []);
});
t('제때 울린 알람은 "놓친 알람"이 아니고, 1분 안쪽 지연도 보통 카드로 본다', () => {
  const settings = merge({ alarms: [al({ time: '10:00' })] }); const sch = A.createScheduler();
  sch.check(settings, D(2026, 10, MON, 9, 59, 20));
  const on = sch.check(settings, D(2026, 10, MON, 10, 0, 5)); assert.deepStrictEqual(on.map(a => a.missed === true), [false]);
  const s2 = A.createScheduler(); s2.check(settings, D(2026, 10, MON, 9, 59, 30));
  const lateOne = s2.check(settings, D(2026, 10, MON, 10, 1, 0)); assert.deepStrictEqual(lateOne.map(a => a.missed === true), [false]);   // 타이머가 1분쯤 밀림(2분 이내)
  // 앱을 막 켠 첫 확인이거나 2분 넘게 건너뛴 뒤(절전)에는 지난 분은 1분 전이어도 "놓친 알람"
  const first = A.createScheduler().check(settings, D(2026, 10, MON, 10, 1, 20)); assert.deepStrictEqual(first.map(a => a.missed === true), [true]);
  const wake = A.createScheduler(); wake.check(settings, D(2026, 10, MON, 9, 55, 0)); assert.deepStrictEqual(wake.check(settings, D(2026, 10, MON, 10, 1, 20)).map(a => a.missed === true), [true]);
});
t('절전에서 깨어남/시각 변경: 오래 자다 깨면 최근 10분만, 시계를 되돌려도 다시 울리지 않고, 크게 앞으로 가도 최근 10분만', () => {
  const settings = merge({ alarms: [al({ id: 'x', time: '10:03' }), al({ id: 'y', time: '10:30', name: '반' })] });
  const sch = A.createScheduler(); sch.check(settings, D(2026, 10, MON, 10, 0, 10));
  const wake = sch.check(settings, D(2026, 10, MON, 10, 7, 20));            // 10:00 → 10:07에 깨어남
  assert.deepStrictEqual(wake.map(a => [a.alarm.name, a.missed]), [['주간회의', true]]);
  assert.deepStrictEqual(sch.check(settings, D(2026, 10, MON, 9, 30, 0)), []);                   // 시계를 30분 되돌림: 다시 울리지 않음
  assert.deepStrictEqual(sch.check(settings, D(2026, 10, MON, 10, 4, 0)), []);                   // 되돌린 시계가 10:03을 다시 지나가도 기록 때문에 안 울림
  const jump = A.createScheduler(); jump.check(settings, D(2026, 10, MON, 8, 0, 0));
  const far = jump.check(settings, D(2026, 10, MON, 10, 35, 0));            // 2시간 35분 뒤로 건너뜀: 10:25~10:35만 본다 → 10:30 알람
  assert.deepStrictEqual(far.map(a => [a.alarm.name, a.missed]), [['반', true]]);
});
t('자정 넘김은 시작한 날(요일) 기준: 월요일 23:30 시작 일정은 월요일에만 울리고 캘린더에서도 월요일에 그 날 끝까지 그린다', () => {
  const night = al({ id: 'n', time: '23:30', endTime: '01:00', repeat: { kind: 'weekly', days: [1] } });
  assert.ok(fires(night, D(2026, 10, MON, 23, 30))); assert.ok(!fires(night, D(2026, 10, TUE, 23, 30))); assert.ok(!fires(night, D(2026, 10, TUE, 0, 30)));
  const mon = CAL.dayEvents([night], new Date(2026, 9, MON), D(2026, 10, MON, 12, 0)); assert.deepStrictEqual(mon.map(e => [e.startMin, e.alarm.id]), [[23 * 60 + 30, 'n']]);   // 시작한 날(월요일)에만
  assert.deepStrictEqual(CAL.dayEvents([night], new Date(2026, 9, TUE), D(2026, 10, MON, 12, 0)), []);
  // 미리 알림이 자정을 넘어 전날 밤에 뜨는 경우: 알람이 울릴 날을 기준으로 판정한다(화요일 00:05 알람 → 월요일 23:55 토스트)
  const early = al({ id: 'e', time: '00:05', preMinutes: 10, repeat: { kind: 'weekly', days: [2] } });
  assert.deepStrictEqual(toasts(A.dueActions(merge({ alarms: [early] }), D(2026, 10, MON, 23, 55), new Set())), ['alarm10']);
  assert.deepStrictEqual(A.dueActions(merge({ alarms: [early] }), D(2026, 10, TUE, 23, 55), new Set()), []);   // 수요일 00:05는 반복 요일이 아님
});
t('발화 기록 저장·복원(날짜+알람 id+시각 키), 깨진 파일은 빈 기록', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'choeae-alarm-unit-')); const f = path.join(dir, 'alarm-fired.json');
  try {
    const fired = new Set(); A.dueActions(merge({ alarms: [al({ id: 'k1' })] }), D(2026, 10, MON, 10, 0), fired);
    assert.ok([...fired].some(k => k.endsWith('|alarm|k1|10:00') && k.startsWith(D(2026, 10, MON).toDateString()))); assert.strictEqual(A.saveFired(f, fired), true);
    assert.deepStrictEqual([...A.loadFired(f)], [...fired]); fs.writeFileSync(f, '{깨짐'); assert.strictEqual(A.loadFired(f).size, 0); assert.strictEqual(A.loadFired(path.join(dir, 'none.json')).size, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
t('메인(alarms.cjs)과 화면(TypeScript)의 반복 규칙이 같은 결과를 낸다(여러 반복·날짜 조합)', () => {
  const reps = [undefined, { kind: 'weekly', days: [1] }, { kind: 'weekly', days: [0, 6] }, { kind: 'weekly', days: [1, 2, 3, 4, 5] }, { kind: 'date', date: '2026-10-27' }, { kind: 'date', date: '2026-12-31' }, { kind: 'week', weekStart: '2026-10-26', days: [3, 5] }, { kind: 'week', weekStart: '2026-12-28', days: [0] }];
  let checked = 0;
  for (const repeat of reps) for (let off = -20; off <= 80; off++) { const day = new Date(2026, 9, 20 + off, 13, 0, 0); assert.strictEqual(A.occursOn({ repeat }, day), S.occursOn({ repeat }, day), `${JSON.stringify(repeat)} ${day.toDateString()}`); checked++; }
  for (const d of [new Date(2026, 9, 25), new Date(2026, 9, 26), new Date(2026, 11, 31), new Date(2027, 0, 1)]) { assert.strictEqual(A.ymd(d), S.ymd(d)); assert.strictEqual(A.ymd(A.mondayOf(d)), S.ymd(S.mondayOf(d))); }
  assert.ok(checked > 800);
});
t('반복 요약 문구: 매일/평일/주말/매주 월·수/날짜/그 주만', () => {
  assert.deepStrictEqual([undefined, { kind: 'weekly', days: [1, 2, 3, 4, 5] }, { kind: 'weekly', days: [6, 0] }, { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] }, { kind: 'weekly', days: [3, 1] }, { kind: 'date', date: '2026-10-27' }, { kind: 'week', weekStart: '2026-10-26', days: [5, 3] }, { kind: 'week', weekStart: '2026-10-26', days: [1, 2, 3, 4, 5] }].map(repeat => S.repeatSummary({ repeat })),
    ['매일', '평일', '주말', '매일', '매주 월·수', '10월 27일(화)', '그 주만 수·금', '그 주만 평일']);
});
t('"놓친 알람" 카드 문구와 메인 연결: 스케줄러 사용, 발화 기록 저장·복원, 절전 해제 시 확인, 카드에 놓침 표시 전달', () => {
  assert.strictEqual(T.alarmSubText({ missed: true, time: '14:00' }), '놓친 알람 · 오후 2:00');
  assert.strictEqual(T.alarmSubText({ missed: true, time: '14:00', endTime: '15:00', memo: '준비' }), '놓친 알람 · 오후 2:00 · 오후 2:00 – 오후 3:00 · 준비');
  assert.strictEqual(T.alarmSubText({ missed: false, time: '14:00' }), '알람이 울렸어요!');
  assert.strictEqual(A.cardInfo({ time: '14:00', missed: true }).missed, true); assert.strictEqual('missed' in A.cardInfo({ time: '14:00' }), false);
  const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8'), card = fs.readFileSync(path.join(root, 'src/pages/BreakTimePage.tsx'), 'utf8');
  assert.match(main, /alarms\.createScheduler\(/); assert.match(main, /scheduler\.check\(alarmSettings, now\)/); assert.match(main, /alarms\.saveFired\(firedFile\(\), scheduler\.fired\)/);
  assert.match(main, /alarms\.loadFired\(firedFile\(\)\)/); assert.match(main, /powerMonitor\.on\('resume'/); assert.match(main, /x: info\.missed \? '1' : ''/);
  assert.match(card, /missed: q\.get\('x'\) === '1'/);
});
t('스타일 이름 충돌 방지: 홈 화면 칩(.st-chips/.st-chip)은 한 번만 정의하고, 알람 요일 칩은 다른 이름(.st-dayrow/.st-daychip)을 쓴다', () => {
  const css = fs.readFileSync(path.join(root, 'src/styles/settings.css'), 'utf8'), pane = fs.readFileSync(path.join(root, 'src/components/settings/AlarmDetailFields.tsx'), 'utf8');
  assert.strictEqual((css.match(/^\.st-chips\s*\{/gm) || []).length, 1, '.st-chips 정의는 홈 칩 한 곳');
  assert.strictEqual((css.match(/^\.st-chip\s*\{/gm) || []).length, 1, '.st-chip 정의는 홈 칩 한 곳');
  assert.ok(/^\.st-dayrow\s*\{/m.test(css) && /^\.st-daychip\s*\{/m.test(css));
  assert.ok(!/className="st-chips?\b/.test(pane) && /className="st-dayrow"/.test(pane) && /className="st-daychip/.test(pane));
});
t('주간 캘린더(일자 아래로 쌓기): 주는 월~일 7열, 알람은 시각 순으로 쌓이고 정오부터 오후 칸, 있는 날/없는 날이 개수로 구분된다', () => {
  const ws = S.mondayOf(new Date(2026, 9, 28)); assert.strictEqual(S.ymd(ws), '2026-10-26');
  assert.deepStrictEqual(CAL.weekDates(ws).map(d => d.getDay()), [1, 2, 3, 4, 5, 6, 0]); assert.strictEqual(CAL.weekRangeLabel(ws), '10월 26일 – 11월 1일'); assert.strictEqual(CAL.weekRangeLabel(S.mondayOf(new Date(2026, 9, 21))), '10월 19일 – 25일');
  const mk = (id, time, extra = {}) => al({ id, time, ...extra }); const wed = new Date(2026, 9, 28); const nowD = D(2026, 10, 28, 9, 0);
  const st = CAL.stackDay([mk('c', '14:30'), mk('a', '09:30'), mk('b', '11:59'), mk('d', '12:00'), mk('e', '23:00'), mk('f', '09:30', { id: 'z', enabled: false })], wed, nowD);
  assert.deepStrictEqual(st.am.map(e => e.alarm.id), ['a', 'z', 'b']);   // 09:30(같으면 id 순) → 11:59
  assert.deepStrictEqual(st.pm.map(e => e.alarm.id), ['d', 'c', 'e']);   // 12:00은 오후
  assert.strictEqual(st.count, 6); assert.deepStrictEqual(st.am.map(e => e.dim), [false, true, false]);
  assert.strictEqual(CAL.stackDay([], wed, nowD).count, 0); assert.deepStrictEqual([CAL.stackDay([], wed, nowD).am, CAL.stackDay([], wed, nowD).pm], [[], []]);   // 없는 날은 비어 있다
  assert.deepStrictEqual([CAL.zoneOf(0), CAL.zoneOf(719), CAL.zoneOf(720), CAL.zoneOf(1439)], ['am', 'am', 'pm', 'pm']);
  assert.deepStrictEqual([CAL.defaultTimeFor('am'), CAL.defaultTimeFor('pm')], ['09:00', '14:00']);   // 빈 곳을 눌렀을 때 새 알람의 기본 시각
});
t('캘린더 상태 표시: 꺼짐·오늘 건너뜀·지난 한 번짜리는 흐리게, 오늘 칸의 "지금" 자리, 반복 요일별 배치', () => {
  const day = new Date(2026, 9, 28), nowD = D(2026, 10, 28, 13, 0);
  const off = al({ id: 'o', time: '10:00', enabled: false }), sk = al({ id: 's', time: '15:00', skipDate: '2026-10-28' }), pastOne = al({ id: 'p', time: '08:00', repeat: { kind: 'date', date: '2026-10-28' } });
  const st = CAL.stackDay([off, sk, pastOne, al({ id: 'n1', time: '12:30' }), al({ id: 'n2', time: '16:00' })], day, nowD);
  assert.deepStrictEqual(st.am.map(e => [e.alarm.id, e.dim, e.past]), [['p', true, true], ['o', true, false]]);
  assert.deepStrictEqual(st.pm.map(e => [e.alarm.id, e.dim]), [['n1', false], ['s', true], ['n2', false]]);
  assert.deepStrictEqual(st.nowAt, { zone: 'pm', index: 1 });                                   // 13:00 → 오후 칸에서 12:30 다음, 15:00 앞
  assert.strictEqual(CAL.stackDay([off], new Date(2026, 9, 27), nowD).nowAt, null);               // 오늘이 아니면 표시 없음
  assert.strictEqual(CAL.stackDay([], day, nowD).nowAt, null);                                    // 알람이 없는 칸에는 표시하지 않음
  const alarms = [al({ id: 'w', time: '10:00', repeat: { kind: 'weekly', days: [1, 3] } }), al({ id: 'd', time: '15:00', repeat: { kind: 'date', date: '2026-10-27' } })];
  assert.deepStrictEqual(CAL.weekDates(S.mondayOf(day)).map(d => CAL.stackDay(alarms, d, nowD).count), [1, 1, 1, 0, 0, 0, 0]);   // 월(w) 화(d) 수(w)
});
t('블록 말풍선 정보: 이름·시간(범위)·반복·참석자·메모·미리 알림·상태 순으로 간단히', () => {
  const day = new Date(2026, 9, 28);
  const full = CAL.tooltipInfo(al({ name: '디자인 리뷰', time: '14:00', endTime: '15:00', attendees: '김OO, 이OO, 박OO, 최OO', memo: '시안 3종', preMinutes: 10, repeat: { kind: 'weekly', days: [3] } }), day, false);
  assert.deepStrictEqual(full, { title: '디자인 리뷰', lines: ['오후 2:00 – 오후 3:00', '매주 수', '참석 김OO, 이OO, 박OO 외 1명', '시안 3종', '10분 전에 미리 알림'], status: '' });
  const bare = CAL.tooltipInfo({ id: 'x', time: '09:00', enabled: false }, day, false); assert.deepStrictEqual(bare, { title: '알람', lines: ['오전 9:00', '매일'], status: '꺼짐' });
  assert.strictEqual(CAL.tooltipInfo(al({ skipDate: '2026-10-28' }), day, false).status, '오늘은 건너뜀'); assert.strictEqual(CAL.tooltipInfo(al({ repeat: { kind: 'date', date: '2026-10-20' } }), day, true).status, '완료');
});
t('다가오는 한 번짜리 알람(다른 주 이동 안내): 날짜·그 주만, 시각 순, 꺼짐·지난 것 제외', () => {
  const nowD = D(2026, 10, 28, 12, 0);
  const list = CAL.upcomingOneShots([al({ id: 'late', time: '09:00', repeat: { kind: 'date', date: '2026-11-03' } }), al({ id: 'soon', time: '15:00', repeat: { kind: 'date', date: '2026-10-29' } }), al({ id: 'gone', time: '09:00', repeat: { kind: 'date', date: '2026-10-20' } }),
    al({ id: 'off', time: '09:00', enabled: false, repeat: { kind: 'date', date: '2026-10-30' } }), al({ id: 'wk', time: '10:00', repeat: { kind: 'weekly', days: [1] } }), al({ id: 'wo', time: '08:00', repeat: { kind: 'week', weekStart: '2026-10-26', days: [5] } })], nowD);
  assert.deepStrictEqual(list.map(u => u.alarm.id), ['soon', 'wo', 'late']);
});
t('알람 탭 화면 연결(정적 확인): 설정(목록) 아래에 캘린더 카드, 보기 전환 없음, 말풍선·키보드·편집', () => {
  const pane = fs.readFileSync(path.join(root, 'src/components/settings/AlarmPane.tsx'), 'utf8'), cal = fs.readFileSync(path.join(root, 'src/components/settings/AlarmCalendar.tsx'), 'utf8'), css = fs.readFileSync(path.join(root, 'src/styles/settings.css'), 'utf8');
  assert.ok(pane.indexOf('className="st-two"') < pane.indexOf('st-cal-card') && pane.indexOf('<AlarmCalendar') > pane.indexOf('className="st-two"'), '목록·근무 시간이 위, 캘린더가 아래');
  assert.ok(!/Segmented/.test(pane) && !/alarmView/.test(pane), '보기 전환 제거');
  assert.match(cal, /className="st-cal-tip" role="tooltip"/); assert.match(cal, /onClick=\{\(\) => onEdit\(a\.id\)\}/); assert.match(cal, /ArrowDown'\) moveCursor\(cursor\.col, 'pm'\)/); assert.match(cal, /오전/);
  assert.match(css, /\.st-cal-sheet\s*\{/); assert.match(css, /\.st-cal-gutter\[data-zone="pm"\], \.st-cal-cell\[data-zone="pm"\] \{ border-top: 2px/); assert.match(css, /\.st-cal-block:hover \.st-cal-tip/);
  for (const gone of ['.st-cal-axis', '.st-cal-col', '.st-cal-ev ', '.st-cal-fold', '--cal-hour']) assert.ok(!css.includes(gone), `옛 시간 축 스타일 제거: ${gone}`);
});
const L = load('src/utils/alarmList.ts');
t('"자세히" 펼침은 한 번에 하나: 열면 다른 항목은 접히고, 같은 항목을 다시 누르면 접힌다, 시작은 모두 접힘', () => {
  let open = null;                                               // 설정창을 열었을 때: 모두 접힘(저장하지 않음)
  open = L.toggleOpen(open, 'a'); assert.strictEqual(open, 'a');
  open = L.toggleOpen(open, 'b'); assert.strictEqual(open, 'b');   // b를 열면 열려 있던 a는 자동으로 접힌다
  open = L.toggleOpen(open, 'b'); assert.strictEqual(open, null);  // 열린 것을 다시 누르면 접힘
  open = L.toggleOpen(open, 'a'); open = L.toggleOpen(open, 'c'); open = L.toggleOpen(open, 'a'); assert.strictEqual(open, 'a');   // 항상 최대 하나
});
t('새 알람(추가·복제)은 자동으로 펼쳐지고 나머지는 접힌다, 지우면 접힌다, 없는 알람이 열려 있으면 접는다', () => {
  assert.strictEqual(L.openAfterAdd('a', 'new'), 'new'); assert.strictEqual(L.openAfterAdd(null, 'new'), 'new');
  assert.strictEqual(L.openAfterRemove('a', 'a'), null); assert.strictEqual(L.openAfterRemove('a', 'b'), 'a'); assert.strictEqual(L.openAfterRemove(null, 'b'), null);
  assert.strictEqual(L.openIfExists('a', ['a', 'b']), 'a'); assert.strictEqual(L.openIfExists('z', ['a', 'b']), null); assert.strictEqual(L.openIfExists(null, ['a']), null);
});
t('알람 목록 화면 연결(정적 확인): 접이식 영역, 새 알람 포커스, aria-expanded, 저장 안 함, 모달과 독립, 움직임 줄이기, 줄이 줄어들지 않음', () => {
  const pane = fs.readFileSync(path.join(root, 'src/components/settings/AlarmPane.tsx'), 'utf8'), acc = fs.readFileSync(path.join(root, 'src/components/settings/AlarmAccordion.tsx'), 'utf8'), css = fs.readFileSync(path.join(root, 'src/styles/settings.css'), 'utf8');
  assert.match(pane, /useState<string \| null>\(null\);\s*\/\/ 목록에서 "자세히"가 펼쳐진 알람\(한 번에 하나\)/);   // 시작은 모두 접힘
  assert.match(pane, /setOpenId\(o => toggleOpen\(o, alarm\.id\)\)/); assert.match(pane, /aria-expanded=\{open\}/); assert.match(pane, /<AlarmAccordion open=\{open\}/);
  assert.match(pane, /setOpenId\(o => openAfterAdd\(o, id\)\); setFocusId\(id\)/); assert.match(pane, /alarm-name-\$\{focusId\}/);                     // 새 알람: 펼침 + 이름 칸 포커스
  assert.match(pane, /cloneAlarm\(editing\.id, false\)/);                                                                                         // 편집 창 복제는 목록 펼침을 건드리지 않음
  assert.ok(!/localStorage[^\n]*(open|펼침)/i.test(pane), '펼침 상태는 저장하지 않는다');
  assert.match(acc, /prefers-reduced-motion/); assert.match(acc, /DURATION_MS = 240/); assert.match(acc, /setAttribute\('inert'/); assert.match(acc, /if \(!present\) return null/);
  assert.match(css, /\.st-acc\s*\{[^}]*grid-template-rows: 0fr/); assert.match(css, /\.st-acc\[data-open\]\s*\{[^}]*1fr/); assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.st-acc \{ transition: none; \} \}/);
  assert.match(css, /\.st-li--alarm \{ flex: 0 0 auto;/);   // 목록 높이를 제한해도 줄이 줄어들어 내용이 겹치지 않는다
});
t('폼 규격(정적 확인): 모든 입력 칸이 같은 높이·좌우 여백, 요일 칩은 같은 크기의 원, 프리셋은 같은 높이', () => {
  const ui = fs.readFileSync(path.join(root, 'src/styles/ui.css'), 'utf8'), tok = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8'), css = fs.readFileSync(path.join(root, 'src/styles/settings.css'), 'utf8');
  assert.match(tok, /--ui-field-h: 44px/); assert.match(tok, /--ui-field-px: 14px/); assert.match(tok, /--ui-chip-h: 40px/); assert.match(tok, /--ui-gap-field: 16px/); assert.match(tok, /--ui-gap-label: 6px/);
  assert.match(ui, /:where\(\.ui-time, \.st-text, \.st-msg-input, \.ui-select select\)\s*\{[^}]*height: var\(--ui-field-h\)[^}]*padding-block: 0; padding-inline: var\(--ui-field-px\)/);
  assert.ok(!/^\.st-text \{/m.test(css) && !/^\.st-msg-input \{/m.test(css), '입력 칸 개별 높이·여백 정의는 공통 규격으로 일원화');
  assert.match(css, /\.st-daychip--day \{ width: var\(--ui-chip-h\); border-radius: 50%; \}/); assert.match(css, /\.st-daychip \{[^}]*height: var\(--ui-chip-h\)/); assert.match(css, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
});
console.log(`\n${n}개 통과`);
