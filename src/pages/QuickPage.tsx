import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AlarmClock, Bell, Check, ChevronLeft, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, LayoutDashboard, Power, Sun, Thermometer, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import '../styles/quick.css';
import { cityById } from '../data/cities';
import type { City } from '../data/cities';
import { cityLabel } from '../utils/citySearch';
import { loadSettings, formatTime } from '../utils/settings';
import { QUICK_ARC_MAX, QUIT_CONFIRM_MS, flightVars, layoutQuickItems, moveQuickFocus, quickGapPx } from '../utils/quickMenu';
import { NO_ALARM_TEXT, todayAlarmList, untilText } from '../utils/quickAlarms';
import type { QuickAlarmSettings, TodayAlarmItem } from '../utils/quickAlarms';
import {
  WEATHER_CREDIT_TEXT, WEATHER_SETUP_TEXT, formatTemp, formatWind, hourLabel, staleText, threeHourly, todayDay, weatherLabel, windText,
} from '../utils/weatherCard';
import type { WeatherIcon } from '../utils/weatherCard';
import type { QuickLayout, WeatherData } from '../electron';

// 퀵 메뉴 창(펫 우클릭): 펫 머리 위 반원 호에 원형 아이콘 버튼이 쏟아져 나온다(6개까지). 7개 이상이면 가로 알약 바로 바뀐다.
// 호의 좌표·방향·카드 자리는 메인(quick-menu.cjs)이 계산해서 보내 주고, 여기서는 그 좌표에 CSS 애니메이션만 건다(rAF 루프 없음).
// 닫기: Esc · 바깥 클릭·포커스 잃음(메인이 처리) · 펫을 잡아 끌기 시작. 닫힐 때는 0.15초 동안 펫 중심으로 빨려 들어간다.
// 새 항목은 아래 ITEMS 배열에 추가만 하면 된다(최대 8개, 종료는 항상 마지막). 색은 quick.css의 --quick-bar-* 네 개로 한 곳에서 바꾼다.

type View = 'menu' | 'weather' | 'alarm';
interface Entry { id: string; label: string; tip: string; Icon: LucideIcon; danger?: boolean }

const ITEMS: Entry[] = [
  { id: 'open', label: '메인', tip: '메인 창 열기', Icon: LayoutDashboard },
  { id: 'weather', label: '날씨', tip: '오늘 날씨 보기', Icon: CloudSun },
  { id: 'alarm', label: '알람', tip: '오늘 알람 보기', Icon: Bell },
];
const QUIT: Entry = { id: 'quit', label: '종료', tip: '종료하면 알람이 울리지 않아요', Icon: Power, danger: true };
const ICON_STROKE = 1.7;   // 모든 버튼의 아이콘은 같은 크기·획 두께
const QUIT_CONFIRM_TEXT = '한 번 더 누르면 종료돼요';

const WEATHER_ICONS: Record<WeatherIcon, LucideIcon> = {
  sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

const api = () => window.electronAPI;

function CardHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="qk-head">
      <button type="button" className="qk-iconbtn" onClick={onBack} aria-label="뒤로" data-autofocus>
        <ChevronLeft className="qk-i" strokeWidth={ICON_STROKE} aria-hidden />
      </button>
      <h2 className="qk-title">{title}</h2>
    </header>
  );
}

