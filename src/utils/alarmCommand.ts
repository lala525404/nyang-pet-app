import { addDays, mondayOf, startOfDay, ymd } from './alarmSchedule';
import { WEEK_BASIS, weekOfMonthStart, weeksInMonth } from './weekOfMonth';

// 알람 대화: 한국어 문장 → 알람 명령(만들기·취소·조회). 규칙 기반이고 외부 연결·AI·네트워크가 없다. 순수 함수라 현재 시각(now)을 인자로 받아 시험한다(tests/alarm-command-unit.cjs).
// 입력 문장은 이 모듈이 저장하거나 기록하지 않는다(결과 명령만 돌려준다).

export const MAX_INPUT_CHARS = 200;   // 이보다 긴 입력은 알람 말이 아니라고 본다
export const TITLE_MAX = 20;          // 알람 제목 최대 글자(이모지 1개 = 1글자)

export type AlarmCommand =
  | { kind: 'create'; date: string; time: string; title: string; midnight?: boolean }
  | { kind: 'needsMeridiem'; hour: number; minute: number; title: string }   // "3시"처럼 오전/오후 구분이 없는 1~12시: 짐작하지 않고 되묻는다(hour 1~12). 답은 parseAlarmCommand(원문, now, Meridiem)로 다시 해석
  | { kind: 'cancel'; all: boolean; date: string | null; time: string | null; hour12: number | null; minute: number | null; title: string }   // hour12: 오전/오후 없이 말한 시(0~11, 오전·오후 모두 해당)
  | { kind: 'query'; date: string; week?: { start: string; label: string } }   // week: 주 단위 조회(start = 그 주 월요일 YYYY-MM-DD, label = "이번 주"·"다음 주" 등). 날짜는 그 주 월요일
  | { kind: 'reject'; intent: 'create' | 'cancel' | 'query'; reason: string }
  | { kind: 'unknown' };

export const REASON = {
  noDate: '그런 날짜는 없어요',
  pastDate: '지난 날짜예요',
  pastTime: '이미 지난 시간이에요',
  needTime: '몇 시에 울릴지 알려 주세요',
  badTime: '시간을 다시 확인해 주세요',
  needWeekday: '이번 주·다음 주는 요일도 같이 말해 주세요',
  thisYearOnly: '올해 안의 날짜만 말할 수 있어요',
  pastTimeAsk: '이미 지난 시간이에요. 내일로 하려면 "내일 오전 3시"처럼 날짜를 같이 말해 주세요',
  weekQueryOnly: '주차는 알람 조회에서만 쓸 수 있어요. 날짜나 요일로 말해 주세요',
} as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();   // m: 1~12
const WEEKDAY_CHARS = '일월화수목금토';
const KO_NUM: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const num = (s: string): number => (/^\d+$/.test(s) ? Number(s) : KO_NUM[s] ?? NaN);

// 문장 정리: 보이지 않는 글자·여러 공백 정리. 너무 길면 빈 문자열(= 알 수 없음)
export function normalizeInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.normalize('NFC').replace(/[​-‍﻿]/g, '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).length > MAX_INPUT_CHARS ? '' : t;
}

// ── 날짜 ─────────────────────────────────────────────────────────────────────
type DateHit =
  | { ok: true; date: Date; explicit: boolean; weekdayOnly?: number }
  | { ok: false; reason: string };
interface Extracted<T> { hit: T | null; rest: string }

const BLANK = ' ';
const cut = (text: string, m: RegExpExecArray) => text.slice(0, m.index) + BLANK + text.slice(m.index + m[0].length);

