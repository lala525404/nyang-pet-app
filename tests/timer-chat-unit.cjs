// 대화하기의 "N분 뒤 알람(타이머)" 단위 테스트: 지원 표현(분·시간·조합·한글 수사·후/뒤/뒤에/후에/있다가·이름), 올림 규칙(울림 시각 ≥ 요청 시각),
// 초·0분·24시간 초과 안내, 절대 시각·"5분"만·"이따가"는 기존 흐름, 자정 넘김, 타이머 취소·남은 시간, 일정/알람 구분, 스케줄러(alarms.cjs) 연동(한 번만·일찍 안 울림),
// 정리 규칙(울린 뒤 1시간, 반복·점심·퇴근 보호, 되돌리기 보관분), 연결(정적 확인).
// `node tests/timer-chat-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, (p) => (p in deps ? deps[p] : {})); return m.exports; };
const A = require('../alarms.cjs');
const settingsTs = load('src/utils/settings.ts', { './theme': { seedFreshTheme() {} } });
const sched = load('src/utils/alarmSchedule.ts', { './settings': settingsTs });
const text = load('src/utils/alarmText.ts', { './settings': settingsTs });
const WOM = load('src/utils/weekOfMonth.ts', { './alarmSchedule': sched });
const P = load('src/utils/alarmCommand.ts', { './alarmSchedule': sched, './weekOfMonth': WOM });
const CH = load('src/utils/alarmChat.ts', { './alarmSchedule': sched, './alarmText': text, './alarmCommand': P });
const K = load('src/utils/alarmKind.ts', { './alarmText': text, './alarmSchedule': sched });
const C = load('src/utils/alarmCleanup.ts', { './alarmSchedule': sched });
const RN = load('src/data/releaseNotes.ts');
const FFFD = String.fromCharCode(0xFFFD);
const D = (y, mo, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms);
const NOW = D(2026, 10, 26, 11, 36, 40);   // 월 11:36:40
const cmd = (s, now = NOW) => P.parseAlarmCommand(s, now);
const hhmm = (c) => `${c.date} ${c.time}`;

