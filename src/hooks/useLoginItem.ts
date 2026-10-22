import { useCallback, useEffect, useState } from 'react';
import type { LoginItemState } from '../electron';

// "컴퓨터를 켜면 자동 실행"의 상태. 앱 안에는 저장하지 않고 항상 OS의 실제 상태를 메인에서 읽어 온다.
// 설정창을 열 때, 창이 다시 포커스를 받을 때(시스템 설정에서 바꿨을 수 있다), 토글 팝오버를 열 때(refresh) 다시 읽고,
// 바꾼 뒤에는 OS에서 다시 읽은 값으로 화면을 맞춘다(등록이 실패하면 꺼진 채로 보인다).
export function useLoginItem() {
  const api = window.electronAPI;
  const [state, setState] = useState<LoginItemState | null>(null);
  const refresh = useCallback(() => { api?.getLoginItem?.().then(s => { if (s) setState(s); }).catch(() => {}); }, [api]);
  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  const set = useCallback((enabled: boolean) => { api?.setLoginItem?.(enabled).then(s => { if (s) setState(s); }).catch(() => refresh()); }, [api, refresh]);
  return { state, refresh, set };
}
