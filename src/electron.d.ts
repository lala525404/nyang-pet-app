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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