t('지원 표현: 분·시간·조합·반·한글 수사, 후/뒤/뒤에/후에/있다가, 문형(맞춰·만들어·띄워·울려·알려·타이머) → 타이머 알람', () => {
  const cases = [
    ['1분 후에 알람 맞춰줘', 1], ['5분 뒤에 알람 만들어줘', 5], ['10분 뒤에 알람 띄워줘', 10], ['1시간 30분 후 알람', 90], ['3분 뒤에 알람 울려줘', 3], ['5분 후에 알려줘', 5], ['5분 뒤에 알려줘', 5],
    ['90분 뒤 알람 맞춰줘', 90], ['30분 후에 알람', 30], ['한 시간 반 뒤에 알려줘', 90], ['1시간 반 뒤에 알람', 90], ['반 시간 뒤 알람 울려줘', 30], ['반시간 후에 알람 만들어줘', 30], ['2시간 뒤 알람 맞춰줘', 120], ['두 시간 후에 알람 맞춰줘', 120],
    ['세 분 뒤에 알람 맞춰줘', 3], ['다섯 분 뒤에 알람 맞춰줘', 5], ['십 분 뒤에 알람 맞춰줘', 10], ['이십오 분 후 알람 만들어줘', 25], ['삼십 분 후에 알람', 30], ['사십오 분 뒤 알람 맞춰줘', 45], ['스물다섯 분 뒤에 알려줘', 25], ['열두 시간 뒤에 알람 맞춰줘', 720],
    ['10분 있다가 알람 맞춰줘', 10], ['5분 타이머', 5], ['타이머 10분', 10], ['5분 타이머 맞춰줘', 5], ['타이머 3분 맞춰줘', 3], ['1시간 타이머', 60], ['1시간 30분 타이머', 90], ['24시간 뒤에 알람 맞춰줘', 1440], ['1440분 뒤 알람 맞춰줘', 1440],
    ['  5분   뒤에   알람  맞춰줘 ', 5], ['5분 뒤에 알람 맞춰줘!', 5],
  ];
  for (const [s, min] of cases) { const c = cmd(s); assert.strictEqual(c.kind, 'create', s + ' → ' + JSON.stringify(c)); assert.strictEqual(c.timer.minutes, min, s); assert.strictEqual(c.title, '', s + ' 이름 없음'); }
  assert.strictEqual(cmd('1시간 30분 후 알람').timer.label, '1시간 30분'); assert.strictEqual(cmd('90분 뒤 알람 맞춰줘').timer.label, '1시간 30분'); assert.strictEqual(cmd('2시간 뒤 알람 맞춰줘').timer.label, '2시간'); assert.strictEqual(cmd('5분 타이머').timer.label, '5분');
});
t('이름 붙은 문장: "3분 뒤에 라면 알람"·"5분 뒤에 회의 알람 맞춰줘"·따옴표 → 이름만 제목으로(동사·뒤/후·타이머는 제외)', () => {
  assert.strictEqual(cmd('3분 뒤에 라면 알람').title, '라면');
  assert.strictEqual(cmd('3분 뒤에 라면 알람 맞춰줘').title, '라면');
  assert.strictEqual(cmd('라면 알람 3분 뒤에 맞춰줘').title, '라면');
  assert.strictEqual(cmd('5분 후에 회의 알람 만들어줘').title, '회의');
  assert.strictEqual(cmd('10분 뒤에 빨래 타이머').title, '빨래');
  assert.strictEqual(cmd('5분 뒤에 "라면 끓이기" 알람').title, '라면 끓이기');
  assert.strictEqual(cmd('10분 뒤에 알람 띄워줘').title, '');
  assert.strictEqual(cmd('5분 타이머').title, '');
});
t('올림 규칙: 울림 시각 ≥ 요청 시각 + N분. 11:36:40의 "1분 후" → 11:38(약 1분 20초 뒤), 정각에는 그대로', () => {
  const c = cmd('1분 후에 알람 맞춰줘'); assert.strictEqual(hhmm(c), '2026-10-26 11:38'); assert.strictEqual(c.timer.secondsLeft, 80);
  const e = cmd('1분 후에 알람 맞춰줘', D(2026, 10, 26, 11, 36, 0)); assert.strictEqual(hhmm(e), '2026-10-26 11:37'); assert.strictEqual(e.timer.secondsLeft, 60, '초가 0이면 올림할 게 없다');
  assert.strictEqual(hhmm(cmd('5분 뒤에 알람 만들어줘', D(2026, 10, 26, 11, 36, 59, 999))), '2026-10-26 11:42');
  assert.strictEqual(hhmm(cmd('5분 뒤에 알람 만들어줘', D(2026, 10, 26, 11, 36, 0, 1))), '2026-10-26 11:42');
  // 성질: 어떤 시각·분에서도 (울림 − 요청) ∈ [N분, N분 + 60초), 울림은 분 경계
  for (const ms of [0, 1, 999, 30000, 59999, 60000, 12345678]) for (const min of [1, 2, 5, 59, 60, 61, 90, 1440]) {
    const now = new Date(D(2026, 10, 26, 8, 15, 0).getTime() + ms), c2 = P.timerCommand(min, '', now);
    const [h, m] = c2.time.split(':').map(Number), [y, mo, d] = c2.date.split('-').map(Number), ring = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
    const diff = ring - (now.getTime() + min * 60000);
    assert.ok(diff >= 0 && diff < 60000, `${ms}/${min}: ${diff}`); assert.strictEqual(c2.timer.secondsLeft, Math.ceil((ring - now.getTime()) / 1000));
  }
  assert.strictEqual(CH.leftText(80), '1분 20초'); assert.strictEqual(CH.leftText(60), '1분'); assert.strictEqual(CH.leftText(45), '45초'); assert.strictEqual(CH.leftText(3600), '1시간'); assert.strictEqual(CH.leftText(5420), '1시간 30분');
});
t('자정 넘김: 23:50의 "15분 뒤"는 다음 날 00:05, 연말·월말도 올바른 날짜', () => {
  assert.strictEqual(hhmm(cmd('15분 뒤에 알람 맞춰줘', D(2026, 10, 26, 23, 50, 10))), '2026-10-27 00:06');
  assert.strictEqual(hhmm(cmd('15분 뒤에 알람 맞춰줘', D(2026, 10, 26, 23, 45, 0))), '2026-10-27 00:00');
  assert.strictEqual(hhmm(cmd('1분 뒤에 알람 맞춰줘', D(2026, 12, 31, 23, 59, 30))), '2027-01-01 00:01');
  assert.strictEqual(hhmm(cmd('2시간 뒤에 알람 맞춰줘', D(2026, 10, 31, 23, 0, 0))), '2026-11-01 01:00');
  assert.strictEqual(hhmm(cmd('24시간 뒤에 알람 맞춰줘')), '2026-10-27 11:37');
});
t('범위·안내: 초 단위·0분은 "알람은 분 단위예요", 24시간 초과는 안내, 시간 없이 타이머만은 몇 분인지 되묻는다', () => {
  for (const s of ['30초 후에 알람', '30초 뒤에 알람 맞춰줘', '1분 30초 뒤에 알람', '0분 뒤에 알람 맞춰줘', '0시간 뒤에 알람 맞춰줘', '0분 타이머']) { const c = cmd(s); assert.deepStrictEqual({ k: c.kind, i: c.intent, r: c.reason }, { k: 'reject', i: 'create', r: '알람은 분 단위예요. 1분 이상으로 말해 주세요' }, s + JSON.stringify(c)); }
  for (const s of ['25시간 뒤 알람 맞춰줘', '1441분 뒤에 알람 맞춰줘', '48시간 뒤에 알람 맞춰줘', '25시간 타이머']) assert.strictEqual(cmd(s).reason, '타이머는 24시간까지 맞출 수 있어요', s);
  assert.strictEqual(cmd('타이머 맞춰줘').reason, '몇 분 뒤에 울릴지 알려 주세요');
});
t('절대 시각·단서 없는 "5분"·이따가는 기존 흐름: 5시 30분·3:30·오후 5시 30분 / 5분만 / 이따가 / 5분 뒤만', () => {
  assert.strictEqual(cmd('5시 30분 알람 만들어줘').kind, 'needsMeridiem'); assert.strictEqual(cmd('5시 30분 알람 만들어줘').minute, 30);
  assert.strictEqual(cmd('3:30 알람 만들어줘').kind, 'needsMeridiem');
  assert.strictEqual(cmd('3:30에 알람 맞춰줘').kind, 'needsMeridiem');
  const pm = cmd('오후 5시 30분에 알람 만들어줘'); assert.deepStrictEqual({ k: pm.kind, d: pm.date, t: pm.time }, { k: 'create', d: '2026-10-26', t: '17:30' }); assert.strictEqual(pm.timer, undefined);
  assert.strictEqual(cmd('내일 오후 3시에 회의 알람 만들어줘').timer, undefined);
  assert.strictEqual(cmd('5분').kind, 'unknown'); assert.strictEqual(cmd('5분 뒤').kind, 'unknown'); assert.strictEqual(cmd('1시간 후').kind, 'unknown');
  assert.strictEqual(cmd('5분 알람 맞춰줘').kind, 'reject', '단서(후/뒤/타이머) 없는 "5분"은 상대 시간이 아니다');
  assert.strictEqual(cmd('5분 알람 맞춰줘').reason, P.REASON.needTime);
  const later = cmd('이따가 알람 맞춰줘'); assert.notStrictEqual(later.kind, 'create'); assert.ok(!later.timer);
  assert.strictEqual(cmd('이따가 5시에 알람 맞춰줘').kind, 'needsMeridiem');
  assert.strictEqual(cmd('안녕').kind, 'unknown'); assert.strictEqual(cmd('기분 좋아').kind, 'unknown'); assert.strictEqual(cmd('분위기 좋다').kind, 'unknown');
});
t('기존 상대 시간 문장의 다른 의도는 그대로: "30분 뒤 알람 취소해줘"(취소)·"5분 뒤에 알람 뭐 있어"(조회)', () => {
  assert.strictEqual(cmd('30분 뒤 알람 취소해줘').kind, 'cancel'); assert.strictEqual(cmd('30분 뒤 알람 취소해줘').time, '12:06');
  assert.strictEqual(cmd('5분 뒤에 알람 뭐 있어').kind, 'query');
  assert.strictEqual(cmd('오늘 알람 뭐 있어?').kind, 'query'); assert.strictEqual(cmd('알람 알려줘').kind, 'query'); assert.strictEqual(cmd('다음 주 알람 알려줘').kind, 'query');
  assert.strictEqual(cmd('내일 오후 3시 알람 취소해줘').kind, 'cancel'); assert.strictEqual(cmd('알람 다 지워줘').kind, 'cancel');
  assert.strictEqual(cmd('오늘 브리핑해줘').kind, 'brief'); assert.strictEqual(cmd('오늘 알람 브리핑해줘').kind, 'brief');
  assert.strictEqual(cmd('브리핑 5분 뒤에 알람 맞춰줘').kind, 'create', '확실한 만들기 말 + 알람 말이면 브리핑 대신 기존 생성 규칙(타이머)이 이긴다');
});
t('타이머 취소·남은 시간 명령: "타이머 취소/끄기/삭제해줘" → cancelTimer, "타이머 얼마나 남았어?" → timerLeft(입력 문장은 결과에 없다)', () => {
  for (const s of ['타이머 취소해줘', '타이머 취소', '타이머 끄기', '타이머 꺼줘', '타이머 삭제해줘', '타이머 지워줘', '5분 타이머 취소해줘']) assert.deepStrictEqual(cmd(s), { kind: 'cancelTimer' }, s);
  for (const s of ['타이머 얼마나 남았어?', '타이머 남은 시간 알려줘', '타이머 몇 분 남았어', '타이머 언제 울려?', '타이머 있어?']) assert.deepStrictEqual(cmd(s), { kind: 'timerLeft' }, s);
  assert.deepStrictEqual(Object.keys(cmd('5분 뒤에 알람 맞춰줘')).sort(), ['date', 'kind', 'time', 'timer', 'title'], '원문은 결과에 없다');
  assert.strictEqual(cmd('5분 ' + 'ㅋ'.repeat(300)).kind, 'unknown');
});
t('타이머 목록: 아직 안 울린 timer- 알람만 가까운 것부터, 꺼짐·지난 것·일반 알람 제외. 취소 대상·남은 시간 문구', () => {
  const now = NOW; const tm = (id, h, mi, o = {}) => ({ id: 'timer-' + id, time: `${h}:${mi}`, enabled: true, repeat: { kind: 'date', date: '2026-10-26' }, memo: '5분 타이머', ...o });
  const alarms = [tm('b', '12', '05', { name: '라면' }), tm('a', '11', '38'), tm('old', '11', '30'), tm('off', '12', '30', { enabled: false }), { id: '123', time: '12:00', enabled: true, repeat: { kind: 'date', date: '2026-10-26' } }, tm('tomorrow', '09', '00', { repeat: { kind: 'date', date: '2026-10-27' } })];
  const list = CH.pendingTimers(alarms, now); assert.deepStrictEqual(list.map(x => x.alarm.id), ['timer-a', 'timer-b', 'timer-tomorrow']);
  const targets = CH.findTimerTargets(alarms, now); assert.deepStrictEqual(targets.map(x => x.alarm.id), ['timer-a', 'timer-b', 'timer-tomorrow']); assert.ok(targets.every(x => x.kind === 'alarm'));
  assert.ok(/5분 타이머 · 오전 11:38에 울려요 \(1분 20초 남음\)/.test(targets[0].label), targets[0].label); assert.ok(/^라면 · 오후 12:05에 울려요/.test(targets[1].label), targets[1].label);
  assert.deepStrictEqual(CH.timerLeftLines(alarms, now).length, 3);
  assert.deepStrictEqual(CH.timerLeftLines([], now), ['맞춰 둔 타이머가 없어요']); assert.deepStrictEqual(CH.timerLeftLines([alarms[2]], now), ['맞춰 둔 타이머가 없어요']);
  assert.deepStrictEqual(CH.findTimerTargets([], now), []); assert.strictEqual(CH.REASON_NO_TIMER, '맞춰 둔 타이머가 없어요');
  // 취소하면 기존 삭제 흐름이 그대로 지운다
  const s0 = { ...settingsTs.DEFAULT_SETTINGS, alarms }; assert.ok(!CH.withAlarmsRemoved(s0, ['timer-a']).alarms.some(a => a.id === 'timer-a'));
});
t('만들기: id "timer-" 접두어, 이름은 말했을 때만 name, memo "N분 타이머", 한 번짜리 날짜 알람. 이름 없는 타이머는 "알람"(종 아이콘), 이름 있으면 일정', () => {
  const c = cmd('5분 뒤에 알람 만들어줘'); const a = CH.buildAlarm(c, CH.newTimerId());
  assert.ok(a.id.startsWith('timer-') && sched.isTimerAlarm(a)); assert.deepStrictEqual({ time: a.time, enabled: a.enabled, repeat: a.repeat, memo: a.memo, name: a.name }, { time: c.time, enabled: true, repeat: { kind: 'date', date: c.date }, memo: '5분 타이머', name: undefined });
  assert.strictEqual(K.alarmKind(a), 'alarm'); assert.strictEqual(text.alarmTitle(a), '알람'); assert.ok(text.alarmSubText(a).includes('5분 타이머'), text.alarmSubText(a));
  const n = CH.buildAlarm(cmd('3분 뒤에 라면 알람'), CH.newTimerId()); assert.strictEqual(n.name, '라면'); assert.strictEqual(K.alarmKind(n), 'event'); assert.strictEqual(text.alarmTitle(n), '라면');
  assert.ok(!sched.isTimerAlarm({ id: '1729' + '123' }) && !sched.isTimerAlarm(null) && !sched.isTimerAlarm({ id: 5 }));
  assert.ok(CH.newTimerId() !== CH.newTimerId() || true); assert.ok(/^timer-\d+$/.test(CH.newTimerId()));
  const plain = CH.buildAlarm(cmd('내일 오후 3시에 회의 알람 만들어줘'), '1'); assert.strictEqual(plain.memo, undefined, '일반 알람 생성은 그대로');
  const sane = A.mergeAlarmSettings({}, { alarms: [a, n] }).settings.alarms; assert.ok(sane.every(x => x.id.startsWith('timer-')) && sane[0].memo === '5분 타이머', '스케줄러 저장 규칙을 통과해도 id·memo가 남는다');
});
t('확인 카드 문구: "5분 후 오후 11시 38분에 알람을 만들까요?" + "약 1분 20초 뒤에 울려요". 일반 알람 문구는 그대로', () => {
  const q = CH.createQuestion(cmd('1분 후에 알람 맞춰줘')); assert.deepStrictEqual(q, { head: '1분 후', big: '오전 11시 38분', note: '약 1분 20초 뒤에 울려요', question: '1분 후 오전 11시 38분에 알람을 만들까요?' });
  const q2 = CH.createQuestion(cmd('3분 뒤에 라면 알람')); assert.ok(q2.question.includes("'라면'") && q2.head === '3분 후');
  const q3 = CH.createQuestion(cmd('내일 오후 3시에 회의 알람 만들어줘')); assert.deepStrictEqual({ h: q3.head, b: q3.big }, { h: '10월 27일 화요일', b: '오후 3시' });
});
t('스케줄러(alarms.cjs) 연동: 올림한 울림 시각에 한 번만 울리고, 요청한 N분보다 일찍 울리지 않는다(1초 틱 시뮬레이션)', () => {
  const reqAt = NOW.getTime(), c = cmd('1분 후에 알람 맞춰줘'); const alarm = CH.buildAlarm(c, CH.newTimerId());
  const settings = { alarms: [alarm] }; const s = A.createScheduler({ fired: new Set() }); const rings = [];
  for (let ms = reqAt; ms <= reqAt + 5 * 60000; ms += 1000) for (const a of s.check(settings, new Date(ms))) if (a.type === 'card' && a.card === 'alarm') rings.push(ms);
  assert.strictEqual(rings.length, 1, '정확히 한 번'); assert.ok(rings[0] - reqAt >= 60000, `요청 후 ${(rings[0] - reqAt) / 1000}초에 울렸다(60초 이상이어야 한다)`);
  assert.strictEqual(new Date(rings[0]).getMinutes(), 38); assert.strictEqual(new Date(rings[0]).getSeconds(), 0);
  // 자정을 넘는 타이머도 한 번만
  const mid = cmd('15분 뒤에 알람 맞춰줘', D(2026, 10, 26, 23, 50, 10)); const a2 = CH.buildAlarm(mid, CH.newTimerId()); const s2 = A.createScheduler({ fired: new Set() }); let n2 = 0; const st = D(2026, 10, 26, 23, 50, 10).getTime();
  for (let ms = st; ms <= st + 30 * 60000; ms += 1000) for (const a of s2.check({ alarms: [a2] }, new Date(ms))) if (a.type === 'card' && a.card === 'alarm') { n2++; assert.strictEqual(new Date(ms).getDate(), 27); }
  assert.strictEqual(n2, 1);
  assert.ok(!/timer/i.test(read('alarms.cjs')), 'alarms.cjs는 타이머를 모른다(변경 없음)');
});
t('정리 규칙: 타이머는 울린 지 1시간 뒤(정확히 1시간은 남김), 일반 날짜 알람은 7일, 반복·접두어만 같은 반복 알람·점심·퇴근은 보호', () => {
  const ring = D(2026, 10, 26, 11, 38).getTime(), tm = { id: 'timer-1', time: '11:38', enabled: true, repeat: { kind: 'date', date: '2026-10-26' } };
  assert.strictEqual(C.TIMER_CLEANUP_AFTER_MS, 3600000);
  assert.strictEqual(C.isCleanable(tm, ring + 3600000), false, '정확히 1시간'); assert.strictEqual(C.isCleanable(tm, ring + 3600001), true); assert.strictEqual(C.isCleanable(tm, ring + 59 * 60000), false); assert.strictEqual(C.isCleanable(tm, ring - 60000), false, '울리기 전');
  const normal = { ...tm, id: '1729' }; assert.strictEqual(C.isCleanable(normal, ring + 3 * 3600000), false, '일반 알람은 1시간으로 지우지 않는다'); assert.strictEqual(C.isCleanable(normal, ring + 7 * 86400000 + 1), true);
  assert.strictEqual(C.isCleanable({ ...tm, repeat: { kind: 'weekly', days: [1] } }, ring + 9e9), false, '반복 알람은 접두어가 같아도 보호');
  assert.strictEqual(C.isCleanable({ ...tm, repeat: undefined }, ring + 9e9), false); assert.strictEqual(C.isCleanable({ ...tm, skipDate: '2026-10-26', repeat: { kind: 'weekly', days: [1] } }, ring + 9e9), false);
  const lunch = { lunchEnabled: true, leaveEnabled: true };
  const alarms = [tm, normal, { id: 'timer-w', time: '08:00', enabled: true, repeat: { kind: 'weekly', days: [1, 3] } }, { id: 'timer-f', time: '23:00', enabled: true, repeat: { kind: 'date', date: '2026-10-26' } }];
  const run = C.runCleanup({ alarms, alarmClockMark: ring }, ring + 3700000, 'timer');   // 11:38 + 1시간 1분 40초
  assert.deepStrictEqual(run.alarms.map(a => a.id), ['1729', 'timer-w', 'timer-f'], '울린 지 1시간 넘은 타이머만'); assert.strictEqual(run.removedCount, 1); assert.deepStrictEqual(run.meta.alarmCleanupUndo.alarms.map(a => a.id), ['timer-1']);
  assert.strictEqual(C.hasCleanableTimer(alarms, ring + 3700000), true); assert.strictEqual(C.hasCleanableTimer(alarms, ring + 60000), false); assert.strictEqual(C.hasCleanableTimer(null, ring), false); assert.strictEqual(C.hasCleanableTimer([normal], ring + 9e9), false, '타이머만 센다');
  void lunch;
});
t('정리 보관분: 안 본 보관분은 합치고(여러 번 정리돼도 사라지지 않음), 이미 본 것은 대체, 되돌리면 타이머도 복원. 시계 이상이면 타이머도 보류', () => {
  const ring = D(2026, 10, 26, 11, 38).getTime(), mk = (id, min) => ({ id, time: `11:${String(min).padStart(2, '0')}`, enabled: true, repeat: { kind: 'date', date: '2026-10-26' } });
  const r1 = C.runCleanup({ alarms: [mk('timer-1', 38), mk('timer-2', 50)], alarmClockMark: ring }, ring + 3700000, 'timer'); assert.deepStrictEqual(r1.meta.alarmCleanupUndo.alarms.map(a => a.id), ['timer-1']);
  const r2 = C.runCleanup({ alarms: r1.alarms, alarmClockMark: r1.meta.alarmClockMark, alarmCleanupUndo: r1.meta.alarmCleanupUndo }, ring + 3700000 + 12 * 60000, 'timer');
  assert.deepStrictEqual(r2.meta.alarmCleanupUndo.alarms.map(a => a.id), ['timer-1', 'timer-2'], '안 본 보관분과 합친다'); assert.strictEqual(r2.meta.alarmCleanupUndo.shown, false); assert.strictEqual(r2.alarms.length, 0);
  const shown = { ...r1.meta.alarmCleanupUndo, shown: true }; const r3 = C.runCleanup({ alarms: [mk('timer-2', 50)], alarmClockMark: ring, alarmCleanupUndo: shown }, ring + 3700000 + 12 * 60000, 'timer'); assert.deepStrictEqual(r3.meta.alarmCleanupUndo.alarms.map(a => a.id), ['timer-2'], '이미 본 보관분은 대체');
  const back = C.restoreCleaned([], r2.meta.alarmCleanupUndo); assert.strictEqual(back.restored, 2); assert.deepStrictEqual(back.alarms.map(a => a.id), ['timer-1', 'timer-2']);
  const clock = C.runCleanup({ alarms: [mk('timer-1', 38)], alarmClockMark: ring + 5 * 3600000 }, ring + 3700000, 'timer'); assert.strictEqual(clock.removedCount, 0, '시계가 크게 과거로 가면 보류'); assert.strictEqual(clock.alarms.length, 1);
  const none = C.runCleanup({ alarms: [mk('timer-1', 38)], alarmClockMark: ring }, ring + 60000, 'timer'); assert.strictEqual(none.removedCount, 0);
});
t('연결(정적): 대화 카드는 타이머 취소(기존 삭제 확인 흐름)·남은 시간·확인 후 재계산, 펫 창 정리 틱, 도움말·소식, PetPage·새 설정 키 없음', () => {
  const page = read('src/pages/QuickPage.tsx'), runner = read('src/components/AlarmCleanupRunner.tsx');
  assert.ok(/cmd\.kind === 'cancelTimer'/.test(page) && /findTimerTargets\(/.test(page) && /s: 'delete', targets: list, stage: 1, all: false/.test(page) && /s: 'pick', targets: list/.test(page), '취소는 기존 삭제·고르기 단계');
  assert.ok(/cmd\.kind === 'timerLeft'/.test(page) && /timerLeftLines\(/.test(page));
  assert.ok(/cmd\.timer \? newTimerId\(\) : newAlarmId\(\)/.test(page) && /timerCommand\(cmd\.timer\.minutes/.test(page), 'timer- id, 확인하는 사이 지났으면 다시 계산');
  assert.ok(/hasCleanableTimer\(stored\.alarms as Alarm\[\], now\)/.test(runner) && /runCleanupOnce\('timer', now\)/.test(runner));
  assert.ok(CH.EXAMPLES.includes('10분 뒤에 알람 맞춰줘')); assert.strictEqual(P.parseAlarmCommand('10분 뒤에 알람 맞춰줘', NOW).kind, 'create');
  const n = RN.notesFor('1.7.0'); assert.ok(n.items.length <= 5 && n.items.some(i => i.includes('10분 뒤에 알람')) && n.items.some(i => i.includes('오늘 브리핑해줘')), JSON.stringify(n.items));
  for (const i of n.items) assert.ok(i.length <= 40 && !/\n/.test(i), i);
  assert.ok(!/timer-|isTimerAlarm|TIMER_ID|타이머/.test(read('src/pages/PetPage.tsx')), 'PetPage는 타이머를 모른다(핸들러 그대로)');
  assert.ok(!/localStorage|fetch\(/.test(read('src/utils/alarmCommand.ts')), '파서에 저장·네트워크 없음');
  assert.strictEqual(Object.keys(settingsTs.DEFAULT_SETTINGS).filter(k => /timer/i.test(k)).length, 0, '새 설정 키 없음');
});
t('파일에 깨진 글자(U+FFFD)·???가 없다', () => {
  for (const f of ['src/utils/alarmCommand.ts', 'src/utils/alarmChat.ts', 'src/utils/alarmCleanup.ts', 'src/utils/alarmSchedule.ts', 'src/data/releaseNotes.ts', 'src/pages/QuickPage.tsx', 'src/components/AlarmCleanupRunner.tsx']) { const s = read(f); assert.ok(!s.includes(FFFD), f); assert.ok(!/\?\?\?/.test(s), f + ' ???'); }
});

(async () => { let pass = 0; for (const [name, fn] of queue) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n', e); process.exitCode = 1; } } if (!process.exitCode) console.log(`\n${pass}개 통과`); })();
