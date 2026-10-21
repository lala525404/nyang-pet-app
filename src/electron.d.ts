interface ElectronAPI {
  quitApp: () => void;
  openSettings: () => void;
  showPet: () => void;
  hidePet: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
  resizePetWindow: (width: number, height: number) => void;
  movePetWindow: (x: number, y: number) => void;
  startDrag: (mouseX: number, mouseY: number) => void;
  endDrag: () => void;
  callPet: () => void;
  resetPetPosition: () => void;
  petRightClick: () => void;
  platform: string;
  setYarTimer: (intervalMinutes: number) => void;
  yarNow: () => void;
  testBreakTime: (type: string) => void;
  syncSettings: (settings: Record<string, unknown>) => void;
  onFlushSettings: (cb: () => void) => () => void;
  settingsFlushed: () => void;
  getPhotoState: () => Promise<{ index: number; count: number; intervalSec: number }>;
  onPhotoState: (cb: (state: { index: number; count: number; intervalSec: number }) => void) => () => void;
  onShowToast: (cb: (msg: string, ms?: number) => void) => () => void;
  getAllDisplays: () => Promise<{ all: { minX: number; minY: number; width: number; height: number }; monitors: { id: number; displayId: number; isPrimary: boolean; label: string; bounds: { x: number; y: number; width: number; height: number } }[] }>;
  getPetPosition: () => Promise<{x:number,y:number}|null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
