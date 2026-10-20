import type { PetSettings } from '../../utils/settings';

export interface Monitor {
  displayId: number;
  isPrimary: boolean;
  index: number;
}

export interface PaneProps {
  settings: PetSettings;
  // 값을 바꾸면 예전 앱처럼 모드가 "커스텀"으로 바뀐다 (속도·크기·알림·알람 등)
  update: (patch: Partial<PetSettings>) => void;
  // 모드를 바꾸지 않는 변경 (동물·사진·모양·표시 여부)
  patch: (patch: Partial<PetSettings>) => void;
}

export const MODE_NAME: Record<string, string> = { chill: 'Chill', buddy: 'Buddy', chaos: 'Chaos', custom: '커스텀' };
