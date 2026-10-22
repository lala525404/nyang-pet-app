'use strict';
// "컴퓨터를 켜면 자동 실행"(로그인 항목). Electron의 app을 주입받아서 단위 테스트한다(tests/login-item-unit.cjs). main.cjs가 실제 값을 넣는다.
//  - 앱 안에는 켬/끔 값을 따로 저장하지 않는다. 항상 OS의 실제 상태(app.getLoginItemSettings)를 읽어서 보여 주고, 바꾼 뒤에도 다시 읽어서 돌려준다(OS와 어긋나지 않게).
//  - 기본값은 "꺼짐"이다. 사용자가 토글을 켤 때만 등록한다(동의 없이 켜지지 않는다).
//  - 개발 모드·fresh(npm run fresh, scripts/dist-mode.cjs)에서는 동작하지 않는다(개발 중 이 컴퓨터의 로그인 항목이 바뀌지 않게).
//  - Windows 포터블(PORTABLE_EXECUTABLE_FILE)은 실행 경로가 매번 달라서 쓸 수 없다. 맥은 응용 프로그램 폴더 밖에서 실행 중이면 쓸 수 없다.
//  - 로그인 때 자동으로 켜진 경우(LOGIN_ARG 또는 맥의 wasOpenedAtLogin)에는 설정창·인트로를 띄우지 않고 버디와 알람만 조용히 시작한다(main.cjs).
const { installLocationStatus } = require('./updater.cjs');

const LOGIN_ARG = '--opened-at-login';   // Windows 로그인 항목에 붙이는 실행 인자(자동 실행으로 켜졌는지 구분)
const NOTE = {
  supported: '알람을 놓치지 않게 로그인할 때 펫이 같이 켜져요',
  dev: '개발 모드에서는 쓸 수 없어요',
  install: '설치 버전에서 사용할 수 있어요',
};

// 쓸 수 있는 환경인지. reason: dev | portable | location | platform
function loginItemSupport({ isPackaged, defaultApp, platform, env = {}, exePath, home }) {
  if (platform !== 'win32' && platform !== 'darwin') return { ok: false, reason: 'platform' };
  if (!isPackaged || defaultApp) return { ok: false, reason: 'dev' };                       // 개발 모드, `electron .`으로 띄운 fresh 모드
  if (platform === 'win32' && env.PORTABLE_EXECUTABLE_FILE) return { ok: false, reason: 'portable' };
  if (platform === 'darwin' && !installLocationStatus({ platform, exePath, home }).ok) return { ok: false, reason: 'location' };   // /Applications 밖
  return { ok: true, reason: null };
}
const noteFor = (support) => (support.ok ? NOTE.supported : support.reason === 'dev' || support.reason === 'platform' ? NOTE.dev : NOTE.install);

// Windows는 등록한 경로·인자와 같아야 상태를 읽을 수 있다. 맥은 앱 자체가 등록 단위라 옵션이 없다.
const itemOptions = ({ platform, exePath }) => (platform === 'win32' ? { path: exePath, args: [LOGIN_ARG] } : {});

// → { supported, enabled, reason, note }  (지원하지 않으면 enabled는 항상 false)
function readLoginItem(deps) {
  const support = loginItemSupport(deps);
  let enabled = false;
  if (support.ok) { try { enabled = !!deps.app.getLoginItemSettings(itemOptions(deps)).openAtLogin; } catch { enabled = false; } }
  return { supported: support.ok, enabled, reason: support.reason, note: noteFor(support) };
}

// 바꾼 뒤 OS에서 다시 읽은 실제 상태를 돌려준다. 지원하지 않는 환경에서는 OS를 건드리지 않는다.
function writeLoginItem(deps, want) {
  const support = loginItemSupport(deps);
  if (support.ok) { try { deps.app.setLoginItemSettings({ openAtLogin: want === true, ...itemOptions(deps) }); } catch { /* 등록 실패는 아래에서 읽은 실제 상태로 드러난다 */ } }
  return readLoginItem(deps);
}

// 로그인 때 자동으로 켜졌는지: Windows는 실행 인자, 맥은 OS가 알려 주는 wasOpenedAtLogin(인자도 함께 인정)
function wasLaunchedAtLogin({ platform, argv = [], getSettings }) {
  if (argv.includes(LOGIN_ARG)) return true;
  if (platform !== 'darwin' || typeof getSettings !== 'function') return false;
  try { return !!getSettings().wasOpenedAtLogin; } catch { return false; }
}

module.exports = { LOGIN_ARG, NOTE, loginItemSupport, noteFor, readLoginItem, writeLoginItem, wasLaunchedAtLogin };
