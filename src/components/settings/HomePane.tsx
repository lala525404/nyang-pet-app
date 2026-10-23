import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import CatEmoji from '../CatEmoji';
import { Segmented, Switch, RangeInput } from '../ui';
import { getAnimal } from '../../data/animals';
import { BUBBLE_GAP_RANGE, BUBBLE_MAX_MESSAGES, BUBBLE_SHOW_RANGE, MODE_PRESETS, activePhotos, cleanBubbleMessages, clampTo, formatInterval } from '../../utils/settings';
import { usePhotoState } from '../../hooks/usePhotoState';
import { useLoginItem } from '../../hooks/useLoginItem';
import { useFocusMode } from '../../hooks/useFocusMode';
import { MODE_NAME } from './shared';
import WeatherCityRow, { WEATHER_CREDIT } from './WeatherCityRow';
import type { Monitor, PaneProps } from './shared';

const ZONE_NAMES = ['', '좌상단', '우상단', '좌하단', '우하단'];
const YAR_INTERVALS: [number, string][] = [[30, '30분'], [60, '1시간'], [90, '1시간 30분'], [120, '2시간'], [180, '3시간']];
const MODE_COPY: Record<string, [string, string]> = {
  chill: ['조용히 옆에', '거의 안 움직이고 조용히 있어요. 집중이 필요할 때!'],
  buddy: ['기본 친구', '가끔 움직이고 말풍선도 띄워요. 기본 설정이에요.'],
  chaos: ['신나게 난리', '광속으로 날아다니고 기습 이모지에 야르타임까지! 재미용!'],
  custom: ['직접 조절', '커스텀 설정으로 직접 조절 중이에요.'],
};

const secs = (n: number) => (n < 60 ? `${n}초` : `${Math.floor(n / 60)}분`);
const speedWord = (s: number) => (s <= 2 ? '느긋' : s <= 5 ? '보통' : s <= 8 ? '빠름' : '광속');
const sizeShort = (s: number) => (s === 70 ? '소' : s === 100 ? '중' : s === 150 ? '대' : '');
const yarLabel = (v: number) => (YAR_INTERVALS.find(x => x[0] === v) || [v, `${v}분`])[1];
const monitorName = (m: Monitor) => `모니터 ${m.index + 1}${m.isPrimary ? ' (주)' : ''}`;

// 활동 구역 4분할 그림 (선택 구역만 옅게 채움)
const QUAD: Record<number, [number, number]> = { 1: [3, 3], 2: [12, 3], 3: [3, 12], 4: [12, 12] };
function QuadIcon({ zone }: { zone: number }) {
  return (
    <svg className="ui-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18M3 12h18" />
      <rect x={QUAD[zone][0]} y={QUAD[zone][1]} width="9" height="9" fill="currentColor" fillOpacity=".3" stroke="none" />
    </svg>
  );
}

// 칩: 작은 라벨 + 굵은 현재 값. 누르면 팝오버에서 바꾼다.
// 팝오버는 창 기준 fixed 위치로 body에 그린다(포털). 스크롤하는 홈 영역이나 overflow 조상에 갇혀 잘리지 않는다.
// 기본은 칩 아래, 아래 공간이 모자라면 위로 열고, 둘 다 모자라면 더 넓은 쪽에서 높이를 제한해 팝오버 안에서 스크롤한다.
// 좌우는 창 안으로 민다. 창 크기·스크롤이 바뀌거나 팝오버 내용 높이가 바뀌면 다시 계산한다.
type PopPlace = { left: number; top: number | null; bottom: number | null; maxH: number | null; side: 'bottom' | 'top' };
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

