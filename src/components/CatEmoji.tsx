const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

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
}

export default function CatEmoji({ emoji, size = 64, className = '', customImage, customShape = 'round' }: CatEmojiProps) {
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

  if (isWindows) {
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
