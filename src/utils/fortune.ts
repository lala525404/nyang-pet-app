import { voiceFor, type FortuneVoice } from '../data/fortune';

// 오늘의 한마디·운세: 전부 로컬 계산(네트워크 없음). 같은 입력이면 항상 같은 결과가 나오는 순수 함수다.

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

// 한마디 슬롯: 30분 단위. 같은 슬롯에서는 같은 문구
export const PHRASE_SLOT_MIN = 30;
export const phraseSlotKey = (d: Date): string => `${dateKey(d)}#${Math.floor((d.getHours() * 60 + d.getMinutes()) / PHRASE_SLOT_MIN)}`;

const phraseIndexAt = (key: string, count: number): number => hash32(`phrase|${key}`) % count;

// 슬롯의 문구. 직전 슬롯과 같은 문구가 나오면 다음 문구로 밀어서 연속 중복을 막는다.
export function phraseFor(d: Date, voiceId?: string): string {
  const list = voiceFor(voiceId).phrases;
  const cur = phraseIndexAt(phraseSlotKey(d), list.length);
  const prev = phraseIndexAt(phraseSlotKey(new Date(d.getTime() - PHRASE_SLOT_MIN * 60000)), list.length);
  return list[cur === prev ? (cur + 1) % list.length : cur];
}

export type FortuneTopic = 'work' | 'money' | 'people';
export interface Fortune {
  date: string;
  pages: string[];   // 말풍선에 한 번에 한 쪽(한두 줄)씩 보여줄 줄들. 마지막은 "재미로 봐요" 줄
}

const pick = <T,>(list: T[], r: () => number): T => list[Math.floor(r() * list.length) % list.length];

// 하루 운세: 로컬 날짜가 시드. 같은 날은 몇 번을 눌러도 같고, 날짜가 바뀌면 (대부분) 달라진다.
export function fortuneFor(d: Date, voiceId?: string): Fortune {
  const v: FortuneVoice = voiceFor(voiceId);
  const date = dateKey(d);
  const r = rng(hash32(`fortune|${v.id}|${date}`));
  const topic = (['work', 'money', 'people'] as const)[Math.floor(r() * 3)];
  const total = pick(v.total, r);
  const line = pick(v[topic], r);
  const color = pick(v.colors, r);
  const number = 1 + Math.floor(r() * 99);
  const snack = pick(v.snacks, r);
  const footer = pick(v.footers, r);
  return {
    date,
    pages: [
      total,
      `${v.labels[topic]} · ${line}`,
      // 항목 하나가 줄 중간에서 끊기지 않게 항목 안의 공백은 줄바꿈 없는 공백(NBSP)으로 둔다
      [`${v.labels.color} ${color}`, `${v.labels.number} ${number}`, `${v.labels.snack} ${snack}`].map(s => s.replace(/ /g, ' ')).join(' · '),
      footer,
    ],
  };
}
