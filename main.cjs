const { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage, nativeTheme, powerMonitor, systemPreferences, shell, dialog } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

function getPageURL(hash) {
  if (isDev) return `http://localhost:5173/#${hash}`;
  return `file://${path.join(__dirname, 'dist', 'index.html')}#${hash}`;
}

const CREDIT_URL = 'https://creativecommons.org/licenses/by/4.0/';

let settingsWindow = null;
let petWindow = null;
let yarWindow = null;
let quickWindow = null;   // 펫 우클릭 퀵 메뉴(아래 "퀵 메뉴" 구역)
let tray = null;
let updater = null;       // 자동 업데이트(initUpdater에서 만든다)
let focusState = { enabled: false, seconds: false, anchor: null };   // 초집중 모드 상태(시작할 때 파일에서 읽는다)
let petInteractive = false;   // 초집중 모드에서 마우스가 버디 위인지(버디 창이 알려 준다)
let yarDesired = 0;           // 설정이 원하는 야르 간격(분). 초집중 모드 중에는 멈추지만 값은 기억한다
let silentUntil = 0;       // 로그인 자동 실행으로 켜졌으면, 이 시각 전의 맥 'activate'(실행 직후에도 오는 이벤트)로는 설정창을 띄우지 않는다
const SILENT_ACTIVATE_MS = 5000;
// 버디 창은 말풍선이 들어갈 크기로 고정한다. 말풍선이 뜨고 질 때 창 크기를 바꾸면 버디가 화면에서 25·40px씩 튀었다.
const PET_WIN_W = 240;
const PET_WIN_H = 230;
let isQuitting = false;     // 종료 요청이 들어온 뒤로는 true (창 닫힘·재생성 로직이 종료를 거스르지 않게)
let quitReady = false;      // 저장과 정리가 끝나 실제로 app.quit을 해도 되는 상태
let quitTimer = null;
const SAVE_WAIT_MS = 1000;  // 설정창이 저장을 마칠 때까지 기다리는 최대 시간
const QUIT_TIMEOUT_MS = 2000; // 종료 요청 후 무슨 일이 있어도 프로세스를 끝내는 시간
let alwaysOnTopInterval = null;
let yarTimer = null;
let yarMinutes = 0;          // 현재 돌고 있는 야르 타이머 간격(분). 0이면 꺼짐
let alwaysOnTopFlag = true;  // 설정창에서 고른 '항상 위' 상태

function startAlwaysOnTopKeepAlive() {
  if (alwaysOnTopInterval) clearInterval(alwaysOnTopInterval);
  alwaysOnTopInterval = setInterval(() => {
    // 퀵 메뉴가 열려 있는 동안은 쉰다: 맥에서는 이 재설정이 펫 창에 키 포커스를 가져와 퀵 메뉴가 바로 닫혀 버린다(실측).
    // 퀵 창은 펫 창 뒤에 열려 위에 떠 있고, 메뉴는 금방 닫히므로 그동안 재설정을 못 해도 문제없다.
    if (quickWindow && !quickWindow.isDestroyed()) return;
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 500);
}

function stopAlwaysOnTopKeepAlive() {
  if (alwaysOnTopInterval) { clearInterval(alwaysOnTopInterval); alwaysOnTopInterval = null; }
}

// ★ 전체화면 알림(점심·퇴근·알람 카드, 야르)이 떠 있는 동안에는 버디 말풍선을 숨긴다. 끝나면 이어서 진행한다.
let alertCount = 0;
function notifyAlertState() {
  if (petWindow && !petWindow.isDestroyed()) {
    try { petWindow.webContents.send('alert-state', alertCount > 0); } catch {}
  }
}
function trackAlertWindow(win) {
  alertCount++;
  notifyAlertState();
  win.once('closed', () => { alertCount = Math.max(0, alertCount - 1); notifyAlertState(); });
}
ipcMain.handle('get-alert-state', () => alertCount > 0);

// ★ 야르타임 창 생성
function createYarWindow() {
  if (yarWindow && !yarWindow.isDestroyed()) return;

  const { width, height } = screen.getPrimaryDisplay().bounds;

  yarWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  trackAlertWindow(yarWindow);
  yarWindow.setAlwaysOnTop(true, 'screen-saver');
  // 클릭이 뒤로 통과되게 설정 (방해 없이)
  yarWindow.setIgnoreMouseEvents(true, { forward: true });
  yarWindow.loadURL(getPageURL('/yar'));

  // 2초 후 자동으로 닫기
  setTimeout(() => {
    if (yarWindow && !yarWindow.isDestroyed()) {
      yarWindow.close();
      yarWindow = null;
    }
  }, 2000);

  yarWindow.on('closed', () => { yarWindow = null; });
}

// ★ 야르타임 스케줄러
function startYarTimer(intervalMinutes) {
  if (yarTimer) clearInterval(yarTimer);
  yarTimer = null;
  yarMinutes = intervalMinutes || 0;
  if (!intervalMinutes) return;
  yarTimer = setInterval(() => {
    createYarWindow();
  }, intervalMinutes * 60 * 1000);
}

function stopYarTimer() {
  if (yarTimer) { clearInterval(yarTimer); yarTimer = null; }
  yarMinutes = 0;
}

// 간격이 바뀔 때만 타이머를 다시 시작한다 (같은 값으로 동기화돼도 야르 주기가 리셋되지 않게)
function setYarMinutes(minutes) {
  const next = minutes > 0 ? minutes : 0;
  if (next === yarMinutes) return;
  if (next) startYarTimer(next); else stopYarTimer();
}

function resumeAlwaysOnTopKeepAlive() {
  if (alwaysOnTopFlag) startAlwaysOnTopKeepAlive();
}

function setPetAlwaysOnTop(flag) {
  alwaysOnTopFlag = !!flag;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setAlwaysOnTop(alwaysOnTopFlag, 'screen-saver');
    if (alwaysOnTopFlag) startAlwaysOnTopKeepAlive(); else stopAlwaysOnTopKeepAlive();
  }
}

// 한 번만 보여 주는 안내를 봤는지는 userData의 flags.json에 남긴다
const flagsFile = () => path.join(app.getPath('userData'), 'flags.json');
function readFlags() {
  try { return JSON.parse(fs.readFileSync(flagsFile(), 'utf8')) || {}; } catch { return {}; }
}
function markFlag(name, value = true) {
  try { fs.writeFileSync(flagsFile(), JSON.stringify({ ...readFlags(), [name]: value })); } catch {}
}

// 설정창 시작 인트로: 이 버전에서 아직 보여 준 적이 없으면 첫 설정창에만 intro=1을 붙인다(새로 설치했거나 새 버전으로 올린 뒤 처음).
// 보여 줬다는 표시는 설정창이 인트로를 시작할 때 알려 온다. 설정의 "시작 인트로 보기"가 꺼져 있으면 설정창이 알아서 건너뛴다.
ipcMain.on('intro-seen', () => {
  // 완전 새 설치였다는 사실은 flags.json에 남긴다(온보딩을 나중에 마치거나 다시 봐도 새 유저인지 알 수 있게). 기존 사용자에게는 이 표시가 없다.
  if (freshInstall) markFlag('newInstall');
  freshInstall = false;
  markFlag('introSeenVersion', app.getVersion());
});
const needsIntro = () => readFlags().introSeenVersion !== app.getVersion();
// 완전 새 설치(설정 폴더에 flags.json이 아직 없음)인지는 앱이 뜰 때 한 번만 본다. 입구 화면은 새 설치면 "처음 왔어요"를, 새 버전으로 올린 기존 사용자면 "오늘도 함께해요"를 강조한다.
let freshInstall = false;
const entranceKind = () => (freshInstall ? 'new' : needsIntro() ? 'old' : '');

