// 지난 알람 자동 정리 + 일정/알람 구분 단위 테스트: 정리 대상 판정(날짜 알람만·반복 보호·7일 경계), 시계 이상 보류, 하루 한 번, 되돌리기,
// 저장(알람·기록 키만 덧붙임), 알람 스케줄러(alarms.cjs)가 그대로임(울림은 한 번만), 일정/알람 판정, 화면·퀵 카드 연결(정적 확인).
// `node tests/alarm-cleanup-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, (p) => (p in deps ? deps[p] : {})); return m.exports; };
const A = require('../alarms.cjs');
const settingsTs = load('src/utils/settings.ts', { './theme': { seedFreshTheme() {} } });
const sched = load('src/utils/alarmSchedule.ts', { './settings': settingsTs });
const text = load('src/utils/alarmText.ts', { './settings': settingsTs });
const C = load('src/utils/alarmCleanup.ts', { './alarmSchedule': sched });
const K = load('src/utils/alarmKind.ts', { './alarmText': text, './alarmSchedule': sched });
const CAL = load('src/utils/alarmCalendar.ts', { './alarmSchedule': sched, './alarmText': text, './settings': settingsTs });
const FFFD = String.fromCharCode(0xFFFD);
const D = (y, mo, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms);
const al = (o = {}) => ({ id: 'a' + Math.random().toString(36).slice(2, 8), time: '09:00', enabled: true, ...o });
const one = (date, time = '09:00', o = {}) => al({ time, repeat: { kind: 'date', date }, ...o });
const NOW = D(2026, 10, 26, 12, 0);   // 월 12:00

