// 자동 업데이트 단위 테스트: electron-updater·타이머·대화상자를 가짜로 바꿔서 실제 네트워크·시계를 쓰지 않는다. `node tests/updater-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { EventEmitter } = require('events');
const U = require('../updater.cjs');
const META = require('../scripts/fix-update-meta.cjs');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise(r => setImmediate(r));   // 대기 중인 Promise(대화상자 답 등)를 처리

// ── 가짜들 ────────────────────────────────────────────────────────────────────
function fakeTimers() {   // advance(ms)로 시간을 흘린다
  let now = 0, id = 0; const list = new Map();
  const add = (fn, ms, repeat) => { const k = ++id; list.set(k, { fn, at: now + ms, ms, repeat }); return k; };
  return {
    setTimeout: (fn, ms) => add(fn, ms, false), setInterval: (fn, ms) => add(fn, ms, true),
    clearTimeout: (k) => list.delete(k), clearInterval: (k) => list.delete(k),
    get count() { return list.size; },
    advance(ms) { const end = now + ms; for (;;) { const due = [...list.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; const [k, v] = due; now = v.at; if (v.repeat) v.at += v.ms; else list.delete(k); v.fn(); } now = end; },
  };
}
function fakeAutoUpdater() {   // 확인 결과를 미리 정해 둔다: next = 'available' | 'none' | 'error' | 'reject'
  const a = new EventEmitter(); a.calls = { check: 0, download: 0, quitAndInstall: [] }; a.next = 'none'; a.version = '1.4.0';
  a.checkForUpdates = async () => { a.calls.check++; if (a.next === 'available') a.emit('update-available', { version: a.version }); else if (a.next === 'none') a.emit('update-not-available', {}); else if (a.next === 'error') a.emit('error', new Error('net')); else if (a.next === 'reject') throw new Error('offline'); else if (a.next === 'both') { a.emit('error', new Error('net')); throw new Error('net'); } };
  a.downloadUpdate = async () => { a.calls.download++; if (a.failDownload) { a.emit('error', new Error('dl')); throw new Error('dl'); } };
  a.quitAndInstall = (...args) => { a.calls.quitAndInstall.push(args); };
  return a;
}
function make(over = {}) {
  const au = over.autoUpdater === undefined ? fakeAutoUpdater() : over.autoUpdater, timers = fakeTimers();
  const prompts = [], states = [], logs = []; let busy = false, installQuit = 0; const answers = over.answers || {};
  const up = U.createUpdater({
    autoUpdater: au, enabled: over.enabled ?? true, location: over.location, timers,
    isBusy: () => busy, showPrompt: async (kind, ctx) => { prompts.push({ kind, ...ctx }); const a = answers[kind]; return typeof a === 'function' ? a(ctx) : (a || 'later'); },
    requestInstallQuit: () => { installQuit++; }, onState: (s) => states.push(s), log: (...a) => logs.push(a.join(' ')),
  });
  return { up, au, timers, prompts, states, logs, setBusy: (v) => { busy = v; }, get installQuit() { return installQuit; } };
}
const statuses = (states) => states.map(s => s.status);

// ── 켜짐 조건 / 개발 모드 ─────────────────────────────────────────────────────
t('개발 모드(비패키지)·업데이트 설정(app-update.yml) 없음에서는 꺼진다', () => {
  assert.strictEqual(U.isUpdaterEnabled({ isPackaged: false, hasUpdateConfig: true }), false);    // 개발 모드
  assert.strictEqual(U.isUpdaterEnabled({ isPackaged: true, hasUpdateConfig: false }), false);    // npm run fresh(dist-mode): 패키지처럼 보여도 설정 파일이 없다
  assert.strictEqual(U.isUpdaterEnabled({ isPackaged: true, hasUpdateConfig: true }), true);
});
t('꺼진 상태: 확인해도 업데이터를 부르지 않고 타이머도 걸지 않는다(상태 disabled)', async () => {
  const m = make({ enabled: false });
  m.up.start(); assert.strictEqual(m.timers.count, 0);
  const s = await m.up.check({ manual: true }); assert.strictEqual(s.status, 'disabled');
  assert.strictEqual(m.au.calls.check, 0); assert.strictEqual(m.up.getState().status, 'disabled'); assert.deepStrictEqual(m.prompts, []);
  const m2 = make({ autoUpdater: null, enabled: true }); m2.up.start(); assert.strictEqual(m2.timers.count, 0);   // 불러오지 못한 경우도 안전
});

// ── 설정과 일정 ───────────────────────────────────────────────────────────────
t('업데이터 설정: 자동 다운로드 끔, 종료 시 자동 설치 켬, 시험판·다운그레이드 안 받음', () => {
  const m = make(); m.up.init();
  assert.strictEqual(m.au.autoDownload, false); assert.strictEqual(m.au.autoInstallOnAppQuit, true);
  assert.strictEqual(m.au.allowPrerelease, false); assert.strictEqual(m.au.allowDowngrade, false);
});
t('확인 일정: 시작 10초 뒤 한 번, 이후 6시간마다, stop()하면 멈춘다', () => {
  const m = make(); m.up.start();
  m.timers.advance(U.FIRST_CHECK_MS - 1); assert.strictEqual(m.au.calls.check, 0);
  m.timers.advance(1); assert.strictEqual(m.au.calls.check, 1);
  m.timers.advance(U.CHECK_INTERVAL_MS - 1); assert.strictEqual(m.au.calls.check, 1);
  m.timers.advance(1); assert.strictEqual(m.au.calls.check, 2);
  m.timers.advance(U.CHECK_INTERVAL_MS); assert.strictEqual(m.au.calls.check, 3);
  m.up.stop(); assert.strictEqual(m.timers.count, 0); m.timers.advance(U.CHECK_INTERVAL_MS * 3); assert.strictEqual(m.au.calls.check, 3);
  assert.strictEqual(U.FIRST_CHECK_MS, 10000); assert.strictEqual(U.CHECK_INTERVAL_MS, 21600000);
});

// ── 상태 전환 ─────────────────────────────────────────────────────────────────
t('최신 버전이면 none(자동·수동 모두), 대화상자는 뜨지 않는다', async () => {
  const m = make(); await m.up.check({ manual: false }); assert.strictEqual(m.up.getState().status, 'none');
  await m.up.check({ manual: true }); assert.strictEqual(m.up.getState().status, 'none'); assert.deepStrictEqual(m.prompts, []);
  assert.deepStrictEqual(statuses(m.states), ['checking', 'none', 'checking', 'none']);
});
t('새 버전 → "지금 업데이트" → 진행률 → 완료 → "재시작": requestQuit 경유로 설치하고 종료', async () => {
  const m = make({ answers: { available: 'yes', downloaded: 'yes' } }); m.au.next = 'available';
  await m.up.check({ manual: false }); await tick();
  assert.deepStrictEqual(m.prompts.map(p => p.kind), ['available']); assert.strictEqual(m.prompts[0].version, '1.4.0');
  assert.strictEqual(m.au.calls.download, 1); assert.strictEqual(m.up.getState().status, 'downloading');
  m.au.emit('download-progress', { percent: 10.4 }); assert.strictEqual(m.up.getState().percent, 10);
  m.au.emit('download-progress', { percent: 10.49 }); const before = m.states.length; m.au.emit('download-progress', { percent: 10.2 }); assert.strictEqual(m.states.length, before, '같은 %는 다시 알리지 않는다');
  m.au.emit('download-progress', { percent: 100 }); assert.strictEqual(m.up.getState().percent, 100);
  m.au.emit('update-downloaded', { version: '1.4.0' }); await tick();
  assert.deepStrictEqual(m.prompts.map(p => p.kind), ['available', 'downloaded']); assert.strictEqual(m.up.getState().status, 'downloaded');
  assert.strictEqual(m.installQuit, 1, '재시작 요청은 requestQuit 경로로 한 번');
  assert.deepStrictEqual(m.au.calls.quitAndInstall, [], 'requestQuit이 끝나기 전에는 quitAndInstall을 부르지 않는다');
  assert.strictEqual(m.up.runInstall(), true); assert.deepStrictEqual(m.au.calls.quitAndInstall, [[true, true]]);   // finishQuit 자리에서 조용히 설치 + 끝나면 다시 실행
});
t('"나중에"(새 버전): 그 확인에서는 다시 묻지 않고 상태는 available, 다음 확인 주기에 다시 알린다', async () => {
  const m = make({ answers: { available: 'later' } }); m.au.next = 'available'; m.up.start();
  m.timers.advance(U.FIRST_CHECK_MS); await tick();
  assert.strictEqual(m.prompts.length, 1); assert.strictEqual(m.up.getState().status, 'available'); assert.strictEqual(m.au.calls.download, 0);
  await tick(); await tick(); assert.strictEqual(m.prompts.length, 1, '같은 확인 안에서는 다시 묻지 않는다');
  m.timers.advance(U.CHECK_INTERVAL_MS); await tick(); assert.strictEqual(m.prompts.length, 2, '다음 확인 주기에 다시 알린다');
  await m.up.check({ manual: true }); await tick(); assert.strictEqual(m.prompts.length, 3, '수동 확인에서도 다시 알린다');
  assert.strictEqual((await m.up.download()).status, 'downloading', '설정창 버튼으로는 바로 받을 수 있다'); assert.strictEqual(m.au.calls.download, 1);
});
t('"나중에"(다운로드 완료): 설치하지 않고 종료할 때 설치되도록 둔다', async () => {
  const m = make({ answers: { available: 'yes', downloaded: 'later' } }); m.au.next = 'available';
  await m.up.check({ manual: false }); await tick(); m.au.emit('update-downloaded', { version: '1.4.0' }); await tick();
  assert.strictEqual(m.up.getState().status, 'downloaded'); assert.strictEqual(m.installQuit, 0); assert.strictEqual(m.up.runInstall(), false);
  assert.strictEqual(m.au.autoInstallOnAppQuit, true); assert.deepStrictEqual(m.au.calls.quitAndInstall, []);
  await m.up.check({ manual: true }); await tick(); assert.strictEqual(m.prompts.filter(p => p.kind === 'downloaded').length, 2, '수동 확인 때 재시작을 다시 묻는다');
});
t('이미 확인 중·받는 중이면 중복 확인하지 않는다', async () => {
  const m = make({ answers: { available: 'yes' } }); m.au.next = 'available';
  let openCheck, openDownload; const checkGate = new Promise(r => { openCheck = r; }), downloadGate = new Promise(r => { openDownload = r; });
  const realCheck = m.au.checkForUpdates; m.au.checkForUpdates = async () => { await checkGate; return realCheck(); };   // 확인이 끝나기 전까지 checking 상태
  m.au.downloadUpdate = async () => { m.au.calls.download++; await downloadGate; };                                    // 받기가 끝나기 전까지 downloading 상태
  const p1 = m.up.check({ manual: false }); assert.strictEqual(m.up.getState().status, 'checking');
  await m.up.check({ manual: true }); assert.strictEqual(m.au.calls.check, 0, '확인 중에는 또 확인하지 않는다(진행 중인 확인을 그대로 둔다)');
  openCheck(); await p1; await tick(); assert.strictEqual(m.au.calls.check, 1); assert.strictEqual(m.up.getState().status, 'downloading');
  await m.up.check({ manual: true }); assert.strictEqual(m.au.calls.check, 1, '받는 중에는 확인하지 않는다');
  await m.up.download(); assert.strictEqual(m.au.calls.download, 1, '받는 중에는 또 받지 않는다');
  openDownload(); await tick();
});
t('늦게 도착한 대화상자 답은 그 사이 상태가 바뀌었으면 무시한다', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const m = make({ answers: { available: () => gate } }); m.au.next = 'available';
  await m.up.check({ manual: false }); assert.strictEqual(m.up.getState().status, 'available');
  await m.up.download(); assert.strictEqual(m.au.calls.download, 1);          // 설정창 버튼으로 먼저 받기 시작
  release('yes'); await tick(); assert.strictEqual(m.au.calls.download, 1, '대화상자의 늦은 "지금 업데이트"가 또 받지 않는다');
});

