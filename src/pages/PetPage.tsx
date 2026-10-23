import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import '../styles/pet.css';
import { Bell } from 'lucide-react';
import CatEmoji from '../components/CatEmoji';
import { usePhotoState } from '../hooks/usePhotoState';
import { BUBBLE_GAP_RANGE, BUBBLE_SHOW_RANGE, cleanBubbleMessages, cleanOffKinds, clampTo, clockText, readStoredSettings, isFreshWindow } from '../utils/settings';
import type { BubbleKind } from '../utils/settings';
import { fortuneFor, randomPhrase } from '../utils/fortune';
import { pickKind } from '../utils/bubbleMix';
import { BIRTHDAY_MESSAGE } from '../data/zodiacText';
import { isBirthday, readBirth } from '../utils/zodiac';
import { BIRTH_SNOOZE_DAYS, isSnoozed, readTalkState, snoozedUntil, writeTalkState } from '../utils/talkState';
import type { SettingsPatch, ShowKind, TalkCtx } from '../utils/talk';
import DayProgressBar from '../components/DayProgressBar';
import PetTalk, { PetBirthAsk } from '../components/PetTalk';
import { LEVEL, PROTECT_TAIL_MS, admit, answerBusy as answerBusyFn, answerMs, hoverExtends, holdStep, inConversation as inConversationFn, isProtected as isProtectedFn, tailFor } from '../utils/bubblePriority';
import type { ActiveBubble, BubbleLevel, ProtectState } from '../utils/bubblePriority';
import { cityById } from '../data/cities';
import { eveningText, morningText, weatherLines } from '../utils/weatherText';
import type { WeatherData } from '../electron';
import type { CustomShape } from '../components/CatEmoji';
import { getAnimal } from '../data/animals';
import FocusClock from '../components/FocusClock';
import { FOCUS_PAUSE_MS, FOCUS_TICK_MS, focusBounds, isOverPet, monitorRectAt, nextFocusTarget, stepToward } from '../utils/focusMode';
import type { FocusModeState } from '../electron';

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
type IdleKind = 'message' | BubbleKind;
const BRIEFING_MS = 9000;          // 날씨 안내 말풍선 표시 시간
const DOUBLE_CLICK_MS = 350;       // 이 안에 두 번 누르면 더블클릭(펫에게 말 걸기)
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
  bubbleOffKinds: BubbleKind[];
  weatherEnabled: boolean;
  weatherConsent: boolean;
  weatherCityId: string;
  fortuneBirth: string;
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
  bubbleEnabled: true, bubbleMessages: [], bubbleShowSec: 5, bubbleGapSec: 30, bubbleClock: true, bubbleOffKinds: [], weatherEnabled: false, weatherConsent: false, weatherCityId: '', fortuneBirth: '',
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

