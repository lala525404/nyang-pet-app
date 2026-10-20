import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Switch } from '../ui';
import { formatTime } from '../../utils/settings';
import type { PaneProps } from './shared';

const MAX_ALARMS = 5;

// 기존 TimePreview 판정 그대로, 이모지만 뺐다
function workStatus(workStart: string, workEnd: string, now: Date): string {
  const total = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = workStart.split(':').map(Number);
  const [eh, em] = workEnd.split(':').map(Number);
  const startMin = sh * 60 + sm, endMin = eh * 60 + em;
  let zone: string;
  if (total < 5 * 60)            zone = '새벽';
  else if (total < startMin)     zone = '출근 전';
  else if (total < 12 * 60)      zone = '오전 근무 중';
  else if (total < 13 * 60)      zone = '점심시간';
  else if (total < endMin - 60)  zone = '오후 근무 중';
  else if (total < endMin)       zone = '퇴근 임박!';
  else if (total < endMin + 60)  zone = '퇴근 시간!';
  else if (total < 21 * 60)      zone = '저녁';
  else                           zone = '밤';
  return `지금 ${formatTime(`${now.getHours()}:${now.getMinutes()}`)} · ${zone}`;
}

export default function AlarmPane({ settings: s, update }: PaneProps) {
  const alarms = s.alarms || [];
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const setAlarm = (idx: number, change: Partial<(typeof alarms)[number]>) =>
    update({ alarms: alarms.map((a, i) => (i === idx ? { ...a, ...change } : a)) });

  return (
    <section className="st-pane">
      <div className="st-two">
        <article className="st-card">
          <div className="st-card-head">
            <h3 className="st-h">일반 알람</h3>
            <span className="st-count">{alarms.length} / {MAX_ALARMS}</span>
          </div>
          <div className="st-list">
            {alarms.map((alarm, idx) => (
              <div key={alarm.id} className="st-li">
                <input type="time" className="ui-time" value={alarm.time} aria-label={`알람 ${idx + 1} 시간`}
                  onChange={e => { if (e.target.value) setAlarm(idx, { time: e.target.value }); }} />
                <span className="st-li-label">알람 {idx + 1}</span>
                <Switch checked={alarm.enabled} onChange={v => setAlarm(idx, { enabled: v })} label={`알람 ${idx + 1} 켜기`} />
                <button type="button" className="ui-iconbtn" aria-label={`알람 ${idx + 1} 삭제`}
                  onClick={() => update({ alarms: alarms.filter((_, i) => i !== idx) })}>
                  <Trash2 className="ui-i" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          {alarms.length === 0 && <p className="st-empty">알람이 없어요. 아래 버튼으로 추가해 보세요.</p>}
          <div className="st-card-foot">
            <button type="button" className="ui-btn ui-btn--primary" disabled={alarms.length >= MAX_ALARMS}
              onClick={() => update({ alarms: [...alarms, { id: Date.now().toString(), time: '09:00', enabled: true }] })}>
              <Plus className="ui-i" strokeWidth={1.5} aria-hidden />
              <span>{alarms.length >= MAX_ALARMS ? '최대 5개' : '알람 추가'}</span>
            </button>
            <button type="button" className="ui-btn" onClick={() => window.electronAPI?.testBreakTime('alarm')}>알람 테스트</button>
          </div>
        </article>

        <article className="st-card st-work">
          <h3 className="st-h">근무 시간</h3>
          <div className="st-work-times">
            <label className="st-field"><span className="st-field-label">출근</span>
              <input type="time" className="ui-time" value={s.workStart} aria-label="출근 시간"
                onChange={e => { if (e.target.value) update({ workStart: e.target.value }); }} />
            </label>
            <label className="st-field"><span className="st-field-label">퇴근</span>
              <input type="time" className="ui-time" value={s.workEnd} aria-label="퇴근 시간"
                onChange={e => { if (e.target.value) update({ workEnd: e.target.value }); }} />
            </label>
          </div>
          <p className="ui-note">{workStatus(s.workStart, s.workEnd, now)}</p>
        </article>
      </div>
    </section>
  );
}
