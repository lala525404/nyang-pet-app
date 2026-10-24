// 알람 대화 단위 테스트: 문장 해석(날짜·시간·의도·제목·거절·unknown), 지울 알람 찾기, 확인 문구, 설정 값 바꾸기(만들기·지우기·끄기·되돌리기),
// 스케줄러(alarms.cjs)와의 연결(날짜 한 번짜리 알람이 정확히 한 번만 울림, 기존 알람의 울림은 그대로), 개인정보(입력 문장 저장·기록 없음).
// `node tests/alarm-command-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, (p) => (p in deps ? deps[p] : {})); return m.exports; };
const A = require('../alarms.cjs');
const settingsTs = load('src/utils/settings.ts');
const sched = load('src/utils/alarmSchedule.ts', { './settings': settingsTs });
const text = load('src/utils/alarmText.ts', { './settings': settingsTs });
const P = load('src/utils/alarmCommand.ts', { './alarmSchedule': sched });
const CH = load('src/utils/alarmChat.ts', { './alarmSchedule': sched, './alarmText': text, './alarmCommand': P });
const QA = load('src/utils/quickAlarms.ts', { './alarmSchedule': sched, './alarmText': text });
const FFFD = String.fromCharCode(0xFFFD);
const D = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);

// 기준 시각: 2026-10-24(토) 14:10
const NOW = D(2026, 10, 24, 14, 10);
const NOW_MORNING = D(2026, 10, 26, 2, 0);          // 월 02:00
const NOW_JAN31 = D(2026, 1, 31, 10, 0);            // 월말
const NOW_LEAP = D(2028, 2, 28, 10, 0);             // 윤년 2월 28일
const NOW_FEB = D(2026, 2, 28, 10, 0);              // 평년 2월 28일
const NOW_DEC31 = D(2026, 12, 31, 23, 50);          // 연말
const NOW_SUN = D(2026, 10, 25, 9, 0);              // 일요일(주의 마지막 날)

const match = (got, want, label) => { for (const [k, v] of Object.entries(want)) assert.deepStrictEqual(got[k], v, `${label}: ${k}  got=${JSON.stringify(got)}`); };
const cases = [];
const row = (input, want, now = NOW) => cases.push([input, want, now]);
const create = (date, time, title = '', ambiguous = false, extra = {}) => ({ kind: 'create', date, time, title, ambiguous, ...extra });
const rej = (intent, reason) => ({ kind: 'reject', intent, reason });

