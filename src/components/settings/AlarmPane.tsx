import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Switch } from '../ui';
import AlarmAccordion from './AlarmAccordion';
import AlarmCalendar from './AlarmCalendar';
import AlarmDetailFields from './AlarmDetailFields';
import AlarmEditor from './AlarmEditor';
import { formatTime } from '../../utils/settings';
import { ALARM_NAME_MAX } from '../../utils/alarmText';
import { MAX_ALARMS, isPastOneShot, parseYmd, repeatSummary, ymd } from '../../utils/alarmSchedule';
import { openAfterAdd, openAfterRemove, openIfExists, toggleOpen } from '../../utils/alarmList';
import type { Alarm } from '../../utils/settings';
import type { PaneProps } from './shared';

const newId = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const LIMIT_NOTE = `알람은 최대 ${MAX_ALARMS}개까지 만들 수 있어요. 지난 알람을 정리하거나 쓰지 않는 알람을 지워 주세요.`;

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
  const [openId, setOpenId] = useState<string | null>(null);   // 목록에서 "자세히"가 펼쳐진 알람(한 번에 하나)
  const [editing, setEditing] = useState<{ id: string; draft?: Alarm; anchor?: Date } | null>(null);   // 캘린더 편집 창(새 알람은 draft로 시작)
  const [focus, setFocus] = useState<{ date: Date; n: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);   // 방금 추가·복제한 알람: 펼친 뒤 이름 칸에 포커스                           // 캘린더를 그 날짜가 있는 주로 옮기기
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const atLimit = alarms.length >= MAX_ALARMS;
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  useEffect(() => { setOpenId(o => openIfExists(o, alarms.map(a => a.id))); }, [alarms]);
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => { const el = document.getElementById(`alarm-name-${focusId}`); if (el) { (el as HTMLInputElement).focus(); } setFocusId(null); }, reduce() ? 0 : 60);
    return () => clearTimeout(t);
  }, [focusId, alarms]);
  // 펼침 전환이 끝나면 그 항목이 화면 밖으로 밀렸을 때만 보이는 위치로 스크롤한다(움직임 줄이기에서는 즉시)
  const scrollRowIntoView = (id: string) => document.getElementById(`alarm-row-${id}`)?.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });

  const setAlarm = (idx: number, change: Partial<Alarm>) => update({ alarms: alarms.map((a, i) => (i === idx ? { ...a, ...change } : a)) });
  const patchById = (id: string, change: Partial<Alarm>) => update({ alarms: alarms.map(a => (a.id === id ? { ...a, ...change } : a)) });
  const jumpTo = (a: Alarm) => {
    const r = a.repeat;
    if (r?.kind === 'date') setFocus(f => ({ date: parseYmd(r.date), n: (f?.n ?? 0) + 1 }));
    else if (r?.kind === 'week') setFocus(f => ({ date: parseYmd(r.weekStart), n: (f?.n ?? 0) + 1 }));
  };
  // 복제: 목록에서 누르면 복제본이 펼쳐지고 이름 칸에 포커스가 간다. 편집 창에서 복제하면 목록의 펼침 상태는 건드리지 않는다(둘은 서로 독립).
  const cloneAlarm = (id: string, fromList = true): string | null => {
    const i = alarms.findIndex(a => a.id === id); if (i < 0 || atLimit) return null;
    const copy: Alarm = { ...alarms[i], id: newId(), skipDate: undefined };
    update({ alarms: [...alarms.slice(0, i + 1), copy, ...alarms.slice(i + 1)] });
    if (fromList) { setOpenId(o => openAfterAdd(o, copy.id)); setFocusId(copy.id); }
    return copy.id;
  };
  const removeAlarm = (id: string) => { setOpenId(o => openAfterRemove(o, id)); update({ alarms: alarms.filter(a => a.id !== id) }); };
  const clearPast = () => update({ alarms: alarms.filter(a => !isPastOneShot(a, now)) });

  // 캘린더에서 빈 칸을 눌렀을 때: 그 날짜·시각이 채워진 "하루짜리"(반복 없음) 새 알람 폼. 편집 창의 "매주 반복" 토글을 켜면 그 요일 주간 반복이 된다.
  // 처음 값을 바꾸는 순간 알람이 만들어지므로 잘못 눌러도 남지 않는다.
  const startDraft = (day: Date, time: string) => {
    if (atLimit) return;
    const draft: Alarm = { id: newId(), time, enabled: true, repeat: { kind: 'date', date: ymd(day) } };
    setEditing({ id: draft.id, draft, anchor: day });
  };
  const editingAlarm = editing ? (alarms.find(a => a.id === editing.id) ?? editing.draft ?? null) : null;
  const editingIsNew = !!editing && !alarms.some(a => a.id === editing.id);
  const patchEditing = (change: Partial<Alarm>) => {
    if (!editing || !editingAlarm) return;
    const next = { ...editingAlarm, ...change };
    if (editingIsNew) { if (!atLimit) update({ alarms: [...alarms, next] }); } else patchById(editing.id, change);
    if (change.repeat) jumpTo(next);
  };

  const hasDetails = (a: Alarm) => !!(a.endTime || a.attendees || a.memo || (a.preMinutes ?? 0) > 0 || a.repeat || a.skipDate);
  // "알람 테스트": 펼쳐 둔 알람(없으면 이름·설명이 있는 첫 알람)의 내용으로 카드를 미리 본다. 아무것도 없으면 기본 카드.
  const testAlarm = () => {
    const target = alarms.find(a => a.id === openId) || alarms.find(a => a.name?.trim() || hasDetails(a));
    window.electronAPI?.testBreakTime('alarm', target ? { name: target.name, time: target.time, endTime: target.endTime, attendees: target.attendees, memo: target.memo } : undefined);
  };

  const toolbar = (
    <div className="st-card-foot">
      <button type="button" className="ui-btn ui-btn--primary" disabled={atLimit}
        onClick={() => { const id = newId(); update({ alarms: [...alarms, { id, time: '09:00', enabled: true }] }); setOpenId(o => openAfterAdd(o, id)); setFocusId(id); }}>
        <Plus className="ui-i" strokeWidth={1.5} aria-hidden />
        <span>{atLimit ? `최대 ${MAX_ALARMS}개` : '알람 추가'}</span>
      </button>
      <button type="button" className="ui-btn" onClick={testAlarm}>알람 테스트</button>
    </div>
  );
  const head = (
    <div className="st-card-head st-alarm-head">
      <h3 className="st-h">일반 알람 <span className="st-count">{alarms.length} / {MAX_ALARMS}</span></h3>
    </div>
  );
  const work = (
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
  );

  return (
    <section className="st-pane">
      <div className="st-two">
        <article className="st-card">
          {head}
          <div className="st-list">
            {alarms.map((alarm, idx) => {
              const open = openId === alarm.id;
              return (
                <div key={alarm.id} id={`alarm-row-${alarm.id}`} className="st-li st-li--alarm" data-past={isPastOneShot(alarm, now) ? '' : undefined}>
                  <div className="st-li-row">
                    <input type="time" className="ui-time" value={alarm.time} aria-label={`알람 ${idx + 1} 시간`}
                      onChange={e => { if (e.target.value) setAlarm(idx, { time: e.target.value }); }} />
                    {/* 예전의 "알람 N" 글자 자리: 이름 입력 칸. 비워 두면 "알람 N"이 보이고 카드 제목은 "알람"이다 */}
                    <input type="text" id={`alarm-name-${alarm.id}`} className="st-text st-li-name" autoComplete="off" value={alarm.name ?? ''} placeholder={`알람 ${idx + 1}`} maxLength={ALARM_NAME_MAX}
                      aria-label={`알람 ${idx + 1} 이름`} onChange={e => setAlarm(idx, { name: e.target.value || undefined })} />
                    <Switch checked={alarm.enabled} onChange={v => setAlarm(idx, { enabled: v })} label={`알람 ${idx + 1} 켜기`} />
                    <button type="button" className="ui-iconbtn" aria-label={`알람 ${idx + 1} 삭제`} onClick={() => removeAlarm(alarm.id)}>
                      <Trash2 className="ui-i" strokeWidth={1.5} aria-hidden />
                    </button>
                  </div>
                  <button type="button" className="st-more" aria-expanded={open} aria-controls={`alarm-detail-${alarm.id}`}
                    onClick={() => setOpenId(o => toggleOpen(o, alarm.id))}>
                    <ChevronDown className="ui-i" strokeWidth={1.5} aria-hidden data-open={open ? '' : undefined} />
                    <span>자세히</span>
                    {!open && hasDetails(alarm) && <span className="st-more-dot" aria-label="자세한 내용이 있어요" />}
                    {alarm.repeat && <small className="st-more-sub">{isPastOneShot(alarm, now) ? '완료 · ' : ''}{repeatSummary(alarm)}</small>}
                  </button>
                  <AlarmAccordion open={open} id={`alarm-detail-${alarm.id}`} onOpened={() => scrollRowIntoView(alarm.id)}>
                    <AlarmDetailFields alarm={alarm} label={`알람 ${idx + 1}`} now={now} cloneDisabled={atLimit} onClone={() => { cloneAlarm(alarm.id); }}
                      patch={(c) => { setAlarm(idx, c); if (c.repeat) jumpTo({ ...alarm, ...c }); }} />
                  </AlarmAccordion>
                </div>
              );
            })}
          </div>
          {alarms.length === 0 && <p className="st-empty">알람이 없어요. 아래 버튼이나 캘린더의 빈 곳을 눌러 추가해 보세요.</p>}
          {atLimit && <p className="ui-note st-limit" role="status">{LIMIT_NOTE}</p>}
          {toolbar}
        </article>
        {work}
      </div>

      {/* 알람 설정 아래: 이번 주 알람을 한눈에 보는 주간 캘린더(블록에 마우스를 올리면 정보, 누르면 수정) */}
      <article className="st-card st-cal-card">
        <div className="st-card-head"><h3 className="st-h">주간 알람 캘린더</h3></div>
        <AlarmCalendar alarms={alarms} now={now} focus={focus} atLimit={atLimit} onCreate={startDraft} onEdit={(id) => setEditing({ id })} onClearPast={clearPast} />
      </article>

      {editing && editingAlarm && (
        <AlarmEditor alarm={editingAlarm} isNew={editingIsNew} anchorDate={editing.anchor} now={now} patch={patchEditing}
          cloneDisabled={atLimit} onClone={() => { const id = cloneAlarm(editing.id, false); if (id) setEditing({ id }); }}
          onDelete={() => { removeAlarm(editing.id); setEditing(null); }} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
