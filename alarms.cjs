// 알람 스케줄의 순수 로직. 메인 프로세스(main.cjs)가 이 모듈로 알람 설정을 직접 들고 있고 디스크에 저장·복원한다.
// 설정창·펫 창의 IPC가 늦거나 빠져도, 앱이 시작되면 저장된 설정으로 곧바로 알람이 동작하게 하려는 것이다.
// 시각(Date)과 발화 기록(Set)을 밖에서 넣어 주므로 실제 시계를 기다리지 않고 시험할 수 있다(tests/alarms-unit.cjs).
const fs = require('fs');
const path = require('path');

// 알람 키의 기본값. 켬/끔은 지금 앱의 기본 동작(모두 꺼짐)을 그대로 두고, 기본 시각만 채운다.
// src/utils/settings.ts의 DEFAULT_SETTINGS와 같은 값이어야 한다(tests/alarms-unit.cjs가 확인한다).
const DEFAULTS = Object.freeze({
  lunchEnabled: false, leaveEnabled: false,
  lunchTime: '12:00', leaveTime: '18:00',
  lunchPreAlertMinutes: 5, leavePreAlertMinutes: 5,
  alarms: [],
});
// 마이그레이션 전(v1.0.9) 설정이 쓰던 키. 새 키가 없을 때만 대신 쓴다.
const LEGACY_KEYS = ['breakTimeEnabled', 'preAlertMinutes'];
const KEYS = [...Object.keys(DEFAULTS), ...LEGACY_KEYS];

// ── 반복 알람(위클리 캘린더) ────────────────────────────────────────────────────────
// 알람 개수 상한(점심·퇴근 알림은 별도). 예전 사용자의 알람(최대 5개)은 그대로 유지된다.
const MAX_ALARMS = 50;
// 앱이 꺼져 있었거나 컴퓨터가 잠들어 있던 동안 지나간 알람은 "최근 N분 이내"일 때만 "놓친 알람" 카드로 한 번 보여 준다.
const MISSED_WINDOW_MIN = 10;

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isYmd = (v) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const [y, m, d] = v.split('-').map(Number); const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
const parseYmd = (v) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
// 그 날이 속한 주의 월요일(주는 월~일)
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const normDays = (v) => (Array.isArray(v) ? [...new Set(v.filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b) : []);   // 0=일 … 6=토

// 반복: { kind:'weekly', days } 매주 | { kind:'date', date } 특정 날짜 한 번 | { kind:'week', weekStart, days } 그 주만(요일 지정). 없으면 예전 알람처럼 매일.
function sanitizeRepeat(r) {
  if (!r || typeof r !== 'object') return undefined;
  if (r.kind === 'weekly') { const days = normDays(r.days); return days.length ? { kind: 'weekly', days } : undefined; }
  if (r.kind === 'date') return isYmd(r.date) ? { kind: 'date', date: r.date } : undefined;
  if (r.kind === 'week') { const days = normDays(r.days); return isYmd(r.weekStart) && days.length ? { kind: 'week', weekStart: ymd(mondayOf(parseYmd(r.weekStart))), days } : undefined; }
  return undefined;
}
// 그 날(Date)에 이 알람이 예정돼 있는지(켬/끔·건너뛰기는 보지 않는다)
function occursOn(a, day) {
  const r = a && a.repeat; if (!r) return true;
  if (r.kind === 'weekly') return r.days.includes(day.getDay());
  if (r.kind === 'date') return r.date === ymd(day);
  if (r.kind === 'week') { const diff = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()) - parseYmd(r.weekStart)) / 86400000); return diff >= 0 && diff < 7 && r.days.includes(day.getDay()); }
  return true;
}
const isSkipped = (a, day) => !!a && a.skipDate === ymd(day);   // "오늘만 건너뛰기"는 그 날짜 하루만

