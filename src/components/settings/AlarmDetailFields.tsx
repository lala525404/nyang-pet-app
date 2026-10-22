import { ChevronDown } from 'lucide-react';
import { Segmented } from '../ui';
import { ALARM_ATTENDEES_MAX, ALARM_MEMO_MAX } from '../../utils/alarmText';
import { DAY_PRESETS, WEEKDAY_LABELS, WEEK_ORDER, addDays, effectiveDays, isSkipped, mondayOf, occursOn, parseYmd, startOfDay, ymd } from '../../utils/alarmSchedule';
import type { AlarmRepeat } from '../../utils/alarmSchedule';
import type { Alarm } from '../../utils/settings';

const PRE_OPTIONS: [number, string][] = [[0, '사용 안 함'], [5, '5분 전'], [10, '10분 전'], [30, '30분 전']];
type Kind = 'weekly' | 'date' | 'week';
const KIND_OPTIONS: { value: Kind; label: string }[] = [{ value: 'weekly', label: '매주 반복' }, { value: 'date', label: '특정 날짜 한 번' }, { value: 'week', label: '이번 주만' }];
const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

interface Props {
  alarm: Alarm;
  label: string;                 // 접근성 이름에 붙는 말: "알람 1"
  patch: (change: Partial<Alarm>) => void;
  now: Date;
  anchorDate?: Date;             // 반복 종류를 "특정 날짜"/"이번 주만"으로 바꿀 때 기본으로 쓰는 날짜(캘린더에서 누른 날). 없으면 오늘
  onClone?: () => void;
  cloneDisabled?: boolean;
  onDelete?: () => void;         // 편집 창에서만 보인다(목록에는 휴지통 버튼이 따로 있다)
}

