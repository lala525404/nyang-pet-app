import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AlarmClock, Bell, Check, ChevronLeft, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, LayoutDashboard, Power, Sun, Thermometer, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import '../styles/quick.css';
import { cityById } from '../data/cities';
import type { City } from '../data/cities';
import { cityLabel } from '../utils/citySearch';
import { loadSettings, formatTime } from '../utils/settings';
import { QUIT_CONFIRM_MS, SPARKLE_COOLDOWN_MS, SPARKLE_LIFETIME_MS, barRows, canSparkle, flightVars, layoutQuickItems, moveQuickFocus, quickGapPx, sparkleBurst, sparkleEdgeBurst, sparkleRoom } from '../utils/quickMenu';
import type { Sparkle } from '../utils/quickMenu';
import { NO_ALARM_TEXT, todayAlarmList, untilText } from '../utils/quickAlarms';
import type { QuickAlarmSettings, TodayAlarmItem } from '../utils/quickAlarms';
import {
  WEATHER_CREDIT_TEXT, WEATHER_SETUP_TEXT, formatTemp, formatWind, hourLabel, staleText, threeHourly, todayDay, weatherLabel, windText,
} from '../utils/weatherCard';
import type { WeatherIcon } from '../utils/weatherCard';
import type { QuickLayout, WeatherData } from '../electron';