function useScreenMovement(speedRef: React.MutableRefObject<number>, zoneRef: React.MutableRefObject<number>, areaRef: React.MutableRefObject<Rect>, pausedRef: React.MutableRefObject<boolean>, holdRef: React.MutableRefObject<boolean>) {
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
    let wasHold = false, corr: { x: number; y: number } | null = null, lastShown = { r: 0, s: 1 };
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
      // 대화 보호(말 걸기·답변·날씨 안내 중과 직후): 위치를 고정하고 기울기·크기만 원래대로 가라앉힌다(제자리 바운스는 CSS가 맡는다). 드래그는 막지 않는다.
      if (holdRef.current) {
        if (now - lastTime < 33) { frameRef.current = requestAnimationFrame(tick); return; }
        lastTime = now;
        const s = stateRef.current;
        const first = !wasHold; wasHold = true;
        const step = holdStep(s, getMovementBounds(areaRef.current, zoneRef.current || 0), first, corr, draggingRef.current);   // 위치는 그대로, 처음 한 번만 가장자리 밖이면 안쪽으로 부드럽게 보정
        corr = step.corr;
        if (step.moved) window.electronAPI?.movePetWindow(Math.round(s.wx), Math.round(s.wy));
        if (s.rotate !== lastShown.r || s.scale !== lastShown.s) { lastShown = { r: s.rotate, s: s.scale }; setDisplayTransform({ rotate: s.rotate, scale: s.scale }); }
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      if (wasHold) { wasHold = false; corr = null; nextEventRef.current = Date.now() + 800; }   // 보호가 끝나면 그 자리에서 자연스럽게 이동 재개
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
  const [idleBubble, setIdleBubble] = useState<{ kind: IdleKind; text: string; key: number } | null>(null);
  const fortunePageRef = useRef(0);   // 운세 말풍선에서 지금 보여주는 줄(펫을 클릭하면 다음 줄)
  const weatherRef = useRef<{ data: WeatherData; at: number } | null>(null);   // 메인이 가져온 마지막 날씨(말풍선 엔진·클릭이 읽는다)
  const weatherPageRef = useRef(0);                       // 날씨 말풍선에서 지금 보여주는 줄(펫을 누르면 최고/최저 → 강수 확률 순)
  const mixRef = useRef<{ slot: number; kind: BubbleKind | null; last: BubbleKind | null }>({ slot: -1, kind: null, last: null });   // 빈 시간 말풍선 자동 섞기 상태(이번 주기에 고른 종류, 직전 종류)
  const lastPhraseRef = useRef<string | null>(null);      // 직전에 보여 준 한마디(연속 중복 방지)
  const forceRef = useRef<{ kind: 'fortune' | 'weather'; until: number; since: number } | null>(null);   // 펫에게 물어서 지금 보여 주는 운세·날씨(since: 이 줄을 보여 주기 시작한 시각)
  // 대화 답변(2순위) 한 줄을 붙잡는다: 글자 수에 비례한 시간(5~12초). 마우스 올림 연장은 since부터 총 20초를 넘지 않는다.
  const setForce = (kind: 'fortune' | 'weather', text: string) => { const t = Date.now(); forceRef.current = { kind, until: t + answerMs(text), since: t }; holdRef.current = true; };
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);   // 더블클릭인지 기다리는 한 번 클릭 처리
  const birthAskRequestRef = useRef<() => void>(() => {});   // 운세 말풍선이 나왔을 때 생일 묻기를 요청(엔진이 부른다)
  const [talk, setTalk] = useState<null | 'menu' | 'weather' | 'birth'>(null);   // 펫에게 말 걸기 창(열려 있는 동안만 입력을 받는다)
  const [birthAsk, setBirthAsk] = useState(false);          // "생일을 알려줄래요?" 작은 묻기
  // 말풍선 우선순위·대화 보호(bubblePriority.ts): 1 알람·토스트 > 2 대화 답변 > 3 아침·퇴근길 날씨 안내 > 4 그 외. 보호 중에는 4순위 말풍선과 펫의 위치·상태 변화가 멈춘다.
  const activeBubbleRef = useRef<ActiveBubble | null>(null);   // 지금 떠 있는 말풍선의 순위와 끝나는 시각
  const protectUntilRef = useRef(0);                           // 답변·안내가 사라진 뒤 보호가 끝나는 시각(답변 20초, 날씨 안내 10초)
  const talkOpenRef = useRef(false);                           // 말 걸기 창이 열려 있음
  const hoverRef = useRef({ over: false, leftAt: 0 });         // 마우스가 펫·답변 말풍선 위에 있음 / 벗어난 시각
  const quietUntilRef = useRef(0);                             // 대화를 직접 끝낸 직후 평소 말풍선을 잠깐 쉬는 시각
  const holdRef = useRef(false);                              // 보호 중이면 물리 이동 루프가 위치를 고정한다(제자리 바운스만)
  const [holding, setHolding] = useState(false);               // 제자리 바운스 모션(CSS)용
  const protectState = (): ProtectState => ({ talkOpen: talkOpenRef.current, forceUntil: forceRef.current?.until ?? 0, active: activeBubbleRef.current, protectUntil: protectUntilRef.current });
  const isProt = () => isProtectedFn(protectState(), Date.now());
  const nagOk = () => !isProt();                               // 졸림 방지 말풍선은 보호 중에는 띄우지 않는다
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
  const focusPausedRef = useRef(false);   // 켜져 있는 동안 기본 물리 루프를 쉬게 한다
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

  const { displayTransform, reset, triggerEscape, stateRef, draggingRef, setOnWallHit } = useScreenMovement(speedRef, zoneRef, areaRef, focusPausedRef, holdRef);
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
      focusRef.current = next; focusPausedRef.current = next.enabled;
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
  // 4순위(기본)는 보호 중이거나 더 높은 순위가 떠 있으면 대기 없이 버려진다. 높은 순위는 낮은 순위를 바로 대체한다.
  // 대화 답변(2)은 마우스가 펫·말풍선 위에 있는 동안 사라지지 않고, 벗어나면 2초 뒤 사라진다. 사라진 뒤에는 보호 시간(답변 20초·날씨 안내 10초)이 이어진다.
  const showBubble = useCallback((text: string, newMood = 'normal', colorize = false, ms = 4000, level: BubbleLevel = LEVEL.OTHER) => {
    const now = Date.now();
    const state: ProtectState = { talkOpen: talkOpenRef.current, forceUntil: forceRef.current?.until ?? 0, active: activeBubbleRef.current, protectUntil: protectUntilRef.current };
    if (!admit(state, level, now)) return;   // 4순위는 보호 중이면, 어떤 순위든 더 높은 순위(물어서 보여 주는 운세·날씨 포함)가 떠 있으면 버린다
    if (level === LEVEL.ANSWER) forceRef.current = null;          // 새 답변은 이전에 붙잡아 둔 운세·날씨 줄을 대체한다
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    activeBubbleRef.current = { level, until: now + ms };
    if (level <= LEVEL.BRIEFING) holdRef.current = true;
    setBubble(text);
    setBubbleKey(k => k + 1);
    setMood(newMood);
    setBubbleStyle(colorize ? rand(BUBBLE_COLORS) : null);
    const finish = () => {
      const t = Date.now();
      if (level === LEVEL.ANSWER && hoverExtends(now, hoverRef.current.over, hoverRef.current.leftAt, t)) {   // 마우스 올림 연장(총 20초 한도)
        if (activeBubbleRef.current) activeBubbleRef.current.until = t + 400;
        bubbleTimerRef.current = setTimeout(finish, 400);
        return;
      }
      if (activeBubbleRef.current && activeBubbleRef.current.level === level) activeBubbleRef.current = null;
      const tail = tailFor(level); if (tail) protectUntilRef.current = Math.max(protectUntilRef.current, t + tail);
      setBubble(null);
      setBubbleStyle(null);
      setMood('normal');
    };
    bubbleTimerRef.current = setTimeout(finish, ms);
  }, []);

  // 메인이 보내는 안내 말풍선(예: 온보딩 직후 "우클릭하면 설정을 열 수 있어요")
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
        if (!focusRef.current.enabled && !stateRef.current.escaping && !isSleepingRef.current && !isProt()) {   // 초집중 모드·대화 보호 중에는 반짝임 없음
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
        if (!focusRef.current.enabled && !isSleepingRef.current && !stateRef.current.escaping && !isProt()) {   // 초집중 모드·대화 보호 중에는 낮잠 연출 없음
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
        if (!focusRef.current.enabled && !stateRef.current.escaping && !isSleepingRef.current && !isProt()) {   // 초집중 모드·대화 보호 중에는 순간이동 없음
          // 연기 효과 후 반대편으로 이동
          setMotionClass('motion-teleport-out');
          setTimeout(async () => {
            if (isProt()) { setMotionClass(''); return; }   // 연기 효과 사이에 보호가 시작됐으면 이동하지 않는다
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
            if (isProt()) { setMotionClass(''); return; }   // 디스플레이 정보를 기다리는 사이에 보호가 시작됐으면 이동하지 않는다
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
    hoverRef.current.over = true;           // 답변이 떠 있는 동안 마우스가 펫 위에 있으면 사라지지 않는다
    if (focusRef.current.enabled) return;   // 초집중 모드에서는 도망가지 않는다
    if (mouseNearTimer.current) clearTimeout(mouseNearTimer.current);
    mouseNearTimer.current = setTimeout(() => {
      if (!stateRef.current.escaping && !isProt()) {   // 대화 보호 중에는 도망(위치 이동)도 하지 않는다
        triggerEscape();
        const lines = isCustomMode ? CUSTOM_ESCAPE : animal.escapeLines;
        showBubble(rand(lines), 'scared');
      }
    }, 2000);
  }, [triggerEscape, showBubble, animal, isCustomMode, stateRef]);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = { over: false, leftAt: Date.now() };   // 벗어난 뒤 2초 뒤에 답변이 사라진다
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
  useEffect(() => {
    const api = window.electronAPI;
    api?.getAlertState?.().then(active => setAlertActive(!!active)).catch(() => {});
    const off = api?.onAlertState?.(active => setAlertActive(active));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  // ★ 말풍선 엔진: 내 메시지를 순서대로 하나씩(표시 시간·주기 설정), 빈 간격에는 시계. 알림 중에는 시간이 멈췄다가 이어서 진행한다.
  useEffect(() => {
    let elapsed = 0, last = Date.now(), sig = '';
    let curKind: IdleKind | null = null, curIdx = -1, curText = '', key = 0;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(now - last, 1500);   // 절전 복귀처럼 큰 간격은 잘라서 메시지를 한꺼번에 건너뛰지 않는다
      last = now;
      const cur = settingsRef.current;
      const msgs = cleanBubbleMessages(cur.bubbleMessages);
      const show = clampTo(cur.bubbleShowSec, BUBBLE_SHOW_RANGE, 5) * 1000;
      const gap = clampTo(cur.bubbleGapSec, BUBBLE_GAP_RANGE, 30) * 1000;
      const nextSig = `${show}/${gap}/${msgs.length}`;
      if (nextSig !== sig) { sig = nextSig; elapsed = 0; }   // 표시 시간·주기·메시지 수가 바뀌면 처음부터 다시 돈다
      const paused = alertRef.current || toastActiveRef.current;
      if (!paused) elapsed += dt;
      let kind: IdleKind | null = null, idx = -1, text = '';
      // 펫에게 물어서 지금 보여 주는 운세·날씨(대화 답변, 2순위): 마우스가 펫·말풍선 위에 있으면 계속 붙잡고, 끝나면 보호 시간(20초)으로 넘어간다
      if (forceRef.current && hoverExtends(forceRef.current.since, hoverRef.current.over, hoverRef.current.leftAt, now)) forceRef.current.until = Math.max(forceRef.current.until, now + 400);   // 마우스 올림 연장(총 20초 한도)
      if (forceRef.current && now >= forceRef.current.until) { forceRef.current = null; protectUntilRef.current = Math.max(protectUntilRef.current, now + PROTECT_TAIL_MS[2]); }
      const force = forceRef.current;
      const lowBlocked = isProtectedFn({ talkOpen: talkOpenRef.current, forceUntil: 0, active: activeBubbleRef.current, protectUntil: protectUntilRef.current }, now);   // 답변·안내가 떠 있거나 사라진 뒤 보호 시간
      if (!paused && !focusRef.current.enabled && (force || (cur.bubbleEnabled !== false && !lowBlocked && now >= quietUntilRef.current))) {   // 초집중 모드에서는 말풍선이 뜨지 않는다(시계·진행 바는 따로 표시). 답변은 "말풍선 사용"을 꺼도 보여 준다
        const d = new Date();
        const phase = elapsed % gap, winStart = msgs.length ? show : 0;
        const inIdleWindow = show >= gap || (phase >= winStart && phase < winStart + show);   // 메시지가 있으면 메시지 다음 차례, 없으면 매 주기의 첫 표시 시간
        if (!force && msgs.length && (show >= gap || phase < show)) {
          kind = 'message'; idx = Math.floor(elapsed / gap) % msgs.length; text = msgs[idx];
        } else if (force || (cur.bubbleClock !== false && inIdleWindow)) {
          const off = cleanOffKinds(cur.bubbleOffKinds);
          const weatherReady = cur.weatherEnabled === true && cur.weatherConsent === true && !!weatherRef.current;
          const slot = Math.floor(elapsed / gap);
          if (force) { mixRef.current = { slot, kind: force.kind, last: mixRef.current.last }; }
          else if (mixRef.current.slot !== slot || mixRef.current.kind === null || (mixRef.current.kind === 'weather' && !weatherReady) || (mixRef.current.kind && off.includes(mixRef.current.kind))) {
            const k = pickKind({ off, weatherReady, last: mixRef.current.last });
            mixRef.current = { slot, kind: k, last: k ?? mixRef.current.last };
            fortunePageRef.current = 0; weatherPageRef.current = 0;
            if (k === 'phrase') lastPhraseRef.current = randomPhrase(lastPhraseRef.current);
            if (k === 'fortune') birthAskRequestRef.current();
          }
          const k = mixRef.current.kind;
          if (k === 'clock') { kind = 'clock'; text = clockText(); }
          else if (k === 'phrase') { kind = 'phrase'; idx = slot; text = lastPhraseRef.current ?? ''; }
          else if (k === 'progress') { kind = 'progress'; text = ''; }   // 막대는 자기 안에서 분마다 갱신
          else if (k === 'fortune') { const pages = fortuneFor(d, undefined, cur.fortuneBirth).pages; kind = 'fortune'; idx = fortunePageRef.current % pages.length; text = pages[idx]; }
          else if (k === 'weather' && weatherRef.current) { const lines = weatherLines(weatherRef.current.data, d); kind = 'weather'; idx = Math.min(weatherPageRef.current, lines.length - 1); text = lines[idx]; }
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

  // ★ 날씨: 켜짐 + 동의 + 도시가 모두 있을 때만 메인에서 받아 온다(요청은 메인이 하고 30분 캐시·실패 처리를 맡는다. 여기서는 1분마다 캐시를 살짝 확인할 뿐이다).
  const weatherOn = settings.weatherEnabled === true && settings.weatherConsent === true;
  const weatherCity = weatherOn ? cityById(settings.weatherCityId) : null;
  const weatherCityId = weatherCity?.id ?? '';
  useEffect(() => {
    weatherRef.current = null;
    if (!weatherCity) return;
    let stopped = false;
    const refresh = () => {
      const last = weatherRef.current;
      if (last && Date.now() - last.at < 15 * 60 * 1000) return;
      window.electronAPI?.getWeather?.(weatherCity.lat, weatherCity.lon)
        .then(r => { if (!stopped && r && r.data) weatherRef.current = { data: r.data, at: Date.now() }; })
        .catch(() => {});   // 조용히 건너뜀
    };
    refresh();
    const timer = setInterval(refresh, 60 * 1000);
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherCityId]);

  // 아침(출근 30분 전~출근 후 90분)과 퇴근길(퇴근 30분 전~퇴근) 안내를 하루에 한 번씩. 초집중 모드·알림 중에는 미루고 다음 확인 때 다시 시도한다.
  useEffect(() => {
    const toMin = (hm: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    // 아침·퇴근길 날씨 안내(3순위): 떠 있는 동안 4순위가 덮지 못하고, 사라진 뒤 10초 동안 4순위 말풍선과 이동을 쉰다(showBubble이 처리)
    const announce = (text: string) => { showBubble(text, 'happy', false, BRIEFING_MS, LEVEL.BRIEFING); };
    const check = () => {
      const cur = settingsRef.current;
      if (cur.bubbleEnabled === false || focusRef.current.enabled || alertRef.current || toastActiveRef.current) return;   // 초집중 모드·알림 중에는 미루고 다음 확인 때 다시 시도한다
      if (answerBusyFn({ talkOpen: talkOpenRef.current, forceUntil: forceRef.current?.until ?? 0, active: activeBubbleRef.current, protectUntil: 0 }, Date.now())) return;   // 대화 답변(2순위)이 떠 있는 동안은 미룬다
      const now = new Date(), n = now.getHours() * 60 + now.getMinutes();
      const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      // 생일 당일 축하(그날 한 번). 생일은 이 PC 안에서만 쓰고 밖으로 보내지 않는다.
      const birth = readBirth(cur.fortuneBirth, now);
      if (birth && isBirthday(birth, now) && readTalkState().birthdayShown !== day) { writeTalkState({ birthdayShown: day }); announce(BIRTHDAY_MESSAGE); return; }
      const w = weatherRef.current;
      if (!w || cur.weatherEnabled !== true || cur.weatherConsent !== true || !cityById(cur.weatherCityId)) return;   // 날씨가 꺼져 있으면 아침·퇴근길 안내에서 빠진다
      let shown: { day?: string; morning?: boolean; evening?: boolean } = {};
      try { shown = JSON.parse(localStorage.getItem('weatherShown') || '{}'); } catch {}
      if (shown.day !== day) shown = { day };
      const ws = toMin(cur.workStart), lv = toMin(cur.leaveTime);
      let text: string | null = null;
      if (ws !== null && !shown.morning && n >= ws - 30 && n <= ws + 90) { shown.morning = true; text = morningText(w.data, now); }
      else if (lv !== null && !shown.evening && n >= lv - 30 && n <= lv) { shown.evening = true; text = eveningText(w.data, now); }
      if (!text) return;
      try { localStorage.setItem('weatherShown', JSON.stringify(shown)); } catch {}
      announce(text);
    };
    const timer = setInterval(check, 30 * 1000);
    return () => clearInterval(timer);
  }, [showBubble]);

  // ★ 펫에게 말 걸기(더블클릭·트레이 메뉴): 초집중 모드·알람 울림·알람 팝업·미리 알림 토스트 중에는 열지 않는다.
  // 열려 있는 동안만 클릭 통과 중에도 입력·키보드를 받고, 닫히면 원래대로 돌아간다. 대화 내용은 저장하지 않는다(바뀐 설정만 저장).
  const talkBlocked = focus.enabled || alertActive || !!toast;
  const openTalk = useCallback((start: 'menu' | 'weather' | 'birth' = 'menu') => {
    if (focusRef.current.enabled || alertRef.current || toastActiveRef.current) return;
    setBirthAsk(false); setTalk(start);
  }, []);
  useEffect(() => { if (talkBlocked) { setTalk(null); setBirthAsk(false); } }, [talkBlocked]);
  useEffect(() => { talkOpenRef.current = !!talk; if (talk) holdRef.current = true; }, [talk]);   // 말 걸기 창이 열리면 바로 펫을 멈춘다
  // 알람 울림·알림 카드·미리 알림 토스트는 대화 보호와 상관없이 즉시 최우선이다: 붙잡아 둔 답변·보호 시간을 풀어 평소로 돌아간다(알림 표시 자체는 이 규칙과 무관하게 항상 위에 뜬다)
  useEffect(() => { if (alertActive || toast) { forceRef.current = null; protectUntilRef.current = 0; holdRef.current = false; } }, [alertActive, toast]);
  // 보호 상태를 0.25초마다 반영: 물리 이동 루프(holdRef), 제자리 바운스(holding), 낮잠 깨우기, 메인의 야르 타임 보류
  useEffect(() => {
    let prev = false;
    const sync = () => {
      const p = !focusRef.current.enabled && !alertRef.current && !toastActiveRef.current && isProt();
      holdRef.current = p;
      if (p === prev) return;
      prev = p; setHolding(p);
      window.electronAPI?.setPetProtect?.(p);
      if (p && isSleepingRef.current) { isSleepingRef.current = false; setMotionClass(''); }   // 낮잠 중이었으면 깨운다(보호 중에는 낮잠에 들지 않는다)
    };
    sync();
    const t = setInterval(sync, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!talk) return;
    window.electronAPI?.setPetInteractive?.(true);
    return () => { window.electronAPI?.setPetInteractive?.(false); };
  }, [talk]);
  useEffect(() => window.electronAPI?.onOpenTalk?.((start) => openTalk(start === 'weather' ? 'weather' : 'menu')), [openTalk]);   // 트레이 메뉴

  // 대화로 바뀐 설정(날씨·생일·빼기)만 저장한다. 설정창이 열려 있으면 storage 이벤트로 같이 반영된다.
  const saveOwned = useCallback((patch: SettingsPatch) => {
    try {
      const raw = JSON.parse(localStorage.getItem('petSettings') || '{}');
      Object.assign(raw, patch);
      localStorage.setItem('petSettings', JSON.stringify(raw));
      settingsRef.current = { ...settingsRef.current, ...patch } as Settings;
      setSettings(s => ({ ...s, ...patch }));
      window.electronAPI?.syncSettings({ ...DEFAULT_SETTINGS, ...raw });
    } catch {}
  }, []);
  const talkCtx = (): TalkCtx => {
    const s = settingsRef.current;
    return { weatherEnabled: s.weatherEnabled === true, weatherConsent: s.weatherConsent === true, weatherCityId: s.weatherCityId || '', fortuneBirth: s.fortuneBirth || '', offKinds: cleanOffKinds(s.bubbleOffKinds), today: new Date() };
  };

  // 물어서 보여 주기: 날씨(값이 없으면 지금 받아 옴)·운세는 말풍선 엔진이 잠시 붙잡아 보여 주고(눌러서 다음 줄), 한마디는 바로 한 줄
  const showWeatherNow = useCallback(async () => {
    const cur = settingsRef.current, city = cityById(cur.weatherCityId);
    if (!city || cur.weatherEnabled !== true || cur.weatherConsent !== true) return;
    let w = weatherRef.current;
    if (!w || Date.now() - w.at > 15 * 60 * 1000) {
      try { const r = await window.electronAPI?.getWeather?.(city.lat, city.lon); if (r && r.data) { w = { data: r.data, at: Date.now() }; weatherRef.current = w; } } catch { /* 조용히 건너뜀 */ }
    }
    const msg = '날씨를 아직 못 가져왔어요. 잠시 뒤에 다시 물어봐 줄래요?';
    if (!w) { showBubble(msg, 'normal', false, answerMs(msg), LEVEL.ANSWER); return; }
    // 대화 답변(2순위): 낮은 순위 말풍선을 바로 치우고, 줄마다 글자 수에 비례한 시간(7~15초) 동안 붙잡는다
    dropBubble(); weatherPageRef.current = 0; setForce('weather', weatherLines(w.data, new Date())[0]);
  }, [showBubble]);
  // 물어서 보여 주는 말풍선이 떠 있던 반응·낮잠 말풍선에 가려지지 않게 먼저 치운다
  const dropBubble = () => { if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current); activeBubbleRef.current = null; setBubble(null); setBubbleStyle(null); setMood('normal'); };
  const showFortuneNow = useCallback(() => {
    dropBubble(); fortunePageRef.current = 0;
    setForce('fortune', fortuneFor(new Date(), undefined, settingsRef.current.fortuneBirth).pages[0]);
  }, []);
  const showPhraseNow = useCallback(() => { lastPhraseRef.current = randomPhrase(lastPhraseRef.current); showBubble(lastPhraseRef.current, 'happy', false, answerMs(lastPhraseRef.current), LEVEL.ANSWER); }, [showBubble]);
  const talkShow = useCallback((what: ShowKind) => { if (what === 'weather') void showWeatherNow(); else if (what === 'fortune') showFortuneNow(); else showPhraseNow(); }, [showWeatherNow, showFortuneNow, showPhraseNow]);
  // 대화 답변 말풍선(2순위). 이어서 운세·날씨를 보여 줄 때의 짧은 확인 말("○○군요!")은 3.5초, 그 외 답변은 글자 수에 비례해 7~15초
  const talkSay = useCallback((text: string, then?: ShowKind) => {
    showBubble(text, 'happy', false, then ? 3500 : answerMs(text), LEVEL.ANSWER);
    if (then) setTimeout(() => talkShow(then), 3700);
  }, [showBubble, talkShow]);

  // 대화 상태를 즉시 끝낸다(꼬리 없이): 말 걸기 창·답변/안내 말풍선·붙잡은 운세·날씨·보호 시간을 모두 치우고 제자리 모션을 끝내 이동과 4순위 말풍선을 바로 재개한다.
  // 자동 닫힘·펫/빈 곳 더블클릭·창 blur·Esc·닫기가 이 함수로 온다. 답변이 자연스럽게 사라진 경우에는 이 함수가 아니라 showBubble/엔진의 짧은 꼬리(5초/3초)가 적용된다.
  const endConversation = useCallback(() => {
    forceRef.current = null; protectUntilRef.current = 0;
    const a = activeBubbleRef.current;
    if (a && a.level <= LEVEL.BRIEFING) { if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current); activeBubbleRef.current = null; setBubble(null); setBubbleStyle(null); setMood('normal'); }
    talkOpenRef.current = false; setTalk(null); setBirthAsk(false);
    holdRef.current = false; setHolding(false); window.electronAPI?.setPetProtect?.(false);
    // 떠 있던 운세·날씨 줄(자동 섞기의 같은 칸)이 그대로 남아 보이지 않게 정리하고, 잠깐(1.5초) 쉬었다가 평소 말풍선을 재개한다
    mixRef.current = { slot: -1, kind: null, last: mixRef.current.last }; fortunePageRef.current = 0; weatherPageRef.current = 0;
    setIdleBubble(null); quietUntilRef.current = Date.now() + 1500;
  }, []);
  // 펫 창 안의 빈 곳(펫·말풍선·말 걸기 창이 아닌 곳)을 더블클릭하면 대화 상태 종료. 창 밖(바탕화면·다른 앱)은 이 앱이 감지할 수 없다.
  useEffect(() => {
    const onDbl = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el && el.closest && el.closest('.cat-area, .pet-talk, .bubble, .pet-toast')) return;
      if (inConversationFn(protectState(), Date.now())) endConversation();
    };
    document.addEventListener('dblclick', onDbl);
    return () => document.removeEventListener('dblclick', onDbl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endConversation]);
  // 말 걸기 창이 열려 있을 때 포커스가 펫 창 밖으로 나가면(다른 앱·바탕화면 클릭) 대화 상태 종료
  useEffect(() => {
    if (!talk) return;
    window.addEventListener('blur', endConversation);
    return () => window.removeEventListener('blur', endConversation);
  }, [talk, endConversation]);

  // 운세 말풍선이 나왔을 때 생일이 없으면 한 번 묻는다. "다음에요"(또는 25초 무응답·닫기)는 7일 동안 다시 묻지 않는다.
  birthAskRequestRef.current = () => {
    const cur = settingsRef.current;
    if (readBirth(cur.fortuneBirth) || focusRef.current.enabled || alertRef.current || toastActiveRef.current || isProt()) return;   // 대화 보호 중에는 묻지 않는다
    if (isSnoozed(readTalkState(), new Date())) return;
    setBirthAsk(true);
  };
  const birthLater = useCallback(() => { writeTalkState({ birthSnoozeUntil: snoozedUntil(new Date()) }); setBirthAsk(false); }, []);
  useEffect(() => {
    if (!birthAsk) return;
    const t = setTimeout(birthLater, 25000);
    return () => clearTimeout(t);
  }, [birthAsk, birthLater]);

  // 새 버전을 처음 실행한 뒤 한 번만 대화 기능을 알린다(초집중 모드·알림 중에는 미루고 다음에 다시 시도)
  useEffect(() => {
    const t = setInterval(() => {
      if (readTalkState().introShown) { clearInterval(t); return; }
      if (focusRef.current.enabled || alertRef.current || toastActiveRef.current || settingsRef.current.bubbleEnabled === false) return;
      writeTalkState({ introShown: true });
      showBubble('더블클릭하면 저랑 얘기할 수 있어요 💬', 'happy', false, 7000);
      clearInterval(t);
    }, 5000);
    return () => clearInterval(t);
  }, [showBubble]);

  // ★ 졸림방지 - 항상 실행, 내부에서 최신 ref 참조
  useEffect(() => {
    // 최소 주기로 돌면서 내부에서 설정 체크
    const CHECK_INTERVAL = 1000; // 1초마다 체크
    let elapsed = 0;

    const timer = setInterval(() => {
      const s = settingsRef.current;
      if (!s.distractEmoji || focusRef.current.enabled) { elapsed = 0; return; }   // 초집중 모드에서는 졸림 방지 이모지·말풍선 없음
      if (stateRef.current.escaping) return;
      if (isProt()) { elapsed = 0; return; }   // 대화 보호 중에는 졸림 방지 이모지·말풍선·기분 변화를 하지 않는다(대기 없이 버림)

      elapsed += CHECK_INTERVAL;
      const target = Math.max(10, s.distractInterval) * 1000;
      if (elapsed < target) return;
      elapsed = 0;

      const imgs = activeImagesRef.current;
      const custom = isCustomModeRef.current;
      const anim = animalRef.current;

      if (custom && imgs.length > 0) {
        // 커스텀 모드: 말풍선 (사진 교체는 교체 주기 설정을 따라 메인이 따로 처리한다)
        if (s.bubbleEnabled !== false && nagOk()) showBubble(pickOwnMessage() ?? getLegacyNag(), 'happy', true);
        // 1.5초 뒤 기습 이모지
        setTimeout(() => {
          if (!stateRef.current.escaping && !isProt()) {
            setAmbushEmoji(rand(AMBUSH_EMOJIS));
            setTimeout(() => setAmbushEmoji(null), 1500);
          }
        }, 1500);
      } else {
        // 일반 모드
        if (Math.random() < 0.3) {
          setAmbushEmoji(rand(AMBUSH_EMOJIS));
          if (s.bubbleEnabled !== false && nagOk()) showBubble(pickOwnMessage() ?? getLegacyNag(), 'surprised', true);
          setTimeout(() => setAmbushEmoji(null), 1800);
        } else {
          const moods = ['happy','sleepy','party','love','cool','angry'];
          const newMood = rand(moods);
          setMood(newMood);
          if (s.bubbleEnabled !== false && nagOk()) showBubble(pickOwnMessage() ?? getLegacyNag(), newMood, true);
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
    showToast(`활동 구역이 ${label}${particle} 정해져 있어요. 우클릭해서 바꿀 수 있어요`, ZONE_HINT_TOAST_MS);
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
    // 더블클릭: 펫에게 말 걸기 창(예전 더블클릭 놀람 반응을 대신한다). 직접 눌렀을 때만 열리고, 초집중·알림 중에는 openTalk가 막는다.
    const now = Date.now();
    const isDoubleClick = now - lastClickTime.current < DOUBLE_CLICK_MS;
    lastClickTime.current = isDoubleClick ? 0 : now;
    if (singleClickTimerRef.current) { clearTimeout(singleClickTimerRef.current); singleClickTimerRef.current = null; }   // 두 번째 클릭이 오면 첫 클릭의 반응은 취소
    // 펫 더블클릭: 대화 상태(말 걸기 창 열림·답변 표시·보호 꼬리 중)면 끝내고, 아니면 말 걸기를 연다
    if (isDoubleClick) { if (inConversationFn(protectState(), Date.now())) endConversation(); else openTalk('menu'); return; }
    // 한 번 클릭은 더블클릭인지 기다린 뒤(짧은 지연) 처리한다: 더블클릭의 첫 클릭이 반응 말풍선을 띄워 운세·날씨 말풍선을 덮지 않게
    singleClickTimerRef.current = setTimeout(() => {
      singleClickTimerRef.current = null;
      // 한 번 클릭 우선순위: 운세 말풍선이 떠 있으면 다음 줄 → 날씨 말풍선이 떠 있으면 현재 → 최고/최저 → 강수 확률 → 그 외에는 평소 반응
      const t = Date.now(), d = new Date();
      // 줄을 넘기면 그 줄의 글자 수에 맞춰(7~15초) 다시 붙잡는다. 사용자가 직접 눌러 읽는 것이라 대화 답변(2순위)으로 다룬다.
      if (!bubble && !alertActive && !toast && idleBubble?.kind === 'fortune') {
        const pages = fortuneFor(d, undefined, settingsRef.current.fortuneBirth).pages;
        fortunePageRef.current += 1;
        setForce('fortune', pages[fortunePageRef.current % pages.length]);
        return;
      }
      if (!bubble && !alertActive && !toast && idleBubble?.kind === 'weather' && weatherRef.current) {
        const lines = weatherLines(weatherRef.current.data, d);
        if (weatherPageRef.current < lines.length - 1) { weatherPageRef.current += 1; setForce('weather', lines[weatherPageRef.current]); return; }
        weatherPageRef.current = 0; forceRef.current = null;   // 마지막 줄 다음 클릭은 평소 반응으로(남은 보호 시간 동안은 4순위라 말풍선이 뜨지 않는다)
        protectUntilRef.current = Math.max(protectUntilRef.current, t + PROTECT_TAIL_MS[2]);
      }
      const reactions = isCustomMode ? CUSTOM_REACTIONS : animal.reactions;
      clickCount.current += 1;
      const threshold = 2 + Math.floor(Math.random() * 2);
      if (clickCount.current >= threshold) {
        clickCount.current = 0;
        spawnParticles(10);
      }
      showBubble(rand(reactions), 'surprised');
    }, DOUBLE_CLICK_MS);
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
  // 대화 답변(2순위) 말풍선: 마우스를 올리면 사라지지 않게 마우스 이벤트를 받는다(CSS에서 data-answer일 때만 pointer-events 켬)
  const answerShown = !!shownBubble && ((!!bubble && activeBubbleRef.current?.level === LEVEL.ANSWER) || (!bubble && !!idleBubble && !!forceRef.current));

  return (
    <div className="pet-root" data-focus={focus.enabled ? '' : undefined}>
      {toast && (
        <div className="pet-toast" role="status" key={toast.id}>
          <Bell className="pet-toast-icon" strokeWidth={1.5} aria-hidden />
          <span>{toast.msg.replace(/(오전|오후) (?=\d)/g, '$1\u00A0')}</span>
        </div>
      )}
      {talk && <PetTalk ctx={talkCtx()} start={talk} onApply={saveOwned} onSay={talkSay} onShow={talkShow} onClose={() => setTalk(null)} onCancel={endConversation} />}
      {birthAsk && !talk && <PetBirthAsk onYes={() => { setBirthAsk(false); setTalk('birth'); }} onLater={birthLater} />}
      <div className="pet-container">
        <div className="bubble-slot" style={{ marginBottom: `${-8 + (petSize - 100) * 0.3}px` }}>
            {shownBubble && (
              <div className="bubble" key={shownBubble.key} data-answer={answerShown ? '' : undefined}
                onMouseEnter={answerShown ? () => { hoverRef.current.over = true; } : undefined}
                onMouseLeave={answerShown ? () => { hoverRef.current = { over: false, leftAt: Date.now() }; } : undefined}
                style={shownBubble.style ? { background: shownBubble.style.bg, color: shownBubble.style.text, borderColor: 'transparent' } : {}}>
                {shownBubble.kind === 'progress'
                  ? <DayProgressBar workStart={settings.workStart} lunchTime={settings.lunchTime} leaveTime={settings.leaveTime} />
                  : <span className={`bubble-text${shownBubble.kind === 'clock' ? ' bubble-clock' : ''}`}>{shownBubble.text}</span>}
                <div className="bubble-tail"
                  style={shownBubble.style ? { borderTopColor: shownBubble.style.bg } : {}} />
              </div>
            )}
          </div>
        {focus.enabled && !alertActive && <FocusClock seconds={focus.seconds} />}   {/* 초집중 모드: 시계는 버디 위, 진행 바는 버디 바로 아래 */}
        <div className="cat-wrapper" data-hold={holding ? '' : undefined}>
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
        {focus.enabled && !alertActive && <DayProgressBar compact workStart={settings.workStart} lunchTime={settings.lunchTime} leaveTime={settings.leaveTime} />}
      </div>
    </div>
  );
}
