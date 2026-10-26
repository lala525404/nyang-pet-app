import { useEffect } from 'react';
import { hasCleanableTimer, isNewDay, nextMark, runCleanup } from '../utils/alarmCleanup';
import type { Alarm } from '../utils/settings';
import { loadSettings, patchStoredSettings, readStoredSettings } from '../utils/settings';

// 지난 알람 자동 정리를 돌리는 보이지 않는 구성 요소(버디 창에서만 한 번 돌린다: 설정창은 읽기만). 판단은 utils/alarmCleanup.ts(시험됨).
//  - 앱이 시작되고 잠시 뒤 한 번, 그 뒤 1분마다 "날이 바뀌었는가"만 보고 자정 이후 첫 틱에 한 번 더 돌린다. 울린 지 1시간이 지난 타이머가 있으면 그때도 돌린다.
//  - 저장은 patchStoredSettings 한 길(알람과 기록 키만 덧붙이고 다른 설정은 그대로)이다. 알람 스케줄러(alarms.cjs)는 건드리지 않고,
//    알람이 실제로 지워졌을 때만 설정창·알람 대화와 같은 길(syncSettings)로 스케줄러에 알린다. 카드·말풍선·소리 없이 조용히 처리한다.
//  - 저장된 설정이 아직 없으면(완전 새 설치가 기본값을 심기 전) 아무것도 하지 않는다.
const START_DELAY_MS = 2500;
const TICK_MS = 60 * 1000;

export function runCleanupOnce(reason: 'start' | 'daily' | 'timer', nowMs: number = Date.now()): number {
  if (!readStoredSettings()) return 0;
  const s = loadSettings();
  const r = runCleanup({ alarms: s.alarms, alarmCleanupDay: s.alarmCleanupDay, alarmClockMark: s.alarmClockMark, alarmCleanupUndo: s.alarmCleanupUndo }, nowMs, reason);
  if (!r.changed) return 0;
  if (!patchStoredSettings({ alarms: r.alarms, ...r.meta })) return 0;
  if (r.removedCount > 0) window.electronAPI?.syncSettings(loadSettings() as unknown as Record<string, unknown>);
  return r.removedCount;
}

export default function AlarmCleanupRunner() {
  useEffect(() => {
    const first = setTimeout(() => runCleanupOnce('start'), START_DELAY_MS);
    const tick = setInterval(() => {
      const stored = readStoredSettings();
      if (!stored) return;
      const now = Date.now();
      if (isNewDay(stored.alarmCleanupDay, now)) { runCleanupOnce('daily', now); return; }
      if (hasCleanableTimer(stored.alarms as Alarm[], now)) { runCleanupOnce('timer', now); return; }   // 울린 지 1시간 지난 타이머(대화의 "N분 뒤 알람")
      const mark = nextMark(Number(stored.alarmClockMark) || 0, now);
      if (mark !== null) patchStoredSettings({ alarmClockMark: mark });   // 시계가 과거로 가는 것을 알아차릴 기준(10분에 한 번만 쓴다)
    }, TICK_MS);
    return () => { clearTimeout(first); clearInterval(tick); };
  }, []);
  return null;
}