// ── 오류 ──────────────────────────────────────────────────────────────────────
t('오류: 자동 확인은 조용히(대화상자 없음, 상태 idle), 수동 확인만 "확인하지 못했어요"', async () => {
  for (const mode of ['error', 'reject', 'both']) {
    const a = make(); a.au.next = mode; await a.up.check({ manual: false }); await tick();
    assert.deepStrictEqual(a.prompts, [], `자동/${mode}`); assert.strictEqual(a.up.getState().status, 'idle');
    const b = make(); b.au.next = mode; await b.up.check({ manual: true }); await tick();
    assert.deepStrictEqual(b.prompts.map(p => p.kind), ['checkFailed'], `수동/${mode}: 한 번만`); assert.strictEqual(b.up.getState().status, 'error');
    assert.strictEqual(b.up.getState().message, '업데이트를 확인하지 못했어요');
  }
  const m = make(); m.au.next = 'reject'; await m.up.check({ manual: false }); m.au.next = 'none'; await m.up.check({ manual: false });
  assert.strictEqual(m.up.getState().status, 'none', '다음 확인에서 정상으로 돌아온다');
});
t('다운로드 실패: 대화상자 없이 available로 되돌려 다시 받을 수 있다', async () => {
  const m = make({ answers: { available: 'yes' } }); m.au.next = 'available'; m.au.failDownload = true;
  await m.up.check({ manual: false }); await tick(); await tick();
  const s = m.up.getState(); assert.strictEqual(s.status, 'available'); assert.strictEqual(s.error, '업데이트를 받지 못했어요'); assert.deepStrictEqual(m.prompts.map(p => p.kind), ['available']);
  m.au.failDownload = false; await m.up.download(); assert.strictEqual(m.up.getState().status, 'downloading');
});

