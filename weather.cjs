'use strict';
// 날씨 서비스(메인 프로세스 전용): Open-Meteo 공개 예보 API(키 없음)를 부른다. 판단 로직만 담아 단위 테스트한다(fetch·시계를 주입).
//  - 요청에는 위도·경도(소수점 2자리)와 필요한 필드만 담는다. 앱 이름·식별자·사용자 정보는 보내지 않는다.
//  - 동의(켜짐 + 동의)가 없으면 어떤 요청도 보내지 않는다.
//  - 30분 캐시, 같은 좌표의 진행 중인 요청은 하나로 합친다, 실패하면 5분간 다시 부르지 않고 조용히 건너뛴다(마지막 성공 값이 6시간 이내면 그 값을 쓴다).
//  - 전부 비동기라 알람 스케줄러(1초 인터벌)를 막지 않는다.

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS = ['temperature_2m', 'apparent_temperature', 'weather_code'];
const DAILY_FIELDS = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'precipitation_sum'];
const TIMEOUT_MS = 8000;
const CACHE_MS = 30 * 60 * 1000;
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
const FAIL_BACKOFF_MS = 5 * 60 * 1000;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round2 = (v) => Math.round(v * 100) / 100;

// 좌표 검증(한국 도시 앱이지만 범위만 확인): 위도 -90~90, 경도 -180~180
function validCoords(lat, lon) { return isNum(lat) && isNum(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; }
const keyOf = (lat, lon) => `${round2(lat).toFixed(2)},${round2(lon).toFixed(2)}`;

// 요청 주소: 좌표(2자리 반올림)와 필요한 필드, 시간대 자동, 하루 예보만
function buildUrl(lat, lon) {
  const q = new URLSearchParams({
    latitude: round2(lat).toFixed(2),
    longitude: round2(lon).toFixed(2),
    current: CURRENT_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    timezone: 'auto',
    forecast_days: '1',
  });
  return `${BASE_URL}?${decodeURIComponent(q.toString()).replace(/ /g, '+')}`;
}

// 응답 → 앱이 쓰는 값. 모양이 다르면 null
function parseResponse(json) {
  try {
    const c = json && json.current, d = json && json.daily;
    if (!c || !d) return null;
    const out = {
      temp: c.temperature_2m, feels: isNum(c.apparent_temperature) ? c.apparent_temperature : c.temperature_2m, code: c.weather_code,
      max: d.temperature_2m_max && d.temperature_2m_max[0], min: d.temperature_2m_min && d.temperature_2m_min[0],
      pop: d.precipitation_probability_max && d.precipitation_probability_max[0],
      precip: d.precipitation_sum && d.precipitation_sum[0],
    };
    if (!isNum(out.temp) || !isNum(out.code) || !isNum(out.max) || !isNum(out.min)) return null;
    if (!isNum(out.pop)) out.pop = null;
    if (!isNum(out.precip)) out.precip = null;
    return out;
  } catch { return null; }
}

// deps: { fetch, now(): ms, timeoutMs? }
function createWeatherService(deps) {
  const doFetch = deps.fetch, now = deps.now || Date.now, timeoutMs = deps.timeoutMs || TIMEOUT_MS;
  let consent = false;                 // 켜짐 + 동의가 모두 있을 때만 true
  const cache = new Map();             // key → { data, at }  (마지막 성공)
  const inflight = new Map();          // key → Promise
  const failedAt = new Map();          // key → 마지막 실패 시각
  const stats = { requests: 0 };

  async function request(lat, lon) {
    stats.requests++;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error('timeout')); }, timeoutMs); });
    try {
      const res = await Promise.race([doFetch(buildUrl(lat, lon), { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } }), timeout]);
      if (!res || !res.ok) throw new Error(`http ${res && res.status}`);
      const data = parseResponse(await Promise.race([res.json(), timeout]));
      if (!data) throw new Error('bad response');
      return data;
    } finally { clearTimeout(timer); }
  }

  const usable = (e, maxAge) => (e && now() - e.at <= maxAge ? e : null);

  return {
    stats,
    setConsent(v) { consent = v === true; },
    hasConsent() { return consent; },
    // → { data, stale } | null
    async get(lat, lon) {
      if (!consent || !validCoords(lat, lon)) return null;   // 동의 전에는 어떤 요청도 보내지 않는다
      const key = keyOf(lat, lon);
      const fresh = usable(cache.get(key), CACHE_MS);
      if (fresh) return { data: fresh.data, stale: false };
      if (inflight.has(key)) return inflight.get(key);
      const lastFail = failedAt.get(key);
      const fallback = () => { const e = usable(cache.get(key), STALE_MAX_MS); return e ? { data: e.data, stale: true } : null; };
      if (lastFail !== undefined && now() - lastFail < FAIL_BACKOFF_MS) return fallback();
      const p = request(lat, lon).then(
        (data) => { cache.set(key, { data, at: now() }); failedAt.delete(key); return { data, stale: false }; },
        () => { failedAt.set(key, now()); return fallback(); },   // 조용히 건너뛰고, 6시간 이내 값이 있으면 그걸 쓴다
      ).finally(() => { inflight.delete(key); });
      inflight.set(key, p);
      return p;
    },
  };
}

module.exports = { BASE_URL, CURRENT_FIELDS, DAILY_FIELDS, TIMEOUT_MS, CACHE_MS, STALE_MAX_MS, FAIL_BACKOFF_MS, buildUrl, parseResponse, validCoords, createWeatherService };
