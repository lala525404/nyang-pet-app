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
  return out;
}
// 카드에 넘길 정보(미리보기 포함). 시간 범위의 시작은 알람 시각이다.
function cardInfo(a) { const s = sanitizeAlarm({ id: 'x', time: a && isTime(a.time) ? a.time : '00:00', enabled: true, ...a }); const { name, endTime, attendees, memo, time } = s; return { name, time, endTime, attendees, memo }; }

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
      if (k === 'alarms') v = v.filter(a => a && typeof a.id === 'string' && isTime(a.time)).map(sanitizeAlarm);
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

// 지금 울려야 할 것들을 돌려주고 fired에 기록한다. 발화 기록은 "날짜 + 종류 + 알람 시각" 기준이라
// 같은 날 시각을 바꾸면 바꾼 시각에 다시 울리고, 같은 시각은 하루에 한 번만 울린다.
// 반환: [{ type: 'card', card: 'lunch'|'leave'|'alarm' } | { type: 'toast', kind: 'lunch'|'leave', minutes }]
function dueActions(settings, now, fired) {
  const date = now.toDateString(); const cur = clock(now); const r = resolveAlarmSettings(settings); const out = [];
  for (const k of fired) if (!k.startsWith(date + '|')) fired.delete(k);   // 지난 날짜 기록은 비운다
  const once = (key) => { if (fired.has(key)) return false; fired.add(key); return true; };
  for (const [kind, on, time, pre] of [['lunch', r.lunchOn, r.lunchTime, r.lunchPre], ['leave', r.leaveOn, r.leaveTime, r.leavePre]]) {
    if (!on || !time) continue;
    if (cur === time && once(`${date}|${kind}|${time}`)) out.push({ type: 'card', card: kind });
    if (cur === getPreAlertTime(time, pre) && once(`${date}|pre-${kind}|${time}|${pre}`)) out.push({ type: 'toast', kind, minutes: pre });
  }
  for (const a of r.alarms) {
    if (!a || !a.enabled || !a.time) continue;
    if (cur === a.time && once(`${date}|alarm|${a.id}|${a.time}`)) out.push({ type: 'card', card: 'alarm', alarm: cardInfo(a) });
    // 알람마다 정한 "미리 알림"(분 전)이 있을 때만. 기본은 꺼짐이라 지금까지의 동작은 그대로다.
    if (a.preMinutes > 0 && cur === getPreAlertTime(a.time, a.preMinutes) && once(`${date}|pre-alarm|${a.id}|${a.time}|${a.preMinutes}`)) out.push({ type: 'toast', kind: 'alarm', minutes: a.preMinutes, text: alarmToastText(a, a.preMinutes), ...(isDefaultAlarmName(a.name) ? {} : { ms: DEFAULT_TOAST_MS + TEXT_EXTRA_MS }) });
  }
  return out;
}

// ── 디스크 저장·복원(userData 안의 JSON). 깨진 파일은 빈 설정으로 시작한다 ──────────
function loadAlarmSettings(file) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? mergeAlarmSettings({}, v).settings : {}; } catch { return {}; }
}
function saveAlarmSettings(file, settings) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(settings)); fs.renameSync(tmp, file); return true; } catch { return false; }
}

module.exports = { DEFAULTS, KEYS, LIMITS, TEXT_EXTRA_MS, DEFAULT_TOAST_MS, alarmHasText, sanitizeAlarm, cardInfo, isDefaultAlarmName, alarmToastText, mergeAlarmSettings, resolveAlarmSettings, getPreAlertTime, dueActions, loadAlarmSettings, saveAlarmSettings };
