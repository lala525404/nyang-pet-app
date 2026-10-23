import type { WeatherData, WeatherDay, WeatherHour } from '../electron';

// 퀵 메뉴의 날씨 카드 계산(화면과 분리해 시험한다: tests/quick-menu-unit.cjs). 값은 메인의 weather.cjs 캐시(30분)에서 온다.

export type WeatherIcon = 'sun' | 'cloud-sun' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export interface WeatherLabel { text: string; icon: WeatherIcon }

// WMO 날씨 코드 → 한글 + 간단 아이콘
export function weatherLabel(code: number): WeatherLabel {
  if (code === 0) return { text: '맑음', icon: 'sun' };
  if (code === 1) return { text: '대체로 맑음', icon: 'sun' };
  if (code === 2) return { text: '구름 조금', icon: 'cloud-sun' };
  if (code === 3) return { text: '흐림', icon: 'cloud' };
  if (code === 45 || code === 48) return { text: '안개', icon: 'fog' };
  if (code >= 51 && code <= 57) return { text: '이슬비', icon: 'drizzle' };
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) return { text: '비', icon: 'rain' };
  if (code >= 80 && code <= 82) return { text: '소나기', icon: 'rain' };
  if (code >= 71 && code <= 77) return { text: '눈', icon: 'snow' };
  if (code === 85 || code === 86) return { text: '소낙눈', icon: 'snow' };
  if (code === 95) return { text: '천둥 번개', icon: 'storm' };
  if (code === 96 || code === 99) return { text: '천둥 번개와 우박', icon: 'storm' };
  return { text: '흐림', icon: 'cloud' };   // 모르는 코드는 무난하게
}

// 풍속(m/s) → 바람 세기 한 줄 설명 (기상청 풍속 구분을 쉬운 말로)
export function windText(ms: number): string {
  if (ms < 0.5) return '바람이 거의 없어요';
  if (ms < 4) return '약한 바람이에요';
  if (ms < 9) return '바람이 조금 불어요';
  if (ms < 14) return '바람이 강해요';
  return '바람이 매우 강해요';
}
export const formatWind = (ms: number): string => `${(Math.round(ms * 10) / 10).toFixed(1)} m/s`;

export const formatTemp = (t: number): string => `${Math.round(t)}°`;

const DAY_MS = 24 * 60 * 60 * 1000;
// 오늘의 일별 값(최고·최저·강수 확률 최대): 그날 0시 이상 24시간 미만. 없으면 null(일별이 없는 예전 캐시 등)
export function todayDay(data: WeatherData, nowMs: number): WeatherDay | null {
  for (const d of data.days ?? []) if (d.at <= nowMs && nowMs < d.at + DAY_MS) return d;
  return null;
}

const sameLocalDay = (a: number, b: number): boolean => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };

// 오늘 남은 시간의 3시간 간격 예보: 지금 다음 정각부터 3시간씩, 오늘(로컬 날짜) 안에서만, 최대 8칸
export const FORECAST_STEP_H = 3;
export function threeHourly(data: WeatherData, nowMs: number): WeatherHour[] {
  const next = new Date(nowMs); next.setMinutes(0, 0, 0); next.setHours(next.getHours() + 1);
  const out: WeatherHour[] = [];
  for (let t = next.getTime(); sameLocalDay(t, nowMs) && out.length < 8; t += FORECAST_STEP_H * 3600000) {
    const h = data.hours.find(x => x.at === t) ?? data.hours.find(x => Math.abs(x.at - t) < 30 * 60000);
    if (h) out.push(h);
  }
  return out;
}

export const hourLabel = (ms: number): string => { const h = new Date(ms).getHours(); return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`; };

// 값을 받은 지 몇 분 됐는지(실패해서 마지막 값을 보여 줄 때 "N분 전 정보"에 쓴다)
export const ageMinutes = (at: number, nowMs: number): number => Math.max(0, Math.round((nowMs - at) / 60000));
export const staleText = (at: number, nowMs: number): string => {
  const m = ageMinutes(at, nowMs);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? `${m % 60}분 ` : ''}전 정보예요` : `${m}분 전 정보예요`;
};

export const WEATHER_SETUP_TEXT = '동네를 정하면 날씨를 볼 수 있어요';
export const WEATHER_CREDIT_TEXT = '날씨 데이터: Open-Meteo (CC BY 4.0)';
