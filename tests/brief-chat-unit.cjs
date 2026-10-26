// 대화하기의 "브리핑" 명령 단위 테스트: 지원 표현(공백·해줘/보여줘 변형), 내일 브리핑, 이번 주·다음 주 거절 안내, 기존 알람 조회·생성·삭제 문장은 그대로,
// 우선순위(브리핑 우선 / 만들기·지우기 우선), 수동 요청은 조건 무시(토글 꺼짐·주말·공휴일·lastBriefDate 안 바꿈), 내일 내용(퇴근 줄 없음), 큐 우선순위, 연결(정적 확인).
// `node tests/brief-chat-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, (p) => (p in deps ? deps[p] : {})); return m.exports; };
const N = require('../notice-card.cjs'), Q = require('../quick-menu.cjs'), S = require('../brief-schedule.cjs');
const settingsTs = load('src/utils/settings.ts', { './theme': { seedFreshTheme() {} } });
const sched = load('src/utils/alarmSchedule.ts', { './settings': settingsTs });
const text = load('src/utils/alarmText.ts', { './settings': settingsTs });
const WOM = load('src/utils/weekOfMonth.ts', { './alarmSchedule': sched });
const P = load('src/utils/alarmCommand.ts', { './alarmSchedule': sched, './weekOfMonth': WOM });
const CH = load('src/utils/alarmChat.ts', { './alarmSchedule': sched, './alarmText': text, './alarmCommand': P });
const kind = load('src/utils/alarmKind.ts', { './alarmText': text, './alarmSchedule': sched });
const quick = load('src/utils/quickAlarms.ts', { './alarmSchedule': sched, './alarmText': text, './alarmKind': kind });
const holidays = load('src/data/holidays.ts'), wcard = load('src/utils/weatherCard.ts');
const B = load('src/utils/brief.ts', { '../data/holidays': holidays, './quickAlarms': quick, './alarmKind': kind, './weatherCard': wcard });
const RN = load('src/data/releaseNotes.ts');
const FFFD = String.fromCharCode(0xFFFD);
const D = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);
const NOW = D(2026, 10, 24, 14, 10);   // 토 14:10 (주말)
const cmd = (s, now = NOW) => P.parseAlarmCommand(s, now);
const al = (o = {}) => ({ id: 'a' + Math.random().toString(36).slice(2, 8), time: '09:00', enabled: true, repeat: { kind: 'date', date: '2026-10-24' }, ...o });
const cfg = (alarms = []) => ({ lunchOn: true, leaveOn: true, lunchTime: '12:00', leaveTime: '18:00', alarms });

