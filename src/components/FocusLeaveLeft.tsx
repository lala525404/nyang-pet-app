import { useEffect, useState } from 'react';
import { leaveView } from '../utils/leaveLeft';
import { startMinuteTicker } from '../utils/minuteTicker';

// 초집중 모드 시계 아래 작은 한 덩어리: 하루 진행바 + "퇴근까지 2시간 15분". 초집중 모드가 켜져 있는 동안만 그려지므로(꺼지면 이 컴포넌트가 사라진다) 1분 타이머도 같이 정리된다.
// 갱신은 분이 바뀌는 순간의 타이머 하나뿐이고(알람 스케줄러와 무관), 바는 CSS transition으로만 부드럽게 늘어난다(프레임 반복·초 단위 갱신 없음). 마우스는 통과한다(CSS pointer-events: none).
export default function FocusLeaveLeft({ workStart, leaveTime }: { workStart: string; leaveTime: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => startMinuteTicker(setNow), []);
  const v = leaveView(now, workStart, leaveTime);
  if (!v) return null;
  return (
    <div className="focus-leave" aria-hidden="true">
      <div className="focus-leave-track"><div className="focus-leave-fill" style={{ width: `${(v.ratio * 100).toFixed(1)}%` }} /></div>
      <div className="focus-leave-text">{v.text}</div>
    </div>
  );
}
