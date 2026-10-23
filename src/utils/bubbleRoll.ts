// 평소 말풍선 롤링: 한 "차례"(말풍선 주기)마다 무엇을 보일지 종류를 뽑고, 문구는 셔플 백으로 고른다. 화면과 분리한 순수 계산이라 단위 테스트한다(tests/bubble-roll-unit.cjs).
//  - 종류: 기본 문구(phrase) · 시계(clock) · 날씨 안부(hello) · 내 메시지(message).
//  - 비중(장기 평균): 시계 20% · 날씨 20% · 내 메시지 20%(내 메시지가 있을 때만), 나머지는 기본 문구. 날씨 후보가 없으면 날씨 몫은 기본 문구가 가져가고, 시계가 꺼져 있으면 시계 몫도 마찬가지다.
//  - 시계·날씨·내 메시지는 같은 종류가 연속으로 나오지 않는다. 기본 문구는 몫이 절반을 넘어서 종류로는 이어질 수 있지만 같은 문구는 이어지지 않는다(셔플 백).

export type RollKind = 'phrase' | 'clock' | 'hello' | 'message';

// 조절 값(상수): 기본 문구는 나머지(약 55%: 셋 다 있을 때 40%, 내 메시지가 없으면 60%, 날씨도 없으면 80%)
export const ROLL_SHARE = { clock: 0.2, hello: 0.2, message: 0.2 } as const;
export interface RollAvail { clock: boolean; hello: boolean; message: boolean }

const SPECIALS = ['clock', 'hello', 'message'] as const;

// 직전 종류가 s가 아닐 때 s를 뽑는 확률을 share/(1-share)로 하면, 연속 금지를 지키면서도 장기 비중이 정확히 share가 된다.
export function pickRollKind(avail: RollAvail, last: RollKind | null, rand: () => number = Math.random): RollKind {
  let r = rand(), acc = 0;
  for (const s of SPECIALS) {
    if (!avail[s] || last === s) continue;
    acc += ROLL_SHARE[s] / (1 - ROLL_SHARE[s]);
    if (r < acc) return s;
  }
  return 'phrase';
}

export interface ShuffleBag { next(items: readonly string[]): string | null }

// 셔플 백: 목록을 한 바퀴 다 돌 때까지 같은 문구를 다시 내지 않는다. 한 바퀴가 끝나면 다시 섞고, 새 바퀴의 첫 문구는 직전 문구와 다르게 한다.
// 목록이 중간에 바뀌어도(시간대가 바뀌는 등) 이미 낸 문구만 빼고 남은 것에서 고른다.
export function createShuffleBag(rand: () => number = Math.random): ShuffleBag {
  const used = new Set<string>();
  let last: string | null = null;
  return {
    next(items) {
      const uniq = Array.from(new Set(items));
      if (!uniq.length) return null;
      let rest = uniq.filter(x => !used.has(x));
      if (!rest.length) {
        used.clear();
        rest = uniq.filter(x => x !== last);
        if (!rest.length) rest = uniq;
      }
      const pick = rest[Math.min(rest.length - 1, Math.floor(rand() * rest.length))];
      used.add(pick); last = pick;
      return pick;
    },
  };
}
