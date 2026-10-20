import { useEffect, useMemo, useState } from 'react';
import { AlarmClock, LogOut, Utensils } from 'lucide-react';
import '../styles/breaktime.css';
import CatEmoji from '../components/CatEmoji';
import { getAnimal } from '../data/animals';
import { formatTime, loadSettings } from '../utils/settings';

const LUNCH_EMOJIS = ['🍚', '🍜', '🍣', '🍱', '🍙', '🥪', '🍕', '🍔', '🥗', '🍲', '🍰', '🥘', '🍝', '🍛', '🧋'];
const ALARM_EMOJIS = ['⏰', '🔔', '⏰', '🔔', '⏰'];

const LEAVE_EMOJIS = ['🏃', '✨', '🎉', '🎊', '🚀', '🌟', '💨', '🙌', '🔥', '⚡', '🥳', '🎆', '🍾', '🌈', '💃'];

interface SideBurst {
  id: number;
  emoji: string;
  side: 'left' | 'right';
  y: number;
  delay: number;
  duration: number;
  size: number;
  distance: number;
}

interface UpBurst {
  id: number;
  emoji: string;
  x: number;
  delay: number;
  duration: number;
  size: number;
  height: number;
  drift: number;
}

interface BreakTimePageProps {
  type?: 'lunch' | 'leave' | 'alarm';
}

type BreakType = 'lunch' | 'leave' | 'alarm';

// URL 해시(#/breaktime?type=alarm)에서 타입을 첫 렌더부터 바로 읽는다
function readTypeFromHash(fallback?: BreakType): BreakType {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  const queryString = queryIndex >= 0 ? hash.substring(queryIndex + 1) : '';
  const urlType = new URLSearchParams(queryString).get('type');
  if (urlType === 'lunch' || urlType === 'leave' || urlType === 'alarm') return urlType;
  return fallback || 'lunch';
}

export default function BreakTimePage({ type: propType }: BreakTimePageProps) {
  const [type] = useState<BreakType>(() => readTypeFromHash(propType));
  const [sideBursts, setSideBursts] = useState<SideBurst[]>([]);
  const [upBursts, setUpBursts] = useState<UpBurst[]>([]);
  const [visible, setVisible] = useState(true);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    if (type === 'lunch' || type === 'alarm') {
      const emojiSet = type === 'lunch' ? LUNCH_EMOJIS : ALARM_EMOJIS;
      const count = Math.floor(window.innerHeight / 32) + 12;
      const newBursts: SideBurst[] = [];

      for (let i = 0; i < count; i++) {
        newBursts.push({
          id: i,
          emoji: rand(emojiSet),
          side: 'left',
          y: Math.random() * 100,
          delay: Math.random() * 600,
          duration: 900 + Math.random() * 600,
          size: 40 + Math.floor(Math.random() * 44),
          distance: 40 + Math.random() * 30,
        });
      }
      for (let i = 0; i < count; i++) {
        newBursts.push({
          id: count + i,
          emoji: rand(emojiSet),
          side: 'right',
          y: Math.random() * 100,
          delay: Math.random() * 600,
          duration: 900 + Math.random() * 600,
          size: 40 + Math.floor(Math.random() * 44),
          distance: 40 + Math.random() * 30,
        });
      }
      setSideBursts(newBursts);
      setUpBursts([]);
    } else {
      const emojiSet = LEAVE_EMOJIS;
      const count = Math.floor(window.innerWidth / 30) + 16;
      const newBursts: UpBurst[] = Array.from({ length: count }, (_, i) => ({
        id: i,
        emoji: rand(emojiSet),
        x: Math.random() * 104 - 2,
        delay: Math.random() * 500,
        duration: 1100 + Math.random() * 700,
        size: 40 + Math.floor(Math.random() * 48),
        height: 55 + Math.random() * 35,
        drift: Math.random() * 60 - 30,
      }));
      setUpBursts(newBursts);
      setSideBursts([]);
    }

    const textTimer = setTimeout(() => setShowText(true), 200);
    const fadeTimer = setTimeout(() => setVisible(false), 2600);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(fadeTimer);
    };
  }, [type]);

  const settings = useMemo(() => loadSettings(), []);
  const animal = getAnimal(settings.animalId);
  const photos = settings.customImages.filter(Boolean) as string[];
  const photo = settings.useCustomMode && photos.length > 0 ? photos[0] : null;

  const label = type === 'lunch' ? '점심' : type === 'alarm' ? '알람' : '퇴근';
  const subLabel = type === 'lunch' ? '맛있게 드세요' : type === 'alarm' ? '알람이 울렸어요!' : '오늘도 수고했어요';
  const Icon = type === 'lunch' ? Utensils : type === 'alarm' ? AlarmClock : LogOut;
  const meta = type === 'lunch' ? formatTime(settings.lunchTime)
    : type === 'leave' ? formatTime(settings.leaveTime)
    : formatTime(`${new Date().getHours()}:${new Date().getMinutes()}`);

  return (
    <div className={`breaktime-root ${!visible ? 'breaktime-fadeout' : ''}`}>
      {sideBursts.map(b => (
        <div
          key={b.id}
          className={`breaktime-emoji breaktime-emoji--${b.side}`}
          style={{
            top: `${b.y}%`,
            fontSize: b.size,
            animationDelay: `${b.delay}ms`,
            animationDuration: `${b.duration}ms`,
            '--distance': `${b.distance}vw`,
          } as React.CSSProperties}
        >
          {b.emoji}
        </div>
      ))}

      {upBursts.map(b => (
        <div
          key={b.id}
          className="breaktime-emoji breaktime-emoji--up"
          style={{
            left: `${b.x}%`,
            fontSize: b.size,
            animationDelay: `${b.delay}ms`,
            animationDuration: `${b.duration}ms`,
            '--height': `${b.height}vh`,
            '--drift': `${b.drift}px`,
          } as React.CSSProperties}
        >
          {b.emoji}
        </div>
      ))}

      {showText && (
        <div className="bt-center">
          <div className="bt-card" role="status">
            <div className="bt-top">
              <Icon strokeWidth={1.5} aria-hidden />
              <span className="bt-meta">{meta}</span>
            </div>
            <div className="bt-buddy">
              <CatEmoji emoji={animal.emoji} size={144} forceImage customImage={photo} customShape={settings.customShape} />
            </div>
            <div className="bt-word">{label}</div>
            <div className="bt-sub">{subLabel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
