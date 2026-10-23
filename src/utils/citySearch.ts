import { CITIES, PARENT_SHORT } from '../data/cities';
import type { City } from '../data/cities';

// 도시 검색(가벼운 매칭): 공백·대소문자 무시, 이름·상위 지역(전체/줄임)·"줄임+이름" 부분 일치, 초성만 입력해도 이름 초성과 맞춘다.
// 점수가 낮을수록 먼저: 이름 정확히 같음 → 이름 앞부분 일치 → 이름 포함 → 상위+이름 포함 → 초성.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
// 한글 음절의 초성만 뽑는다(한글이 아닌 글자는 그대로)
const initials = (s: string) => Array.from(s).map(ch => {
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
}).join('');
const isInitialsOnly = (s: string) => s.length > 0 && Array.from(s).every(ch => CHO.includes(ch));
// "시/군/구"를 뗀 이름도 같은 이름으로 본다(의정부 → 의정부시). 한 글자 이름("중구"의 "중")은 떼지 않는다.
const stem = (name: string) => (name.length > 2 && /[시군구]$/.test(name) ? name.slice(0, -1) : name);

export const MAX_CITY_RESULTS = 3;

export function searchCities(query: string, max = MAX_CITY_RESULTS, list: City[] = CITIES): City[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { c: City; score: number; i: number }[] = [];
  list.forEach((c, i) => {
    const name = norm(c.name), st = stem(name), parent = norm(c.parent), short = norm(PARENT_SHORT[c.parent] ?? '');
    let score = -1;
    if (isInitialsOnly(q)) {
      const ini = initials(name);
      if (ini === q || initials(st) === q) score = 1; else if (ini.startsWith(q)) score = 4; else if (ini.includes(q)) score = 5;
    } else if (name === q || st === q) score = 0;
    else if (name.startsWith(q) || st.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if ((short + name).includes(q) || (parent + name).includes(q) || (short + st).includes(q)) score = 3;
    else if (parent.includes(q) || short === q) score = 6;   // 상위 지역만 입력(경기도 → 그 안의 도시들)
    if (score >= 0) scored.push({ c, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return scored.slice(0, max).map(s => s.c);
}

// 버튼에 보이는 이름: 같은 이름이 여럿인 구는 상위 지역을 함께 보여 준다
export const cityLabel = (c: City): string => `${c.name} · ${PARENT_SHORT[c.parent] ?? c.parent}`;
