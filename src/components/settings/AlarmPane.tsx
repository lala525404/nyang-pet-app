import { useEffect, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Switch } from '../ui';
import { formatTime } from '../../utils/settings';
import { ALARM_ATTENDEES_MAX, ALARM_MEMO_MAX, ALARM_NAME_MAX } from '../../utils/alarmText';
import type { PaneProps } from './shared';

const MAX_ALARMS = 5;
const PRE_OPTIONS: [number, string][] = [[0, '사용 안 함'], [5, '5분 전'], [10, '10분 전'], [30, '30분 전']];

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
  const [openId, setOpenId] = useState<string | null>(null);   // "자세히"가 펼쳐진 알람(한 번에 하나)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const setAlarm = (idx: number, change: Partial<(typeof alarms)[number]>) =>
    update({ alarms: alarms.map((a, i) => (i === idx ? { ...a, ...change } : a)) });
  const hasDetails = (a: (typeof alarms)[number]) => !!(a.endTime || a.attendees || a.memo || (a.preMinutes ?? 0) > 0);
  // "알람 테스트": 펼쳐 둔 알람, 없으면 이름·설명이 있는 첫 알람의 내용으로 카드를 미리 본다. 아무것도 없으면 기본 카드.
  const testAlarm = () => {
    const target = alarms.find(a => a.id === openId) || alarms.find(a => a.name?.trim() || hasDetails(a));
    window.electronAPI?.testBreakTime('alarm', target ? { name: target.name, time: target.time, endTime: target.endTime, attendees: target.attendees, memo: target.memo } : undefined);
  };

  return (
    <section className="st-pane">
      <div className="st-two">
        <article className="st-card">
          <div className="st-card-head">
            <h3 className="st-h">일반 알람</h3>
            <span className="st-count">{alarms.length} / {MAX_ALARMS}</span>
          </div>
          <div className="st-list">
            {alarms.map((alarm, idx) => {
              const open = openId === alarm.id;
              return (
                <div key={alarm.id} className="st-li st-li--alarm">
                  <div className="st-li-row">
                    <input type="time" className="ui-time" value={alarm.time} aria-label={`알람 ${idx + 1} 시간`}
                      onChange={e => { if (e.target.value) setAlarm(idx, { time: e.target.value }); }} />
                    {/* 예전의 "알람 N" 글자 자리: 이름 입력 칸. 비워 두면 "알람 N"이 보이고 카드 제목은 "알람"이다 */}
                    <input type="text" className="st-text st-li-name" value={alarm.name ?? ''} placeholder={`알람 ${idx + 1}`} maxLength={ALARM_NAME_MAX}
                      aria-label={`알람 ${idx + 1} 이름`} onChange={e => setAlarm(idx, { name: e.target.value || undefined })} />
                    <Switch checked={alarm.enabled} onChange={v => setAlarm(idx, { enabled: v })} label={`알람 ${idx + 1} 켜기`} />
                    <button type="button" className="ui-iconbtn" aria-label={`알람 ${idx + 1} 삭제`}
                      onClick={() => { if (openId === alarm.id) setOpenId(null); update({ alarms: alarms.filter((_, i) => i !== idx) }); }}>
                      <Trash2 className="ui-i" strokeWidth={1.5} aria-hidden />
                    </button>
                  </div>
                  <button type="button" className="st-more" aria-expanded={open} aria-controls={`alarm-detail-${alarm.id}`}
                    onClick={() => setOpenId(open ? null : alarm.id)}>
                    <ChevronDown className="ui-i" strokeWidth={1.5} aria-hidden data-open={open ? '' : undefined} />
                    <span>자세히</span>
                    {!open && hasDetails(alarm) && <span className="st-more-dot" aria-label="자세한 내용이 있어요" />}
                  </button>
                  {open && (
                    <div className="st-detail" id={`alarm-detail-${alarm.id}`}>
                      <label className="st-field"><span className="st-field-label">종료 시각 <small>(시간 범위로 보여요)</small></span>
                        <span className="st-detail-time">
                          <input type="time" className="ui-time" value={alarm.endTime ?? ''} aria-label={`알람 ${idx + 1} 종료 시각`}
                            onChange={e => setAlarm(idx, { endTime: e.target.value || undefined })} />
                          {alarm.endTime && <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAlarm(idx, { endTime: undefined })}>지우기</button>}
                        </span>
                      </label>
                      <label className="st-field"><span className="st-field-label">참석자 <small>(쉼표로 구분)</small></span>
                        <input type="text" className="st-text" value={alarm.attendees ?? ''} placeholder="예: 김OO, 이OO" maxLength={ALARM_ATTENDEES_MAX}
                          aria-label={`알람 ${idx + 1} 참석자`} onChange={e => setAlarm(idx, { attendees: e.target.value || undefined })} />
                      </label>
                      <label className="st-field"><span className="st-field-label">메모</span>
                        <input type="text" className="st-text" value={alarm.memo ?? ''} placeholder="한 줄로 적어요" maxLength={ALARM_MEMO_MAX}
                          aria-label={`알람 ${idx + 1} 메모`} onChange={e => setAlarm(idx, { memo: e.target.value || undefined })} />
                      </label>
                      <label className="st-field"><span className="st-field-label">미리 알림 <small>(이름이 있으면 "10분 뒤 · 이름 · 시각"으로 떠요)</small></span>
                        <span className="ui-select">
                          <select value={alarm.preMinutes ?? 0} aria-label={`알람 ${idx + 1} 미리 알림`} onChange={e => setAlarm(idx, { preMinutes: Number(e.target.value) || undefined })}>
                            {PRE_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                          </select>
                          <ChevronDown className="ui-i" strokeWidth={1.5} aria-hidden />
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {alarms.length === 0 && <p className="st-empty">알람이 없어요. 아래 버튼으로 추가해 보세요.</p>}
          <div className="st-card-foot">
            <button type="button" className="ui-btn ui-btn--primary" disabled={alarms.length >= MAX_ALARMS}
              onClick={() => update({ alarms: [...alarms, { id: Date.now().toString(), time: '09:00', enabled: true }] })}>
              <Plus className="ui-i" strokeWidth={1.5} aria-hidden />
              <span>{alarms.length >= MAX_ALARMS ? '최대 5개' : '알람 추가'}</span>
            </button>
            <button type="button" className="ui-btn" onClick={testAlarm}>알람 테스트</button>
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
