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
  getPetPosition:     () => ipcRenderer.invoke('get-pet-position'),
});