t('정리 대상: 날짜 지정 한 번짜리가 7일을 넘게 지났을 때만. 정확히 7일은 남기고 1ms 넘으면 지운다(7일 경계)', () => {
  const a = one('2026-10-19', '09:00');            // 마지막 울림 10/19 09:00
  const exactly7 = D(2026, 10, 26, 9, 0).getTime();   // 정확히 7일 뒤
  assert.strictEqual(C.isCleanable(a, exactly7), false, '정확히 7일은 남긴다');
  assert.strictEqual(C.isCleanable(a, exactly7 + 1), true, '1ms 넘으면 지운다');
  assert.strictEqual(C.isCleanable(a, exactly7 - 60000), false, '6일 23시간 59분');
  assert.strictEqual(C.isCleanable(a, D(2026, 10, 19, 9, 0).getTime() + 3600000), false, '울린 직후');
  assert.strictEqual(C.isCleanable(one('2026-10-27'), NOW.getTime()), false, '미래 날짜');
  assert.strictEqual(C.isCleanable(one('2026-10-01'), NOW.getTime()), true, '오래된 날짜');
  assert.strictEqual(C.isCleanable(one('2026-10-01', '09:00', { enabled: false }), NOW.getTime()), true, '꺼진 날짜 알람도 지난 뒤에는 정리 대상');
});
t('보호: 매주 반복·그 주만·매일(반복 정보 없음)·건너뛰기가 걸린 반복 알람은 아무리 오래돼도 지우지 않는다', () => {
  const now = D(2030, 1, 1).getTime();   // 아주 오래 지난 시점에서도
  for (const a of [al({ repeat: { kind: 'weekly', days: [1, 3] } }), al({ repeat: { kind: 'weekly', days: [1] }, skipDate: '2026-10-19' }), al({ repeat: { kind: 'week', weekStart: '2026-09-07', days: [1] } }), al(), al({ skipDate: '2026-10-01' })])
    assert.strictEqual(C.isCleanable(a, now), false, JSON.stringify(a.repeat));
  assert.strictEqual(C.isCleanable(null, now), false); assert.strictEqual(C.isCleanable({ time: '09:00' }, now), false);
  assert.strictEqual(C.isCleanable({ time: 'x', repeat: { kind: 'date', date: 'zzz' } }, now), false, '날짜가 이상하면 지우지 않는다');
});
t('계획: 지울 것과 남길 것이 나뉘고 순서·내용은 그대로, 입력 배열은 바뀌지 않는다', () => {
  const list = [one('2026-10-01'), al({ repeat: { kind: 'weekly', days: [1] } }), one('2026-10-25'), one('2026-09-01', '23:59'), al()];
  const copy = JSON.stringify(list);
  const p = C.planCleanup(list, NOW.getTime(), 0);
  assert.strictEqual(p.verdict, 'ok'); assert.deepStrictEqual(p.removed.map(x => x.repeat.date), ['2026-10-01', '2026-09-01']); assert.strictEqual(p.kept.length, 3);
  assert.strictEqual(JSON.stringify(list), copy);
  assert.deepStrictEqual(C.planCleanup(null, NOW.getTime(), 0).kept, []);
});
t('시계 이상: 지금이 마지막 확인 시각보다 1시간 넘게 과거거나 2026년 이전이면 지우지 않는다(보류)', () => {
  const old = one('2026-09-01'); const now = NOW.getTime();
  assert.strictEqual(C.clockVerdict(now, 0), 'ok'); assert.strictEqual(C.clockVerdict(now, now - 1000), 'ok');
  assert.strictEqual(C.clockVerdict(now, now + C.CLOCK_BACK_TOLERANCE_MS), 'ok', '1시간 이내의 뒤로 가기는 허용(서머타임·자동 보정)');
  assert.strictEqual(C.clockVerdict(now, now + C.CLOCK_BACK_TOLERANCE_MS + 1), 'clock-back');
  assert.strictEqual(C.clockVerdict(D(2025, 12, 31).getTime(), 0), 'clock-invalid'); assert.strictEqual(C.clockVerdict(NaN, 0), 'clock-invalid'); assert.strictEqual(C.clockVerdict(0, 0), 'clock-invalid');
  for (const mark of [now + 5 * 86400000, now + 400 * 86400000]) { const p = C.planCleanup([old], now, mark); assert.strictEqual(p.verdict, 'clock-back'); assert.deepStrictEqual(p.removed, []); assert.strictEqual(p.kept.length, 1); }
  assert.deepStrictEqual(C.planCleanup([old], D(1970, 1, 2).getTime(), 0).removed, [], '시계가 1970년으로 초기화돼도 지우지 않는다');
});
t('실행(runCleanup): 지우고 undo에 보관, 기록(오늘 날짜·확인 시각)을 남긴다. 두 번째 실행은 바꿀 게 없다', () => {
  const alarms = [one('2026-10-01'), al({ repeat: { kind: 'weekly', days: [2] } })];
  const r = C.runCleanup({ alarms }, NOW.getTime(), 'start');
  assert.strictEqual(r.removedCount, 1); assert.strictEqual(r.alarms.length, 1); assert.strictEqual(r.alarms[0].repeat.kind, 'weekly');
  assert.deepStrictEqual(r.meta.alarmCleanupUndo, { at: NOW.getTime(), alarms: [alarms[0]], shown: false });
  assert.strictEqual(r.meta.alarmCleanupDay, '2026-10-26'); assert.strictEqual(r.meta.alarmClockMark, NOW.getTime()); assert.strictEqual(r.changed, true);
  const again = C.runCleanup({ alarms: r.alarms, ...r.meta }, NOW.getTime() + 1000, 'daily');
  assert.strictEqual(again.removedCount, 0); assert.deepStrictEqual(again.alarms, r.alarms); assert.deepStrictEqual(again.meta.alarmCleanupUndo, r.meta.alarmCleanupUndo, '지울 게 없으면 직전 보관분을 그대로 둔다(daily)');
});
t('실행: 시계 이상이면 알람을 바꾸지 않고 오늘은 건너뛴다(새 시각을 받아들임). 시계가 2026년 이전이면 아무것도 바꾸지 않는다', () => {
  const alarms = [one('2026-09-01')]; const now = NOW.getTime();
  const back = C.runCleanup({ alarms, alarmClockMark: now + 3 * 86400000 }, now, 'start');
  assert.strictEqual(back.verdict, 'clock-back'); assert.strictEqual(back.removedCount, 0); assert.strictEqual(back.alarms, alarms); assert.strictEqual(back.meta.alarmClockMark, now); assert.strictEqual(back.meta.alarmCleanupDay, '2026-10-26');
  const bad = C.runCleanup({ alarms, alarmClockMark: now, alarmCleanupDay: 'x' }, D(2025, 1, 1).getTime(), 'start');
  assert.strictEqual(bad.changed, false); assert.strictEqual(bad.alarms, alarms); assert.strictEqual(bad.meta.alarmClockMark, now); assert.strictEqual(bad.meta.alarmCleanupDay, 'x');
});
t('undo: 앱 시작에서는 이미 보여 준 보관분을 비우고(다음 실행 때까지 보관), 아직 안 본 보관분은 남긴다. 새로 지우면 보관분을 대체한다', () => {
  const kept = [one('2026-08-01')]; const undo = (shown) => ({ at: 1, alarms: kept, shown });
  assert.strictEqual(C.runCleanup({ alarms: [], alarmCleanupUndo: undo(true) }, NOW.getTime(), 'start').meta.alarmCleanupUndo, null);
  assert.strictEqual(C.runCleanup({ alarms: [], alarmCleanupUndo: undo(true) }, NOW.getTime(), 'daily').meta.alarmCleanupUndo.shown, true, '자정 틱에서는 그대로');
  assert.strictEqual(C.runCleanup({ alarms: [], alarmCleanupUndo: undo(false) }, NOW.getTime(), 'start').meta.alarmCleanupUndo.shown, false, '아직 안 본 보관분은 남긴다');
  const repl = C.runCleanup({ alarms: [one('2026-09-09')], alarmCleanupUndo: undo(true) }, NOW.getTime(), 'daily');
  assert.deepStrictEqual(repl.meta.alarmCleanupUndo.alarms.map(a => a.repeat.date), ['2026-09-09'], '직전 정리분만 보관');
});
t('undo 정리: 깨진 저장값은 버린다(null·문자열·알람 아님·시각 없음·빈 배열)', () => {
  for (const bad of [null, undefined, 'x', 5, {}, { at: 'a', alarms: [] }, { at: 1, alarms: 'x' }, { at: 1, alarms: [] }, { at: 1, alarms: [{}, null, 5] }]) assert.strictEqual(C.sanitizeUndo(bad), null, JSON.stringify(bad));
  assert.strictEqual(C.sanitizeUndo({ at: 1, alarms: [{ id: 'a', time: '09:00', enabled: true }, null], shown: 'yes' }).shown, false);
});
t('되돌리기: 직전 정리분을 다시 넣고(같은 id는 건너뜀·최대 50개 안에서), 입력을 바꾸지 않는다', () => {
  const removed = [one('2026-09-01', '09:00', { id: 'r1' }), one('2026-09-02', '09:00', { id: 'r2' })]; const now = [al({ id: 'x' }), one('2026-09-02', '09:00', { id: 'r2' })];
  const r = C.restoreCleaned(now, { at: 1, alarms: removed, shown: true });
  assert.deepStrictEqual(r.alarms.map(a => a.id), ['x', 'r2', 'r1']); assert.strictEqual(r.restored, 1); assert.strictEqual(r.skipped, 1); assert.strictEqual(now.length, 2);
  const full = Array.from({ length: 49 }, (_, i) => al({ id: 'f' + i }));
  const r2 = C.restoreCleaned(full, { at: 1, alarms: removed, shown: false }); assert.strictEqual(r2.alarms.length, 50); assert.strictEqual(r2.restored, 1); assert.strictEqual(r2.skipped, 1);
  assert.deepStrictEqual(C.restoreCleaned(now, null), { alarms: now, restored: 0, skipped: 0 });
});
t('하루 한 번: 날짜가 바뀌었을 때만 새 날(isNewDay), 자정 직후 첫 틱에서 켜진다. 확인 시각은 10분에 한 번만 새로 쓴다(nextMark)', () => {
  const day = C.runCleanup({ alarms: [] }, D(2026, 10, 26, 23, 59).getTime(), 'start').meta.alarmCleanupDay;
  assert.strictEqual(C.isNewDay(day, D(2026, 10, 26, 23, 59, 59).getTime()), false); assert.strictEqual(C.isNewDay(day, D(2026, 10, 27, 0, 0, 0).getTime()), true); assert.strictEqual(C.isNewDay('', NOW.getTime()), true); assert.strictEqual(C.isNewDay(undefined, NOW.getTime()), true);
  const m = NOW.getTime();
  assert.strictEqual(C.nextMark(0, m), m); assert.strictEqual(C.nextMark(m - 1000, m), null); assert.strictEqual(C.nextMark(m - C.MARK_STEP_MS, m), m);
  assert.strictEqual(C.nextMark(m + 86400000, m), null, '시계가 과거로 간 것 같으면 확인 시각을 새로 쓰지 않는다'); assert.strictEqual(C.nextMark(0, D(2020, 1, 1).getTime()), null);
});
t('알람 스케줄러(alarms.cjs)는 그대로: 정리에서 남은 알람은 예전처럼 정확히 한 번만 울리고, 지운 알람은 울리지 않는다', () => {
  const due = one('2026-10-26', '12:05', { id: 'due', name: '오늘 알람' }); const old = one('2026-10-01', '12:05', { id: 'old', name: '옛 알람' });
  const cleaned = C.runCleanup({ alarms: [due, old] }, NOW.getTime(), 'start').alarms;
  const settings = { alarms: cleaned }; const sch = A.createScheduler({ fired: new Set() });
  const fire = (d) => sch.check(settings, d).filter(x => x.type === 'card' && x.card === 'alarm').map(x => x.alarm.name);
  assert.deepStrictEqual(fire(D(2026, 10, 26, 12, 4, 59)), [], '아직 울릴 시각 전'); assert.deepStrictEqual(fire(D(2026, 10, 26, 12, 5, 1)), ['오늘 알람']); assert.deepStrictEqual(fire(D(2026, 10, 26, 12, 5, 30)), [], '같은 분에 두 번 울리지 않는다'); assert.deepStrictEqual(fire(D(2026, 10, 26, 12, 6, 0)), []);
  assert.strictEqual(cleaned.some(a => a.id === 'old'), false);
  assert.strictEqual(read('alarms.cjs').includes('alarmCleanup'), false, 'alarms.cjs는 정리 로직을 모른다(수정 없음)');
});

