import { CITIES } from '../data/cities';
import type { City } from '../data/cities';
import places from '../data/places.json';
import { PLACE_ALIASES } from '../data/placeAliases';

// 동네 찾기(전부 앱 안의 자료로만, 네트워크 없음): 시·군·구 이름, 읍·면·동 이름(법정동), 자주 쓰는 지명·지하철역 별칭을 한꺼번에 검색한다.
// 고르면 그 동네가 속한 시·군·구(City)의 대표 좌표만 날씨에 쓰인다. 동네 이름 자체는 저장하지 않는다.
// 매칭: 공백·대소문자 무시, 초성만 입력해도 됨, 앞부분/부분 일치, "동작구 노량진"·"서울 노량진"처럼 상위 지역을 함께 쳐도 됨.

export interface PlaceHit {
  city: City;                         // 날씨에 쓰이는 시·군·구
  name: string;                       // 입력과 맞은 이름(시·군·구 이름 / 읍·면·동 / 별칭)
  kind: 'city' | 'dong' | 'alias';
  label: string;                      // 버튼에 보이는 글: "노량진동 · 서울 동작구"
}

export const MAX_PLACE_RESULTS = 5;

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const initials = (s: string) => Array.from(s).map(ch => {
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
}).join('');
const isInitialsOnly = (s: string) => s.length > 0 && Array.from(s).every(ch => CHO.includes(ch));
// "시/군/구"를 뗀 이름도 같은 이름으로 본다(의정부 → 의정부시). 두 글자 이름("중구")은 떼지 않는다.
const stemCity = (name: string) => (name.length > 2 && /[시군구]$/.test(name) ? name.slice(0, -1) : name);
// 읍·면·동 이름에서 끝의 "동/읍/면/가"와 숫자를 뗀 이름(상도1동 → 상도, 종로2가 → 종로). 한 글자가 남으면 떼지 않는다.
const stemDong = (name: string) => {
  const g = /^(.+?)[0-9]+가$/.exec(name);      // 종로2가 → 종로, 중앙동1가 → 중앙동
  if (g) return g[1];
  const s = name.replace(/[0-9]+동$/, '동').replace(/[동읍면가]$/, '');   // 상도1동 → 상도, 노량진동 → 노량진
  return s.length >= 2 ? s : name;
};
// 일반구가 있는 시(수원시 장안구)는 "수원시"를 그룹 이름으로 본다
const groupOf = (c: City) => c.name.split(' ')[0];

interface Entry { city: City; name: string; kind: PlaceHit['kind']; keys: string[]; ini: string[]; order: number }

let corpus: Entry[] | null = null;
const cityById = new Map(CITIES.map(c => [c.id, c]));

function build(): Entry[] {
  const out: Entry[] = [];
  const add = (city: City, name: string, kind: PlaceHit['kind'], keys: string[]) => {
    const ks = [...new Set(keys.filter(Boolean))];
    out.push({ city, name, kind, keys: ks, ini: ks.map(initials), order: out.length });
  };
  for (const c of CITIES) { const n = norm(c.name); add(c, c.name, 'city', [n, stemCity(n)]); }
  const dongs = (places as { cities: Record<string, string> }).cities;
  for (const [id, joined] of Object.entries(dongs)) {
    const city = cityById.get(id); if (!city) continue;
    for (const d of joined.split('|')) add(city, d, 'dong', [norm(d), norm(stemDong(d))]);
  }
  for (const [alias, ...ids] of PLACE_ALIASES) for (const id of ids) { const city = cityById.get(id); if (city) add(city, alias, 'alias', [norm(alias)]); }
  return out;
}

// 매칭 수준: 0 정확히 같음, 1 앞부분 일치, 2 부분 일치, -1 안 맞음
const lv = (k: string, q: string) => (k === q ? 0 : k.startsWith(q) ? 1 : k.includes(q) ? 2 : -1);
const KIND_RANK = { city: 0, alias: 1, dong: 2 } as const;