// 설정창을 처음 닫을 때의 안내: 트레이(하트 아이콘) 위치를 OS별로 구체적으로 알려 준다. 버디를 우클릭하면 메뉴가 쏟아지고, 거기서 메인(설정창)을 열 수 있다.
const CLOSE_NOTICE = process.platform === 'darwin'
  ? '버디는 계속 놀고 있어요. 버디를 우클릭하면 메뉴가 쏟아져요. 앱 종료는 화면 위 메뉴 막대 오른쪽의 하트 아이콘에서 해요'
  : '버디는 계속 놀고 있어요. 버디를 우클릭하면 메뉴가 쏟아져요. 앱 종료는 작업 표시줄 오른쪽 ^ 안의 하트 아이콘에서 해요';
const CLOSE_NOTICE_MS = 9000;
const REOPEN_HINT = '나를 우클릭하면 메뉴가 쏟아져요 (메인 · 날씨 · 알람)';

// 설정창을 처음 X로 닫을 때 버디 위에 한 번만 알려 준다. 버디가 숨겨져 있으면 안 보이므로 다음 기회로 미룬다.
function maybeShowCloseNotice() {
  if (isQuitting || readFlags().closeNoticeShown) return;
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
  petWindow.webContents.send('show-toast', CLOSE_NOTICE, CLOSE_NOTICE_MS);
  markFlag('closeNoticeShown');
}

// ─── 설정창 크기 ──────────────────────────────────────────────────────────────
// 기본 크기는 홈 화면(칩, 점심·퇴근 카드)이 스크롤 없이 보이는 크기(내용 약 704px + 제목 표시줄). 작업 영역의 90%를 넘지 않고,
// 화면이 작으면 줄인다. 최소 크기는 700x580(화면이 그보다 작으면 화면에 맞춘다). 사용자가 마지막으로 조절한 크기가 있으면 그걸 쓴다.
const SETTINGS_MIN = { width: 700, height: 580 };
const SETTINGS_DEFAULT = { width: 960, height: 770 };
const windowSizeFile = () => path.join(app.getPath('userData'), 'window.json');

function readSavedWindowSize() {
  try {
    const j = JSON.parse(fs.readFileSync(windowSizeFile(), 'utf8'));
    if (Number.isFinite(j.width) && Number.isFinite(j.height)) return { width: Math.round(j.width), height: Math.round(j.height) };
  } catch {}
  return null;
}

function saveWindowSize(win) {
  try {
    if (win.isDestroyed() || win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    const [width, height] = win.getSize();
    fs.writeFileSync(windowSizeFile(), JSON.stringify({ width, height }));
  } catch {}
}

function initialSettingsSize() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const min = { width: Math.min(SETTINGS_MIN.width, wa.width), height: Math.min(SETTINGS_MIN.height, wa.height) };
  const saved = readSavedWindowSize();
  const limit = saved ? wa : { width: Math.floor(wa.width * 0.9), height: Math.floor(wa.height * 0.9) };   // 직접 조절한 크기는 작업 영역까지
  const base = saved || SETTINGS_DEFAULT;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  return { min, width: clamp(base.width, min.width, limit.width), height: clamp(base.height, min.height, limit.height) };
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus(); return;
  }
  const size = initialSettingsSize();
  settingsWindow = new BrowserWindow({
    width: size.width, height: size.height,
    minWidth: size.min.width, minHeight: size.min.height,
    frame: true, resizable: true, show: false,
    title: '최애를 풀어놨습니다',
    backgroundColor: '#F4F4F4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  // 출처 링크(CC BY 4.0)는 새 앱 창이 아니라 기본 브라우저로 연다
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === CREDIT_URL) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 설정창이 앱 화면 밖으로 이동하지 못하게 한다
  settingsWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== settingsWindow.webContents.getURL()) e.preventDefault();
  });
  const entrance = entranceKind();
  settingsWindow.loadURL(getPageURL(entrance ? `/settings?intro=1&entrance=${entrance}` : '/settings'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  // 사용자가 직접 조절한 경우(will-resize)에만 저장한다. 기본 크기를 그대로 쓰는 동안은 저장하지 않아야 나중에 기본 크기가 바뀌어도 반영된다.
  let sizeTimer = null, userResized = false;
  const win = settingsWindow;
  win.on('will-resize', () => { userResized = true; });
  win.on('resize', () => { if (!userResized) return; clearTimeout(sizeTimer); sizeTimer = setTimeout(() => saveWindowSize(win), 500); });
  settingsWindow.on('close', () => { clearTimeout(sizeTimer); if (userResized) saveWindowSize(win); settingsWindow = null; maybeShowCloseNotice(); });
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  petWindow = new BrowserWindow({
    width: PET_WIN_W, height: PET_WIN_H,
    x: width - PET_WIN_W - 40, y: height - PET_WIN_H - 40,
    transparent: true, frame: false, resizable: false,
    movable: true, skipTaskbar: false,
    alwaysOnTop: true, hasShadow: false, focusable: true,
    // panel type 제거 - Apple Silicon 호환성
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  petWindow.setAlwaysOnTop(alwaysOnTopFlag, 'screen-saver');
  petWindow.loadURL(getPageURL(freshInstall ? '/pet?fresh=1' : '/pet'));
  applyPetMouse();   // 초집중 모드로 시작하면 처음부터 클릭 통과
  petRegions = []; petCT = { interactive: true, miss: 0 };   // 새 창은 영역을 알려 줄 때까지 전부 받는다
  startClickThrough();
  petWindow.on('closed', () => { petWindow = null; petRegions = []; stopAlwaysOnTopKeepAlive(); });
  resumeAlwaysOnTopKeepAlive();
}

// ─── 트레이 아이콘 ────────────────────────────────────────────────────────────
// 흰/검정 PNG(16·32px) 세트. Windows는 작업 표시줄 테마에 맞춰 고르고, 맥은 검정 Template 이미지로 OS가 자동 반전한다.
// 평소에는 정지, 미리 알림이 뜰 때만 프레임을 바꿔 한 번 두근한 뒤 정지 상태로 돌아온다.
const TRAY_BEAT_FRAMES = [[1, 0], [2, 55], [3, 120]]; // [프레임 번호, 시작 시각(ms)]: 15px → 16px → 15px
const TRAY_BEAT_END_MS = 200;                          // 이 시각에 평소 이미지(14px)로 돌아와 정지
let trayDark = true;        // 작업 표시줄이 어두우면 흰 아이콘
let trayBeating = false;
let trayBeatTimers = [];
let trayRefreshToken = 0;
const trayImageCache = {};

function trayAssetPath(name) {
  const dirs = app.isPackaged
    ? [path.join(process.resourcesPath, 'public', 'tray'), path.join(__dirname, 'public', 'tray')]
    : [path.join(__dirname, 'public', 'tray')];
  for (const dir of dirs) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

// frame 0은 평소, 1~3은 두근 프레임. 16px(배율 1)과 32px(배율 2)를 함께 담아 화면 배율에 맞게 쓰이게 한다.
function loadTrayImage(variant, frame) {
  const key = variant + frame;
  if (trayImageCache[key]) return trayImageCache[key];
  const image = nativeImage.createEmpty();
  const suffix = frame ? `-f${frame}` : '';
  for (const [px, scaleFactor] of [[16, 1], [32, 2]]) {
    const file = trayAssetPath(`tray-${variant}-${px}${suffix}.png`);
    if (file) image.addRepresentation({ scaleFactor, buffer: fs.readFileSync(file) });
  }
  if (process.platform === 'darwin') image.setTemplateImage(true);
  return (trayImageCache[key] = image);
}

function trayImage(frame) {
  if (process.platform === 'darwin') {
    if (frame === 0) {
      const file = trayAssetPath('trayTemplate.png'); // 이름이 Template으로 끝나면 OS가 템플릿으로 다룬다
      if (file) { const img = nativeImage.createFromPath(file); if (!img.isEmpty()) return img; }
    }
    return loadTrayImage('black', frame);
  }
  return loadTrayImage(trayDark ? 'white' : 'black', frame);
}

// Windows 작업 표시줄 테마(SystemUsesLightTheme)를 읽는다. 앱 테마(nativeTheme)와 다를 수 있어 이쪽을 우선한다.
function readTaskbarIsLight() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve(null); return; }
    execFile('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme'],
      { windowsHide: true, timeout: 1500 }, (err, stdout) => {
        if (err) { resolve(null); return; }
        const m = /SystemUsesLightTheme\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(String(stdout));
        resolve(m ? parseInt(m[1], 16) !== 0 : null);
      });
  });
}

