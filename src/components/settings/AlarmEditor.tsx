import { useRef } from 'react';
import { X } from 'lucide-react';
import { Switch, useDialog } from '../ui';
import AlarmDetailFields from './AlarmDetailFields';
import { ALARM_NAME_MAX } from '../../utils/alarmText';
import { repeatSummary, startOfDay, ymd } from '../../utils/alarmSchedule';
import type { Alarm } from '../../utils/settings';

interface Props {
  alarm: Alarm;
  isNew: boolean;                // 아직 저장되지 않은 새 알람(처음 값을 바꾸는 순간 만들어진다)
  anchorDate?: Date;             // 캘린더에서 누른 날. 있으면 "매주 반복" 토글을 보여 준다(없으면 기존 알람 수정이라 아래 반복 설정만 쓴다)
  now: Date;
  patch: (change: Partial<Alarm>) => void;
  onClone: () => void;
  cloneDisabled: boolean;
  onDelete: () => void;
  onClose: () => void;
}

// 캘린더의 빈 칸이나 알람 카드를 눌렀을 때 뜨는 알람 편집 창. 저장 버튼은 없고 바꾸는 즉시 적용된다("완료"는 닫기만 한다).
// 새 알람은 열려 있는 동안 아무것도 바꾸지 않으면 만들어지지 않는다(잘못 눌러도 알람이 남지 않는다).
export default function AlarmEditor({ alarm, isNew, anchorDate, now, patch, onClone, cloneDisabled, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  const anchor = anchorDate ? startOfDay(anchorDate) : null;
  const weekly = alarm.repeat?.kind === 'weekly';
  // 켜면 누른 날의 요일(이미 "그 주만"이었다면 고른 요일 그대로)로 매주 반복, 끄면 누른 날짜 하루만
  const setWeekly = (on: boolean) => {
    if (!anchor) return;
    patch({ repeat: on ? { kind: 'weekly', days: alarm.repeat?.kind === 'week' ? alarm.repeat.days : [anchor.getDay()] } : { kind: 'date', date: ymd(anchor) } });
  };
  return (
    <div className="ui-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal st-editor" role="dialog" aria-modal="true" aria-labelledby="alarm-editor-title" ref={ref} tabIndex={-1}>
        <div className="ui-modal-head">
          <div>
            <h3 className="ui-modal-title" id="alarm-editor-title">{isNew ? '새 알람' : '알람 편집'}</h3>
            <p className="ui-note">{repeatSummary(alarm)} · 바꾸면 바로 적용돼요</p>
          </div>
          <button type="button" className="ui-iconbtn" onClick={onClose} aria-label="닫기"><X className="ui-i" strokeWidth={1.5} aria-hidden /></button>
        </div>
        <div className="st-editor-top">
          <input type="time" className="ui-time" value={alarm.time} aria-label="알람 시간" onChange={e => { if (e.target.value) patch({ time: e.target.value }); }} />
          <input type="text" className="st-text st-li-name" autoComplete="off" value={alarm.name ?? ''} placeholder="이름 (예: 주간회의)" maxLength={ALARM_NAME_MAX}
            aria-label="알람 이름" onChange={e => patch({ name: e.target.value || undefined })} />
        </div>
        {anchor && (
          <div className="st-editor-repeat">
            <div>
              <span className="st-field-label">매주 반복</span>
              <p className="ui-note">{weekly ? '고른 요일마다 울려요. 요일은 아래에서 바꿔요.' : '누른 날짜 하루만 울려요.'}</p>
            </div>
            <Switch checked={weekly} onChange={setWeekly} label="매주 반복" />
          </div>
        )}
        <AlarmDetailFields alarm={alarm} label="알람" patch={patch} now={now} anchorDate={anchorDate}
          onClone={isNew ? undefined : onClone} cloneDisabled={cloneDisabled} onDelete={isNew ? undefined : onDelete} />
        <div className="ui-modal-foot"><button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>완료</button></div>
      </div>
    </div>
  );
}
