import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { DEFAULT_SCROLL_HOUR, HOUR_PX, SLOTS_PER_DAY, dayEvents, dayLabel, hourLabel, minToY, slotFromY, slotToMinutes, upcomingOneShots, weekDates, weekRangeLabel, weekdayLabel } from '../../utils/alarmCalendar';
import { WEEKDAY_LABELS, addDays, isPastOneShot, mondayOf, minToTime, repeatSummary, startOfDay, ymd } from '../../utils/alarmSchedule';
import { alarmTitle } from '../../utils/alarmText';
import { formatTime } from '../../utils/settings';
import type { DayEvent } from '../../utils/alarmCalendar';
import type { Alarm } from '../../utils/settings';

const NARROW_PX = 560;                    // 이보다 좁으면 요일별 세로 목록으로 바꾼다
const MONDAY_FIRST = [0, 1, 2, 3, 4, 5, 6];

interface Props {
  alarms: Alarm[];
  now: Date;
  focus: { date: Date; n: number } | null;   // 값이 바뀌면 그 날짜가 있는 주로 이동한다(날짜 지정 알람을 만든 직후 등)
  atLimit: boolean;
  onCreate: (day: Date, time: string) => void;
  onEdit: (id: string) => void;
  onClearPast: () => void;
}

const eventAria = (a: Alarm, day: Date, past: boolean) =>
  `${day.getMonth() + 1}월 ${day.getDate()}일 ${weekdayLabel(day)}요일 ${formatTime(a.time)} ${alarmTitle(a)}, ${repeatSummary(a)}${!a.enabled ? ', 꺼짐' : ''}${a.skipDate === ymd(day) ? ', 오늘 건너뜀' : ''}${past ? ', 완료' : ''}. 누르면 편집`;

