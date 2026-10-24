import { addDays, mondayOf, startOfDay, ymd } from './alarmSchedule';

// 알람 대화: 한국어 문장 → 알람 명령(만들기·취소·조회). 규칙 기반이고 외부 연결·AI·네트워크가 없다. 순수 함수라 현재 시각(now)을 인자로 받아 시험한다(tests/alarm-command-unit.cjs).
// 입력 문장은 이 모듈이 저장하거나 기록하지 않는다(결과 명령만 돌려준다).

export const MAX_INPUT_CHARS = 200;   // 이보다 긴 입력은 알람 말이 아니라고 본다
export const TITLE_MAX = 20;          // 알람 제목 최대 글자(이모지 1개 = 1글자)

export type AlarmCommand =
  | { kind: 'create'; date: string; time: string; title: string; ambiguous: boolean; midnight?: boolean }   // ambiguous: 오전/오후를 말하지 않아 추정한 시각
  | { kind: 'cancel'; all: boolean; date: string | null; time: string | null; hour12: number | null; minute: number | null; title: string }   // hour12: 오전/오후 없이 말한 시(0~11, 오전·오후 모두 해당)
  | { kind: 'query'; date: string }
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
  if ((m = /(이번|다음|담)\s*주\s*([월화수목금토일])(?:\s*요일|\s*욜|(?![가-힣]))/.exec(text))) {   // "다음 주 일정"의 '일'은 요일이 아니다
    const wd = WEEKDAY_CHARS.indexOf(m[2]);
    const start = addDays(mondayOf(today), m[1] === '이번' ? 0 : 7);
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
    return { hit: { kind: 'abs', hour: h === 24 ? 0 : h, minute: mi, period: h === 24 ? 'midnight' : 'h24' }, rest: cut(text, m) };
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

// ── 해석 ─────────────────────────────────────────────────────────────────────
const reject = (intent: 'create' | 'cancel' | 'query', reason: string): AlarmCommand => ({ kind: 'reject', intent, reason });
const at = (date: Date, h: number, mi: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi, 0, 0);
const hhmm = (h: number, mi: number) => `${pad2(h)}:${pad2(mi)}`;

export function parseAlarmCommand(raw: unknown, now: Date): AlarmCommand {
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
  if (!intent) return { kind: 'unknown' };

  const d = extractDate(text, now);
  const t = extractTime(d.rest);
  if (d.hit && !d.hit.ok) return reject(intent, d.hit.reason);
  if (!d.hit && /(?:이번|다음|담)\s*주(?!말)/.test(d.rest)) return reject(intent, REASON.needWeekday);   // "다음 주"만 말하면 어느 날인지 모른다
  if (t.hit && t.hit.kind === 'bad') return reject(intent, REASON.badTime);
  const dateHit = d.hit && d.hit.ok ? d.hit : null;
  const rest = t.rest;

  if (intent === 'query') {
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
    return { kind: 'create', date: ymd(dt), time: hhmm(dt.getHours(), dt.getMinutes()), title, ambiguous: false };
  }
  const h = t.hit;
  let date = dateHit ? dateHit.date : todayStart;
  const explicit = !!dateHit;
  const isToday = (x: Date) => x.getTime() === todayStart.getTime();
  const resolve = (day: Date): { hour: number; ambiguous: boolean } | null => {
    if (h.period === 'noon') return { hour: 12, ambiguous: false };
    if (h.period === 'midnight') return { hour: 0, ambiguous: false };
    if (h.period === 'h24') return { hour: h.hour, ambiguous: false };
    if (h.period !== '') return { hour: hourOf(h.hour, h.period), ambiguous: false };
    // 오전/오후 없음: 오늘이면 지금 기준 가장 가까운 미래, 다른 날이면 알람에 흔한 쪽(1~5시 오후, 6~11시 오전, 12시 정오)
    if (h.hour < 1 || h.hour > 12) return { hour: h.hour, ambiguous: false };
    const am = h.hour % 12, pm = am + 12;
    if (isToday(day)) {
      const cands = [am, pm].filter(x => at(day, x, h.minute).getTime() > nowMin.getTime());
      if (cands.length) return { hour: Math.min(...cands), ambiguous: true };
      return null;   // 오늘은 둘 다 지났다
    }
    return { hour: h.hour === 12 ? 12 : h.hour <= 5 ? pm : am, ambiguous: true };
  };

  if (dateHit && dateHit.weekdayOnly !== undefined) {   // 그냥 요일: 다음에 오는 그 요일
    const diff = (dateHit.weekdayOnly - now.getDay() + 7) % 7;
    let day = addDays(todayStart, diff);
    let r = resolve(day);
    if (diff === 0 && (!r || at(day, r.hour, h.minute).getTime() <= nowMin.getTime())) { day = addDays(day, 7); r = resolve(day); }
    if (!r) return reject('create', REASON.pastTime);
    return { kind: 'create', date: ymd(day), time: hhmm(r.hour, h.minute), title, ambiguous: r.ambiguous };
  }

  // 자정·24시·"밤 12시"는 그날 밤의 끝이다: "내일 자정"은 내일 밤 12시 = 모레 0시(카드에 그 사실을 함께 적는다)
  let midnight = false;
  if (h.period === 'midnight' || (h.period === 'night' && h.hour === 12)) { midnight = true; date = addDays(date, 1); }
  let r = resolve(date);
  if (!r) {   // 오늘 "N시"가 둘 다 지났다
    if (explicit) return reject('create', REASON.pastTime);
    date = addDays(date, 1); r = resolve(date);
    if (!r) return reject('create', REASON.badTime);
  }
  let dt = at(date, r.hour, h.minute);
  if (dt.getTime() <= nowMin.getTime()) {
    if (explicit) return reject('create', REASON.pastTime);   // 날짜를 말했는데 이미 지난 시간
    date = addDays(date, 1); dt = at(date, r.hour, h.minute);   // 날짜가 없으면 내일 그 시각
  }
  return { kind: 'create', date: ymd(date), time: hhmm(r.hour, h.minute), title, ambiguous: r.ambiguous, ...(midnight ? { midnight: true } : {}) };
}