export function extractDate(text: string, now: Date): Extracted<DateHit> {
  const today = startOfDay(now);
  let m: RegExpExecArray | null;
  // N일 뒤/후, N주 뒤/후, 일주일 뒤
  if ((m = /(\d{1,3})\s*일\s*(?:뒤|후)/.exec(text))) return { hit: { ok: true, date: addDays(today, Number(m[1])), explicit: true }, rest: cut(text, m) };
  if ((m = /(?:(\d{1,2})|일|한|두|세|네)\s*주(?:일)?\s*(?:뒤|후)/.exec(text))) { const n = m[1] ? Number(m[1]) : /^일/.test(m[0]) || /^한/.test(m[0]) ? 1 : num(m[0][0]); return { hit: { ok: true, date: addDays(today, 7 * n), explicit: true }, rest: cut(text, m) }; }
  // 오늘·내일·모레
  if ((m = /내일\s*모레|모레|글피/.exec(text))) return { hit: { ok: true, date: addDays(today, m[0].includes('글피') ? 3 : 2), explicit: true }, rest: cut(text, m) };
  if ((m = /내일/.exec(text))) return { hit: { ok: true, date: addDays(today, 1), explicit: true }, rest: cut(text, m) };
  if ((m = /오늘/.exec(text))) return { hit: { ok: true, date: today, explicit: true }, rest: cut(text, m) };
  // N월 N일(연도 없음: 지났으면 다음 해가 아니라 거절)
  if ((m = /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text))) {
    const y = today.getFullYear();
    if (m[1] && Number(m[1]) < y) return { hit: { ok: false, reason: REASON.pastDate }, rest: cut(text, m) };
    if (m[1] && Number(m[1]) > y) return { hit: { ok: false, reason: REASON.thisYearOnly }, rest: cut(text, m) };
    const mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return { hit: { ok: false, reason: REASON.noDate }, rest: cut(text, m) };
    const date = new Date(y, mo - 1, d);
    if (date.getTime() < today.getTime()) return { hit: { ok: false, reason: REASON.pastDate }, rest: cut(text, m) };
    return { hit: { ok: true, date, explicit: true }, rest: cut(text, m) };
  }
  // 이번 주·다음 주 + 요일(주는 월요일 시작)
  if ((m = /(이번\s*주|다음\s*주|담\s*주|금주|차주)\s*([월화수목금토일])(?:\s*요일|\s*욜|(?![가-힣]))/.exec(text))) {   // "다음 주 일정"의 '일'은 요일이 아니다
    const wd = WEEKDAY_CHARS.indexOf(m[2]);
    const start = addDays(mondayOf(today), /^(이번|금주)/.test(m[1]) ? 0 : 7);
    const date = addDays(start, (wd + 6) % 7);
    if (date.getTime() < today.getTime()) return { hit: { ok: false, reason: REASON.pastDate }, rest: cut(text, m) };
    return { hit: { ok: true, date, explicit: true }, rest: cut(text, m) };
  }
  // 그냥 요일: 다음에 오는 그 요일(오늘이 그 요일이면 시각을 보고 정한다)
  if ((m = /([월화수목금토일])\s*(?:요일|욜)/.exec(text))) return { hit: { ok: true, date: today, explicit: true, weekdayOnly: WEEKDAY_CHARS.indexOf(m[1]) }, rest: cut(text, m) };
  // N일(이번 달, 이미 지났으면 다음 달)
  if ((m = /(?<![\d월])(\d{1,2})\s*일(?!\s*(?:간|정|요))/.exec(text))) {
    const d = Number(m[1]), y = today.getFullYear(), mo = today.getMonth() + 1;
    if (d < 1 || d > daysInMonth(y, mo)) return { hit: { ok: false, reason: REASON.noDate }, rest: cut(text, m) };
    if (d >= today.getDate()) return { hit: { ok: true, date: new Date(y, mo - 1, d), explicit: true }, rest: cut(text, m) };
    const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
    if (d > daysInMonth(ny, nm)) return { hit: { ok: false, reason: REASON.noDate }, rest: cut(text, m) };
    return { hit: { ok: true, date: new Date(ny, nm - 1, d), explicit: true }, rest: cut(text, m) };
  }
  return { hit: null, rest: text };
}

// ── 시간 ─────────────────────────────────────────────────────────────────────
type TimeHit =
  | { kind: 'rel'; minutes: number }
  | { kind: 'abs'; hour: number; minute: number; period: '' | 'am' | 'pm' | 'dawn' | 'morning' | 'evening' | 'night' | 'noon' | 'midnight' | 'h24' }
  | { kind: 'bad' };

