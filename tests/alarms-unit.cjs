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
console.log(`\n${n}개 통과`);
