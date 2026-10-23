import { useEffect, useMemo, useRef, useState } from 'react';
import { searchPlaces } from '../utils/citySearch';
import type { PlaceHit } from '../utils/citySearch';
import { BIRTH_RETRY_TEXT, CONSENT_DETAIL, CONSENT_PATCH, CONSENT_TEXT, CREDIT, GREETING, NOT_FOUND_TEXT, afterConsent, applyCity, birthStep, cityStep, interpret, memoryLine, parseBirthText, stepForWeather } from '../utils/talk';
import type { SettingsPatch, ShowKind, TalkCtx, TalkStep } from '../utils/talk';

// 펫에게 말 걸기 창(더블클릭·트레이 메뉴로 연다): 인사 + 버튼 + 입력칸. 입력은 단어 규칙으로 해석하고(외부 호출 없음) 결과는 펫 말풍선으로 보여준 뒤 창을 닫는다.
// 사용자가 직접 연 경우에만 열리므로 입력칸에 포커스를 준다. Esc로 닫는다. 대화 내용은 저장하지 않는다.

type View =
  | { mode: 'menu' }
  | { mode: 'fortune' }                                     // 운세 안: 오늘 운세 보기 / 생일 알려주기
  | { mode: 'ask'; ask: 'city' | 'birth'; text: string; thenWeather?: boolean }
  | { mode: 'consent'; pendingCityId?: string }
  | { mode: 'pick'; text: string; hits: PlaceHit[] }
  | { mode: 'confirm'; text: string; yes: SettingsPatch; yesText: string };

export interface PetTalkProps {
  ctx: TalkCtx;
  start?: 'menu' | 'weather' | 'birth';
  onApply: (patch: SettingsPatch) => void;                  // 설정 저장(날씨·생일·빼기)
  onSay: (text: string, then?: ShowKind) => void;           // 펫 말풍선으로 말하기(then이 있으면 잠시 뒤 이어서 보여 준다)
  onShow: (what: ShowKind) => void;                         // 지금 날씨 / 오늘 운세 / 한마디 보여 주기
  onClose: () => void;
}

const patchToCtx = (c: TalkCtx, p: SettingsPatch): TalkCtx => ({
  ...c,
  weatherEnabled: p.weatherEnabled ?? c.weatherEnabled, weatherConsent: p.weatherConsent ?? c.weatherConsent,
  weatherCityId: p.weatherCityId ?? c.weatherCityId, fortuneBirth: p.fortuneBirth ?? c.fortuneBirth, offKinds: p.bubbleOffKinds ?? c.offKinds,
});

