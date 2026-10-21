import '../styles/heart.css';

// 앱 아이콘과 같은 하트(assets/icon/heart.svg). 색은 currentColor.
const HEART_PATH =
  'M50 90 C47 90 44 88 41 86 C22 72 6 56 6 34 C6 18 18 8 31 8 C40 8 47 13 50 20 C53 13 60 8 69 8 C82 8 94 18 94 34 C94 56 78 72 59 86 C56 88 53 90 50 90 Z';

interface HeartMarkProps {
  className?: string;
  /** thump: 열릴 때 한 번 두근 + 호버, arrive: 알림 카드에서 두근하며 등장 */
  motion?: 'thump' | 'arrive';
}

export default function HeartMark({ className = '', motion }: HeartMarkProps) {
  const cls = ['heart-mark', motion === 'thump' && 'heart-mark--thump heart-mark--hover', motion === 'arrive' && 'heart-mark--arrive', className]
    .filter(Boolean).join(' ');
  return (
    <svg className={cls} viewBox="6 8 88 82" aria-hidden focusable="false">
      <path d={HEART_PATH} />
    </svg>
  );
}
