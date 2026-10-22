// "컴퓨터를 켜면 자동 실행" 단위 테스트: Electron의 app을 가짜로 바꿔서 이 컴퓨터의 로그인 항목을 건드리지 않는다. `node tests/login-item-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const L = require('../login-item.cjs'), A = require('../alarms.cjs');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

// ── 가짜 app: OS의 로그인 항목 상태를 흉내 낸다 ──────────────────────────────
function fakeApp({ initial = false, failWrites = false } = {}) {
  const calls = { get: [], set: [] }; let os = initial;
  return { calls, get os() { return os; }, set os(v) { os = v; },
    getLoginItemSettings: (opts) => { calls.get.push(opts); return { openAtLogin: os, wasOpenedAtLogin: false }; },
    setLoginItemSettings: (opts) => { calls.set.push(opts); if (!failWrites) os = !!opts.openAtLogin; } };
}
const MAC = { platform: 'darwin', isPackaged: true, defaultApp: false, env: {}, exePath: '/Applications/choeae-app.app/Contents/MacOS/choeae-app', home: '/Users/lala' };
const WIN = { platform: 'win32', isPackaged: true, defaultApp: false, env: {}, exePath: 'C:\\Users\\a\\AppData\\Local\\Programs\\choeae-app\\choeae-app.exe', home: 'C:\\Users\\a' };

