const { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage, nativeTheme, systemPreferences, shell } = require('electron');
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
let tray = null;
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
ipcMain.on('intro-seen', () => { freshInstall = false; markFlag('introSeenVersion', app.getVersion()); });
const needsIntro = () => readFlags().introSeenVersion !== app.getVersion();
// 완전 새 설치(설정 폴더에 flags.json이 아직 없음)인지는 앱이 뜰 때 한 번만 본다. 입구 화면은 새 설치면 "처음 왔어요"를, 새 버전으로 올린 기존 사용자면 "오늘도 함께해요"를 강조한다.
let freshInstall = false;
const entranceKind = () => (freshInstall ? 'new' : needsIntro() ? 'old' : '');

const CLOSE_NOTICE = '버디는 계속 놀고 있어요. 완전히 끄려면 트레이 아이콘 → 앱 종료';

// 설정창을 처음 X로 닫을 때 버디 위에 한 번만 알려 준다. 버디가 숨겨져 있으면 안 보이므로 다음 기회로 미룬다.
function maybeShowCloseNotice() {
  if (isQuitting || readFlags().closeNoticeShown) return;
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
  petWindow.webContents.send('show-toast', CLOSE_NOTICE, 6000);
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
  settingsWindow.on('close', () => { clearTimeout(sizeTimer); if (userResized) saveWindowSize(win); settingsWindow = null; endOnboarding('cancel'); maybeShowCloseNotice(); });
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
  petWindow.loadURL(getPageURL('/pet'));
  petWindow.on('closed', () => { petWindow = null; stopAlwaysOnTopKeepAlive(); });
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
function playTrayBeat(force = false) {
  if (!tray || trayBeating || isQuitting) return;
  if (!force) { try { if (systemPreferences.getAnimationSettings().prefersReducedMotion) return; } catch {} }
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

  const contextMenu = Menu.buildFromTemplate([
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
      label: '⏻ 앱 종료',
      click: () => requestQuit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  // 트레이 더블클릭 → 설정창
  tray.on('double-click', () => createSettingsWindow());
  // 트레이 클릭 (Windows) → 설정창
  tray.on('click', () => createSettingsWindow());
}

// ★ 종료 요청은 전부 requestQuit()으로 모은다
// isQuitting → 설정창 저장 → 모든 창·트레이 정리 → app.quit. 어디선가 막혀도 2초 뒤에는 app.exit으로 끝낸다.
function stopAllTimers() {
  stopAlwaysOnTopKeepAlive();
  stopYarTimer();
  stopBreakTimeChecker();
  stopPhotoRotation();
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
  settingsWindow = null; petWindow = null; yarWindow = null; breakTimeWindow = null;
  trayBeatTimers.forEach(clearTimeout);
  if (tray) { try { tray.destroy(); } catch {} tray = null; }
  app.quit();
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
    app.on('activate', () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
      else { settingsWindow.show(); settingsWindow.focus(); }
    });
    createSettingsWindow();
    createPetWindow();
    createTray();
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
ipcMain.on('resize-pet-window', (_e, { width, height }) => {
  if (petWindow && !petWindow.isDestroyed()) {
    const [x, y] = petWindow.getPosition();
    petWindow.setBounds({ x, y, width: Math.round(width), height: Math.round(height) }, false);
  }
});
ipcMain.on('move-pet-window', (_e, { x, y }) => {
  if (petWindow && !petWindow.isDestroyed() && !petWindow._dragging) {
    petWindow.setPosition(Math.round(x), Math.round(y), false);
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
// 안내 중에는 실제 버디가 설정창 옆에 제자리로 서 있고, 설정창이 고른 값을 바로 받는다. 끝나면 그 자리에서 배회를 시작하고, 중간에 나가면 원래 상태(숨김/기존 위치)로 돌아간다.
let onboarding = null;   // { wasVisible, pos } — 안내 중에만 있다
let onboardingBeatTimers = [];
function buddySpot() {
  const sb = settingsWindow.getBounds();
  const wa = screen.getDisplayMatching(sb).workArea;   // 설정창이 있는 모니터 안
  const gap = 16;
  let x;
  if (sb.x + sb.width + gap + PET_WIN_W <= wa.x + wa.width) x = sb.x + sb.width + gap;
  else if (sb.x - gap - PET_WIN_W >= wa.x) x = sb.x - gap - PET_WIN_W;
  else { settingsWindow.setPosition(wa.x, sb.y); x = wa.x + wa.width - PET_WIN_W - 8; }   // 옆 공간이 없으면 설정창을 왼쪽으로 붙인다
  let y = sb.y + sb.height - PET_WIN_H - 24;
  x = Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - PET_WIN_W));
  y = Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - PET_WIN_H));
  return { x, y };
}
function endOnboarding(kind) {
  const ob = onboarding;
  if (!ob) return;
  onboarding = null;
  onboardingBeatTimers.forEach(clearTimeout); onboardingBeatTimers = [];
  const pw = petWindow;
  if (!pw || pw.isDestroyed()) return;
  if (kind === 'cancel') {
    pw.setPosition(ob.pos[0], ob.pos[1], false);
    pw.webContents.send('pet-hold', { on: false, x: ob.pos[0], y: ob.pos[1] });
    if (!ob.wasVisible) { pw.hide(); stopAlwaysOnTopKeepAlive(); }
  } else {
    const [x, y] = pw.getPosition();
    pw.webContents.send('pet-hold', { on: false, x, y });
  }
}
ipcMain.handle('onboarding-start', async () => {
  if (!settingsWindow || settingsWindow.isDestroyed()) return false;
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();   // 새 설치에서 아직 없으면 지금 만든다
  const pw = petWindow;
  if (pw.webContents.isLoading()) await new Promise(r => pw.webContents.once('did-finish-load', r));
  if (!onboarding) onboarding = { wasVisible: pw.isVisible(), pos: pw.getPosition() };
  const spot = buddySpot();
  pw.setPosition(spot.x, spot.y, false);
  pw.show(); resumeAlwaysOnTopKeepAlive();
  pw.webContents.send('pet-hold', { on: true, x: spot.x, y: spot.y });
  return true;
});
ipcMain.on('onboarding-end', (_e, kind) => {
  endOnboarding(kind === 'done' ? 'done' : 'cancel');
  if (kind === 'done') {
    markFlag('closeNoticeShown');   // 마지막 화면에서 이미 알려 줬으니 닫을 때 안내 토스트는 다시 띄우지 않는다
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  }
});
ipcMain.on('pet-interaction', (_e, kind) => {
  if (onboarding && settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('onboarding-event', kind);
});
ipcMain.on('onboarding-tray-beat', (_e, times) => {
  onboardingBeatTimers.forEach(clearTimeout); onboardingBeatTimers = [];
  let reduced = false;
  try { reduced = systemPreferences.getAnimationSettings().prefersReducedMotion; } catch {}
  const n = reduced ? 1 : Math.max(1, Math.min(4, Number(times) || 3));
  for (let i = 0; i < n; i++) onboardingBeatTimers.push(setTimeout(() => playTrayBeat(true), 300 + i * 900));
});

// ★ 고양이 우클릭 → 설정창 열기
ipcMain.on('pet-right-click', () => {
  createSettingsWindow();
});

// ★ 야르타임 IPC
ipcMain.handle('get-pet-position', () => {
  if (!petWindow || petWindow.isDestroyed()) return null;
  const [x, y] = petWindow.getPosition();
  return { x, y };
});
ipcMain.on('set-yar-timer', (_e, intervalMinutes) => {
  setYarMinutes(intervalMinutes);
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

// ★ 앱 시작시 설정 동기화 - PetPage에서 설정 로드 후 호출
ipcMain.on('sync-settings', (_e, settings) => {
  configurePhotoRotation(settings);
  // 버디 창이 2초 폴링을 기다리지 않고 바로 새 설정을 읽게 한다
  if (petWindow && !petWindow.isDestroyed()) { try { petWindow.webContents.send('settings-changed'); } catch {} }
  // 야르타임 설정 동기화
  setYarMinutes(settings.yarEnabled && settings.yarInterval > 0 ? settings.yarInterval : 0);
  if (typeof settings.alwaysOnTop === 'boolean' && settings.alwaysOnTop !== alwaysOnTopFlag) {
    setPetAlwaysOnTop(settings.alwaysOnTop);
  }
  // 점심/퇴근 알림 동기화
  startBreakTimeChecker(settings);
});

ipcMain.on('yar-now', () => {
  createYarWindow();
});

// ★ 점심/퇴근 알림 윈도우
let breakTimeWindow = null;
let breakTimeChecker = null;
let lastBreakTrigger = { lunch: '', leave: '' };

function createBreakTimeWindow(type) {
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
  breakTimeWindow.loadURL(getPageURL(`/breaktime?type=${type}`));

  // 생성 시점의 창을 캡처해 그 창만 닫는다 (연속 생성 시 새 창이 닫히는 것 방지)
  const w = breakTimeWindow;
  setTimeout(() => {
    if (w && !w.isDestroyed()) w.close();
    if (breakTimeWindow === w) breakTimeWindow = null;
  }, 3000);
}

function getPreAlertTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m - minutes;
  const ph = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const pm = ((total % 1440) + 1440) % 1440 % 60;
  return `${String(ph).padStart(2, '0')}:${String(pm).padStart(2, '0')}`;
}

function startBreakTimeChecker(settings) {
  if (breakTimeChecker) clearInterval(breakTimeChecker);

  breakTimeChecker = setInterval(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toDateString();

    // 점심/퇴근 알림 (점심·퇴근 켜짐/미리 알림 분은 따로 관리. 마이그레이션 전 설정은 예전 키로 대체)
    const lunchOn = settings && (settings.lunchEnabled ?? settings.breakTimeEnabled);
    const leaveOn = settings && (settings.leaveEnabled ?? settings.breakTimeEnabled);
    const lunchPre = (settings && (settings.lunchPreAlertMinutes || settings.preAlertMinutes)) || 5;
    const leavePre = (settings && (settings.leavePreAlertMinutes || settings.preAlertMinutes)) || 5;

    if (lunchOn && settings.lunchTime) {
      if (currentTime === settings.lunchTime && lastBreakTrigger.lunch !== today) {
        lastBreakTrigger.lunch = today;
        createBreakTimeWindow('lunch');
      }
      // 미리 알림
      const key = `pre_lunch_${today}`;
      if (currentTime === getPreAlertTime(settings.lunchTime, lunchPre) && !lastBreakTrigger[key]) {
        lastBreakTrigger[key] = today;
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('show-toast', `점심 ${lunchPre}분 전이에요!`);
        }
        playTrayBeat();
      }
    }
    if (leaveOn && settings.leaveTime) {
      if (currentTime === settings.leaveTime && lastBreakTrigger.leave !== today) {
        lastBreakTrigger.leave = today;
        createBreakTimeWindow('leave');
      }
      const key = `pre_leave_${today}`;
      if (currentTime === getPreAlertTime(settings.leaveTime, leavePre) && !lastBreakTrigger[key]) {
        lastBreakTrigger[key] = today;
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('show-toast', `퇴근 ${leavePre}분 전이에요!`);
        }
        playTrayBeat();
      }
    }

    // 일반 알람
    if (settings && settings.alarms) {
      settings.alarms.forEach(alarm => {
        if (!alarm.enabled) return;
        const key = `alarm_${alarm.id}_${today}`;
        if (currentTime === alarm.time && !lastBreakTrigger[key]) {
          lastBreakTrigger[key] = today;
          createBreakTimeWindow('alarm');
        }
      });
    }
  }, 1000);
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

ipcMain.on('test-break-time', (_e, type) => {
  createBreakTimeWindow(type);
});
