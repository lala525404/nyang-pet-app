import { useEffect, useState } from 'react';

export interface PhotoState { index: number; count: number; intervalSec: number }
const EMPTY: PhotoState = { index: 0, count: 0, intervalSec: 0 };

// 메인 프로세스의 사진 교체 시계를 따른다. 설정창 미리보기와 버디 창이 같은 값을 받으므로 항상 같은 사진을 보여준다.
export function usePhotoState(): PhotoState {
  const [state, setState] = useState<PhotoState>(EMPTY);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onPhotoState) return;
    let gotEvent = false;
    let alive = true;
    api.getPhotoState?.().then(s => { if (alive && !gotEvent && s) setState(s); }).catch(() => {});
    const off = api.onPhotoState(s => { gotEvent = true; setState(s); });
    return () => { alive = false; off(); };
  }, []);
  return state;
}
