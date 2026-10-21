const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quitApp:          () => ipcRenderer.send('quit-app'),
  openSettings:     () => ipcRenderer.send('open-settings'),
  showPet:          () => ipcRenderer.send('show-pet'),
  hidePet:          () => ipcRenderer.send('hide-pet'),
  setAlwaysOnTop:   (flag) => ipcRenderer.send('set-always-on-top', flag),
  resizePetWindow:  (width, height) => ipcRenderer.send('resize-pet-window', { width, height }),
  movePetWindow:    (x, y) => ipcRenderer.send('move-pet-window', { x, y }),
  startDrag:        (mouseX, mouseY) => ipcRenderer.send('start-drag', { mouseX, mouseY }),
  endDrag:          () => ipcRenderer.send('end-drag'),
  callPet:          () => ipcRenderer.send('call-pet'),
  resetPetPosition: () => ipcRenderer.send('reset-pet-position'),
  petRightClick:    () => ipcRenderer.send('pet-right-click'),
  platform:         process.platform,
  // ★ 야르타임
  setYarTimer:      (intervalMinutes) => ipcRenderer.send('set-yar-timer', intervalMinutes),
  yarNow:           () => ipcRenderer.send('yar-now'),
  testBreakTime:    (type) => ipcRenderer.send('test-break-time', type),
  syncSettings:     (settings) => ipcRenderer.send('sync-settings', settings),
  getAllDisplays:   () => ipcRenderer.invoke('get-all-displays'),
  getPetPosition:     () => ipcRenderer.invoke('get-pet-position'),
  // ★ 종료 직전 저장: 메인이 요청하면 설정창이 저장하고 끝났다고 답한다
  onFlushSettings:  (cb) => {
    const handler = () => cb();
    ipcRenderer.on('flush-settings', handler);
    return () => ipcRenderer.removeListener('flush-settings', handler);
  },
  settingsFlushed:  () => ipcRenderer.send('settings-flushed'),
  onShowToast:      (cb) => {
    ipcRenderer.removeAllListeners('show-toast');
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('show-toast', handler);
    return () => ipcRenderer.removeListener('show-toast', handler);
  },
});
