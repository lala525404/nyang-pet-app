import { ANIMALS, ZODIAC } from '../data/zodiacText';
import type { Sign } from '../data/zodiacText';

// 별자리·띠·생일 계산(전부 로컬 순수 함수, 외부 호출 없음).

export interface Birth { year: number | null; month: number; day: number }

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (m: number, y: number | null) => [31, y === null || isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export const MIN_BIRTH_YEAR = 1900;

// 월·일(·연도)이 실제 있는 날짜인지. 연도를 모르면 2월 29일도 가능한 날로 본다. 연도가 있으면 1900~올해, 미래는 안 된다.
export function validBirth(year: number | null, month: number, day: number, today: Date = new Date()): boolean {
  if (![month, day].every(Number.isInteger) || month < 1 || month > 12 || day < 1) return false;
  if (year !== null) {
    if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > today.getFullYear()) return false;
  }
  if (day > daysIn(month, year)) return false;
  if (year === today.getFullYear() && (month > today.getMonth() + 1 || (month === today.getMonth() + 1 && day > today.getDate()))) return false;
  return true;
}

// 저장 문자열 "YYYY-MM-DD" / "MM-DD" ↔ Birth
export function formatBirth(b: Birth): string {
  const mm = String(b.month).padStart(2, '0'), dd = String(b.day).padStart(2, '0');
  return b.year === null ? `${mm}-${dd}` : `${String(b.year).padStart(4, '0')}-${mm}-${dd}`;
}
export function readBirth(s: unknown, today: Date = new Date()): Birth | null {
  if (typeof s !== 'string') return null;
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const b: Birth = { year: m[1] ? Number(m[1]) : null, month: Number(m[2]), day: Number(m[3]) };
  return validBirth(b.year, b.month, b.day, today) ? b : null;
}

// 별자리(양력 월·일 기준): 염소 12/22~1/19, 물병 1/20~2/18, 물고기 2/19~3/20, 양 3/21~4/19, 황소 4/20~5/20, 쌍둥이 5/21~6/21,
// 게 6/22~7/22, 사자 7/23~8/22, 처녀 8/23~9/22, 천칭 9/23~10/22, 전갈 10/23~11/22, 사수 11/23~12/21
// ZODIAC 순서는 염소(0) 물병(1) 물고기(2) 양(3) 황소(4) 쌍둥이(5) 게(6) 사자(7) 처녀(8) 천칭(9) 전갈(10) 사수(11)
const STARTS_MD = [120, 219, 321, 420, 521, 622, 723, 823, 923, 1023, 1123];   // 물병부터 사수까지 시작일(월*100+일)
export function zodiacIndex(month: number, day: number): number {
  const md = month * 100 + day;
  if (md >= 1222 || md < 120) return 0;
  return STARTS_MD.filter(s => md >= s).length;
}
export const zodiacOf = (month: number, day: number): Sign => ZODIAC[zodiacIndex(month, day)];

// 띠(양력 연도 기준으로 간단히 계산: 설날 전에 태어난 사람은 전해 띠일 수 있어요)
export const animalIndex = (year: number): number => (((year - 4) % 12) + 12) % 12;
export const animalOf = (year: number): Sign => ANIMALS[animalIndex(year)];

// 오늘이 생일인지(2월 29일생은 평년에 2월 28일에)
export function isBirthday(b: Birth, today: Date): boolean {
  const m = today.getMonth() + 1, d = today.getDate();
  if (b.month === 2 && b.day === 29 && !isLeap(today.getFullYear())) return m === 2 && d === 28;
  return b.month === m && b.day === d;
}

// 생일을 알려 준 뒤 펫이 하는 말: "물병자리에 말띠네요! 오늘 운세 볼까요?"
export function birthGreeting(b: Birth): string {
  const z = zodiacOf(b.month, b.day).name;
  return b.year === null ? `${z}네요! 오늘 운세 볼까요?` : `${z}에 ${animalOf(b.year).name}네요! 오늘 운세 볼까요?`;
}
