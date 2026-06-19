import { useEffect, useState } from 'react';
import '../styles/yar.css';

const YAR_EMOJIS = [
  '❤️','🧡','💛','💚','💙','💜','🩷','🩵','🤍','💕','💗','💖','💝','💓','💞',
  '⭐','🌟','💫','✨','🎇','🎆','🌠','🌙','⚡','🌈',
  '🎉','🎊','🎈','🪄','🦋','🌸','🍀','🌺','🫧','🎵','🎶','🍭','🎀','🌻','🪷',
  '🔥','💥','🌊','❄️','🌪️','🎯','💎','🏆','🎸','🎹',
];

interface EmojiDrop {
  id: number;
  emoji: string;
  x: number;
  delay: number;
  duration: number;
  size: number;
  rotation: number;
  wobble: number;
}

export default function YarPage() {
  const [drops, setDrops] = useState<EmojiDrop[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    // ★ 화면 너비 기준으로 충분히 많이
    const count = Math.floor(window.innerWidth / 28) + 10;

    const newDrops: EmojiDrop[] = Array.from({ length: count * 4 }, (_, i) => ({
      id: i,
      emoji: rand(YAR_EMOJIS),
      x: Math.random() * 104 - 2, // -2% ~ 102% (가장자리도 채움)
      delay: Math.random() * 1400,
      duration: 700 + Math.random() * 700,
      size: 20 + Math.floor(Math.random() * 36),
      rotation: Math.random() * 40 - 20,
      wobble: Math.random() * 30 - 15,
    }));

    setDrops(newDrops);

    const fadeTimer = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(fadeTimer);
  }, []);

  return (
    <div className={`yar-root ${!visible ? 'yar-fadeout' : ''}`}>
      {drops.map(d => (
        <div
          key={d.id}
          className="yar-drop"
          style={{
            left: `${d.x}%`,
            fontSize: d.size,
            animationDelay: `${d.delay}ms`,
            animationDuration: `${d.duration}ms`,
            '--wobble': `${d.wobble}px`,
          } as React.CSSProperties}
        >
          {d.emoji}
        </div>
      ))}
    </div>
  );
}