function Chip({ id, label, value, end, open, onOpen, onClose, children }: {
  id: string; label: string; value: string; end: boolean;
  open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}) {
  // onClose는 매 렌더 새로 만들어지므로 ref로 들고, 리스너는 열린 동안 한 번만 붙인다
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<PopPlace>({ left: 0, top: 0, bottom: null, maxH: null, side: 'bottom' });
  const [fade, setFade] = useState(false);

  // 스크롤할 내용이 더 남아 있을 때만 아래 가장자리에 페이드를 보인다
  const updateFade = useCallback(() => {
    const pop = popRef.current;
    if (!pop) return;
    setFade(pop.scrollHeight > pop.clientHeight + 2 && pop.scrollTop + pop.clientHeight < pop.scrollHeight - 2);
  }, []);

  const reposition = useCallback(() => {
    const pop = popRef.current, btn = btnRef.current;
    if (!pop || !btn) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const chip = btn.getBoundingClientRect();
    const GAP = 8, MARGIN = 12;
    const natural = pop.scrollHeight + (pop.offsetHeight - pop.clientHeight);   // 테두리 포함한 원래 높이
    const below = vh - chip.bottom - GAP - MARGIN;
    const above = chip.top - GAP - MARGIN;
    let side: 'bottom' | 'top' = 'bottom';
    let maxH: number | null = null;
    if (natural <= below) side = 'bottom';
    else if (natural <= above) side = 'top';
    else { side = below >= above ? 'bottom' : 'top'; maxH = Math.max(140, Math.floor(side === 'bottom' ? below : above)); }
    const width = pop.offsetWidth;
    let left = end ? chip.right - width : chip.left;
    left = Math.round(Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - MARGIN - width)));
    const next: PopPlace = side === 'bottom'
      ? { left, top: Math.round(chip.bottom + GAP), bottom: null, maxH, side }
      : { left, top: null, bottom: Math.round(vh - chip.top + GAP), maxH, side };
    setPlace(prev => (prev.left === next.left && prev.top === next.top && prev.bottom === next.bottom && prev.maxH === next.maxH && prev.side === next.side ? prev : next));
  }, [end]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const pop = popRef.current;
    const ro = typeof ResizeObserver !== 'undefined' && pop ? new ResizeObserver(() => { reposition(); updateFade(); }) : null;
    if (ro && pop) ro.observe(pop);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);   // 홈 영역을 스크롤하면 칩이 움직이므로 따라간다
    return () => { ro?.disconnect(); window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open, reposition, updateFade]);
  useEffect(() => { if (open) updateFade(); }, [open, place, updateFade]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); btnRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 팝오버가 body에 있어 Tab 순서가 칩에서 떨어져 있으므로, 열려 있는 동안은 팝오버 안에서 Tab이 순환하게 한다
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = Array.from(popRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const pop = (
    <div ref={popRef} className="st-pop" id={`pop-${id}`} role="dialog" aria-label={`${label} 설정`}
      data-open={open ? '' : undefined} data-end={end ? '' : undefined} data-side={place.side} data-fade={fade ? '' : undefined}
      onScroll={updateFade} onKeyDown={trapTab}
      style={{ left: place.left, top: place.top ?? undefined, bottom: place.bottom ?? undefined, maxHeight: place.maxH ?? undefined }}>
      {children}
    </div>
  );

  return (
    <div className="st-chip-wrap" ref={wrapRef}>
      <button ref={btnRef} type="button" className="st-chip" aria-haspopup="dialog" aria-expanded={open}
        aria-controls={`pop-${id}`}
        onClick={(e) => {
          if (open) { onClose(); return; }
          onOpen();
          // 키보드로 열면 팝오버 첫 컨트롤로 포커스 이동
          if (e.detail === 0) requestAnimationFrame(() => popRef.current?.querySelector<HTMLElement>('button, input, select')?.focus());
        }}>
        <span className="st-chip-label">{label}</span>
        <span className="st-chip-value">{value}</span>
      </button>
      {createPortal(pop, document.body)}
    </div>
  );
}

