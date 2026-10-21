const { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage, shell } = require('electron');
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
function markFlag(name) {
  try { fs.writeFileSync(flagsFile(), JSON.stringify({ ...readFlags(), [name]: true })); } catch {}
}

const CLOSE_NOTICE = '버디는 계속 놀고 있어요. 완전히 끄려면 트레이 아이콘 → 앱 종료';

// 설정창을 처음 X로 닫을 때 버디 위에 한 번만 알려 준다. 버디가 숨겨져 있으면 안 보이므로 다음 기회로 미룬다.
function maybeShowCloseNotice() {
  if (isQuitting || readFlags().closeNoticeShown) return;
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
  petWindow.webContents.send('show-toast', CLOSE_NOTICE, 6000);
  markFlag('closeNoticeShown');
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus(); return;
  }
  settingsWindow = new BrowserWindow({
    width: 900, height: 700,
    minWidth: 700, minHeight: 580,
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
  settingsWindow.loadURL(getPageURL('/settings'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('close', () => { settingsWindow = null; maybeShowCloseNotice(); });
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  petWindow = new BrowserWindow({
    width: 190, height: 190,
    x: width - 230, y: height - 230,
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

// ★ 시스템 트레이 생성
function createTray() {
  // 아이콘 경로 — 패키징 후에는 extraResources에서 로드
  const iconPaths = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'public', 'icon.png'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'public', 'icon.png'),
        path.join(__dirname, 'public', 'icon.png'),
      ]
    : [path.join(__dirname, 'public', 'icon.png')];

  let icon = nativeImage.createEmpty();
  for (const p of iconPaths) {
    try {
      const candidate = nativeImage.createFromPath(p);
      if (!candidate.isEmpty()) { icon = candidate; break; }
    } catch {}
  }

  // 16x16으로 리사이즈 (트레이 아이콘 크기)
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(icon);
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

// ★ 앱 시작시 설정 동기화 - PetPage에서 설정 로드 후 호출
ipcMain.on('sync-settings', (_e, settings) => {
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
