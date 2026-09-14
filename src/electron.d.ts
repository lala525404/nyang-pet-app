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
  getAllDisplays: () => Promise<{ minX: number; minY: number; width: number; height: number }>;
  onShowToast: (cb: (msg: string) => void) => void;
  getPetPosition: () => Promise<{x:number,y:number}|null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