// ── 만들기: 날짜 표현 ────────────────────────────────────────────────────────
row('내일 오후 3시에 회의 알람 만들어줘', create('2026-10-25', '15:00', '회의'));
row('모레 오전 9시 알람 추가해줘', create('2026-10-26', '09:00'));
row('오늘 오후 5시 알람 만들어줘', create('2026-10-24', '17:00'));
row('11월 3일 오전 10시 알람 만들어줘', create('2026-11-03', '10:00'));
row('12월 25일 오후 3시에 알람 설정해줘', create('2026-12-25', '15:00'));
row('25일 오후 2시 알람 만들어줘', create('2026-10-25', '14:00'));
row('10일 오전 9시 알람 만들어줘', create('2026-11-10', '09:00'));      // 이미 지난 일은 다음 달
row('24일 오후 6시 알람 만들어줘', create('2026-10-24', '18:00'));      // 오늘
row('31일 오전 8시 알람 만들어줘', create('2026-10-31', '08:00'));
row('3일 뒤 오전 8시 알람 만들어줘', create('2026-10-27', '08:00'));
row('10일 뒤 오전 9시 알람 만들어줘', create('2026-11-03', '09:00'));    // 달을 넘김
row('8일 뒤 오전 9시 알람 만들어줘', create('2026-11-01', '09:00'));
row('일주일 뒤 오전 9시 알람 만들어줘', create('2026-10-31', '09:00'));
row('2주 뒤 오후 3시 알람 만들어줘', create('2026-11-07', '15:00'));
row('1주일 후 오전 9시 알람 만들어줘', create('2026-10-31', '09:00'));
row('2026년 12월 25일 오후 3시 알람 만들어줘', create('2026-12-25', '15:00'));
// ── 요일(오늘 2026-10-24 토요일, 주는 월요일 시작) ───────────────────────────
row('월요일 오전 10시 알람 만들어줘', create('2026-10-26', '10:00'));
row('금요일 오후 2시 알람 만들어줘', create('2026-10-30', '14:00'));
row('일요일 오전 7시 알람 만들어줘', create('2026-10-25', '07:00'));
row('토요일 오후 5시 알람 만들어줘', create('2026-10-24', '17:00'));     // 오늘이 그 요일이고 시각이 남았다
row('토요일 오전 9시 알람 만들어줘', create('2026-10-31', '09:00'));     // 오늘 시각이 지났으니 다음 주
row('토요일 3시에 알람 만들어줘', create('2026-10-24', '15:00', '', true));
row('다음 주 월요일 오전 10시 알람 설정', create('2026-10-26', '10:00'));
row('다음 주 금요일 오후 3시 알람 만들어줘', create('2026-10-30', '15:00'));
row('담주 수요일 오후 2시 알람 만들어줘', create('2026-10-28', '14:00'));
row('이번 주 일요일 오후 3시 알람 만들어줘', create('2026-10-25', '15:00'));   // 이번 주 = 월 10-19 ~ 일 10-25
row('이번 주 토요일 오후 5시 알람 만들어줘', create('2026-10-24', '17:00'));
row('이번 주 월요일 오전 10시 알람 만들어줘', rej('create', '지난 날짜예요'));
row('이번 주 토요일 오전 9시 알람 만들어줘', rej('create', '이미 지난 시간이에요'));
row('이번 주 알람 알려줘', rej('query', '이번 주·다음 주는 요일도 같이 말해 주세요'));
row('다음 주 월요일 알람 만들어줘 오후 3시', create('2026-10-26', '15:00'), NOW_SUN);   // 일요일 기준 "다음 주"는 내일(월)
row('이번 주 일요일 오후 3시 알람 만들어줘', create('2026-10-25', '15:00'), NOW_SUN);
row('이번 주 월요일 오후 3시 알람 만들어줘', rej('create', '지난 날짜예요'), NOW_SUN);
// ── 시간 표현 ────────────────────────────────────────────────────────────────
row('저녁 7시 반에 알람 만들어줘', create('2026-10-24', '19:30'));
row('아침 8시 15분 알람 만들어줘', create('2026-10-25', '08:15'));        // 오늘 8시는 지났으니 내일
row('밤 11시 알람 만들어줘', create('2026-10-24', '23:00'));
row('새벽 5시 알람 만들어줘', create('2026-10-25', '05:00'));
row('오후 3시 45분 알람 만들어줘', create('2026-10-24', '15:45'));
row('내일 오후 3시 반 알람 만들어줘', create('2026-10-25', '15:30'));
row('내일 정오에 알람 만들어줘', create('2026-10-25', '12:00'));
row('정오에 알람 만들어줘', create('2026-10-25', '12:00'));                // 오늘 정오는 지났다
row('15:30 알람 만들어줘', create('2026-10-24', '15:30'));
row('09:05 알람 만들어줘', create('2026-10-25', '09:05'));
row('내일 18:00 알람 만들어줘', create('2026-10-25', '18:00'));
row('15시 30분 알람 만들어줘', create('2026-10-24', '15:30'));
row('내일 오전 12시 알람 만들어줘', create('2026-10-25', '00:00'));
row('내일 오후 12시 알람 만들어줘', create('2026-10-25', '12:00'));
row('내일 12시 알람 만들어줘', create('2026-10-25', '12:00', '', true));
row('30분 뒤 알람 만들어줘', create('2026-10-24', '14:40'));
row('10분 후에 알람 만들어줘', create('2026-10-24', '14:20'));
row('1시간 뒤 알람 만들어줘', create('2026-10-24', '15:10'));
row('한 시간 뒤 알람 만들어줘', create('2026-10-24', '15:10'));
row('2시간 30분 뒤에 알람 만들어줘', create('2026-10-24', '16:40'));
row('1시간 반 뒤 알람 만들어줘', create('2026-10-24', '15:40'));
row('12시간 뒤 알람 만들어줘', create('2026-10-25', '02:10'));            // 날짜를 넘김
// ── 오전/오후 모호 ───────────────────────────────────────────────────────────
row('오늘 3시 알람 만들어줘', create('2026-10-24', '15:00', '', true));    // 지금 기준 가장 가까운 미래(03:00은 지났다)
row('오늘 3시 알람 만들어줘', create('2026-10-26', '03:00', '', true).kind ? { kind: 'create', date: '2026-10-26', time: '03:00', ambiguous: true } : {}, NOW_MORNING);   // 새벽 2시에는 오전 3시
row('오늘 1시 알람 만들어줘', rej('create', '이미 지난 시간이에요'));        // 01:00·13:00 모두 지났다
row('1시에 알람 만들어줘', create('2026-10-25', '13:00', '', true));       // 날짜 없음: 내일, 다른 날의 1~5시는 오후
row('내일 3시 알람 만들어줘', create('2026-10-25', '15:00', '', true));
row('내일 7시 알람 만들어줘', create('2026-10-25', '07:00', '', true));     // 6~11시는 오전
row('내일 오전 3시 알람 만들어줘', create('2026-10-25', '03:00'));          // 말하면 모호하지 않다
row('금요일 7시 알람 만들어줘', create('2026-10-30', '07:00', '', true));
row('7시 반에 알람 만들어줘', create('2026-10-24', '19:30', '', true));      // 오늘 07:30은 지났으니 가장 가까운 미래는 오후 7시 30분
row('7시 반에 알람 만들어줘', create('2026-10-26', '07:30', '', true), NOW_MORNING);   // 새벽 2시에는 오전 7시 30분
// ── 12시·자정·정오 경계 ─────────────────────────────────────────────────────
row('내일 자정에 알람 만들어줘', create('2026-10-26', '00:00', '', false, { midnight: true }));   // 내일 밤 12시 = 모레 0시
row('오늘 자정에 알람 만들어줘', create('2026-10-25', '00:00', '', false, { midnight: true }));
row('내일 밤 12시 알람 만들어줘', create('2026-10-26', '00:00', '', false, { midnight: true }));
row('24시 알람 만들어줘', create('2026-10-25', '00:00', '', false, { midnight: true }));
row('자정에 알람 만들어줘', create('2026-10-25', '00:00', '', false, { midnight: true }), NOW_MORNING.getTime() ? NOW : NOW);
row('오전 0시 알람 만들어줘', create('2026-10-25', '00:00'));
// ── 월말·윤년·연말·존재하지 않는 날짜 ─────────────────────────────────────────
row('내일 오전 9시 알람 만들어줘', create('2026-02-01', '09:00'), NOW_JAN31);
row('31일 오후 9시 알람 만들어줘', create('2026-01-31', '21:00'), NOW_JAN31);
row('30일 오전 9시 알람 만들어줘', rej('create', '그런 날짜는 없어요'), NOW_JAN31);    // 다음 달(2월)에 30일이 없다
row('2월 29일 오후 3시 알람 만들어줘', create('2028-02-29', '15:00'), NOW_LEAP);
row('내일 오전 9시 알람 만들어줘', create('2028-02-29', '09:00'), NOW_LEAP);
row('모레 오전 9시 알람 만들어줘', create('2028-03-01', '09:00'), NOW_LEAP);
row('2월 29일 오후 3시 알람 만들어줘', rej('create', '그런 날짜는 없어요'));            // 2026년은 평년
row('내일 오전 9시 알람 만들어줘', create('2026-03-01', '09:00'), NOW_FEB);
row('29일 오전 9시 알람 만들어줘', rej('create', '그런 날짜는 없어요'), NOW_FEB);
row('2월 30일 오후 3시 알람 만들어줘', rej('create', '그런 날짜는 없어요'));
row('4월 31일 오후 3시 알람 만들어줘', rej('create', '그런 날짜는 없어요'));
row('13월 1일 오후 3시 알람 만들어줘', rej('create', '그런 날짜는 없어요'));
row('0월 5일 오후 3시 알람 만들어줘', rej('create', '그런 날짜는 없어요'));
row('11월 31일 오후 3시 알람 만들어줘', rej('create', '그런 날짜는 없어요'));
row('내일 오전 9시 알람 만들어줘', create('2027-01-01', '09:00'), NOW_DEC31);
row('1일 오전 9시 알람 만들어줘', create('2027-01-01', '09:00'), NOW_DEC31);
row('자정에 알람 만들어줘', create('2027-01-01', '00:00', '', false, { midnight: true }), NOW_DEC31);
row('12월 31일 오후 11시 55분 알람 만들어줘', create('2026-12-31', '23:55'), NOW_DEC31);
row('12월 31일 오후 11시 알람 만들어줘', rej('create', '이미 지난 시간이에요'), NOW_DEC31);
row('2027년 1월 1일 오전 9시 알람 만들어줘', rej('create', '올해 안의 날짜만 말할 수 있어요'));
// ── 지난 날짜·시간 거절 ─────────────────────────────────────────────────────
row('10월 23일 오후 3시 알람 만들어줘', rej('create', '지난 날짜예요'));
row('1월 1일 오전 9시 알람 만들어줘', rej('create', '지난 날짜예요'));        // 다음 해로 넘기지 않는다
row('2025년 12월 25일 오후 3시 알람 만들어줘', rej('create', '지난 날짜예요'));
row('10월 24일 오전 9시 알람 만들어줘', rej('create', '이미 지난 시간이에요'));
row('오늘 오전 9시 알람 만들어줘', rej('create', '이미 지난 시간이에요'));
row('오늘 오후 2시 알람 만들어줘', rej('create', '이미 지난 시간이에요'));
row('오늘 오후 2시 10분 알람 만들어줘', rej('create', '이미 지난 시간이에요'));   // 지금과 같은 분도 지난 것
row('오늘 오후 2시 11분 알람 만들어줘', create('2026-10-24', '14:11'));
row('오전 9시 알람 만들어줘', create('2026-10-25', '09:00'));                  // 날짜가 없으면 내일
// ── 시간 오류·시간 없음 ─────────────────────────────────────────────────────
row('25시 알람 만들어줘', rej('create', '시간을 다시 확인해 주세요'));
row('내일 3시 70분 알람 만들어줘', rej('create', '시간을 다시 확인해 주세요'));
row('내일 오후 13시 알람 만들어줘', rej('create', '시간을 다시 확인해 주세요'));
row('내일 알람 만들어줘', rej('create', '몇 시에 울릴지 알려 주세요'));
row('알람 만들어줘', rej('create', '몇 시에 울릴지 알려 주세요'));
// ── 제목 ─────────────────────────────────────────────────────────────────────
row("내일 오후 3시에 '병원 예약' 알람 만들어줘", create('2026-10-25', '15:00', '병원 예약'));
row('내일 오후 3시에 "치과" 알람 만들어줘', create('2026-10-25', '15:00', '치과'));
row('내일 오후 3시에 “약 먹기” 알람 만들어줘', create('2026-10-25', '15:00', '약 먹기'));
row('내일 오후 3시에 팀 미팅 알람 만들어줘', create('2026-10-25', '15:00', '팀 미팅'));
row('회의 알람 내일 오후 3시에 해줘', create('2026-10-25', '15:00', '회의'));
row('알람 추가해줘 오후 3시 팀 미팅 내일', create('2026-10-25', '15:00', '팀 미팅'));
row("내일 오후 3시에 '가나다라마바사아자차카타파하가나다라마바사아자차카' 알람 만들어줘", create('2026-10-25', '15:00', Array.from('가나다라마바사아자차카타파하가나다라마바사아자차카').slice(0, 20).join('')));   // 20자 제한
row("내일 오후 3시에 '🍕 점심' 알람 만들어줘", create('2026-10-25', '15:00', '🍕 점심'));
row('내일 오후 3시 알람 만들어줘', create('2026-10-25', '15:00', ''));          // 제목이 없으면 기본 이름(빈 값)
row('  내일   오후  3시에   회의  알람   만들어줘  ', create('2026-10-25', '15:00', '회의'));
// ── 알람이라는 말이 없는 문장 ────────────────────────────────────────────────
row('내일 오후 3시에 잡아줘', create('2026-10-25', '15:00'));
row('오후 3시에 깨워줘', create('2026-10-24', '15:00'));
row('내일 오후 3시에 해줘', { kind: 'unknown' });
row('내일 오후 3시', { kind: 'unknown' });
row('내일 오후 3시에 회의', { kind: 'unknown' });
// ── 취소·삭제 ────────────────────────────────────────────────────────────────
row('내일 오후 3시 알람 취소해줘', { kind: 'cancel', all: false, date: '2026-10-25', time: '15:00', hour12: null, title: '' });
row('3시 알람 지워줘', { kind: 'cancel', all: false, date: null, time: null, hour12: 3, minute: 0, title: '' });
row('3시 반 알람 삭제해줘', { kind: 'cancel', hour12: 3, minute: 30 });
row('알람 삭제', { kind: 'cancel', all: false, title: '' });
row('회의 알람 없애줘', { kind: 'cancel', title: '회의' });
row('점심 알람 꺼줘', { kind: 'cancel', title: '점심' });
row('알람 다 꺼줘', { kind: 'cancel', all: true });
row('모든 알람 지워줘', { kind: 'cancel', all: true });
row('알람 전부 삭제해줘', { kind: 'cancel', all: true });
row('내일 알람 다 지워줘', { kind: 'cancel', all: true, date: '2026-10-25' });
row('알람 꺼', { kind: 'cancel' });
row('10분 뒤 알람 취소해줘', { kind: 'cancel', date: '2026-10-24', time: '14:20' });
row('금요일 오전 9시 알람 취소해줘', { kind: 'cancel', date: '2026-10-30', time: '09:00' });
row('2월 30일 알람 지워줘', rej('cancel', '그런 날짜는 없어요'));
row('취소해줘', { kind: 'unknown' });
row('회의 취소해줘', { kind: 'unknown' });
// ── 조회 ─────────────────────────────────────────────────────────────────────
row('오늘 알람 뭐 있어', { kind: 'query', date: '2026-10-24' });
row('오늘 알람 뭐 있어?', { kind: 'query', date: '2026-10-24' });
row('알람 알려줘', { kind: 'query', date: '2026-10-24' });
row('내일 알람', { kind: 'query', date: '2026-10-25' });
row('내일 알람 알려줘', { kind: 'query', date: '2026-10-25' });
row('모레 알람 보여줘', { kind: 'query', date: '2026-10-26' });
row('금요일 알람 뭐 있어', { kind: 'query', date: '2026-10-30' });
row('10월 30일 알람 알려줘', { kind: 'query', date: '2026-10-30' });
row('다음 주 월요일 알람 보여줘', { kind: 'query', date: '2026-10-26' });
row('알람 몇 개 있어?', { kind: 'query', date: '2026-10-24' });
row('3일 뒤 알람 알려줘', { kind: 'query', date: '2026-10-27' });
row('일정 알려줘', { kind: 'query', date: '2026-10-24' });
row('알람', { kind: 'query', date: '2026-10-24' });
row('10월 1일 알람 알려줘', rej('query', '지난 날짜예요'));
// ── 인식 못 함·이상한 입력 ───────────────────────────────────────────────────
for (const s of ['', '   ', '안녕', '내일 날씨 알려줘', '😀😀😀', 'ㅋㅋㅋ', 'asdf', '고마워', '뭐 해?', '시간 알려줘', '👍', '\n\t', '!!!', '1234567890']) row(s, { kind: 'unknown' });
row('알람 만들어줘 오후 3시 ' + '가'.repeat(300), { kind: 'unknown' });   // 너무 긴 입력