async function refreshTrayIcon() {
  if (!tray || isQuitting) return;
  const token = ++trayRefreshToken;
  const light = await readTaskbarIsLight();
  if (token !== trayRefreshToken || !tray || isQuitting) return;
  trayDark = light === null ? nativeTheme.shouldUseDarkColors : !light;   // 레지스트리를 못 읽으면 nativeTheme으로
  if (!trayBeating) tray.setImage(trayImage(0));
}

// 미리 알림이 뜰 때 한 번만 두근. 움직임 줄이기가 켜져 있으면 바꾸지 않는다.
function playTrayBeat() {
  if (!tray || trayBeating || isQuitting) return;
  try { if (systemPreferences.getAnimationSettings().prefersReducedMotion) return; } catch {}
  trayBeating = true;
  trayBeatTimers = TRAY_BEAT_FRAMES.map(([frame, at]) => setTimeout(() => {
    if (tray && !isQuitting) tray.setImage(trayImage(frame));
  }, at));
  trayBeatTimers.push(setTimeout(() => {
    trayBeating = false;
    trayBeatTimers = [];
    if (tray && !isQuitting) tray.setImage(trayImage(0));   // 정지 상태로 복귀 (반복하지 않는다)
  }, TRAY_BEAT_END_MS));
}

// ★ 시스템 트레이 생성
function createTray() {
  tray = new Tray(trayImage(0));
  refreshTrayIcon();
  nativeTheme.on('updated', refreshTrayIcon);
  tray.setToolTip('최애를 풀어놨습니다');

  const buildTrayMenu = () => Menu.buildFromTemplate([
    {
      label: '⚙️ 설정 열기',
      click: () => createSettingsWindow(),
    },
    {
      label: '📣 버디 부르기',
      click: () => {
        if (!petWindow || petWindow.isDestroyed()) { createPetWindow(); return; }
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        const [winW, winH] = petWindow.getSize();
        petWindow.setPosition(Math.round((width - winW) / 2), Math.round(height - winH - 40), false);
        petWindow.show();
        petWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('call-pet'))`);
      },
    },
    { type: 'separator' },
    {
      label: '🐱 버디 보이기',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); resumeAlwaysOnTopKeepAlive(); }
        else createPetWindow();
      },
    },
    {
      label: '🙈 버디 숨기기',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) { petWindow.hide(); stopAlwaysOnTopKeepAlive(); }
      },
    },
    { type: 'separator' },
    {
      label: focusMode.trayLabel(focusState.enabled),   // 초집중 모드 켜기/끄기(상태에 따라 글자가 바뀐다)
      click: () => updateFocus({ enabled: !focusState.enabled }),
    },
    { type: 'separator' },
    {
      label: '⏻ 앱 종료',
      click: () => requestQuit(),
    },
  ]);

  trayMenuBuilder = buildTrayMenu;
  tray.setContextMenu(buildTrayMenu());
  // 트레이 더블클릭 → 설정창
  tray.on('double-click', () => createSettingsWindow());
  // 트레이 클릭 (Windows) → 설정창
  tray.on('click', () => createSettingsWindow());
}

// ★ 종료 요청은 전부 requestQuit()으로 모은다
// isQuitting → 설정창 저장 → 모든 창·트레이 정리 → app.quit. 어디선가 막혀도 2초 뒤에는 app.exit으로 끝낸다.
function stopAllTimers() {
  stopAlwaysOnTopKeepAlive();
  stopClickThrough();
  stopYarTimer();
  stopBreakTimeChecker();
  stopPhotoRotation();
  if (updater) updater.stop();
}

// 설정창에 저장을 요청하고, 끝났다는 답이 오거나 SAVE_WAIT_MS가 지나면 넘어간다
function flushSettings() {
  return new Promise((resolve) => {
    if (!settingsWindow || settingsWindow.isDestroyed()) { resolve(); return; }
    let timer = null;
    const done = () => {
      clearTimeout(timer);
      ipcMain.removeListener('settings-flushed', done);
      resolve();
    };
    timer = setTimeout(done, SAVE_WAIT_MS);
    ipcMain.on('settings-flushed', done);
    try { settingsWindow.webContents.send('flush-settings'); } catch { done(); }
  });
}

function finishQuit() {
  quitReady = true;
  try { session.defaultSession.flushStorageData(); } catch {}
  for (const w of BrowserWindow.getAllWindows()) {
    try { if (!w.isDestroyed()) w.destroy(); } catch {}
  }
  settingsWindow = null; petWindow = null; yarWindow = null; breakTimeWindow = null; quickWindow = null;
  trayBeatTimers.forEach(clearTimeout);
  if (tray) { try { tray.destroy(); } catch {} tray = null; }
  // 업데이트 재시작이 요청된 종료면, 정리가 모두 끝난 지금 설치하고 종료한다(quitAndInstall이 app.quit()을 대신한다). 아니면 평소처럼 종료.
  if (!(updater && updater.runInstall())) app.quit();
}

function requestQuit() {
  if (isQuitting) return;
  isQuitting = true;
  quitTimer = setTimeout(() => app.exit(0), QUIT_TIMEOUT_MS);
  try { stopAllTimers(); } catch {}
  flushSettings().catch(() => {}).then(finishQuit, finishQuit);
}

// ★ 하나만 실행: 이미 실행 중이면 새로 뜬 쪽은 바로 끝내고, 실행 중인 앱은 설정창을 앞으로 보낸다
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (isQuitting) return;
    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isMinimized()) settingsWindow.restore();
    createSettingsWindow();
  });

  app.whenReady().then(() => {
    freshInstall = !fs.existsSync(flagsFile());
    restoreAlarms();   // 저장된 알람 설정으로 바로 시작(창 IPC를 기다리지 않는다)
    focusState = focusMode.loadFocus(focusFile());   // 초집중 모드 상태 복원(자동 실행의 조용한 시작에서도 같은 상태로 시작)
    app.on('activate', () => {
      if (Date.now() < silentUntil) return;   // 로그인 자동 실행 직후의 activate는 무시(조용히 시작)
      if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
      else { settingsWindow.show(); settingsWindow.focus(); }
    });
    // 로그인 때 자동으로 켜진 경우: 설정창·인트로 없이 버디와 알람만 조용히 시작한다(첫 실행·신규 설치 판정, introSeenVersion은 그대로).
    // 설정창은 트레이·버디 우클릭·다시 실행(second-instance)으로 언제든 열 수 있고, 그때 필요한 인트로는 평소처럼 보인다.
    const launchedAtLogin = loginItem.wasLaunchedAtLogin({ platform: process.platform, argv: process.argv, getSettings: () => app.getLoginItemSettings() });
    if (launchedAtLogin) silentUntil = Date.now() + SILENT_ACTIVATE_MS;
    else createSettingsWindow();
    createPetWindow();
    createTray();
    initUpdater();
  });
}

app.on('window-all-closed', () => {
  if (isQuitting) return;
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
});

// 앱이 만든 종료 경로가 아닌 종료 요청(OS 종료, 로그오프, macOS ⌘Q 등)도 막지 않고 같은 순서로 저장 후 끝낸다
app.on('before-quit', (e) => {
  if (quitReady) return;
  e.preventDefault();
  requestQuit();
});

// ★ 초집중 모드: 펫이 한자리에서 조금만 움직이고 시계만 띄워 두는 모드(알람은 평소처럼 울린다: 알람 코드는 이 상태를 보지 않는다).
//  상태는 메인이 소유하고 userData/focus-mode.json에 저장한다(설정창·트레이·버디 창이 모두 여기를 거치므로 서로 덮어쓰지 않는다). 판단 로직은 focus-mode.cjs(단위 테스트됨).
const focusMode = require('./focus-mode.cjs');
const focusFile = () => path.join(app.getPath('userData'), 'focus-mode.json');
let trayMenuBuilder = null;          // 초집중 켜기/끄기 글자가 바뀌면 트레이 메뉴를 다시 만든다
function rebuildTrayMenu() { if (tray && trayMenuBuilder) { try { tray.setContextMenu(trayMenuBuilder()); } catch {} } }
// 클릭 통과: 펫 창은 보이는 펫보다 훨씬 커서(240×230 대 76px), 투명한 부분이 펫 주변 클릭을 막았다. 그래서 창은 평소 클릭을 통과시키고,
// 마우스가 실제 보이는 요소(펫 원·말풍선·토스트) 위에 있을 때만 받는다. 판정은 메인이 커서 위치와 창 위치로 한다(click-through.cjs, 단위 테스트됨).
// 초집중 모드는 예전처럼 렌더러가 알려 주는 "버디 위인지"(petInteractive)도 함께 쓴다(둘 중 하나라도 위면 받는다). 비상 스위치: CHOEAE_DISABLE_CLICKTHROUGH=1 이면 예전 동작.
const clickThrough = require('./click-through.cjs');
const clickThroughOn = clickThrough.isEnabled(process.env);
let petRegions = [];                              // 렌더러가 알려 준 보이는 요소 영역(창 안 좌표). 비어 있으면(아직 모르면) 항상 받는다
let petCT = { interactive: true, miss: 0 };       // 펫 창의 현재 판정(처음에는 연다)
function applyPetMouse() {
  if (petWindow && !petWindow.isDestroyed()) {
    try { petWindow.setIgnoreMouseEvents(clickThrough.shouldIgnore({ enabled: clickThroughOn, focusEnabled: focusState.enabled, rendererInteractive: petInteractive, hit: petCT.interactive }), { forward: true }); } catch {}
  }
}
let clickThroughTimer = null;
function pollClickThrough() {
  let cursor = null;
  try { cursor = screen.getCursorScreenPoint(); } catch { return; }
  if (petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) {
    const next = clickThrough.step(petCT, { cursor, bounds: petWindow.getBounds(), regions: petRegions, dragging: !!petWindow._dragging });
    const changed = next.interactive !== petCT.interactive;
    petCT = next;
    if (changed) applyPetMouse();
  }
  // 퀵 메뉴 창(호 모드): 버튼·카드 위에서만 받는다. 열림 모션 동안(버튼이 날아가는 중)은 전부 받아서 안착 전에도 누를 수 있다.
  if (quickWindow && !quickWindow.isDestroyed() && quickState && quickState.regions && !quickState.closing) {
    const full = Date.now() - quickShownAt < quickMenu.QUICK_FULL_CLICK_MS;
    const prev = quickState.ct || { interactive: true, miss: 0 };
    const next = full ? { interactive: true, miss: 0 } : clickThrough.step(prev, { cursor, bounds: quickWindow.getBounds(), regions: quickState.regions });
    quickState.ct = next;
    if (next.interactive !== prev.interactive) { try { quickWindow.setIgnoreMouseEvents(!next.interactive, { forward: true }); } catch {} }
  }
}
function startClickThrough() { if (clickThroughOn && !clickThroughTimer) clickThroughTimer = setInterval(pollClickThrough, clickThrough.POLL_MS); }
function stopClickThrough() { if (clickThroughTimer) { clearInterval(clickThroughTimer); clickThroughTimer = null; } }
function applyYar() { setYarMinutes(focusMode.effectiveYarMinutes(focusState, yarDesired)); }   // 모드 중에는 야르 타임을 멈추고, 끄면 원래 간격으로 돌아간다
function broadcastFocus() {
  for (const w of [settingsWindow, petWindow]) if (w && !w.isDestroyed()) { try { w.webContents.send('focus-state', { ...focusState }); } catch {} }
}
function updateFocus(change) {
  const r = focusMode.applyFocusChange(focusState, change);
  if (!r.changed) return { ...focusState };
  focusState = r.state; focusMode.saveFocus(focusFile(), focusState);
  if (r.enabledChanged) { petInteractive = false; applyPetMouse(); applyYar(); rebuildTrayMenu(); }
  if (!r.onlyAnchor) broadcastFocus();   // 기준 위치만 바뀐 것은 버디 창이 스스로 알린 것이라 다시 알리지 않는다
  return { ...focusState };
}
ipcMain.handle('focus-get', () => ({ ...focusState }));
ipcMain.handle('focus-set', (_e, change) => updateFocus({ enabled: change && change.enabled, seconds: change && change.seconds }));
ipcMain.on('focus-anchor', (_e, p) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) updateFocus({ anchor: { x: p.x, y: p.y } }); });
ipcMain.on('pet-interactive', (_e, v) => { const next = v === true; if (next === petInteractive) return; petInteractive = next; applyPetMouse(); });
// 클릭 통과: 버디 창이 보이는 요소(펫 원·말풍선·토스트)의 영역을 알려 준다(바뀔 때만)
ipcMain.on('pet-regions', (e, list) => {
  if (!petWindow || petWindow.isDestroyed() || e.sender !== petWindow.webContents) return;
  const r = clickThrough.sanitizeRegions(list);
  if (r) petRegions = r;
});

// ★ 컴퓨터를 켜면 자동 실행(로그인 항목). 판단 로직은 login-item.cjs(단위 테스트됨). 상태는 저장하지 않고 항상 OS에서 읽는다.
const loginItem = require('./login-item.cjs');
const loginItemDeps = () => ({
  app, platform: process.platform, isPackaged: app.isPackaged, defaultApp: !!process.defaultApp,   // defaultApp: `electron .`(개발·fresh)로 띄운 경우
  env: process.env, exePath: app.getPath('exe'), home: require('os').homedir(),
});
ipcMain.handle('login-item-get', () => loginItem.readLoginItem(loginItemDeps()));
ipcMain.handle('login-item-set', (_e, enabled) => loginItem.writeLoginItem(loginItemDeps(), enabled === true));

// ★ 자동 업데이트(electron-updater + GitHub 릴리스). 판단 로직은 updater.cjs(단위 테스트됨)에 있고, 여기서는 실제 Electron 값을 연결한다.
//  - 패키징되지 않았거나 app-update.yml이 없으면(개발 모드, npm run fresh) 꺼진다.
//  - 재시작 설치는 requestQuit()을 끝까지 거친 뒤 finishQuit()에서 수행한다(위).
const { createUpdater, isUpdaterEnabled, installLocationStatus, MESSAGES: UPDATE_MESSAGES } = require('./updater.cjs');

// ★ 중요: 부모 창 없는 dialog.showMessageBox는 맥에서 대화상자가 떠 있는 동안 메인 프로세스의 타이머(알람 스케줄러 포함)를 멈춘다(실측: 열린 뒤 tick이 완전히 멈춤).
//   그래서 대화상자는 항상 보이는 창(설정창, 없으면 버디 창)에 붙여서 띄운다(시트 방식은 타이머가 계속 돈다). 보이는 창이 없으면 대화상자를 건너뛰고,
//   상태는 설정창·트레이 표시로만 알린다(자동 확인이 창을 억지로 띄우지 않게).
function promptParent() {
  for (const w of [settingsWindow, petWindow]) if (w && !w.isDestroyed() && w.isVisible()) return w;
  return null;
}

async function promptUpdate(kind, ctx) {
  const parent = promptParent();
  if (!parent) return 'later';   // 보이는 창이 없으면 묻지 않는다(다음 확인이나 설정창에서 다시 알린다)
  const B = UPDATE_MESSAGES.buttons;
  const spec = {
    available:   { message: UPDATE_MESSAGES.available(ctx.version), buttons: [B.updateNow, B.later] },
    downloaded:  { message: UPDATE_MESSAGES.downloaded, buttons: [B.restart, B.later] },
    location:    { message: UPDATE_MESSAGES.moveToApplications, detail: UPDATE_MESSAGES.moveToApplicationsDetail(ctx.version), buttons: [B.ok] },
  }[kind];
  const { response } = await dialog.showMessageBox(parent, {   // 부모 창에 붙인다(위 주석: 부모 없이 띄우면 알람 타이머가 멈춘다)
    type: 'info', title: UPDATE_MESSAGES.title, message: spec.message, detail: spec.detail,
    buttons: spec.buttons, defaultId: 0, cancelId: spec.buttons.length - 1, noLink: true,
  });
  if (kind === 'available' || kind === 'downloaded') return response === 0 ? 'yes' : 'later';
  return 'ok';
}

// 상태를 설정창에 보내고, 설정창이 닫혀 있어도 보이는 작은 표시를 한다(맥: 트레이 옆 숫자, Windows: 트레이 툴팁·작업 표시줄 진행 막대)
function broadcastUpdateState(s) {
  if (settingsWindow && !settingsWindow.isDestroyed()) { try { settingsWindow.webContents.send('update-state', s); } catch {} }
  const downloading = s.status === 'downloading';
  if (tray) {
    try {
      tray.setToolTip(downloading ? `최애를 풀어놨습니다 · 업데이트 다운로드 중 ${s.percent}%` : s.status === 'downloaded' ? '최애를 풀어놨습니다 · 재시작하면 업데이트가 설치돼요' : '최애를 풀어놨습니다');
      if (process.platform === 'darwin') tray.setTitle(downloading ? `${s.percent}%` : '');
    } catch {}
  }
  const bar = downloading ? Math.max(0, s.percent) / 100 : -1;
  for (const w of [petWindow, settingsWindow]) if (w && !w.isDestroyed()) { try { w.setProgressBar(bar); } catch {} }
}

function initUpdater() {
  const hasUpdateConfig = fs.existsSync(path.join(process.resourcesPath || '', 'app-update.yml'));
  const enabled = isUpdaterEnabled({ isPackaged: app.isPackaged, hasUpdateConfig });
  let autoUpdater = null;
  if (enabled) { try { ({ autoUpdater } = require('electron-updater')); } catch (e) { console.error('[updater] 불러오지 못했어요', e && e.message); } }
  updater = createUpdater({
    autoUpdater,
    enabled: enabled && !!autoUpdater,
    location: installLocationStatus({ platform: process.platform, exePath: app.getPath('exe'), home: require('os').homedir() }),
    isBusy: () => alertCount > 0,           // 알람·점심·퇴근·야르 같은 전체화면 알림이 떠 있는 동안은 재시작을 미룬다
    showPrompt: promptUpdate,
    requestInstallQuit: () => requestQuit(),
    onState: broadcastUpdateState,
    log: (...a) => console.log('[updater]', ...a),
  });
  updater.start();
}
ipcMain.handle('update-get-state', () => (updater ? updater.getState() : { status: 'disabled' }));
ipcMain.handle('update-check', async () => (updater ? updater.check({ manual: true }) : { status: 'disabled' }));
ipcMain.handle('update-download', async () => (updater ? updater.download() : { status: 'disabled' }));
ipcMain.handle('update-install', () => (updater ? updater.install() : false));

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('quit-app', () => requestQuit());

ipcMain.on('open-settings', () => createSettingsWindow());

ipcMain.on('show-pet', () => {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); resumeAlwaysOnTopKeepAlive(); }
  else createPetWindow();
});
ipcMain.on('hide-pet', () => {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.hide(); stopAlwaysOnTopKeepAlive(); }
});
ipcMain.on('set-always-on-top', (_e, flag) => setPetAlwaysOnTop(flag));
ipcMain.on('resize-pet-window', (_e, size) => {
  if (petWindow && !petWindow.isDestroyed()) {
    const [x, y] = petWindow.getPosition();
    const b = quickMenu.safeBounds({ x, y, width: size && size.width, height: size && size.height });   // NaN·문자열·0 크기는 무시(예외 방지)
    if (!b) { console.warn('[pet] 창 크기 값이 올바르지 않아 건너뛰었어요'); return; }
    petWindow.setBounds(b, false);
  }
});
ipcMain.on('move-pet-window', (_e, pos) => {
  if (petWindow && !petWindow.isDestroyed() && !petWindow._dragging) {
    const p = quickMenu.safePoint(pos);   // NaN·undefined·문자열이면 무시(예외 방지). 정상 값은 예전과 같이 정수로 반올림
    if (!p) { console.warn('[pet] 창 위치 값이 올바르지 않아 건너뛰었어요'); return; }
    petWindow.setPosition(p.x, p.y, false);
  }
});
ipcMain.on('call-pet', () => {
  if (!petWindow || petWindow.isDestroyed()) { createPetWindow(); return; }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const [winW, winH] = petWindow.getSize();
  petWindow.setPosition(Math.round((width - winW) / 2), Math.round(height - winH - 40), false);
  petWindow.show();
  petWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('call-pet'))`);
});
ipcMain.on('start-drag', (_e) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow._dragging = true;

  // 클릭 시점의 커서와 창 위치로 offset 계산
  const [startWinX, startWinY] = petWindow.getPosition();
  const startCursor = screen.getCursorScreenPoint();
  const offsetX = startCursor.x - startWinX;
  const offsetY = startCursor.y - startWinY;

  let prevX = startCursor.x;
  let prevY = startCursor.y;

  let dragInterval = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) {
      clearInterval(dragInterval);
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    // 움직임이 없으면 스킵
    if (cursor.x === prevX && cursor.y === prevY) return;
    prevX = cursor.x;
    prevY = cursor.y;
    const newX = Math.round(cursor.x - offsetX);
    const newY = Math.round(cursor.y - offsetY);
    petWindow.setPosition(newX, newY, false);
  }, 8);

  const stopDrag = () => {
    clearInterval(dragInterval);
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow._dragging = false;
      // 드래그 끝나면 현재 창 위치를 renderer에 전달
      const [wx, wy] = petWindow.getPosition();
      petWindow.webContents.send('drag-ended', { wx, wy });
    }
  };

  ipcMain.once('end-drag', stopDrag);

  // 마우스 버튼이 떼졌을 때 강제 종료
  setTimeout(() => {
    const checkUp = setInterval(() => {
      if (!petWindow || petWindow.isDestroyed()) {
        clearInterval(checkUp);
        return;
      }
      // 드래그 중이 아니면 중단
      if (!petWindow._dragging) {
        clearInterval(checkUp);
        clearInterval(dragInterval);
      }
    }, 100);
  }, 500);
});