// 시·군·구 이름: 겹치지 않으면 "동작구", 다른 시·도에 같은 이름이 있으면(중구·동구…) "서울 중구"처럼 시·도를 붙인다
const nameCount = new Map<string, number>();
for (const c of CITIES) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);
export function cityLabel(c: City): string {
  return (nameCount.get(c.name) ?? 0) > 1 ? `${c.short} ${c.name}` : c.name;
}

// 후보 버튼 글: "동작구 · 노량진동" (시·군·구를 고르면 이름만)
export function placeLabel(h: { city: City; name: string; kind: PlaceHit['kind'] }): string {
  return h.kind === 'city' ? cityLabel(h.city) : `${cityLabel(h.city)} · ${h.name}`;
}

function run(pool: Entry[], q: string, max: number): { hits: PlaceHit[]; best: number } {
  const initialsQuery = isInitialsOnly(q);
  const scored: { e: Entry; s: number; l: number }[] = [];
  for (const e of pool) {
    let l = -1;
    (initialsQuery ? e.ini : e.keys).forEach((k, i) => { const x0 = lv(k, q), x = x0 + (x0 >= 0 && i > 0 ? 0.5 : 0); if (x0 >= 0 && (l < 0 || x < l)) l = x; });   // 이름 그대로 맞은 것이 "동/시"를 뗀 이름으로 맞은 것보다 먼저
    if (l >= 0) scored.push({ e, s: l * 10 + KIND_RANK[e.kind], l });
  }
  scored.sort((a, b) => a.s - b.s || a.e.order - b.e.order);
  const seen = new Set<string>(), hits: PlaceHit[] = [];
  for (const { e } of scored) {
    const hit: PlaceHit = { city: e.city, name: e.name, kind: e.kind, label: placeLabel(e) };
    if (seen.has(hit.label)) continue;
    seen.add(hit.label); hits.push(hit);
    if (hits.length >= max) break;
  }
  return { hits, best: scored.length ? scored[0].l : -1 };
}

// 상위 지역을 앞에 함께 쓴 경우("서울 노량진", "동작구 노량진", "서울동작구노량진"): 범위를 좁히고 앞부분을 뗀 나머지를 돌려준다.
function scopeOf(pool: Entry[], q: string): { pool: Entry[]; rest: string } | null {
  let scoped = pool, rest = q, stripped = false;
  const sidos = [...new Set(CITIES.flatMap(c => [c.short, c.parent]))].sort((a, b) => b.length - a.length);
  for (const s of sidos) {
    const ns = norm(s);
    if (rest.length > ns.length && rest.startsWith(ns)) {
      const sub = scoped.filter(e => e.city.short === s || e.city.parent === s);
      if (sub.length) { scoped = sub; rest = rest.slice(ns.length); stripped = true; break; }
    }
  }
  let bestLen = 0, group = '';
  for (const g of new Set(scoped.map(e => groupOf(e.city)))) {
    for (const f of [norm(g), stemCity(norm(g))]) if (f.length >= 2 && rest.length >= f.length && rest.startsWith(f) && f.length > bestLen) { bestLen = f.length; group = g; }
  }
  if (group) { scoped = scoped.filter(e => groupOf(e.city) === group); rest = rest.slice(bestLen); stripped = true; }
  if (!stripped) return null;
  if (!rest) { rest = norm(group || ''); scoped = scoped.filter(e => e.kind === 'city'); }   // "서울동작구"처럼 지역 이름만 쓴 경우
  return { pool: scoped, rest };
}

export function searchPlaces(query: string, max = MAX_PLACE_RESULTS): PlaceHit[] {
  const q = norm(query);
  if (!q) return [];
  corpus ??= build();
  const first = run(corpus, q, max);
  if (first.best >= 0 && first.best <= 1.5) return first.hits;   // 이름이 앞부분 이상으로 맞으면 그대로(의정부동처럼 시 이름으로 시작하는 동 이름 포함)
  const sc = scopeOf(corpus, q);
  if (sc) { const second = run(sc.pool, sc.rest, max); if (second.hits.length) return second.hits; }
  return first.hits;
}