for (const [i, [input, want, now]] of cases.entries()) t(`해석 ${String(i + 1).padStart(3, '0')}: ${JSON.stringify(input).slice(0, 60)}`, () => match(P.parseAlarmCommand(input, now), want, JSON.stringify(input)));

t('해석 사례 수는 60개를 훨씬 넘는다(날짜·시간·모호·경계·거절·의도·제목·이상한 입력)', () => { assert.ok(cases.length >= 150, `${cases.length}개`); });
t('입력이 문자열이 아니거나 매우 이상해도 예외 없이 unknown: null·undefined·숫자·객체·긴 문자열·제어 문자·한 글자 반복', () => {
  for (const v of [null, undefined, 0, 123, {}, [], true, '\u0000\u0001', '​​', 'ㅤ', '가'.repeat(5000), '알람'.repeat(300), '😀'.repeat(250) + '알람 만들어줘']) {
    let r; assert.doesNotThrow(() => { r = P.parseAlarmCommand(v, NOW); }); assert.strictEqual(r.kind, 'unknown', String(v).slice(0, 20));
  }
  assert.strictEqual(P.parseAlarmCommand('알람 만들어줘 오후 3시', NOW).kind, 'create');
  assert.strictEqual(P.parseAlarmCommand('가'.repeat(200).slice(0, 190) + ' 알람', NOW).kind, 'query', '200자 이하는 해석한다');
  assert.strictEqual(P.normalizeInput('  a​b \n c  '), 'ab c');
});
t('결과 모양: 만들기는 항상 유효한 날짜(YYYY-MM-DD)·시각(HH:MM)·20자 이내 제목이고, 날짜는 지금 이후다(무작위 문장 3000개)', () => {
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const days = ['', '오늘', '내일', '모레', '3일 뒤', '2주 뒤', '월요일', '다음 주 금요일', '이번 주 일요일', '25일', '10일', '11월 5일', '12월 31일', '2월 29일', '30일'];
  const times = ['', '오전 9시', '오후 3시', '3시', '12시', '정오', '자정', '밤 12시', '15:30', '7시 반', '30분 뒤', '2시간 뒤', '새벽 4시', '25시', '3시 99분'];
  const verbs = ['알람 만들어줘', '알람 추가해줘', '알람 취소해줘', '알람 알려줘', '알람', '잡아줘', '해줘'];
  const titles = ['', "'회의'", '병원', "'" + '가'.repeat(30) + "'"];
  let created = 0;
  for (let i = 0; i < 3000; i++) {
    const now = D(2026, 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60));
    const r = P.parseAlarmCommand([pick(days), pick(times), pick(titles), pick(verbs)].filter(Boolean).join(' '), now);
    if (r.kind === 'create') {
      created++; assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date) && sched.isYmd(r.date), r.date); assert.ok(/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time), r.time);
      assert.ok(Array.from(r.title).length <= 20, '제목 20자'); const [h, m] = r.time.split(':').map(Number), d = sched.parseYmd(r.date);
      assert.ok(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()).getTime(), `지난 시각을 만들면 안 된다 ${JSON.stringify(r)} @${now}`);
    } else if (r.kind === 'query') assert.ok(sched.isYmd(r.date)); else if (r.kind === 'reject') assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
  }
  assert.ok(created > 300, `만들기 결과 ${created}개`);
});