export function extractTime(text: string): Extracted<TimeHit> {
  let m: RegExpExecArray | null;
  // 상대: N분 뒤, N시간 (N분) 뒤, 한 시간 반 뒤
  if ((m = /(?:((?:\d+|한|두|세|네|다섯|여섯)\s*시간)(\s*반)?)?\s*(?:(\d+)\s*분)?\s*(?:뒤|후)/.exec(text)) && (m[1] || m[3])) {
    const h = m[1] ? num(m[1].replace(/\s*시간/, '').trim()) : 0;
    const min = (m[3] ? Number(m[3]) : 0) + (m[2] ? 30 : 0);
    if (!Number.isFinite(h) || h > 72 || min > 24 * 60) return { hit: { kind: 'bad' }, rest: cut(text, m) };
    return { hit: { kind: 'rel', minutes: h * 60 + min }, rest: cut(text, m) };
  }
  // 24시간 표기 15:30
  if ((m = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/.exec(text))) {
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return { hit: { kind: 'bad' }, rest: cut(text, m) };
    return { hit: { kind: 'abs', hour: h === 24 ? 0 : h, minute: mi, period: h === 24 ? 'midnight' : m[1].length === 1 && h >= 1 ? '' : 'h24' }, rest: cut(text, m) };   // "3:30"(앞자리 0 없는 한 자리)는 24시간 표기가 아니라 구분 없는 3시 30분
  }
  // 오전/오후/아침/저녁/밤/새벽/낮 + N시 (N분|반)
  if ((m = /(오전|오후|아침|저녁|밤|새벽|낮)\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분|\s*반)?/.exec(text))) {
    const h = Number(m[2]), mi = m[3] !== undefined ? Number(m[3]) : /반/.test(m[0].slice(m[0].indexOf('시'))) ? 30 : 0;
    if (h > 12 || mi > 59) return { hit: { kind: 'bad' }, rest: cut(text, m) };
    const period = ({ 오전: 'am', 오후: 'pm', 아침: 'morning', 저녁: 'evening', 밤: 'night', 새벽: 'dawn', 낮: 'pm' } as const)[m[1] as '오전'];
    return { hit: { kind: 'abs', hour: h, minute: mi, period }, rest: cut(text, m) };
  }
  // 정오·자정(+ 시각이 따로 없을 때)
  if ((m = /정오/.exec(text))) return { hit: { kind: 'abs', hour: 12, minute: 0, period: 'noon' }, rest: cut(text, m) };
  if ((m = /자정/.exec(text))) return { hit: { kind: 'abs', hour: 0, minute: 0, period: 'midnight' }, rest: cut(text, m) };
  // N시 (N분|반): 오전/오후 없음
  if ((m = /(?<![\d:])(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분|\s*반)?/.exec(text))) {
    const h = Number(m[1]), mi = m[2] !== undefined ? Number(m[2]) : /반/.test(m[0].slice(m[0].indexOf('시'))) ? 30 : 0;
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return { hit: { kind: 'bad' }, rest: cut(text, m) };
    return { hit: { kind: 'abs', hour: h === 24 ? 0 : h, minute: mi, period: h === 24 ? 'midnight' : h === 0 || h >= 13 ? 'h24' : '' }, rest: cut(text, m) };
  }
  return { hit: null, rest: text };
}

// 시(1~12) + 시간대 말 → 24시간제 시
function hourOf(hour: number, period: string): number {
  if (period === 'am' || period === 'morning') return hour % 12;
  if (period === 'pm' || period === 'evening') return hour === 12 ? 12 : hour + 12;
  if (period === 'dawn') return hour % 12;
  if (period === 'night') return hour === 12 ? 0 : hour >= 6 ? hour + 12 : hour;   // 밤 10시 → 22시, 밤 12시 → 0시, 밤 2시 → 2시
  return hour;
}

// ── 의도 ─────────────────────────────────────────────────────────────────────
const RE_ALARM = /알람|알림|일정|스케줄/;
const RE_CANCEL = /취소|삭제|지워|지우|없애|없앨|빼\s*줘|(?:^|\s)꺼(?:\s*줘|\s*주|\s*봐|라|요)?[.!?]*(?=\s|$)|끄기|끌게|꺼\s*주세요/;
const RE_CREATE_STRONG = /만들|추가|설정|맞춰|맞추|등록|잡아|깨워|울려/;
const RE_CREATE_WEAK = /해\s*줘|해줘|해\s*주세요|부탁/;
const RE_QUERY = /뭐\s*있|뭐가\s*있|있어|있나|있니|알려\s*줘|알려\s*주세요|보여\s*줘|보여\s*주세요|조회|목록|확인|몇\s*개|언제/;
const RE_ALL = /(?:다|전부|모두|전체|싹)\s*(?:꺼|지워|삭제|취소|없애|끄)|(?:모든|전부|전체)\s*알람/;

