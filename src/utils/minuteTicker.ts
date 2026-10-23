// 분이 바뀌는 순간(+20ms)마다 한 번씩만 부르는 타이머 하나. 늘 대기 중인 타이머는 하나뿐이고, stop()하면 정리된다(누수 없음).
// 시계·타이머 함수를 주입할 수 있어 단위 테스트한다(tests/leave-left-unit.cjs).
export interface TickerDeps {
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export const msToNextMinute = (d: Date): number => 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20;

export function startMinuteTicker(cb: (now: Date) => void, deps: TickerDeps = {}): () => void {
  const now = deps.now ?? (() => new Date());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: unknown = null, stopped = false;
  const tick = () => {
    if (stopped) return;
    const d = now();
    cb(d);
    timer = setTimer(tick, msToNextMinute(d));
  };
  tick();
  return () => { stopped = true; if (timer !== null) clearTimer(timer); timer = null; };
}