// ── 알람·전체화면 알림 중에는 재시작 미루기 ─────────────────────────────────
t('알람·전체화면 알림이 떠 있으면 재시작을 미루고, 끝나면 이어서 requestQuit 한다', async () => {
  const m = make({ answers: { available: 'yes', downloaded: 'yes' } }); m.au.next = 'available'; m.setBusy(true);
  await m.up.check({ manual: false }); await tick(); m.au.emit('update-downloaded', { version: '1.4.0' }); await tick();
  assert.strictEqual(m.installQuit, 0, '알림 중에는 재시작하지 않는다'); assert.strictEqual(m.up.getState().pendingInstall, true);
  m.timers.advance(U.BUSY_RETRY_MS * 3); assert.strictEqual(m.installQuit, 0, '계속 알림 중이면 계속 미룬다');
  m.setBusy(false); m.timers.advance(U.BUSY_RETRY_MS); assert.strictEqual(m.installQuit, 1, '알림이 끝나면 재시작한다');
  assert.strictEqual(m.up.getState().pendingInstall, undefined);
});
t('수동으로 재시작을 눌러도 알림 중이면 deferred', async () => {
  const m = make({ answers: { available: 'yes', downloaded: 'later' } }); m.au.next = 'available';
  await m.up.check({ manual: false }); await tick(); m.au.emit('update-downloaded', { version: '1.4.0' }); await tick(); m.setBusy(true);
  assert.strictEqual(m.up.install(), 'deferred'); assert.strictEqual(m.installQuit, 0); m.setBusy(false); m.timers.advance(U.BUSY_RETRY_MS); assert.strictEqual(m.installQuit, 1);
});
t('설치 요청이 없으면 runInstall은 false(그냥 app.quit)', () => { const m = make(); assert.strictEqual(m.up.runInstall(), false); assert.deepStrictEqual(m.au.calls.quitAndInstall, []); });

