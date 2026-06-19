import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import '../styles/pet.css';
import CatEmoji from '../components/CatEmoji';
import { getAnimal } from '../data/animals';

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
  useCustomMode: boolean;
  moveSpeed: number;
  zone: number;
  yarEnabled: boolean;
  yarInterval: number;
  buddyMode: string;
  size: number;
}

const DEFAULT_SETTINGS: Settings = {
  distractEmoji: true, workStart: '09:00', workEnd: '18:00',
  animalId: 'cat', customImages: [null, null, null],
  distractInterval: 30, imageRotateInterval: 60, useCustomMode: false, moveSpeed: 5, zone: 0,
  yarEnabled: false, yarInterval: 60, buddyMode: 'buddy', size: 100,
};

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

// ── 물리 엔진 ─────────────────────────────────────────────────────
interface PhysicsState {
  wx: number; wy: number; vx: number; vy: number;
  rotate: number; vr: number; scale: number; targetScale: number; escaping: boolean;
}

function useScreenMovement(speedRef: React.MutableRefObject<number>, zoneRef: React.MutableRefObject<number>) {
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
    s.wy = window.screen.height - 230;
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
    const sw = window.screen.width, sh = window.screen.height;
    stateRef.current.wx = sw - 230;
    stateRef.current.wy = sh - 230;

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
    const tick = (now: number) => {
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
      const zone = zoneRef.current || 0;
      const minX = (zone === 2 || zone === 4) ? Math.floor(sw / 2) : 0;
      const maxX = (zone === 1 || zone === 3) ? Math.floor(sw / 2) - 190 : sw - 190;
      const minY = (zone === 3 || zone === 4) ? Math.floor(sh / 2) : 0;
      const maxY = (zone === 1 || zone === 2) ? Math.floor(sh / 2) - 190 : sh - 190;
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
      if (escapingTimerRef.current) clearTimeout(escapingTimerRef.current);
    };
  }, []);

  return { displayTransform, reset, triggerEscape, stateRef, draggingRef, setOnWallHit: (fn: ()=>void) => { onWallHitRef.current = fn; } };
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function PetPage() {
  const [bubble, setBubble] = useState<string | null>(null);
  const [bubbleKey, setBubbleKey] = useState(0);
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle | null>(null);
  const [mood, setMood] = useState('normal');
  const [particles, setParticles] = useState<Particle[]>([]);
  const [ambushEmoji, setAmbushEmoji] = useState<string | null>(null);
  const [customImgIndex, setCustomImgIndex] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
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
  const [petSize, setPetSize] = useState(settings.size || 100);
  const sizeRef = useRef(100);
  useEffect(() => { speedRef.current = settings.moveSpeed || 5; }, [settings.moveSpeed]);
  useEffect(() => { zoneRef.current = settings.zone || 0; }, [settings.zone]);
  useEffect(() => {
    const s = settings.size || 100;
    sizeRef.current = s;
    setPetSize(s);
    // 창 크기도 버디 크기에 맞게 조정
    const base = 190;
    const newSize = Math.round(base * s / 100);
    window.electronAPI?.resizePetWindow(newSize, newSize);
  }, [settings.size]);

  const { displayTransform, reset, triggerEscape, stateRef, draggingRef, setOnWallHit } = useScreenMovement(speedRef, zoneRef);
  const { rotate, scale } = displayTransform;

  const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const activeImages = useMemo(
    () => (settings.customImages || []).filter(Boolean) as string[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(settings.customImages)]
  );
  const isCustomMode = settings.useCustomMode && activeImages.length > 0;
  const animal = getAnimal(settings.animalId);

  // ── 설정 로드 (2초마다 폴링) ─────────────────────────────────────
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('petSettings');
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  // ── 말풍선 ────────────────────────────────────────────────────────
  const showBubble = useCallback((text: string, newMood = 'normal', colorize = false) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble(text);
    setBubbleKey(k => k + 1);
    setMood(newMood);
    setBubbleStyle(colorize ? rand(BUBBLE_COLORS) : null);
    window.electronAPI?.resizePetWindow(240, 230);
    bubbleTimerRef.current = setTimeout(() => {
      setBubble(null);
      setBubbleStyle(null);
      setMood('normal');
      window.electronAPI?.resizePetWindow(190, 190);
    }, 4000);
  }, []);

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
        if (!stateRef.current.escaping && !isSleepingRef.current) {
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
        if (!isSleepingRef.current && !stateRef.current.escaping) {
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
        if (!stateRef.current.escaping && !isSleepingRef.current) {
          // 연기 효과 후 반대편으로 이동
          setMotionClass('motion-teleport-out');
          setTimeout(() => {
            const sw = window.screen.width;
            const sh = window.screen.height;
            // 현재 위치 반대편으로
            const newX = stateRef.current.wx < sw / 2 ? sw - 230 : 40;
            const newY = Math.round(Math.random() * (sh - 250) + 40);
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

  // ── 잔소리 (6초마다) ─────────────────────────────────────────────
  useEffect(() => {
    const getNag = () => {
      const special = getSpecialMessages();
      if (isCustomMode) return rand([...CUSTOM_NAGS, ...special]);
      const timeMsgs = TIME_MESSAGES[getTimeCategory(settings.workStart, settings.workEnd)] || TIME_MESSAGES.work;
      return rand([...animal.nags, ...timeMsgs, ...special]);
    };
    const t1 = setTimeout(() => showBubble(getNag(), 'normal'), 2000);
    const t2 = setInterval(() => showBubble(getNag(), 'normal'), 6000);
    const handleCallPet = () => { reset(); showBubble('여기 있어요! 🐾', 'happy'); };
    window.addEventListener('call-pet', handleCallPet);
    return () => {
      clearTimeout(t1); clearInterval(t2);
      window.removeEventListener('call-pet', handleCallPet);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [showBubble, reset, isCustomMode, settings.workStart, settings.workEnd, animal]);

  // ★ 설정값을 ref에 동기화 → 클로저 문제 해결
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const activeImagesRef = useRef(activeImages);
  useEffect(() => { activeImagesRef.current = activeImages; }, [activeImages]);

  const isCustomModeRef = useRef(isCustomMode);
  useEffect(() => { isCustomModeRef.current = isCustomMode; }, [isCustomMode]);

  const animalRef = useRef(animal);
  useEffect(() => { animalRef.current = animal; }, [animal]);

  // ★ 졸림방지 - 항상 실행, 내부에서 최신 ref 참조
  useEffect(() => {
    // 최소 주기로 돌면서 내부에서 설정 체크
    const CHECK_INTERVAL = 1000; // 1초마다 체크
    let elapsed = 0;

    const timer = setInterval(() => {
      const s = settingsRef.current;
      if (!s.distractEmoji) { elapsed = 0; return; }
      if (stateRef.current.escaping) return;

      elapsed += CHECK_INTERVAL;
      const target = Math.max(10, s.distractInterval) * 1000;
      if (elapsed < target) return;
      elapsed = 0;

      const imgs = activeImagesRef.current;
      const custom = isCustomModeRef.current;
      const anim = animalRef.current;

      if (custom && imgs.length > 0) {
        // 커스텀 모드: 이미지 로테이션 + MZ 말풍선
        setCustomImgIndex(prev => (prev + 1) % imgs.length);
        showBubble(rand(CUSTOM_NAGS), 'happy', true);
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
          showBubble(rand(custom ? CUSTOM_NAGS : anim.nags), 'surprised', true);
          setTimeout(() => setAmbushEmoji(null), 1800);
        } else {
          const moods = ['happy','sleepy','party','love','cool','angry'];
          const newMood = rand(moods);
          setMood(newMood);
          showBubble(rand(custom ? CUSTOM_NAGS : anim.nags), newMood, true);
          setTimeout(() => setMood('normal'), 2000);
        }
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(timer);
  }, [showBubble, stateRef]); // 마운트 시 1번만 등록, 내부에서 ref로 최신값 읽음

  // ★ 이미지 로테이션 (imageRotateInterval 기준, 졸림방지와 별도)
  useEffect(() => {
    let imgElapsed = 0;
    const timer = setInterval(() => {
      const s = settingsRef.current;
      const imgs = activeImagesRef.current;
      const custom = isCustomModeRef.current;
      if (!custom || imgs.length < 2) { imgElapsed = 0; return; }
      imgElapsed += 1000;
      const target = Math.max(30, s.imageRotateInterval) * 1000;
      if (imgElapsed < target) return;
      imgElapsed = 0;
      setCustomImgIndex(prev => (prev + 1) % imgs.length);
    }, 1000);
    return () => clearInterval(timer);
  }, []); // 마운트 시 1번만

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
        draggingRef.current = false;
        window.electronAPI?.endDrag();
        window.electronAPI?.getPetPosition?.().then((pos) => {
         if (pos) { stateRef.current.wx = pos.x; stateRef.current.wy = pos.y; }
       }).catch(() => {});
      }
    };
    // capture: true로 이벤트 먼저 캐치
    window.addEventListener('mousemove', onMove, { capture: true });
    window.addEventListener('mouseup', onUp, { capture: true });
    return () => {
      window.removeEventListener('mousemove', onMove, { capture: true });
      window.removeEventListener('mouseup', onUp, { capture: true });
    };
  }, [draggingRef]);

  // ── 클릭 ──────────────────────────────────────────────────────────
  const handleCatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (didDrag.current) { didDrag.current = false; return; }
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

  return (
    <div className="pet-root">
      <div className="pet-container">
        <div className="bubble-slot" style={{ marginBottom: `${-8 + (petSize - 100) * 0.3}px` }}>
            {bubble && (
              <div className="bubble" key={bubbleKey}
                style={bubbleStyle ? { background: bubbleStyle.bg, color: bubbleStyle.text, borderColor: 'transparent' } : {}}>
                <span className="bubble-text">{bubble}</span>
                <div className="bubble-tail"
                  style={bubbleStyle ? { borderTopColor: bubbleStyle.bg } : {}} />
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
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