export default function PetTalk({ ctx: initialCtx, start = 'menu', onApply, onSay, onShow, onClose }: PetTalkProps) {
  const [ctx, setCtx] = useState(initialCtx);
  const [view, setView] = useState<View>({ mode: 'menu' });
  const [text, setText] = useState('');
  const [detail, setDetail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef(ctx); ctxRef.current = ctx;

  const apply = (patch?: SettingsPatch) => { if (!patch) return; setCtx(c => patchToCtx(c, patch)); ctxRef.current = patchToCtx(ctxRef.current, patch); onApply(patch); };
  const run = (step: TalkStep) => {
    setText('');
    switch (step.type) {
      case 'say': apply(step.patch); onSay(step.text, step.then); onClose(); break;
      case 'show': onShow(step.what); onClose(); break;
      case 'ask': setView({ mode: 'ask', ask: step.ask, text: step.text, thenWeather: step.thenWeather }); break;
      case 'consent': setDetail(false); setView({ mode: 'consent', pendingCityId: step.pendingCityId }); break;
      case 'pick': setView({ mode: 'pick', text: step.text, hits: step.hits }); break;
      case 'confirm': setView({ mode: 'confirm', text: step.text, yes: step.yes, yesText: step.yesText }); break;
    }
  };

  // 처음 열 때: 트레이 "지금 날씨"는 곧바로 날씨 대화로
  useEffect(() => {
    if (start === 'weather') run(stepForWeather(ctxRef.current));
    else if (start === 'birth') run({ type: 'ask', ask: 'birth', text: '생일을 알려줄래요? 예: 5월 25일, 1990-05-25' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 사용자가 직접 연 창이라 입력칸에 바로 글자를 칠 수 있게 포커스를 준다
  useEffect(() => { inputRef.current?.focus(); }, [view.mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const liveHits = useMemo(() => (view.mode === 'ask' && view.ask === 'city' && text.trim() ? searchPlaces(text) : []), [view, text]);
  const weatherOn = ctx.weatherEnabled && ctx.weatherConsent;

  const submit = () => {
    const v = text.trim(); if (!v) return;
    if (view.mode === 'ask' && view.ask === 'city') { run(cityStep(v, ctxRef.current)); return; }
    if (view.mode === 'ask' && view.ask === 'birth') {
      const r = parseBirthText(v, ctxRef.current.today);
      run(birthStep(r ?? { ok: false }, ctxRef.current)); return;
    }
    run(interpret(v, ctxRef.current));
  };

  const answerConsent = (yes: boolean) => {
    if (!yes) { onSay('알겠어요, 날씨는 켜지 않을게요'); onClose(); return; }
    const pending = view.mode === 'consent' ? view.pendingCityId : undefined;
    apply(CONSENT_PATCH);                                         // [괜찮아요]를 눌러야만 켜짐·동의가 저장된다
    run(afterConsent(pending, ctxRef.current));
  };

  const memory = memoryLine({ weatherCityId: ctx.weatherCityId, fortuneBirth: ctx.fortuneBirth, today: ctx.today });
  const hasMemory = !!ctx.weatherCityId || !!ctx.fortuneBirth || ctx.weatherConsent;

  return (
    <div className="pet-talk" role="dialog" aria-label="펫에게 말 걸기">
      <div className="pet-talk-head">
        <p className="pet-talk-title">{view.mode === 'menu' ? GREETING : view.mode === 'fortune' ? '운세를 볼까요?' : view.mode === 'consent' ? '날씨를 켤까요?' : view.mode === 'confirm' ? '확인해 주세요' : view.mode === 'pick' ? view.text : view.text}</p>
        <button type="button" className="pet-talk-x" onClick={onClose} aria-label="닫기">×</button>
      </div>

      {view.mode === 'menu' && (
        <div className="pet-talk-chips">
          <button type="button" className="pet-talk-chip" onClick={() => run(stepForWeather(ctxRef.current))}>☀️ 날씨</button>
          <button type="button" className="pet-talk-chip" onClick={() => setView({ mode: 'fortune' })}>🍀 운세</button>
          <button type="button" className="pet-talk-chip" onClick={() => { onShow('phrase'); onClose(); }}>💬 한마디</button>
          <button type="button" className="pet-talk-chip" onClick={() => run({ type: 'ask', ask: 'city', text: '어느 동네에 있어요?', thenWeather: true })}>📍 동네 바꾸기</button>
        </div>
      )}

      {view.mode === 'fortune' && (
        <>
          <div className="pet-talk-chips">
            <button type="button" className="pet-talk-chip" onClick={() => { onShow('fortune'); onClose(); }}>🍀 오늘 운세 보기</button>
            <button type="button" className="pet-talk-chip" onClick={() => run({ type: 'ask', ask: 'birth', text: '생일을 알려줄래요? 예: 5월 25일, 1990-05-25' })}>🎂 {ctx.fortuneBirth ? '생일 바꾸기' : '생일 알려주기'}</button>
          </div>
          <p className="pet-talk-note">생일을 알려 주면 운세가 나에게 맞춰져요. 생일은 이 컴퓨터 안에서만 써요.</p>
          <button type="button" className="pet-talk-clear" onClick={() => setView({ mode: 'menu' })}>← 뒤로</button>
        </>
      )}

      {view.mode === 'consent' && (
        <>
          <p className="pet-talk-note">{CONSENT_TEXT}</p>
          <div className="pet-talk-row">
            <button type="button" className="pet-talk-chip pet-talk-chip--primary" onClick={() => answerConsent(true)}>괜찮아요</button>
            <button type="button" className="pet-talk-chip" onClick={() => answerConsent(false)}>싫어요</button>
            <button type="button" className="pet-talk-chip pet-talk-chip--ghost" aria-expanded={detail} onClick={() => setDetail(v => !v)}>자세히 {detail ? '▴' : '▾'}</button>
          </div>
          {detail && <p className="pet-talk-note pet-talk-detail">{CONSENT_DETAIL}</p>}
        </>
      )}

      {view.mode === 'confirm' && (
        <>
          <p className="pet-talk-note">{view.text}</p>
          <div className="pet-talk-row">
            <button type="button" className="pet-talk-chip pet-talk-chip--primary" onClick={() => { apply(view.yes); onSay(view.yesText); onClose(); }}>네</button>
            <button type="button" className="pet-talk-chip" onClick={() => setView({ mode: 'menu' })}>아니요</button>
          </div>
        </>
      )}

      {view.mode === 'pick' && (
        <div className="pet-talk-list">
          {view.hits.map(h => <button key={h.label} type="button" className="pet-talk-opt" onClick={() => run(applyCity(h.city.id, ctxRef.current))}>{h.label}</button>)}
        </div>
      )}

      {view.mode === 'ask' && view.ask === 'city' && liveHits.length > 0 && (
        <div className="pet-talk-list">
          {liveHits.map(h => <button key={h.label} type="button" className="pet-talk-opt" onClick={() => run(applyCity(h.city.id, ctxRef.current))}>{h.label}</button>)}
        </div>
      )}
      {view.mode === 'ask' && view.ask === 'city' && text.trim() !== '' && liveHits.length === 0 && <p className="pet-talk-note">{NOT_FOUND_TEXT}</p>}
      {view.mode === 'ask' && view.ask === 'birth' && <p className="pet-talk-note">{view.text === BIRTH_RETRY_TEXT ? view.text : '예: 5월 25일, 1990-05-25, 0525 (연도는 안 써도 돼요)'}</p>}

      {(view.mode === 'menu' || view.mode === 'ask' || view.mode === 'fortune') && (
        <input ref={inputRef} className="pet-talk-input" type="text" autoComplete="off" spellCheck={false} maxLength={40} value={text}
          placeholder={view.mode === 'ask' ? (view.ask === 'city' ? '예: 노량진, 홍대, 의정부' : '예: 5월 25일') : '예: 오늘 날씨 어때? 운세 봐줘'}
          aria-label="펫에게 할 말" onChange={e => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }} />
      )}

      {view.mode === 'menu' && (
        <div className="pet-talk-foot">
          <span className="pet-talk-memory" title={memory}>{memory}</span>
          {hasMemory && <button type="button" className="pet-talk-clear" onClick={() => run(interpret('내 정보 지워줘', ctxRef.current))}>기억한 것 지우기</button>}
        </div>
      )}
      {weatherOn && view.mode === 'menu' && <p className="pet-talk-credit">{CREDIT}</p>}
    </div>
  );
}

// 운세를 처음 보여 준 뒤 생일이 없을 때 한 번 묻는 작은 창(입력칸 없음: 포커스를 가져가지 않는다)
export function PetBirthAsk({ onYes, onLater }: { onYes: () => void; onLater: () => void }) {
  return (
    <div className="pet-talk pet-talk--small" role="dialog" aria-label="생일 묻기">
      <p className="pet-talk-title">운세를 더 잘 맞춰 볼까요? 생일을 알려줄래요?</p>
      <div className="pet-talk-row">
        <button type="button" className="pet-talk-chip pet-talk-chip--primary" onClick={onYes}>알려줄게요</button>
        <button type="button" className="pet-talk-chip" onClick={onLater}>다음에요</button>
      </div>
    </div>
  );
}