// ── 맥 설치 위치 ──────────────────────────────────────────────────────────────
t('맥: 응용 프로그램 폴더 밖(dmg 안·translocation·다운로드 폴더)은 업데이트 불가, 안은 가능, Windows는 항상 가능', () => {
  const L = (p, platform = 'darwin') => U.installLocationStatus({ platform, exePath: p, home: '/Users/lala' });
  assert.deepStrictEqual(L('/Applications/choeae-app.app/Contents/MacOS/choeae-app'), { ok: true, reason: null });
  assert.deepStrictEqual(L('/Users/lala/Applications/choeae-app.app/Contents/MacOS/choeae-app'), { ok: true, reason: null });
  assert.deepStrictEqual(L('/Volumes/choeae-app 1.3.0/choeae-app.app/Contents/MacOS/choeae-app'), { ok: false, reason: 'dmg' });
  assert.deepStrictEqual(L('/private/var/folders/ab/xyz/T/AppTranslocation/1A2B/d/choeae-app.app/Contents/MacOS/choeae-app'), { ok: false, reason: 'translocated' });
  assert.deepStrictEqual(L('/Users/lala/Downloads/choeae-app.app/Contents/MacOS/choeae-app'), { ok: false, reason: 'location' });
  assert.deepStrictEqual(L('/Users/lala/Desktop/choeae-app.app/Contents/MacOS/choeae-app'), { ok: false, reason: 'location' });
  assert.deepStrictEqual(L('/Applications2/x.app/Contents/MacOS/x'), { ok: false, reason: 'location' }, '접두사만 비슷한 폴더는 안 된다');
  assert.strictEqual(L('C:\\Users\\a\\AppData\\Local\\Programs\\choeae-app\\choeae-app.exe', 'win32').ok, true);
});
t('위치가 안 맞으면: 받지도 설치하지도 않고 "응용 프로그램 폴더로 옮겨서 실행해 주세요" 안내만(자동은 세션에 한 번, 수동은 매번)', async () => {
  const m = make({ location: { ok: false, reason: 'dmg' }, answers: { available: 'yes' } }); m.au.next = 'available';
  await m.up.check({ manual: false }); await tick();
  assert.deepStrictEqual(m.prompts.map(p => p.kind), ['location']); assert.strictEqual(m.up.getState().status, 'blocked'); assert.strictEqual(m.up.getState().reason, 'dmg');
  assert.strictEqual(m.au.calls.download, 0); await m.up.download(); assert.strictEqual(m.au.calls.download, 0, '받기를 시도하지 않는다'); assert.strictEqual(m.installQuit, 0);
  await m.up.check({ manual: false }); await tick(); assert.strictEqual(m.prompts.length, 1, '자동 확인은 세션에 한 번만 안내');
  await m.up.check({ manual: true }); await tick(); assert.strictEqual(m.prompts.length, 2, '수동 확인은 매번 안내');
  assert.ok(U.MESSAGES.moveToApplications === '응용 프로그램 폴더로 옮겨서 실행해 주세요');
});

