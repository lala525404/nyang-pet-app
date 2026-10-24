import type { PetSettings } from './settings';
import { loadSettings, readStoredSettings, saveSettings } from './settings';

// 알람 대화가 알람을 바꾸는 길: 설정창과 같다 — 저장값(saveSettings)을 고치고 메인에 알린다(syncSettings → 알람 스케줄러가 바로 반영). 별도 저장소는 없다.
// 설정을 한 번도 저장한 적이 없는 새 설치(저장값 없음)에서는 기본값을 대신 저장해 버리지 않도록 아무것도 하지 않는다.
export type ApplyResult = { ok: true } | { ok: false; reason: 'no-settings' | 'save' | 'limit' };

export function applyToStoredSettings(mutate: (s: PetSettings) => PetSettings | null): ApplyResult {
  if (!readStoredSettings()) return { ok: false, reason: 'no-settings' };
  const next = mutate(loadSettings());
  if (!next) return { ok: false, reason: 'limit' };
  if (!saveSettings(next)) return { ok: false, reason: 'save' };
  window.electronAPI?.syncSettings(next as unknown as Record<string, unknown>);
  return { ok: true };
}