// ─── 처음 안내(온보딩) ────────────────────────────────────────────────────────
// 안내는 설정창 안에서만 진행되고 버디는 평소처럼 이미 실행 중이다. 마지막 "버디 풀어놓기"는 설정창을 닫는 동작만 한다.
// 마지막 화면에서 이미 "설정창을 닫아도 버디는 계속 놀아요"를 알려 줬으니 닫을 때 안내 토스트는 다시 띄우지 않는다.
ipcMain.on('onboarding-finish', () => {
  markFlag('closeNoticeShown');
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  // 새 설치 유저에게만, 온보딩을 마친 직후 한 번: 버디 말풍선으로 다시 여는 법을 알려 준다
  const flags = readFlags();
  if (flags.newInstall && !flags.reopenHintShown && petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) {
    markFlag('reopenHintShown');
    setTimeout(() => {
      if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('show-bubble', REOPEN_HINT, 7000);
    }, 600);
  }
});

// ★ 퀵 메뉴: 고양이를 우클릭하면 설정창 대신 작은 아이콘 메뉴(/quick 창)가 펫 근처에 뜬다. 메인 열기·날씨·알람·종료.
// 닫기: Esc(퀵 창이 요청) · 바깥 클릭이나 다른 창으로 포커스 이동(blur) · 동작을 고른 뒤. 열려 있는 동안 펫의 평소 말풍선은 쉰다(quick-state).
// 위치·크기 계산은 quick-menu.cjs(시험됨). 창은 열 때 만들고 닫을 때 없앤다(메모리를 계속 쓰지 않는다).
const quickMenu = require('./quick-menu.cjs');
let quickShownAt = 0;
let pendingGoto = null;   // 설정창이 막 만들어지는 중이면 가야 할 곳을 맡아 둔다(설정창이 뜨면 가져간다)

