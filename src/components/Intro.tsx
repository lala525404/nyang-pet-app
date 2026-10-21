import { useId, useLayoutEffect, useRef } from 'react';
import '../styles/intro.css';
import noiseUrl from '../assets/intro-noise-128.png';

// 설정창 로딩 인트로: 하트가 내려앉고, 반짝임이 지나가고, 두근하고, 설정창으로 전환된다. 앱 아이콘·로고·설정창은 플랫이고,
// 이 하트만 입체감(안쪽 방사 그라데이션·반사광·림라이트·노이즈)과 글로우를 쓴다. 입체감은 SVG 그라데이션/필터와 CSS만으로 낸다(WebGL 없음).
// 설정창 내용은 이 화면 뒤에서 이미 그려져 있으므로 인트로 때문에 설정창이 늦게 뜨지 않는다.
// entrance가 있으면 입구 모드: 연출이 끝나도 사라지지 않고 두 버튼("처음 왔어요" / "오늘도 함께해요") 중 하나를 누를 때까지 기다린다.
const HEART_PATH =
  'M50 90 C47 90 44 88 41 86 C22 72 6 56 6 34 C6 18 18 8 31 8 C40 8 47 13 50 20 C53 13 60 8 69 8 C82 8 94 18 94 34 C94 56 78 72 59 86 C56 88 53 90 50 90 Z';
// 위쪽 검정 → 아래쪽으로 갈수록 은은한 흰색
const GRAD = { A: ['#0b0b0c', '#131314', '#3c3c41', '#9a9aa3'], B: ['#0e0e10', '#18181b', '#48484e', '#cdcdd4'] } as const;
// 입체감 세기(테마별): 라이트는 반사광을 또렷하게·림라이트는 약하게, 다크는 림라이트를 더 강하게
const DEPTH = { A: { puff: 1, spec: 1, rim: 0.75 }, B: { puff: 0.9, spec: 0.95, rim: 1 } } as const;
const OUT = 'cubic-bezier(0.23,1,0.32,1)';          // 앱 --ui-ease-out
const IO = 'cubic-bezier(0.77,0,0.175,1)';
// 위치 3t²−2t³ ⇔ 속도 6t(1−t): 속도가 포물선(느림 → 빠름 → 느림). cubic-bezier(1/3, 0, 2/3, 1)이 정확히 이 곡선이다.
const SMOOTH = 'cubic-bezier(0.3333,0,0.6667,1)';
const SHINE_ANGLE = 35;                              // 빛줄기 기울기(도)

// 눈 추적·기울임(같은 입력, requestAnimationFrame 하나): 하트 폭 160px 기준 값이고 실제 크기에 비례해 키운다
const EYE_MAX = 12;          // 눈이 움직이는 최대 거리(px)
const EYE_TAU_MS = 0;        // 눈 지연(0이면 바로 따라감)
const TILT_MAX = 6;          // 하트가 기우는 최대 각도(도)
const SPEC_SHIFT = [4, 3];   // 반사광이 반대쪽으로 움직이는 거리(경로 단위, x·y)
const LOOK_START_MS = 1100;  // 착지 뒤부터 눈이 마우스를 따라간다
const LOOK_IDLE_MS = 3000;   // 마우스가 이만큼 멈추면 가운데로 돌아온다

// 입구 버튼 호버 연출(인트로 화면 안에서만 쓰는 예외: 글로우·반짝임·스파클). 4점 별 모양의 단색 플랫 조각을 풀에서 꺼내 쓰고, 동시 상한은 풀 크기뿐이다.
const SPARK = { pool: 64, count: { new: 12, old: 10 } as Record<EntranceKind, number>, click: 10, dist: 120, durMs: 1100, sizeMin: 4, sizeMax: 10, minGapMs: 400 };