// ── 지울 알람 찾기·문구·설정 값 바꾸기 ─────────────────────────────────────────
const al = (id, time, extra = {}) => ({ id, time, enabled: true, ...extra });
const CTX = (alarms, o = {}) => ({ alarms, lunchOn: o.lunchOn ?? true, leaveOn: o.leaveOn ?? true, lunchTime: '12:00', leaveTime: '18:00' });
const cancelCmd = (o = {}) => ({ kind: 'cancel', all: false, date: null, time: null, hour12: null, minute: null, title: '', ...o });
t('지울 알람 찾기: 시각(오전/오후 모두)·날짜·제목으로 오늘 이후 알람 중에서 찾고, 이미 지난 한 번짜리와 다른 날은 제외', () => {
  const alarms = [al('a', '15:00', { name: '회의', repeat: { kind: 'date', date: '2026-10-25' } }), al('b', '03:00', { name: '기상', repeat: { kind: 'date', date: '2026-10-25' } }), al('c', '15:00', { repeat: { kind: 'date', date: '2026-10-20' } }), al('d', '09:00', { name: '회의', repeat: { kind: 'weekly', days: [1, 3] } }), al('e', '15:00', { name: '체육', repeat: { kind: 'date', date: '2026-10-24' } })];
  const f = (o) => CH.findTargets(cancelCmd(o), CTX(alarms, { lunchOn: false, leaveOn: false }), NOW).map(x => x.alarm.id);
  assert.deepStrictEqual(f({ hour12: 3, minute: 0 }).sort(), ['a', 'b', 'e'], '3시 = 오전 3시·오후 3시 모두, 지난 c는 제외');
  assert.deepStrictEqual(f({ time: '15:00' }).sort(), ['a', 'e'], '오후 3시만');
  assert.deepStrictEqual(f({ date: '2026-10-25' }).sort(), ['a', 'b'].concat(['d']).sort().filter(x => x !== 'd').concat([]).sort(), '내일 알람(d는 월·수라 내일(일)이 아니다)');
  assert.deepStrictEqual(f({ title: '회의' }).sort(), ['a', 'd']);
  assert.deepStrictEqual(f({ date: '2026-10-26', title: '회의' }), ['d'], '월요일의 반복 알람');
  assert.deepStrictEqual(f({ title: '없는이름' }), []);
  assert.deepStrictEqual(f({}).sort(), ['a', 'b', 'd', 'e'], '조건이 없으면 지난 알람을 뺀 전부(고르게 한다)');
});
t('찾은 알람은 다음에 울리는 시각순, 라벨에 날짜·요일·오전/오후·이름이 들어 있다', () => {
  const alarms = [al('x', '18:30', { name: '저녁', repeat: { kind: 'date', date: '2026-10-26' } }), al('y', '09:00', { name: '아침', repeat: { kind: 'date', date: '2026-10-25' } })];
  const r = CH.findTargets(cancelCmd(), CTX(alarms, { lunchOn: false, leaveOn: false }), NOW);
  assert.deepStrictEqual(r.map(x => x.alarm.id), ['y', 'x']); assert.strictEqual(r[0].label, '10월 25일(일) 오전 9:00 · 아침'); assert.strictEqual(r[1].label, '10월 26일(월) 오후 6:30 · 저녁');
  const named = CH.findTargets(cancelCmd({ date: '2026-10-25' }), CTX([al('z', '15:00', { repeat: { kind: 'date', date: '2026-10-25' } })], { lunchOn: false, leaveOn: false }), NOW);
  assert.ok(named[0].label.endsWith('· 알람'), '이름이 없으면 기본 이름');
});
t('점심·퇴근 기본 알림은 지우지 않고 "끄기"만: 이름을 말했거나 시각이 같을 때만 후보, 꺼져 있으면 후보가 아님, "다 지워줘"에는 포함하지 않음', () => {
  const none = CTX([]);
  assert.deepStrictEqual(CH.findTargets(cancelCmd({ title: '점심' }), none, NOW).map(x => x.kind), ['lunch']);
  assert.deepStrictEqual(CH.findTargets(cancelCmd({ title: '퇴근' }), none, NOW).map(x => x.kind), ['leave']);
  assert.deepStrictEqual(CH.findTargets(cancelCmd({ time: '12:00' }), none, NOW).map(x => x.kind), ['lunch'], '시각이 점심 시각과 같으면');
  assert.deepStrictEqual(CH.findTargets(cancelCmd({ hour12: 6, minute: 0 }), none, NOW).map(x => x.kind), ['leave'], '6시는 퇴근 시각(18:00)');
  assert.deepStrictEqual(CH.findTargets(cancelCmd({ title: '점심' }), CTX([], { lunchOn: false }), NOW), [], '꺼져 있으면 대상이 아니다');
  assert.deepStrictEqual(CH.findTargets(cancelCmd({ all: true }), CTX([al('a', '09:00')]), NOW).map(x => x.kind), ['alarm'], '다 지워줘는 점심·퇴근을 건드리지 않는다');
  assert.deepStrictEqual(CH.findTargets(cancelCmd({ date: '2026-10-25', time: '12:00' }), none, NOW), [], '날짜를 지정하면 매일 알림은 후보로 올리지 않는다');
});
t('확인 문구: 날짜·요일·오전/오후를 크게, 모호하면 안내, 자정은 전날 밤 표기', () => {
  const q = CH.createQuestion({ kind: 'create', date: '2026-10-25', time: '15:00', title: '회의', ambiguous: false });
  assert.strictEqual(q.head, '10월 25일 일요일'); assert.strictEqual(q.big, '오후 3시'); assert.strictEqual(q.question, "10월 25일 일요일 오후 3시에 '회의' 알람을 만들까요?"); assert.strictEqual(q.note, '');
  assert.ok(CH.createQuestion({ kind: 'create', date: '2026-10-25', time: '15:00', title: '', ambiguous: true }).note.includes('오전·오후를 말하지 않아서'));
  assert.strictEqual(CH.createQuestion({ kind: 'create', date: '2026-10-25', time: '15:00', title: '', ambiguous: false }).question, '10월 25일 일요일 오후 3시에 알람을 만들까요?');
  assert.deepStrictEqual(CH.whenParts('2026-10-26', '00:00'), { dateText: '10월 26일 월요일', timeText: '오전 12시', noteText: '자정' });
  assert.deepStrictEqual(CH.whenParts('2026-10-26', '12:00'), { dateText: '10월 26일 월요일', timeText: '오후 12시', noteText: '정오' });
  assert.strictEqual(CH.whenParts('2026-10-26', '07:05').timeText, '오전 7시 5분'); assert.strictEqual(CH.whenParts('2026-10-26', '23:30').timeText, '오후 11시 30분');
  const mid = CH.createQuestion({ kind: 'create', date: '2026-10-26', time: '00:00', title: '', ambiguous: false, midnight: true }); assert.ok(mid.note.includes('10월 25일 밤 12시') && mid.big.includes('자정'));
  assert.strictEqual(CH.CHAT_PLACEHOLDER, '예: 내일 오후 3시에 회의 알람 만들어줘'); assert.strictEqual(CH.EXAMPLES.length, 3); assert.strictEqual(CH.UNDO_MS, 10000);
});
t('알람 만들기·지우기·끄기·되돌리기(설정 값): 설정창과 같은 모양의 날짜 한 번짜리 알람, 50개 상한, 되돌리기는 같은 id를 중복하지 않는다', () => {
  const base = { ...settingsTs.DEFAULT_SETTINGS, alarms: [al('k', '08:00')], lunchEnabled: true, leaveEnabled: true };
  const cmd = P.parseAlarmCommand("내일 오후 3시에 '회의' 알람 만들어줘", NOW); const a = CH.buildAlarm(cmd, 'n1');
  assert.deepStrictEqual(a, { id: 'n1', time: '15:00', enabled: true, name: '회의', repeat: { kind: 'date', date: '2026-10-25' } });
  assert.deepStrictEqual(CH.buildAlarm(P.parseAlarmCommand('내일 오후 3시 알람 만들어줘', NOW), 'n2'), { id: 'n2', time: '15:00', enabled: true, repeat: { kind: 'date', date: '2026-10-25' } }, '제목 없으면 name 없음');
  const added = CH.withAlarmAdded(base, a); assert.ok(added.ok); assert.strictEqual(added.settings.alarms.length, 2); assert.strictEqual(base.alarms.length, 1, '원본은 그대로');
  const full = { ...base, alarms: Array.from({ length: 50 }, (_, i) => al(`f${i}`, '08:00')) }; assert.deepStrictEqual(CH.withAlarmAdded(full, a), { ok: false, reason: 'limit' });
  const removed = CH.withAlarmsRemoved(added.settings, ['n1']); assert.deepStrictEqual(removed.alarms.map(x => x.id), ['k']);
  const restored = CH.withAlarmsRestored(removed, [a, al('k', '08:00')]); assert.deepStrictEqual(restored.alarms.map(x => x.id), ['k', 'n1'], '이미 있는 id는 건너뛴다');
  const off = CH.withDefaultOff(base, 'lunch'); assert.strictEqual(off.lunchEnabled, false); assert.strictEqual(off.leaveEnabled, true); assert.strictEqual(CH.withDefaultOn(off, 'lunch').lunchEnabled, true);
  const nearFull = { ...base, alarms: Array.from({ length: 49 }, (_, i) => al(`f${i}`, '08:00')) }; assert.strictEqual(CH.withAlarmsRestored(nearFull, [al('r1', '09:00'), al('r2', '09:00')]).alarms.length, 50, '되돌리기도 50개를 넘지 않는다');
});

