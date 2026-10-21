import { useId, useLayoutEffect, useRef } from 'react';
import '../styles/intro.css';
import noiseUrl from '../assets/intro-noise-128.png';

// 설정창 로딩 인트로: 하트가 내려앉고, 반짝임이 지나가고, 두근하고, 설정창으로 전환된다. 앱 아이콘·로고는 플랫이고 이 하트만 그라데이션·노이즈를 쓴다.
// 설정창 내용은 이 화면 뒤에서 이미 그려져 있으므로 인트로 때문에 설정창이 늦게 뜨지 않는다.
const HEART_PATH =
  'M50 90 C47 90 44 88 41 86 C22 72 6 56 6 34 C6 18 18 8 31 8 C40 8 47 13 50 20 C53 13 60 8 69 8 C82 8 94 18 94 34 C94 56 78 72 59 86 C56 88 53 90 50 90 Z';
// 위쪽 검정 → 아래쪽으로 갈수록 은은한 흰색
const GRAD = { A: ['#0b0b0c', '#131314', '#3c3c41', '#9a9aa3'], B: ['#0e0e10', '#18181b', '#48484e', '#cdcdd4'] } as const;
const OUT = 'cubic-bezier(0.23,1,0.32,1)';          // 앱 --ui-ease-out
const IO = 'cubic-bezier(0.77,0,0.175,1)';
// 위치 3t²−2t³ ⇔ 속도 6t(1−t): 속도가 포물선(느림 → 빠름 → 느림). cubic-bezier(1/3, 0, 2/3, 1)이 정확히 이 곡선이다.
const SMOOTH = 'cubic-bezier(0.3333,0,0.6667,1)';
const SHINE_ANGLE = 35;                              // 빛줄기 기울기(도)

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
export const INTRO_TOTAL_MS = 2960;

