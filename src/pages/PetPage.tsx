import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import '../styles/pet.css';
import { Bell } from 'lucide-react';
import CatEmoji from '../components/CatEmoji';
import { usePhotoState } from '../hooks/usePhotoState';
import { BUBBLE_GAP_RANGE, BUBBLE_SHOW_RANGE, cleanBubbleMessages, clampTo, clockText, readStoredSettings, isFreshWindow } from '../utils/settings';
import type { CustomShape } from '../components/CatEmoji';
import { getAnimal } from '../data/animals';
import FocusClock from '../components/FocusClock';
import FocusLeaveLeft from '../components/FocusLeaveLeft';
import { FOCUS_PAUSE_MS, FOCUS_TICK_MS, focusBounds, isOverPet, monitorRectAt, nextFocusTarget, stepToward } from '../utils/focusMode';
import type { FocusModeState } from '../electron';
import type { WeatherSnapshot } from '../utils/weatherHello';
import { helloCandidates, pickHello } from '../utils/weatherHello';
import { createShuffleBag, pickRollKind } from '../utils/bubbleRoll';
import type { RollKind, ShuffleBag } from '../utils/bubbleRoll';
import { newPhrasesFor } from '../data/bubblePhrases';
import type { HelloKind } from '../data/weatherHello';
import { cityById } from '../data/cities';

// ── 시간대별 멘트 ─────────────────────────────────────────────────
const TIME_MESSAGES: Record<string, string[]> = {
  dawn:      ['새벽에도 일해요? 😿','자야지... 🌙','좀비 됐어요?'],
  morning:   ['굿모닝이에요! ☀️','아침이에요!','오늘도 화이팅 💪','아침밥 먹었어요? 🍳','커피 한 잔 ☕'],
  commute:   ['출근길 조심해요 🚇','지각하면 안 돼요 😅','버스 놓치지 마요 🚌'],
  work:      ['아직도 일해요?','쉬어요 🐾','커피 마셔요 ☕','눈 좀 쉬게 해요 👀','허리 펴요!','물 마셨어요? 💧'],
  lunch:     ['점심시간이에요! 🍱','오늘 점심은 뭐예요?','라면이다! 🍜','삼겹살 어때요? 🥩'],
  afternoon: ['오후도 힘내요 💪','졸려요... ☕','조금만 더 하면 퇴근!','간식 먹어요 🍫'],
  preLeave:  ['곧 퇴근이에요! 🎉','퇴근까지 얼마 안 남았어요!','야근은 하지 마요 🙏'],
  leave:     ['퇴근 시간이에요! 🏃','빨리 가요!','퇴근이다!!! 🎊','수고했어요~ 집 가요 🏠'],
  evening:   ['저녁은 먹었어요? 🍽️','쉬어요 🛋️','오늘 하루 수고했어요','이제 쉬어도 돼요 😌'],
  night:     ['야근이에요? 😿','집에 가요...','자야지 🌙'],
};

const CUSTOM_NAGS = [
  '야르~','야호~🙌','밤티~','킹받네~ 😤','크크루삥뽕','퇴근각 재는 중 🎯',
  '월급값 하자 💸','출근했으면 퇴근도 해야지','폼 미쳤다 🔥','얼마나 버틸지 감이 안온다',
  '🎯 집중각 떴다','🍗 퇴근 후 치킨 생각중','💸 월급 ON','쉬엄쉬엄 하자고 😮‍💨',
  '오늘 하루 수고 많으셨습니다 🫡','지금 몇 시인지는 알고 있죠?','진짜 집 가고 싶다 🏠',
  '커피 없으면 못 살아 ☕','오늘 점심은 뭐임? 🍱','물 마셔 인간아 💧',
  '허리 좀 펴줄래요? 🙏','눈 깜빡여 👁️','핸드폰 그만 봐 📵',
];
const CUSTOM_REACTIONS = [
  '야르~! 😳','건드리면 어떡해 😤','야호~ 🙌','킹받네 진짜 😾',
  '크크루삥뽕 🤪','폼 미쳤다 🔥','ㅋㅋㅋㅋㅋ 😹','헉 깜짝이야',
  '건들지 말랬잖아 😭','어이없네 진짜','밤티~ 🐱',
];
const CUSTOM_ESCAPE = [
  '야르~ 잡지 마 🏃','도망가는 중 💨','못 잡아 크크루삥뽕','킹받아서 도망감 😤',
];

function getSpecialMessages(): string[] {
  const now = new Date();
  const day = now.getDate();
  const weekday = now.getDay();
  const msgs: string[] = [];
  if (day === 25) msgs.push('💸 월급 ON!!!','오늘 월급날이에요! 💸','🎉 월급날이다!!!');
  if (day === 24) msgs.push('💸 내일 월급날이에요!','두근두근 내일 월급날 🎵');
  if (weekday === 5) msgs.push('🎉 불금이에요!!!','주말이 다가오고 있어요 🏖️','오늘만 버티면 주말!','🎊 드디어 금요일!!!');
  if (weekday === 1) msgs.push('😭 월요일이에요...','월요병 주의보 🚨','이번 주도 화이팅... 😔');
  return msgs;
}

const CLICK_PARTICLES = ['⭐','✨','💥','🌟','💫','❤️','🎵','🎶','🎀','🍀'];
const AMBUSH_EMOJIS = ['👻','🤖','😈','🦖','💀','🎃','👽','🦕','🧟','🤡','🦑','🐉','🔥','⚡','🌪️','🎆','🤯','🫨','👾','🦧'];

const BUBBLE_COLORS = [
  { bg: '#FF6B6B', text: '#FFFFFF' },
  { bg: '#FF9F43', text: '#FFFFFF' },
  { bg: '#54A0FF', text: '#FFFFFF' },
  { bg: '#5F27CD', text: '#FFFFFF' },
  { bg: '#00D2D3', text: '#1a1a1a' },
  { bg: '#FF9FF3', text: '#1a1a1a' },
  { bg: '#1DD1A1', text: '#FFFFFF' },
  { bg: '#FFC312', text: '#1a1a1a' },
  { bg: '#EE5A24', text: '#FFFFFF' },
  { bg: '#006266', text: '#FFFFFF' },
];

interface Particle {
  id: number; x: number; y: number; vx: number; vy: number;
  emoji: string; opacity: number; scale: number; rotation: number;
}
interface BubbleStyle { bg: string; text: string; }
interface Settings {
  distractEmoji: boolean;
  workStart: string; workEnd: string;
  animalId: string;
  customImages: (string | null)[];
  distractInterval: number;
  imageRotateInterval: number;
  imageRotateEnabled: boolean;
  bubbleEnabled: boolean;
  bubbleMessages: string[];
  bubbleShowSec: number;
  bubbleGapSec: number;
  bubbleClock: boolean;
  weatherCityId: string;
  weatherConsent: boolean;
  useCustomMode: boolean;
  customShape: CustomShape;
  moveSpeed: number;
  zone: number;
  monitor: number; // -1 = 전체 모니터, 0~ = 해당 모니터
  yarEnabled: boolean;
  yarInterval: number;
  buddyMode: string;
  size: number;
  // 알람 키: 메인이 알람을 돌릴 때 필요한 값. 시작 동기화에 빠지지 않도록 기본값에도 넣는다(켬/끔 기본은 모두 꺼짐)
  lunchEnabled: boolean;
  leaveEnabled: boolean;
  lunchTime: string;
  leaveTime: string;
  lunchPreAlertMinutes: number;
  leavePreAlertMinutes: number;
  lunchPreAlertEnabled: boolean;
  leavePreAlertEnabled: boolean;
  alarms: { id: string; time: string; enabled: boolean }[];
}

