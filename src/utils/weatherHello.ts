import type { WeatherData, WeatherHour } from '../electron';
import { HELLO_NOW_FEELS, HELLO_TEXTS } from '../data/weatherHello';
import type { HelloKind } from '../data/weatherHello';

// 날씨 안부: 값(WeatherData)과 지금 시각, 점심·퇴근 시간으로 "오늘 할 만한 안부" 후보를 만들고, 그중 하나를 고른다.
// 화면과 분리한 순수 계산이라 단위 테스트한다(tests/weather-unit.cjs). 조건이 맞는 종류만 후보가 되고, 하나도 없으면 안부는 나오지 않는다.

// ── 조절 값(상수) ──────────────────────────────────────────────────────────
export const HELLO_SHARE = 0.25;                      // 평소 말풍선 중 날씨 안부가 섞이는 비중(대략 4번에 1번)
export const FEELS_GAP_C = 3;                         // 체감이 기온과 이만큼 이상 다르면 체감도 같이 말한다
export const COLD_C = 5;                              // 이 체감 온도 이하면 "추울 것 같아요"
export const HOT_C = 28;                              // 이 체감 온도 이상이면 "더울 것 같아요"
export const RAIN_POP = 60;                           // 강수 확률(%)이 이 이상이면 "비 올 것 같아요"
export const WIND_MS = 8;                             // 풍속(m/s)이 이 이상이면 "바람이 많이 불어요"
export const FAIR_RANGE_C: [number, number] = [10, 25];   // 맑음 + 이 기온 범위면 "날씨가 좋아요"
export const FORECAST_AHEAD_MS = 8 * 60 * 60 * 1000;  // 점심·퇴근 예보는 지금부터 8시간 이내일 때만
export const FORECAST_MAX_AGE_MS = 5 * 60 * 60 * 1000;    // 값이 이보다 오래됐으면(6시간 가까이) 시간이 들어간 예보 문구는 쓰지 않는다
export const CURRENT_MAX_AGE_MS = 2 * 60 * 60 * 1000;     // "지금" 문구도 값이 이보다 오래됐으면 쓰지 않는다

// 날씨 코드(WMO): 비 51~67·80~82·95~99, 눈 71~77·85~86, 맑음 0~1
const RAIN_CODES = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || (c >= 95 && c <= 99);
const SNOW_CODES = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const CLEAR_CODES = (c: number) => c === 0 || c === 1;

export interface WeatherSnapshot { data: WeatherData; at: number }   // at: 값을 받은 시각(ms)
export interface HelloTimes { lunch?: string | null; leave?: string | null }   // "HH:MM", 꺼져 있거나 없으면 null
export interface HelloCandidate { kind: HelloKind; texts: string[] }

const formatDeg = (n: number): string => { const r = Math.round(n); return r < 0 ? `영하 ${-r}도` : `${r}도`; };
const fill = (tpl: string, t: string, f = ''): string => tpl.replace('{t}', t).replace('{f}', f);

// "HH:MM" → 오늘의 그 시각(ms). 잘못된 값이면 null
export function todayAt(now: Date, hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm ?? '');
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mm, 0, 0).getTime();
}

// 그 시각이 속한 시간대(1시간 간격 예보)의 값. 예보 범위를 벗어나면 null
export function hourAt(hours: WeatherHour[], t: number): WeatherHour | null {
  let best: WeatherHour | null = null;
  for (const h of hours) if (h.at <= t && t - h.at < 60 * 60 * 1000) best = h;
  return best;
}

// 그 시간의 대표 날씨: 눈 > 비 > 바람 > 추움 > 더움 순서로 가장 눈에 띄는 한 가지(없으면 null)
export function forecastKind(h: WeatherHour): 'Snow' | 'Rain' | 'Wind' | 'Cold' | 'Hot' | null {
  if (SNOW_CODES(h.code)) return 'Snow';
  if ((h.pop !== null && h.pop >= RAIN_POP) || RAIN_CODES(h.code)) return 'Rain';
  if (h.wind !== null && h.wind >= WIND_MS) return 'Wind';
  if (h.feels <= COLD_C) return 'Cold';
  if (h.feels >= HOT_C) return 'Hot';
  return null;
}

