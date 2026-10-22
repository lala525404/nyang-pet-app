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
  testBreakTime:    (type, info) => ipcRenderer.send('test-break-time', type, info),
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
  // ★ 사진 교체: 메인이 하나뿐인 교체 시계를 돌리고, 설정창 미리보기와 버디가 같은 값을 받는다
  introSeen:        () => ipcRenderer.send('intro-seen'),
  // ★ 처음 안내: 마지막 "버디 풀어놓기"는 설정창을 닫는다
  onboardingFinish: () => ipcRenderer.send('onboarding-finish'),
  getAlertState:    () => ipcRenderer.invoke('get-alert-state'),
  onAlertState:     (cb) => {
    const handler = (_e, active) => cb(!!active);
    ipcRenderer.on('alert-state', handler);
    return () => ipcRenderer.removeListener('alert-state', handler);
  },
  onSettingsChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('settings-changed', handler);
    return () => ipcRenderer.removeListener('settings-changed', handler);
  },
  getPhotoState:    () => ipcRenderer.invoke('get-photo-state'),
  onPhotoState:     (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('photo-state', handler);
    return () => ipcRenderer.removeListener('photo-state', handler);
  },
  onShowBubble:     (cb) => {
    const handler = (_e, text, ms) => cb(text, ms);
    ipcRenderer.on('show-bubble', handler);
    return () => ipcRenderer.removeListener('show-bubble', handler);
  },
  onShowToast:      (cb) => {
    ipcRenderer.removeAllListeners('show-toast');
    const handler = (_e, msg, ms) => cb(msg, ms);
    ipcRenderer.on('show-toast', handler);
    return () => ipcRenderer.removeListener('show-toast', handler);
  },
});
