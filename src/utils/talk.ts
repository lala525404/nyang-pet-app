import { searchPlaces } from './citySearch';
import type { PlaceHit } from './citySearch';
import { birthGreeting, formatBirth, readBirth, validBirth } from './zodiac';
import type { Birth } from './zodiac';
import { BUBBLE_KINDS, cleanOffKinds } from './settings';
import type { BubbleKind, PetSettings } from './settings';
import { cityById } from '../data/cities';

// "펫에게 말 걸기": 입력한 말을 단어 규칙으로 해석한다(외부 AI·네트워크 호출 없음, 대화 기록은 어디에도 저장하지 않는다).
// 판단은 전부 이 파일의 순수 함수라서 단위 테스트된다. 화면(PetTalk)은 결과 단계(TalkStep)를 그리기만 한다.

export const KIND_NAME: Record<BubbleKind, string> = { clock: '시계', phrase: '한마디', progress: '하루 진행', fortune: '운세', weather: '날씨' };

export const GREETING = '뭐 해줄까요?';
export const CONSENT_TEXT = '날씨를 알려드리려면 동네를 알려줘야 해요. 고른 동네의 대략적인 좌표가 날씨 서비스(Open-Meteo)로 전송돼요. 이름·사진·알람 같은 정보는 보내지 않아요. 괜찮아요?';
export const CONSENT_DETAIL = '날씨를 켜면 선택한 도시의 대략적인 좌표가 날씨 서비스(Open-Meteo)로 전송돼요. 이름·사진·알람 같은 개인 정보는 보내지 않아요.';
export const CREDIT = '날씨 데이터: Open-Meteo (CC BY 4.0)';
export const UNKNOWN_TEXT = '그건 아직 잘 몰라요. 날씨, 운세, 한마디는 알려줄 수 있어요';
export const NOT_FOUND_TEXT = '못 찾았어요, 다른 이름으로 알려줄래요?';
export const BIRTH_RETRY_TEXT = '다시 알려줄래요? 예: 5월 25일, 1990-05-25, 0525';

// ── 생일 문장 해석 ──────────────────────────────────────────────────────────
export type BirthResult = { ok: true; birth: Birth } | { ok: false };