t('지원 표현: 브리핑·오늘 브리핑·브리핑해줘·브리핑 해줘·브리핑 보여줘·오늘 일정 브리핑·오늘 브리핑해줘(공백·조사 변형 포함) → 오늘 브리핑', () => {
  for (const s of ['브리핑', '오늘 브리핑', '브리핑해줘', '브리핑 해줘', '브리핑 보여줘', '브리핑해 줘', '브리핑 해주세요', '브리핑 보여 주세요', '오늘 일정 브리핑', '오늘 브리핑해줘', '오늘 브리핑 해줘', '오늘 브리핑 보여줘', '  오늘   브리핑   해줘  ', '브리핑해줘!', '오늘 브리핑해줘~', '오늘 알람 브리핑해줘', '오늘 일정 브리핑 보여줘']) {
    const c = cmd(s); assert.strictEqual(c.kind, 'brief', s + ' → ' + JSON.stringify(c)); assert.strictEqual(c.target, 'today', s); assert.strictEqual(c.date, '2026-10-24', s);
  }
});
t('내일 브리핑: "내일 브리핑"·"내일 브리핑해줘"·"내일 일정 브리핑 보여줘" → 내일 날짜 기준(월말·연말도)', () => {
  for (const s of ['내일 브리핑', '내일 브리핑해줘', '내일 브리핑 해줘', '내일 일정 브리핑 보여줘']) { const c = cmd(s); assert.deepStrictEqual({ kind: c.kind, target: c.target, date: c.date }, { kind: 'brief', target: 'tomorrow', date: '2026-10-25' }, s); }
  assert.strictEqual(cmd('내일 브리핑', D(2026, 10, 31, 9, 0)).date, '2026-11-01');
  assert.strictEqual(cmd('내일 브리핑', D(2026, 12, 31, 23, 50)).date, '2027-01-01');
});
t('이번 주·다음 주·주차·다른 날짜·요일 브리핑은 지원하지 않고 안내 문구로 거절한다', () => {
  for (const s of ['이번 주 브리핑', '다음 주 브리핑해줘', '이번주 브리핑', '주간 브리핑', '11월 2주차 브리핑', '이번 달 둘째 주 브리핑', '모레 브리핑', '내일모레 브리핑해줘', '금요일 브리핑', '10월 30일 브리핑', '3일 뒤 브리핑', '다음 주 금요일 브리핑']) {
    const c = cmd(s); assert.deepStrictEqual({ kind: c.kind, intent: c.intent, reason: c.reason }, { kind: 'reject', intent: 'query', reason: '오늘이나 내일 브리핑만 해드릴 수 있어요' }, s + ' → ' + JSON.stringify(c));
  }
  assert.strictEqual(P.REASON.briefOnly, '오늘이나 내일 브리핑만 해드릴 수 있어요');
});
t('기존 조회 문장은 그대로: 오늘 알람 뭐 있어? · 알람 알려줘 · 내일 알람 보여줘 · 다음 주 알람 알려줘 · 11월 2주차 알람', () => {
  assert.deepStrictEqual(cmd('오늘 알람 뭐 있어?'), { kind: 'query', date: '2026-10-24' });
  assert.deepStrictEqual(cmd('알람 알려줘'), { kind: 'query', date: '2026-10-24' });
  assert.deepStrictEqual(cmd('내일 알람 보여줘'), { kind: 'query', date: '2026-10-25' });
  assert.strictEqual(cmd('다음 주 알람 알려줘').kind, 'query'); assert.ok(cmd('다음 주 알람 알려줘').week);
  assert.strictEqual(cmd('11월 2주차 알람 알려줘').kind, 'query');
  assert.strictEqual(cmd('오늘 일정 알려줘').kind, 'query');
});
t('기존 생성·삭제 문장은 그대로: 내일 오후 3시에 회의 알람 만들어줘 · 내일 오후 3시 알람 취소해줘 · 30분 뒤 알람', () => {
  const c = cmd('내일 오후 3시에 회의 알람 만들어줘'); assert.deepStrictEqual({ k: c.kind, d: c.date, t: c.time, ti: c.title }, { k: 'create', d: '2026-10-25', t: '15:00', ti: '회의' });
  const x = cmd('내일 오후 3시 알람 취소해줘'); assert.strictEqual(x.kind, 'cancel'); assert.strictEqual(x.date, '2026-10-25'); assert.strictEqual(x.time, '15:00');
  assert.strictEqual(cmd('30분 뒤 알람 맞춰줘').kind, 'create');
  assert.strictEqual(cmd('3시에 알람 만들어줘').kind, 'needsMeridiem');
  assert.strictEqual(cmd('알람 다 지워줘').kind, 'cancel');
  assert.strictEqual(cmd('안녕').kind, 'unknown'); assert.strictEqual(cmd('').kind, 'unknown'); assert.strictEqual(cmd('오늘 날씨 어때').kind, 'unknown');
});
t('우선순위: "브리핑"이 들어 있어도 확실한 만들기·지우기 문장은 기존 동작이 이긴다 / 약한 "해줘"만 있으면 브리핑이 이긴다', () => {
  assert.strictEqual(cmd('브리핑 회의 3시에 알람 만들어줘').kind, 'needsMeridiem', '시각 + 만들기');
  const c = cmd('내일 오후 3시에 브리핑 회의 알람 만들어줘'); assert.strictEqual(c.kind, 'create'); assert.strictEqual(c.title, '브리핑 회의'); assert.strictEqual(c.time, '15:00');
  assert.strictEqual(cmd('브리핑 회의 오후 3시 설정해줘').kind, 'create');
  assert.strictEqual(cmd('오후 3시에 브리핑 알람 추가해줘').kind, 'create');
  assert.strictEqual(cmd('브리핑 알람 삭제해줘').kind, 'cancel');
  assert.strictEqual(cmd('오후 3시 브리핑 알람 취소해줘').kind, 'cancel');
  assert.strictEqual(cmd('브리핑 일정 추가해줘').kind, 'reject', '시각 없는 만들기는 기존대로 시각을 되묻는다(브리핑 카드가 아니다)');
  assert.strictEqual(cmd('브리핑 일정 추가해줘').reason, P.REASON.needTime);
  // 브리핑 우선
  assert.strictEqual(cmd('오늘 알람 브리핑해줘').kind, 'brief');
  assert.strictEqual(cmd('내일 알람 브리핑 해줘').target, 'tomorrow');
  assert.strictEqual(cmd('브리핑 알려줘').kind, 'brief'); assert.strictEqual(cmd('브리핑 확인해줘').kind, 'brief');
  assert.strictEqual(cmd('오후 3시 브리핑 보여줘').kind, 'brief', '시각 말이 있어도 만들기 말이 없으면 브리핑');
});
t('입력은 저장되지 않는다: 결과에 원문이 들어 있지 않고, 길거나 비정상 입력은 unknown', () => {
  const c = cmd('오늘 브리핑해줘'); assert.deepStrictEqual(Object.keys(c).sort(), ['date', 'kind', 'target']);
  assert.strictEqual(cmd('브리핑 ' + 'ㅋ'.repeat(300)).kind, 'unknown'); assert.strictEqual(cmd(null).kind, 'unknown'); assert.strictEqual(cmd(42).kind, 'unknown');
});
t('수동 요청은 조건을 무시한다: 토글 꺼짐·주말·공휴일·오늘 이미 띄움이어도 보이고, 기록(persist)은 바꾸지 않는다', () => {
  const base = (o = {}) => ({ stored: { briefEnabled: false, lastBriefDate: '2026-10-24' }, now: NOW, settings: cfg(), leaveEnabled: true, leaveTime: '18:00', weather: null, ...o });
  const today = B.decideBrief({ day: '2026-10-24', manual: true, target: 'today' }, base());
  assert.ok('view' in today, '꺼짐+주말+이미 띄움'); assert.strictEqual(today.view.persist, false, 'lastBriefDate를 갱신하지 않는다');
  assert.strictEqual(today.view.content.emptyText, '오늘은 등록된 일정이 없어요'); assert.strictEqual(today.view.content.label, '오늘'); assert.strictEqual(today.view.content.leave, '퇴근 18:00');
  const hol = B.decideBrief({ manual: true, target: 'today' }, base({ now: D(2026, 10, 9, 9, 0) })); assert.ok('view' in hol); assert.strictEqual(hol.view.content.holiday, '한글날');
  const noStore = B.decideBrief({ manual: true, target: 'today' }, base({ stored: null })); assert.ok('view' in noStore, '저장 설정이 없어도(시험·새 설치) 직접 요청은 보인다');
  const auto = B.decideBrief({ day: '2026-10-24' }, base()); assert.ok('skip' in auto, '같은 조건의 자동 브리핑은 그대로 건너뛴다(자동 규칙은 영향 없음)');
});
t('내일 브리핑 내용: 내일 날짜·요일(+공휴일), 내일의 반복·날짜 알람을 시각순, 지난 시각 걸러내기 없음, 퇴근 줄 없음, 일정이 없으면 "내일은 ..."', () => {
  const alarms = [al({ time: '14:00', name: '치과', repeat: { kind: 'date', date: '2026-10-25' } }), al({ time: '00:30', repeat: { kind: 'weekly', days: [0] } }), al({ time: '09:00', repeat: { kind: 'date', date: '2026-10-24' } }), al({ time: '10:00', repeat: { kind: 'weekly', days: [3] } }), al({ time: '13:00', endTime: '14:00', name: '리뷰', repeat: { kind: 'date', date: '2026-10-25' } })];
  const r = B.decideBrief({ manual: true, target: 'tomorrow' }, { stored: { briefEnabled: false }, now: NOW, settings: cfg(alarms), leaveEnabled: true, leaveTime: '18:00', weather: null });
  assert.ok('view' in r); const c = r.view.content;
  assert.strictEqual(c.dateText, '10월 25일 일요일'); assert.strictEqual(c.label, '내일'); assert.strictEqual(c.leave, null, '내일 브리핑에는 퇴근 줄이 없다');
  assert.deepStrictEqual(c.items.map(i => i.time), ['00:30', '13:00', '14:00'], '내일 것만 시각순(00:30은 지금보다 이른 시각이어도 포함)'); assert.strictEqual(c.more, 0);
  assert.deepStrictEqual(c.items.map(i => i.label), ['알람', '일정', '일정']);
  assert.strictEqual(r.view.persist, false);
  const e = B.decideBrief({ manual: true, target: 'tomorrow' }, { stored: null, now: NOW, settings: cfg(), leaveEnabled: true, leaveTime: '18:00', weather: null });
  assert.strictEqual(e.view.content.emptyText, '내일은 등록된 일정이 없어요');
  const many = B.buildBrief({ now: D(2026, 10, 25), tomorrow: true, settings: cfg([1, 2, 3, 4, 5].map(i => al({ time: `0${i}:00`, repeat: { kind: 'date', date: '2026-10-25' } }))), leaveEnabled: true, leaveTime: '18:00', weather: null });
  assert.strictEqual(many.items.length, 3); assert.strictEqual(many.more, 2);
});
t('날씨(캐시만): 오늘은 지금 기온+최고·최저, 내일은 내일 최고·최저(+정오 날씨)만, 캐시가 없으면 생략', () => {
  const d0 = D(2026, 10, 24).getTime(), d1 = D(2026, 10, 25).getTime(), noon1 = D(2026, 10, 25, 12).getTime();
  const wx = { temp: 18.4, feels: 17, code: 0, wind: 1, hours: [{ at: noon1, temp: 15, feels: 14, pop: 10, code: 61, wind: 1 }], days: [{ at: d0, max: 20, min: 10, pop: 0 }, { at: d1, max: 14.6, min: 6.2, pop: 80 }] };
  assert.strictEqual(B.weatherLine(wx, NOW.getTime()), '맑음 18° · 최고 20° / 최저 10°');
  assert.strictEqual(B.weatherLine(wx, d1, true), '비 · 최고 15° / 최저 6° · 비 올 확률 80%', '내일: 지금 기온(18°)은 쓰지 않는다');
  assert.strictEqual(B.weatherLine({ ...wx, days: [{ at: d0, max: 20, min: 10, pop: 0 }] }, d1, true), null, '내일 값이 없으면 생략');
  assert.strictEqual(B.weatherLine(null, d1, true), null);
});
t('큐: 직접 요청은 자동 카드보다 앞에 서고(떠 있는 카드는 끊지 않음), 먼저 요청한 직접 요청 뒤에 서며, 막힌 동안에는 기다린다', () => {
  const FREE = { petVisible: true, focus: false, quickOpen: false, alertCount: 0, quitting: false };
  const q = N.createNoticeQueue();
  q.enqueue({ kind: 'whatsnew', key: '1.7.0' }); q.enqueue({ kind: 'brief', key: '2026-10-24', payload: { day: '2026-10-24' } });
  const m1 = q.enqueue({ kind: 'brief', key: 'manual-today', payload: { manual: true }, priority: true }), m2 = q.enqueue({ kind: 'brief', key: 'manual-tomorrow', payload: { manual: true, target: 'tomorrow' }, priority: true });
  assert.deepStrictEqual(q.list().map(x => x.key), ['manual-today', 'manual-tomorrow', '1.7.0', '2026-10-24']);
  assert.strictEqual(q.enqueue({ kind: 'brief', key: 'manual-today', priority: true }).dup, true, '같은 요청은 한 장');
  for (const b of [{ quickOpen: true }, { alertCount: 1 }]) assert.strictEqual(q.peek({ now: 1e9, blockers: { ...FREE, ...b } }), null, JSON.stringify(b));   // 초집중 중에는 브리핑이 대기하지 않는다(notice-card-unit)
  assert.strictEqual(q.peek({ now: 1e9, blockers: { ...FREE, focus: true } }).id, m1.item.id, '초집중 중에도 직접 요청 브리핑이 먼저');
  const first = q.peek({ now: 1e9, blockers: FREE }); assert.strictEqual(first.id, m1.item.id); q.start(first.id);
  const m3 = q.enqueue({ kind: 'brief', key: 'x', priority: true }); assert.strictEqual(q.active.id, m1.item.id, '떠 있는 카드는 그대로'); assert.ok(m3);
  assert.strictEqual(q.peek({ now: 1e9, blockers: FREE }), null, '한 번에 하나');
  const pet = N.createNoticeQueue(); assert.strictEqual(pet.enqueue({ kind: 'brief', key: 'a' }).item.priority, false);
});
t('연결(정적): 퀵 동작 brief, 대화 카드는 확인 없이 바로 요청, 메인은 manual+priority로 쌓고 lastBriefDate를 건드리지 않으며, 알람 스케줄러·PetPage·새 설정 키 없음', () => {
  assert.ok(Q.isQuickAction('brief')); assert.ok(!Q.isQuickAction('briefx'));
  const page = read('src/pages/QuickPage.tsx'), main = read('main.cjs');
  assert.ok(/cmd\.kind === 'brief'\) \{ api\(\)\?\.quickAction\('brief', \{ target: cmd\.target \}\); return; \}/.test(page), '확인 카드(setStep) 없이 바로');
  assert.ok(/function requestBrief\(target\)/.test(main) && /manual: true, target: t \}, true\)/.test(main), 'manual + priority');
  assert.ok(/target === 'tomorrow' \? 'tomorrow' : 'today'/.test(main), 'target은 두 값만');
  assert.ok(/action === 'brief'\) \{ requestBrief\(arg && arg\.target\)/.test(main) && /ipcMain\.on\('brief-show', \(\) => \{ requestBrief\('today'\)/.test(main));
  assert.ok(!/lastBriefDate/.test(main) && !/lastBriefDate/.test(read('src/utils/alarmCommand.ts')), '메인·파서는 lastBriefDate를 모른다');
  assert.ok(/persist: !force/.test(read('src/utils/brief.ts')));
  assert.ok(!/brief/i.test(read('alarms.cjs')) && !/brief/i.test(read('src/pages/PetPage.tsx')));
  assert.ok(!/localStorage|fetch\(/.test(read('src/utils/alarmCommand.ts')), '파서는 저장·네트워크가 없다');
  for (const k of ['briefEnabled', 'lastBriefDate']) assert.ok(k in settingsTs.DEFAULT_SETTINGS); assert.strictEqual(Object.keys(settingsTs.DEFAULT_SETTINGS).filter(k => /brief/i.test(k)).length, 2, '브리핑 설정 키는 그대로 2개');
});
t('도움말·소식: 대화 예시에 "오늘 브리핑해줘" 한 줄, 1.7.0 소식에 대화 브리핑 문구(항목은 5개 이하·한 줄), 예시를 눌러도 같은 문장이 파싱된다', () => {
  assert.ok(CH.EXAMPLES.includes('오늘 브리핑해줘')); assert.strictEqual(P.parseAlarmCommand('오늘 브리핑해줘', NOW).kind, 'brief');
  const n = RN.notesFor('1.7.0'); assert.ok(n.items.length >= 3 && n.items.length <= 5, String(n.items.length)); assert.ok(n.items.some(i => i.includes('오늘 브리핑해줘')));
  for (const i of n.items) assert.ok(!/\n/.test(i) && i.length <= 60, i);
});
t('파일에 깨진 글자(U+FFFD)·???가 없다', () => {
  for (const f of ['src/utils/alarmCommand.ts', 'src/utils/brief.ts', 'src/data/releaseNotes.ts', 'src/pages/QuickPage.tsx', 'src/pages/NoticePage.tsx', 'notice-card.cjs', 'quick-menu.cjs', 'main.cjs']) { const s = read(f); assert.ok(!s.includes(FFFD), f); assert.ok(!/\?\?\?/.test(s), f + ' ???'); }
});

(async () => { let pass = 0; for (const [name, fn] of queue) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n', e); process.exitCode = 1; } } if (!process.exitCode) console.log(`\n${pass}개 통과`); })();
