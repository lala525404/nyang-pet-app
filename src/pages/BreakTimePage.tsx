import { useEffect, useState } from 'react';
import '../styles/breaktime.css';

const LUNCH_EMOJIS = ['🍚', '🍜', '🍣', '🍱', '🍙', '🥪', '🍕', '🍔', '🥗', '🍲', '🍰', '🥘', '🍝', '🍛', '🧋'];
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
  type?: 'lunch' | 'leave';
}

export default function BreakTimePage({ type: propType }: BreakTimePageProps) {
  const [type, setType] = useState<'lunch' | 'leave'>(propType || 'lunch');
  const [sideBursts, setSideBursts] = useState<SideBurst[]>([]);
  const [upBursts, setUpBursts] = useState<UpBurst[]>([]);
  const [visible, setVisible] = useState(true);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const queryString = queryIndex >= 0 ? hash.substring(queryIndex + 1) : '';
    const params = new URLSearchParams(queryString);
    const urlType = params.get('type');
    if (urlType === 'lunch' || urlType === 'leave') {
      setType(urlType);
    }
  }, []);

  useEffect(() => {
    const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    if (type === 'lunch') {
      const emojiSet = LUNCH_EMOJIS;
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

  const label = type === 'lunch' ? '점 심' : '퇴 근';
  const subLabel = type === 'lunch' ? '맛있게 드세요 🍴' : '오늘도 수고했어요 👋';

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
        <div className={`breaktime-text-wrap ${type === 'lunch' ? 'breaktime-text-wrap--lunch' : 'breaktime-text-wrap--leave'}`}>
          <div className="breaktime-text">{label}</div>
          <div className="breaktime-subtext">{subLabel}</div>
        </div>
      )}
    </div>
  );
}
