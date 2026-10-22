import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const DURATION_MS = 240;   // 높이 전환(200~300ms)

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

interface Props {
  open: boolean;
  id: string;
  children: ReactNode;
  onOpened?: () => void;      // 펼침 전환이 끝난 뒤(화면 밖으로 밀렸으면 보이는 위치로 스크롤하는 데 쓴다)
}

// 높이가 부드럽게 늘고 줄어드는 접이식 영역. 접혀 있는 동안에는 내용을 만들지 않아(알람 50개여도 가볍다) 닫힌 항목은 DOM이 거의 없다.
// 움직임 줄이기에서는 즉시 전환한다. 닫히는 중·닫힌 영역은 inert라서 키보드 포커스와 스크린 리더가 들어가지 않는다.
export default function AlarmAccordion({ open, id, children, onOpened }: Props) {
  const [present, setPresent] = useState(open);   // 내용이 DOM에 있는지
  const [shown, setShown] = useState(open);       // 펼친 높이(1fr)인지
  const innerRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(onOpened); openedRef.current = onOpened;

  useEffect(() => {
    const reduce = prefersReducedMotion();
    if (open) {
      setPresent(true);
      if (reduce) { setShown(true); const t = setTimeout(() => openedRef.current?.(), 0); return () => clearTimeout(t); }
      // 먼저 0fr로 그린 뒤 다음 프레임에 1fr로 바꿔야 전환이 보인다
      let r2 = 0; const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      const t = setTimeout(() => openedRef.current?.(), DURATION_MS + 20);
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t); };
    }
    setShown(false);
    if (reduce) { setPresent(false); return; }
    const t = setTimeout(() => setPresent(false), DURATION_MS + 20);
    return () => clearTimeout(t);
  }, [open]);

  // 닫힌(또는 닫히는 중인) 영역은 포커스·스크린 리더에서 뺀다
  useEffect(() => { const el = innerRef.current?.parentElement; if (!el) return; if (open) el.removeAttribute('inert'); else el.setAttribute('inert', ''); });

  if (!present) return null;
  return (
    <div className="st-acc" id={id} data-open={shown ? '' : undefined} style={{ ['--acc-ms' as string]: `${DURATION_MS}ms` }}>
      <div className="st-acc-inner" ref={innerRef}>{children}</div>
    </div>
  );
}