// 주간 캘린더(월~일 7열 + 시간 축). 빈 칸을 누르면 그 요일·시각으로 새 알람 폼이 열리고, 카드를 누르면 편집한다.
// 키보드: 칸을 방향키로 옮기고 Enter로 알람 만들기, PageUp/PageDown으로 주 이동, T로 오늘. 좁은 폭에서는 요일별 목록.
export default function AlarmCalendar({ alarms, now, focus, atLimit, onCreate, onEdit, onClearPast }: Props) {
  const thisMonday = mondayOf(now);
  const [weekStart, setWeekStart] = useState<Date>(thisMonday);
  const [narrow, setNarrow] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState<{ col: number; slot: number }>(() => ({ col: (now.getDay() + 6) % 7, slot: Math.min(SLOTS_PER_DAY - 1, Math.max(0, Math.round((now.getHours() * 60 + now.getMinutes()) / 30))) }));
  const [announce, setAnnounce] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const today = startOfDay(now);
  const offset = Math.round((weekStart.getTime() - thisMonday.getTime()) / (7 * 86400000));
  const title = offset === 0 ? '이번 주' : offset === 1 ? '다음 주' : offset === -1 ? '지난 주' : `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 주`;
  const eventsByDay = useMemo(() => dates.map(d => dayEvents(alarms, d, now)), [alarms, dates, now]);
  const pastCount = useMemo(() => alarms.filter(a => isPastOneShot(a, now)).length, [alarms, now]);
  // 지금 보는 주 밖에 있는 가장 가까운 날짜 지정 알람으로 이동하는 안내
  const jump = useMemo(() => {
    const end = addDays(weekStart, 7);
    return upcomingOneShots(alarms, now).find(u => u.at.getTime() >= end.getTime() || u.at.getTime() < weekStart.getTime()) ?? null;
  }, [alarms, now, weekStart]);

  // 처음에는 오전 8시 근처가 보이게 스크롤한다
  useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_PX - 8; }, [narrow]);
  useEffect(() => { if (focus) setWeekStart(mondayOf(focus.date)); }, [focus]);
  // 폭에 따라 격자/목록 전환
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const apply = () => setNarrow(el.clientWidth < NARROW_PX);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply); ro.observe(el); return () => ro.disconnect();
  }, []);

  const goWeek = useCallback((delta: number | 'today') => { setWeekStart(w => (delta === 'today' ? mondayOf(new Date()) : addDays(w, delta * 7))); }, []);
  const describeCursor = (col: number, slot: number) => {
    const d = dates[col]; const min = slotToMinutes(slot); const here = eventsByDay[col].filter(e => e.startMin <= min + 29 && e.endMin > min && e.startMin >= min - 0 && e.startMin < min + 30);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekdayLabel(d)}요일 ${formatTime(minToTime(min))}${here.length ? `, 알람 ${here.length}개: ${here.map(e => alarmTitle(e.alarm)).join(', ')}` : ', 빈 칸. Enter로 알람 만들기'}`;
  };
  const moveCursor = (col: number, slot: number) => {
    const c = Math.max(0, Math.min(6, col)), s = Math.max(0, Math.min(SLOTS_PER_DAY - 1, slot));
    setCursor({ col: c, slot: s }); setAnnounce(describeCursor(c, s));
    const sc = scrollRef.current; if (sc) { const y = minToY(slotToMinutes(s)); const h = HOUR_PX / 2; if (y < sc.scrollTop) sc.scrollTop = y - 4; else if (y + h > sc.scrollTop + sc.clientHeight - 40) sc.scrollTop = y + h - sc.clientHeight + 44; }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;   // 카드 버튼 위에서는 버튼 동작을 따른다
    const k = e.key; let handled = true;
    if (k === 'ArrowLeft') moveCursor(cursor.col - 1, cursor.slot);
    else if (k === 'ArrowRight') moveCursor(cursor.col + 1, cursor.slot);
    else if (k === 'ArrowUp') moveCursor(cursor.col, cursor.slot - 1);
    else if (k === 'ArrowDown') moveCursor(cursor.col, cursor.slot + 1);
    else if (k === 'Home') moveCursor(0, cursor.slot);
    else if (k === 'End') moveCursor(6, cursor.slot);
    else if (k === 'PageUp') { goWeek(-1); setAnnounce('이전 주'); }
    else if (k === 'PageDown') { goWeek(1); setAnnounce('다음 주'); }
    else if (k === 't' || k === 'T') { goWeek('today'); setAnnounce('이번 주'); }
    else if (k === 'Enter' || k === ' ') { if (!atLimit) onCreate(dates[cursor.col], minToTime(slotToMinutes(cursor.slot))); else setAnnounce('알람이 가득 찼어요'); }
    else handled = false;
    if (handled) e.preventDefault();
  };
  const onColumnClick = (e: React.MouseEvent<HTMLDivElement>, day: Date, col: number) => {
    if ((e.target as HTMLElement).closest('.st-cal-ev')) return;
    if (atLimit) return;
    const r = e.currentTarget.getBoundingClientRect(); const slot = slotFromY(e.clientY - r.top);
    setCursor({ col, slot }); onCreate(day, minToTime(slotToMinutes(slot)));
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const renderEvent = (ev: DayEvent, day: Date) => {
    const a = ev.alarm; const top = minToY(ev.startMin); const height = Math.max(20, minToY(ev.endMin) - top - 2);
    return (
      <button key={a.id} type="button" className="st-cal-ev" data-dim={ev.dim ? '' : undefined} data-past={ev.past ? '' : undefined}
        style={{ top, height, left: `calc(${(ev.col / ev.cols) * 100}% + 2px)`, width: `calc(${100 / ev.cols}% - 4px)` }}
        aria-label={eventAria(a, day, ev.past)} title={`${formatTime(a.time)} ${alarmTitle(a)}`} onClick={() => onEdit(a.id)}>
        <span className="st-cal-ev-time">{a.time}</span>
        <span className="st-cal-ev-name">{alarmTitle(a)}</span>
        {ev.past && <span className="st-cal-ev-done">완료</span>}
      </button>
    );
  };

  return (
    <div className="st-cal" ref={rootRef} data-narrow={narrow ? '' : undefined}>
      <div className="st-cal-bar">
        <div className="st-cal-nav" role="group" aria-label="주 이동">
          <button type="button" className="ui-iconbtn" aria-label="이전 주" onClick={() => goWeek(-1)}><ChevronLeft className="ui-i" strokeWidth={1.5} aria-hidden /></button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => goWeek('today')} disabled={offset === 0}>오늘</button>
          <button type="button" className="ui-iconbtn" aria-label="다음 주" onClick={() => goWeek(1)}><ChevronRight className="ui-i" strokeWidth={1.5} aria-hidden /></button>
        </div>
        <h3 className="st-cal-title">{title} <small>{weekRangeLabel(weekStart)}</small></h3>
        <div className="st-cal-tools">
          {pastCount > 0 && <button type="button" className="ui-btn ui-btn--sm" onClick={onClearPast}>지난 알람 정리 ({pastCount})</button>}
        </div>
      </div>
      {jump && (
        <button type="button" className="st-cal-jump" onClick={() => setWeekStart(mondayOf(jump.at))}>
          다음 날짜 알람 · {dayLabel(jump.at)}({WEEKDAY_LABELS[jump.at.getDay()]}) {formatTime(`${jump.at.getHours()}:${jump.at.getMinutes()}`)} {alarmTitle(jump.alarm)} <span>그 주로 이동</span>
        </button>
      )}

      {narrow ? (
        <div className="st-cal-agenda">
          {dates.map((d, i) => (
            <section key={i} className="st-agenda-day" data-today={ymd(d) === ymd(today) ? '' : undefined} aria-label={`${weekdayLabel(d)}요일 ${dayLabel(d)}`}>
              <header>
                <h4>{weekdayLabel(d)} <small>{dayLabel(d)}</small></h4>
                <button type="button" className="ui-iconbtn" aria-label={`${weekdayLabel(d)}요일 ${dayLabel(d)} 알람 추가`} disabled={atLimit} onClick={() => onCreate(d, '09:00')}><Plus className="ui-i" strokeWidth={1.5} aria-hidden /></button>
              </header>
              {eventsByDay[i].length === 0 ? <p className="st-agenda-empty">알람 없음</p> : (
                <ul>
                  {eventsByDay[i].map(ev => (
                    <li key={ev.alarm.id}>
                      <button type="button" className="st-agenda-ev" data-dim={ev.dim ? '' : undefined} aria-label={eventAria(ev.alarm, d, ev.past)} onClick={() => onEdit(ev.alarm.id)}>
                        <span className="st-agenda-time">{formatTime(ev.alarm.time)}</span>
                        <span className="st-agenda-name">{alarmTitle(ev.alarm)}</span>
                        <small>{ev.past ? '완료' : repeatSummary(ev.alarm)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : (
        <>
          <p className="ui-note st-cal-help" id="cal-help">방향키로 칸을 옮기고 Enter로 알람을 만들어요 · PageUp/PageDown으로 주 이동 · T로 오늘</p>
          <div className="st-cal-scroll" ref={scrollRef}>
            <div className="st-cal-grid" role="group" aria-roledescription="주간 캘린더" aria-label={`주간 캘린더 ${weekRangeLabel(weekStart)}`} aria-describedby="cal-help" tabIndex={0}
              onKeyDown={onKeyDown} onFocus={(e) => { if (e.target === e.currentTarget) { setFocused(true); setAnnounce(describeCursor(cursor.col, cursor.slot)); } }} onBlur={(e) => { if (e.target === e.currentTarget) setFocused(false); }}>
              <div className="st-cal-head">
                <div className="st-cal-corner" aria-hidden />
                {dates.map((d, i) => (
                  <div key={i} className="st-cal-dayhead" data-today={ymd(d) === ymd(today) ? '' : undefined} aria-label={`${weekdayLabel(d)}요일 ${dayLabel(d)}${ymd(d) === ymd(today) ? ' 오늘' : ''}`}>
                    <span>{weekdayLabel(d)}</span><b>{d.getDate()}</b>
                  </div>
                ))}
              </div>
              <div className="st-cal-body" style={{ height: 24 * HOUR_PX }}>
                <div className="st-cal-axis" aria-hidden>
                  {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR_PX }}>{h === 0 ? '' : hourLabel(h)}</span>)}
                </div>
                {MONDAY_FIRST.map(i => {
                  const d = dates[i]; const isToday = ymd(d) === ymd(today);
                  return (
                    <div key={i} className="st-cal-col" data-today={isToday ? '' : undefined} data-col={i} onClick={(e) => onColumnClick(e, d, i)}>
                      {eventsByDay[i].map(ev => renderEvent(ev, d))}
                      {isToday && <div className="st-cal-now" style={{ top: minToY(nowMin) }} aria-hidden />}
                      {focused && cursor.col === i && <div className="st-cal-cursor" style={{ top: minToY(slotToMinutes(cursor.slot)), height: HOUR_PX / 2 }} aria-hidden />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      <div className="st-sr" role="status" aria-live="polite">{announce}</div>
    </div>
  );
}