export default function HomePane({ settings: s, update, patch, monitors, applyMode, onOpenAnimal, onOpenBubble, onUpload }: PaneProps & {
  monitors: Monitor[];
  applyMode: (mode: 'chill' | 'buddy' | 'chaos') => void;
  onOpenAnimal: () => void;
  onOpenBubble: () => void;
  onUpload: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const login = useLoginItem();
  const focus = useFocusMode();   // 초집중 모드(메인이 소유·저장: 트레이에서 바꿔도 같이 바뀐다)
  const [bubbleAdv, setBubbleAdv] = useState(false);   // 말풍선 팝오버의 "고급" 펼침
  const closePop = (key: string) => () => setOpenKey(cur => (cur === key ? null : cur));

  const animal = getAnimal(s.animalId);
  const images = activePhotos(s.customImages);
  const custom = s.useCustomMode && images.length > 0;

  // 사진 교체: 켜져 있으면 버디와 같은 교체 시계(메인)를 따라 같은 순서·주기로 보여준다. 꺼져 있으면 대표 사진.
  const rotateOn = s.useCustomMode && images.length >= 2 && s.imageRotateEnabled !== false;
  const photo = usePhotoState();
  const liveIndex = rotateOn ? photo.index % images.length : 0;
  const [pinned, setPinned] = useState<number | null>(null);   // 점을 눌러 잠깐 다른 사진을 볼 때
  useEffect(() => { setPinned(null); }, [liveIndex, images.length]);   // 다음 교체나 사진 수 변경이면 다시 버디를 따라간다
  const shown = pinned !== null && pinned < images.length ? pinned : liveIndex;
  const size = s.size || 100;
  const sizeWord = size === 70 ? '작은' : size === 100 ? '중간' : size === 150 ? '큰' : `${size}%`;
  const activeMonitor = s.monitor >= 0 ? monitors.find(m => m.displayId === s.monitor) : undefined;

  const zoneValue = (() => {
    const parts = [activeMonitor ? `모니터 ${activeMonitor.index + 1}` : '', ZONE_NAMES[s.zone] || ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : '전체 화면';
  })();

  // 말풍선: 내 메시지(최대 5개)를 순서대로, 빈 간격에는 시계. 둘 다 없으면 말풍선이 뜨지 않는다.
  const bubbleOn = s.bubbleEnabled !== false;
  const bubbleClock = s.bubbleClock !== false;
  const bubbleCount = cleanBubbleMessages(s.bubbleMessages).length;
  const bubbleShow = clampTo(s.bubbleShowSec, BUBBLE_SHOW_RANGE, 5);
  const bubbleGap = clampTo(s.bubbleGapSec, BUBBLE_GAP_RANGE, 30);
  const bubbleValue = !bubbleOn ? '끔'
    : [bubbleCount ? `메시지 ${bubbleCount}개` : '', bubbleClock ? '시계' : ''].filter(Boolean).join(' · ') || '없음';
  const chips: { id: string; label: string; value: string; body: ReactNode }[] = [
    {
      id: 'mode', label: '모드', value: focus.state?.enabled ? `초집중 · ${MODE_NAME[s.buddyMode] || 'Buddy'}` : MODE_NAME[s.buddyMode] || 'Buddy',
      body: (
        <>
          <Segmented label="모드" value={s.buddyMode} onChange={v => { if (v in MODE_PRESETS) applyMode(v as 'chill' | 'buddy' | 'chaos'); }}
            options={[{ value: 'chill', label: 'Chill' }, { value: 'buddy', label: 'Buddy' }, { value: 'chaos', label: 'Chaos' }]} />
          <p className="ui-note"><strong>{MODE_COPY[s.buddyMode]?.[0]}</strong> {MODE_COPY[s.buddyMode]?.[1]}</p>
          {/* 초집중 모드: 한자리에서 조금만 움직이고 시계만 보여 준다. 알람은 평소처럼 울린다. 기본 꺼짐, 시계 초 표시도 기본 꺼짐. */}
          {focus.state && (
            <>
              <div className="st-row"><span>초집중 모드</span><Switch checked={focus.state.enabled} onChange={v => focus.set({ enabled: v })} label="초집중 모드" /></div>
              <p className="ui-note">한자리에서 조금만 움직이고 시계만 보여요. 알람은 그대로 울려요</p>
              <div className="st-row"><span>시계에 초 표시</span><Switch checked={focus.state.seconds} onChange={v => focus.set({ seconds: v })} label="시계에 초 표시" /></div>
            </>
          )}
        </>
      ),
    },
    {
      id: 'size', label: '크기', value: sizeShort(size) ? `${sizeShort(size)} · ${size}%` : `${size}%`,
      body: (
        <>
          <Segmented label="버디 크기" value={size} onChange={v => update({ size: v })}
            options={[{ value: 70, label: '소' }, { value: 100, label: '중' }, { value: 150, label: '대' }]} />
          <p className="ui-note">버디 크기 {size}%</p>
        </>
      ),
    },
    {
      id: 'zone', label: '활동 구역', value: zoneValue,
      body: (
        <>
          {monitors.length > 1 && (
            <>
              <p className="st-lab">모니터</p>
              <Segmented label="모니터 선택"
                value={activeMonitor ? activeMonitor.displayId : -1} onChange={v => update({ monitor: v })}
                options={[{ value: -1, label: '전체' }, ...monitors.map(m => ({ value: m.displayId, label: monitorName(m) }))]} />
              <p className="st-lab">구역 (선택한 모니터 기준)</p>
            </>
          )}
          <div className="st-zones">
            {[1, 2, 3, 4].map(z => (
              <button key={z} type="button" className="st-zone" aria-pressed={s.zone === z} onClick={() => update({ zone: z })}>
                <QuadIcon zone={z} /><span>{ZONE_NAMES[z]}</span>
              </button>
            ))}
          </div>
          <button type="button" className="st-zone st-zone--wide" aria-pressed={s.zone === 0} onClick={() => update({ zone: 0 })}>
            <span>전체 화면 (기본)</span>
          </button>
        </>
      ),
    },
    {
      id: 'display', label: '표시', value: !s.petVisible ? '숨김' : s.alwaysOnTop ? '보임 · 항상 위' : '보임',
      body: (
        <>
          <div className="st-row"><span>버디 표시</span><Switch checked={s.petVisible} onChange={v => patch({ petVisible: v })} label="버디 표시" /></div>
          <div className="st-row"><span>항상 위</span><Switch checked={s.alwaysOnTop} onChange={v => update({ alwaysOnTop: v })} label="항상 위" /></div>
          <button type="button" className="ui-btn" onClick={() => window.electronAPI?.callPet()}>버디 부르기</button>
        </>
      ),
    },
    {
      id: 'speed', label: '움직임 속도', value: `${speedWord(s.moveSpeed)} · ${s.moveSpeed}단계`,
      body: (
        <>
          <div className="ui-range-row">
            <span className="ui-end">느긋</span>
            <RangeInput min={1} max={10} step={1} value={s.moveSpeed} onChange={v => update({ moveSpeed: v })} label="움직임 속도" />
            <span className="ui-end">광속</span>
          </div>
          <p className="ui-note">지금은 <strong>{speedWord(s.moveSpeed)}</strong></p>
        </>
      ),
    },
    {
      id: 'yar', label: '야르 타임', value: s.yarEnabled ? `${yarLabel(s.yarInterval)}마다` : '꺼짐',
      body: (
        <>
          <div className="st-row"><span>야르 타임 사용</span><Switch checked={s.yarEnabled} onChange={v => update({ yarEnabled: v })} label="야르 타임 사용" /></div>
          <p className="ui-note">정해진 간격마다 이모지가 화면에 쏟아져요!</p>
          {s.yarEnabled && (
            <>
              <div className="ui-select">
                <select value={s.yarInterval} aria-label="야르 타임 간격" onChange={e => update({ yarInterval: Number(e.target.value) })}>
                  {YAR_INTERVALS.map(([v, t]) => <option key={v} value={v}>{t}마다</option>)}
                </select>
                <ChevronDown className="ui-i" strokeWidth={1.5} aria-hidden />
              </div>
              <button type="button" className="ui-btn" onClick={() => window.electronAPI?.yarNow()}>지금 야르 타임</button>
            </>
          )}
        </>
      ),
    },
    {
      id: 'distract', label: '졸림 방지', value: s.distractEmoji ? `${secs(s.distractInterval)}마다` : '꺼짐',
      body: (
        <>
          <div className="st-row"><span>졸림 방지 이모지 사용</span><Switch checked={s.distractEmoji} onChange={v => update({ distractEmoji: v })} label="졸림 방지 이모지 사용" /></div>
          {s.distractEmoji && (
            <>
              <div className="st-row"><span>주기</span><span className="ui-val">{secs(s.distractInterval)}마다</span></div>
              <RangeInput min={10} max={300} step={5} value={s.distractInterval} onChange={v => update({ distractInterval: v })} label="졸림 방지 이모지 주기" />
            </>
          )}
        </>
      ),
    },
    {
      id: 'bubble', label: '말풍선', value: bubbleValue,
      body: (
        <>
          <div className="st-row"><span>말풍선 사용</span><Switch checked={bubbleOn} onChange={v => patch({ bubbleEnabled: v })} label="말풍선 사용" /></div>
          <div className="st-row"><span>시계 표시</span><Switch checked={bubbleClock} onChange={v => patch({ bubbleClock: v })} label="시계 표시" disabled={!bubbleOn} /></div>
          <p className="ui-note">{!bubbleOn ? '켜면 내 메시지와 시계가 말풍선으로 떠요.' : bubbleClock ? '메시지가 없는 동안에는 현재 시간을 보여줘요.' : '메시지가 없는 동안에는 말풍선이 숨겨져요.'}</p>
          <button type="button" className="ui-btn" onClick={() => { setOpenKey(null); onOpenBubble(); }}>
            메시지 편집 ({bubbleCount}/{BUBBLE_MAX_MESSAGES})
          </button>
          <WeatherCityRow settings={s} patch={patch} />
          {/* 자주 쓰는 항목만 먼저 보이고, 표시 시간·간격은 "고급"을 눌러야 펼쳐진다. 높이는 부드럽게 바뀐다. */}
          {bubbleOn && (
            <div className="st-adv" data-open={bubbleAdv ? '' : undefined}>
              <button type="button" className="st-adv-toggle" aria-expanded={bubbleAdv} aria-controls="bubble-adv" onClick={() => setBubbleAdv(v => !v)}>
                <span>고급</span><ChevronDown className="ui-i" strokeWidth={1.5} aria-hidden />
              </button>
              <div className="st-adv-body" id="bubble-adv" {...(bubbleAdv ? {} : { inert: '' })}>
                <div className="st-adv-inner">
                  <div className="st-row"><span>표시 시간</span><span className="ui-val">{bubbleShow}초</span></div>
                  <RangeInput min={BUBBLE_SHOW_RANGE[0]} max={BUBBLE_SHOW_RANGE[1]} step={1} value={bubbleShow} onChange={v => patch({ bubbleShowSec: v })} label="말풍선 표시 시간" />
                  <div className="st-row"><span>간격</span><span className="ui-val">{formatInterval(bubbleGap)}마다</span></div>
                  <RangeInput min={BUBBLE_GAP_RANGE[0]} max={BUBBLE_GAP_RANGE[1]} step={5} value={bubbleGap} onChange={v => patch({ bubbleGapSec: v })} label="말풍선 간격" />
                </div>
              </div>
            </div>
          )}
          <p className="ui-note">{WEATHER_CREDIT}</p>
        </>
      ),
    },
    // 버디 모양(원형/사각형)은 사진 버디에만 적용되므로 홈 칩에서 뺐다. 사진 올리기(자르기 화면)와 사진 관리(AnimalModal)에서 고른다.
    // 사진 교체(켜기/끄기·주기)도 사진 버디에서만 쓰이므로 홈 칩에서 뺐다(사진 유무에 따라 칩 수가 달라져 마지막 칸이 혼자 남던 문제). 사진 관리(AnimalModal)에서 고른다. 저장 키(imageRotateEnabled·imageRotateInterval)는 그대로.
    // 그래서 홈 칩은 어떤 버디든 항상 8개(2열 4줄)다.
  ];

  const bobSeconds = (2.8 - s.moveSpeed * 0.22).toFixed(2);
  return (
    <section className="st-pane st-home">
      <article className="st-card st-buddy">
        <div className="st-info">
          <div>
            <h2 className="st-name">{custom ? '내 사진' : animal.name}</h2>
            <p className="st-summary">{MODE_NAME[s.buddyMode]} 모드 · {sizeWord} 크기</p>
          </div>
          <div className="st-chips">
            {chips.map((c, i) => (
              <Chip key={c.id} id={c.id} label={c.label} value={c.value} end={i % 2 === 1}
                open={openKey === c.id} onOpen={() => setOpenKey(c.id)} onClose={closePop(c.id)}>
                {c.body}
              </Chip>
            ))}
          </div>
        </div>
        <div className="st-side" data-dots={custom && images.length >= 2 ? '' : undefined}>
          <div className="st-stage" data-hidden={!s.petVisible}>
            <span className="st-stage-cap">실시간 미리보기</span>
            {!s.petVisible && <span className="st-stage-state">버디를 숨겨 둔 상태예요</span>}
            <div className="st-pet" style={{ '--s': size / 100 } as CSSProperties}>
              <div className="st-pet-bob" style={{ '--bob': `${bobSeconds}s` } as CSSProperties}>
                <CatEmoji emoji={animal.emoji} size={custom && images.length >= 2 ? 128 : 156} forceImage customImage={custom ? images[shown] : null} customShape={s.customShape} />
              </div>
            </div>
          </div>
          {custom && images.length >= 2 && (
            <div className="st-dots" role="group" aria-label="내 사진 보기">
              {images.map((_, i) => (
                <button key={i} type="button" className="st-dotbtn" aria-pressed={shown === i}
                  aria-label={`사진 ${i + 1}${i === 0 ? '(대표)' : ''} 보기`} onClick={() => setPinned(i)} />
              ))}
              <span className="st-dots-note">{rotateOn ? `${formatInterval(s.imageRotateInterval)}마다 번갈아` : '교체 꺼짐'}</span>
            </div>
          )}
          <div className="st-actions">
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => { setOpenKey(null); onOpenAnimal(); }}>동물 바꾸기</button>
            <button type="button" className="ui-btn" onClick={() => { setOpenKey(null); onUpload(); }}>사진 올리기</button>
          </div>
        </div>
      </article>

      {/* 홈에는 하루 시간만 둔다. 점심·퇴근 알림의 세부 설정은 알람 탭에 있다(시각 저장 값은 하나). */}
      <article className="st-card st-times">
        <div className="st-times-fields">
          <label className="st-field"><span className="st-field-label">근무 시작</span>
            <input type="time" className="ui-time" value={s.workStart} aria-label="근무 시작 시간"
              onChange={e => { if (e.target.value) update({ workStart: e.target.value }); }} />
          </label>
          <label className="st-field"><span className="st-field-label">점심 시간</span>
            <input type="time" className="ui-time" value={s.lunchTime} aria-label="점심 시간"
              onChange={e => { if (e.target.value) update({ lunchTime: e.target.value }); }} />
          </label>
          <label className="st-field"><span className="st-field-label">퇴근 시간</span>
            <input type="time" className="ui-time" value={s.leaveTime} aria-label="퇴근 시간"
              onChange={e => { if (e.target.value) update({ leaveTime: e.target.value }); }} />
          </label>
        </div>
        {/* 자동 실행: 칩 목록에서 빼서 이 카드의 남는 자리에 둔다. 켬/끔은 저장하지 않고 OS의 실제 상태를 읽고 쓴다. 쓸 수 없는 환경에서는 꺼 둔 채 이유를 보여 준다. */}
        {login.state && (
          <div className="st-times-login">
            <div className="st-row"><span>컴퓨터를 켜면 자동 실행</span>
              <Switch checked={login.state.enabled} disabled={!login.state.supported} onChange={login.set} label="컴퓨터를 켜면 자동 실행" /></div>
            {(!login.state.supported || login.state.note) && <p className="ui-note">{login.state.note}</p>}
          </div>
        )}
      </article>
    </section>
  );
}