// ── 스케줄러 연결: 날짜 한 번짜리 알람이 정확히 한 번만 울린다, 기존 알람의 울림은 그대로 ──────────────────────
const simulate = (settings, from, to) => {   // from~to를 1분씩 지나며 울린 것(카드)을 모은다(앱이 켜져 있는 동안과 같다)
  const fired = new Set(), out = [];
  for (let ms = from.getTime(); ms <= to.getTime(); ms += 60000) { const n = new Date(ms); for (const x of A.dueActions(settings, n, fired)) if (x.type === 'card') out.push(`${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')} ${x.card}${x.alarm && x.alarm.name ? ':' + x.alarm.name : ''}`); }
  return out;
};
t('날짜 한 번짜리 알람(알람 대화가 만든 모양)은 그 날짜·시각에 정확히 한 번 울리고, 그 전후 5일 동안 다시 울리지 않는다(분 단위 시뮬레이션)', () => {
  const cmd = P.parseAlarmCommand("내일 오후 3시에 '회의' 알람 만들어줘", NOW); const a = CH.buildAlarm(cmd, 'chat1');
  const merged = A.mergeAlarmSettings({}, { alarms: [a] }).settings;   // 메인이 받는 값(검증·정리를 거친다)
  assert.deepStrictEqual(merged.alarms, [{ id: 'chat1', time: '15:00', enabled: true, name: '회의', repeat: { kind: 'date', date: '2026-10-25' } }], '메인의 검증을 거쳐도 그대로');
  const out = simulate(merged, D(2026, 10, 20, 0, 0), D(2026, 10, 30, 23, 59));
  assert.deepStrictEqual(out, ['2026-10-25 15:00 alarm:회의'], '정확히 한 번');
  // 같은 날에 앱을 껐다 켜서 발화 기록을 이어 받아도 두 번 울리지 않는다
  const fired = new Set(); const first = A.dueActions(merged, D(2026, 10, 25, 15, 0), fired).filter(x => x.type === 'card'); const again = A.dueActions(merged, D(2026, 10, 25, 15, 0), fired).filter(x => x.type === 'card');
  assert.strictEqual(first.length, 1); assert.strictEqual(again.length, 0);
});
t('알람 대화 알람을 추가하기 전과 후에 기존 알람(매일·요일·날짜·그 주·꺼짐·건너뛰기·점심·퇴근)이 같은 시각에 같은 것이 울린다(10일 분 시뮬레이션, 새 알람만 더 울림)', () => {
  const existing = [al('m', '07:30', { name: '매일' }), al('w', '09:00', { name: '평일', repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5] } }), al('d', '13:15', { name: '날짜', repeat: { kind: 'date', date: '2026-10-27' } }),
    al('k', '20:00', { name: '그주', repeat: { kind: 'week', weekStart: '2026-10-26', days: [2, 4] } }), al('o', '10:00', { name: '꺼짐', enabled: false }), al('s', '11:00', { name: '건너뜀', skipDate: '2026-10-26' }), al('t', '00:00', { name: '자정' }), al('u', '23:59', { name: '막분' })];
  const base = { lunchEnabled: true, leaveEnabled: true, lunchTime: '12:00', leaveTime: '18:00', lunchPreAlertEnabled: false, leavePreAlertEnabled: false, alarms: existing };
  const from = D(2026, 10, 24, 0, 0), to = D(2026, 11, 2, 23, 59);
  const before = simulate(base, from, to);
  const chat = CH.buildAlarm(P.parseAlarmCommand("모레 오후 3시 30분에 '추가' 알람 만들어줘", NOW), 'chat9');
  const after = simulate({ ...base, alarms: [...existing, chat] }, from, to);
  assert.deepStrictEqual(after.filter(x => !x.endsWith(':추가')), before, '기존 알람의 울림은 한 건도 달라지지 않는다');
  assert.deepStrictEqual(after.filter(x => x.endsWith(':추가')), ['2026-10-26 15:30 alarm:추가']); assert.ok(before.length > 40, `기존 울림 ${before.length}건`);
  // 같은 시각에 겹쳐도 둘 다 울린다
  const same = CH.buildAlarm(P.parseAlarmCommand("내일 오전 7시 30분에 '겹침' 알람 만들어줘", NOW), 'chat8');
  const both = simulate({ ...base, alarms: [...existing, same] }, D(2026, 10, 25, 0, 0), D(2026, 10, 25, 23, 59)).filter(x => x.includes('07:30'));
  assert.deepStrictEqual(both.sort(), ['2026-10-25 07:30 alarm:겹침', '2026-10-25 07:30 alarm:매일'].sort());
});
t('기존 동작 동일성(대조 120개 조합 이상): 알람 대화의 날짜 알람도 설정창 규칙(occursOn·isSkipped)과 스케줄러(alarms.cjs)의 판정이 같다', () => {
  const days = [D(2026, 10, 19), D(2026, 10, 23), D(2026, 10, 24), D(2026, 10, 25), D(2026, 10, 26), D(2026, 11, 2), D(2026, 12, 31), D(2027, 1, 1)];
  const repeats = [undefined, { kind: 'weekly', days: [1, 3, 5] }, { kind: 'weekly', days: [0, 6] }, { kind: 'date', date: '2026-10-25' }, { kind: 'date', date: '2027-01-01' }, { kind: 'week', weekStart: '2026-10-19', days: [5, 6] }, { kind: 'week', weekStart: '2026-10-26', days: [1] }];
  let checked = 0;
  for (const day of days) for (const repeat of repeats) for (const enabled of [true, false]) for (const skipDate of [undefined, '2026-10-24', '2026-10-25']) {
    const a = al('x', '10:00', { enabled, ...(repeat ? { repeat } : {}), ...(skipDate ? { skipDate } : {}) });
    const want = enabled && A.occursOn(a, day) && !A.isSkipped(a, day);
    const got = A.dueActions({ alarms: [a] }, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0), new Set()).some(x => x.card === 'alarm');
    assert.strictEqual(got, want, `${day.toDateString()} ${JSON.stringify(repeat)} ${enabled} ${skipDate}`);
    assert.strictEqual(sched.occursOn(a, day) && !sched.isSkipped(a, day) && enabled, want, '설정창 쪽 규칙도 같다'); checked++;
  }
  assert.ok(checked >= 120, `${checked}개 조합`);
  assert.strictEqual(read('alarms.cjs').length > 1000, true);
});