export default function Intro({ onDone }: { onDone: () => void }) {
  const gid = useId().replace(/:/g, '');
  const variant: 'A' | 'B' = document.documentElement.dataset.theme === 'dark' ? 'B' : 'A';   // 라이트 → A, 다크 → B (기본은 라이트)
  const [c0, c1, c2, c3] = GRAD[variant];
  const coverRef = useRef<HTMLDivElement>(null);
  const heartRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // 화면이 그려지기 전에 애니메이션을 만들어 첫 프레임에 하트가 최종 위치에 보이는 깜빡임을 막는다
  useLayoutEffect(() => {
    const cover = coverRef.current, heart = heartRef.current, shadow = shadowRef.current, eyes = eyesRef.current, band = bandRef.current;
    if (!cover || !heart || !shadow || !eyes || !band) { doneRef.current(); return; }
    // 하트 크기(CSS의 clamp(150px, 24vmin, 230px))에 비례해 이동량을 맞춘다. offsetWidth를 읽으면 첫 레이아웃이 페인트 전에 강제로 앞당겨지므로 계산으로 구한다.
    const u = Math.min(230, Math.max(150, 0.24 * Math.min(window.innerWidth, window.innerHeight))) / 160;
    const anims: Animation[] = [];
    const A = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => { const a = el.animate(kf, { fill: 'none', ...o }); anims.push(a); return a; };
    const body = (T: typeof LAND | typeof BEAT, first: string): Keyframe[] => T.body.map(([sc, offset, rot], i) => ({ transform: `scale(${sc}) rotate(${rot}deg)`, offset, easing: T === BEAT && i === 0 ? OUT : (T === BEAT && i === 1 ? IO : first) }));
    const eyeFollow = (T: typeof LAND | typeof BEAT): Keyframe[] => T.eyes.map(([y, offset]) => ({ translate: `0 ${y * u}px`, offset, easing: OUT }));
    const shadowFollow = (T: typeof LAND | typeof BEAT): Keyframe[] => T.shadow.map(([sc, offset]) => ({ transform: `scale(${sc})`, offset, easing: OUT }));
    const blink = (at: number) => A(eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.1)', offset: 0.5 }, { transform: 'scaleY(1)' }], { duration: 160, delay: at, easing: IO });

    A(heart, [{ transform: `translateY(${-46 * u}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 360, easing: OUT, fill: 'backwards' });
    A(shadow, [{ transform: 'scale(.42)', opacity: 0.22, filter: 'blur(11px)' }, { transform: 'scale(1)', opacity: 1, filter: 'blur(5px)' }], { duration: 360, easing: OUT, fill: 'backwards' });
    A(heart, body(LAND, OUT), { duration: LAND.dur, delay: 360 }); A(eyes, eyeFollow(LAND), { duration: LAND.dur, delay: 360 }); A(shadow, shadowFollow(LAND), { duration: LAND.dur, delay: 360 });
    blink(640);
    // 35° 빛줄기: 넓고 은은하게, 속도 포물선. 하트 모양 안에서만 보인다.
    const d = 190 * u;
    A(band, [{ transform: `translateX(${-d}px) rotate(${SHINE_ANGLE}deg)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { transform: `translateX(${d}px) rotate(${SHINE_ANGLE}deg)`, opacity: 0 }], { duration: 900, delay: 900, easing: SMOOTH });
    blink(1560); blink(2420);                         // 눈은 그 자리에서 계속 깜빡인다
    A(heart, body(BEAT, OUT), { duration: BEAT.dur, delay: 1900 }); A(eyes, eyeFollow(BEAT), { duration: BEAT.dur, delay: 1900 }); A(shadow, shadowFollow(BEAT), { duration: BEAT.dur, delay: 1900 });
    A(heart, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.62)', opacity: 0 }], { duration: 180, delay: 2780, easing: IO, fill: 'forwards' });
    A(shadow, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, delay: 2780, easing: 'linear', fill: 'forwards' });
    const exit = A(cover, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, delay: 2780, easing: IO, fill: 'forwards' });

    let finished = false;
    const finish = () => { if (!finished) { finished = true; doneRef.current(); } };
    exit.finished.then(finish).catch(() => {});
    // 클릭·키 입력: 즉시 건너뛰고 120ms 안에 설정창으로 전환한다
    const skip = () => {
      if (finished) return;
      anims.forEach(a => a.cancel());
      cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' }).finished.then(finish).catch(finish);
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); anims.forEach(a => a.cancel()); };
  }, []);

  return (
    <div className="intro" data-v={variant} ref={coverRef} aria-hidden="true" style={{ '--intro-noise': `url(${noiseUrl})` } as React.CSSProperties}>
      <div className="intro-bg-noise" />
      <div className="intro-stage">
        <div className="intro-shadow" ref={shadowRef} />
        <div className="intro-heart" ref={heartRef}>
          <svg viewBox="0 0 100 100" focusable="false">
            <defs>
              <linearGradient id={`${gid}g`} x1="0" y1="8" x2="0" y2="90" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={c0} /><stop offset=".5" stopColor={c1} /><stop offset=".78" stopColor={c2} /><stop offset="1" stopColor={c3} />
              </linearGradient>
              <linearGradient id={`${gid}r`} x1="0" y1="8" x2="0" y2="90" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset=".55" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <clipPath id={`${gid}c`} clipPathUnits="objectBoundingBox"><path transform="scale(0.01)" d={HEART_PATH} /></clipPath>
            </defs>
            <path d={HEART_PATH} fill={`url(#${gid}g)`} />
            {variant === 'B' && <path d={HEART_PATH} fill="none" stroke={`url(#${gid}r)`} strokeWidth=".8" />}
          </svg>
          {/* 노이즈와 빛줄기는 하트 모양 안쪽으로만 클리핑한다. 눈과 바닥 빛에는 얹지 않는다. */}
          <div className="intro-heart-noise" style={{ clipPath: `url(#${gid}c)` }} />
          <div className="intro-shine" style={{ clipPath: `url(#${gid}c)` }}><i className="intro-shine-band" ref={bandRef as React.RefObject<HTMLElement>} /></div>
          {/* 눈은 SVG 필터(drop-shadow) 대신 HTML 요소 + box-shadow로 발광시킨다: 첫 프레임이 덜 끊긴다 */}
          <div className="intro-eyes" ref={eyesRef}><i className="intro-eye intro-eye-l" /><i className="intro-eye intro-eye-r" /></div>
        </div>
      </div>
    </div>
  );
}
