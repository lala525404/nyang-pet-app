const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function getPageURL(hash) {
  if (isDev) return `http://localhost:5173/#${hash}`;
  return `file://${path.join(__dirname, 'dist', 'index.html')}#${hash}`;
}

let settingsWindow = null;
let petWindow = null;
let yarWindow = null;
let tray = null;
let forceQuit = false;
let alwaysOnTopInterval = null;
let yarTimer = null;

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
  if (!intervalMinutes) return;
  yarTimer = setInterval(() => {
    createYarWindow();
  }, intervalMinutes * 60 * 1000);
}

function stopYarTimer() {
  if (yarTimer) { clearInterval(yarTimer); yarTimer = null; }
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
    backgroundColor: '#f7f3ee',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  settingsWindow.loadURL(getPageURL('/settings'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('close', () => { settingsWindow = null; });
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
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadURL(getPageURL('/pet'));
  petWindow.on('closed', () => { petWindow = null; stopAlwaysOnTopKeepAlive(); });
  startAlwaysOnTopKeepAlive();
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
        if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); startAlwaysOnTopKeepAlive(); }
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
      click: () => {
        forceQuit = true;
        stopAlwaysOnTopKeepAlive();
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy();
        if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
        if (tray) { tray.destroy(); tray = null; }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  // 트레이 더블클릭 → 설정창
  tray.on('double-click', () => createSettingsWindow());
  // 트레이 클릭 (Windows) → 설정창
  tray.on('click', () => createSettingsWindow());
}

// ★ 최대 인스턴스 수 제한 (2개까지)
const INSTANCE_KEY = 'choeae-instance-count';
const MAX_INSTANCES = 2;

const gotLock = app.requestSingleInstanceLock({ instanceCount: Date.now() });

// 인스턴스 카운트를 파일로 관리
const instanceFile = path.join(app.getPath('userData'), '.instances');
const fs = require('fs');

function getInstanceCount() {
  try {
    const data = JSON.parse(fs.readFileSync(instanceFile, 'utf8'));
    // 5초 이상 된 인스턴스는 죽은 것으로 간주
    const alive = data.filter((t) => Date.now() - t < 5000);
    return alive.length;
  } catch { return 0; }
}

function registerInstance() {
  try {
    let data = [];
    try { data = JSON.parse(fs.readFileSync(instanceFile, 'utf8')); } catch {}
    data.push(Date.now());
    fs.writeFileSync(instanceFile, JSON.stringify(data));
  } catch {}
}

function unregisterInstance() {
  try { fs.unlinkSync(instanceFile); } catch {}
}

app.whenReady().then(() => {
  app.on('activate', () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
    else { settingsWindow.show(); settingsWindow.focus(); }
  });
  createSettingsWindow();
  createPetWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (forceQuit) { app.quit(); return; }
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
});

app.on('before-quit', (e) => {
  unregisterInstance();
  if (!forceQuit) e.preventDefault();
  else {
    stopYarTimer();
    if (yarWindow && !yarWindow.isDestroyed()) yarWindow.destroy();
  }
});

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('quit-app', () => {
  forceQuit = true;
  stopAlwaysOnTopKeepAlive();
  stopYarTimer();
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy();
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  if (tray) { tray.destroy(); tray = null; }
  app.quit();
});

ipcMain.on('open-settings', () => createSettingsWindow());

ipcMain.on('show-pet', () => {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); startAlwaysOnTopKeepAlive(); }
  else createPetWindow();
});
ipcMain.on('hide-pet', () => {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.hide(); stopAlwaysOnTopKeepAlive(); }
});
ipcMain.on('set-always-on-top', (_e, flag) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setAlwaysOnTop(!!flag, 'screen-saver');
    if (flag) startAlwaysOnTopKeepAlive(); else stopAlwaysOnTopKeepAlive();
  }
});
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
  if (intervalMinutes > 0) startYarTimer(intervalMinutes);
  else stopYarTimer();
});

// ★ 앱 시작시 설정 동기화 - PetPage에서 설정 로드 후 호출
ipcMain.on('sync-settings', (_e, settings) => {
  // 야르타임 설정 동기화
  if (settings.yarEnabled && settings.yarInterval > 0) {
    startYarTimer(settings.yarInterval);
  } else {
    stopYarTimer();
  }
});

ipcMain.on('yar-now', () => {
  createYarWindow();
});