function WeatherCard({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<'loading' | 'none' | 'ready' | 'error'>('loading');
  const [res, setRes] = useState<{ data: WeatherData; stale: boolean; at: number } | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const s = loadSettings();
    const c = cityById(s.weatherConsent ? s.weatherCityId : '');
    setCity(c ?? null);
    if (!c) { setPhase('none'); return; }   // 동네나 동의가 없으면 어떤 요청도 하지 않는다
    setPhase('loading');
    (async () => {
      try {
        const r = await api()?.getWeather?.(c.lat, c.lon);
        if (cancelled) return;
        if (r) { setRes(r); setPhase('ready'); } else setPhase('error');
      } catch { if (!cancelled) setPhase('error'); }
    })();
    return () => { cancelled = true; };
  }, [tries]);

  const now = Date.now();
  let body: JSX.Element;
  if (phase === 'none') {
    body = (
      <div className="qk-empty">
        <p>{WEATHER_SETUP_TEXT}</p>
        <button type="button" className="qk-btn qk-btn--solid" onClick={() => api()?.quickAction('weather-setup')}>동네 정하기</button>
      </div>
    );
  } else if (phase === 'loading') {
    body = <p className="qk-note" role="status">불러오는 중이에요…</p>;
  } else if (phase === 'error' || !res) {
    body = (
      <div className="qk-empty">
        <p>날씨를 불러오지 못했어요</p>
        <button type="button" className="qk-btn" onClick={() => setTries(n => n + 1)}>다시 시도</button>
      </div>
    );
  } else {
    const d = res.data, label = weatherLabel(d.code), Icon = WEATHER_ICONS[label.icon];
    const day = todayDay(d, now), hours = threeHourly(d, now);
    body = (
      <>
        <section className="qk-now" aria-label="지금 날씨">
          <Icon className="qk-now-ico" strokeWidth={1.4} aria-hidden />
          <div className="qk-now-temp"><b>{formatTemp(d.temp)}</b><span>체감 {formatTemp(d.feels)}</span></div>
          <div className="qk-now-text">{label.text}</div>
        </section>
        <ul className="qk-facts">
          <li><Wind className="qk-i" strokeWidth={ICON_STROKE} aria-hidden /><span>풍속 {d.wind === null ? '-' : formatWind(d.wind)}</span><small>{d.wind === null ? '' : windText(d.wind)}</small></li>
          <li><Thermometer className="qk-i" strokeWidth={ICON_STROKE} aria-hidden /><span>오늘 최고 {day?.max != null ? formatTemp(day.max) : '-'} · 최저 {day?.min != null ? formatTemp(day.min) : '-'}</span></li>
          <li><Droplets className="qk-i" strokeWidth={ICON_STROKE} aria-hidden /><span>강수 확률 {day?.pop != null ? `${Math.round(day.pop)}%` : '-'}</span><small>오늘 최대</small></li>
        </ul>
        <section aria-label="오늘 남은 시간 예보">
          {hours.length ? (
            <ul className="qk-hours">
              {hours.map(h => {
                const L = weatherLabel(h.code), HI = WEATHER_ICONS[L.icon];
                return (
                  <li key={h.at} aria-label={`${hourLabel(h.at)} ${L.text} ${formatTemp(h.temp)}${h.pop != null ? ` 강수 확률 ${Math.round(h.pop)}%` : ''}`}>
                    <span>{hourLabel(h.at)}</span><HI className="qk-i" strokeWidth={ICON_STROKE} aria-hidden /><b>{formatTemp(h.temp)}</b>
                    <small>{h.pop != null ? `${Math.round(h.pop)}%` : ''}</small>
                  </li>
                );
              })}
            </ul>
          ) : <p className="qk-note">오늘 남은 예보가 없어요</p>}
        </section>
        {res.stale && <p className="qk-stale" role="status">{staleText(res.at, now)}</p>}
        <p className="qk-credit">{WEATHER_CREDIT_TEXT}</p>
      </>
    );
  }
  return (
    <>
      <CardHead title={city ? `날씨 · ${cityLabel(city)}` : '날씨'} onBack={onBack} />
      {body}
    </>
  );
}

