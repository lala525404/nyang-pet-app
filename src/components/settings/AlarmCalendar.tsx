import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { holidayName, holidayShort } from '../../data/holidays';   // 공휴일 표시(내장 데이터, 표시만 — 알람 동작에는 영향 없음)
import { PAST_DAY_NOTICE, dayLabel, defaultTimeFor, isPastDay, stackDay, tooltipInfo, upcomingOneShots, weekDates, weekRangeLabel, weekdayLabel } from '../../utils/alarmCalendar';
import { WEEKDAY_LABELS, addDays, isPastOneShot, mondayOf, repeatSummary, startOfDay, ymd } from '../../utils/alarmSchedule';
import { alarmTitle } from '../../utils/alarmText';
import { KIND_LEGEND, alarmKind, kindLabel, rangeText } from '../../utils/alarmKind';   // 일정(이름·종료 시각·참석자가 있는 것) / 알람(시각만) 구분
import { formatTime } from '../../utils/settings';
import type { DayEvent, Zone } from '../../utils/alarmCalendar';
import type { Alarm } from '../../utils/settings';

const NARROW_PX = 560;                    // 이보다 좁으면 요일별 세로 목록으로 바꾼다
const ZONE_LABEL: Record<Zone, string> = { am: '오전', pm: '오후' };

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
  `${day.getMonth() + 1}월 ${day.getDate()}일 ${weekdayLabel(day)}요일 ${kindLabel(a)} ${formatTime(a.time)} ${alarmTitle(a)}, ${repeatSummary(a)}${!a.enabled ? ', 꺼짐' : ''}${a.skipDate === ymd(day) ? ', 오늘 건너뜀' : ''}${past ? ', 지남' : ''}. 누르면 수정`;