// ── 연결(정적 확인): main·preload·UI·설정 ────────────────────────────────────
t('main.cjs 연결: 재시작은 requestQuit→finishQuit에서 설치, 타이머 정리, 시작 시 initUpdater, IPC, 테스트용 피드 환경 변수 없음', () => {
  const main = read('main.cjs'), up = read('updater.cjs');
  assert.match(main, /requestInstallQuit: \(\) => requestQuit\(\)/);                                                    // 다이얼로그에서 quitAndInstall을 바로 부르지 않는다
  assert.match(main, /if \(!\(updater && updater\.runInstall\(\)\)\) app\.quit\(\);/);                                    // 정리가 끝난 finishQuit의 마지막 자리
  assert.ok(main.indexOf('trayBeatTimers.forEach(clearTimeout)') < main.indexOf('updater.runInstall()'), '창·트레이 정리 뒤에 설치');
  assert.match(main, /function stopAllTimers\(\) \{[^}]*if \(updater\) updater\.stop\(\);/);
  assert.match(main, /createTray\(\);\s*initUpdater\(\);/);
  assert.match(main, /isBusy: \(\) => alertCount > 0/);
  for (const ch of ['update-get-state', 'update-check', 'update-download', 'update-install']) assert.ok(main.includes(`'${ch}'`), ch);
  assert.match(main, /app-update\.yml/);                                                                                  // 설정 파일이 없으면(개발·fresh) 꺼짐
  assert.ok(!/setFeedURL|FEED_URL|UPDATE_TEST|process\.env\.[A-Z_]*UPDATE/.test(main + up), '테스트용 피드 주소 환경 변수를 두지 않는다(시험 빌드는 빌드 설정의 publish로 바꾼다)');
  assert.ok(!/\.quitAndInstall\(/.test(main), 'main은 quitAndInstall을 직접 부르지 않는다(updater.runInstall만, 주석의 언급은 제외)');
  // 부모 창 없는 dialog.showMessageBox는 맥에서 알람 타이머까지 멈춘다 → 항상 부모 창을 넘기고, 보이는 창이 없으면 건너뛴다
  const calls = main.match(/dialog\.showMessageBox\([^)]*\)/g) || [];
  assert.ok(calls.length >= 1 && calls.every(c => /showMessageBox\(parent,/.test(c)), '모든 showMessageBox는 부모 창(parent)을 받는다: ' + calls.join(' | '));
  assert.match(main, /function promptParent\(\) \{\s*for \(const w of \[settingsWindow, petWindow\]\) if \(w && !w\.isDestroyed\(\) && w\.isVisible\(\)\) return w;\s*return null;/);
  assert.match(main, /if \(!parent\) return 'later';/);
});
t('preload·타입·설정창 UI 연결', () => {
  const pre = read('preload.cjs'), d = read('src/electron.d.ts'), page = read('src/pages/SettingsPage.tsx'), ui = read('src/components/settings/UpdateStatus.tsx'), css = read('src/styles/settings.css');
  for (const f of ['getUpdateState', 'checkForUpdates', 'downloadUpdate', 'installUpdate', 'onUpdateState']) { assert.ok(pre.includes(f), `preload ${f}`); assert.ok(d.includes(f), `d.ts ${f}`); }
  assert.match(page, /<small>v\{__APP_VERSION__\}<\/small><UpdateStatus \/>/);                                            // 버전 표시 바로 옆
  for (const s of ['최신 버전이에요', '새 버전 v', '다운로드 중', '재시작하면 설치돼요', '업데이트 확인', '응용 프로그램 폴더로 옮겨서 실행해 주세요']) assert.ok(ui.includes(s), s);
  assert.match(ui, /s\.status === 'disabled'\) return null/);                                                              // 개발 모드에서는 그리지 않는다
  assert.match(css, /\.st-update-btn \{[^}]*var\(--ui-track\)[^}]*var\(--ui-ink\)/);                                      // 토큰 색(라이트·다크 모두)
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css.split('.st-update {')[1].split('@media (prefers-reduced-motion')[0]), '업데이트 스타일은 하드코딩 색 없이 토큰만');
});
t('빌드 설정(package.json): NSIS 사용자별 oneClick, 포터블 제거, mac dmg+zip, GitHub publish, 자동 게시 안 함, --dir 없음, appId·productName 유지', () => {
  const pkg = JSON.parse(read('package.json')), b = pkg.build;
  assert.strictEqual(b.appId, 'com.choeae.app'); assert.strictEqual(b.productName, 'choeae-app');            // userData 경로가 바뀌지 않는다
  assert.deepStrictEqual(b.win.target, ['nsis']); assert.ok(!('portable' in b), '포터블 설정 제거');
  assert.strictEqual(b.nsis.oneClick, true); assert.strictEqual(b.nsis.perMachine, false);
  assert.strictEqual(b.nsis.createDesktopShortcut, true); assert.strictEqual(b.nsis.createStartMenuShortcut, true); assert.strictEqual(b.nsis.deleteAppDataOnUninstall, false);
  assert.strictEqual(b.nsis.artifactName, 'choeae-app-Setup-${version}.${ext}'); assert.ok(!/\s/.test(b.nsis.artifactName), '에셋 이름에 공백 없음');
  assert.deepStrictEqual(b.mac.target.map(x => x.target).sort(), ['dmg', 'zip']);
  assert.ok(!/\s/.test(b.dmg.artifactName) && !/\s/.test(b.mac.artifactName));
  assert.deepStrictEqual(b.publish, [{ provider: 'github', owner: 'lala525404', repo: 'nyang-pet-app' }]);
  for (const k of ['dist:win', 'dist:mac']) { assert.ok(pkg.scripts[k].includes('--publish never'), `${k}: 자동 게시 안 함`); assert.ok(!pkg.scripts[k].includes('--dir'), `${k}: --dir 없음`); }
  assert.ok(b.files.includes('updater.cjs')); assert.ok(pkg.dependencies['electron-updater']); assert.strictEqual(b.afterSign, 'scripts/notarize.cjs'); assert.ok(fs.existsSync(path.join(root, b.afterSign)));
  assert.match(pkg.version, /^\d+\.\d+\.\d+/);
});
t('공증 훅(scripts/notarize.cjs): 키체인 프로필만 쓰고 비밀번호는 다루지 않는다, mac만, 건너뛰기 환경 변수', () => {
  const s = read('scripts/notarize.cjs');
  assert.match(s, /keychainProfile: PROFILE\(\)/); assert.match(s, /'choeae-notary'/); assert.match(s, /electronPlatformName !== 'darwin'/); assert.match(s, /CHOEAE_SKIP_NOTARIZE/);
  assert.ok(!/appleIdPassword|appleId\b|teamId|--password|--apple-id/i.test(s.replace(/\/\/.*$/gm, '')), '인증 정보를 코드에 두지 않는다');
});

