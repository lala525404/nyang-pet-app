import { useEffect, useState } from 'react';
import { leaveLeftText } from '../utils/leaveLeft';
import { startMinuteTicker } from '../utils/minuteTicker';

// 초집중 모드 시계 아래 작은 한 줄: "퇴근까지 2시간 15분". 초집중 모드가 켜져 있는 동안만 그려지므로(꺼지면 이 컴포넌트가 사라진다) 1분 타이머도 같이 정리된다.
// 갱신은 분이 바뀌는 순간의 타이머 하나뿐이다(알람 스케줄러와 무관). 마우스는 통과한다(CSS pointer-events: none).
export default function FocusLeaveLeft({ workStart, leaveTime }: { workStart: string; leaveTime: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => startMinuteTicker(setNow), []);
  const text = leaveLeftText(now, workStart, leaveTime);
  if (!text) return null;
  return <div className="focus-leave" aria-hidden="true">{text}</div>;
}
