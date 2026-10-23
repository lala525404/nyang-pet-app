import { BUBBLE_KINDS } from './settings';
import type { BubbleKind } from './settings';

// 빈 시간 말풍선 자동 섞기: 시계·한마디·하루 진행·운세·날씨를 가중치로 무작위 선택한다.
// 쓸 수 없는 종류(날씨가 꺼짐·값 없음)나 사용자가 뺀 종류(bubbleOffKinds)는 후보에서 빠지고, 빠진 몫은 남은 종류에 비율대로 나뉜다.
// 직전과 같은 종류는 연속으로 나오지 않는다(후보가 하나뿐이면 어쩔 수 없이 반복).

export const MIX_WEIGHTS: Record<BubbleKind, number> = { clock: 25, phrase: 30, progress: 15, fortune: 15, weather: 15 };

export function mixCandidates(off: readonly BubbleKind[], weatherReady: boolean): BubbleKind[] {
  return BUBBLE_KINDS.filter(k => !off.includes(k) && (k !== 'weather' || weatherReady));
}

// 후보별 실제 비율(합 100). last가 있고 다른 후보가 있으면 last는 제외된다.
export function mixWeights(off: readonly BubbleKind[], weatherReady: boolean, last: BubbleKind | null = null): Partial<Record<BubbleKind, number>> {
  let c = mixCandidates(off, weatherReady);
  if (last && c.length > 1) c = c.filter(k => k !== last);
  const sum = c.reduce((s, k) => s + MIX_WEIGHTS[k], 0);
  return Object.fromEntries(c.map(k => [k, (MIX_WEIGHTS[k] / sum) * 100]));
}

export function pickKind(opts: { off: readonly BubbleKind[]; weatherReady: boolean; last: BubbleKind | null; rand?: () => number }): BubbleKind | null {
  const w = mixWeights(opts.off, opts.weatherReady, opts.last);
  const kinds = Object.keys(w) as BubbleKind[];
  if (kinds.length === 0) return null;
  let r = (opts.rand ?? Math.random)() * 100;
  for (const k of kinds) { r -= w[k] as number; if (r < 0) return k; }
  return kinds[kinds.length - 1];
}
