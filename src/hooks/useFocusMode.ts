import { useCallback, useEffect, useState } from 'react';
import type { FocusModeState } from '../electron';

// 초집중 모드 상태. 메인이 소유·저장하므로(트레이에서 바꿔도 같이 바뀐다) 여기서는 읽어 오고, 메인이 보내는 변경을 따라가며, 바꾸고 싶을 때 메인에 요청한다.
export function useFocusMode() {
  const api = window.electronAPI;
  const [state, setState] = useState<FocusModeState | null>(null);
  useEffect(() => {
    if (!api?.getFocusMode) return;
    let alive = true;
    api.getFocusMode().then(s => { if (alive && s) setState(s); }).catch(() => {});
    const off = api.onFocusMode?.(s => { if (alive && s) setState(s); });
    return () => { alive = false; if (typeof off === 'function') off(); };
  }, [api]);
  const set = useCallback((change: { enabled?: boolean; seconds?: boolean }) => { api?.setFocusMode?.(change).then(s => { if (s) setState(s); }).catch(() => {}); }, [api]);
  return { state, set };
}
