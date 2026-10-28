// IPC 안전장치 단위 테스트: 보낸 프레임이 앱 페이지인지, 야르 간격 범위, 설정·카드 종류 검사, 메인 연결(정적 확인). `node tests/ipc-guard-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const G = require('../ipc-guard.cjs');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const FFFD = String.fromCharCode(0xFFFD);
const queue = []; const t = (name, fn) => queue.push([name, fn]);

const WIN_INDEX = 'C:\\Users\\test\\AppData\\Local\\Programs\\choeae-app\\resources\\app.asar\\dist\\index.html';
const WIN_URL = 'file:///C:/Users/test/AppData/Local/Programs/choeae-app/resources/app.asar/dist/index.html';
const MAC_INDEX = '/Applications/choeae-app.app/Contents/Resources/app.asar/dist/index.html';
const DEV = { isPackaged: false, devOrigin: 'http://localhost:5173' };

t('배포(Windows): 앱의 index.html만 믿고, 해시·쿼리가 붙은 페이지도 믿는다', () => {
  const o = { isPackaged: true, indexPath: WIN_INDEX, platform: 'win32' };
  assert.strictEqual(G.isTrustedUrl(WIN_URL, o), true);
  assert.strictEqual(G.isTrustedUrl(WIN_URL + '#/pet', o), true);
  assert.strictEqual(G.isTrustedUrl(WIN_URL + '#/breaktime?type=alarm&n=a%20b', o), true);
  assert.strictEqual(G.isTrustedUrl(WIN_URL.replace('/Users/test', '/users/TEST'), o), true, '윈도우는 대소문자를 가리지 않는다');
  assert.strictEqual(G.isTrustedUrl(WIN_URL.replace('dist/index.html', 'dist/other.html'), o), false);
  assert.strictEqual(G.isTrustedUrl('file:///C:/Users/test/Desktop/evil.html', o), false);
});
t('배포(맥): 앱의 index.html만 (경로 해석이 호스트 OS를 따르므로 맥·리눅스에서만 확인)', () => {
  if (process.platform === 'win32') return;
  const o = { isPackaged: true, indexPath: MAC_INDEX, platform: 'darwin' };
  assert.strictEqual(G.isTrustedUrl('file://' + MAC_INDEX + '#/quick', o), true);
  assert.strictEqual(G.isTrustedUrl('file:///Users/test/Downloads/x.html', o), false);
});
t('배포: 웹 주소·개발 서버·빈 값·깨진 값은 거부', () => {
  const o = { isPackaged: true, indexPath: WIN_INDEX, platform: 'win32' };
  for (const u of ['https://example.com/', 'http://localhost:5173/', 'about:blank', 'data:text/html,hi', 'javascript:1', '', undefined, null, 5, {}, 'not a url']) assert.strictEqual(G.isTrustedUrl(u, o), false, String(u));
  assert.strictEqual(G.isTrustedUrl(WIN_URL, { isPackaged: true, platform: 'win32' }), false, 'indexPath를 모르면 거부');
  assert.strictEqual(G.isTrustedUrl(undefined, undefined), false);
});
t('개발: 개발 서버(localhost:5173)만 믿는다. 다른 포트·호스트·file은 거부', () => {
  assert.strictEqual(G.isTrustedUrl('http://localhost:5173/#/settings', DEV), true);
  assert.strictEqual(G.isTrustedUrl('http://localhost:5173/', DEV), true);
  for (const u of ['http://localhost:5174/', 'http://localhost/', 'http://127.0.0.1:5173/', 'http://localhost.evil.com:5173/', 'http://evil.com/', WIN_URL]) assert.strictEqual(G.isTrustedUrl(u, DEV), false, u);
  assert.strictEqual(G.isTrustedUrl('http://localhost:5173/', { isPackaged: false }), false, 'devOrigin을 모르면 거부');
});
t('야르 간격: 숫자가 아니면 무시(null), 0 이하는 꺼짐(0), 켜면 1분 이상 24시간 이하', () => {
  for (const v of ['5', null, undefined, NaN, Infinity, -Infinity, {}, [], true]) assert.strictEqual(G.clampYarMinutes(v), null, String(v));
  assert.strictEqual(G.clampYarMinutes(0), 0);
  assert.strictEqual(G.clampYarMinutes(-5), 0);
  assert.strictEqual(G.clampYarMinutes(0.001), 1);
  assert.strictEqual(G.clampYarMinutes(0.5), 1);
  assert.strictEqual(G.clampYarMinutes(1), 1);
  assert.strictEqual(G.clampYarMinutes(30), 30);
  assert.strictEqual(G.clampYarMinutes(1440), 1440);
  assert.strictEqual(G.clampYarMinutes(1441), 1440);
  assert.strictEqual(G.clampYarMinutes(1e12), 1440);
});
t('설정 동기화 객체: 배열·null·원시값은 거부', () => {
  assert.strictEqual(G.isPlainObject({}), true);
  assert.strictEqual(G.isPlainObject({ a: 1 }), true);
  for (const v of [null, undefined, [], [1], 'a', 3, true]) assert.strictEqual(G.isPlainObject(v), false, String(v));
});
t('카드 종류: lunch·leave·alarm만', () => {
  for (const v of ['lunch', 'leave', 'alarm']) assert.strictEqual(G.isBreakType(v), true, v);
  for (const v of ['', 'Lunch', 'alarm ', 'x', null, undefined, 1, {}, ['alarm']]) assert.strictEqual(G.isBreakType(v), false, String(v));
});
t('메인 연결(정적): 공통 래퍼와 대상 핸들러, 창 이동 잠금, 메뉴 제거', () => {
  const main = read('main.cjs');
  assert.ok(/require\('\.\/ipc-guard\.cjs'\)/.test(main));
  assert.ok(/function isTrustedSender\(e\)/.test(main) && /senderFrame/.test(main));
  for (const ch of ['quit-app', 'login-item-set', 'update-check', 'update-download', 'update-install', 'sync-settings', 'test-break-time', 'set-yar-timer', 'yar-now', 'start-drag', 'weather-get']) {
    assert.ok(new RegExp(`trusted(?:On|Handle)\\('${ch}'`).test(main), `${ch}에 래퍼가 적용돼야 한다`);
  }
  // 래퍼를 거치지 않는 ipcMain 등록은 sender 창을 직접 확인하는 퀵·안내 카드·pet-regions와 래퍼 정의 자신뿐이어야 한다
  const raw = (main.match(/ipcMain\.(?:on|handle|once)\('([^']+)'/g) || []).map(s => /'([^']+)'/.exec(s)[1]);
  assert.deepStrictEqual(raw.filter(c => !/^(quick-|notice-)/.test(c)).sort(), ['end-drag', 'pet-regions', 'settings-flushed'].sort(), '검증 없는 핸들러: ' + raw.join(','));
  assert.ok(/onFlushed = \(e\) => \{ if \(isTrustedSender\(e\)\)/.test(main) && /onEndDrag = \(e\) => \{ if \(!isTrustedSender\(e\)\) return;/.test(main), 'settings-flushed·end-drag도 sender를 확인한다');
  const pre = read('preload.cjs');
  assert.ok(!/removeAllListeners/.test(pre), 'onShowToast가 다른 구독을 지우지 않는다');
  assert.ok(/onShowToast:[\s\S]*?return \(\) => ipcRenderer\.removeListener\('show-toast', handler\)/.test(pre), '해제 함수를 돌려준다');
  assert.ok(/setApplicationMenu/.test(main) && /app\.isPackaged/.test(main));
  assert.ok(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/.test(main));
});
t('파일에 깨진 글자(U+FFFD)·???가 없다', () => {
  const src = read('ipc-guard.cjs'); assert.ok(!src.includes(FFFD) && !/\?{3}/.test(src));
  assert.ok(!read('tests/ipc-guard-unit.cjs').includes(FFFD));
});

(async () => {
  let n = 0;
  for (const [name, fn] of queue) { await fn(); n++; console.log('  ok  ' + name); }
  console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