// ── 업데이트 메타파일 보정 ───────────────────────────────────────────────────
const YML = (sha, size) => `version: 1.4.0\nfiles:\n  - url: choeae-app-1.4.0-arm64-mac.zip\n    sha512: ${sha}\n    size: ${size}\n  - url: choeae-app-1.4.0-arm64.dmg\n    sha512: ${sha}\n    size: ${size}\npath: choeae-app-1.4.0-arm64-mac.zip\nsha512: ${sha}\nreleaseDate: '2026-10-23T00:00:00.000Z'\n`;
t('fix-update-meta: 실제 파일의 sha512·size로 고치고(들여쓰기 그대로), 이미 맞으면 그대로, 파일이 없으면 알린다', () => {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'choeae-meta-test-'));
  try {
    fs.writeFileSync(path.join(dir2, 'choeae-app-1.4.0-arm64-mac.zip'), 'zip-contents'); fs.writeFileSync(path.join(dir2, 'choeae-app-1.4.0-arm64.dmg'), 'dmg-contents-after-staple');
    const info = (u) => (fs.existsSync(path.join(dir2, u)) ? META.fileInfo(path.join(dir2, u)) : null);
    const r = META.fixMetaText(YML('AAAA', 1), info);
    assert.strictEqual(r.changes.length, 5, 'zip sha·size, dmg sha·size, 최상위 sha'); assert.deepStrictEqual(r.missing, []);
    assert.ok(r.text.includes(`    sha512: ${META.fileInfo(path.join(dir2, 'choeae-app-1.4.0-arm64.dmg')).sha512}`));
    assert.ok(r.text.includes(`    size: ${'dmg-contents-after-staple'.length}`) && r.text.includes(`    size: ${'zip-contents'.length}`));
    assert.ok(r.text.includes("releaseDate: '2026-10-23T00:00:00.000Z'") && r.text.startsWith('version: 1.4.0\nfiles:\n  - url: '), '다른 줄·들여쓰기는 그대로');
    assert.ok(r.text.split('\n').some(l => /^sha512: /.test(l) && l.includes(META.fileInfo(path.join(dir2, 'choeae-app-1.4.0-arm64-mac.zip')).sha512)), '최상위 sha512는 path 파일(zip)의 해시');
    assert.strictEqual(META.fixMetaText(r.text, info).changes.length, 0, '두 번째는 바꿀 게 없다(멱등)');
    fs.writeFileSync(path.join(dir2, 'latest-mac.yml'), YML('AAAA', 1));
    assert.ok(META.run({ dir: dir2, check: true }) > 0, '--check는 안 맞으면 실패');
    assert.strictEqual(fs.readFileSync(path.join(dir2, 'latest-mac.yml'), 'utf8'), YML('AAAA', 1), '--check는 파일을 바꾸지 않는다');
    assert.strictEqual(META.run({ dir: dir2, check: false }), 0); assert.strictEqual(META.run({ dir: dir2, check: true }), 0, '고친 뒤에는 검사 통과');
    fs.rmSync(path.join(dir2, 'choeae-app-1.4.0-arm64.dmg')); assert.ok(META.run({ dir: dir2, check: true }) > 0, '파일이 없으면 실패');
    assert.ok(META.fixMetaText(YML('A', 1), () => null).missing.includes('choeae-app-1.4.0-arm64.dmg'));
  } finally { fs.rmSync(dir2, { recursive: true, force: true }); }
});
t('릴리스 문서: 에셋 이름·draft/prerelease 규칙·올릴 파일이 docs/release-checklist.md에 있다', () => {
  const doc = read('docs/release-checklist.md');
  for (const s of ['latest.yml', 'latest-mac.yml', '.blockmap', '-mac.zip', 'Setup', 'draft', 'prerelease', '공백']) assert.ok(doc.includes(s), s);
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n++; console.log(`  ok  ${name}`); } catch (e) { console.error(`  FAIL  ${name}\n${e && e.stack}`); process.exit(1); } }
  console.log(`\n${n}개 통과`);
})();
