// 자동 업데이트 상태(메인의 updater.cjs가 보낸다)
export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'none' | 'available' | 'blocked' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
  error?: string;
  errorKind?: 'notfound' | 'network' | 'other';
  reason?: string | null;
  pendingInstall?: boolean;
  notes?: string[];   // available일 때: 새 버전에서 달라지는 점의 제목들(릴리스 노트에서 뽑은 일반 텍스트, 최대 4개). 못 뽑았으면 빈 배열
}

// 안내 카드(펫 옆): 메인이 카드 창에 알려 주는 내용. payload는 카드 종류마다 다르다(메인이 정한 값만 온다)
export type NoticeKind = 'whatsnew' | 'update' | 'brief';
export interface NoticeItem { id: number; kind: NoticeKind; payload: { version?: string; notes?: string[]; force?: boolean; replay?: boolean; fake?: boolean } | null }
export type NoticeAction = 'ok' | 'later' | 'close' | 'update' | 'details';

// 컴퓨터를 켜면 자동 실행(OS의 실제 상태). supported가 false면 note에 이유가 있다
export interface LoginItemState { supported: boolean; enabled: boolean; reason: string | null; note: string }

// 초집중 모드 상태(메인이 소유·저장): 기준 위치(anchor)는 버디 창이 알린다
export interface FocusModeState { enabled: boolean; seconds: boolean; anchor: { x: number; y: number } | null }

// 날씨(메인의 weather.cjs가 Open-Meteo 응답을 정리한 값). hours[].at은 그 시간의 시각(ms)
export interface WeatherHour { at: number; temp: number; feels: number; pop: number | null; code: number; wind: number | null }
export interface WeatherDay { at: number; max: number | null; min: number | null; pop: number | null }   // at: 그날 0시(ms), pop: 강수 확률 최대(%)
export interface WeatherData { temp: number; feels: number; code: number; wind: number | null; hours: WeatherHour[]; days?: WeatherDay[] }

// 펫 우클릭 퀵 메뉴: 퀵 창이 메인에 보내는 동작, 설정창을 특정 위치로 여는 목적지
export type QuickAction = 'open' | 'weather-setup' | 'alarm-settings' | 'alarm-calendar' | 'quit';   // alarm-calendar: arg { weekStart }로 설정창 알람 캘린더를 그 주로 연다
// 메인이 계산해서 보내는 퀵 메뉴 배치. 호: 버튼 중심(창 안 좌표)과 펫 중심에서 버튼까지의 벡터, 카드·종료 안내 상자. 알약 바: 펫 위/아래만.
export interface QuickBox { x: number; y: number; w: number; h: number }
export type QuickLayout =
  | { mode: 'arc'; dir: 'up' | 'down' | 'left' | 'right'; bounds: { x: number; y: number; width: number; height: number }; pet: { x: number; y: number };
      buttons: { x: number; y: number; dx: number; dy: number }[]; card: QuickBox | null; hint: QuickBox; radius: number }
  | { mode: 'bar'; side: 'above' | 'below'; maxWidth?: number };
export interface SettingsTarget { page?: 'home' | 'alarm'; focus?: 'weather-city'; week?: string }
export type QuickAlarmSettings = import('./utils/quickAlarms').QuickAlarmSettings;

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
  getWeather: (lat: number, lon: number) => Promise<{ data: WeatherData; stale: boolean; at: number } | null>;
  quickClose: () => void;
  setPetRegions: (regions: unknown[]) => void;
  quickInit: (count: number) => void;
  quickRegions: (regions: unknown[]) => void;
  quickCard: (size: { width: number; height: number } | null) => void;
  quickResize: (width: number, height: number) => void;
  onQuickLayout: (cb: (layout: QuickLayout) => void) => () => void;
  onQuickOpen: (cb: () => void) => () => void;
  onQuickClosing: (cb: () => void) => () => void;
  quickAction: (action: QuickAction, arg?: { weekStart: string }) => void;
  getQuickAlarmSettings: () => Promise<QuickAlarmSettings>;
  noticeGet: () => Promise<NoticeItem | null>;
  noticeSkip: () => void;
  noticeResize: (width: number, height: number) => void;
  noticeRegions: (regions: unknown[]) => void;
  noticeAction: (action: NoticeAction) => void;
  onNoticeLayout: (cb: (layout: { side: 'above' | 'below' }) => void) => () => void;
  onNoticeOpen: (cb: () => void) => () => void;
  onNoticeClosing: (cb: () => void) => () => void;
  showWhatsNew: () => void;
  showUpdateNews: () => void;
  onQuickState: (cb: (open: boolean) => void) => () => void;
  onSettingsGoto: (cb: (target: SettingsTarget) => void) => () => void;
  takeSettingsGoto: () => Promise<SettingsTarget | null>;
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
