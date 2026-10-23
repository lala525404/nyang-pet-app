import { voiceFor, type FortuneVoice } from '../data/fortune';
import { ANIMALS, ZODIAC } from '../data/zodiacText';
import { animalIndex, readBirth, zodiacIndex } from './zodiac';

// 오늘의 한마디·운세: 전부 로컬 계산(네트워크 없음). 같은 입력이면 항상 같은 결과가 나오는 순수 함수다(한마디만 난수).

// 문자열 → 32비트 해시 (FNV-1a)
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// 시드 → 난수열 (mulberry32)
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
// 로컬 날짜 키 "2026-10-23" (UTC가 아니라 PC의 현재 날짜)
export const dateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 한마디: 목록에서 무작위로 고르되 직전에 보여 준 문구와는 같지 않게 한다. rand는 0 이상 1 미만(테스트에서 주입).
export function randomPhrase(last: string | null, rand: () => number = Math.random, voiceId?: string): string {
  const list = voiceFor(voiceId).phrases;
  let i = Math.floor(rand() * list.length) % list.length;
  if (list[i] === last) i = (i + 1) % list.length;
  return list[i];
}

export type FortuneTopic = 'work' | 'money' | 'people';
export interface Fortune {
  date: string;
  pages: string[];   // 말풍선에 한 번에 한 쪽(한두 줄)씩 보여줄 줄들. 마지막은 "재미로 봐요" 줄
}

const pick = <T,>(list: T[], r: () => number): T => list[Math.floor(r() * list.length) % list.length];

// 하루 운세: 로컬 날짜가 시드. 같은 날은 몇 번을 눌러도 같고, 날짜가 바뀌면 (대부분) 달라진다.
// 생일(선택)을 넣으면 시드에 함께 섞여 사람마다 다른 결과가 되고, 가끔 별자리·띠 한 줄이 끼어든다. 생일이 비어 있으면 예전과 똑같은 결과다.
export function fortuneFor(d: Date, voiceId?: string, birth?: string): Fortune {
  const v: FortuneVoice = voiceFor(voiceId);
  const date = dateKey(d);
  const b = readBirth(birth, d);
  const r = rng(hash32(b ? `fortune|${v.id}|${date}|${birth}` : `fortune|${v.id}|${date}`));
  const topic = (['work', 'money', 'people'] as const)[Math.floor(r() * 3)];
  const total = pick(v.total, r);
  const line = pick(v[topic], r);
  const color = pick(v.colors, r);
  const number = 1 + Math.floor(r() * 99);
  const snack = pick(v.snacks, r);
  const footer = pick(v.footers, r);
  const pages = [
    total,
    `${v.labels[topic]} · ${line}`,
    // 항목 하나가 줄 중간에서 끊기지 않게 항목 안의 공백은 줄바꿈 없는 공백(NBSP)으로 둔다
    [`${v.labels.color} ${color}`, `${v.labels.number} ${number}`, `${v.labels.snack} ${snack}`].map(s => s.replace(/ /g, ' ')).join(' · '),
    footer,
  ];
  if (b) {
    const extraR = rng(hash32(`extra|${date}|${birth}`));
    if (extraR() < 0.6) {   // 가끔(대략 열 번 중 여섯 번)
      const useAnimal = b.year !== null && extraR() < 0.5;
      const sign = useAnimal ? ANIMALS[animalIndex(b.year as number)] : ZODIAC[zodiacIndex(b.month, b.day)];
      pages.splice(1, 0, `${sign.name} · ${sign.lines[Math.floor(extraR() * sign.lines.length) % sign.lines.length]}`);
    }
  }
  return { date, pages };
}
