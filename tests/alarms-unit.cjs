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
console.log(`\n${n}개 통과`);