// 주간 알람 캘린더: 월~일 일자 열 아래로 그날의 알람 블록이 시각 순으로 쌓이고, 오전/오후만 구분선으로 나눈다(시간 축 없음).
// 알람이 있는 날은 길어지고 없는 날은 비어 있어 한눈에 차이가 보인다. 블록에 마우스를 올리면 간단한 정보가 뜨고, 누르면 수정 창이 열린다.
// 빈 곳(또는 +)을 누르면 그 날짜의 오전(09:00)/오후(14:00)로 채워진 "하루짜리" 새 알람 폼이 열린다(편집 창의 "매주 반복"을 켜면 주간 반복).
// 키보드: 칸을 방향키로 옮기고 Enter로 알람 만들기, Tab으로 블록 이동(Enter=수정), PageUp/PageDown으로 주 이동, T로 오늘. 좁은 폭에서는 요일별 목록.
export default function AlarmCalendar({ alarms, now, focus, atLimit, onCreate, onEdit, onClearPast }: Props) {
  const thisMonday = mondayOf(now);
  const [weekStart, setWeekStart] = useState<Date>(thisMonday);
  const [narrow, setNarrow] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState<{ col: number; zone: Zone }>(() => ({ col: (now.getDay() + 6) % 7, zone: now.getHours() < 12 ? 'am' : 'pm' }));
  const [announce, setAnnounce] = useState('');
  const [notice, setNotice] = useState('');   // 눈에 보이는 짧은 안내(지난 날짜 칸을 눌렀을 때)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const today = startOfDay(now);
  const offset = Math.round((weekStart.getTime() - thisMonday.getTime()) / (7 * 86400000));
  const title = offset === 0 ? '이번 주' : offset === 1 ? '다음 주' : offset === -1 ? '지난 주' : `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 주`;
  const stacks = useMemo(() => dates.map(d => stackDay(alarms, d, now)), [alarms, dates, now]);
  const pastCount = useMemo(() => alarms.filter(a => isPastOneShot(a, now)).length, [alarms, now]);
  // 지금 보는 주 밖에 있는 가장 가까운 날짜 지정 알람으로 이동하는 안내
  const jump = useMemo(() => {
    const end = addDays(weekStart, 7);
    return upcomingOneShots(alarms, now).find(u => u.at.getTime() >= end.getTime() || u.at.getTime() < weekStart.getTime()) ?? null;
  }, [alarms, now, weekStart]);

  useEffect(() => { if (focus) setWeekStart(mondayOf(focus.date)); }, [focus]);
  // 폭에 따라 시트/목록 전환
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const apply = () => setNarrow(el.clientWidth < NARROW_PX);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply); ro.observe(el); return () => ro.disconnect();
  }, []);

  const goWeek = useCallback((delta: number | 'today') => { setWeekStart(w => (delta === 'today' ? mondayOf(new Date()) : addDays(w, delta * 7))); }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  const showNotice = (msg: string) => {
    setNotice(msg); setAnnounce(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2400);
  };
  const create = (col: number, zone: Zone) => {
    if (isPastDay(dates[col], now)) { showNotice(PAST_DAY_NOTICE); return; }   // 지난 날짜에는 만들지 않는다(오늘 이후는 그대로)
    if (atLimit) { setAnnounce('알람이 가득 찼어요'); return; }
    onCreate(dates[col], defaultTimeFor(zone));
  };
  const describeCursor = (col: number, zone: Zone) => {
    const d = dates[col]; const list = stacks[col][zone];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekdayLabel(d)}요일 ${ZONE_LABEL[zone]}${list.length ? `, 알람 ${list.length}개: ${list.map(e => alarmTitle(e.alarm)).join(', ')}` : isPastDay(d, now) ? ', 지난 날짜라 알람을 만들 수 없음' : ', 비어 있음. Enter로 알람 만들기'}`;
  };
  const moveCursor = (col: number, zone: Zone) => { const c = Math.max(0, Math.min(6, col)); setCursor({ col: c, zone }); setAnnounce(describeCursor(c, zone)); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;   // 블록·버튼 위에서는 그 버튼 동작을 따른다
    const k = e.key; let handled = true;
    if (k === 'ArrowLeft') moveCursor(cursor.col - 1, cursor.zone);
    else if (k === 'ArrowRight') moveCursor(cursor.col + 1, cursor.zone);
    else if (k === 'ArrowUp') moveCursor(cursor.col, 'am');
    else if (k === 'ArrowDown') moveCursor(cursor.col, 'pm');
    else if (k === 'Home') moveCursor(0, cursor.zone);
    else if (k === 'End') moveCursor(6, cursor.zone);
    else if (k === 'PageUp') { goWeek(-1); setAnnounce('이전 주'); }
    else if (k === 'PageDown') { goWeek(1); setAnnounce('다음 주'); }
    else if (k === 't' || k === 'T') { goWeek('today'); setAnnounce('이번 주'); }
    else if (k === 'Enter' || k === ' ') create(cursor.col, cursor.zone);
    else handled = false;
    if (handled) e.preventDefault();
  };

  const renderBlock = (ev: DayEvent, day: Date, col: number) => {
    const a = ev.alarm; const tip = tooltipInfo(a, day, ev.past); const kind = alarmKind(a);
    return (
      <button key={a.id} type="button" className="st-cal-block" data-kind={kind} data-dim={ev.dim ? '' : undefined} data-past={ev.past ? '' : undefined} data-align={col >= 4 ? 'right' : 'left'}
        aria-label={eventAria(a, day, ev.past)} onClick={() => onEdit(a.id)}>
        {/* 일정은 시간 범위 막대(14:00–15:00 + 이름), 알람은 종 아이콘 점 + 시각 */}
        <span className="st-cal-block-text">
          {kind === 'alarm'
            ? <><Bell className="st-cal-bell" strokeWidth={2.2} aria-hidden /><b className="st-cal-block-time">{a.time}</b></>
            : <><b className="st-cal-block-time">{rangeText(a.time, a.endTime)}</b> {tip.title}</>}
        </span>
        <span className="st-cal-tip" role="tooltip" aria-hidden="true">
          <b>{tip.title}<i>{[kindLabel(a), tip.status].filter(Boolean).join(' · ')}</i></b>
          {tip.lines.map((l, i) => <span key={i}>{l}</span>)}
          <em>누르면 수정</em>
        </span>
      </button>
    );
  };
  const renderCell = (col: number, zone: Zone) => {
    const d = dates[col]; const st = stacks[col]; const list = st[zone];
    const isToday = ymd(d) === ymd(today); const past = isPastDay(d, now);
    const items: React.ReactNode[] = list.map(ev => renderBlock(ev, d, col));
    if (st.nowAt && st.nowAt.zone === zone) items.splice(st.nowAt.index, 0, <div key="now" className="st-cal-now" aria-hidden><span>지금</span></div>);
    return (
      <div key={`${zone}${col}`} className="st-cal-cell" data-zone={zone} data-today={isToday ? '' : undefined} data-pastday={past ? '' : undefined} data-has={list.length ? '' : undefined} data-cursor={focused && cursor.col === col && cursor.zone === zone ? '' : undefined}
        onClick={(e) => { if (!(e.target as HTMLElement).closest('.st-cal-block, .st-cal-add')) { setCursor({ col, zone }); create(col, zone); } }}>
        {items}
        {!past && (
          <button type="button" className="st-cal-add" tabIndex={-1} disabled={atLimit} aria-label={`${weekdayLabel(d)}요일 ${ZONE_LABEL[zone]} 알람 추가`} onClick={() => create(col, zone)}>
            <Plus className="ui-i" strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>
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
          {notice && <p className="st-cal-notice" aria-hidden>{notice}</p>}
          {pastCount > 0 && <button type="button" className="ui-btn ui-btn--sm" onClick={onClearPast}>지난 알람 정리 ({pastCount})</button>}
        </div>
      </div>
      <p className="st-cal-legend">
        <span className="st-cal-lg"><i className="st-cal-lg-bar" aria-hidden /><b>일정</b><small>{KIND_LEGEND.event.replace('일정: ', '')}</small></span>
        <span className="st-cal-lg"><Bell className="st-cal-bell" strokeWidth={2.2} aria-hidden /><b>알람</b><small>{KIND_LEGEND.alarm.replace('알람: ', '')}</small></span>
        <span className="st-cal-lg st-cal-lg--past"><i className="st-cal-lg-dim" aria-hidden /><b>지남</b><small>7일이 지나면 자동으로 정리돼요</small></span>
      </p>
      {jump && (
        <button type="button" className="st-cal-jump" onClick={() => setWeekStart(mondayOf(jump.at))}>
          다음 날짜 알람 · {dayLabel(jump.at)}({WEEKDAY_LABELS[jump.at.getDay()]}) {formatTime(`${jump.at.getHours()}:${jump.at.getMinutes()}`)} {alarmTitle(jump.alarm)} <span>그 주로 이동</span>
        </button>
      )}

      {narrow ? (
        <div className="st-cal-agenda">
          {dates.map((d, i) => {
            const all = [...stacks[i].am, ...stacks[i].pm];
            return (
              <section key={i} className="st-agenda-day" data-today={ymd(d) === ymd(today) ? '' : undefined} data-pastday={isPastDay(d, now) ? '' : undefined} aria-label={`${weekdayLabel(d)}요일 ${dayLabel(d)}`}>
                <header>
                  <h4>{weekdayLabel(d)} <small>{dayLabel(d)}</small>{holidayName(d) && <span className="st-agenda-hol">{holidayShort(holidayName(d) as string)}</span>}</h4>
                  <button type="button" className="ui-iconbtn" aria-label={`${weekdayLabel(d)}요일 ${dayLabel(d)} 알람 추가`} aria-disabled={isPastDay(d, now) || undefined} disabled={atLimit && !isPastDay(d, now)} onClick={() => create(i, 'am')}><Plus className="ui-i" strokeWidth={1.5} aria-hidden /></button>
                </header>
                {all.length === 0 ? <p className="st-agenda-empty">알람 없음</p> : (
                  <ul>
                    {all.map(ev => (
                      <li key={ev.alarm.id}>
                        <button type="button" className="st-agenda-ev" data-kind={alarmKind(ev.alarm)} data-dim={ev.dim ? '' : undefined} aria-label={eventAria(ev.alarm, d, ev.past)} onClick={() => onEdit(ev.alarm.id)}>
                          <span className="st-agenda-time">{formatTime(ev.alarm.time)}</span>
                          <span className="st-agenda-name"><i className="st-kindchip">{kindLabel(ev.alarm)}</i>{alarmKind(ev.alarm) === 'event' ? alarmTitle(ev.alarm) : ''}</span>
                          <small>{ev.past ? '지남' : repeatSummary(ev.alarm)}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <p className="ui-note st-cal-help" id="cal-help">알람 블록에 마우스를 올리면 간단한 정보가 뜨고, 누르면 수정해요 · 빈 곳을 누르면 그 날 하루짜리 새 알람 · 방향키로 칸 이동, Enter로 만들기 · PageUp/PageDown으로 주 이동</p>
          <div className="st-cal-sheet" role="group" aria-roledescription="주간 알람 캘린더" aria-label={`주간 알람 캘린더 ${weekRangeLabel(weekStart)}`} aria-describedby="cal-help" tabIndex={0}
            onKeyDown={onKeyDown} onFocus={(e) => { if (e.target === e.currentTarget) { setFocused(true); setAnnounce(describeCursor(cursor.col, cursor.zone)); } }} onBlur={(e) => { if (e.target === e.currentTarget) setFocused(false); }}>
            <div className="st-cal-corner" aria-hidden />
            {dates.map((d, i) => (
              <div key={i} className="st-cal-dayhead" data-today={ymd(d) === ymd(today) ? '' : undefined} data-empty={stacks[i].count === 0 ? '' : undefined} data-holiday={holidayName(d) ? '' : undefined} title={holidayName(d) ?? undefined}
                aria-label={`${weekdayLabel(d)}요일 ${dayLabel(d)}${ymd(d) === ymd(today) ? ' 오늘' : ''}${holidayName(d) ? `, ${holidayName(d)}` : ''}, 알람 ${stacks[i].count}개`}>
                <span>{weekdayLabel(d)}</span><b>{d.getDate()}</b>
                {holidayName(d) && <i className="st-cal-hol" aria-hidden>{holidayShort(holidayName(d) as string)}</i>}
                {stacks[i].count > 0 && <em className="st-cal-count" aria-hidden>{stacks[i].count}</em>}
              </div>
            ))}
            {(['am', 'pm'] as Zone[]).map(zone => (
              <Fragment key={zone}>
                <div className="st-cal-gutter" data-zone={zone} aria-hidden>{ZONE_LABEL[zone]}</div>
                {dates.map((_, i) => renderCell(i, zone))}
              </Fragment>
            ))}
          </div>
        </>
      )}
      <div className="st-sr" role="status" aria-live="polite">{announce}</div>
    </div>
  );
}