// 잔여동작: 착지·두근 뒤에 감쇠하는 탄성 진동. 몸은 크기·기울기, 눈은 몸보다 늦게 따라오고, 그림자는 몸을 따라간다. [값, 오프셋, 기울기]
const LAND = {
  dur: 640,
  body: [['1,1', 0, 0], ['1.07,.9', .19, 0], ['.985,1.03', .4, -.8], ['1.012,.99', .58, .6], ['.996,1.006', .76, -.3], ['1,1', 1, 0]] as const,
  eyes: [[0, 0], [2.6, .19], [-1.6, .4], [.9, .58], [-.3, .76], [0, 1]] as const,
  shadow: [['1,1', 0], ['1.1,1.04', .19], ['.98,.99', .4], ['1.02,1.005', .58], ['.997,1', .76], ['1,1', 1]] as const,
};
const BEAT = {
  dur: 800,
  body: [['1,1', 0, 0], ['1.12,1.12', .1625, 1.2], ['.985,.985', .4, -.8], ['1.008,1.008', .6, .4], ['.997,.997', .8, -.15], ['1,1', 1, 0]] as const,
  eyes: [[0, 0], [-2.2, .1625], [1.5, .4], [-.6, .6], [.2, .8], [0, 1]] as const,
  shadow: [['1,1', 0], ['1.07,1.07', .1625], ['.98,.98', .4], ['1.012,1.012', .6], ['.997,.997', .8], ['1,1', 1]] as const,
};
// 구간(ms): 등장 0–400 · 착지+잔여 400–1100 · 눈 깜빡 760/1900/3050 · 빛줄기① 1000–2000 · 빛줄기② 2300–3300(세기 55%) · 두근+잔여 3400–4200 · 전환 4500–4680
// 입구 모드에서는 4200 이후 전환 대신 버튼을 기다린다. 버튼은 1500ms부터 나타난다.
const T = { drop: 400, land: 400, shine1: 1000, shine2: 2300, shineDur: 1000, beat: 3400, exit: 4500, exitDur: 180, entry: 1500 };
export const INTRO_TOTAL_MS = T.exit + T.exitDur + 20;

export type EntranceKind = 'new' | 'old';

