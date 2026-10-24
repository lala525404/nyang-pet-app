import { useState, useEffect, useRef, useCallback } from 'react';
import { CircleHelp, House, Bell, Monitor as MonitorIcon, Moon, Power, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import '../styles/settings.css';
import CropModal from '../components/CropModal';
import AnimalModal from '../components/settings/AnimalModal';
import HomePane from '../components/settings/HomePane';
import AlarmPane from '../components/settings/AlarmPane';
import HelpPane from '../components/settings/HelpPane';
import UpdateStatus from '../components/settings/UpdateStatus';
import HeartMark from '../components/HeartMark';
import BubbleModal from '../components/settings/BubbleModal';
import Intro from '../components/Intro';
import type { EntranceKind } from '../components/Intro';
import Onboarding from '../components/Onboarding';
import { createPortal } from 'react-dom';
import type { Monitor } from '../components/settings/shared';
import { MODE_PRESETS, loadSettings, readStoredSettings, saveSettings, seedFreshInstall } from '../utils/settings';
import type { PetSettings } from '../utils/settings';
import { getThemePref, nextThemePref, setThemePref } from '../utils/theme';
import type { ThemePref } from '../utils/theme';

type NavPage = 'home' | 'alarm' | 'help';

const PAGES: Record<NavPage, { label: string; title: string; desc: string; icon: LucideIcon }> = {
  home: { label: '홈', title: '내 버디', desc: '버디를 고르고 움직임과 알림을 바꿔요. 바꾼 값은 바로 적용돼요.', icon: House },
  alarm: { label: '알람', title: '알람', desc: '원하는 시간에 화면 가득 알람이 울려요! 요일마다 반복하거나 날짜를 정할 수 있고, 최대 50개예요.', icon: Bell },
  help: { label: '사용 방법', title: '사용 방법', desc: '버디와 함께하는 방법을 알아봐요', icon: CircleHelp },
};

const THEME_UI: Record<ThemePref, { icon: LucideIcon; name: string }> = {
  light: { icon: Sun, name: '라이트' },
  dark: { icon: Moon, name: '다크' },
  system: { icon: MonitorIcon, name: '시스템' },
};

const SAVE_DELAY_MS = 300;

export default function SettingsPage() {
  // 새 설치면 첫 렌더 전에 하트 기본값을 저장해 둔다(아래 loadSettings가 그 값을 읽는다)
  const freshSeed = useRef(seedFreshInstall(/entrance=new/.test(window.location.hash))).current;
  const [settings, setSettings] = useState<PetSettings>(loadSettings);
  const [page, setPage] = useState<NavPage>('home');
  const [animalOpen, setAnimalOpen] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);

  // ── 시작 인트로: 메인이 새 버전 첫 설정창에만 해시에 intro=1을 붙여 준다. 설정의 "시작 인트로 보기"가 꺼져 있으면 건너뛴다.
  // 움직임 줄이기면 인트로 없이 150ms 페이드만 한다.
  // 입구: 완전 새 설치면 "처음 왔어요"를 강조하고(인트로 연출이 꺼져 있어도 버튼 화면은 반드시 보인다), 새 버전으로 올린 기존 사용자면 "오늘도 함께해요"를 강조한다.
  // 새 설치라고 해도 이미 저장된 설정이 있으면 기존 사용자로 본다. 움직임 줄이기면 연출 없이 버튼 화면만 보인다.
  const introRequested = useRef(window.location.hash.includes('intro=1')).current;
  const entranceParam = useRef(/entrance=(new|old)/.exec(window.location.hash)?.[1] ?? '').current;
  const initialEntrance: EntranceKind | null = entranceParam === 'new' ? (freshSeed ? 'new' : 'old') : entranceParam === 'old' ? 'old' : null;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const introWanted = initialEntrance === 'new' || (introRequested && loadSettings().introEnabled !== false);
  const [entrance, setEntrance] = useState<EntranceKind | null>(introWanted ? initialEntrance : null);
  const [introPlaying, setIntroPlaying] = useState(() => introWanted && (!reduceMotion() || initialEntrance !== null));
  const [fadeKey, setFadeKey] = useState(() => (introWanted && reduceMotion() && initialEntrance === null ? 1 : 0));
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => { if (introWanted) window.electronAPI?.introSeen?.(); }, []);   // 한 번 보여 줬다고 알린다(보는 중에 닫아도 다시 나오지 않게)
  const replayIntro = useCallback(() => { setEntrance(null); if (reduceMotion()) setFadeKey(k => k + 1); else setIntroPlaying(true); }, []);
  const endIntro = useCallback(() => { setIntroPlaying(false); setEntrance(null); }, []);
  const chooseEntrance = useCallback((kind: EntranceKind) => { if (kind === 'new') setOnboarding(true); }, []);
  const closeOnboarding = useCallback((kind: 'done' | 'cancel') => {
    setOnboarding(false);
    if (kind === 'done') window.electronAPI?.onboardingFinish?.();   // 버디 풀어놓기: 설정창을 닫는다(버디는 이미 실행 중)
  }, []);
  // 인트로가 떠 있는 동안 뒤의 설정창은 키보드·마우스 대상이 아니다. 처음 안내 중에는 안내가 설정창 위를 덮으므로 아래 화면만 막는다.
  useEffect(() => {
    const root = document.querySelector('.settings-root');
    if (introPlaying) root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, [introPlaying]);
  useEffect(() => {
    if (!onboarding) return;
    const els = Array.from(document.querySelectorAll('.st-rail-col, .st-main'));
    els.forEach(e => e.setAttribute('inert', ''));
    return () => els.forEach(e => e.removeAttribute('inert'));
  }, [onboarding]);
  const [themePref, setPref] = useState<ThemePref>(getThemePref);
  const [themeNote, setThemeNote] = useState('');

  // ── 값이 바뀌면 300ms 뒤 즉시 적용 (저장 + 메인 프로세스 동기화) ─────────────
  const latestRef = useRef(settings);
  const appliedRef = useRef(settings);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFailedRef = useRef(false);

  const apply = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const next = latestRef.current;
    if (!saveSettings(next)) {
      if (!saveFailedRef.current) alert('저장 공간이 부족해요. 이미지 수를 줄여 주세요.');
      saveFailedRef.current = true;
      dirtyRef.current = true; // 화면과 저장이 갈라지지 않게, 다음 변경이나 창 닫기 때 다시 저장을 시도한다
      return;
    }
    saveFailedRef.current = false;
    const prev = appliedRef.current;
    appliedRef.current = next;
    const api = window.electronAPI;
    if (next.alwaysOnTop !== prev.alwaysOnTop) api?.setAlwaysOnTop(next.alwaysOnTop);
    if (next.petVisible !== prev.petVisible) { if (next.petVisible) api?.showPet(); else api?.hidePet(); }
    if (next.yarEnabled !== prev.yarEnabled || next.yarInterval !== prev.yarInterval) {
      api?.setYarTimer(next.yarEnabled ? next.yarInterval : 0);
    }
    api?.syncSettings(next as unknown as Record<string, unknown>);
  }, []);

  const change = useCallback((fn: (prev: PetSettings) => PetSettings) => {
    // 연속 호출에도 최신 값 위에 쌓이도록 ref 기준으로 계산한다
    const next = fn(latestRef.current);
    latestRef.current = next;
    setSettings(next);
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(apply, SAVE_DELAY_MS);
  }, [apply]);

  // 창을 닫거나 화면을 벗어날 때 기다리던 변경을 바로 적용
  useEffect(() => {
    window.addEventListener('pagehide', apply);
    window.addEventListener('beforeunload', apply);
    return () => {
      window.removeEventListener('pagehide', apply);
      window.removeEventListener('beforeunload', apply);
      apply();
    };
  }, [apply]);

  // 알람 대화(퀵 메뉴)가 다른 창에서 알람을 만들거나 지우면 이 창의 화면에도 바로 반영한다(안 그러면 이 창이 나중에 저장하면서 그 변경을 덮어쓴다).
  // 저장값이 이미 바뀐 상태라 "저장할 변경"으로 표시하지 않는다(dirty 아님). 알람과 점심·퇴근 켜짐만 가져온다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== 'petSettings') return;
      const fresh = readStoredSettings() as Partial<PetSettings> | null;
      if (!fresh || !Array.isArray(fresh.alarms)) return;
      const cur = latestRef.current;
      const pick = { alarms: fresh.alarms, lunchEnabled: fresh.lunchEnabled ?? cur.lunchEnabled, leaveEnabled: fresh.leaveEnabled ?? cur.leaveEnabled };
      if (JSON.stringify(pick) === JSON.stringify({ alarms: cur.alarms, lunchEnabled: cur.lunchEnabled, leaveEnabled: cur.leaveEnabled })) return;
      latestRef.current = { ...cur, ...pick }; appliedRef.current = { ...appliedRef.current, ...pick };
      setSettings(latestRef.current);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 펫 퀵 메뉴에서 "동네 정하기"·"알람 설정 열기"로 열렸으면 그 위치로 간다. 이미 열려 있던 창은 메인이 바로 알리고, 새로 만든 창은 맡겨 둔 목적지를 가져온다.
  const [weatherGoto, setWeatherGoto] = useState(0);
  const [weekGoto, setWeekGoto] = useState<{ start: string; n: number } | null>(null);   // 알람 화면의 주간 캘린더를 옮길 주(월요일 YYYY-MM-DD)
  useEffect(() => {
    const api = window.electronAPI;
    const go = (t: { page?: 'home' | 'alarm'; focus?: 'weather-city'; week?: string } | null) => {
      if (!t) return;
      if (t.page) setPage(t.page);
      if (t.week) setWeekGoto({ start: t.week, n: Date.now() });
      if (t.focus === 'weather-city') setWeatherGoto(n => n + 1);
    };
    api?.takeSettingsGoto?.().then(go).catch(() => {});
    return api?.onSettingsGoto?.(go);
  }, []);

  // 앱이 종료되기 직전에 메인이 저장을 요청하면 바로 적용하고 끝났다고 알린다
  useEffect(() => {
    const api = window.electronAPI;
    return api?.onFlushSettings?.(() => { apply(); api.settingsFlushed(); });
  }, [apply]);

  // 설정창을 열 때 한 번, 메인 프로세스의 실제 상태(표시·항상 위·야르)를 저장값에 맞춘다
  useEffect(() => {
    const s = appliedRef.current;
    const api = window.electronAPI;
    api?.setAlwaysOnTop(s.alwaysOnTop);
    if (s.petVisible) api?.showPet(); else api?.hidePet();
    api?.setYarTimer(s.yarEnabled ? s.yarInterval : 0);
    api?.syncSettings(s as unknown as Record<string, unknown>);   // 알람·사진 교체도 저장값에 맞춘다(펫 창의 시작 동기화와 별개로 한 번 더)
  }, []);

  // 예전 앱과 같은 규칙: update는 모드를 "커스텀"으로, patch는 모드를 건드리지 않는다
  const update = useCallback((p: Partial<PetSettings>) => change(prev => ({ ...prev, ...p, buddyMode: 'custom' })), [change]);
  const patch = useCallback((p: Partial<PetSettings>) => change(prev => ({ ...prev, ...p })), [change]);
  // 처음 안내: 값을 바꾸는 즉시 저장하고 버디 창에 전달한다(300ms 묶음 저장을 기다리지 않는다)
  const changeNow = useCallback((p: Partial<PetSettings>) => { patch(p); apply(); }, [patch, apply]);
  const applyMode = useCallback((mode: 'chill' | 'buddy' | 'chaos') =>
    change(prev => ({ ...prev, ...MODE_PRESETS[mode], size: prev.size })), [change]);

  // ── 연결된 모니터 목록 ──────────────────────────────────────────────
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  useEffect(() => {
    window.electronAPI?.getAllDisplays?.()
      .then(d => { if (d) setMonitors(d.monitors.map(m => ({ displayId: m.displayId, isPrimary: m.isPrimary, index: m.id }))); })
      .catch(() => {});
  }, []);

  // ── 커스텀 사진: 파일 선택 → 자르기 (src는 ObjectURL) ───────────────────────
  const [cropState, setCropState] = useState<{ slot: number; src: string } | null>(null);
  const cropSrcRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef(0);
  const closeCrop = useCallback(() => {
    if (cropSrcRef.current) { URL.revokeObjectURL(cropSrcRef.current); cropSrcRef.current = null; }
    setCropState(null);
  }, []);
  useEffect(() => () => { if (cropSrcRef.current) URL.revokeObjectURL(cropSrcRef.current); }, []);

  const pickPhoto = (slot: number) => {
    pendingSlotRef.current = slot;
    fileInputRef.current?.click();
  };
  // "사진 올리기": 빈 칸이 있으면 바로 파일 선택, 3장이 다 찼으면 사진 관리 창을 연다
  const upload = () => {
    const slot = settings.customImages.findIndex(img => !img);
    if (slot < 0) { patch({ useCustomMode: true }); setAnimalOpen(true); } else pickPhoto(slot);
  };
  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 가능
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('5MB 이하로 해주세요!'); return; }
    if (cropSrcRef.current) URL.revokeObjectURL(cropSrcRef.current);
    const url = URL.createObjectURL(file);
    cropSrcRef.current = url;
    setCropState({ slot: pendingSlotRef.current, src: url });
  };

  const cycleTheme = () => {
    const next = nextThemePref(themePref);
    setThemePref(next);
    setPref(next);
    setThemeNote(`화면 테마 ${THEME_UI[next].name}`);
  };

  const info = PAGES[page];
  const ThemeIcon = THEME_UI[themePref].icon;
  const nextName = THEME_UI[nextThemePref(themePref)].name;

  return (
    <div className="settings-root" data-fade={fadeKey ? (fadeKey % 2 ? 'a' : 'b') : undefined}>
      <input ref={fileInputRef} type="file" accept=".png,.svg,.jpg,.jpeg,.webp" hidden onChange={onFileChosen} />

      {cropState && (
        <CropModal
          key={cropState.src}
          src={cropState.src}
          onCancel={closeCrop}
          shape={settings.customShape}
          onShapeChange={(customShape) => patch({ customShape })}
          onApply={(dataUrl) => {
            const slot = cropState.slot;
            change(prev => {
              const next = [...prev.customImages];
              next[slot] = dataUrl;
              return { ...prev, customImages: next, useCustomMode: true };
            });
            closeCrop();
          }}
        />
      )}

      {bubbleOpen && (
        <BubbleModal settings={settings} patch={patch} onClose={() => setBubbleOpen(false)} suspended={cropState !== null} />
      )}

      {animalOpen && (
        <AnimalModal settings={settings} update={update} patch={patch}
          onClose={() => setAnimalOpen(false)} onPickPhoto={pickPhoto} suspended={cropState !== null} />
      )}

      <div className="st-rail-col">
        <nav className="st-rail" aria-label="설정 메뉴">
          {(Object.keys(PAGES) as NavPage[]).map(id => {
            const Icon = PAGES[id].icon;
            return (
              <button key={id} type="button" className="st-rbtn" data-label={PAGES[id].label} aria-label={PAGES[id].label}
                aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}>
                <Icon className="ui-i" strokeWidth={1.5} aria-hidden />
              </button>
            );
          })}
          <button type="button" className="st-rbtn st-rail-gap" data-label="앱 종료" aria-label="앱 종료"
            onClick={() => { apply(); window.electronAPI?.quitApp(); }}>
            <Power className="ui-i" strokeWidth={1.5} aria-hidden />
          </button>
        </nav>
      </div>

      <main className="st-main">
        <header className="st-head">
          <div>
            <p className="st-brand heart-mark-host"><HeartMark motion="thump" className="st-brand-heart" />최애를 풀어놨습니다 <small>v{__APP_VERSION__}</small><UpdateStatus /></p>
            <h1 className="st-title">{info.title}</h1>
            <p className="st-desc">{info.desc}</p>
          </div>
          <button type="button" className="st-pillbtn" onClick={cycleTheme}
            aria-label={`화면 테마: ${THEME_UI[themePref].name}. 누르면 ${nextName}${nextName === '시스템' ? '으로' : '로'} 바뀌어요`}>
            <ThemeIcon className="ui-i" strokeWidth={1.5} aria-hidden />
            <span>{THEME_UI[themePref].name}</span>
          </button>
          <span className="st-sr" role="status" aria-live="polite">{themeNote}</span>
        </header>

        {page === 'home' && (
          <HomePane settings={settings} update={update} patch={patch} monitors={monitors} applyMode={applyMode}
            onOpenAnimal={() => setAnimalOpen(true)} onOpenBubble={() => setBubbleOpen(true)} onUpload={upload} gotoWeather={weatherGoto} />
        )}
        {page === 'alarm' && <AlarmPane settings={settings} update={update} patch={patch} gotoWeek={weekGoto} />}
        {page === 'help' && <HelpPane settings={settings} patch={patch} onReplayIntro={replayIntro} onReplayOnboarding={() => setOnboarding(true)} />}
      </main>
      {onboarding && <Onboarding settings={settings} onChange={changeNow} themePref={themePref} onTheme={(t) => { setThemePref(t); setPref(t); setThemeNote(`화면 테마 ${THEME_UI[t].name}`); }} onUpload={upload} onClose={closeOnboarding} />}
      {introPlaying && createPortal(<Intro onDone={endIntro} entrance={entrance ?? undefined} onChoose={chooseEntrance} />, document.body)}
    </div>
  );
}
