import { useState } from 'react';

// 앱에 포함된 Twemoji SVG (public/twemoji). 오프라인에서도 보이도록 CDN을 쓰지 않는다.
const TWEMOJI_BASE = './twemoji/';

function emojiToCodepoint(emoji: string): string {
  return [...emoji]
    .map(c => c.codePointAt(0)!.toString(16))
    .filter(cp => cp !== 'fe0f')
    .join('-');
}

// 커스텀 버디 표시 모양 (저장 이미지는 항상 정사각형, 표시할 때만 적용)
export type CustomShape = 'round' | 'rounded';

export function customShapeRadius(shape?: CustomShape): string {
  return shape === 'rounded' ? '18%' : '50%';
}

interface CatEmojiProps {
  emoji: string;
  size?: number;
  className?: string;
  customImage?: string | null; // base64 또는 null
  customShape?: CustomShape;
  forceImage?: boolean; // true면 Windows가 아니어도 Twemoji 이미지로 표시 (설정창·알림 카드용)
}

export default function CatEmoji({ emoji, size = 64, className = '', customImage, customShape = 'round', forceImage = false }: CatEmojiProps) {
  // 번들에 없는 이모지(예: Twemoji 14에 없는 신규 이모지)는 글꼴 이모지로 대신 보여 준다
  const [failedEmoji, setFailedEmoji] = useState<string | null>(null);
  const imgFailed = failedEmoji === emoji;

  // 커스텀 이미지가 있으면 우선 표시
  if (customImage) {
    return (
      <img
        src={customImage}
        width={size}
        height={size}
        className={className}
        draggable={false}
        alt="custom pet"
        style={{
          display: 'block',
          userSelect: 'none',
          objectFit: 'contain',
          borderRadius: customShapeRadius(customShape),
        }}
      />
    );
  }

  const isWindows = window.electronAPI?.platform === 'win32';

  if ((isWindows || forceImage) && !imgFailed) {
    const cp = emojiToCodepoint(emoji);
    const src = `${TWEMOJI_BASE}${cp}.svg`;
    return (
      <img
        src={src}
        width={size}
        height={size}
        className={className}
        draggable={false}
        alt={emoji}
        style={{ display: 'block', userSelect: 'none' }}
        onError={() => setFailedEmoji(emoji)}
      />
    );
  }

  return (
    <span
      className={className}
      style={{
        fontSize: size,
        lineHeight: 1,
        display: 'block',
        userSelect: 'none',
        fontFamily: '-apple-system, "Apple Color Emoji"',
      }}
    >
      {emoji}
    </span>
  );
}