// 알람 한 개: 이름·종료 시각·참석자·메모·미리 알림은 있을 때만 남긴다(글자 수 제한은 설정창 입력 칸과 같다)
const LIMITS = { name: 30, attendees: 80, memo: 60 };
const clip = (v, n) => (typeof v === 'string' ? Array.from(v.trim()).slice(0, n).join('') : '');
function sanitizeAlarm(a) {
  const out = { id: a.id, time: normTime(a.time), enabled: !!a.enabled };
  const name = clip(a.name, LIMITS.name), attendees = clip(a.attendees, LIMITS.attendees), memo = clip(a.memo, LIMITS.memo);
  if (name) out.name = name;
  if (isTime(a.endTime)) out.endTime = normTime(a.endTime);
  if (attendees) out.attendees = attendees;
  if (memo) out.memo = memo;
  if (Number.isFinite(a.preMinutes) && a.preMinutes > 0 && a.preMinutes <= 120) out.preMinutes = Math.round(a.preMinutes);
  const repeat = sanitizeRepeat(a.repeat); if (repeat) out.repeat = repeat;
  if (isYmd(a.skipDate)) out.skipDate = a.skipDate;
  return out;
}
// 카드에 넘길 정보(미리보기 포함). 시간 범위의 시작은 알람 시각이다.
function cardInfo(a) { const s = sanitizeAlarm({ id: 'x', time: a && isTime(a.time) ? a.time : '00:00', enabled: true, ...a }); const { name, endTime, attendees, memo, time } = s; return { name, time, endTime, attendees, memo, ...(a && a.missed === true ? { missed: true } : {}) }; }

// 비어 있거나 설정창이 붙여 주는 자동 이름("알람", "알람 1")이면 기본 이름으로 본다(src/utils/alarmText.ts와 같은 규칙)
const isDefaultAlarmName = (name) => { const t = String(name || '').trim(); return !t || /^알람\s*\d*$/.test(t); };
// 이름이나 설명(시간 범위·참석자·메모)을 넣은 알람은 읽을 글이 있으므로 팝업을 2초 더 오래 보여 준다
const TEXT_EXTRA_MS = 2000;
const DEFAULT_TOAST_MS = 3000;   // 펫 창 토스트의 기본 표시 시간(PetPage showToast 기본값과 같다)
const alarmHasText = (a) => !!a && (!isDefaultAlarmName(a.name) || !!a.endTime || !!a.attendees || !!a.memo);
const formatClockKo = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`; };
// 미리 알림 토스트 글: 이름이 있으면 "10분 뒤 · 디자인 리뷰 회의 · 오후 2:00", 없으면 점심·퇴근과 같은 "알람 10분 전이에요!"
const alarmToastText = (a, minutes) => (isDefaultAlarmName(a.name) ? `알람 ${minutes}분 전이에요!` : `${minutes}분 뒤 · ${a.name} · ${formatClockKo(a.time)}`);

const isTime = (v) => typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);
const normTime = (v) => { const [h, m] = v.split(':'); return `${String(h).padStart(2, '0')}:${m}`; };
const validators = {
  lunchEnabled: (v) => typeof v === 'boolean', leaveEnabled: (v) => typeof v === 'boolean', breakTimeEnabled: (v) => typeof v === 'boolean',
  lunchTime: isTime, leaveTime: isTime,
  lunchPreAlertMinutes: (v) => Number.isFinite(v) && v >= 0, leavePreAlertMinutes: (v) => Number.isFinite(v) && v >= 0, preAlertMinutes: (v) => Number.isFinite(v) && v >= 0,
  alarms: (v) => Array.isArray(v),
};

// 들어온 설정 중 "들어 있는" 알람 키만 반영한다. 키가 없는 설정(예: 펫 창이 저장값 없이 보낸 시작 동기화)은 기존 값을 지우지 못한다.
// 반환: { settings: 새 객체, changed: 바뀌었는지 }
function mergeAlarmSettings(current, incoming) {
  const next = { ...(current || {}) };
  if (incoming && typeof incoming === 'object') {
    for (const k of KEYS) {
      if (!(k in incoming) || incoming[k] === undefined || !validators[k](incoming[k])) continue;
      let v = incoming[k];
      if (k === 'lunchTime' || k === 'leaveTime') v = normTime(v);
      if (k === 'alarms') v = v.filter(a => a && typeof a.id === 'string' && isTime(a.time)).slice(0, MAX_ALARMS).map(sanitizeAlarm);
      next[k] = v;
    }
  }
  return { settings: next, changed: JSON.stringify(next) !== JSON.stringify(current || {}) };
}

// 저장된 설정(마이그레이션 키 포함)에서 실제로 쓰는 값을 정한다. 켬/끔은 새 키 → 옛 키 → 기본값(꺼짐) 순.
function resolveAlarmSettings(s) {
  s = s || {};
  const pick = (k) => (s[k] !== undefined ? s[k] : DEFAULTS[k]);
  const legacyPre = typeof s.preAlertMinutes === 'number' && s.preAlertMinutes > 0 ? s.preAlertMinutes : undefined;
  return {
    lunchOn: !!(s.lunchEnabled ?? s.breakTimeEnabled ?? DEFAULTS.lunchEnabled),
    leaveOn: !!(s.leaveEnabled ?? s.breakTimeEnabled ?? DEFAULTS.leaveEnabled),
    lunchTime: pick('lunchTime'), leaveTime: pick('leaveTime'),
    lunchPre: (s.lunchPreAlertMinutes || legacyPre || DEFAULTS.lunchPreAlertMinutes),
    leavePre: (s.leavePreAlertMinutes || legacyPre || DEFAULTS.leavePreAlertMinutes),
    alarms: Array.isArray(s.alarms) ? s.alarms : [],
  };
}

function getPreAlertTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = ((h * 60 + m - minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const clock = (now) => `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

