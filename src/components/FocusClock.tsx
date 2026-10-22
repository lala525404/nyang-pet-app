import { useEffect, useState } from 'react';
import { focusClockText } from '../utils/focusMode';

// 초집중 모드의 시계: 버디 아래에 작게. 기존 시계와 같은 표기("오후 3:42"), 초 표시를 켜면 "오후 3:42:07".
// 분(또는 초)이 바뀌는 순간에 맞춰 한 번씩만 갱신한다(쓸데없이 자주 깨어나지 않게 → CPU 절약). 마우스는 통과한다(CSS pointer-events: none).
export default function FocusClock({ seconds }: { seconds: boolean }) {
  const [text, setText] = useState(() => focusClockText(new Date(), seconds));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = new Date();
      setText(focusClockText(now, seconds));
      const wait = seconds ? 1000 - now.getMilliseconds() : 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timer = setTimeout(tick, wait + 20);   // 경계를 막 넘긴 직후에 갱신
    };
    tick();
    return () => clearTimeout(timer);
  }, [seconds]);
  return <div className="focus-clock" aria-hidden="true">{text}</div>;
}
