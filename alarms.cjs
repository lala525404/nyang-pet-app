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
      if (k === 'alarms') v = v.filter(a => a && typeof a.id === 'string' && isTime(a.time)).map(a => ({ id: a.id, time: normTime(a.time), enabled: !!a.enabled }));
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
    if (cur === a.time && once(`${date}|alarm|${a.id}|${a.time}`)) out.push({ type: 'card', card: 'alarm' });
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

module.exports = { DEFAULTS, KEYS, mergeAlarmSettings, resolveAlarmSettings, getPreAlertTime, dueActions, loadAlarmSettings, saveAlarmSettings };