// 알람 말에서 제목이 아닌 말(동사·조사·군말)을 걷어 낸다
const NOISE: RegExp[] = [
  /알람|알림|일정|스케줄/g,
  /만들어\s*(?:줘|주세요|봐)?|만들|추가해\s*(?:줘|주세요)?|추가|설정해\s*(?:줘|주세요)?|설정|맞춰\s*(?:줘|주세요)?|맞추|등록해\s*(?:줘|주세요)?|등록|잡아\s*(?:줘|주세요)?|잡아|깨워\s*(?:줘|주세요)?|깨워|울려\s*(?:줘|주세요)?|울려/g,
  /취소해\s*(?:줘|주세요)?|취소|삭제해\s*(?:줘|주세요)?|삭제|지워\s*(?:줘|주세요)?|지워|지우|없애\s*(?:줘|주세요)?|없애|꺼\s*(?:줘|주세요)?|끄기/g,
  /알려\s*(?:줘|주세요)?|보여\s*(?:줘|주세요)?|해\s*줘|해줘|해\s*주세요|부탁(?:해|드려요|할게)?/g,
  /(?:^|\s)(?:좀|제발|한번|한 번|그냥|다|전부|모두|전체|싹)(?=\s|$)/g,
  /뭐\s*(?:가\s*)?있(?:어|나|니)?|있어|있나|조회|목록|확인/g,
  /(?:^|\s)(?:에|에는|으로|로|을|를|이|가|은|는|도|까지|부터|의|에서)(?=\s|$)/g,
];
export function extractTitle(text: string): string {
  const quoted = /["“”'‘’「」『』]([^"“”'‘’「」『』]{1,40})["“”'‘’「」『』]/.exec(text);
  let t: string;
  if (quoted) t = quoted[1];
  else { t = text; for (const re of NOISE) t = t.replace(re, BLANK); t = t.replace(/[.!?,~]+/g, BLANK).replace(/\s+/g, ' ').trim(); t = t.replace(/(?:에|을|를|로|으로)$/, '').trim(); }
  t = t.replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, TITLE_MAX).join('').trim();
}

// 주 표현(요일 없음): 이번 주·금주·주간 → 오늘이 든 주, 다음 주·차주·담주 → 다음 주. 주는 월요일 시작~일요일 끝. "주말"은 제외
const RE_WEEK_WORD = /(이번\s*주|다음\s*주|담\s*주|금주|차주|(?:^|\s)주간)(?!말)/;
export function matchWeekWord(text: string, now: Date): { start: string; label: string } | null {
  const m = RE_WEEK_WORD.exec(text); if (!m) return null;
  const this_ = /이번|금주|주간/.test(m[1]);
  const start = addDays(mondayOf(startOfDay(now)), this_ ? 0 : 7);
  return { start: ymd(start), label: this_ ? '이번 주' : '다음 주' };
}

// "N월 N주차" 표현(조회 전용): 11월 2주차 · 11월 둘째 주 · 이번 달 2주차 · 2주차(이번 달) · 11월 마지막 주 · 11월 2주차 화요일(그 하루)
// 숫자는 "주차"가 붙어야 주차로 본다("2주 뒤"와 구분). 계산 기준은 weekOfMonth.ts의 WEEK_BASIS 한 곳.
const WOM_ORDINAL: Record<string, number> = { 첫째: 1, 첫: 1, 둘째: 2, 셋째: 3, 넷째: 4, 다섯째: 5, 마지막: -1 };
const RE_WOM = /(?:(\d{4})\s*년\s*)?(?:(\d{1,2})\s*월\s*|(이번\s*달|이달|금월|다음\s*달|담달)\s*)?(?:(\d{1,2})\s*주\s*차|(첫째|첫|둘째|셋째|넷째|다섯째|마지막)\s*주(?:\s*차)?(?!말))/;
export type WeekOfMonthHit = { kind: 'query'; date: string; week?: { start: string; label: string } } | { kind: 'reject'; intent: 'query'; reason: string };
export function matchWeekOfMonth(text: string, now: Date): WeekOfMonthHit | null {
  const m = RE_WOM.exec(text); if (!m) return null;
  const rej = (reason: string): WeekOfMonthHit => ({ kind: 'reject', intent: 'query', reason });
  const thisYear = now.getFullYear();
  let year = thisYear, month = now.getMonth() + 1;
  if (m[3]) { if (/^(다음|담)/.test(m[3])) { month += 1; if (month > 12) { month = 1; year += 1; } } }
  else if (m[2]) month = Number(m[2]);
  if (m[1] && Number(m[1]) !== thisYear) return rej(Number(m[1]) < thisYear ? REASON.pastDate : REASON.thisYearOnly);
  if (year !== thisYear) return rej(REASON.thisYearOnly);
  if (month < 1 || month > 12) return rej(REASON.noDate);
  const count = weeksInMonth(year, month);
  const n = m[4] ? Number(m[4]) : WOM_ORDINAL[m[5]] === -1 ? count : WOM_ORDINAL[m[5]];
  const start = weekOfMonthStart(year, month, n);
  if (!start) return rej(`${month}월은 ${count}주차까지 있어요`);
  // 뒤에 요일이 붙으면 그 하루만("11월 2주차 화요일")
  const after = text.slice(m.index + m[0].length), w = /^\s*([월화수목금토일])(?:\s*요일|\s*욜|(?![가-힣]))/.exec(after);
  if (w) return { kind: 'query', date: ymd(addDays(start, (WEEKDAY_CHARS.indexOf(w[1]) - WEEK_BASIS.weekStartsOn + 7) % 7)) };
  return { kind: 'query', date: ymd(start), week: { start: ymd(start), label: `${month}월 ${n}주차` } };
}

