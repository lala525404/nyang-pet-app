import { useEffect, useState } from 'react';
import type { UpdateState } from '../../electron';

// 설정창 버전 표시 옆의 업데이트 확인: 버튼 하나와 상태 문구. 상태는 메인(updater.cjs)이 보내 주고, 여기서는 보여 주기만 한다.
//   최신 버전이에요 / 새 버전이 있어요 / 다운로드 중 N% / 재시작하면 설치돼요
// 개발 모드(꺼짐)에서는 아무것도 그리지 않는다.
const NOTE: Record<string, (s: UpdateState) => string> = {
  idle: () => '',
  checking: () => '확인 중…',
  none: () => '최신 버전이에요 :)',
  available: (s) => s.error ?? `새 버전 v${s.version}이 있어요`,
  blocked: () => '응용 프로그램 폴더로 옮겨서 실행해 주세요',
  downloading: (s) => `다운로드 중 ${s.percent ?? 0}%`,
  downloaded: (s) => (s.pendingInstall ? '알림이 끝나면 재시작해요' : '재시작하면 설치돼요'),
  error: (s) => s.message ?? '업데이트를 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요',
};

export default function UpdateStatus() {
  const api = window.electronAPI;
  const [s, setS] = useState<UpdateState>({ status: 'disabled' });
  useEffect(() => {
    if (!api?.getUpdateState || !api.onUpdateState) return;
    let alive = true;
    api.getUpdateState().then(v => { if (alive && v) setS(v); }).catch(() => {});
    const off = api.onUpdateState(v => { if (v) setS(v); });
    return () => { alive = false; off(); };
  }, [api]);
  const updaterOn = !!api?.getUpdateState && s.status !== 'disabled';
  if (!api || (!updaterOn && !api.showWhatsNew)) return null;   // 개발 모드(업데이터 꺼짐)에서도 "소식 다시 보기" 링크는 보인다

  // 소식 링크: 이번 업데이트 소식 다시 보기(저장값은 바꾸지 않는다) · 새 버전이 있으면 "새 버전 v○ 소식 보기"(같은 버전에 이미 카드를 봤어도 다시)
  const links = (
    <>
      {s.status === 'available' && s.version && api.showUpdateNews && <button type="button" className="st-update-link" onClick={() => api.showUpdateNews?.()}>새 버전 v{s.version} 소식 보기</button>}
      {api.showWhatsNew && <button type="button" className="st-update-link" onClick={() => api.showWhatsNew?.()}>이번 업데이트 소식 다시 보기</button>}
    </>
  );
  if (!updaterOn) return <span className="st-update">{links}</span>;

  const note = (NOTE[s.status] ?? NOTE.idle)(s);
  const downloading = s.status === 'downloading';
  const run = (p: Promise<unknown> | undefined) => { p?.then(v => { if (v && typeof v === 'object') setS(v as UpdateState); }).catch(() => {}); };
  let action: { label: string; onClick: () => void } | null = { label: s.status === 'error' ? '다시 확인' : '업데이트 확인', onClick: () => run(api.checkForUpdates()) };
  if (s.status === 'available') action = { label: '지금 업데이트', onClick: () => run(api.downloadUpdate()) };
  else if (s.status === 'downloaded') action = { label: '재시작', onClick: () => run(api.installUpdate()) };
  else if (s.status === 'blocked' || downloading) action = null;

  return (
    <span className="st-update">
      {downloading && <progress className="st-update-bar" max={100} value={s.percent ?? 0} aria-label="업데이트 다운로드" />}
      {note && <span className="st-update-note" role="status" aria-live={downloading ? 'off' : 'polite'} aria-hidden={downloading || undefined}>{note}</span>}
      {action && <button type="button" className="st-update-btn" disabled={s.status === 'checking'} onClick={action.onClick}>{action.label}</button>}
      {links}
    </span>
  );
}
