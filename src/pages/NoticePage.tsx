import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import '../styles/quick.css';
import '../styles/notice.css';
import { notesFor } from '../data/releaseNotes';
import { decideNotice } from '../utils/updateNews';
import type { NoticeView } from '../utils/updateNews';
import { patchStoredSettings, readStoredSettings } from '../utils/settings';
import type { NoticeAction } from '../electron';

// 펫 옆 안내 카드 창(/notice): 퀵 메뉴와 같은 흑백 카드(quick.css의 --quick-bar-* 변수와 .qk-card·.qk-btn 재사용).
// 어떤 카드를 보일지 메인이 알려 주면(notice-get) 여기서 설정 저장값을 읽어 "보일지 말지"를 정한다. 보이지 않기로 하면 notice-skip으로 조용히 끝낸다.
// 내용은 항상 일반 텍스트(React가 글자로만 그린다 — HTML을 끼워 넣지 않는다).
//  - whatsnew(업데이트 후): 앱에 들어 있는 소식(src/data/releaseNotes.ts). 닫으면 lastSeenVersion을 현재 버전으로 저장(다시 보기는 저장하지 않는다)
//  - update(업데이트 전): 새 버전 확인 시 달라지는 점 + [지금 업데이트] [나중에]. 닫거나 나중에를 고르면 lastPromptedVersion 저장

const api = () => window.electronAPI;

type View = NoticeView;

export default function NoticePage() {
  const [view, setView] = useState<View | null>(null);
  const [side, setSide] = useState<'above' | 'below'>('above');
  const [opened, setOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  // 메인이 알려 주는 배치(위/아래)·열림·닫힘을 받고, 어떤 카드인지 물어서 보일지 정한다
  useEffect(() => {
    const a = api();
    const offs = [a?.onNoticeLayout?.(l => setSide(l.side)), a?.onNoticeOpen?.(() => setOpened(true)), a?.onNoticeClosing?.(() => setClosing(true))];
    let alive = true;
    a?.noticeGet?.().then(item => {
      if (!alive) return;
      if (!item) { a?.noticeSkip?.(); return; }
      const d = decideNotice(item, { stored: readStoredSettings(), current: __APP_VERSION__, notesFor });
      if ('view' in d) setView(d.view);
      else { if (d.seed) patchStoredSettings({ lastSeenVersion: d.seed }); a?.noticeSkip?.(); }
    }).catch(() => { a?.noticeSkip?.(); });
    return () => { alive = false; offs.forEach(o => { if (typeof o === 'function') o(); }); };
  }, []);

  // 카드 크기와 클릭을 받을 영역(카드 사각형)을 메인에 알린다
  useLayoutEffect(() => {
    if (!view) return;
    const el = rootRef.current; if (!el) return;
    let lastKey = '';
    const report = () => {
      const r = el.getBoundingClientRect();
      api()?.noticeResize(Math.ceil(r.width), Math.ceil(r.height));
      const t = el.querySelector<HTMLElement>('.qk-card');
      const list = t && t.offsetWidth > 0 && t.offsetHeight > 0 ? [{ kind: 'rect', x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight }] : [];
      const key = JSON.stringify(list);
      if (key !== lastKey) { lastKey = key; api()?.noticeRegions(list); }
    };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report); ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // 눌린 동작을 기록(필요한 경우)하고 메인에 알린다. 한 번만
  const act = useCallback((action: NoticeAction) => {
    if (doneRef.current || !view) return;
    doneRef.current = true;
    if (view.persist) patchStoredSettings(view.kind === 'whatsnew' ? { lastSeenVersion: view.version } : { lastPromptedVersion: view.version });
    api()?.noticeAction(action);
  }, [view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); act('close'); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  if (!view) return null;
  const rootProps = { ref: rootRef, 'data-mode': 'bar', 'data-side': side, 'data-open': opened ? '' : undefined, 'data-closing': closing ? '' : undefined } as const;

  if (view.kind === 'whatsnew') {
    return (
      <div className="qk-root nt-root" {...rootProps}>
        <section className="qk-card nt-card" role="dialog" aria-label={`업데이트 완료 v${view.version}`}>
          <header className="nt-head">
            <Sparkles className="nt-i" strokeWidth={1.7} aria-hidden />
            <div className="nt-titles"><h2 className="nt-title">업데이트 완료 · v{view.version}</h2><p className="nt-sub">이번에 달라진 점이에요</p></div>
            <button type="button" className="qk-iconbtn" onClick={() => act('close')} aria-label="닫기"><X className="qk-i" strokeWidth={1.7} aria-hidden /></button>
          </header>
          <ul className="nt-list">{view.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <div className="nt-actions">
            <button type="button" className="qk-btn" onClick={() => act('details')}>자세히 보기</button>
            <button type="button" className="qk-btn qk-btn--solid" onClick={() => act('ok')} data-autofocus>확인</button>
          </div>
        </section>
      </div>
    );
  }

  const hasNotes = view.notes.length > 0;
  return (
    <div className="qk-root nt-root" {...rootProps}>
      <section className="qk-card nt-card" role="dialog" aria-label={`새 버전 v${view.version}`}>
        <header className="nt-head">
          <Sparkles className="nt-i" strokeWidth={1.7} aria-hidden />
          <div className="nt-titles">
            <h2 className="nt-title">{hasNotes ? `새 버전 v${view.version}` : '새 버전이 나왔어요'}</h2>
            <p className="nt-sub">{hasNotes ? '이런 게 달라져요' : `v${view.version}`}</p>
          </div>
          <button type="button" className="qk-iconbtn" onClick={() => act('close')} aria-label="닫기"><X className="qk-i" strokeWidth={1.7} aria-hidden /></button>
        </header>
        {hasNotes && <ul className="nt-list">{view.notes.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        <div className="nt-actions">
          {!hasNotes && <button type="button" className="qk-btn" onClick={() => act('details')}>자세히 보기</button>}
          <button type="button" className="qk-btn" onClick={() => act('later')}>나중에</button>
          <button type="button" className="qk-btn qk-btn--solid" onClick={() => act('update')} data-autofocus>지금 업데이트</button>
        </div>
      </section>
    </div>
  );
}
