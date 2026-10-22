// 자동 업데이트 상태(메인의 updater.cjs가 보낸다)
export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'none' | 'available' | 'blocked' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
  error?: string;
  reason?: string | null;
  pendingInstall?: boolean;
}

// 컴퓨터를 켜면 자동 실행(OS의 실제 상태). supported가 false면 note에 이유가 있다
export interface LoginItemState { supported: boolean; enabled: boolean; reason: string | null; note: string }

// 초집중 모드 상태(메인이 소유·저장): 기준 위치(anchor)는 버디 창이 알린다
export interface FocusModeState { enabled: boolean; seconds: boolean; anchor: { x: number; y: number } | null }

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
  testBreakTime: (type: string, info?: Record<string, unknown>) => void;
  syncSettings: (settings: Record<string, unknown>) => void;
  onFlushSettings: (cb: () => void) => () => void;
  settingsFlushed: () => void;
  introSeen: () => void;
  onboardingFinish: () => void;
  getAlertState: () => Promise<boolean>;
  onAlertState: (cb: (active: boolean) => void) => () => void;
  onSettingsChanged: (cb: () => void) => () => void;
  getPhotoState: () => Promise<{ index: number; count: number; intervalSec: number }>;
  onPhotoState: (cb: (state: { index: number; count: number; intervalSec: number }) => void) => () => void;
  onShowBubble: (cb: (text: string, ms?: number) => void) => () => void;
  onShowToast: (cb: (msg: string, ms?: number) => void) => () => void;
  getAllDisplays: () => Promise<{ all: { minX: number; minY: number; width: number; height: number }; monitors: { id: number; displayId: number; isPrimary: boolean; label: string; bounds: { x: number; y: number; width: number; height: number } }[] }>;
  getPetPosition: () => Promise<{x:number,y:number}|null>;
  getFocusMode: () => Promise<FocusModeState>;
  setFocusMode: (change: { enabled?: boolean; seconds?: boolean }) => Promise<FocusModeState>;
  reportFocusAnchor: (x: number, y: number) => void;
  setPetInteractive: (interactive: boolean) => void;
  onFocusMode: (cb: (state: FocusModeState) => void) => () => void;
  getLoginItem: () => Promise<LoginItemState>;
  setLoginItem: (enabled: boolean) => Promise<LoginItemState>;
  getUpdateState: () => Promise<UpdateState>;
  checkForUpdates: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<UpdateState>;
  installUpdate: () => Promise<boolean | 'deferred'>;
  onUpdateState: (cb: (state: UpdateState) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