// 지금 울려야 할 것들을 돌려주고 fired에 기록한다. 발화 기록은 "날짜 + 종류 + (알람 id) + 알람 시각" 기준이라
// 같은 날 시각을 바꾸면 바꾼 시각에 다시 울리고, 같은 시각은 하루에 한 번만 울린다.
// opts.late: 이 분이 이미 지나간 분일 때(앱이 꺼져 있었거나 잠들었다 깸). 일반 알람만 "놓친 알람"(missed) 카드로 한 번 보여 주고,
//            점심·퇴근과 모든 미리 알림 토스트는 지난 시각이면 보여 주지 않는다(예전 동작 그대로).
// 반환: [{ type: 'card', card: 'lunch'|'leave'|'alarm', alarm?, missed? } | { type: 'toast', kind: 'lunch'|'leave'|'alarm', minutes, text?, ms? }]
function dueActions(settings, now, fired, opts = {}) {
  const late = !!opts.late;
  const date = now.toDateString(); const cur = clock(now); const r = resolveAlarmSettings(settings); const out = [];
  for (const k of fired) if (!k.startsWith(date + '|')) fired.delete(k);   // 지난 날짜 기록은 비운다
  const once = (key) => { if (fired.has(key)) return false; fired.add(key); return true; };
  if (!late) {
    for (const [kind, on, time, pre] of [['lunch', r.lunchOn, r.lunchTime, r.lunchPre], ['leave', r.leaveOn, r.leaveTime, r.leavePre]]) {
      if (!on || !time) continue;
      if (cur === time && once(`${date}|${kind}|${time}`)) out.push({ type: 'card', card: kind });
      if (cur === getPreAlertTime(time, pre) && once(`${date}|pre-${kind}|${time}|${pre}`)) out.push({ type: 'toast', kind, minutes: pre });
    }
  }
  for (const a of r.alarms) {
    if (!a || !a.enabled || !a.time) continue;
    // 자정을 넘는 일정(예: 23:00~01:00)도 알람은 시작 시각에 한 번, 시작한 날(요일) 기준으로 판정한다
    if (cur === a.time && occursOn(a, now) && !isSkipped(a, now) && once(`${date}|alarm|${a.id}|${a.time}`)) out.push({ type: 'card', card: 'alarm', alarm: { ...cardInfo(a), ...(late ? { missed: true } : {}) }, ...(late ? { missed: true } : {}) });
    // 알람마다 정한 "미리 알림"(분 전)이 있을 때만. 기본은 꺼짐이라 지금까지의 동작은 그대로다.
    // 알람이 울릴 날(자정을 넘어 다음 날일 수도 있다)을 기준으로 반복·건너뛰기를 판정한다.
    if (!late && a.preMinutes > 0 && cur === getPreAlertTime(a.time, a.preMinutes)) {
      const target = new Date(now.getTime() + a.preMinutes * 60000);
      if (occursOn(a, target) && !isSkipped(a, target) && once(`${date}|pre-alarm|${a.id}|${a.time}|${a.preMinutes}`)) out.push({ type: 'toast', kind: 'alarm', minutes: a.preMinutes, text: alarmToastText(a, a.preMinutes), ...(isDefaultAlarmName(a.name) ? {} : { ms: DEFAULT_TOAST_MS + TEXT_EXTRA_MS }) });
    }
  }
  return out;
}