function AlarmCard({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<TodayAlarmItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s: QuickAlarmSettings | null = null;
      try { s = (await api()?.getQuickAlarmSettings?.()) ?? null; } catch { s = null; }
      if (!cancelled) setItems(todayAlarmList(s, new Date()));
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <CardHead title="오늘 알람" onBack={onBack} />
      {items === null ? <p className="qk-note" role="status">불러오는 중이에요…</p> : items.length === 0 ? (
        <p className="qk-note">{NO_ALARM_TEXT}</p>
      ) : (
        <ul className="qk-alarms">
          {items.map(a => (
            <li key={a.id} data-past={a.past ? '' : undefined} data-next={a.next ? '' : undefined}>
              <span className="qk-al-time">{formatTime(a.time)}</span>
              <span className="qk-al-title">{a.title}</span>
              {a.next && a.minutesUntil !== null && <span className="qk-al-until">{untilText(a.minutesUntil)}</span>}
              {a.past && <span className="qk-al-done">지남</span>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="qk-btn qk-foot" onClick={() => api()?.quickAction('alarm-settings')}>
        <AlarmClock className="qk-i" strokeWidth={ICON_STROKE} aria-hidden />알람 설정 열기
      </button>
    </>
  );
}

const cssVars = (v: Record<string, string>): CSSProperties => v as CSSProperties;

export default function QuickPage() {
  const entries = layoutQuickItems(ITEMS, QUIT);
  const isBar = entries.length > QUICK_ARC_MAX;
  const [view, setView] = useState<View>('menu');
  const [armed, setArmed] = useState(false);
  const [layout, setLayout] = useState<QuickLayout | null>(null);
  const [opened, setOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const arc = layout && layout.mode === 'arc' ? layout : null;
  const side = layout && layout.mode === 'bar' ? layout.side : 'above';

  // 메인에 버튼 수를 알리고, 메인이 보내는 배치·열림·닫힘을 받는다
  useEffect(() => {
    const a = api();
    const offs = [a?.onQuickLayout?.(l => setLayout(l)), a?.onQuickOpen?.(() => setOpened(true)), a?.onQuickClosing?.(() => setClosing(true))];
    a?.quickInit(entries.length);
    return () => { offs.forEach(o => { if (typeof o === 'function') o(); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 알약 바: 내용 크기가 바뀔 때마다 메인에 알린다(창 크기와 위치 보정은 메인이 한다)
  useLayoutEffect(() => {
    if (!isBar) return;
    const el = rootRef.current; if (!el) return;
    const report = () => { const r = el.getBoundingClientRect(); api()?.quickResize(Math.ceil(r.width), Math.ceil(r.height)); };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report); ro.observe(el);
    return () => ro.disconnect();
  }, [isBar]);

  // 호: 카드(날씨·알람)가 열려 있으면 그 크기를 메인에 알린다(메인이 호 바깥쪽에 자리를 잡는다). 닫으면 null
  useLayoutEffect(() => {
    if (isBar) return;
    if (view === 'menu') { api()?.quickCard(null); return; }
    const el = cardRef.current; if (!el) return;
    let lastW = 0, lastH = 0;
    const report = () => { const w = Math.ceil(el.offsetWidth), h = Math.ceil(el.offsetHeight); if (w !== lastW || h !== lastH) { lastW = w; lastH = h; api()?.quickCard({ width: w, height: h }); } };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report); ro.observe(el);
    return () => ro.disconnect();
  }, [view, isBar]);

  // Esc는 어느 화면에서든(열림 도중에도) 퀵 메뉴 전체를 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); api()?.quickClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 화면이 바뀔 때 첫 컨트롤로 포커스(키보드로 바로 쓸 수 있게)
  useEffect(() => {
    if (!layout) return;
    const id = requestAnimationFrame(() => {
      if (view === 'menu') tileRefs.current[focusIdx]?.focus();
      else rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, !!layout]);

  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  const back = useCallback(() => setView('menu'), []);
  const onPick = (e: Entry) => {
    if (closing) return;
    if (e.id === 'quit') {   // 한 번 누르면 확인 단계(3초), 그 안에 다시 누르면 종료, 아니면 원상복구
      if (!armed) {
        setArmed(true);
        if (armTimer.current) clearTimeout(armTimer.current);
        armTimer.current = setTimeout(() => setArmed(false), QUIT_CONFIRM_MS);
      } else {
        if (armTimer.current) clearTimeout(armTimer.current);
        api()?.quickAction('quit');
      }
      return;
    }
    if (armed) { setArmed(false); if (armTimer.current) clearTimeout(armTimer.current); }
    if (e.id === 'weather') setView(v => (v === 'weather' ? 'menu' : 'weather'));
    else if (e.id === 'alarm') setView(v => (v === 'alarm' ? 'menu' : 'alarm'));
    else api()?.quickAction(e.id as 'open');
  };
  const onKeys = (ev: React.KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const next = moveQuickFocus(focusIdx, ev.key, entries.length);
    setFocusIdx(next); tileRefs.current[next]?.focus();
  };

  const face = (e: Entry, i: number) => {
    const confirming = !!e.danger && armed;
    const active = (e.id === 'weather' && view === 'weather') || (e.id === 'alarm' && view === 'alarm');
    return (
      <button type="button" className="qk-face" data-danger={e.danger ? '' : undefined} data-armed={confirming ? '' : undefined} data-active={active ? '' : undefined}
        ref={el => { tileRefs.current[i] = el; }} tabIndex={i === focusIdx ? 0 : -1} aria-pressed={e.id === 'weather' || e.id === 'alarm' ? active : undefined}
        title={e.tip} aria-label={confirming ? QUIT_CONFIRM_TEXT : `${e.label}. ${e.tip}`}
        onFocus={() => setFocusIdx(i)} onClick={() => onPick(e)}>
        {confirming ? <Check className="qk-i" strokeWidth={2.2} aria-hidden /> : <e.Icon className="qk-i" strokeWidth={ICON_STROKE} aria-hidden />}
      </button>
    );
  };
  const card = view === 'menu' ? null : (
    <div className="qk-card" ref={cardRef} role="dialog" aria-label={view === 'weather' ? '날씨' : '오늘 알람'}
      style={arc && arc.card ? { left: arc.card.x, top: arc.card.y } : undefined} data-placed={arc && arc.card ? '' : undefined}>
      {view === 'weather' ? <WeatherCard onBack={back} /> : <AlarmCard onBack={back} />}
    </div>
  );

  // ── 호 ────────────────────────────────────────────────────────────
  if (!isBar) {
    return (
      <div className="qk-root" ref={rootRef} data-mode="arc" data-open={opened ? '' : undefined} data-closing={closing ? '' : undefined} data-dir={arc?.dir}
        style={arc ? { width: arc.bounds.width, height: arc.bounds.height } : undefined} onKeyDown={onKeys}>
        {arc && (
          <div className="qk-arc" role="toolbar" aria-label="퀵 메뉴" aria-orientation="horizontal">
            {entries.map((e, i) => {
              const b = arc.buttons[i]; const f = flightVars(i);
              return (
                <div key={e.id} className="qk-fx" style={{ left: b.x, top: b.y, ...cssVars({ '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, '--rot': `${f.rot}deg`, '--delay': `${f.delay}ms` }) }}>
                  <div className="qk-fy"><div className="qk-fb">{face(e, i)}</div></div>
                </div>
              );
            })}
            {armed && <div className="qk-hint" role="status" style={{ left: arc.hint.x, top: arc.hint.y, width: arc.hint.w, height: arc.hint.h }}>{QUIT_CONFIRM_TEXT}</div>}
          </div>
        )}
        {arc && card}
      </div>
    );
  }

  // ── 알약 바(7개 이상) ────────────────────────────────────────────────
  const bar = (
    <div className="qk-bar" role="toolbar" aria-label="퀵 메뉴" aria-orientation="horizontal" onKeyDown={onKeys} style={cssVars({ '--qk-gap': `${quickGapPx(entries.length)}px` })}>
      {entries.map((e, i) => (
        <span key={e.id} className="qk-slot">
          {e.danger && i > 0 && <span className="qk-sep" aria-hidden />}
          {face(e, i)}
        </span>
      ))}
    </div>
  );
  const extra = card ?? (armed ? <div className="qk-hint qk-hint--flow" role="status">{QUIT_CONFIRM_TEXT}</div> : null);
  return (
    <div className="qk-root" ref={rootRef} data-mode="bar" data-side={side} data-open={opened || !!layout ? '' : undefined} data-closing={closing ? '' : undefined}>
      {side === 'above' ? <>{extra}{bar}</> : <>{bar}{extra}</>}
    </div>
  );
}