// "1990-05-25" "1990.5.25" "1990년 5월 25일" "19900525" "5월 25일" "5/25" "0525" 를 알아듣는다. 날짜처럼 보이지 않으면 null.
export function parseBirthText(text: string, today: Date = new Date()): BirthResult | null {
  const t = text.replace(/내\s*생일(은|이)?|생일(은|이)?|이야|이에요|예요|입니다|야$/g, ' ').trim();
  const mk = (y: number | null, m: number, d: number): BirthResult => (validBirth(y, m, d, today) ? { ok: true, birth: { year: y, month: m, day: d } } : { ok: false });
  let m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/.exec(t);
  if (m) return mk(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^\s*(\d{4})(\d{2})(\d{2})\s*$/.exec(t);
  if (m) return mk(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /(\d{1,2})\s*월\s*(\d{1,2})\s*일?/.exec(t);
  if (m) return mk(null, Number(m[1]), Number(m[2]));
  m = /^\s*(\d{2})(\d{2})\s*$/.exec(t);
  if (m) return mk(null, Number(m[1]), Number(m[2]));
  m = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$/.exec(t);
  if (m) return mk(null, Number(m[1]), Number(m[2]));
  if (/\d/.test(t) && /^[\d\s\-./년월일]+$/.test(t)) return { ok: false };   // 숫자만 있는데 날짜로 읽히지 않는 경우
  return null;
}

// ── 말 해석 ─────────────────────────────────────────────────────────────────
export type ShowKind = 'weather' | 'fortune' | 'phrase';
export type TalkIntent =
  | { type: 'show'; what: ShowKind }
  | { type: 'city'; query: string; thenWeather: boolean }
  | { type: 'birth'; result: BirthResult }
  | { type: 'askBirth' }
  | { type: 'weatherOff' }
  | { type: 'off'; what: BubbleKind }
  | { type: 'on'; what: BubbleKind }
  | { type: 'clearBirth' }
  | { type: 'clearAll' }
  | { type: 'unknown' };

const KIND_WORDS: [BubbleKind, RegExp][] = [
  ['weather', /날씨|기온/], ['fortune', /운세|오늘의\s*운|점\s*봐/], ['phrase', /한\s*마디|응원|힘\s*나는\s*말/], ['progress', /하루\s*진행|진행\s*바|진행바/], ['clock', /시계/],
];
const kindIn = (t: string): BubbleKind | null => { for (const [k, re] of KIND_WORDS) if (re.test(t)) return k; return null; };
const OFF_RE = /꺼\s*줘|꺼\s*주|꺼줄|꺼\s*$|끄|빼\s*줘|빼\s*줄|빼\s*$|빼고|그만|보여\s*주지\s*마|보지\s*않|안\s*볼래|없애|숨겨|중지|멈춰|싫어/;
const ON_RE = /다시|켜\s*줘|켜\s*주|켜\s*$|켜줄|넣어|추가|돌려\s*줘/;
const STOP_PLACE = new Set(['오늘', '지금', '현재', '내일', '이번', '요즘', '우리', '여기', '이', '그', '동네', '우리동네', '내', '오늘의', '이번주', '주말']);

export function parseTalk(raw: string, today: Date = new Date()): TalkIntent {
  const t = raw.replace(/[?!.,~…]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { type: 'unknown' };

  // 지우기: "내 정보 지워줘", "기억한 것 지워", "생일 지워줘"
  if (/(지워|삭제|잊어|없애)/.test(t)) {
    if (/생일/.test(t)) return { type: 'clearBirth' };
    if (/(내\s*정보|기억|전부|모두|다\s*지워|동네|도시|개인)/.test(t)) return { type: 'clearAll' };
  }

  // 생일: "내 생일은 5월 25일", "생일 알려줄게"
  if (/생일/.test(t)) {
    const r = parseBirthText(t, today);
    return r ? { type: 'birth', result: r } : { type: 'askBirth' };
  }

  // 켜고 빼기: "날씨 꺼줘", "운세 그만 보여줘", "한마디 빼줘", "날씨 다시 넣어줘"
  const k = kindIn(t);
  if (k && OFF_RE.test(t)) return k === 'weather' && !/빼/.test(t) ? { type: 'weatherOff' } : { type: 'off', what: k };
  if (k && ON_RE.test(t)) return { type: 'on', what: k };

  // 동네: "의정부로 바꿔줘", "동네 바꿔줘", "내 동네는 노량진", "의정부 날씨"
  let m = /^(.+?)\s*(?:으로|로)\s*(?:바꿔|바꾸|변경|설정|해\s*줘|해줘|옮겨|정해|맞춰|지정)/.exec(t);
  if (m) return { type: 'city', query: cleanPlace(m[1]), thenWeather: false };
  if (/(동네|도시|지역|위치)\s*(?:를|을)?\s*(바꿔|바꾸|변경|바꿀|다시)/.test(t) && !kindIn(t)) return { type: 'city', query: '', thenWeather: false };
  m = /^(?:내\s*)?(?:동네|도시|지역|위치)\s*(?:는|은|가|이)?\s*(.+?)\s*(?:이야|야|예요|에요|이에요|입니다|이다|라고\s*해)?$/.exec(t);
  if (m && !/바꿔|바꾸/.test(t)) return { type: 'city', query: cleanPlace(m[1]), thenWeather: true };
  m = /^(.+?)\s*(?:의|에서의)?\s*날씨/.exec(t);
  if (m) {
    const place = cleanPlace(m[1]);
    if (place && !STOP_PLACE.has(place.replace(/\s/g, '')) && searchPlaces(place, 1).length > 0) return { type: 'city', query: place, thenWeather: true };
    return { type: 'show', what: 'weather' };
  }

  if (/날씨|기온|우산|비\s*와|몇\s*도|추워|더워/.test(t)) return { type: 'show', what: 'weather' };
  if (/운세|오늘의\s*운|점\s*봐|행운/.test(t)) return { type: 'show', what: 'fortune' };
  if (/한\s*마디|응원|힘\s*나는|힘이\s*나|위로/.test(t)) return { type: 'show', what: 'phrase' };

  // 날짜만 쓴 입력("0525")도 생일로 본다
  const only = parseBirthText(t, today);
  if (only && /^[\d\s\-./년월일]+$/.test(t)) return { type: 'birth', result: only };
  return { type: 'unknown' };
}

// "의정부로" 앞뒤의 군더더기("내 동네는", "으로", "도시를")를 떼고 지명만 남긴다
function cleanPlace(s: string): string {
  return s.replace(/^(?:내\s*)?(?:동네|도시|지역|위치)\s*(?:는|은|를|을|가|이)?\s*/, '').replace(/(?:으로|로|이야|야|예요|에요|이에요)$/, '').trim();
}

// ── 해석 결과를 화면 단계로 ─────────────────────────────────────────────────
export type SettingsPatch = Partial<Pick<PetSettings, 'weatherEnabled' | 'weatherConsent' | 'weatherCityId' | 'fortuneBirth' | 'bubbleOffKinds'>>;
export interface TalkCtx { weatherEnabled: boolean; weatherConsent: boolean; weatherCityId: string; fortuneBirth: string; offKinds: BubbleKind[]; today: Date }
export type TalkStep =
  | { type: 'say'; text: string; patch?: SettingsPatch; then?: ShowKind }       // 말풍선으로 말하고 창을 닫는다(then이 있으면 잠시 뒤 이어서 보여 준다)
  | { type: 'show'; what: ShowKind }
  | { type: 'ask'; ask: 'city' | 'birth'; text: string; thenWeather?: boolean }
  | { type: 'consent'; pendingCityId?: string }                                  // 동의 대화: [괜찮아요] [싫어요] [자세히]
  | { type: 'pick'; text: string; hits: PlaceHit[] }                             // 후보가 여러 개이면 버튼으로 고른다
  | { type: 'confirm'; text: string; yes: SettingsPatch; yesText: string };      // 확인 한 번

const weatherOn = (c: TalkCtx) => c.weatherEnabled && c.weatherConsent;
// 조사: 받침이 있으면 "이군요", 없으면 "군요"
const hasBatchim = (s: string) => { const ch = s.charCodeAt(s.length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0; };
const topic = (s: string) => (hasBatchim(s) ? '은' : '는');
const gun = (name: string) => { const ch = name.charCodeAt(name.length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0 ? '이군요' : '군요'; };

// 도시를 정했을 때: 동의가 없으면 동의부터, 있으면 저장하고 "○○군요! 날씨 알려드릴게요" 다음 현재 날씨
export function applyCity(cityId: string, ctx: TalkCtx): TalkStep {
  const city = cityById(cityId);
  if (!city) return { type: 'ask', ask: 'city', text: NOT_FOUND_TEXT };
  if (!ctx.weatherConsent) return { type: 'consent', pendingCityId: cityId };
  return { type: 'say', text: `${city.name}${gun(city.name)}! 날씨 알려드릴게요`, patch: { weatherEnabled: true, weatherCityId: cityId }, then: 'weather' };
}

// 동의 대화에서 [괜찮아요]를 눌렀을 때(이때만 켜짐·동의가 저장된다)
export function afterConsent(pendingCityId: string | undefined, ctx: TalkCtx): TalkStep {
  const city = cityById(pendingCityId);
  if (city) return { type: 'say', text: `${city.name}${gun(city.name)}! 날씨 알려드릴게요`, patch: { weatherConsent: true, weatherEnabled: true, weatherCityId: city.id }, then: 'weather' };
  const hasCity = !!cityById(ctx.weatherCityId);
  if (hasCity) return { type: 'say', text: '날씨 알려드릴게요', patch: { weatherConsent: true, weatherEnabled: true }, then: 'weather' };
  return { type: 'ask', ask: 'city', text: '어느 동네에 있어요?', thenWeather: true };   // 동의는 [괜찮아요]에서 저장한다(호출한 쪽이 patch를 적용)
}
export const CONSENT_PATCH: SettingsPatch = { weatherConsent: true, weatherEnabled: true };

// 날씨 보여 주기 요청: 동의·동네가 없으면 먼저 그쪽으로
export function stepForWeather(ctx: TalkCtx): TalkStep {
  if (!ctx.weatherConsent) return { type: 'consent' };
  if (!cityById(ctx.weatherCityId)) return { type: 'ask', ask: 'city', text: '어느 동네에 있어요?', thenWeather: true };
  if (!ctx.weatherEnabled) return { type: 'say', text: '날씨 다시 켤게요', patch: { weatherEnabled: true }, then: 'weather' };   // 끄기만 했던 경우(동의·동네는 그대로)
  return { type: 'show', what: 'weather' };
}

export function interpret(text: string, ctx: TalkCtx): TalkStep {
  const it = parseTalk(text, ctx.today);
  switch (it.type) {
    case 'show': return it.what === 'weather' ? stepForWeather(ctx) : { type: 'show', what: it.what };
    case 'city': {
      if (!it.query) return { type: 'ask', ask: 'city', text: '어느 동네에 있어요?', thenWeather: true };
      return cityStep(it.query, ctx);
    }
    case 'askBirth': return { type: 'ask', ask: 'birth', text: '생일을 알려줄래요? 예: 5월 25일, 1990-05-25' };
    case 'birth': return birthStep(it.result, ctx);
    case 'clearBirth':
      return ctx.fortuneBirth ? { type: 'say', text: '생일을 지웠어요', patch: { fortuneBirth: '' } } : { type: 'say', text: '저장된 생일이 없어요' };
    case 'clearAll':
      return { type: 'confirm', text: '기억한 동네·생일을 지우고 날씨 동의도 거둘까요? 날씨는 꺼져요.', yes: { weatherEnabled: false, weatherConsent: false, weatherCityId: '', fortuneBirth: '' }, yesText: '다 지웠어요. 필요하면 또 말해 줘요' };
    case 'weatherOff':
      if (!weatherOn(ctx)) return { type: 'say', text: '날씨는 이미 꺼져 있어요' };
      return { type: 'confirm', text: '날씨를 끄고 동네도 지울까요?', yes: { weatherEnabled: false, weatherCityId: '' }, yesText: '날씨를 끄고 동네도 지웠어요' };
    case 'off': {
      if (ctx.offKinds.includes(it.what)) return { type: 'say', text: `${KIND_NAME[it.what]}${topic(KIND_NAME[it.what])} 이미 빼 두었어요` };
      return { type: 'say', text: `${KIND_NAME[it.what]} 빼 둘게요`, patch: { bubbleOffKinds: cleanOffKinds([...ctx.offKinds, it.what]) } };
    }
    case 'on': {
      if (it.what === 'weather' && !weatherOn(ctx)) return stepForWeather(ctx);   // 날씨가 꺼져 있으면 켜는 대화로
      const rest = ctx.offKinds.filter(k => k !== it.what);
      if (rest.length === ctx.offKinds.length) return { type: 'say', text: `${KIND_NAME[it.what]}${topic(KIND_NAME[it.what])} 원래 나오고 있어요` };
      return { type: 'say', text: `${KIND_NAME[it.what]} 다시 넣어 둘게요`, patch: { bubbleOffKinds: rest } };
    }
    default: return { type: 'say', text: UNKNOWN_TEXT };
  }
}

// 지명으로 동네 정하기: 같은 시·군·구로 모이면 바로 정하고, 여러 곳이면 버튼으로 고르게 한다
export function cityStep(query: string, ctx: TalkCtx): TalkStep {
  const hits = searchPlaces(query);
  if (hits.length === 0) return { type: 'ask', ask: 'city', text: NOT_FOUND_TEXT };
  const ids = new Set(hits.map(h => h.city.id));
  if (ids.size === 1) return applyCity(hits[0].city.id, ctx);
  return { type: 'pick', text: '어느 동네예요?', hits };
}

export function birthStep(r: BirthResult, ctx: TalkCtx): TalkStep {
  if (!r.ok) return { type: 'ask', ask: 'birth', text: BIRTH_RETRY_TEXT };
  return { type: 'say', text: birthGreeting(r.birth), patch: { fortuneBirth: formatBirth(r.birth) }, then: 'fortune' };
}

// 말 걸기 창 아래 "기억한 것" 한 줄(생일 날짜는 보여주지 않는다)
export function memoryLine(ctx: Pick<TalkCtx, 'weatherCityId' | 'fortuneBirth' | 'today'>): string {
  const city = cityById(ctx.weatherCityId);
  return `기억한 것: 동네 ${city ? `${city.name}` : '없음'} · 생일 ${readBirth(ctx.fortuneBirth, ctx.today) ? '입력함' : '없음'}`;
}

export const isKind = (v: string): v is BubbleKind => (BUBBLE_KINDS as readonly string[]).includes(v);
