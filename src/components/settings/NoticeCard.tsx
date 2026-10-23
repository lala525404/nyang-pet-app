import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Segmented, Switch } from '../ui';
import { formatTime } from '../../utils/settings';

// 점심·퇴근 알림의 자세한 설정(켜기, 테스트, 미리 알림). 알람 탭에서 쓴다.
// 시각은 홈 탭에서만 바꾼다(저장 값은 하나). 여기서는 지금 값만 보여 준다.
// 미리 알림은 접지 않고 항상 한 줄: [미리 알림] [끔 | 켬] [− N분 전 +]. 켰을 때만 분 조절이 같은 줄에 나타난다.
// 알림 켜기는 스위치, 미리 알림은 세그먼트라서 같은 모양의 스위치가 겹치지 않는다. 끄면 분 값은 남아 있어 다시 켜면 그대로다.
export default function NoticeCard({ id, icon, title, enabled, time, pre, preEnabled, onEnabled, onPre, onPreEnabled, onTest, testLabel }: {
  id: string; icon: ReactNode; title: string; enabled: boolean; time: string; pre: number; preEnabled: boolean;
  onEnabled: (v: boolean) => void; onPre: (v: number) => void; onPreEnabled: (v: boolean) => void;
  onTest: () => void; testLabel: string;
}) {
  const preId = `${id}-pre`;
  return (
    <article className="st-card st-notice" data-state={enabled ? 'on' : 'off'}>
      <div className="st-notice-head">
        <h3 className="st-notice-title">{icon}<span>{title}</span></h3>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onTest}>{testLabel}</button>
        <Switch checked={enabled} onChange={onEnabled} label={`${title} 켜기`} />
      </div>
      <div className="st-notice-pre" role="group" aria-labelledby={preId}>
        <span className="st-field-label" id={preId}>미리 알림</span>
        <Segmented<'off' | 'on'> label={`${title} 미리 알림`} value={preEnabled ? 'on' : 'off'} onChange={v => onPreEnabled(v === 'on')}
          options={[{ value: 'off', label: '끔' }, { value: 'on', label: '켬' }]} />
        {preEnabled && (
          <div className="st-stepper">
            <button type="button" className="st-step" disabled={pre <= 1} aria-label={`${title} 미리 알림 1분 줄이기`}
              onClick={() => onPre(Math.max(1, pre - 1))}><Minus className="ui-i" strokeWidth={1.5} aria-hidden /></button>
            <output className="st-step-val">{pre}분 전</output>
            <button type="button" className="st-step" disabled={pre >= 30} aria-label={`${title} 미리 알림 1분 늘리기`}
              onClick={() => onPre(Math.min(30, pre + 1))}><Plus className="ui-i" strokeWidth={1.5} aria-hidden /></button>
          </div>
        )}
      </div>
      <p className="ui-note st-notice-note">
        {enabled ? `${formatTime(time)}에 알려요${preEnabled ? ` · ${pre}분 전에 미리 알려요` : ''}` : `꺼져 있어요 · ${formatTime(time)}`} · 시간은 홈에서 바꿔요
      </p>
    </article>
  );
}