export function helloCandidates(w: WeatherSnapshot | null, nowMs: number, times: HelloTimes = {}): HelloCandidate[] {
  if (!w) return [];
  const d = w.data, age = nowMs - w.at, now = new Date(nowMs), out: HelloCandidate[] = [];
  if (age < 0) return [];
  // 시간이 들어간 예보: 점심·퇴근(설정된 것만), 아직 안 지났고 8시간 이내, 값이 너무 오래되지 않았을 때만
  if (age <= FORECAST_MAX_AGE_MS) {
    for (const [name, hm] of [['lunch', times.lunch], ['leave', times.leave]] as const) {
      const t = todayAt(now, hm);
      if (t === null || t <= nowMs || t - nowMs > FORECAST_AHEAD_MS) continue;
      const h = hourAt(d.hours, t); if (!h) continue;
      const k = forecastKind(h); if (!k) continue;
      const kind = `${name}${k}` as HelloKind;
      out.push({ kind, texts: HELLO_TEXTS[kind] });
    }
  }
  // 지금 상태
  if (age <= CURRENT_MAX_AGE_MS) {
    if (SNOW_CODES(d.code)) out.push({ kind: 'nowSnow', texts: HELLO_TEXTS.nowSnow });
    else if (RAIN_CODES(d.code)) out.push({ kind: 'nowRain', texts: HELLO_TEXTS.nowRain });
    if (d.wind !== null && d.wind >= WIND_MS) out.push({ kind: 'wind', texts: HELLO_TEXTS.wind });
    if (CLEAR_CODES(d.code) && d.temp >= FAIR_RANGE_C[0] && d.temp <= FAIR_RANGE_C[1]) out.push({ kind: 'fair', texts: HELLO_TEXTS.fair });
    const t = formatDeg(d.temp);
    const gap = Math.abs(Math.round(d.feels) - Math.round(d.temp)) >= FEELS_GAP_C;
    out.push({ kind: 'now', texts: (gap ? HELLO_NOW_FEELS : HELLO_TEXTS.now).map(x => fill(x, t, formatDeg(d.feels))) });
  }
  return out;
}

// 평범한 날에는 "지금 기온"만 후보다. 그 외의 종류가 있으면 "지금 기온"의 비중을 낮춘다(눈에 띄는 안부가 먼저 나오게).
const NOW_WEIGHT = 0.4;

// 후보 중 하나를 고른다: 직전과 같은 종류는 피하고(다른 후보가 있을 때), 같은 문구도 피한다. 후보가 없으면 null.
export function pickHello(cands: HelloCandidate[], last: { kind: HelloKind | null; text: string | null }, rand: () => number = Math.random): { kind: HelloKind; text: string } | null {
  if (!cands.length) return null;
  let pool = cands.filter(c => c.kind !== last.kind);
  if (!pool.length) pool = cands;
  const weights = pool.map(c => (c.kind === 'now' && pool.length > 1 ? NOW_WEIGHT : 1));
  let r = rand() * weights.reduce((a, b) => a + b, 0), idx = 0;
  for (; idx < pool.length - 1; idx++) { r -= weights[idx]; if (r < 0) break; }
  const c = pool[idx];
  const texts = c.texts.filter(t => t !== last.text);
  const list = texts.length ? texts : c.texts;
  return { kind: c.kind, text: list[Math.min(list.length - 1, Math.floor(rand() * list.length))] };
}

// 평소 말풍선 한 자리가 날씨 안부 차례인지. 연속 금지라서(직전이 날씨였으면 아니다) 직전이 날씨가 아닐 때 s/(1-s) 확률로 뽑으면
// 전체 비중이 정확히 s(HELLO_SHARE)가 된다: 25%면 3번에 1번 → 장기적으로 4번에 1번.
export function isHelloSlot(prevWasHello: boolean, rand: () => number = Math.random): boolean {
  return !prevWasHello && rand() < HELLO_SHARE / (1 - HELLO_SHARE);
}