// 퀵 메뉴 창(펫 우클릭): 기본은 펫 머리 위 가로 알약 바(아이콘만)이고, 날씨·알람 카드는 바 위(자리가 없으면 아래)에 붙는다. 아이콘에 호버하면 4갈래 별 스파클이 뾰로롱 튄다.
// 방사형(호) 배치는 메인의 상수 QUICK_MENU_LAYOUT(quick-menu.cjs)을 'radial'로 바꾸면 쓸 수 있다(설정 UI에는 없음). 호의 좌표·방향·카드 자리는 메인이 계산해서 보내 주고, 여기서는 그 좌표에 CSS 애니메이션만 건다(rAF 루프 없음).
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
  const sparkLayerRef = useRef<HTMLDivElement>(null);
  const sparkLastRef = useRef<Record<string, number>>({});   // 아이콘(또는 바 진입)별 마지막으로 터진 시각 → 쿨다운
  const arc = layout && layout.mode === 'arc' ? layout : null;
  const barLayout = layout && layout.mode === 'bar' ? layout : null;
  const isBar = !!barLayout;
  const side = barLayout ? barLayout.side : 'above';

  // 메인에 버튼 수를 알리고, 메인이 보내는 배치·열림·닫힘을 받는다
  useEffect(() => {
    const a = api();
    const offs = [a?.onQuickLayout?.(l => setLayout(l)), a?.onQuickOpen?.(() => setOpened(true)), a?.onQuickClosing?.(() => setClosing(true))];
    a?.quickInit(entries.length);
    return () => { offs.forEach(o => { if (typeof o === 'function') o(); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 알약 바: 내용 크기가 바뀔 때마다 메인에 알리고(창 크기와 위치 보정은 메인이 한다), 클릭을 받을 영역(바·카드의 사각형)도 알린다
  useLayoutEffect(() => {
    if (!isBar) return;
    const el = rootRef.current; if (!el) return;
    let lastKey = '';
    const report = () => {
      const r = el.getBoundingClientRect();
      api()?.quickResize(Math.ceil(r.width), Math.ceil(r.height));
      const list: unknown[] = [];
      for (const sel of ['.qk-bar', '.qk-card']) {
        const t = el.querySelector<HTMLElement>(sel); if (!t) continue;
        // 변환(등장 애니메이션의 scale)에 흔들리지 않게 레이아웃 크기(offset*)를 쓴다
        if (t.offsetWidth > 0 && t.offsetHeight > 0) list.push({ kind: 'rect', x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight });
      }
      const key = JSON.stringify(list);
      if (key !== lastKey) { lastKey = key; api()?.quickRegions(list); }
    };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report); ro.observe(el);
    return () => ro.disconnect();
  }, [isBar, view]);

  // 4갈래 별 스파클("뾰로롱"): 호버 이벤트에서 입자 몇 개를 DOM에 더하고, animationend에서 지운다(rAF 루프 없음). 움직임 줄이기에서는 생략. 메뉴가 닫히면 남은 입자는 즉시 지운다.
  const clearSparks = useCallback(() => { const layer = sparkLayerRef.current; if (layer) layer.textContent = ''; }, []);
  const spawnSparks = useCallback((list: Sparkle[]) => {
    const layer = sparkLayerRef.current; if (!layer) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const n = sparkleRoom(layer.childElementCount, list.length);
    for (const s of list.slice(0, n)) {
      const el = document.createElement('i');
      el.className = 'qk-spark'; el.setAttribute('aria-hidden', 'true');
      el.style.left = `${Math.round(s.x - s.size / 2)}px`; el.style.top = `${Math.round(s.y - s.size / 2)}px`;
      el.style.width = `${s.size}px`; el.style.height = `${s.size}px`;
      el.style.setProperty('--dx', `${s.dx}px`); el.style.setProperty('--dy', `${s.dy}px`); el.style.setProperty('--rot', `${s.rot}deg`); el.style.setProperty('--delay', `${s.delay}ms`);
      const remove = () => el.remove();
      el.addEventListener('animationend', remove, { once: true });
      window.setTimeout(remove, SPARKLE_LIFETIME_MS + s.delay + 300);   // animationend가 안 오는 경우의 안전장치
      layer.append(el);
    }
  }, []);
  const sparkleOk = (key: string) => {
    const now = Date.now();
    if (closing || !canSparkle(sparkLastRef.current[key], now, SPARKLE_COOLDOWN_MS)) return false;
    sparkLastRef.current[key] = now; return true;
  };
  const sparkIcon = (id: string, el: HTMLElement) => {
    const root = rootRef.current; if (!root || !sparkleOk(id)) return;
    const r = el.getBoundingClientRect(), o = root.getBoundingClientRect();
    spawnSparks(sparkleBurst(r.left - o.left + r.width / 2, r.top - o.top + r.height / 2));
  };
  const sparkBarEnter = () => {
    const root = rootRef.current, bar = root?.querySelector<HTMLElement>('.qk-bar'); if (!root || !bar || !sparkleOk('bar')) return;
    const r = bar.getBoundingClientRect(), o = root.getBoundingClientRect();
    spawnSparks(sparkleEdgeBurst({ left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height }));
  };
  useEffect(() => { if (closing) clearSparks(); }, [closing, clearSparks]);
  useEffect(() => () => clearSparks(), [clearSparks]);

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

  // Esc는 어느 화면에서든(열림 도중에도) 퀵 메뉴 전체를 닫는다. 키보드를 쓰는 동안에만 포커스 링을 보인다(마우스로 열었을 때 첫 아이콘에 링이 남지 않게)
  const [kbd, setKbd] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); api()?.quickClose(); } else setKbd(true); };
    const onPointer = () => setKbd(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('pointermove', onPointer);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); window.removeEventListener('pointermove', onPointer); };
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
        onFocus={() => setFocusIdx(i)} onClick={() => onPick(e)} onMouseEnter={(ev) => { if (isBar) sparkIcon(e.id, ev.currentTarget); }}>
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

  // ── 호(방사형: QUICK_MENU_LAYOUT = 'radial'일 때) ───────────────────────────
  if (!isBar) {
    return (
      <div className="qk-root" ref={rootRef} data-mode="arc" data-open={opened ? '' : undefined} data-closing={closing ? '' : undefined} data-dir={arc?.dir} data-kbd={kbd ? '' : undefined}
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

  // ── 알약 바(기본) ────────────────────────────────────────────────────
  // 한 줄로 들어가면 완전한 알약, 화면 폭(maxWidth)을 넘으면 두 줄로 줄바꿈된다. 아이콘은 왼쪽부터 20ms 간격으로 살짝 올라오며 나타난다.
  const rows = barRows(entries.length, barLayout?.maxWidth ?? 0);
  const bar = (
    <div className="qk-bar" role="toolbar" aria-label="퀵 메뉴" aria-orientation="horizontal" onKeyDown={onKeys} onMouseEnter={sparkBarEnter} data-rows={rows}
      style={cssVars({ '--qk-gap': `${quickGapPx(entries.length)}px`, ...(barLayout?.maxWidth ? { '--qk-maxw': `${barLayout.maxWidth}px` } : {}) })}>
      {entries.map((e, i) => (
        <span key={e.id} className="qk-slot" style={cssVars({ '--i': String(i) })}>
          {e.danger && i > 0 && <span className="qk-sep" aria-hidden />}
          {face(e, i)}
        </span>
      ))}
    </div>
  );
  const extra = card ?? (armed ? <div className="qk-hint qk-hint--flow" role="status">{QUIT_CONFIRM_TEXT}</div> : null);
  return (
    <div className="qk-root" ref={rootRef} data-mode="bar" data-side={side} data-open={opened || !!layout ? '' : undefined} data-closing={closing ? '' : undefined} data-kbd={kbd ? '' : undefined}>
      {side === 'above' ? <>{extra}{bar}</> : <>{bar}{extra}</>}
      <div className="qk-sparks" ref={sparkLayerRef} aria-hidden="true" />
    </div>
  );
}
