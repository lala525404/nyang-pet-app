import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlarmClock, Bell, ChevronLeft, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, LayoutDashboard, Power, Sun, Thermometer, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import '../styles/ui.css';
import '../styles/quick.css';
import { cityById } from '../data/cities';
import type { City } from '../data/cities';
import { cityLabel } from '../utils/citySearch';
import { loadSettings, formatTime } from '../utils/settings';
import { QUICK_COLUMNS, QUIT_CONFIRM_MS, layoutQuickItems, moveQuickFocus } from '../utils/quickMenu';
import { NO_ALARM_TEXT, todayAlarmList, untilText } from '../utils/quickAlarms';
import type { QuickAlarmSettings, TodayAlarmItem } from '../utils/quickAlarms';
import {
  WEATHER_CREDIT_TEXT, WEATHER_SETUP_TEXT, formatTemp, formatWind, hourLabel, staleText, threeHourly, todayDay, weatherLabel, windText,
} from '../utils/weatherCard';
import type { WeatherIcon } from '../utils/weatherCard';
import type { WeatherData } from '../electron';

// 퀵 메뉴 창(펫 우클릭): 아이콘 격자 → 날씨 카드 / 알람 카드. 창 크기는 내용에 맞춰 메인에 알린다(메인이 화면 안으로 위치를 보정한다).
// 닫기: Esc · 바깥 클릭·포커스 잃음(메인이 처리). 새 항목은 아래 ITEMS 배열에 추가만 하면 된다(최대 8개, 종료는 항상 마지막).

type View = 'menu' | 'weather' | 'alarm';
interface Entry { id: string; label: string; tip: string; Icon: LucideIcon; danger?: boolean }

const ITEMS: Entry[] = [
  { id: 'open', label: '메인', tip: '메인 창 열기', Icon: LayoutDashboard },
  { id: 'weather', label: '날씨', tip: '오늘 날씨 보기', Icon: CloudSun },
  { id: 'alarm', label: '알람', tip: '오늘 알람 보기', Icon: Bell },
];
const QUIT: Entry = { id: 'quit', label: '종료', tip: '종료하면 알람이 울리지 않아요', Icon: Power, danger: true };

const WEATHER_ICONS: Record<WeatherIcon, LucideIcon> = {
  sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

const api = () => window.electronAPI;

function CardHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="qk-head">
      <button type="button" className="ui-iconbtn" onClick={onBack} aria-label="뒤로" data-autofocus>
        <ChevronLeft className="ui-i" strokeWidth={1.5} aria-hidden />
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
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => api()?.quickAction('weather-setup')}>동네 정하기</button>
      </div>
    );
  } else if (phase === 'loading') {
    body = <p className="qk-note" role="status">불러오는 중이에요…</p>;
  } else if (phase === 'error' || !res) {
    body = (
      <div className="qk-empty">
        <p>날씨를 불러오지 못했어요</p>
        <button type="button" className="ui-btn" onClick={() => setTries(n => n + 1)}>다시 시도</button>
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
          <li><Wind className="ui-i" strokeWidth={1.5} aria-hidden /><span>풍속 {d.wind === null ? '-' : formatWind(d.wind)}</span><small>{d.wind === null ? '' : windText(d.wind)}</small></li>
          <li><Thermometer className="ui-i" strokeWidth={1.5} aria-hidden /><span>오늘 최고 {day?.max != null ? formatTemp(day.max) : '-'} · 최저 {day?.min != null ? formatTemp(day.min) : '-'}</span></li>
          <li><Droplets className="ui-i" strokeWidth={1.5} aria-hidden /><span>강수 확률 {day?.pop != null ? `${Math.round(day.pop)}%` : '-'}</span><small>오늘 최대</small></li>
        </ul>
        <section aria-label="오늘 남은 시간 예보">
          {hours.length ? (
            <ul className="qk-hours">
              {hours.map(h => {
                const L = weatherLabel(h.code), HI = WEATHER_ICONS[L.icon];
                return (
                  <li key={h.at} aria-label={`${hourLabel(h.at)} ${L.text} ${formatTemp(h.temp)}${h.pop != null ? ` 강수 확률 ${Math.round(h.pop)}%` : ''}`}>
                    <span>{hourLabel(h.at)}</span><HI className="ui-i" strokeWidth={1.5} aria-hidden /><b>{formatTemp(h.temp)}</b>
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
    <div className="qk-card qk-weather" role="dialog" aria-label="날씨">
      <CardHead title={city ? `날씨 · ${cityLabel(city)}` : '날씨'} onBack={onBack} />
      {body}
    </div>
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
    <div className="qk-card qk-alarm" role="dialog" aria-label="오늘 알람">
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
      <button type="button" className="ui-btn qk-foot" onClick={() => api()?.quickAction('alarm-settings')}>
        <AlarmClock className="ui-i" strokeWidth={1.5} aria-hidden />알람 설정 열기
      </button>
    </div>
  );
}

export default function QuickPage() {
  const [view, setView] = useState<View>('menu');
  const [armed, setArmed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const entries = layoutQuickItems(ITEMS, QUIT);

  // 내용 크기가 바뀔 때마다 메인에 알린다(창 크기와 위치 보정은 메인이 한다)
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const report = () => { const r = el.getBoundingClientRect(); api()?.quickResize(Math.ceil(r.width), Math.ceil(r.height)); };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Esc는 어느 화면에서든 퀵 메뉴 전체를 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); api()?.quickClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 화면이 바뀔 때 첫 컨트롤로 포커스(키보드로 바로 쓸 수 있게)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (view === 'menu') tileRefs.current[focusIdx]?.focus();
      else wrapRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  const back = useCallback(() => setView('menu'), []);
  const onPick = (e: Entry) => {
    if (e.id === 'quit') {   // 한 번 누르면 확인 단계, 3초 안에 다시 누르면 종료, 아니면 원상복구
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
    if (e.id === 'weather') setView('weather');
    else if (e.id === 'alarm') setView('alarm');
    else api()?.quickAction(e.id as 'open');
  };
  const onGridKey = (ev: React.KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const next = moveQuickFocus(focusIdx, ev.key, entries.length, QUICK_COLUMNS);
    setFocusIdx(next); tileRefs.current[next]?.focus();
  };

  return (
    <div className="qk-root" ref={wrapRef}>
      {view === 'menu' && (
        <div className="qk-card" role="menu" aria-label="퀵 메뉴">
          <div className="qk-grid" onKeyDown={onGridKey}>
            {entries.map((e, i) => {
              const confirming = e.danger && armed;
              return (
                <button key={e.id} type="button" role="menuitem" className="qk-tile" data-danger={e.danger ? '' : undefined} data-armed={confirming ? '' : undefined}
                  ref={el => { tileRefs.current[i] = el; }} tabIndex={i === focusIdx ? 0 : -1}
                  title={e.tip} aria-label={confirming ? '한 번 더 누르면 종료돼요' : `${e.label}. ${e.tip}`}
                  onFocus={() => setFocusIdx(i)} onClick={() => onPick(e)}>
                  <span className="qk-ico"><e.Icon className="ui-i" strokeWidth={1.6} aria-hidden /></span>
                  <span className="qk-label">{confirming ? '한 번 더 누르면 종료돼요' : e.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {view === 'weather' && <WeatherCard onBack={back} />}
      {view === 'alarm' && <AlarmCard onBack={back} />}
    </div>
  );
}