// ── 해석 ─────────────────────────────────────────────────────────────────────
const reject = (intent: 'create' | 'cancel' | 'query', reason: string): AlarmCommand => ({ kind: 'reject', intent, reason });
const at = (date: Date, h: number, mi: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi, 0, 0);
const hhmm = (h: number, mi: number) => `${pad2(h)}:${pad2(mi)}`;

// 되묻기의 답: 'am' 오전, 'pm' 오후(12시는 정오), 'night' 밤(12시는 자정=그날 밤 12시)
export type Meridiem = 'am' | 'pm' | 'night';
export function parseAlarmCommand(raw: unknown, now: Date, meridiem?: Meridiem): AlarmCommand {
  const text = normalizeInput(raw);
  if (!text) return { kind: 'unknown' };
  const alarmWord = RE_ALARM.test(text);
  const cancel = RE_CANCEL.test(text), createStrong = RE_CREATE_STRONG.test(text), createWeak = RE_CREATE_WEAK.test(text), queryWord = RE_QUERY.test(text);
  // 날짜·시간 말이 있는지(의도 판별용): 실제 해석은 아래에서
  const hasTimeWord = extractTime(text).hit !== null;
  let intent: 'create' | 'cancel' | 'query' | null = null;
  if (cancel && alarmWord) intent = 'cancel';
  else if ((createStrong || createWeak) && alarmWord) intent = 'create';
  else if (createStrong && hasTimeWord) intent = 'create';
  else if (alarmWord && (queryWord || !hasTimeWord)) intent = 'query';
  else if (alarmWord && hasTimeWord) intent = 'create';
  // 알람이라는 말 없이 "이번 달 2주차"·"11월 둘째 주"만 말해도 조회로 본다(월·달이 같이 있을 때만: 숫자만 있는 "2주차"는 알람 말이 있어야 한다)
  if (!intent && !cancel && !createStrong && !createWeak && /(?:월|달)\s*(?:\d{1,2}\s*주\s*차|(?:첫째|첫|둘째|셋째|넷째|다섯째|마지막)\s*주)/.test(text)) intent = 'query';
  if (!intent) return { kind: 'unknown' };

  // "N월 N주차"는 조회만 한다(만들기·지우기는 날짜나 요일로)
  const wom = matchWeekOfMonth(text, now);
  if (wom) return intent === 'query' ? wom : reject(intent, REASON.weekQueryOnly);

  const d = extractDate(text, now);
  const t = extractTime(d.rest);
  if (d.hit && !d.hit.ok) return reject(intent, d.hit.reason);
  // 주만 말한 경우(요일 없음): 조회는 그 주 전체, 만들기·삭제는 어느 날인지 모르니 요일을 요구한다
  const weekWord = d.hit ? null : matchWeekWord(d.rest, now);
  if (weekWord && intent !== 'query') return reject(intent, REASON.needWeekday);
  if (t.hit && t.hit.kind === 'bad') return reject(intent, REASON.badTime);
  const dateHit = d.hit && d.hit.ok ? d.hit : null;
  const rest = t.rest;

  if (intent === 'query') {
    if (weekWord) return { kind: 'query', date: weekWord.start, week: weekWord };
    let date = dateHit ? dateHit.date : startOfDay(now);
    if (dateHit && dateHit.weekdayOnly !== undefined) { const diff = (dateHit.weekdayOnly - now.getDay() + 7) % 7; date = addDays(startOfDay(now), diff); }
    return { kind: 'query', date: ymd(date) };
  }

  // 시각 계산
  const nowMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);
  const todayStart = startOfDay(now);

  if (intent === 'cancel') {
    const all = RE_ALL.test(text);
    let date: string | null = dateHit ? ymd(dateHit.date) : null;
    let time: string | null = null, hour12: number | null = null, minute: number | null = null;
    if (dateHit && dateHit.weekdayOnly !== undefined) date = ymd(addDays(todayStart, (dateHit.weekdayOnly - now.getDay() + 7) % 7));
    if (t.hit && t.hit.kind === 'rel') { const dt = new Date(nowMin.getTime() + t.hit.minutes * 60000); date = ymd(dt); time = hhmm(dt.getHours(), dt.getMinutes()); }
    else if (t.hit && t.hit.kind === 'abs') {
      if (t.hit.period === '') { hour12 = t.hit.hour % 12; minute = t.hit.minute; }
      else { const h = t.hit.period === 'noon' ? 12 : t.hit.period === 'midnight' ? 0 : t.hit.period === 'h24' ? t.hit.hour : hourOf(t.hit.hour, t.hit.period); time = hhmm(h, t.hit.minute); }
    }
    return { kind: 'cancel', all, date, time, hour12, minute, title: extractTitle(/["“”'‘’「」『』]/.test(text) ? text : rest) };
  }

  // 만들기
  if (!t.hit) return reject('create', REASON.needTime);
  const title = extractTitle(/["“”'‘’「」『』]/.test(text) ? text : rest);
  if (t.hit.kind === 'rel') {
    const dt = new Date(nowMin.getTime() + t.hit.minutes * 60000);
    if (t.hit.minutes <= 0) return reject('create', REASON.badTime);
    return { kind: 'create', date: ymd(dt), time: hhmm(dt.getHours(), dt.getMinutes()), title };
  }
  // 오전/오후 구분도 24시간 표기도 아닌 1~12시("3시", "3시 30분", "12시")는 짐작하지 않고 되묻는다. 답(meridiem)을 받으면 그 시각으로 다시 해석한다.
  let h = t.hit;
  if (h.period === '') {
    if (!meridiem) return { kind: 'needsMeridiem', hour: h.hour, minute: h.minute, title };
    h = { ...h, period: meridiem };
  }
  let date = dateHit ? dateHit.date : todayStart;
  const explicit = !!dateHit;
  const hour = h.period === 'noon' ? 12 : h.period === 'midnight' ? 0 : h.period === 'h24' ? h.hour : hourOf(h.hour, h.period);
  // 이미 지난 시각: 날짜를 말했거나 되물은 뒤 고른 시각이면 거절(되물은 답을 임의로 내일로 바꾸지 않는다), 날짜 없이 처음부터 구분을 말한 시각은 내일로
  const passed = (): AlarmCommand | null => (meridiem && !explicit ? reject('create', REASON.pastTimeAsk) : explicit ? reject('create', REASON.pastTime) : null);

  if (dateHit && dateHit.weekdayOnly !== undefined) {   // 그냥 요일: 다음에 오는 그 요일
    const diff = (dateHit.weekdayOnly - now.getDay() + 7) % 7;
    let day = addDays(todayStart, diff);
    if (diff === 0 && at(day, hour, h.minute).getTime() <= nowMin.getTime()) day = addDays(day, 7);
    return { kind: 'create', date: ymd(day), time: hhmm(hour, h.minute), title };
  }

  // 자정·24시·"밤 12시"는 그날 밤의 끝이다: "내일 자정"은 내일 밤 12시 = 모레 0시(카드에 그 사실을 함께 적는다)
  let midnight = false;
  if (h.period === 'midnight' || (h.period === 'night' && h.hour === 12)) { midnight = true; date = addDays(date, 1); }
  let dt = at(date, hour, h.minute);
  if (dt.getTime() <= nowMin.getTime()) {
    const rj = passed(); if (rj) return rj;
    date = addDays(date, 1); dt = at(date, hour, h.minute);   // 날짜가 없으면 내일 그 시각
  }
  return { kind: 'create', date: ymd(date), time: hhmm(hour, h.minute), title, ...(midnight ? { midnight: true } : {}) };
}