// ── 연결·개인정보(정적 확인) ─────────────────────────────────────────────────
t('입력 문장은 저장·기록하지 않는다: 알람 대화 코드에 console·저장소 쓰기·네트워크·IPC 전송이 없고, 제출하면 입력 상태를 비운다', () => {
  const files = ['src/utils/alarmCommand.ts', 'src/utils/alarmChat.ts', 'src/utils/alarmStore.ts'];
  for (const f of files) { const s = read(f).replace(/\/\/.*$/gm, ''); assert.ok(!/console\./.test(s), `${f}: console`); assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB/.test(s.replace(/localStorage|readStoredSettings|saveSettings/g, '')), `${f}: 저장·네트워크`); }
  const page = read('src/pages/QuickPage.tsx'); const chat = page.slice(page.indexOf('function ChatCard'), page.indexOf('const cssVars'));
  assert.ok(chat.length > 1000); assert.ok(!/console\.|localStorage|sessionStorage|fetch\(/.test(chat), 'ChatCard: 기록·저장·네트워크 없음');
  assert.ok(/const cmd = parseAlarmCommand\(text, now\);\s*setText\(''\);/.test(chat), '제출하면 바로 비운다');
  assert.ok(!/api\(\)\?\.\w+\([^)]*\btext\b/.test(chat), '입력 문장을 IPC로 보내지 않는다');
  assert.ok(!/openai|anthropic|claude|gpt|llm|\bAI\b/i.test((read('src/utils/alarmCommand.ts') + read('src/utils/alarmChat.ts')).replace(/\/\/.*$/gm, '')), 'AI·외부 서비스 없음(코드 기준, 주석 제외)');
  assert.ok(!/^import .* from '(?!\.)/m.test(read('src/utils/alarmCommand.ts') + read('src/utils/alarmChat.ts')), '외부 패키지 의존 없음');
  const main = read('main.cjs'); assert.ok(!/alarm-chat|parseAlarmCommand/.test(main), '메인은 입력 문장을 받지 않는다');
});
t('연결: 퀵 메뉴에 "대화하기"(message-circle, 툴팁·aria-label)가 종료 앞에, 입력칸 안내 문구·Enter 제출(조합 중 제외)·Esc, 설정창은 저장값의 알람 변경을 반영, 저장 경로는 설정창과 같은 saveSettings+syncSettings', () => {
  const page = read('src/pages/QuickPage.tsx'), store = read('src/utils/alarmStore.ts'), settingsPage = read('src/pages/SettingsPage.tsx');
  assert.ok(/\{ id: 'chat', label: '대화하기', tip: '대화하기', Icon: MessageCircle \}/.test(page)); assert.ok(page.indexOf("id: 'chat'") < page.indexOf("const QUIT: Entry") && /layoutQuickItems\(ITEMS, QUIT\)/.test(page), '종료는 항상 마지막');
  assert.ok(/aria-label=\{confirming \? QUIT_CONFIRM_TEXT : `\$\{e\.label\}\. \$\{e\.tip\}`\}/.test(page) && /title=\{e\.tip\}/.test(page));
  assert.ok(/e\.key === 'Enter' && !e\.nativeEvent\.isComposing/.test(page) && /placeholder=\{CHAT_PLACEHOLDER\}/.test(page) && /key === 'Escape'/.test(page));
  assert.ok(/saveSettings\(next\)/.test(store) && /syncSettings\(next/.test(store) && /readStoredSettings\(\)\)/.test(store), '설정창과 같은 저장 경로');
  assert.ok(/window\.addEventListener\('storage', onStorage\)/.test(settingsPage) && /readStoredSettings/.test(settingsPage), '설정창이 다른 창의 알람 변경을 반영');
  assert.ok(/UNDO_MS/.test(page) && /10초 안에 되돌릴 수 있어요/.test(page) && />되돌리기<\/button>/.test(page) && /되돌렸어요/.test(page), '되돌리기 10초');
  assert.ok(/이렇게 말해 주세요/.test(page) && /자유 대화나 잡담은 아직 지원하지 않아요/.test(page) && /EXAMPLES\.map/.test(page), 'unknown 안내');
  assert.ok(/onShowDay=\{\(day\) => \{ setAlarmDay\(day\); setView\('alarm'\); \}\}/.test(page) && /todayAlarmList\(s, new Date\(\), shown \?\? undefined\)/.test(page), '조회는 기존 알람 카드를 재사용');
  assert.ok(/정말 \{t\.length\}개를 모두 지울까요/.test(page) && /stage: 2/.test(page), '다 지우기는 개수를 보여 주는 두 번째 확인');
  assert.ok(/data-autofocus=\{focusBack \? '' : undefined\}/.test(page));
  for (const f of ['src/pages/QuickPage.tsx', 'src/utils/alarmCommand.ts', 'src/utils/alarmChat.ts', 'src/utils/alarmStore.ts', 'src/styles/quick.css']) assert.ok(!read(f).includes(FFFD) && !/\?{3}/.test(read(f)), f);
});
t('조회 카드(날짜 지정): 그날 알람을 같은 형식으로, 오늘이 아니면 지난·다음 표시 없음, 제목은 오늘/내일/날짜', () => {
  const s = { lunchOn: true, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [al('a', '09:00', { name: '아침', repeat: { kind: 'date', date: '2026-10-25' } }), al('b', '15:00', { repeat: { kind: 'weekly', days: [0] } }), al('c', '08:00', { repeat: { kind: 'date', date: '2026-10-26' } })] };
  const sun = QA.todayAlarmList(s, NOW, D(2026, 10, 25)); assert.deepStrictEqual(sun.map(x => x.time), ['09:00', '15:00'], '직접 설정한 알람만(점심 기본 알림은 켜져 있어도 빠진다)'); assert.ok(sun.every(x => !x.past && !x.next), '오늘이 아니면 지난·다음 표시 없음');
  assert.deepStrictEqual(QA.todayAlarmList(s, NOW), [], '오늘(토)은 직접 설정한 알람이 없다 → 빈 목록(안내 문구가 나온다)');
  assert.strictEqual(QA.todayAlarmList(s, NOW, D(2026, 10, 27)).length, 0, '10-27: 직접 설정한 알람 없음');
  assert.strictEqual(QA.dayTitle(D(2026, 10, 24), NOW), '오늘 알람'); assert.strictEqual(QA.dayTitle(D(2026, 10, 25), NOW), '내일 알람 · 10월 25일(일)'); assert.strictEqual(QA.dayTitle(D(2026, 10, 30), NOW), '10월 30일(금) 알람');
  assert.strictEqual(QA.noAlarmText(D(2026, 10, 25), NOW), '10월 25일에 설정한 알람이 없어요');
});

(async () => { let fail = 0; for (const [name, fn] of queue) { try { await fn(); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } } if (fail) { console.log(`\n${fail}개 실패 / ${queue.length}개`); process.exit(1); } console.log(`  ok  알람 대화 ${queue.length}개 검사(해석 사례 ${cases.length}개 포함)\n\n${queue.length}개 통과`); })();