export default function Intro({ onDone, entrance, onChoose }: { onDone: () => void; entrance?: EntranceKind; onChoose?: (kind: EntranceKind) => void }) {
  const gid = useId().replace(/:/g, '');
  const variant: 'A' | 'B' = document.documentElement.dataset.theme === 'dark' ? 'B' : 'A';   // 라이트 → A, 다크 → B (기본은 라이트)
  const [c0, c1, c2, c3] = GRAD[variant];
  const depth = DEPTH[variant];
  const coverRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const heartRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const specRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLElement>(null);
  const entryRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<EntranceKind, HTMLButtonElement | null>>({ new: null, old: null });
  const sparkEls = useRef<(HTMLElement | null)[]>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const chooseRef = useRef(onChoose);
  chooseRef.current = onChoose;

  // 화면이 그려지기 전에 애니메이션을 만들어 첫 프레임에 하트가 최종 위치에 보이는 깜빡임을 막는다
  useLayoutEffect(() => {
    const cover = coverRef.current, stage = stageRef.current, heart = heartRef.current, shadow = shadowRef.current, eyes = eyesRef.current, band = bandRef.current;
    const look = lookRef.current, tilt = tiltRef.current, spec = specRef.current, entryEl = entryRef.current;
    if (!cover || !stage || !heart || !shadow || !eyes || !band || !look || !tilt || !spec) { doneRef.current(); return; }
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 하트 크기(CSS의 clamp(150px, 24vmin, 230px))에 비례해 이동량을 맞춘다. offsetWidth를 읽으면 첫 레이아웃이 페인트 전에 강제로 앞당겨지므로 계산으로 구한다.
    const hsOf = () => Math.min(230, Math.max(150, 0.24 * Math.min(window.innerWidth, window.innerHeight)));
    const u = hsOf() / 160;
    const anims: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const A = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => { const a = el.animate(kf, { fill: 'none', ...o }); anims.push(a); return a; };
    const body = (Tb: typeof LAND | typeof BEAT, first: string): Keyframe[] => Tb.body.map(([sc, offset, rot], i) => ({ transform: `scale(${sc}) rotate(${rot}deg)`, offset, easing: Tb === BEAT && i === 0 ? OUT : (Tb === BEAT && i === 1 ? IO : first) }));
    const eyeFollow = (Tb: typeof LAND | typeof BEAT): Keyframe[] => Tb.eyes.map(([y, offset]) => ({ translate: `0 ${y * u}px`, offset, easing: OUT }));
    const shadowFollow = (Tb: typeof LAND | typeof BEAT): Keyframe[] => Tb.shadow.map(([sc, offset]) => ({ transform: `scale(${sc})`, offset, easing: OUT }));
    const blink = (at: number) => A(eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.1)', offset: 0.5 }, { transform: 'scaleY(1)' }], { duration: 160, delay: at, easing: IO });
    const startedAt = performance.now();
    let finished = false, chosen = false;
    const finish = () => { if (!finished) { finished = true; doneRef.current(); } };

    // ── 연출 ──
    if (!rm) {
      A(heart, [{ transform: `translateY(${-46 * u}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: T.drop, easing: OUT, fill: 'backwards' });
      A(shadow, [{ transform: 'scale(.42)', opacity: 0.22, filter: 'blur(11px)' }, { transform: 'scale(1)', opacity: 1, filter: 'blur(5px)' }], { duration: T.drop, easing: OUT, fill: 'backwards' });
      A(heart, body(LAND, OUT), { duration: LAND.dur, delay: T.land }); A(eyes, eyeFollow(LAND), { duration: LAND.dur, delay: T.land }); A(shadow, shadowFollow(LAND), { duration: LAND.dur, delay: T.land });
      blink(760);
      // 35° 빛줄기: 넓고 은은하게, 속도 포물선. 하트 모양 안에서만 보인다. 두 번째는 첫 번째보다 살짝 약하게.
      const d = 190 * u;
      const shine = (at: number, peak: number) => A(band, [{ transform: `translateX(${-d}px) rotate(${SHINE_ANGLE}deg)`, opacity: 0 }, { opacity: peak, offset: 0.15 }, { opacity: peak, offset: 0.85 }, { transform: `translateX(${d}px) rotate(${SHINE_ANGLE}deg)`, opacity: 0 }], { duration: T.shineDur, delay: at, easing: SMOOTH });
      shine(T.shine1, 1); shine(T.shine2, 0.55);
      blink(1900); blink(3050);                         // 눈은 그 자리에서 계속 깜빡인다
      A(heart, body(BEAT, OUT), { duration: BEAT.dur, delay: T.beat }); A(eyes, eyeFollow(BEAT), { duration: BEAT.dur, delay: T.beat }); A(shadow, shadowFollow(BEAT), { duration: BEAT.dur, delay: T.beat });
    }
    if (!entrance) {
      A(heart, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.62)', opacity: 0 }], { duration: T.exitDur, delay: T.exit, easing: IO, fill: 'forwards' });
      A(shadow, [{ opacity: 1 }, { opacity: 0 }], { duration: T.exitDur, delay: T.exit, easing: 'linear', fill: 'forwards' });
      const exit = A(cover, [{ opacity: 1 }, { opacity: 0 }], { duration: T.exitDur, delay: T.exit, easing: IO, fill: 'forwards' });
      exit.finished.then(finish).catch(() => {});
    } else {
      // 입구: 버튼은 1.5초 뒤부터 나타나고(움직임 줄이기면 바로), 하트는 그 자리에서 가끔 깜빡이며 기다린다
      if (entryEl) {
        entryEl.dataset.on = '';
        const a = entryEl.animate([{ opacity: 0, transform: 'translateX(-50%) translateY(12px)' }, { opacity: 1, transform: 'translateX(-50%)' }], { duration: rm ? 150 : 320, delay: rm ? 0 : T.entry, easing: OUT, fill: 'both' });
        anims.push(a);
      }
      if (!rm) {
        const idle = () => { if (chosen) return; blink(0); timers.push(setTimeout(idle, 3200 + Math.random() * 1600)); };
        timers.push(setTimeout(idle, 4700 + 2400));
      }
    }

    // ── 스파클·빛 쓸기·두근(입구 버튼 호버/포커스/터치/클릭). 움직임 줄이기에서는 쓰지 않는다 ──
    const pool = Array.from({ length: SPARK.pool }, () => ({ live: false, t0: 0, dur: 0, x: 0, y: 0, dx: 0, dy: 0, rot: 0 }));
    const burst = (n: number, from: HTMLElement) => {
      if (rm) return;
      const now = performance.now();
      const cr = cover.getBoundingClientRect(), br = from.getBoundingClientRect();
      const hx = geo.cx - cr.left, hy = geo.cy - cr.top + geo.hs * 0.02;
      for (let i = 0; i < n; i++) {
        const idx = pool.findIndex(p => !p.live);
        const el = idx < 0 ? null : sparkEls.current[idx];
        if (idx < 0 || !el) break;
        const p = pool[idx];
        let ox: number, oy: number;
        if (i % 2 === 0) { const a = Math.random() * Math.PI * 2; ox = hx + Math.cos(a) * geo.hs * 0.46; oy = hy + Math.sin(a) * geo.hs * 0.42; }   // 절반은 하트 둘레
        else { ox = br.left - cr.left + Math.random() * br.width; oy = br.top - cr.top + br.height * 0.2; }                                         // 절반은 버튼 쪽
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, far = SPARK.dist * (0.55 + Math.random() * 0.6);
        const sz = SPARK.sizeMin + Math.random() * (SPARK.sizeMax - SPARK.sizeMin);
        Object.assign(p, { live: true, t0: now + Math.random() * 160, dur: SPARK.durMs * (0.8 + Math.random() * 0.35), x: ox, y: oy, dx: Math.cos(ang) * far, dy: Math.sin(ang) * far, rot: (Math.random() - 0.5) * 140 });
        el.style.width = el.style.height = sz + 'px';
        el.style.margin = `${-sz / 2}px 0 0 ${-sz / 2}px`;
        el.style.left = ox + 'px'; el.style.top = oy + 'px';
      }
    };
    const sparkFrame = (now: number) => {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i]; if (!p.live) continue;
        const el = sparkEls.current[i]; if (!el) continue;
        const t = (now - p.t0) / p.dur;
        if (t < 0) { el.style.opacity = '0'; continue; }
        if (t >= 1) { p.live = false; el.style.opacity = '0'; continue; }
        const e = 1 - Math.pow(1 - t, 3);
        el.style.transform = `translate3d(${(p.dx * e).toFixed(1)}px,${(p.dy * e).toFixed(1)}px,0) rotate(${(p.rot * e).toFixed(1)}deg) scale(${(1 - 0.55 * t).toFixed(3)})`;
        el.style.opacity = String((t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.9);
      }
    };
    const lastFx = new Map<HTMLElement, number>();
    const fx = (kind: EntranceKind) => {
      const b = btnRefs.current[kind];
      if (!b || chosen || rm) return;
      const now = performance.now();
      if (now - (lastFx.get(b) ?? -1e9) < SPARK.minGapMs) return;   // 0.4초 안에 다시 들어오면 무시
      lastFx.set(b, now);
      const dd = 120 * u;
      band.animate([{ transform: `translateX(${-dd}px) rotate(${SHINE_ANGLE}deg)`, opacity: 0 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0.85, offset: 0.8 }, { transform: `translateX(${dd}px) rotate(${SHINE_ANGLE}deg)`, opacity: 0 }], { duration: 500, easing: SMOOTH });
      heart.animate([{ scale: '1' }, { scale: '1.06', offset: 0.4 }, { scale: '1' }], { duration: 360, easing: OUT });   // scale 속성이라 다른 transform 애니메이션과 겹치지 않는다
      burst(SPARK.count[kind], b);
    };

    // ── 눈 추적 + 하트 기울임(requestAnimationFrame 하나, transform만) ──
    const st = { x: 0, y: 0, t: 0, has: false, inside: true, hover: null as HTMLElement | null, focus: null as HTMLElement | null };
    let lookX = 0, lookY = 0, tiltX = 0, tiltY = 0, amp = 0, last = performance.now(), raf = 0;
    let geo = { cx: 0, cy: 0, hs: hsOf() };
    const measure = () => { const r = stage.getBoundingClientRect(); const hs = hsOf(); geo = { cx: r.left, cy: r.top - hs * 0.7 + hs * 0.43, hs }; };
    measure();
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'touch') return; st.x = e.clientX; st.y = e.clientY; st.t = performance.now(); st.has = true; st.inside = true; };
    const onLeave = () => { st.inside = false; };
    const onKeyLook = () => { st.has = false; };   // 키보드만 쓰면 가운데
    const onFocusIn = (e: FocusEvent) => { const b = e.target as HTMLElement; st.focus = btnRefs.current.new === b || btnRefs.current.old === b ? b : null; };
    const onFocusOut = () => { st.focus = null; };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, now - last); last = now;
      let tx = 0, ty = 0;
      const el = st.hover || st.focus;
      if (!chosen) {
        let px = 0, py = 0, ok = false;
        if (el) { const r = el.getBoundingClientRect(); px = r.left + r.width / 2; py = r.top + r.height / 2; ok = true; }
        else if (st.has && st.inside && now - st.t < LOOK_IDLE_MS) { px = st.x; py = st.y; ok = true; }
        if (ok) {
          const dx = px - geo.cx, dy = py - geo.cy, dist = Math.hypot(dx, dy) || 1;
          const k = 1 - Math.exp(-dist / (geo.hs * 0.55));   // 가까우면 민감하게 커지고, 멀면 최대치에 고정
          const max = EYE_MAX * (geo.hs / 160);
          tx = dx / dist * k * max; ty = dy / dist * k * max * 0.62;   // 얼굴이 가로로 넓어서 세로는 덜 움직인다
        }
      }
      const reach = !chosen && now - startedAt > LOOK_START_MS;
      amp += ((reach ? 1 : 0) - amp) * (1 - Math.exp(-dt / 160));
      const kk = EYE_TAU_MS <= 0 ? 1 : 1 - Math.exp(-dt / EYE_TAU_MS);
      lookX += (tx * amp - lookX) * kk; lookY += (ty * amp - lookY) * kk;
      look.style.transform = `translate3d(${lookX.toFixed(2)}px,${lookY.toFixed(2)}px,0)`;
      // 같은 입력으로 하트가 살짝 기울고 반사광이 반대쪽으로 움직인다
      const mp = Math.max(0.001, EYE_MAX * (geo.hs / 160));
      const nx = Math.max(-1, Math.min(1, lookX / mp)), ny = Math.max(-1, Math.min(1, lookY / (mp * 0.62)));
      const kt = 1 - Math.exp(-dt / 90);
      tiltX += (nx - tiltX) * kt; tiltY += (ny - tiltY) * kt;
      tilt.style.transform = `perspective(520px) rotateX(${(-tiltY * TILT_MAX).toFixed(2)}deg) rotateY(${(tiltX * TILT_MAX).toFixed(2)}deg)`;
      spec.setAttribute('transform', `translate(${(-tiltX * SPEC_SHIFT[0]).toFixed(2)} ${(-tiltY * SPEC_SHIFT[1]).toFixed(2)})`);
      sparkFrame(now);
    };
    // 움직임 줄이기면 눈·기울임·연출을 모두 끈다(입구 모드는 버튼 화면만 보인다)
    if (!rm) {
      raf = requestAnimationFrame(frame);
      window.addEventListener('pointermove', onMove);
      document.addEventListener('mouseleave', onLeave);
      window.addEventListener('keydown', onKeyLook);
      window.addEventListener('resize', measure);
    }
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    const hoverOff: (() => void)[] = [];
    if (entrance) for (const k of ['new', 'old'] as const) {
      const b = btnRefs.current[k]; if (!b) continue;
      const enter = (e: PointerEvent) => { if (e.pointerType !== 'touch') { st.hover = b; fx(k); } };
      const leave = () => { if (st.hover === b) st.hover = null; };
      const focus = () => { if (b.matches(':focus-visible')) fx(k); };           // 키보드 포커스도 같은 연출
      const down = (e: PointerEvent) => { if (e.pointerType === 'touch') fx(k); }; // 터치는 누르는 순간 한 번
      b.addEventListener('pointerenter', enter); b.addEventListener('pointerleave', leave); b.addEventListener('focus', focus); b.addEventListener('pointerdown', down);
      hoverOff.push(() => { b.removeEventListener('pointerenter', enter); b.removeEventListener('pointerleave', leave); b.removeEventListener('focus', focus); b.removeEventListener('pointerdown', down); });
    }

    // ── 선택 / 건너뛰기 ──
    const choose = (kind: EntranceKind) => {
      if (chosen || finished) return;
      chosen = true; st.hover = null; st.focus = null;
      anims.forEach(a => a.cancel());   // 남은 연출은 건너뛴다
      const b = btnRefs.current[kind];
      if (!rm && b) {                    // 한 번 더 10개가 터지고 두근한 뒤 전환
        heart.animate([{ scale: '1' }, { scale: '1.06', offset: 0.4 }, { scale: '1' }], { duration: 360, easing: OUT });
        burst(SPARK.click, b);
      }
      const go = () => { finish(); chooseRef.current?.(kind); };
      timers.push(setTimeout(() => {
        const fade = cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: rm ? 150 : 300, easing: IO, fill: 'forwards' });
        fade.finished.then(go).catch(go);
      }, rm ? 0 : 420));
    };
    // 클릭·키 입력(리플레이): 즉시 건너뛰고 120ms 안에 설정창으로 전환한다
    const skip = () => {
      if (finished || chosen) return;
      chosen = true;
      anims.forEach(a => a.cancel());
      cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' }).finished.then(finish).catch(finish);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!entrance) { skip(); return; }
      if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); choose(entrance); }
    };
    window.addEventListener('keydown', onKey);
    if (!entrance) window.addEventListener('pointerdown', skip);
    const offClicks = entrance ? (['new', 'old'] as const).map(k => {
      const b = btnRefs.current[k]; const h = () => choose(k); b?.addEventListener('click', h); return () => b?.removeEventListener('click', h);
    }) : [];
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('keydown', onKeyLook);
      window.removeEventListener('resize', measure);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', skip);
      hoverOff.forEach(f => f());
      offClicks.forEach(f => f());
      anims.forEach(a => a.cancel());
    };
  }, []);

  return (
    <div className={`intro${entrance ? ' intro--entrance' : ''}`} data-v={variant} ref={coverRef}
      {...(entrance ? { role: 'dialog', 'aria-label': '시작하기' } : { 'aria-hidden': true })}
      style={{ '--intro-noise': `url(${noiseUrl})` } as React.CSSProperties}>
      <div className="intro-bg-noise" />
      <div className="intro-stage" ref={stageRef}>
        <div className="intro-shadow" ref={shadowRef} />
        <div className="intro-heart" ref={heartRef}>
          <div className="intro-tilt" ref={tiltRef}>
            <svg viewBox="0 0 100 100" focusable="false">
              <defs>
                <linearGradient id={`${gid}g`} x1="0" y1="8" x2="0" y2="90" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor={c0} /><stop offset=".5" stopColor={c1} /><stop offset=".78" stopColor={c2} /><stop offset="1" stopColor={c3} />
                </linearGradient>
                <radialGradient id={`${gid}p`} cx="50%" cy="36%" r="68%">
                  <stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".5" stopColor="#fff" stopOpacity=".02" /><stop offset="1" stopColor="#000" stopOpacity=".5" />
                </radialGradient>
                <linearGradient id={`${gid}r`} x1="0" y1="8" x2="0" y2="90" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".04" /><stop offset=".8" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity=".95" />
                </linearGradient>
                <filter id={`${gid}b`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" /></filter>
                <clipPath id={`${gid}u`}><path d={HEART_PATH} /></clipPath>
                <clipPath id={`${gid}c`} clipPathUnits="objectBoundingBox"><path transform="scale(0.01)" d={HEART_PATH} /></clipPath>
              </defs>
              <path d={HEART_PATH} fill={`url(#${gid}g)`} />
              <g clipPath={`url(#${gid}u)`}>
                {/* 부푼 느낌: 중심은 약간 밝고 가장자리는 어둡게 */}
                <path d={HEART_PATH} fill={`url(#${gid}p)`} style={{ opacity: depth.puff }} />
                {/* 반사광: 왼쪽 위 로브의 부드러운 얼룩 + 작은 점 하나 */}
                <g ref={specRef} style={{ opacity: depth.spec }}>
                  <ellipse cx="30" cy="25" rx="12" ry="6.5" transform="rotate(-28 30 25)" fill="#fff" opacity=".3" filter={`url(#${gid}b)`} />
                  <circle cx="23" cy="20" r="1.7" fill="#fff" opacity=".65" />
                </g>
                {/* 림라이트: 아래쪽 가장자리에만 얇은 흰 빛 */}
                <path d={HEART_PATH} fill="none" stroke={`url(#${gid}r)`} strokeWidth="2.4" style={{ opacity: depth.rim }} />
              </g>
            </svg>
            {/* 노이즈와 빛줄기는 하트 모양 안쪽으로만 클리핑한다. 눈과 바닥 빛에는 얹지 않는다. */}
            <div className="intro-heart-noise" style={{ clipPath: `url(#${gid}c)` }} />
            <div className="intro-shine" style={{ clipPath: `url(#${gid}c)` }}><i className="intro-shine-band" ref={bandRef as React.RefObject<HTMLElement>} /></div>
            {/* 눈 추적(rAF)은 look, 깜빡임·잔여동작(WAAPI)은 eyes가 맡아 서로 겹치지 않는다 */}
            <div className="intro-look" ref={lookRef}><div className="intro-eyes" ref={eyesRef}><i className="intro-eye intro-eye-l" /><i className="intro-eye intro-eye-r" /></div></div>
          </div>
        </div>
      </div>
      {entrance && <div className="intro-sparks" aria-hidden="true">{Array.from({ length: SPARK.pool }, (_, i) => <i key={i} className="intro-spark" ref={el => { sparkEls.current[i] = el; }} />)}</div>}
      {entrance && (
        <div className="intro-entry" ref={entryRef} role="group" aria-label="시작하기">
          <button type="button" className="intro-ebtn" data-main={entrance === 'new' ? '' : undefined} ref={el => { btnRefs.current.new = el; }}>처음 왔어요</button>
          <button type="button" className="intro-ebtn" data-main={entrance === 'old' ? '' : undefined} ref={el => { btnRefs.current.old = el; }}>오늘도 함께해요</button>
        </div>
      )}
    </div>
  );
}