// 알람 "자세히": 종료 시각·참석자·메모·미리 알림·반복 설정·오늘만 건너뛰기·복제. 목록의 자세히 접기와 캘린더 편집 창이 같이 쓴다. 바꾸는 즉시 적용된다.
export default function AlarmDetailFields({ alarm, label, patch, now, anchorDate, onClone, cloneDisabled, onDelete }: Props) {
  const today = startOfDay(now); const anchor = startOfDay(anchorDate ?? now);
  const repeat = alarm.repeat; const kind: Kind = repeat?.kind ?? 'weekly';   // 예전 알람(반복 없음)은 "매주 반복·매일"로 보인다
  const days = effectiveDays(alarm);
  const setRepeat = (r: AlarmRepeat) => patch({ repeat: r });
  const changeKind = (k: Kind) => {
    if (k === kind) return;
    if (k === 'weekly') setRepeat({ kind: 'weekly', days: repeat && repeat.kind !== 'date' ? repeat.days : [anchor.getDay()] });
    else if (k === 'date') setRepeat({ kind: 'date', date: ymd(anchor) });
    else setRepeat({ kind: 'week', weekStart: ymd(mondayOf(anchor)), days: [anchor.getDay()] });
  };
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    if (next.length === 0) return;   // 요일이 하나도 없으면 울릴 날이 없으므로 마지막 하나는 끌 수 없다
    if (kind === 'week' && repeat?.kind === 'week') setRepeat({ kind: 'week', weekStart: repeat.weekStart, days: next });
    else setRepeat({ kind: 'weekly', days: next });
  };
  const weekStart = repeat?.kind === 'week' ? parseYmd(repeat.weekStart) : null;
  const dayDate = (d: number) => (weekStart ? addDays(weekStart, (d + 6) % 7) : null);
  const todayOccurs = occursOn(alarm, today); const skippedToday = isSkipped(alarm, today);
  const pastDate = repeat?.kind === 'date' && parseYmd(repeat.date).getTime() < today.getTime();

  return (
    <div className="st-detail">
      <label className="st-field"><span className="st-field-label">종료 시각 <small>(시간 범위로 보여요)</small></span>
        <span className="st-detail-time">
          <input type="time" className="ui-time" value={alarm.endTime ?? ''} aria-label={`${label} 종료 시각`}
            onChange={e => patch({ endTime: e.target.value || undefined })} />
          {alarm.endTime && <button type="button" className="ui-btn ui-btn--sm" onClick={() => patch({ endTime: undefined })}>지우기</button>}
        </span>
      </label>
      <label className="st-field"><span className="st-field-label">참석자 <small>(쉼표로 구분)</small></span>
        <input type="text" className="st-text" autoComplete="off" value={alarm.attendees ?? ''} placeholder="예: 김OO, 이OO" maxLength={ALARM_ATTENDEES_MAX}
          aria-label={`${label} 참석자`} onChange={e => patch({ attendees: e.target.value || undefined })} />
      </label>
      <label className="st-field"><span className="st-field-label">메모</span>
        <input type="text" className="st-text" autoComplete="off" value={alarm.memo ?? ''} placeholder="한 줄로 적어요" maxLength={ALARM_MEMO_MAX}
          aria-label={`${label} 메모`} onChange={e => patch({ memo: e.target.value || undefined })} />
      </label>
      <label className="st-field"><span className="st-field-label">미리 알림 <small>(이름이 있으면 "10분 뒤 · 이름 · 시각"으로 떠요)</small></span>
        <span className="ui-select">
          <select value={alarm.preMinutes ?? 0} aria-label={`${label} 미리 알림`} onChange={e => patch({ preMinutes: Number(e.target.value) || undefined })}>
            {PRE_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <ChevronDown className="ui-i" strokeWidth={1.5} aria-hidden />
        </span>
      </label>

      <div className="st-field st-repeat" role="group" aria-label={`${label} 반복 설정`}>
        <span className="st-field-label">반복</span>
        <Segmented<Kind> label={`${label} 반복 종류`} value={kind} onChange={changeKind} options={KIND_OPTIONS} />
        {kind === 'date' && repeat?.kind === 'date' ? (
          <div className="st-repeat-row">
            <input type="date" className="ui-time ui-date" value={repeat.date} aria-label={`${label} 날짜`}
              onChange={e => { if (e.target.value) setRepeat({ kind: 'date', date: e.target.value }); }} />
            <span className="ui-note">{pastDate ? '이미 지난 날짜예요. 울리지 않아요.' : '그 날 한 번만 울리고, 울린 뒤에는 완료로 남아요.'}</span>
          </div>
        ) : (
          <>
            {kind === 'weekly' && (
              <div className="st-dayrow" role="group" aria-label={`${label} 요일 프리셋`}>
                {DAY_PRESETS.map(p => <button key={p.label} type="button" className="st-daychip" aria-pressed={sameSet(days, p.days)} onClick={() => setRepeat({ kind: 'weekly', days: p.days })}>{p.label}</button>)}
              </div>
            )}
            <div className="st-dayrow" role="group" aria-label={`${label} 요일`}>
              {WEEK_ORDER.map(d => {
                const date = dayDate(d); const past = !!date && date.getTime() < today.getTime();
                return (
                  <button key={d} type="button" className="st-daychip st-daychip--day" aria-pressed={days.includes(d)} disabled={past && !days.includes(d)}
                    aria-label={`${WEEKDAY_LABELS[d]}요일${date ? ` ${date.getMonth() + 1}월 ${date.getDate()}일` : ''}`} onClick={() => toggleDay(d)}>{WEEKDAY_LABELS[d]}</button>
                );
              })}
            </div>
            <span className="ui-note">{kind === 'weekly' ? '고른 요일마다 울려요.' : `${weekStart ? `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 주` : '이번 주'}의 고른 요일에만 울리고, 주가 지나면 완료로 남아요.`}</span>
          </>
        )}
      </div>

      <div className="st-detail-actions">
        <button type="button" className="ui-btn ui-btn--sm" aria-pressed={skippedToday} disabled={!todayOccurs && !skippedToday}
          title={!todayOccurs ? '오늘은 울리지 않는 알람이에요' : undefined}
          onClick={() => patch({ skipDate: skippedToday ? undefined : ymd(today) })}>{skippedToday ? '오늘 건너뛰기 취소' : '오늘만 건너뛰기'}</button>
        {onClone && <button type="button" className="ui-btn ui-btn--sm" disabled={cloneDisabled} onClick={onClone}>복제</button>}
        {onDelete && <button type="button" className="ui-btn ui-btn--sm st-danger" onClick={onDelete}>삭제</button>}
      </div>
    </div>
  );
}