function notifyQuickState(open) {
  if (petWindow && !petWindow.isDestroyed()) { try { petWindow.webContents.send('quick-state', open); } catch {} }
}
// 퀵 창 상태: mode('arc' 호 | 'bar' 알약 바), count(버튼 수), card({w,h}|null), closing(닫힘 모션 중), closeTimer
let quickState = null;
let petSizePct = 100;   // 설정의 버디 크기(%): 호 반지름이 펫 크기에 비례한다(sync-settings가 갱신)
function destroyQuickNow() {
  const w = quickWindow, st = quickState;
  quickWindow = null; quickState = null;
  if (st && st.closeTimer) clearTimeout(st.closeTimer);
  if (w && !w.isDestroyed()) { try { w.destroy(); } catch {} }
  notifyQuickState(false);
}
// 닫기: animate면 닫힘 모션(0.15초) 뒤에 창을 없앤다. 닫기는 열림 알림을 바로 거두므로 펫은 즉시 원래 움직임으로 돌아온다. 이미 닫히는 중이면 animate여도 그대로 둔다(연타·재우클릭에 꼬이지 않게).
function closeQuickMenu(animate = false) {
  if (!quickWindow || quickWindow.isDestroyed()) { destroyQuickNow(); return; }
  const st = quickState;
  if (!animate || !quickWindow.isVisible()) { destroyQuickNow(); return; }
  if (st && st.closing) return;
  if (st) st.closing = true;
  notifyQuickState(false);
  try { quickWindow.webContents.send('quick-closing'); } catch {}
  if (st) st.closeTimer = setTimeout(destroyQuickNow, quickMenu.QUICK_CLOSE_MS);
}
// 펫 창 위치는 우클릭한 순간의 값을 쓴다(페이지가 뜨는 동안 펫이 조금 움직여도 호는 우클릭한 자리 기준)
const quickWork = () => {
  const pet = (quickState && quickState.pet) || petWindow.getBounds();
  return { pet, work: quickMenu.pickWorkArea(pet, screen.getAllDisplays()) || screen.getPrimaryDisplay().workArea };
};
// 퀵 창의 setBounds는 이 함수로만 부른다: 값이 정수가 아니거나 NaN·Infinity·문자열이면 예외가 나므로 먼저 정수화·검사하고,
// 못 쓰는 값이면 마지막 정상 위치 → 펫 근처 기본 위치 순으로 바꿔 쓴다. 예외는 던지지 않고 한 줄만 남긴다(값은 출력하지 않는다).
function setQuickBounds(raw, pet, size) {
  if (!quickWindow || quickWindow.isDestroyed()) return false;
  const r = quickMenu.boundsOrFallback(raw, quickState && quickState.lastBounds, quickMenu.defaultNearPet(pet, size));
  if (!r) { console.warn('[quick] 창 위치 값이 올바르지 않아 건너뛰었어요'); return false; }
  if (r.used === 'fallback') console.warn('[quick] 창 위치 값이 올바르지 않아 마지막 정상 위치(또는 펫 근처)를 썼어요');
  try { quickWindow.setBounds(r.bounds); } catch { console.warn('[quick] 창 위치를 바꾸지 못했어요'); return false; }
  if (quickState && r.used === 'given') quickState.lastBounds = r.bounds;
  return true;
}
// 알약 바 모드: 렌더러가 잰 크기로 펫 위/아래에 놓는다
function placeQuick(size) {
  if (!quickWindow || quickWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) return;
  const { pet, work } = quickWork();
  const p = quickMenu.placeQuickWindow(pet, size, work, { sizePct: petSizePct });
  setQuickBounds(p, pet, size);
  try { quickWindow.webContents.send('quick-layout', { mode: 'bar', side: p.side, maxWidth: quickMenu.barMaxWidth(work) }); } catch {}
}
// 호 모드: 펫 중심에서 호와 카드를 계산해 창을 놓고, 버튼 좌표를 렌더러에 보낸다
function layoutQuickArc() {
  if (!quickWindow || quickWindow.isDestroyed() || !petWindow || petWindow.isDestroyed() || !quickState) return;
  const { pet, work } = quickWork();
  const origin = quickMenu.petCenter(pet, petSizePct);
  const lay = quickMenu.layoutArc({ count: quickState.count, sizePct: petSizePct, origin, work, card: quickState.card, dir: quickState.dir || null });
  quickState.dir = lay.dir;   // 카드를 열고 닫아도 방향은 바뀌지 않는다(버튼이 튀지 않게)
  quickState.regions = clickThroughOn ? clickThrough.quickRegions(lay) : null;   // 버튼·카드 위에서만 클릭을 받는다(스위치가 꺼져 있으면 창 전체)
  setQuickBounds(lay.bounds, pet, null);
  try { quickWindow.webContents.send('quick-layout', lay); } catch {}
}
function showQuick() {
  if (!quickWindow || quickWindow.isDestroyed() || quickWindow.isVisible()) return;
  quickShownAt = Date.now();
  quickWindow.setAlwaysOnTop(true, 'screen-saver');
  quickWindow.show();
  quickWindow.focus();
  try { quickWindow.webContents.send('quick-open'); } catch {}   // 이제 열림 모션을 시작한다
}
function openQuickMenu() {
  if (isQuitting || !petWindow || petWindow.isDestroyed()) return;
  if (quickWindow && !quickWindow.isDestroyed()) { closeQuickMenu(true); return; }   // 열려 있을 때의 우클릭은 닫는다(닫히는 중이면 그대로)
  const size = { width: quickMenu.QUICK_W, height: quickMenu.QUICK_INITIAL_H };
  const win = new BrowserWindow({
    width: size.width, height: size.height, show: false,
    transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  quickWindow = win;
  const petAtOpen = petWindow.getBounds();
  quickState = { mode: null, count: 0, card: null, dir: null, closing: false, closeTimer: null, pet: petAtOpen };
  setQuickBounds({ x: petAtOpen.x, y: petAtOpen.y, width: size.width, height: size.height }, petAtOpen, size);   // 첫 알림(quick-init) 전의 임시 자리
  win.loadURL(getPageURL('/quick'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // 렌더러의 첫 알림(quick-init: 버튼 수)이 오면 배치해서 보여 준다. 안 오면 잠시 뒤에라도 보여 준다.
  setTimeout(() => { if (quickWindow === win) showQuick(); }, quickMenu.QUICK_SHOW_FALLBACK_MS);
  win.on('blur', () => {
    if (quickWindow !== win) return;
    if (Date.now() - quickShownAt < quickMenu.QUICK_BLUR_GRACE_MS) { try { win.focus(); } catch {} return; }
    closeQuickMenu(true);   // 바깥 클릭·다른 창으로 포커스 이동(펫을 잡아 끌기 시작해도 포커스가 옮겨 가서 닫힌다)
  });
  win.on('closed', () => { if (quickWindow === win) destroyQuickNow(); });
  notifyQuickState(true);
}
ipcMain.on('pet-right-click', () => openQuickMenu());

const fromQuick = (e) => !!quickWindow && !quickWindow.isDestroyed() && e.sender === quickWindow.webContents;
ipcMain.on('quick-close', (e) => { if (fromQuick(e)) closeQuickMenu(true); });
// 첫 알림: 버튼 수를 받아 호(6개까지) 또는 알약 바(7개 이상)로 정한다
ipcMain.on('quick-init', (e, info) => {
  if (!fromQuick(e) || !quickState || quickState.mode) return;
  const n = info && Number.isInteger(info.count) ? Math.min(Math.max(info.count, 1), 12) : 4;
  quickState.count = n; quickState.mode = quickMenu.modeFor(n);
  if (quickState.mode === 'arc') {
    layoutQuickArc();
    setTimeout(() => { if (quickWindow && quickState) showQuick(); }, 40);   // 렌더러가 좌표를 그린 뒤에 보여 준다
  } else {   // 바: 렌더러가 바를 그리고 크기를 알려 오면(quick-resize) 그때 놓고 보여 준다
    try { quickWindow.webContents.send('quick-layout', { mode: 'bar', side: 'above', maxWidth: quickMenu.barMaxWidth(quickWork().work) }); } catch {}
  }
});
// 바 모드: 렌더러가 바·카드의 사각형(창 안 좌표)을 알려 준다 → 클릭 통과 영역(버튼이 있는 바와 카드 위에서만 클릭을 받는다)
ipcMain.on('quick-regions', (e, list) => {
  if (!fromQuick(e) || !quickState || quickState.mode !== 'bar') return;
  const r = clickThroughOn ? clickThrough.sanitizeRegions(list) : null;
  quickState.regions = r && r.length ? r : null;
});
// 호 모드: 카드(날씨·알람)가 열리고 닫힐 때 크기를 알린다(null이면 카드 없음)
ipcMain.on('quick-card', (e, size) => {
  if (!fromQuick(e) || !quickState || quickState.mode !== 'arc') return;
  quickState.card = size ? quickMenu.clampCard(size.width, size.height) : null;
  layoutQuickArc();
});
// 알약 바 모드: 내용 크기 알림
ipcMain.on('quick-resize', (e, size) => {
  if (!fromQuick(e) || !quickState || quickState.mode === 'arc') return;
  const s = size && quickMenu.clampQuickSize(size.width, size.height);
  if (!s) return;
  placeQuick(s);
  showQuick();
});
ipcMain.handle('quick-get-alarms', (e) => (fromQuick(e) ? quickMenu.quickAlarmSettings(alarms.resolveAlarmSettings, alarmSettings) : null));   // 스케줄러가 쓰는 값을 읽기만 한다
ipcMain.on('quick-action', (e, action, arg) => {
  if (!fromQuick(e) || !quickMenu.isQuickAction(action) || (quickState && quickState.closing)) return;   // 닫히는 중의 눌림은 무시
  closeQuickMenu();
  if (action === 'quit') { requestQuit(); return; }   // 정상 종료 경로(저장·정리 후 app.quit, 막히면 QUIT_TIMEOUT_MS 뒤 app.exit)
  openSettingsTo(quickMenu.settingsTargetFor(action, arg));
});

// 설정창을 열고, 목적지(페이지·강조할 곳)가 있으면 알려 준다. 이미 열려 있으면 바로 보내고, 새로 만들면 설정창이 뜬 뒤에 가져가게 맡겨 둔다.
function openSettingsTo(target) {
  const t = quickMenu.sanitizeTarget(target);
  const existed = !!settingsWindow && !settingsWindow.isDestroyed();
  pendingGoto = existed ? null : t;
  createSettingsWindow();
  if (existed && t) { try { settingsWindow.webContents.send('settings-goto', t); } catch {} }
}
ipcMain.handle('settings-take-goto', () => { const t = pendingGoto; pendingGoto = null; return t; });

// ★ 야르타임 IPC
ipcMain.handle('get-pet-position', () => {
  if (!petWindow || petWindow.isDestroyed()) return null;
  const [x, y] = petWindow.getPosition();
  return { x, y };
});
ipcMain.on('set-yar-timer', (_e, intervalMinutes) => {
  yarDesired = intervalMinutes > 0 ? intervalMinutes : 0;
  applyYar();
});

// ─── 사진 교체 ────────────────────────────────────────────────────────────────
// 교체 시계는 메인에서 하나만 돌린다. 설정창 미리보기와 실제 버디가 같은 순서·같은 주기로 같은 사진을 보여주려면
// 두 창이 각자 세지 않고 이 값을 같이 받아야 한다. (예전에는 버디 창이 교체 주기 타이머와 졸림 방지 타이머로 따로 셌다)
let photoIndex = 0;          // 지금 보이는 사진 (내 사진 목록에서 빈 칸을 뺀 순서 기준)
let photoCount = 0;
let photoIntervalSec = 0;    // 0이면 교체 꺼짐 (사진 2장 미만, 동물 모드, 교체 끔)
let photoFirst = null;       // 대표(첫 번째) 사진. 바뀌면 처음부터 다시 보여준다
let photoTimer = null;

const photoState = () => ({ index: photoIndex, count: photoCount, intervalSec: photoIntervalSec });

function broadcastPhotoState() {
  for (const w of BrowserWindow.getAllWindows()) {
    try { if (!w.isDestroyed()) w.webContents.send('photo-state', photoState()); } catch {}
  }
}

function stopPhotoRotation() {
  if (photoTimer) { clearInterval(photoTimer); photoTimer = null; }
}

function startPhotoRotation() {
  stopPhotoRotation();
  if (!photoIntervalSec || photoCount < 2) return;
  photoTimer = setInterval(() => {
    photoIndex = (photoIndex + 1) % photoCount;
    broadcastPhotoState();
  }, photoIntervalSec * 1000);
}

function configurePhotoRotation(settings) {
  const images = Array.isArray(settings.customImages) ? settings.customImages.filter(Boolean) : [];
  const count = images.length;
  const on = settings.useCustomMode !== false && count >= 2 && settings.imageRotateEnabled !== false;
  const interval = on ? Math.max(30, Number(settings.imageRotateInterval) || 60) : 0;
  const first = images[0] || null;

  const firstChanged = first !== photoFirst;      // 대표가 바뀌었거나 사진을 올리고 지운 경우
  const intervalChanged = interval !== photoIntervalSec;
  const countChanged = count !== photoCount;

  photoFirst = first; photoCount = count; photoIntervalSec = interval;
  if (firstChanged || !on || photoIndex >= count) photoIndex = 0;   // 끄면 대표 사진으로 돌아간다
  if (firstChanged || intervalChanged || countChanged || (on && !photoTimer)) startPhotoRotation();
  if (!on) stopPhotoRotation();
  broadcastPhotoState();
}

ipcMain.handle('get-photo-state', () => photoState());

// ★ 날씨 안부(Open-Meteo): 네트워크 호출은 여기(메인)에서만 한다. 판단 로직은 weather.cjs(단위 테스트됨).
// 동의(weatherConsent)와 동네가 모두 있다고 설정 동기화가 알려 주기 전에는 어떤 요청도 보내지 않는다. 모두 비동기라 알람 1초 타이머를 막지 않는다.
const weather = require('./weather.cjs');
const weatherService = weather.createWeatherService({ fetch: (url, opts) => (require('electron').net && require('electron').net.fetch ? require('electron').net.fetch(url, opts) : fetch(url, opts)) });
ipcMain.handle('weather-get', async (_e, req) => {
  try {
    if (!req || typeof req !== 'object') return null;
    return await weatherService.get(req.lat, req.lon);
  } catch { return null; }
});

// ★ 앱 시작시 설정 동기화 - PetPage에서 설정 로드 후 호출
ipcMain.on('sync-settings', (_e, settings) => {
  if (settings && Number.isFinite(Number(settings.size))) petSizePct = Math.min(200, Math.max(50, Number(settings.size)));   // 퀵 메뉴 호 반지름이 펫 크기에 비례한다
  if (settings && typeof settings.weatherConsent === 'boolean') weatherService.setConsent(settings.weatherConsent && typeof settings.weatherCityId === 'string' && settings.weatherCityId !== '');
  configurePhotoRotation(settings);
  // 버디 창이 2초 폴링을 기다리지 않고 바로 새 설정을 읽게 한다
  if (petWindow && !petWindow.isDestroyed()) { try { petWindow.webContents.send('settings-changed'); } catch {} }
  // 야르타임 설정 동기화
  yarDesired = settings.yarEnabled && settings.yarInterval > 0 ? settings.yarInterval : 0;
  applyYar();
  if (typeof settings.alwaysOnTop === 'boolean' && settings.alwaysOnTop !== alwaysOnTopFlag) {
    setPetAlwaysOnTop(settings.alwaysOnTop);
  }
  // 점심/퇴근/일반 알람 동기화(메인이 저장도 한다)
  applyAlarmSettings(settings);
});

ipcMain.on('yar-now', () => {
  createYarWindow();
});

// ★ 점심/퇴근 알림 윈도우
let breakTimeWindow = null;
let breakTimeChecker = null;

function createBreakTimeWindow(type, info) {
  if (breakTimeWindow && !breakTimeWindow.isDestroyed()) {
    breakTimeWindow.destroy();
    breakTimeWindow = null;
  }

  const { width, height } = screen.getPrimaryDisplay().bounds;

  breakTimeWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  trackAlertWindow(breakTimeWindow);
  breakTimeWindow.setAlwaysOnTop(true, 'screen-saver');
  breakTimeWindow.setIgnoreMouseEvents(true, { forward: true });
  // 알람 카드는 이름·시간 범위·참석자·메모를 쿼리로 받아 두 텍스트 칸만 바꾼다(모양과 모션은 그대로)
  const q = new URLSearchParams({ type });
  if (type === 'alarm' && info) for (const [k, v] of Object.entries({ n: info.name, t: info.time, e: info.endTime, a: info.attendees, m: info.memo, x: info.missed ? '1' : '' })) if (v) q.set(k, v);
  breakTimeWindow.loadURL(getPageURL(`/breaktime?${q.toString()}`));

  // 생성 시점의 창을 캡처해 그 창만 닫는다 (연속 생성 시 새 창이 닫히는 것 방지)
  const w = breakTimeWindow;
  const showMs = 3000 + (type === 'alarm' && alarms.alarmHasText(info) ? alarms.TEXT_EXTRA_MS : 0);   // 글이 있는 알람 카드는 2초 더
  setTimeout(() => {
    if (w && !w.isDestroyed()) w.close();
    if (breakTimeWindow === w) breakTimeWindow = null;
  }, showMs);
}

// ★ 알람 스케줄: 설정은 메인이 직접 들고(alarmSettings) userData/alarm-settings.json에 저장한다.
// 앱이 시작되면 설정창·펫 창의 IPC를 기다리지 않고 저장된 값으로 바로 체커를 돌리고, sync-settings가 오면 "들어 있는 알람 키만" 덮어쓴다.
// 발화 기록은 날짜+알람 시각 기준이라(alarms.cjs) 같은 날 시각을 바꾸면 바꾼 시각에 다시 울린다.
const alarms = require('./alarms.cjs');
const alarmFile = () => path.join(app.getPath('userData'), 'alarm-settings.json');
let alarmSettings = {};
// 발화 기록은 디스크(alarm-fired.json)에도 남겨서 앱을 껐다 켜도 같은 알람이 또 울리지 않는다.
// 스케줄러는 마지막으로 확인한 분 이후를 모두 훑어, 앱이 꺼져 있었거나 컴퓨터가 잠들어 있던 동안 지난 알람 중
// 최근 MISSED_WINDOW_MIN(10)분 안의 것만 "놓친 알람" 카드로 한 번 보여 준다(alarms.cjs).
const scheduler = alarms.createScheduler({ fired: new Set() });
const firedFile = () => path.join(app.getPath('userData'), 'alarm-fired.json');
let firedSaved = '';
function persistFired() {
  const json = JSON.stringify([...scheduler.fired]);
  if (json !== firedSaved) { firedSaved = json; alarms.saveFired(firedFile(), scheduler.fired); }
}

const KIND_LABEL = { lunch: '점심', leave: '퇴근' };
function runAlarmCheck(now = new Date()) {
  for (const a of scheduler.check(alarmSettings, now)) {
    if (a.type === 'card') createBreakTimeWindow(a.card, a.alarm);
    else {
      if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('show-toast', a.text || `${KIND_LABEL[a.kind]} ${a.minutes}분 전이에요!`, a.ms);
      playTrayBeat();
    }
  }
  persistFired();
}

function startBreakTimeChecker() {
  if (breakTimeChecker) return;
  breakTimeChecker = setInterval(runAlarmCheck, 1000);
}

// 저장된 알람 설정 복원 + 체커 시작(창이 뜨기 전에 한 번)
function restoreAlarms() {
  alarmSettings = alarms.loadAlarmSettings(alarmFile());
  for (const k of alarms.loadFired(firedFile())) scheduler.fired.add(k);
  firedSaved = JSON.stringify([...scheduler.fired]);
  startBreakTimeChecker();
  // 절전에서 깨어나면 바로 확인한다(잠든 동안 지난 알람이 최근 N분 안이면 "놓친 알람"으로 보여 준다)
  try { powerMonitor.on('resume', () => runAlarmCheck()); } catch { /* 전원 이벤트를 못 받는 환경이어도 1초 타이머는 돈다 */ }
}

// 렌더러가 보낸 설정을 반영한다(키가 없는 설정은 기존 값을 지우지 못한다). 바뀌면 디스크에도 저장한다.
function applyAlarmSettings(settings) {
  const { settings: next, changed } = alarms.mergeAlarmSettings(alarmSettings, settings);
  if (changed) { alarmSettings = next; alarms.saveAlarmSettings(alarmFile(), alarmSettings); }
  startBreakTimeChecker();
}

function stopBreakTimeChecker() {
  if (breakTimeChecker) { clearInterval(breakTimeChecker); breakTimeChecker = null; }
}

ipcMain.handle('get-all-displays', () => {
  const displays = screen.getAllDisplays();
  const minX = Math.min(...displays.map(d => d.bounds.x));
  const minY = Math.min(...displays.map(d => d.bounds.y));
  const maxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
  const maxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
  return {
    all: { minX, minY, width: maxX - minX, height: maxY - minY },
    monitors: displays.map((d, i) => ({
      id: i,
      displayId: d.id,
      isPrimary: d.id === screen.getPrimaryDisplay().id,
      label: 'Monitor ' + (i + 1) + (d.id === screen.getPrimaryDisplay().id ? ' (Primary)' : ''),
      bounds: d.bounds
    }))
  };
});

// 알람 테스트: 설정창에서 입력한 이름·설명이 반영된 카드로 미리 본다(없으면 기본 카드)
ipcMain.on('test-break-time', (_e, type, info) => {
  createBreakTimeWindow(type, type === 'alarm' && info && typeof info === 'object' ? alarms.cardInfo(info) : undefined);
});