t('기본값은 꺼짐: 읽기만 해서는 OS에 아무것도 등록하지 않는다(사용자 동의 없이 켜지지 않는다)', () => {
  const app = fakeApp(); const s = L.readLoginItem({ app, ...MAC });
  assert.deepStrictEqual(s, { supported: true, enabled: false, reason: null, note: '알람을 놓치지 않게 로그인할 때 펫이 같이 켜져요' });
  assert.strictEqual(app.calls.set.length, 0);
  const main = read('main.cjs'); assert.ok(!/setLoginItemSettings/.test(main), 'main.cjs는 직접 등록하지 않는다(사용자가 토글을 켤 때 IPC로만)');
});
t('OS의 실제 상태를 읽는다: OS에서 켜져 있으면 켜짐(시스템 설정에서 바꿔도 따라간다)', () => {
  const app = fakeApp({ initial: true }); assert.strictEqual(L.readLoginItem({ app, ...MAC }).enabled, true);
  app.os = false; assert.strictEqual(L.readLoginItem({ app, ...MAC }).enabled, false, '읽을 때마다 OS 값');
});
t('쓰기: 켜고 끄면 OS에 반영하고, OS에서 다시 읽은 값을 돌려준다(Windows는 경로·인자 포함)', () => {
  const mac = fakeApp(); assert.strictEqual(L.writeLoginItem({ app: mac, ...MAC }, true).enabled, true);
  assert.deepStrictEqual(mac.calls.set, [{ openAtLogin: true }]); assert.strictEqual(mac.os, true);
  assert.strictEqual(L.writeLoginItem({ app: mac, ...MAC }, false).enabled, false); assert.strictEqual(mac.os, false);
  const win = fakeApp(); L.writeLoginItem({ app: win, ...WIN }, true);
  assert.deepStrictEqual(win.calls.set, [{ openAtLogin: true, path: WIN.exePath, args: ['--opened-at-login'] }]);
  assert.deepStrictEqual(win.calls.get.at(-1), { path: WIN.exePath, args: ['--opened-at-login'] }, '등록한 경로·인자로 읽는다');
});
t('쓰기 결과가 OS와 어긋나지 않게: 등록이 실패하면 꺼진 채로 보인다, true가 아닌 값은 끈다', () => {
  const failing = fakeApp({ failWrites: true }); assert.strictEqual(L.writeLoginItem({ app: failing, ...MAC }, true).enabled, false, '실패하면 실제 상태(꺼짐)를 돌려준다');
  const app = fakeApp({ initial: true }); assert.strictEqual(L.writeLoginItem({ app, ...MAC }, 'true').enabled, false, "문자열 'true' 같은 값은 켜지 않는다");
  const thrower = { getLoginItemSettings: () => { throw new Error('x'); }, setLoginItemSettings: () => { throw new Error('y'); } };
  assert.strictEqual(L.writeLoginItem({ app: thrower, ...MAC }, true).enabled, false, '예외도 안전하게 꺼짐');
});
t('개발 모드·fresh 모드에서는 동작하지 않는다: 읽어도 꺼짐, 써도 OS를 건드리지 않는다', () => {
  for (const [label, over] of [['개발 모드(비패키지)', { isPackaged: false }], ['fresh(electron . + dist-mode: defaultApp)', { defaultApp: true }]]) {
    const app = fakeApp({ initial: true }); const deps = { app, ...MAC, ...over };
    const s = L.readLoginItem(deps); assert.strictEqual(s.supported, false, label); assert.strictEqual(s.enabled, false, `${label}: OS가 켜져 있어도 꺼짐으로 보인다`); assert.strictEqual(s.reason, 'dev'); assert.strictEqual(s.note, '개발 모드에서는 쓸 수 없어요');
    L.writeLoginItem(deps, true); L.writeLoginItem(deps, false); assert.strictEqual(app.calls.set.length, 0, `${label}: 로그인 항목을 바꾸지 않는다`); assert.strictEqual(app.calls.get.length, 0, `${label}: 읽지도 않는다`);
  }
  const main = read('main.cjs'); assert.match(main, /defaultApp: !!process\.defaultApp/);   // dist-mode는 isPackaged만 속이므로 defaultApp으로 fresh를 가려낸다
  assert.match(read('scripts/fresh-start.cjs'), /dist-mode\.cjs'\), '\.'/);                // fresh는 `electron -r dist-mode.cjs .`로 띄운다(defaultApp이 true)
});
t('Windows 포터블(PORTABLE_EXECUTABLE_FILE)과 맥의 응용 프로그램 폴더 밖에서는 쓸 수 없다: "설치 버전에서 사용할 수 있어요"', () => {
  const portable = { app: fakeApp({ initial: true }), ...WIN, env: { PORTABLE_EXECUTABLE_FILE: 'C:\\x\\choeae-app-1.3.0.exe' } };
  const p = L.readLoginItem(portable); assert.deepStrictEqual([p.supported, p.enabled, p.reason, p.note], [false, false, 'portable', '설치 버전에서 사용할 수 있어요']);
  L.writeLoginItem(portable, true); assert.strictEqual(portable.app.calls.set.length, 0);
  for (const exe of ['/Users/lala/Downloads/choeae-app.app/Contents/MacOS/choeae-app', '/Volumes/choeae-app/choeae-app.app/Contents/MacOS/choeae-app', '/private/var/folders/x/AppTranslocation/1/d/choeae-app.app/Contents/MacOS/choeae-app']) {
    const d = { app: fakeApp(), ...MAC, exePath: exe }; const s = L.readLoginItem(d);
    assert.deepStrictEqual([s.supported, s.reason, s.note], [false, 'location', '설치 버전에서 사용할 수 있어요'], exe); L.writeLoginItem(d, true); assert.strictEqual(d.app.calls.set.length, 0, exe);
  }
  assert.strictEqual(L.readLoginItem({ app: fakeApp(), ...MAC, exePath: '/Users/lala/Applications/choeae-app.app/Contents/MacOS/choeae-app' }).supported, true, '~/Applications 안은 가능');
  assert.strictEqual(L.readLoginItem({ app: fakeApp(), ...WIN, env: {} }).supported, true, '설치형 Windows는 가능');
  assert.strictEqual(L.readLoginItem({ app: fakeApp(), ...WIN, platform: 'linux' }).supported, false, '그 밖의 OS는 지원하지 않는다');
});
t('로그인 자동 실행 판별: Windows는 실행 인자, 맥은 wasOpenedAtLogin(인자도 인정), 평소 실행은 아님', () => {
  assert.strictEqual(L.wasLaunchedAtLogin({ platform: 'win32', argv: ['choeae-app.exe', '--opened-at-login'] }), true);
  assert.strictEqual(L.wasLaunchedAtLogin({ platform: 'win32', argv: ['choeae-app.exe'] }), false);
  assert.strictEqual(L.wasLaunchedAtLogin({ platform: 'darwin', argv: ['x'], getSettings: () => ({ wasOpenedAtLogin: true }) }), true);
  assert.strictEqual(L.wasLaunchedAtLogin({ platform: 'darwin', argv: ['x'], getSettings: () => ({ wasOpenedAtLogin: false }) }), false);
  assert.strictEqual(L.wasLaunchedAtLogin({ platform: 'darwin', argv: ['x', '--opened-at-login'], getSettings: () => ({}) }), true);
  assert.strictEqual(L.wasLaunchedAtLogin({ platform: 'win32', argv: ['x'], getSettings: () => ({ wasOpenedAtLogin: true }) }), false, 'Windows는 OS 값이 아니라 인자로만');
  assert.strictEqual(L.wasLaunchedAtLogin({ platform: 'darwin', argv: [], getSettings: () => { throw new Error('x'); } }), false);
});
t('자동 실행으로 켜지면 설정창을 만들지 않고 버디·트레이·알람은 그대로 시작한다(정적 확인), 첫 실행 판정·인트로 로직은 그대로', () => {
  const main = read('main.cjs');
  assert.match(main, /const launchedAtLogin = loginItem\.wasLaunchedAtLogin\(\{ platform: process\.platform, argv: process\.argv, getSettings: \(\) => app\.getLoginItemSettings\(\) \}\);\s*if \(launchedAtLogin\) silentUntil = Date\.now\(\) \+ SILENT_ACTIVATE_MS;\s*else createSettingsWindow\(\);\s*createPetWindow\(\);\s*createTray\(\);/);
  assert.ok(main.indexOf('restoreAlarms();') < main.indexOf('const launchedAtLogin'), '저장된 알람 복원은 창보다 먼저(자동 실행에서도 알람 스케줄이 돈다)');
  assert.match(main, /app\.on\('activate', \(\) => \{\s*if \(Date\.now\(\) < silentUntil\) return;/);   // 맥은 실행 직후에도 activate가 오므로 조용히 시작을 깨지 않게 한다
  assert.match(main, /freshInstall = !fs\.existsSync\(flagsFile\(\)\);/);                        // 첫 실행·신규 설치 판정 그대로
  assert.match(main, /markFlag\('introSeenVersion', app\.getVersion\(\)\);/); assert.match(main, /const needsIntro = \(\) => readFlags\(\)\.introSeenVersion !== app\.getVersion\(\);/);   // introSeenVersion 로직 그대로
  assert.match(main, /app\.on\('second-instance', \(\) => \{\s*if \(isQuitting\) return;[^}]*createSettingsWindow\(\);/);   // 다시 실행하면 설정창을 연다(단일 실행 잠금과 충돌 없음)
  assert.match(main, /const gotLock = app\.requestSingleInstanceLock\(\);/);
});
t('연결(정적 확인): IPC·preload·타입·기본 꺼짐 UI·빌드 파일', () => {
  const main = read('main.cjs'), pre = read('preload.cjs'), d = read('src/electron.d.ts'), home = read('src/components/settings/HomePane.tsx'), hook = read('src/hooks/useLoginItem.ts'), pkg = JSON.parse(read('package.json'));
  assert.match(main, /ipcMain\.handle\('login-item-get', \(\) => loginItem\.readLoginItem\(loginItemDeps\(\)\)\);/); assert.match(main, /ipcMain\.handle\('login-item-set', \(_e, enabled\) => loginItem\.writeLoginItem\(loginItemDeps\(\), enabled === true\)\);/);
  assert.ok(pre.includes("'login-item-get'") && pre.includes("'login-item-set'")); assert.ok(d.includes('getLoginItem') && d.includes('setLoginItem') && d.includes('LoginItemState'));
  for (const s of ['컴퓨터를 켜면 자동 실행', "id: 'login', label: '자동 실행'", "openKey === 'login'", 'login.refresh']) assert.ok(home.includes(s), s);
  assert.ok(!/localStorage|petSettings/.test(hook), '켬/끔 값을 앱 안에 저장하지 않는다(OS 상태가 기준)');
  assert.match(hook, /window\.addEventListener\('focus', refresh\)/);
  assert.ok(pkg.build.files.includes('login-item.cjs'));
  assert.ok(!/openAtLogin|autoLaunch|launchAtLogin/.test(read('src/utils/settings.ts')), '설정 저장 구조에 자동 실행 값이 없다');
});
t('자동 실행 직후에도 "놓친 알람 10분 창"이 그대로: 첫 확인에서 10분 안의 지난 알람은 놓친 카드 한 번, 10분 넘은 건 건너뜀', () => {
  const settings = A.mergeAlarmSettings({}, { alarms: [{ id: 'a', time: '09:00', enabled: true, name: '주간회의' }, { id: 'old', time: '08:40', enabled: true, name: '오래됨' }] }).settings;
  const d = (h, m, s = 0) => new Date(2026, 9, 22, h, m, s);   // 2026-10-22(목)
  // 09:03에 로그인해서 앱이 막 켜졌다(스케줄러 마지막 확인 기록 없음 = 첫 확인)
  const sch = A.createScheduler(); const first = sch.check(settings, d(9, 3, 10));
  assert.deepStrictEqual(first.map(x => [x.card, x.missed === true, x.alarm.name]), [['alarm', true, '주간회의']]);
  assert.deepStrictEqual(sch.check(settings, d(9, 3, 40)), [], '같은 분에 또 울리지 않는다');
  // 10분이 지나서 켜졌다면 놓친 알람 카드를 띄우지 않는다(창 10분)
  assert.deepStrictEqual(A.createScheduler().check(settings, d(9, 11, 0)), [], '11분 뒤에 켜지면 건너뜀');
  assert.strictEqual(A.MISSED_WINDOW_MIN, 10);
  // 자동 실행 경로가 스케줄러 시작을 막지 않는다: 알람 복원·체커 시작은 창 생성(조용한 시작 분기)보다 앞
  assert.match(read('main.cjs'), /restoreAlarms\(\);[^\n]*\r?\n(\s*focusState = [^\n]*\r?\n)?\s*app\.on\('activate'/);
});

console.log(`\n${n}개 통과`);