// ── 일정/알람 구분 ──
t('판정: 종료 시각·참석자·이름 중 하나라도 있으면 일정, 시각만 있으면 알람(메모·미리 알림·반복만 있어도 알람). 자동 이름("알람 1")은 이름 없음', () => {
  assert.strictEqual(K.alarmKind({}), 'alarm'); assert.strictEqual(K.alarmKind(null), 'alarm'); assert.strictEqual(K.alarmKind(undefined), 'alarm');
  assert.strictEqual(K.alarmKind({ endTime: '10:00' }), 'event'); assert.strictEqual(K.alarmKind({ attendees: '김, 이' }), 'event'); assert.strictEqual(K.alarmKind({ name: '회의' }), 'event');
  for (const none of [{ name: '' }, { name: '   ' }, { endTime: '' }, { attendees: ' ' }, { name: '알람' }, { name: '알람 3' }, { memo: '메모만' }, { preMinutes: 5 }, { repeat: { kind: 'weekly', days: [1] } }]) assert.strictEqual(K.alarmKind(none), 'alarm', JSON.stringify(none));
  assert.strictEqual(K.kindLabel({ name: '회의' }), '일정'); assert.strictEqual(K.kindLabel({}), '알람');
  assert.deepStrictEqual({ ...K.KIND_LABEL }, { event: '일정', alarm: '알람' });
});
t('마이그레이션 없이: 예전에 저장된 알람(필드 모양 그대로)도 같은 규칙으로 구분된다. 알람 대화로 만든 알람의 필드 구성은 그대로(제목이 있으면 name → 일정)', () => {
  const legacy = [{ id: '1', time: '09:00', enabled: true }, { id: '2', time: '14:00', enabled: true, name: '팀 회의', endTime: '15:00', attendees: '김OO' }];
  assert.deepStrictEqual(legacy.map(K.alarmKind), ['alarm', 'event']);
  const CHAT = load('src/utils/alarmChat.ts', { './alarmSchedule': sched, './alarmText': text, './alarmCommand': load('src/utils/alarmCommand.ts', { './alarmSchedule': sched, './weekOfMonth': load('src/utils/weekOfMonth.ts', { './alarmSchedule': sched }) }) });
  const withTitle = CHAT.buildAlarm({ kind: 'create', date: '2026-10-27', time: '15:00', title: '회의' }, 'id1'); const noTitle = CHAT.buildAlarm({ kind: 'create', date: '2026-10-27', time: '15:00', title: '' }, 'id2');
  assert.strictEqual(K.alarmKind(withTitle), 'event'); assert.strictEqual(K.alarmKind(noTitle), 'alarm');
  assert.deepStrictEqual(Object.keys(noTitle).sort(), ['enabled', 'id', 'repeat', 'time'], '제목 없이 만든 알람은 시각·날짜만(기존 생성 동작 그대로)');
});
t('일정 막대 글: 종료가 시작보다 뒤일 때만 "14:00–15:00", 아니면 시작 시각만', () => {
  assert.strictEqual(K.rangeText('14:00', '15:00'), '14:00–15:00'); assert.strictEqual(K.rangeText('14:00', undefined), '14:00'); assert.strictEqual(K.rangeText('14:00', ''), '14:00');
  assert.strictEqual(K.rangeText('14:00', '13:00'), '14:00', '종료가 시작보다 이르면 범위로 보이지 않는다'); assert.strictEqual(K.rangeText('14:00', '14:00'), '14:00'); assert.strictEqual(K.rangeText('x', '15:00'), 'x');
});
t('"지남" 표시: 지난 한 번짜리 알람은 캘린더 툴팁·목록·접근성 문구가 "지남"(예전 "완료" 아님)이고, 흐리게(dim) 처리된다', () => {
  const past = one('2026-10-23', '09:00'); const day = D(2026, 10, 23);
  const ev = CAL.dayEvents([past], day, NOW)[0]; assert.strictEqual(ev.past, true); assert.strictEqual(ev.dim, true);
  assert.strictEqual(CAL.tooltipInfo(past, day, true).status, '지남');
  for (const f of ['src/components/settings/AlarmCalendar.tsx', 'src/components/settings/AlarmPane.tsx']) { const s = read(f); assert.ok(s.includes('지남'), f); assert.ok(!s.includes("'완료'") && !s.includes("'완료 · '") && !s.includes(', 완료'), `${f}에 옛 "완료" 표기가 남아 있다`); }
});
t('연결(정적): 정리는 버디 창에서만 한 번(App의 /pet 경로), 저장은 patchStoredSettings 한 길, alarms.cjs·PetPage·main 정리 코드 없음, 설정창은 정리 기록을 덮어쓰지 않는다', () => {
  assert.ok(read('src/App.tsx').includes('<Route path="/pet" element={<><PetPage /><AlarmCleanupRunner /></>} />'));
  const run = read('src/components/AlarmCleanupRunner.tsx'); assert.ok(run.includes('patchStoredSettings({ alarms: r.alarms, ...r.meta })') && !/saveSettings\(/.test(run));
  assert.ok(!/cleanup/i.test(read('main.cjs').replace(/stopNoticeTimers|CleanupRunner/g, '')), 'main.cjs는 정리를 모른다');
  assert.ok(!/AlarmCleanup|alarmCleanup/.test(read('src/pages/PetPage.tsx')), 'PetPage는 그대로');
  const keys = settingsTs.OTHER_WINDOW_KEYS; for (const k of ['alarmCleanupDay', 'alarmClockMark', 'alarmCleanupUndo']) assert.ok(keys.includes(k), k);
  assert.ok(read('src/components/settings/AlarmPane.tsx').includes('되돌리기') && read('src/components/settings/AlarmPane.tsx').includes('cleanupNoticeText'));
  const q = read('src/pages/QuickPage.tsx'); assert.ok(q.includes('kindLabel') || q.includes('KIND_LABEL'), '퀵 알람 카드에 일정/알람 라벨');
  const cal = read('src/components/settings/AlarmCalendar.tsx'); assert.ok(cal.includes('st-cal-legend') && cal.includes('rangeText') && cal.includes('<Bell'), '캘린더: 범례·시간 범위·종 아이콘');
});
t('파일에 깨진 글자(U+FFFD)·???가 없다', () => {
  for (const f of ['src/utils/alarmCleanup.ts', 'src/utils/alarmKind.ts', 'src/components/AlarmCleanupRunner.tsx', 'src/components/settings/AlarmCalendar.tsx', 'src/components/settings/AlarmPane.tsx']) { const s = read(f); assert.ok(!s.includes(FFFD) && !/\?{3}/.test(s), f); }
});

(async () => {
  let n = 0;
  for (const [name, fn] of queue) { await fn(); n++; console.log('  ok  ' + name); }
  console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
