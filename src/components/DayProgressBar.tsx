import { useEffect, useState } from 'react';
import { dayProgress } from '../utils/dayProgress';

// 하루 진행 바: 가로 막대 + "퇴근까지 2시간 14분". 값은 분이 바뀌는 순간에만 갱신하고(1분에 한 번) 애니메이션은 쓰지 않는다.
// 점심 시각에는 작은 눈금. 말풍선 안(기본)과 초집중 모드 시계 아래(compact)에서 같이 쓴다.
export default function DayProgressBar({ workStart, lunchTime, leaveTime, compact = false }: {
  workStart: string; lunchTime: string; leaveTime: string; compact?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);   // 다음 분 경계 직후
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  const p = dayProgress(now, workStart, lunchTime, leaveTime);
  return (
    <div className={`day-progress${compact ? ' day-progress--compact' : ''}`} data-phase={p.phase}
      role="img" aria-label={`${p.label}, 오늘 ${Math.round(p.ratio * 100)}% 지났어요`}>
      <div className="day-progress-track" aria-hidden="true">
        <div className="day-progress-fill" style={{ width: `${(p.ratio * 100).toFixed(1)}%` }} />
        {p.lunchRatio !== null && <div className="day-progress-tick" style={{ left: `${(p.lunchRatio * 100).toFixed(1)}%` }} />}
      </div>
      <div className="day-progress-label">{p.label}</div>
    </div>
  );
}