const DEFAULT_SETTINGS: Settings = {
  distractEmoji: true, workStart: '09:00', workEnd: '18:00',
  animalId: 'cat', customImages: [null, null, null],
  distractInterval: 30, imageRotateInterval: 60, imageRotateEnabled: true,
  bubbleEnabled: true, bubbleMessages: [], bubbleShowSec: 5, bubbleGapSec: 30, bubbleClock: true, weatherCityId: '', weatherConsent: false,
  useCustomMode: true, customShape: 'round', moveSpeed: 5, zone: 0, monitor: -1,
  yarEnabled: false, yarInterval: 60, buddyMode: 'buddy', size: 100,
  lunchEnabled: false, leaveEnabled: false, lunchTime: '12:00', leaveTime: '18:00',
  lunchPreAlertMinutes: 5, leavePreAlertMinutes: 5, lunchPreAlertEnabled: false, leavePreAlertEnabled: false, alarms: [],
};

// 새 설치(메인이 알려 줌)이고 저장값이 없는 동안은 하트가 기본 버디
const startSettings = (): Settings => (isFreshWindow() ? { ...DEFAULT_SETTINGS, animalId: 'heart', useCustomMode: false } : DEFAULT_SETTINGS);

function getTimeCategory(workStart: string, workEnd: string): string {
  const now = new Date();
  const total = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = workStart.split(':').map(Number);
  const [eh, em] = workEnd.split(':').map(Number);
  const startMin = sh * 60 + sm, endMin = eh * 60 + em;
  if (total < 5 * 60)            return 'dawn';
  if (total < startMin - 30)     return 'morning';
  if (total < startMin + 30)     return 'commute';
  if (total < 12 * 60)           return 'work';
  if (total < 13 * 60 + 30)      return 'lunch';
  if (total < endMin - 60)       return 'afternoon';
  if (total < endMin)            return 'preLeave';
  if (total < endMin + 60)       return 'leave';
  if (total < 21 * 60)           return 'evening';
  return 'night';
}

// ── 활동 영역 ─────────────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number; }
type DisplaysInfo = Awaited<ReturnType<NonNullable<typeof window.electronAPI>['getAllDisplays']>>;

// 버디 창은 크기를 바꾸지 않고 고정한다(main.cjs의 PET_WIN_W/H와 같은 값). 말풍선이 뜨고 질 때 창이 커지고 작아지면 버디가 25·40px씩 튀었다.
const PET_WINDOW_W = 240;
const PET_WINDOW_H = 230;

// monitor = -1 이면 전체 모니터, 아니면 해당 모니터 (없으면 전체로 폴백)
function computeArea(d: DisplaysInfo | null, monitor: number): Rect {
  if (!d) return { x: 0, y: 0, w: window.screen.width, h: window.screen.height };
  const m = monitor >= 0 ? d.monitors.find(mm => mm.displayId === monitor) : undefined;
  if (m) return { x: m.bounds.x, y: m.bounds.y, w: m.bounds.width, h: m.bounds.height };
  return { x: d.all.minX, y: d.all.minY, w: d.all.width, h: d.all.height };
}

// 선택된 영역(area) 안에서 zone(0=전체, 1=좌상, 2=우상, 3=좌하, 4=우하)을 적용한 절대 좌표 경계
function getMovementBounds(area: Rect, zone: number) {
  const halfW = Math.floor(area.w / 2);
  const halfH = Math.floor(area.h / 2);
  const minX = area.x + ((zone === 2 || zone === 4) ? halfW : 0);
  const maxX = area.x + ((zone === 1 || zone === 3) ? halfW : area.w) - PET_WINDOW_W;
  const minY = area.y + ((zone === 3 || zone === 4) ? halfH : 0);
  const maxY = area.y + ((zone === 1 || zone === 2) ? halfH : area.h) - PET_WINDOW_H;
  return { minX, maxX: Math.max(minX, maxX), minY, maxY: Math.max(minY, maxY) };
}

// ── 구역 밖 드롭 안내 ────────────────────────────────────────────
const ZONE_OUT_MARGIN = 24;           // 경계에서 이 정도(px)는 벗어나도 무시
const ZONE_OUT_LIMIT = 3;             // 최근 60초 안에 이 횟수 이상이면 안내
const ZONE_OUT_WINDOW_MS = 60 * 1000;
const ZONE_HINT_COOLDOWN_MS = 10 * 60 * 1000;
const ZONE_HINT_TOAST_MS = 5000;
const ZONE_NAMES = ['', '좌상단', '우상단', '좌하단', '우하단'];

// 활동 구역 이름 (설정창 표기와 같게: "모니터 N · 우하단")
function describeZone(d: DisplaysInfo | null, monitor: number, zone: number): string {
  const m = monitor >= 0 ? d?.monitors.find(mm => mm.displayId === monitor) : undefined;
  return [m ? `모니터 ${m.id + 1}` : '', ZONE_NAMES[zone] || ''].filter(Boolean).join(' · ');
}

// ── 물리 엔진 ─────────────────────────────────────────────────────
interface PhysicsState {
  wx: number; wy: number; vx: number; vy: number;
  rotate: number; vr: number; scale: number; targetScale: number; escaping: boolean;
}

