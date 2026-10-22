import { useCallback, useEffect, useRef, useState } from 'react';
import CatEmoji from './CatEmoji';
import { Switch } from './ui';
import { ANIMALS, getAnimal } from '../data/animals';
import { formatTime } from '../utils/settings';
import type { PetSettings } from '../utils/settings';
import '../styles/onboarding.css';

// 처음 안내(3단계 튜토리얼, 1분 안에): 버디 고르기 / 알림 / 마무리. 설정창 안에서만 진행되고 버디는 평소처럼 이미 실행 중이다.
// 값은 바꾸는 즉시 저장된다. 값을 안 물어본 항목(크기, 속도, 활동 구역, 말풍선, 야르, 졸림 방지)은 기본값 그대로 둔다.
const STEPS = 3;
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
type Props = {
  settings: PetSettings;
  onChange: (p: Partial<PetSettings>) => void;      // 바꾸는 즉시 저장하고 버디 창에 전달
  onUpload: () => void;                              // 기존 사진 올리기 → 자르기 창
  onClose: (kind: 'done' | 'cancel') => void;       // done: 버디 풀어놓기(설정창 닫기), cancel: 중간에 나가기
};

export default function Onboarding({ settings: s, onChange, onUpload, onClose }: Props) {
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const isMac = window.electronAPI?.platform === 'darwin';

  const go = useCallback((d: number) => {
    if (d > 0 && step === STEPS - 1) { onClose('done'); return; }
    setStep(v => Math.max(0, Math.min(STEPS - 1, v + d)));
  }, [step, onClose]);

  // 키보드: Enter 다음, Esc·← 이전, → 다음. Tab은 안내 안에서만 돈다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT');
      if (e.key === 'Escape') { e.preventDefault(); go(-1); return; }
      if (e.key === 'ArrowRight' && !typing) { e.preventDefault(); go(1); return; }
      if (e.key === 'ArrowLeft' && !typing) { e.preventDefault(); go(-1); return; }
      if (e.key === 'Enter' && !(el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT'))) { e.preventDefault(); go(1); return; }
      if (e.key === 'Tab' && rootRef.current) {
        const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1], active = document.activeElement;
        if (e.shiftKey && (active === first || active === rootRef.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  useEffect(() => { rootRef.current?.focus(); }, [step]);

  const testAlert = () => { window.electronAPI?.testBreakTime('lunch'); };   // 정한 시각·켜짐과 상관없이 실제 알림 카드를 한 번 재생한다
  const photos = s.customImages.filter(Boolean) as string[];
  const usingPhoto = s.useCustomMode && photos.length > 0;
  const animal = getAnimal(s.animalId);

  return (
    <div className="ob" ref={rootRef} role="dialog" aria-modal="true" aria-label="처음 안내" tabIndex={-1}>
      <div className="ob-top">
        <span className="ob-dots" role="img" aria-label={`${STEPS}단계 중 ${step + 1}단계`}>
          {Array.from({ length: STEPS }, (_, i) => <i key={i} className="ob-dot" data-on={i === step ? '' : undefined} />)}
        </span>
        <button type="button" className="ob-exit" onClick={() => onClose('cancel')}>나가기</button>
      </div>

      <div className="ob-body">
        {step === 0 && (
          <section className="ob-card" key="s0">
            <h2>함께할 버디를 골라 주세요</h2>
            <p>고르면 바로 바뀌어요. 나중에 홈에서 언제든 바꿀 수 있어요.</p>
            <div className="ob-s1">
              <div>
                <div className="ob-tiles" role="group" aria-label="동물 고르기">
                  {ANIMALS.map(a => (
                    <button key={a.id} type="button" className="ob-tile" aria-pressed={!usingPhoto && s.animalId === a.id}
                      onClick={() => onChange({ animalId: a.id, useCustomMode: false })}>
                      <CatEmoji emoji={a.emoji} size={40} forceImage />
                      <span>{a.name}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="ui-btn ob-upload" onClick={onUpload}>내 사진 올리기</button>
              </div>
              <div className="ob-pv" aria-live="polite">
                <small>실시간 미리보기</small>
                {usingPhoto
                  ? <CatEmoji emoji={animal.emoji} size={96} customImage={photos[0]} customShape={s.customShape} forceImage />
                  : <CatEmoji emoji={animal.emoji} size={96} forceImage />}
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="ob-card" key="s1">
            <h2>알림을 받을까요?</h2>
            <p>점심과 퇴근 시각에 버디가 카드로 알려 줘요. 건너뛰면 두 알림은 꺼진 채로 시작해요.</p>
            <div className="ob-rows">
              <div className="ob-row">
                <b>점심 알림</b>
                <span className="ob-ctl">
                  <input type="time" className="ui-time" value={s.lunchTime} disabled={!s.lunchEnabled} aria-label="점심 알림 시각"
                    onChange={e => { if (e.target.value) onChange({ lunchTime: e.target.value }); }} />
                  <Switch checked={s.lunchEnabled} onChange={v => onChange({ lunchEnabled: v })} label="점심 알림 켜기" />
                </span>
              </div>
              <div className="ob-row">
                <b>퇴근 알림</b>
                <span className="ob-ctl">
                  <input type="time" className="ui-time" value={s.leaveTime} disabled={!s.leaveEnabled} aria-label="퇴근 알림 시각"
                    onChange={e => { if (e.target.value) onChange({ leaveTime: e.target.value }); }} />
                  <Switch checked={s.leaveEnabled} onChange={v => onChange({ leaveEnabled: v })} label="퇴근 알림 켜기" />
                </span>
              </div>
            </div>
            <button type="button" className="ui-btn" onClick={testAlert}>알림 미리 보기</button>
            <p className="ob-tiny">알림이 꺼져 있어도 카드를 한 번 보여 줘요. 점심 {formatTime(s.lunchTime)}, 퇴근 {formatTime(s.leaveTime)} 기준이에요.</p>
          </section>
        )}

        {step === 2 && (
          <section className="ob-card" key="s2">
            <h2>설정창을 닫아도 버디는 계속 놀아요</h2>
            <p>완전히 끄려면 {isMac ? '메뉴 막대의' : '트레이'} 아이콘을 눌러 앱 종료를 선택해 주세요.</p>
            <div className="ob-tray" aria-hidden="true">
              <span className="ob-tray-lab">{isMac ? '메뉴 막대' : '작업 표시줄'}</span>
              {!isMac && <span className="ob-tray-ic">^</span>}
              <span className="ob-tray-hot"><i className="ob-tray-heart" /></span>
              <span className="ob-tray-time">{isMac ? '화 오후 12:00' : '오후 12:00'}</span>
            </div>
            <h3 className="ob-sub">설정창은 이렇게 다시 열어요</h3>
            <ol className="ob-ways">
              <li><b>버디를 우클릭해요</b><span>가장 쉬워요. 버디 위에서 오른쪽 버튼을 눌러 보세요.</span></li>
              <li><b>트레이의 하트 아이콘을 눌러요</b>
                <span>{isMac ? '화면 위 메뉴 막대 오른쪽에 있어요.' : '작업 표시줄 오른쪽 ^ 숨겨진 아이콘 칸 안에 있을 수 있어요.'}</span></li>
              <li><b>앱을 다시 실행해요</b><span>이미 켜져 있으면 설정창만 앞으로 나와요.</span></li>
            </ol>
            <p className="ob-tiny">크기, 활동 구역, 말풍선은 홈에서 칩을 눌러 바꿀 수 있어요.</p>
          </section>
        )}
      </div>

      <div className="ob-foot">
        <button type="button" className="ob-ghost" onClick={() => go(-1)} style={{ visibility: step === 0 ? 'hidden' : 'visible' }}>이전</button>
        <span className="ob-foot-r">
          {step === 1 && <button type="button" className="ob-ghost" onClick={() => { onChange({ lunchEnabled: false, leaveEnabled: false }); go(1); }}>건너뛰기</button>}
          <button type="button" className="ob-pri" onClick={() => go(1)}>{step === STEPS - 1 ? '버디 풀어놓기' : '다음'}</button>
        </span>
      </div>
    </div>
  );
}