// ── 스케줄러: 1초마다 check(settings, now)를 부르면 된다. ───────────────────────────────
// 마지막으로 확인한 분 이후에 지나간 분을 모두 훑어(타이머가 멈췄거나 절전에서 깬 경우), 최근 maxMissedMinutes분 안의 일반 알람은
// "놓친 알람"으로 한 번만 돌려준다. 시계를 되돌리면 지나간 분을 다시 훑지 않고(발화 기록이 중복도 막는다), 앞으로 크게 건너뛰면
// 최근 N분만 본다. fired는 밖에서 넣어 주면(디스크에 저장한 기록) 앱을 다시 켜도 같은 알람이 또 울리지 않는다.
function createScheduler({ fired = new Set(), maxMissedMinutes = MISSED_WINDOW_MIN } = {}) {
  let lastMinute = null;
  return {
    fired,
    check(settings, now) {
      const cur = Math.floor(now.getTime() / 60000) * 60000; const floor = cur - maxMissedMinutes * 60000;
      let start = lastMinute === null ? floor : lastMinute + 60000;
      if (start > cur) start = cur;     // 같은 분이거나 시계를 되돌림
      if (start < floor) start = floor; // 오래 멈췄다 돌아오면 최근 N분만
      const out = [];
      for (let t = start; t <= cur; t += 60000) out.push(...dueActions(settings, new Date(t), fired, { late: cur - t > 60000 }));
      lastMinute = cur;
      return out;
    },
  };
}

// ── 디스크 저장·복원(userData 안의 JSON). 깨진 파일은 빈 설정으로 시작한다 ──────────
function loadAlarmSettings(file) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? mergeAlarmSettings({}, v).settings : {}; } catch { return {}; }
}
function saveAlarmSettings(file, settings) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(settings)); fs.renameSync(tmp, file); return true; } catch { return false; }
}

// 발화 기록(Set) 저장·복원: 앱을 껐다 켜도 같은 알람이 다시 울리지 않게 한다. 오늘 것이 아니면 dueActions가 비운다.
function loadFired(file) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return new Set(Array.isArray(v) ? v.filter(k => typeof k === 'string').slice(-500) : []); } catch { return new Set(); }
}
function saveFired(file, fired) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify([...fired].slice(-500))); fs.renameSync(tmp, file); return true; } catch { return false; }
}

module.exports = { MAX_ALARMS, MISSED_WINDOW_MIN, ymd, isYmd, parseYmd, mondayOf, sanitizeRepeat, occursOn, isSkipped, createScheduler, loadFired, saveFired, DEFAULTS, KEYS, LIMITS, TEXT_EXTRA_MS, DEFAULT_TOAST_MS, alarmHasText, sanitizeAlarm, cardInfo, isDefaultAlarmName, alarmToastText, mergeAlarmSettings, resolveAlarmSettings, getPreAlertTime, dueActions, loadAlarmSettings, saveAlarmSettings };