function useScreenMovement(speedRef: React.MutableRefObject<number>, zoneRef: React.MutableRefObject<number>, areaRef: React.MutableRefObject<Rect>, pausedRef: React.MutableRefObject<boolean>) {
  const stateRef = useRef<PhysicsState>({
    wx: 0, wy: 0, vx: 0, vy: 0, rotate: 0, vr: 0, scale: 1, targetScale: 1, escaping: false,
  });
  const [displayTransform, setDisplayTransform] = useState({ rotate: 0, scale: 1 });
  const frameRef = useRef<number>(0);
  const nextEventRef = useRef<number>(0);
  const escapingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ★ 드래그 중 물리엔진 이동 무시 플래그
  const draggingRef = useRef(false);

  const onWallHitRef = useRef<()=>void>(() => {});
  const onWallHit = () => onWallHitRef.current();

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.wx = window.screen.width / 2;
    s.wy = window.screen.height - PET_WINDOW_H;
    s.vx = 0; s.vy = 0; s.vr = 0; s.rotate = 0; s.escaping = false;
  }, []);

  const triggerEscape = useCallback(() => {
    const s = stateRef.current;
    s.escaping = true;
    const r = (a: number, b: number) => Math.random() * (b - a) + a;
    s.vx = r(-22, 22); s.vy = r(-18, -8); s.targetScale = 1.15;
    if (escapingTimerRef.current) clearTimeout(escapingTimerRef.current);
    escapingTimerRef.current = setTimeout(() => { stateRef.current.escaping = false; }, 2000);
  }, []);

  useEffect(() => {
    const r = (a: number, b: number) => Math.random() * (b - a) + a;
    const initArea = areaRef.current;
    stateRef.current.wx = initArea.x + initArea.w - PET_WINDOW_W - 40;
    stateRef.current.wy = initArea.y + initArea.h - PET_WINDOW_H - 40;

    const triggerEvent = () => {
      const s = stateRef.current;
      if (s.escaping) return;
      // ★ settingsRef에서 최신 속도 읽기 (1~10 → 0.2~2.0)
      const spd = (speedRef.current || 5) / 5;
      switch (Math.floor(Math.random() * 7)) {
        // ★ 속도 배율 (1~10 → 0.2~2.0배)
        case 0: s.vx=r(-12,12)*spd; s.vy=r(-8,8)*spd;   s.vr=r(-4,4);  s.targetScale=r(0.96,1.06); break;
        case 1: s.vx=-s.vx*r(0.8,1.3); s.vy=r(-5,5)*spd; s.vr=r(-5,5); break;
        case 2: s.vy=r(-16,-6)*spd; s.vx=r(-4,4)*spd;   s.vr=r(-6,6);  s.targetScale=1.10; break;
        case 3: s.vr=r(-8,8);   s.vx*=0.4;       s.vy*=0.4;     break;
        case 4: s.vx=r(-1,1)*spd; s.vy=r(-1,1)*spd; s.vr=r(-2,2); s.targetScale=r(0.93,1.03); break;
        case 5: s.vx=r(-16,16)*spd; s.vy=r(-12,12)*spd; s.vr=r(-5,5); s.targetScale=r(0.93,1.08); break;
        case 6: s.vx=(r(0,1)>0.5?r(14,22):r(-22,-14))*spd; s.vy=r(-3,3)*spd; s.vr=r(-4,4); break;
      }
      nextEventRef.current = Date.now() + r(600, 2800);
    };

    triggerEvent();

    let lastTime = 0;
    let wasPaused = false, pausedTimer: ReturnType<typeof setTimeout> | null = null;
    const tick = (now: number) => {
      // 초집중 모드: 이 물리 루프는 쉰다(이동은 PetPage의 느린 루프가 맡는다). 쉬는 동안은 0.4초에 한 번만 깨어나 확인한다 → CPU 절약
      if (pausedRef.current) {
        if (!wasPaused) {
          wasPaused = true;
          const p = stateRef.current; p.vx = 0; p.vy = 0; p.vr = 0; p.rotate = 0; p.scale = 1; p.targetScale = 1; p.escaping = false;
          setDisplayTransform({ rotate: 0, scale: 1 });
        }
        pausedTimer = setTimeout(() => { frameRef.current = requestAnimationFrame(tick); }, 400);
        return;
      }
      wasPaused = false;
      // 30fps 제한 - 저사양 PC 성능 개선
      if (now - lastTime < 33) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTime = now;
      const s = stateRef.current;
      if (Date.now() >= nextEventRef.current) triggerEvent();
      s.vx *= 0.96; s.vy *= 0.96; s.vr *= 0.88;

      // ★ 드래그 중이면 물리 이동 건너뜀
      if (!draggingRef.current) {
        s.wx += s.vx; s.wy += s.vy;
      }

      s.rotate += s.vr;
      if (s.rotate > 45)  { s.rotate = 45;  s.vr = -Math.abs(s.vr) * 0.6; }
      if (s.rotate < -45) { s.rotate = -45; s.vr =  Math.abs(s.vr) * 0.6; }

      const br = (a: number, b: number) => Math.random() * (b - a) + a;
      // ★ zone 기반 경계 (0=전체, 1=좌상, 2=우상, 3=좌하, 4=우하)
      // ★ 선택된 모니터(영역) 기준 절대 좌표 경계 (영역 밖이면 매 프레임 안으로 clamp)
      const { minX, maxX, minY, maxY } = getMovementBounds(areaRef.current, zoneRef.current || 0);
      const prevWx = s.wx, prevWy = s.wy;
      if (s.wx < minX) { s.wx = minX; s.vx =  Math.abs(s.vx) * br(0.6,1.0); }
      if (s.wx > maxX) { s.wx = maxX; s.vx = -Math.abs(s.vx) * br(0.6,1.0); }
      if (s.wy < minY) { s.wy = minY; s.vy =  Math.abs(s.vy) * br(0.6,1.0); }
      if (s.wy > maxY) { s.wy = maxY; s.vy = -Math.abs(s.vy) * br(0.6,1.0); }
      // ★ 벽에 부딪혔을 때 + 속도가 충분히 빠를 때만 벽쿵
      const hitWall = (s.wx !== prevWx || s.wy !== prevWy);
      const speed = Math.sqrt(s.vx*s.vx + s.vy*s.vy);
      if (hitWall && speed > 3) onWallHit();

      s.scale += (s.targetScale - s.scale) * 0.08;

      if (!draggingRef.current) {
        window.electronAPI?.movePetWindow(Math.round(s.wx), Math.round(s.wy));
      }

      setDisplayTransform({ rotate: s.rotate, scale: s.scale });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick as FrameRequestCallback);
    return () => {
      cancelAnimationFrame(frameRef.current);
      if (pausedTimer) clearTimeout(pausedTimer);
      if (escapingTimerRef.current) clearTimeout(escapingTimerRef.current);
    };
  }, []);

  return { displayTransform, reset, triggerEscape, stateRef, draggingRef, setOnWallHit: (fn: ()=>void) => { onWallHitRef.current = fn; } };
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function PetPage() {
  const [bubble, setBubble] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, ms = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), msg });
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onShowToast?.((msg, ms) => showToast(msg, ms));
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [showToast]);
  const [bubbleKey, setBubbleKey] = useState(0);
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle | null>(null);
  // 말풍선 우선순위: 알림 카드·미리 알림 토스트·야르 > 반응·졸림 방지(위의 bubble) > 내 메시지 > 시계(idleBubble)
  const [alertActive, setAlertActive] = useState(false);
  const [idleBubble, setIdleBubble] = useState<{ kind: 'message' | 'clock'; text: string; key: number } | null>(null);
  const alertRef = useRef(false);
  const toastActiveRef = useRef(false);
  const reloadSettingsRef = useRef<() => void>(() => {});
  const [mood, setMood] = useState('normal');
  const [particles, setParticles] = useState<Particle[]>([]);
  const [ambushEmoji, setAmbushEmoji] = useState<string | null>(null);
  const { index: customImgIndex } = usePhotoState(); // 몇 번째 사진인지는 메인의 교체 시계가 정한다
  const [settings, setSettings] = useState<Settings>(startSettings);
  // ★ 모션 상태
  const [motionClass, setMotionClass] = useState(''); // 벽쿵, 낮잠 등
  const [sparkles, setSparkles] = useState<{id:number,x:number,y:number,emoji:string}[]>([]); // 반짝임
  const sparkleIdRef = useRef(0);
  const isSleepingRef = useRef(false);
  const mouseMovedRef = useRef(true);
  const mouseIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseNearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particleIdRef = useRef(0);
  const lastClickTime = useRef(0);
  const clickCount = useRef(0);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const didDrag = useRef(false);

  const speedRef = useRef(5);
  const zoneRef = useRef(0);
  const monitorRef = useRef(-1);
  const displaysRef = useRef<DisplaysInfo | null>(null);
  const areaRef = useRef<Rect>(computeArea(null, -1));
  const [focus, setFocus] = useState<FocusModeState>({ enabled: false, seconds: false, anchor: null });   // 초집중 모드(메인이 소유)
  const focusRef = useRef(focus);
  const focusPausedRef = useRef(false);   // 켜져 있는 동안 기본 물리 루프를 쉬게 한다(초집중 모드 또는 우클릭 퀵 메뉴가 열려 있는 동안)
  const quickOpenRef = useRef(false);     // 우클릭 퀵 메뉴가 열려 있는 동안 true: 초집중 모드와 같은 경로로 이동·순간이동·도망·랜덤 움직임을 멈추고 모든 말풍선을 쉰다
  const zoneDropsRef = useRef<number[]>([]);   // 구역 밖 드롭 시각
  const zoneHintAtRef = useRef(0);             // 마지막 안내 시각 (메모리 기준)
  const [petSize, setPetSize] = useState(settings.size || 100);
  const sizeRef = useRef(100);
  useEffect(() => { speedRef.current = settings.moveSpeed || 5; }, [settings.moveSpeed]);
  useEffect(() => { zoneRef.current = settings.zone || 0; }, [settings.zone]);
  useEffect(() => {
    monitorRef.current = typeof settings.monitor === 'number' ? settings.monitor : -1;
    areaRef.current = computeArea(displaysRef.current, monitorRef.current);
  }, [settings.monitor]);
  useEffect(() => {
    const s = settings.size || 100;
    sizeRef.current = s;
    setPetSize(s);   // 창 크기는 고정이라 버디 크기만 바꾼다
  }, [settings.size]);

  const { displayTransform, reset, triggerEscape, stateRef, draggingRef, setOnWallHit } = useScreenMovement(speedRef, zoneRef, areaRef, focusPausedRef);
  const { rotate, scale } = displayTransform;

  // ── 초집중 모드 ─────────────────────────────────────────────────────
  // 상태는 메인이 소유한다(설정창·트레이·이 창 모두 메인을 거침). 켜면: 기준 위치 ± 몇십 px만 아주 천천히 움직이고, 말풍선·장난은 끄고, 시계를 보여 주고,
  // 버디가 아닌 곳은 클릭이 통과한다. 알람은 이 모드와 상관없이 평소처럼 울린다(알림 카드·토스트는 메인이 따로 띄우므로 이 모드가 건드리지 않는다).
  const focusSeenRef = useRef(false);
  useEffect(() => {
    const api = window.electronAPI;
    const apply = (incoming: FocusModeState) => {
      let next = incoming;
      const prev = focusRef.current;
      const first = !focusSeenRef.current; focusSeenRef.current = true;
      focusRef.current = next; focusPausedRef.current = next.enabled || quickOpenRef.current;
      if (next.enabled && (first || !prev.enabled)) {
        const st = stateRef.current;
        if (first && next.anchor) { st.wx = next.anchor.x; st.wy = next.anchor.y; api?.movePetWindow(next.anchor.x, next.anchor.y); }   // 앱을 다시 켰을 때: 저장된 자리로
        else {   // 방금 켰을 때: 지금 있는 자리가 기준. 메인은 "위치만 바뀐 것"을 다시 알리지 않으므로 이 창의 상태에도 직접 반영한다
          const anchor = { x: Math.round(st.wx), y: Math.round(st.wy) };
          next = { ...next, anchor }; focusRef.current = next;
          api?.reportFocusAnchor(anchor.x, anchor.y);
        }
        setBubble(null); setIdleBubble(null); setAmbushEmoji(null); setMood('normal'); setMotionClass(''); setSparkles([]); setParticles([]); isSleepingRef.current = false;   // 주의를 끄는 표시 정리
      }
      setFocus(next);
    };
    api?.getFocusMode?.().then(s => { if (s) apply(s); }).catch(() => {});
    const off = api?.onFocusMode?.(s => { if (s) apply(s); });
    return () => { if (typeof off === 'function') off(); };
  }, [stateRef]);

  // 느린 이동: 기준점 ± 범위(기준점이 있는 모니터 안) 안의 목표점으로 0.1초마다 최대 1px씩, 닿으면 잠깐 쉬었다가 새 목표점. 기본 물리 루프(30fps)는 쉰다.
  useEffect(() => {
    if (!focus.enabled) return;
    const api = window.electronAPI;
    const win = { w: PET_WINDOW_W, h: PET_WINDOW_H };
    let target: { x: number; y: number } | null = null, restUntil = 0;
    const timer = setInterval(() => {
      const anchor = focusRef.current.anchor;
      if (!anchor || draggingRef.current) return;
      const st = stateRef.current, d = displaysRef.current;
      const area = (d && monitorRectAt(d.monitors, anchor, win)) || areaRef.current;
      const b = focusBounds(anchor, area, win);
      const now = Date.now();
      if (target && (target.x < b.minX || target.x > b.maxX || target.y < b.minY || target.y > b.maxY)) target = null;   // 기준점이 바뀌었으면 목표를 다시 잡는다
      if (!target) { if (now < restUntil) return; target = nextFocusTarget(b); }
      const step = stepToward({ x: st.wx, y: st.wy }, target);
      const nx = Math.min(Math.max(step.x, b.minX), b.maxX), ny = Math.min(Math.max(step.y, b.minY), b.maxY);   // 범위 밖이면 범위 안으로 당긴다
      if (nx === target.x && ny === target.y) { target = null; restUntil = now + FOCUS_PAUSE_MS[0] + Math.random() * (FOCUS_PAUSE_MS[1] - FOCUS_PAUSE_MS[0]); }
      if (nx !== st.wx || ny !== st.wy) { st.wx = nx; st.wy = ny; api?.movePetWindow(nx, ny); }
    }, FOCUS_TICK_MS);
    return () => clearInterval(timer);
  }, [focus.enabled, stateRef, draggingRef]);

  // 클릭 통과: 메인이 버디 창의 클릭을 통과시키고 있어도 마우스 이동은 이 창으로 전달된다. 마우스가 버디 위일 때만 "받기"로 바꿔서 드래그·우클릭이 되게 한다.
  useEffect(() => {
    if (!focus.enabled) return;
    const api = window.electronAPI;
    let interactive = false;
    const set = (v: boolean) => { if (v !== interactive) { interactive = v; api?.setPetInteractive(v); } };
    const onMove = (e: MouseEvent) => {
      if (isDragging.current) { set(true); return; }   // 드래그 중에는 계속 받는다
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cat-area');
      set(isOverPet(el ? el.getBoundingClientRect() : null, e.clientX, e.clientY));
    };
    const onLeave = () => { if (!isDragging.current) set(false); };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => { window.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave); };
  }, [focus.enabled]);

  // 클릭 통과 영역 알림: 보이는 요소(펫 원·말풍선·토스트)의 창 안 좌표를 메인에 알린다(바뀔 때만). 메인은 커서가 이 영역 안일 때만 이 창이 클릭을 받게 한다.
  // 펫이 움직여도 창 안에서의 위치는 같고(창이 함께 움직인다), 판정은 메인이 커서와 창 위치로 하므로 여기서는 말풍선·토스트가 뜨고 질 때와 크기 변경만 알리면 된다.
  useEffect(() => {
    const api = window.electronAPI;
    let last = '';
    const r0 = (n: number) => Math.round(n);
    const send = () => {
      const list: unknown[] = [];
      const cat = document.querySelector<HTMLElement>('.cat-area');
      if (cat) {   // 클릭을 받는 원(회전·확대는 중심이 그대로라 레이아웃 크기와 중심만 쓴다)
        const b = cat.getBoundingClientRect();
        list.push({ kind: 'ellipse', cx: r0(b.left + b.width / 2), cy: r0(b.top + b.height / 2), rx: r0(cat.offsetWidth / 2), ry: r0(cat.offsetHeight / 2) });
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.bubble, .pet-toast'))) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) list.push({ kind: 'rect', x: r0(b.left), y: r0(b.top), w: r0(b.width), h: r0(b.height) });
      }
      const key = JSON.stringify(list);
      if (key !== last) { last = key; api?.setPetRegions?.(list); }
    };
    send();
    const timer = setInterval(send, 250);
    return () => clearInterval(timer);
  }, []);

  const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const activeImages = useMemo(
    () => (settings.customImages || []).filter(Boolean) as string[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(settings.customImages)]
  );
  const isCustomMode = settings.useCustomMode && activeImages.length > 0;
  const animal = getAnimal(settings.animalId);

  // ── 설정 로드 (2초마다 폴링) ─────────────────────────────────────
  const initialSyncedRef = useRef(false);
  const lastSyncedRawRef = useRef<string | null>(null);   // 마지막으로 메인에 보낸 저장값(바뀌었는지 비교용)
  const displaysReadyRef = useRef(false);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('petSettings');
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch {}
      // 메인 프로세스와 동기화: 앱 시작 시 1회(저장값이 없거나 파싱 실패해도 기본값으로), 그리고 저장값이 바뀐 것을 알아차렸을 때 다시.
      // 설정창이 보낸 동기화가 빠지거나 늦어도 펫 창이 2초 안에 메인을 저장값에 맞춘다.
      let rawNow: string | null = null;
      try { rawNow = localStorage.getItem('petSettings'); } catch {}
      if (!initialSyncedRef.current || (rawNow && rawNow !== lastSyncedRawRef.current)) {
        initialSyncedRef.current = true;
        let merged: Record<string, unknown> = { ...startSettings() };
        try {
          const stored = readStoredSettings();
          if (stored) merged = { ...DEFAULT_SETTINGS, ...stored };
        } catch {}
        try { lastSyncedRawRef.current = localStorage.getItem('petSettings'); } catch {}
        window.electronAPI?.syncSettings(merged);
      }
    };
    // 디스플레이 정보 갱신 (모니터 추가/제거/해상도 변경 반영)
    const refreshDisplays = async () => {
      try {
        const d = await window.electronAPI?.getAllDisplays?.();
        if (d) {
          displaysRef.current = d;
          areaRef.current = computeArea(d, monitorRef.current);
          // 첫 응답 시 현재 위치가 영역 밖이면 안으로 1회 재배치
          if (!displaysReadyRef.current) {
            displaysReadyRef.current = true;
            const b = getMovementBounds(areaRef.current, zoneRef.current || 0);
            const st = stateRef.current;
            const nx = Math.min(Math.max(st.wx, b.minX), b.maxX);
            const ny = Math.min(Math.max(st.wy, b.minY), b.maxY);
            if (nx !== st.wx || ny !== st.wy) {
              st.wx = nx; st.wy = ny;
              window.electronAPI?.movePetWindow(Math.round(nx), Math.round(ny));
            }
          }
        }
      } catch {}
    };
    const loadAll = () => { refreshDisplays(); load(); };
    reloadSettingsRef.current = load;
    loadAll();
    const t = setInterval(loadAll, 2000);
    // 설정창에서 값을 바꾸면 2초 폴링을 기다리지 않고 바로 다시 읽는다
    const off = window.electronAPI?.onSettingsChanged?.(() => reloadSettingsRef.current());
    return () => { clearInterval(t); if (typeof off === 'function') off(); };
  }, []);

  // ── 말풍선 ────────────────────────────────────────────────────────
  const showBubble = useCallback((text: string, newMood = 'normal', colorize = false, ms = 4000) => {
    if (quickOpenRef.current) return;   // 퀵 메뉴가 열려 있는 동안은 어떤 경로의 말풍선도 쉰다(졸림 방지·반응·안내 포함)
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble(text);
    setBubbleKey(k => k + 1);
    setMood(newMood);
    setBubbleStyle(colorize ? rand(BUBBLE_COLORS) : null);
    bubbleTimerRef.current = setTimeout(() => {
      setBubble(null);
      setBubbleStyle(null);
      setMood('normal');
    }, ms);
  }, []);

  // 메인이 보내는 안내 말풍선(예: 온보딩 직후 "우클릭하면 메뉴가 쏟아져요")
  useEffect(() => window.electronAPI?.onShowBubble?.((text, ms) => { if (!focusRef.current.enabled) showBubble(text, 'happy', false, ms); }), [showBubble]);   // 초집중 모드에서는 안내 말풍선도 끈다

  // ── 파티클 ────────────────────────────────────────────────────────
  const spawnParticles = useCallback((count = 8) => {
    const newP: Particle[] = Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 3 + Math.random() * 5;
      return {
        id: particleIdRef.current++,
        x: 55, y: 55,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        emoji: rand(CLICK_PARTICLES),
        opacity: 1, scale: 0.8 + Math.random() * 0.7, rotation: Math.random() * 360,
      };
    });
    setParticles(prev => [...prev, ...newP]);
    let frame = 0;
    const animate = () => {
      frame++;
      setParticles(prev =>
        prev.map(p => ({
          ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3,
          opacity: Math.max(0, p.opacity - 0.025), rotation: p.rotation + 8,
        })).filter(p => p.opacity > 0)
      );
      if (frame < 45) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  // ★ 반짝임 이펙트
  const spawnSparkles = useCallback(() => {
    const SPARKLE_EMOJIS = ['✨','⭐','💫','🌟','💥','🎇'];
    const newSparkles = Array.from({ length: 5 }, (_, i) => ({
      id: sparkleIdRef.current++,
      x: 20 + Math.random() * 70,
      y: 20 + Math.random() * 70,
      emoji: SPARKLE_EMOJIS[Math.floor(Math.random() * SPARKLE_EMOJIS.length)],
    }));
    setSparkles(newSparkles);
    setTimeout(() => setSparkles([]), 1000);
  }, []);

  // ★ 벽쿵 모션 등록
  useEffect(() => {
    setOnWallHit(() => {
      setMotionClass('motion-wall-hit');
      setTimeout(() => setMotionClass(''), 400);
    });
  }, [setOnWallHit]);

  // ★ 랜덤 반짝임 (15~30초마다)
  useEffect(() => {
    const scheduleSparkle = () => {
      const delay = 15000 + Math.random() * 15000;
      return setTimeout(() => {
        if (!focusRef.current.enabled && !quickOpenRef.current && !stateRef.current.escaping && !isSleepingRef.current) {   // 초집중 모드·퀵 메뉴가 열린 동안에는 반짝임 없음
          spawnSparkles();
        }
        sparkleTimerRef.current = scheduleSparkle();
      }, delay);
    };
    const sparkleTimerRef = { current: scheduleSparkle() };
    return () => clearTimeout(sparkleTimerRef.current);
  }, [spawnSparkles, stateRef]);

  // ★ 마우스 정지 감지 → 낮잠
  useEffect(() => {
    const onMouseMove = () => {
      mouseMovedRef.current = true;
      if (isSleepingRef.current) {
        // 낮잠에서 깨기
        isSleepingRef.current = false;
        setMotionClass('');
        setBubble(null);
      }
      if (mouseIdleTimerRef.current) clearTimeout(mouseIdleTimerRef.current);
      mouseIdleTimerRef.current = setTimeout(() => {
        mouseMovedRef.current = false;
        // 마우스 30초 정지 → 낮잠
        if (!focusRef.current.enabled && !quickOpenRef.current && !isSleepingRef.current && !stateRef.current.escaping) {   // 초집중 모드·퀵 메뉴가 열린 동안에는 낮잠 연출 없음
          isSleepingRef.current = true;
          setMotionClass('motion-sleep');
          showBubble('z z z 💤', 'sleepy');
        }
      }, 30000);
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (mouseIdleTimerRef.current) clearTimeout(mouseIdleTimerRef.current);
    };
  }, [showBubble, stateRef]);

  // ★ 순간이동 (40~80초마다)
  useEffect(() => {
    const scheduleTeleport = () => {
      const delay = 40000 + Math.random() * 40000;
      return setTimeout(() => {
        if (!focusRef.current.enabled && !quickOpenRef.current && !stateRef.current.escaping && !isSleepingRef.current) {   // 초집중 모드·퀵 메뉴가 열린 동안에는 순간이동 없음
          // 연기 효과 후 반대편으로 이동
          setMotionClass('motion-teleport-out');
          setTimeout(async () => {
            try {
              const d = await window.electronAPI?.getAllDisplays?.();
              if (d) {
                displaysRef.current = d;
                areaRef.current = computeArea(d, monitorRef.current);
              }
            } catch {}
            // 선택된 모니터/구역 안에서 현재 위치 반대편으로
            const b = getMovementBounds(areaRef.current, zoneRef.current || 0);
            const newX = stateRef.current.wx < (b.minX + b.maxX) / 2 ? b.maxX : b.minX;
            const newY = Math.round(b.minY + Math.random() * (b.maxY - b.minY));
            window.electronAPI?.movePetWindow(newX, newY);
            stateRef.current.wx = newX;
            stateRef.current.wy = newY;
            stateRef.current.vx = 0;
            stateRef.current.vy = 0;
            setMotionClass('motion-teleport-in');
            showBubble('순간이동! 💨', 'surprised');
            setTimeout(() => setMotionClass(''), 500);
          }, 300);
        }
        teleportTimerRef.current = scheduleTeleport();
      }, delay);
    };
    const teleportTimerRef = { current: scheduleTeleport() };
    return () => clearTimeout(teleportTimerRef.current);
  }, [showBubble, stateRef]);

  // ── 도망 - 마우스가 버디 위에 2초 올려두면 도망 ────────────────────
  const handleMouseEnter = useCallback(() => {
    if (focusRef.current.enabled || quickOpenRef.current) return;   // 초집중 모드·퀵 메뉴가 열린 동안에는 도망가지 않는다
    if (mouseNearTimer.current) clearTimeout(mouseNearTimer.current);
    mouseNearTimer.current = setTimeout(() => {
      if (!stateRef.current.escaping) {
        triggerEscape();
        const lines = isCustomMode ? CUSTOM_ESCAPE : animal.escapeLines;
        showBubble(rand(lines), 'scared');
      }
    }, 2000);
  }, [triggerEscape, showBubble, animal, isCustomMode, stateRef]);

  const handleMouseLeave = useCallback(() => {
    if (mouseNearTimer.current) {
      clearTimeout(mouseNearTimer.current);
      mouseNearTimer.current = null;
    }
  }, []);

  // ── 부르기 ("여기 있어요!") ──────────────────────────────────────
  // 예전에는 6초마다 잔소리 말풍선이 떴다. 이제 주기적으로 뜨는 말풍선은 아래 말풍선 엔진(내 메시지·시계)이 맡는다.
  useEffect(() => {
    const handleCallPet = () => {
      reset();
      if (focusRef.current.enabled) {   // 초집중 모드: 말풍선 없이, 불러온 자리를 새 기준 위치로 삼는다
        setTimeout(() => window.electronAPI?.getPetPosition?.().then(p => { if (p) { stateRef.current.wx = p.x; stateRef.current.wy = p.y; focusRef.current = { ...focusRef.current, anchor: p }; window.electronAPI?.reportFocusAnchor(p.x, p.y); } }).catch(() => {}), 200);
        return;
      }
      showBubble('여기 있어요! 🐾', 'happy');
    };
    window.addEventListener('call-pet', handleCallPet);
    return () => {
      window.removeEventListener('call-pet', handleCallPet);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [showBubble, reset]);

  // ★ 설정값을 ref에 동기화 → 클로저 문제 해결
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const activeImagesRef = useRef(activeImages);
  useEffect(() => { activeImagesRef.current = activeImages; }, [activeImages]);

  const isCustomModeRef = useRef(isCustomMode);
  useEffect(() => { isCustomModeRef.current = isCustomMode; }, [isCustomMode]);

  const animalRef = useRef(animal);
  useEffect(() => { animalRef.current = animal; }, [animal]);

  // ★ 기존 문구(동물 말투 + 시간대 문구 + 월급날·불금 같은 특별 문구). 내 메시지가 없을 때 졸림 방지 말풍선이 쓴다.
  const getLegacyNag = useCallback((): string => {
    const cur = settingsRef.current;
    const special = getSpecialMessages();
    if (isCustomModeRef.current) return rand([...CUSTOM_NAGS, ...special]);
    const timeMsgs = TIME_MESSAGES[getTimeCategory(cur.workStart, cur.leaveTime)] || TIME_MESSAGES.work;
    return rand([...animalRef.current.nags, ...timeMsgs, ...special]);
  }, []);
  // ★ 평소 말풍선의 기본 문구 후보: 기존 문구(위와 같은 구성) + 업무메이트 새 문구(시간대별). 셔플 백이 한 바퀴 돌 때까지 반복 없이 고른다.
  const getPhrasePool = useCallback((): string[] => {
    const cur = settingsRef.current;
    const special = getSpecialMessages();
    const cat = getTimeCategory(cur.workStart, cur.leaveTime);
    const legacy = isCustomModeRef.current ? [...CUSTOM_NAGS, ...special] : [...animalRef.current.nags, ...(TIME_MESSAGES[cat] || TIME_MESSAGES.work), ...special];
    return [...legacy, ...newPhrasesFor(cat)];
  }, []);
  // 졸림 방지 말풍선: 내 메시지가 있으면 그걸 순서대로, 없으면 기존 문구
  const ownMessageIdxRef = useRef(0);
  const pickOwnMessage = useCallback((): string | null => {
    const cur = settingsRef.current;
    if (cur.bubbleEnabled === false) return null;
    const msgs = cleanBubbleMessages(cur.bubbleMessages);
    if (!msgs.length) return null;
    return msgs[ownMessageIdxRef.current++ % msgs.length];
  }, []);

  // ★ 알림 상태: 전체화면 알림(점심·퇴근·알람 카드, 야르)과 미리 알림 토스트가 떠 있는 동안 말풍선을 숨긴다
  useEffect(() => { alertRef.current = alertActive; }, [alertActive]);
  useEffect(() => { toastActiveRef.current = !!toast; }, [toast]);
  // 우클릭 퀵 메뉴가 열려 있는 동안: 펫은 제자리에 있고(초집중 모드의 물리 루프 정지 플래그 재사용) 모든 말풍선은 쉰다. 닫히면 바로 원래대로(평소 말풍선은 시간도 함께 멈췄다가 이어서 진행).
  useEffect(() => {
    const off = window.electronAPI?.onQuickState?.(open => {
      quickOpenRef.current = open;
      focusPausedRef.current = focusRef.current.enabled || open;
      if (open) { setBubble(null); setIdleBubble(null); }
    });
    return () => { if (typeof off === 'function') off(); };
  }, []);
  useEffect(() => {
    const api = window.electronAPI;
    api?.getAlertState?.().then(active => setAlertActive(!!active)).catch(() => {});
    const off = api?.onAlertState?.(active => setAlertActive(active));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  // ★ 날씨 안부: 동네와 동의가 모두 있을 때만 메인에게 값을 부탁한다(요청은 메인이 하고 30분 캐시·실패 처리를 맡는다).
  // 여기서는 1분마다 값의 나이만 확인하고, 없거나 25분이 지났을 때만 다시 부탁한다. 실패하면 조용히 비워 두고 다음 확인 때 다시 본다(안부가 안 나올 뿐).
  const weatherRef = useRef<WeatherSnapshot | null>(null);
  const weatherCityRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cur = settingsRef.current, city = cityById(cur.weatherCityId);
      if (!cur.weatherConsent || !city) { weatherRef.current = null; weatherCityRef.current = ''; return; }
      if (weatherCityRef.current !== city.id) { weatherRef.current = null; weatherCityRef.current = city.id; }   // 동네가 바뀌면 이전 값은 버린다
      const w = weatherRef.current;
      if (w && Date.now() - w.at < 25 * 60 * 1000) return;
      try {
        const r = await window.electronAPI?.getWeather?.(city.lat, city.lon);
        if (cancelled || !r) return;
        if (settingsRef.current.weatherCityId !== city.id || !settingsRef.current.weatherConsent) return;   // 기다리는 사이 동네·동의가 바뀌었으면 버린다
        weatherRef.current = { data: r.data, at: r.at };
      } catch { /* 조용히 건너뜀 */ }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [settings.weatherCityId, settings.weatherConsent]);

  // ★ 말풍선 엔진: 한 차례(말풍선 주기)마다 종류를 뽑는다 — 기본 문구 · 시계 · 날씨 안부 · 내 메시지(비중과 연속 금지는 utils/bubbleRoll.ts).
  // 기본 문구·날씨 안부·내 메시지는 표시 시간만 보이고, 시계 차례는 그 차례 내내 시계가 보인다. 알림 중에는 시간이 멈췄다가 이어서 진행한다.
  // 내 메시지는 순서대로 하나씩, 문구는 셔플 백(한 바퀴 돌 때까지 반복 없음). 날씨 안부는 새 종류의 말풍선이 아니라 같은 말풍선 모양(message)으로 보인다.
  useEffect(() => {
    let elapsed = 0, last = Date.now(), sig = '';
    let curKind: 'message' | 'clock' | null = null, curIdx = -1, curText = '', key = 0;
    let slot = -1, slotKind: RollKind = 'phrase', slotText = '', picked = false, lastRoll: RollKind | null = null, msgCursor = -1;
    const lastHello: { kind: HelloKind | null; text: string | null } = { kind: null, text: null };
    const phraseBag = createShuffleBag(), helloBags = new Map<string, ShuffleBag>();   // 문구는 셔플 백: 한 바퀴를 다 돌 때까지 같은 문구를 반복하지 않는다
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(now - last, 1500);   // 절전 복귀처럼 큰 간격은 잘라서 메시지를 한꺼번에 건너뛰지 않는다
      last = now;
      const cur = settingsRef.current;
      const msgs = cleanBubbleMessages(cur.bubbleMessages);
      const show = clampTo(cur.bubbleShowSec, BUBBLE_SHOW_RANGE, 5) * 1000;
      const gap = clampTo(cur.bubbleGapSec, BUBBLE_GAP_RANGE, 30) * 1000;
      const nextSig = `${show}/${gap}/${msgs.length}`;
      if (nextSig !== sig) { sig = nextSig; elapsed = 0; slot = -1; picked = false; msgCursor = -1; }   // 표시 시간·주기·메시지 수가 바뀌면 처음부터 다시 돈다
      const paused = alertRef.current || toastActiveRef.current || quickOpenRef.current;
      if (!paused) elapsed += dt;
      const active = !paused && cur.bubbleEnabled !== false && !focusRef.current.enabled;   // 초집중 모드에서는 내 메시지·시계 말풍선 없음(시계는 따로 표시)
      const nowSlot = Math.floor(elapsed / gap);
      if (nowSlot !== slot) { slot = nowSlot; picked = false; }   // 새 차례
      if (active && !picked) {   // 이 차례에 보일 종류를 정한다(알림·초집중 중에는 정하지 않고, 끝난 뒤 이어서 정한다)
        const cands = weatherRef.current ? helloCandidates(weatherRef.current, now, { lunch: cur.lunchTime, leave: cur.leaveTime }) : [];
        slotKind = pickRollKind({ clock: cur.bubbleClock !== false, hello: cands.length > 0, message: msgs.length > 0 }, lastRoll);
        slotText = '';
        if (slotKind === 'hello') {
          const h = pickHello(cands, lastHello, Math.random, (c) => { let bag = helloBags.get(c.kind); if (!bag) { bag = createShuffleBag(); helloBags.set(c.kind, bag); } return bag.next(c.texts); });
          if (h) { lastHello.kind = h.kind; lastHello.text = h.text; slotText = h.text; } else slotKind = 'phrase';
        } else if (slotKind === 'message') msgCursor++;
        if (slotKind === 'phrase') slotText = phraseBag.next(getPhrasePool()) ?? '';
        lastRoll = slotKind; picked = true;
      }
      let kind: 'message' | 'clock' | null = null, idx = -1, text = '';
      if (active && picked) {
        const inShow = show >= gap || elapsed % gap < show;
        if (slotKind === 'clock') {   // 시계 차례: 이 차례 내내 시계(예전의 "빈 간격에는 시계"와 같은 모습)
          kind = 'clock'; text = clockText();
        } else if (inShow && slotKind === 'message' && msgs.length) {
          kind = 'message'; idx = Math.max(0, msgCursor) % msgs.length; text = msgs[idx];
        } else if (inShow && slotText) {   // 기본 문구·날씨 안부: 표시 시간만 보이고, 나머지 간격은 말풍선이 없다
          kind = 'message'; idx = 100000 + slot; text = slotText;
        }
      }
      if (kind === curKind && idx === curIdx && text === curText) return;
      if (kind !== curKind || idx !== curIdx) key++;   // 종류나 메시지가 바뀔 때만 새로 등장한다. 분이 바뀔 때는 같은 말풍선 안에서 글자만 바뀐다(깜빡임 없음)
      curKind = kind; curIdx = idx; curText = text;
      setIdleBubble(kind ? { kind, text, key } : null);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, []);

  // ★ 졸림방지 - 항상 실행, 내부에서 최신 ref 참조
  useEffect(() => {
    // 최소 주기로 돌면서 내부에서 설정 체크
    const CHECK_INTERVAL = 1000; // 1초마다 체크
    let elapsed = 0;

    const timer = setInterval(() => {
      const s = settingsRef.current;
      if (quickOpenRef.current) return;   // 퀵 메뉴가 열린 동안은 졸림 방지 이모지·말풍선도 쉰다(시간은 멈췄다가 닫히면 이어서)
      if (!s.distractEmoji || focusRef.current.enabled) { elapsed = 0; return; }   // 초집중 모드에서는 졸림 방지 이모지·말풍선 없음
      if (stateRef.current.escaping) return;

      elapsed += CHECK_INTERVAL;
      const target = Math.max(10, s.distractInterval) * 1000;
      if (elapsed < target) return;
      elapsed = 0;

      const imgs = activeImagesRef.current;
      const custom = isCustomModeRef.current;
      const anim = animalRef.current;

      if (custom && imgs.length > 0) {
        // 커스텀 모드: 말풍선 (사진 교체는 교체 주기 설정을 따라 메인이 따로 처리한다)
        if (s.bubbleEnabled !== false) showBubble(pickOwnMessage() ?? getLegacyNag(), 'happy', true);
        // 1.5초 뒤 기습 이모지
        setTimeout(() => {
          if (!stateRef.current.escaping) {
            setAmbushEmoji(rand(AMBUSH_EMOJIS));
            setTimeout(() => setAmbushEmoji(null), 1500);
          }
        }, 1500);
      } else {
        // 일반 모드
        if (Math.random() < 0.3) {
          setAmbushEmoji(rand(AMBUSH_EMOJIS));
          if (s.bubbleEnabled !== false) showBubble(pickOwnMessage() ?? getLegacyNag(), 'surprised', true);
          setTimeout(() => setAmbushEmoji(null), 1800);
        } else {
          const moods = ['happy','sleepy','party','love','cool','angry'];
          const newMood = rand(moods);
          setMood(newMood);
          if (s.bubbleEnabled !== false) showBubble(pickOwnMessage() ?? getLegacyNag(), newMood, true);
          setTimeout(() => setMood('normal'), 2000);
        }
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(timer);
  }, [showBubble, stateRef, pickOwnMessage, getLegacyNag]); // 마운트 시 1번만 등록, 내부에서 ref로 최신값 읽음

  // ── 드래그 ────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    didDrag.current = false;
    draggingRef.current = true;
    dragStartPos.current = { x: e.screenX, y: e.screenY };
    window.electronAPI?.startDrag(0, 0);
  };

  // 활동 구역(또는 모니터) 제한이 있는데 그 밖에 놓는 일이 반복되면 이유를 알려 준다
  const noteZoneDrop = useCallback((pos: { x: number; y: number }) => {
    const zone = zoneRef.current || 0;
    const d = displaysRef.current;
    const monitorFound = monitorRef.current >= 0 && !!d?.monitors.some(m => m.displayId === monitorRef.current);
    if (zone === 0 && !monitorFound) return; // 실제로 제한이 없을 때는 세지 않는다
    const b = getMovementBounds(areaRef.current, zone);
    const out = pos.x < b.minX - ZONE_OUT_MARGIN || pos.x > b.maxX + ZONE_OUT_MARGIN
      || pos.y < b.minY - ZONE_OUT_MARGIN || pos.y > b.maxY + ZONE_OUT_MARGIN;
    if (!out) return;
    const now = Date.now();
    const drops = zoneDropsRef.current.filter(at => now - at < ZONE_OUT_WINDOW_MS);
    drops.push(now);
    zoneDropsRef.current = drops;
    if (drops.length < ZONE_OUT_LIMIT) return;
    if (zoneHintAtRef.current && now - zoneHintAtRef.current < ZONE_HINT_COOLDOWN_MS) return;
    zoneDropsRef.current = [];
    zoneHintAtRef.current = now;
    const label = describeZone(d, monitorRef.current, zone);
    // 조사: 구역 이름은 모두 받침 "단"으로 끝나 "으로", 모니터만이면 번호 끝소리(3·6)에 따라 정한다
    const monitorNo = (d?.monitors.find(m => m.displayId === monitorRef.current)?.id ?? 0) + 1;
    const particle = zone !== 0 || monitorNo === 3 || monitorNo === 6 ? '으로' : '로';
    showToast(`활동 구역이 ${label}${particle} 정해져 있어요. 우클릭 메뉴의 메인에서 바꿀 수 있어요`, ZONE_HINT_TOAST_MS);
  }, [showToast]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = Math.abs(e.screenX - dragStartPos.current.x);
      const dy = Math.abs(e.screenY - dragStartPos.current.y);
      if (dx > 3 || dy > 3) didDrag.current = true;
    };
    const onUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        window.electronAPI?.endDrag();
        // 실제 창 위치를 stateRef에 넣은 뒤에 draggingRef를 풀어, 예전 위치로 한 프레임 튀지 않게 한다
        const release = () => { draggingRef.current = false; };
        const getPos = window.electronAPI?.getPetPosition;
        if (!getPos) { release(); return; }
        getPos().then((pos) => {
          if (pos) {
            stateRef.current.wx = pos.x; stateRef.current.wy = pos.y;
            if (focusRef.current.enabled) { focusRef.current = { ...focusRef.current, anchor: pos }; window.electronAPI?.reportFocusAnchor(pos.x, pos.y); }   // 옮겨 둔 자리가 새 기준 위치
            else noteZoneDrop(pos);
          }
        }).catch(() => {}).finally(release);
      }
    };
    // capture: true로 이벤트 먼저 캐치
    window.addEventListener('mousemove', onMove, { capture: true });
    window.addEventListener('mouseup', onUp, { capture: true });
    return () => {
      window.removeEventListener('mousemove', onMove, { capture: true });
      window.removeEventListener('mouseup', onUp, { capture: true });
    };
  }, [draggingRef, noteZoneDrop]);

  // ── 클릭 ──────────────────────────────────────────────────────────
  const handleCatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (didDrag.current) { didDrag.current = false; return; }
    if (focusRef.current.enabled) return;   // 초집중 모드에서는 반응 말풍선·파티클 없음
    const now = Date.now();
    const isDoubleClick = now - lastClickTime.current < 400;
    lastClickTime.current = now;
    const reactions = isCustomMode ? CUSTOM_REACTIONS : animal.reactions;
    if (isDoubleClick) {
      spawnParticles(14);
      showBubble(rand(reactions), 'happy');
    } else {
      clickCount.current += 1;
      const threshold = 2 + Math.floor(Math.random() * 2);
      if (clickCount.current >= threshold) {
        clickCount.current = 0;
        spawnParticles(10);
      }
      showBubble(rand(reactions), 'surprised');
    }
  };

  const currentCustomImage = isCustomMode && activeImages.length > 0
    ? activeImages[customImgIndex % activeImages.length]
    : null;
  const currentEmoji = animal.moods[mood] || animal.emoji;
  // 알림·토스트 > 반응·졸림 방지 말풍선 > 내 메시지 > 시계
  const shownBubble = (alertActive || toast) ? null
    : bubble ? { key: `t${bubbleKey}`, text: bubble, kind: 'say' as const, style: bubbleStyle }
    : idleBubble ? { key: `i${idleBubble.key}`, text: idleBubble.text, kind: idleBubble.kind, style: null }
    : null;

  return (
    <div className="pet-root" data-focus={focus.enabled ? '' : undefined} style={{ ['--pet-emoji' as string]: `${Math.round(64 * (petSize / 100))}px` } as React.CSSProperties}>
      {toast && (
        <div className="pet-toast" role="status" key={toast.id}>
          <Bell className="pet-toast-icon" strokeWidth={1.5} aria-hidden />
          <span>{toast.msg.replace(/(오전|오후) (?=\d)/g, '$1\u00A0')}</span>
        </div>
      )}
      <div className="pet-container">
        <div className="bubble-slot" style={{ marginBottom: `${-8 + (petSize - 100) * 0.3}px` }}>
            {shownBubble && (
              <div className="bubble" key={shownBubble.key}
                style={shownBubble.style ? { background: shownBubble.style.bg, color: shownBubble.style.text, borderColor: 'transparent' } : {}}>
                <span className={`bubble-text${shownBubble.kind === 'clock' ? ' bubble-clock' : ''}`}>{shownBubble.text}</span>
                <div className="bubble-tail"
                  style={shownBubble.style ? { borderTopColor: shownBubble.style.bg } : {}} />
              </div>
            )}
          </div>
        <div className="cat-wrapper">
          {particles.map(p => (
            <div key={p.id} className="particle" style={{
              left: p.x, top: p.y, opacity: p.opacity,
              transform: `translate(-50%,-50%) scale(${p.scale}) rotate(${p.rotation}deg)`,
            }}>{p.emoji}</div>
          ))}
          {/* ★ 반짝임 */}
          {sparkles.map(sp => (
            <div key={sp.id} className="sparkle" style={{ left: sp.x, top: sp.y }}>
              {sp.emoji}
            </div>
          ))}

          <div
            className={`cat-area ${motionClass}`}
            onMouseDown={handleMouseDown}
            onClick={handleCatClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={(e) => { e.preventDefault(); window.electronAPI?.petRightClick(); }}
            style={{ transform: `rotate(${rotate}deg) scale(${scale})` }}
          >
            {ambushEmoji ? (
              <CatEmoji emoji={ambushEmoji} size={Math.round(96 * (petSize/100))} className="cat-emoji cat-emoji--ambush" />
            ) : (
              <CatEmoji
                emoji={currentEmoji}
                size={Math.round(64 * (petSize/100))}
                className="cat-emoji"
                customImage={currentCustomImage}
                customShape={settings.customShape}
              />
            )}
          </div>
        </div>
        {focus.enabled && !alertActive && <FocusClock seconds={focus.seconds} />}
        {focus.enabled && !alertActive && <FocusLeaveLeft workStart={settings.workStart} leaveTime={settings.leaveTime} />}
      </div>
    </div>
  );
}
