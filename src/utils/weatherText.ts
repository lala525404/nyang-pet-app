import { CURRENT, EVENING, MORNING } from '../data/weatherText';
import type { TempBand, WeatherKind } from '../data/weatherText';
import type { WeatherData } from '../electron';
import { hash32 } from './fortune';

// WMO 날씨 코드(Open-Meteo weather_code) → 종류. 강수 확률이 높으면 맑음·흐림도 비로 본다.
export function weatherKind(code: number, pop: number | null): WeatherKind {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (typeof pop === 'number' && pop >= 60) return 'rain';
  return code <= 1 ? 'clear' : 'cloudy';
}

// 기온 구간: 영하(0 미만) / 쌀쌀(0~9) / 선선(10~16) / 따뜻(17~25) / 더움(26 이상)
export function tempBand(t: number): TempBand {
  return t < 0 ? 'freezing' : t < 10 ? 'chilly' : t < 17 ? 'cool' : t < 26 ? 'warm' : 'hot';
}

const deg = (n: number) => `${Math.round(n)}°`;
const pick = (list: string[], seed: string) => list[hash32(seed) % list.length];
const day = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// 아침 안내: "오늘 비 와요, 우산 챙겨요 ☔ 최고 18° / 최저 9°" (같은 날은 같은 문구)
export function morningText(w: WeatherData, now: Date): string {
  const kind = weatherKind(w.code, w.pop);
  const key = kind === 'clear' || kind === 'cloudy' ? tempBand((w.max + w.min) / 2) : kind;
  return `${pick(MORNING[key], `m|${key}|${day(now)}`)} 최고 ${deg(w.max)} / 최저 ${deg(w.min)}`;
}

// 퇴근길 안내: "퇴근길엔 쌀쌀해요, 겉옷 챙겨요 🧥 (지금 12°)"
export function eveningText(w: WeatherData, now: Date): string {
  const kind = weatherKind(w.code, w.pop);
  const key = kind === 'clear' || kind === 'cloudy' ? tempBand(w.feels) : kind;
  return `${pick(EVENING[key], `e|${key}|${day(now)}`)} (지금 ${deg(w.temp)})`;
}

// 지금 날씨 한 줄(체감이 2도 이상 다르면 체감도 덧붙인다). 30분마다 문구가 바뀐다.
export function currentText(w: WeatherData, now: Date): string {
  const kind = weatherKind(w.code, w.pop);
  const line = pick(CURRENT[kind], `c|${kind}|${day(now)}|${now.getHours()}:${Math.floor(now.getMinutes() / 30)}`).replace('{t}', String(Math.round(w.temp)));
  return Math.abs(w.feels - w.temp) >= 2 ? `${line} (체감 ${deg(w.feels)})` : line;
}
