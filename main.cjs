const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function getPageURL(hash) {
  if (isDev) return `http://localhost:5173/#${hash}`;
  return `file://${path.join(__dirname, 'dist', 'index.html')}#${hash}`;
}

let settingsWindow = null;
let petWindow = null;
let tray = null;
let forceQuit = false;
let alwaysOnTopInterval = null;

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

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus(); return;
  }
  settingsWindow = new BrowserWindow({
    width: 900, height: 700,
    minWidth: 700, minHeight: 580,
    frame: true, resizable: true, show: false,
    title: '일하기싫냥? – 설정',
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
  tray.setToolTip('일하기싫냥?');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '⚙️ 설정 열기',
      click: () => createSettingsWindow(),
    },
    {
      label: '📣 고양이 부르기',
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
      label: '🐱 고양이 보이기',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); startAlwaysOnTopKeepAlive(); }
        else createPetWindow();
      },
    },
    {
      label: '🙈 고양이 숨기기',
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

app.on('before-quit', (e) => { if (!forceQuit) e.preventDefault(); });

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('quit-app', () => {
  forceQuit = true;
  stopAlwaysOnTopKeepAlive();
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

  const [startWinX, startWinY] = petWindow.getPosition();
  const startCursor = screen.getCursorScreenPoint();
  const offsetX = startCursor.x - startWinX;
  const offsetY = startCursor.y - startWinY;

  // 마우스 업 감지용 폴링
  let lastX = startCursor.x;
  let lastY = startCursor.y;

  const interval = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) { clearInterval(interval); return; }
    const cursor = screen.getCursorScreenPoint();

    // 마우스가 움직이지 않으면 건너뜀
    if (cursor.x === lastX && cursor.y === lastY) return;
    lastX = cursor.x;
    lastY = cursor.y;

    const newX = Math.round(cursor.x - offsetX);
    const newY = Math.round(cursor.y - offsetY);
    petWindow.setPosition(newX, newY, false);
  }, 8);

  ipcMain.once('end-drag', () => {
    clearInterval(interval);
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow._dragging = false;
    }
  });
});

// ★ 고양이 우클릭 → 설정창 열기
ipcMain.on('pet-right-click', () => {
  createSettingsWindow();
});
