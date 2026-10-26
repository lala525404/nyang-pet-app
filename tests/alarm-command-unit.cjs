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
const WOM = load('src/utils/weekOfMonth.ts', { './alarmSchedule': sched });
const P = load('src/utils/alarmCommand.ts', { './alarmSchedule': sched, './weekOfMonth': WOM });
const CH = load('src/utils/alarmChat.ts', { './alarmSchedule': sched, './alarmText': text, './alarmCommand': P });
const KIND = load('src/utils/alarmKind.ts', { './alarmSchedule': sched, './alarmText': text });
const QA = load('src/utils/quickAlarms.ts', { './alarmSchedule': sched, './alarmText': text, './alarmKind': KIND });
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
const create = (date, time, title = '', _unused = false, extra = {}) => ({ kind: 'create', date, time, title, ...extra });
const ask = (hour, minute = 0, title = '') => ({ kind: 'needsMeridiem', hour, minute, title });
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
row('토요일 3시에 알람 만들어줘', ask(3));
row('다음 주 월요일 오전 10시 알람 설정', create('2026-10-26', '10:00'));
row('다음 주 금요일 오후 3시 알람 만들어줘', create('2026-10-30', '15:00'));
row('담주 수요일 오후 2시 알람 만들어줘', create('2026-10-28', '14:00'));
row('이번 주 일요일 오후 3시 알람 만들어줘', create('2026-10-25', '15:00'));   // 이번 주 = 월 10-19 ~ 일 10-25
row('이번 주 토요일 오후 5시 알람 만들어줘', create('2026-10-24', '17:00'));
row('이번 주 월요일 오전 10시 알람 만들어줘', rej('create', '지난 날짜예요'));
row('이번 주 토요일 오전 9시 알람 만들어줘', rej('create', '이미 지난 시간이에요'));
// 주 단위 조회(요일 없음): 이번 주·금주·주간 = 오늘이 든 주(월~일), 다음 주·차주·담주 = 다음 주. 요일이 붙으면 그 하루만
const wk = (start, label) => ({ kind: 'query', date: start, week: { start, label } });
row('이번 주 알람 알려줘', wk('2026-10-19', '이번 주'));
row('이번 주 알람', wk('2026-10-19', '이번 주'));
row('금주 일정', wk('2026-10-19', '이번 주'));
row('금주 알람 뭐 있어', wk('2026-10-19', '이번 주'));
row('주간 알람', wk('2026-10-19', '이번 주'));
row('주간 일정 뭐 있어', wk('2026-10-19', '이번 주'));
row('다음 주 알람 알려줘', wk('2026-10-26', '다음 주'));
row('다음주 알람', wk('2026-10-26', '다음 주'));
row('차주 알람 알려줘', wk('2026-10-26', '다음 주'));
row('담주 알람 알려줘', wk('2026-10-26', '다음 주'));
row('다음 주 알람 뭐 있어?', wk('2026-10-26', '다음 주'));
row('다음 주 화요일 알람', { kind: 'query', date: '2026-10-27' });                  // 요일이 붙으면 그 하루(기존 동작)
row('차주 화요일 알람 알려줘', { kind: 'query', date: '2026-10-27' });
row('금주 토요일 알람 알려줘', { kind: 'query', date: '2026-10-24' });
row('이번 주말 알람', { kind: 'query', date: '2026-10-24' });                        // 주말은 주 표현이 아니다
row('다음 주 알람 만들어줘', rej('create', '이번 주·다음 주는 요일도 같이 말해 주세요'));      // 만들기·지우기는 요일이 필요하다
row('다음 주 알람 취소해줘', rej('cancel', '이번 주·다음 주는 요일도 같이 말해 주세요'));
row('이번 주 알람 알려줘', wk('2026-10-26', '이번 주'), D(2026, 10, 26, 9, 0));        // 월요일에 시작하는 주
row('이번 주 알람 알려줘', wk('2026-10-19', '이번 주'), NOW_SUN);                     // 일요일은 그 주의 마지막 날
row('다음 주 알람 알려줘', wk('2026-12-28', '다음 주'), D(2026, 12, 24, 9, 0));        // 연말: 다음 주가 연초에 걸친다
row('다음 주 알람 알려줘', wk('2027-01-04', '다음 주'), D(2026, 12, 31, 9, 0));
row('이번 주 알람 알려줘', wk('2026-12-28', '이번 주'), NOW_DEC31);
row('이번 주 알람 알려줘', wk('2028-02-28', '이번 주'), NOW_LEAP);                    // 윤년: 2/28(월)~3/5(일)에 2/29가 든다
// "N월 N주차": 주는 월~일, 그 주의 목요일이 든 달의 주. 1주차 = 그 달 첫 목요일이 든 주(2026-10-24 기준 올해)
row('11월 2주차 알람', wk('2026-11-09', '11월 2주차'));
row('11월 2주차 알람 알려줘', wk('2026-11-09', '11월 2주차'));
row('11월 둘째 주 알람 알려줘', wk('2026-11-09', '11월 2주차'));
row('11월 둘째주 알람', wk('2026-11-09', '11월 2주차'));
row('11월 첫째 주 알람', wk('2026-11-02', '11월 1주차'));
row('11월 첫 주 알람', wk('2026-11-02', '11월 1주차'));
row('11월 셋째 주 알람', wk('2026-11-16', '11월 3주차'));
row('11월 넷째 주 알람', wk('2026-11-23', '11월 4주차'));
row('11월 마지막 주 알람', wk('2026-11-23', '11월 4주차'));
row('11월 마지막주 알람 알려줘', wk('2026-11-23', '11월 4주차'));
row('12월 다섯째 주 알람', wk('2026-12-28', '12월 5주차'));
row('12월 5주차 알람', wk('2026-12-28', '12월 5주차'));
row('12월 마지막 주 알람', wk('2026-12-28', '12월 5주차'));            // 12/28(월)~1/3(일): 해를 넘는 주
row('12월 1주차 알람', wk('2026-11-30', '12월 1주차'));                // 11/30(월)~12/6(일): 앞 달 날짜를 포함
row('1월 1주차 알람', wk('2025-12-29', '1월 1주차'));                  // 12/29(월)~1/4(일)
row('1월 5주차 알람', wk('2026-01-26', '1월 5주차'));
row('5월 1주차 알람', wk('2026-05-04', '5월 1주차'));                  // 5/1(금)이 든 주(4/27~5/3)는 4월 5주차
row('4월 5주차 알람', wk('2026-04-27', '4월 5주차'));
row('3월 1주차 알람', wk('2026-03-02', '3월 1주차'));                  // 3/1(일)이 든 주는 2월 4주차
row('4월 1주차 알람', wk('2026-03-30', '4월 1주차'));                  // 3/31(화)이 든 주는 4월 1주차
row('이번 달 2주차 알람', wk('2026-10-05', '10월 2주차'));
row('이번 달 2주차', wk('2026-10-05', '10월 2주차'));                  // 알람이라는 말이 없어도 조회
row('이번달 둘째 주 알람 알려줘', wk('2026-10-05', '10월 2주차'));
row('이달 마지막 주 알람', wk('2026-10-26', '10월 5주차'));
row('2주차 알람', wk('2026-10-05', '10월 2주차'));                     // 월 생략 → 이번 달
row('2주차 알람 알려줘', wk('2026-10-05', '10월 2주차'));
row('마지막 주 알람', wk('2026-10-26', '10월 5주차'));
row('다음 달 2주차 알람', wk('2026-11-09', '11월 2주차'));
row('11월 2주차 화요일 알람', { kind: 'query', date: '2026-11-10' });     // 요일이 붙으면 그 하루만
row('11월 첫째 주 화요일 알람 알려줘', { kind: 'query', date: '2026-11-03' });
row('11월 2주차 일요일 알람', { kind: 'query', date: '2026-11-15' });
row('11월 2주차 월요일 알람', { kind: 'query', date: '2026-11-09' });
row('11월 2주차 일정', wk('2026-11-09', '11월 2주차'));                // '일정'의 '일'은 요일이 아니다
row('1주차 알람', wk('2026-09-28', '10월 1주차'));                     // 지난 주차도 조회할 수 있다(지난 알람은 흐리게)
row('11월 5주차 알람', rej('query', '11월은 4주차까지 있어요'));            // 존재하지 않는 주차
row('11월 다섯째 주 알람', rej('query', '11월은 4주차까지 있어요'));
row('11월 6주차 알람', rej('query', '11월은 4주차까지 있어요'));
row('11월 0주차 알람', rej('query', '11월은 4주차까지 있어요'));
row('2월 5주차 알람', rej('query', '2월은 4주차까지 있어요'));
row('6월 5주차 알람', rej('query', '6월은 4주차까지 있어요'));
row('13월 2주차 알람', rej('query', '그런 날짜는 없어요'));
row('0월 2주차 알람', rej('query', '그런 날짜는 없어요'));
row('2027년 11월 2주차 알람', rej('query', '올해 안의 날짜만 말할 수 있어요'));
row('2025년 11월 2주차 알람', rej('query', '지난 날짜예요'));
row('2026년 11월 2주차 알람', wk('2026-11-09', '11월 2주차'));
row('11월 2주차 알람 만들어줘', rej('create', '주차는 알람 조회에서만 쓸 수 있어요. 날짜나 요일로 말해 주세요'));   // 주차는 조회만
row('11월 2주차 알람 취소해줘', rej('cancel', '주차는 알람 조회에서만 쓸 수 있어요. 날짜나 요일로 말해 주세요'));
row('2주차 월요일 오후 3시 알람 만들어줘', rej('create', '주차는 알람 조회에서만 쓸 수 있어요. 날짜나 요일로 말해 주세요'));
row('2주 뒤 오후 3시 알람 만들어줘', create('2026-11-07', '15:00'));        // "2주 뒤"는 주차가 아니다
row('2주 뒤 알람 알려줘', { kind: 'query', date: '2026-11-07' });
row('2주차', { kind: 'unknown' });                                       // 알람·월 말이 없으면 주차 숫자만으로는 반응하지 않는다
row('이번 주말 알람', { kind: 'query', date: '2026-10-24' });
row('11월 둘째 주말 알람', { kind: 'query', date: '2026-10-24' });          // 주말은 주차가 아니다(기존 주말 표현)
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
row('30분 뒤 알람 만들어줘', create('2026-10-24', '14:40'));
row('10분 후에 알람 만들어줘', create('2026-10-24', '14:20'));
row('1시간 뒤 알람 만들어줘', create('2026-10-24', '15:10'));
row('한 시간 뒤 알람 만들어줘', create('2026-10-24', '15:10'));
row('2시간 30분 뒤에 알람 만들어줘', create('2026-10-24', '16:40'));
row('1시간 반 뒤 알람 만들어줘', create('2026-10-24', '15:40'));
row('12시간 뒤 알람 만들어줘', create('2026-10-25', '02:10'));            // 날짜를 넘김
// ── 오전/오후 모호 ───────────────────────────────────────────────────────────
// 구분(오전·오후·아침·낮·저녁·밤·새벽·정오·자정)도 24시간 표기도 아닌 1~12시는 짐작하지 않고 항상 되묻는다(needsMeridiem)
row('오늘 3시 알람 만들어줘', ask(3));
row('오늘 3시 알람 만들어줘', ask(3), NOW_MORNING);                          // 새벽 2시여도 짐작하지 않는다
row('오늘 1시 알람 만들어줘', ask(1));                                        // 지난 시각이어도 먼저 되묻는다(고른 뒤 거절)
row('1시에 알람 만들어줘', ask(1));
row('3시 알람 만들어줘', ask(3));
row('3시 30분 알람 만들어줘', ask(3, 30));
row('3시 반에 알람 만들어줘', ask(3, 30));
row('1시 15분 알람 만들어줘', ask(1, 15));
row('3:30 알람 만들어줘', ask(3, 30));                                       // 앞자리 0 없는 한 자리 시각은 24시간 표기가 아니다
row('내일 3시 알람 만들어줘', ask(3));
row('내일 7시 알람 만들어줘', ask(7));
row('금요일 7시 알람 만들어줘', ask(7));
row('7시 반에 알람 만들어줘', ask(7, 30));
row('내일 3시에 회의 알람 만들어줘', ask(3, 0, '회의'));
row('내일 12시 알람 만들어줘', ask(12));
row('12시 알람 만들어줘', ask(12));
row('12시 30분 알람 만들어줘', ask(12, 30));
row('11월 3일 3시 알람 만들어줘', ask(3));
row('10월 1일 3시 알람 만들어줘', rej('create', '지난 날짜예요'));            // 날짜가 틀리면 시각을 묻기 전에 거절
row('내일 오전 3시 알람 만들어줘', create('2026-10-25', '03:00'));          // 말하면 모호하지 않다
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

// ── 오전/오후 되묻기 ─────────────────────────────────────────────────────────
t('오전/오후 되묻기: 모호한 시각은 항상 되묻고, 구분이 있는 표현(오전·오후·아침·낮·저녁·밤·새벽·정오·자정·24시간·상대 시각)은 되묻지 않는다', () => {
  for (const [s, h, m] of [['3시 알람 만들어줘', 3, 0], ['3시 30분 알람 만들어줘', 3, 30], ['12시 알람 만들어줘', 12, 0], ['1시 15분 알람 만들어줘', 1, 15], ['11시 알람 추가해줘', 11, 0], ['오늘 6시에 알람 맞춰줘', 6, 0], ['내일 3시 알람 만들어줘', 3, 0], ['내일 3시에 회의 알람', 3, 0], ['다음 주 화요일 9시 알람 만들어줘', 9, 0]]) {
    for (const now of [NOW, NOW_MORNING, NOW_SUN, D(2026, 3, 3, 3, 3)]) { const r = P.parseAlarmCommand(s, now); assert.strictEqual(r.kind, 'needsMeridiem', `${s} @${now}`); assert.deepStrictEqual([r.hour, r.minute], [h, m], s); }
  }
  assert.strictEqual(P.parseAlarmCommand('내일 3시에 회의 알람', NOW).title, '회의');
  for (const s of ['오후 3시 알람 만들어줘', '밤 12시 알람 만들어줘', '새벽 3시 알람 만들어줘', '아침 7시 알람 만들어줘', '낮 12시 알람 만들어줘', '저녁 7시 반 알람 만들어줘', '오전 3시 30분 알람 만들어줘', '15:30 알람 만들어줘', '03:30 알람 만들어줘', '13시 알람 만들어줘', '정오에 알람 만들어줘', '자정에 알람 만들어줘', '30분 뒤 알람 만들어줘', '2시간 뒤 알람 만들어줘', '1시간 반 뒤 알람 만들어줘', '24시 알람 만들어줘', '0시 알람 만들어줘', '내일 오후 3시 알람 만들어줘']) {
    assert.strictEqual(P.parseAlarmCommand(s, NOW).kind, 'create', s);
  }
  for (const s of ['3시 알람 취소해줘', '3시 알람 알려줘', '3시 알람 뭐 있어']) assert.notStrictEqual(P.parseAlarmCommand(s, NOW).kind, 'needsMeridiem', `${s}: 삭제·조회는 되묻지 않는다`);
  assert.strictEqual(P.parseAlarmCommand('3시 알람 취소해줘', NOW).kind, 'cancel');
});
t('오전/오후 되묻기 뒤 선택: 오전·오후 각각 확인 카드로, 오늘 이미 지난 시각은 거절, 12시는 정오/자정, 날짜 지정·제목 유지', () => {
  const NOW5 = D(2026, 10, 24, 17, 0);   // 오후 5시
  assert.deepStrictEqual(P.parseAlarmCommand('3시 알람 만들어줘', NOW5, 'pm'), rej('create', P.REASON.pastTimeAsk), '날짜 없음, 오늘 15시도 지났으니 → 고른 시각을 임의로 내일로 바꾸지 않고 거절');
  assert.deepStrictEqual(P.parseAlarmCommand('8시 알람 만들어줘', NOW5, 'pm'), create('2026-10-24', '20:00'), '아직 안 지났으면 오늘');
  const a = P.parseAlarmCommand('3시 알람 만들어줘', NOW5, 'am'); assert.deepStrictEqual([a.kind, a.reason], ['reject', P.REASON.pastTimeAsk], '지금 오후 5시에 오전 3시를 고르면 거절 + 안내');
  assert.ok(/내일 오전 3시/.test(a.reason));
  assert.strictEqual(P.parseAlarmCommand('3시 알람 만들어줘', NOW5, 'pm').kind, 'reject');
  const morning = D(2026, 10, 24, 2, 0);
  assert.deepStrictEqual(P.parseAlarmCommand('3시 알람 만들어줘', morning, 'am'), create('2026-10-24', '03:00')); assert.deepStrictEqual(P.parseAlarmCommand('3시 알람 만들어줘', morning, 'pm'), create('2026-10-24', '15:00'));
  assert.deepStrictEqual(P.parseAlarmCommand('내일 3시 알람 만들어줘', NOW5, 'am'), create('2026-10-25', '03:00')); assert.deepStrictEqual(P.parseAlarmCommand('내일 3시 알람 만들어줘', NOW5, 'pm'), create('2026-10-25', '15:00'));
  assert.deepStrictEqual(P.parseAlarmCommand('내일 3시 30분에 회의 알람 만들어줘', NOW5, 'pm'), create('2026-10-25', '15:30', '회의'));
  assert.deepStrictEqual(P.parseAlarmCommand('오늘 3시 알람 만들어줘', NOW5, 'am'), rej('create', '이미 지난 시간이에요'), '날짜를 말했으면 기존 지난 시간 거절');
  assert.deepStrictEqual(P.parseAlarmCommand('내일 12시 알람 만들어줘', NOW5, 'pm'), create('2026-10-25', '12:00'), '정오');
  assert.deepStrictEqual(P.parseAlarmCommand('내일 12시 알람 만들어줘', NOW5, 'night'), create('2026-10-26', '00:00', '', false, { midnight: true }), '자정(밤 12시)=내일 밤의 끝');
  assert.deepStrictEqual(P.parseAlarmCommand('내일 12시 30분 알람 만들어줘', NOW5, 'night'), create('2026-10-26', '00:30', '', false, { midnight: true }));
  assert.deepStrictEqual(P.parseAlarmCommand('금요일 3시 알람 만들어줘', NOW5, 'am'), create('2026-10-30', '03:00'));
  assert.strictEqual(P.parseAlarmCommand('3:30 알람 만들어줘', morning, 'pm').time, '15:30');
  // 되묻는 카드의 문구·버튼
  const q3 = CH.meridiemQuestion(P.parseAlarmCommand('3시 알람 만들어줘', NOW5)); assert.strictEqual(q3.title, '몇 시인가요? 3시가 오전인지 오후인지 골라 주세요'); assert.deepStrictEqual(q3.choices, [{ label: '오전 3시', meridiem: 'am' }, { label: '오후 3시', meridiem: 'pm' }]);
  const q330 = CH.meridiemQuestion(P.parseAlarmCommand('3시 30분 알람 만들어줘', NOW5)); assert.strictEqual(q330.title, '몇 시인가요? 3시 30분가 오전인지 오후인지 골라 주세요'.replace('30분가', '30분이'), '조사 자연스럽게'); assert.deepStrictEqual(q330.choices.map(c => c.label), ['오전 3시 30분', '오후 3시 30분']);
  const q12 = CH.meridiemQuestion(P.parseAlarmCommand('12시 알람 만들어줘', NOW5)); assert.ok(/정오인지 자정인지/.test(q12.title)); assert.deepStrictEqual(q12.choices, [{ label: '정오 12시', meridiem: 'pm' }, { label: '자정 12시(밤 12시)', meridiem: 'night' }]);
});
t('오전/오후 되묻기 화면 연결(정적 확인): 버튼 두 개 전에는 만들기로 넘어가지 않고, 닫으면 아무것도 만들지 않으며, 선택은 기존 확인 카드로 이어진다', () => {
  const page = read('src/pages/QuickPage.tsx'), chat = page.slice(page.indexOf('function ChatCard'), page.indexOf('const cssVars'));
  assert.ok(/if \(cmd\.kind === 'needsMeridiem'\) \{ setStep\(\{ s: 'ask'/.test(chat), '모호하면 ask 단계');
  const ask = chat.slice(chat.indexOf("step.s === 'ask'"), chat.indexOf("step.s === 'create'")); assert.ok(ask.length > 100 && !/doCreate|applyToStoredSettings|withAlarmAdded/.test(ask), '되묻기 단계에서는 만들지 않는다');
  assert.ok(/answerMeridiem\(step\.text, c\.meridiem\)/.test(ask) && /qk-chat-choice/.test(ask) && /onClick=\{goInput\}/.test(ask));
  assert.ok(/const answerMeridiem[\s\S]*?parseAlarmCommand\(typed, new Date\(\), meridiem\)[\s\S]*?setStep\(\{ s: 'create', cmd \}\)[\s\S]*?setStep\(\{ s: 'reject'/.test(chat), '선택 → 확인 카드 또는 거절');
  const doCreateAt = chat.indexOf('const doCreate'); assert.ok(chat.indexOf('withAlarmAdded') > doCreateAt && !chat.slice(0, doCreateAt).includes('withAlarmAdded('), '저장은 doCreate(만들기 버튼)에서만');
  assert.ok(/e\.key === 'Escape'[\s\S]{0,80}quickClose/.test(page), 'Esc는 퀵 메뉴를 닫는다(되묻는 문장도 카드 상태와 함께 사라진다)');
  assert.ok(/\.qk-chat-choices/.test(read('src/styles/quick.css')));
  assert.ok(!/ambiguous|가까운 시각/.test(read('src/utils/alarmCommand.ts') + read('src/utils/alarmChat.ts') + page), '예전 "가까운 시각" 추정·보조 문구가 코드에 없다');
});
t('삭제: 오전/오후 없는 시각은 되묻지 않고, 오전·오후 알람이 둘 다 있으면 목록에서 고르고 하나뿐이면 바로 확인 카드', () => {
  const both = [al('am', '03:00', { repeat: { kind: 'date', date: '2026-10-25' } }), al('pm', '15:00', { repeat: { kind: 'date', date: '2026-10-25' } }), al('x', '09:00', { repeat: { kind: 'date', date: '2026-10-25' } })];
  const cmd = P.parseAlarmCommand('3시 알람 취소해줘', NOW); assert.strictEqual(cmd.kind, 'cancel'); assert.strictEqual(cmd.hour12, 3);
  const two = CH.findTargets(cmd, CTX(both, { lunchOn: false, leaveOn: false }), NOW); assert.deepStrictEqual(two.map(x => x.alarm.id).sort(), ['am', 'pm'], '둘 다 후보 → 목록에서 고른다(2개 이상이면 pick)');
  const one = CH.findTargets(cmd, CTX([both[1], both[2]], { lunchOn: false, leaveOn: false }), NOW); assert.deepStrictEqual(one.map(x => x.alarm.id), ['pm'], '하나뿐이면 바로 확인');
  const am = CH.findTargets(P.parseAlarmCommand('오전 3시 알람 취소해줘', NOW), CTX(both, { lunchOn: false, leaveOn: false }), NOW); assert.deepStrictEqual(am.map(x => x.alarm.id), ['am']);
});
t('무작위 문장 3000개: 되묻기 없이 만들기로 넘어가는 것은 오전/오후(또는 24시간·정오·자정·상대 시각)가 명시된 경우뿐이다', () => {
  let seed = 29; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const days = ['', '오늘', '내일', '모레', '월요일', '다음 주 금요일', '25일', '11월 5일'];
  const times = ['3시', '12시', '3시 30분', '1시 15분', '7시 반', '11시', '오전 9시', '오후 3시', '새벽 4시', '아침 7시', '낮 12시', '저녁 6시', '밤 12시', '밤 11시', '정오', '자정', '15:30', '07:45', '13시', '0시', '24시', '30분 뒤', '2시간 뒤'];
  const explicit = (s) => /오전|오후|아침|낮|저녁|밤|새벽|정오|자정|뒤|후/.test(s) || /\d{1,2}:\d{2}/.test(s) && /(?:^|\D)(?:0\d|1\d|2[0-4]):\d{2}/.test(s) || /(?:^|\D)(?:1[3-9]|2[0-4]|0)\s*시/.test(s);
  let asked = 0, made = 0;
  for (let i = 0; i < 3000; i++) {
    const now = D(2026, 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60));
    const s = [pick(days), pick(times), pick(['', '병원', "'회의'"]), pick(['알람 만들어줘', '알람 추가해줘', '알람 설정해줘'])].filter(Boolean).join(' ');
    const r = P.parseAlarmCommand(s, now);
    if (r.kind === 'create') { made++; assert.ok(explicit(s), `구분 없이 만들어졌다: ${s}`); }
    if (r.kind === 'needsMeridiem') { asked++; assert.ok(!explicit(s), `명시됐는데 되물었다: ${s}`); assert.ok(r.hour >= 1 && r.hour <= 12); for (const m of ['am', 'pm', 'night']) { const f = P.parseAlarmCommand(s, now, m); assert.ok(f.kind === 'create' || f.kind === 'reject', s); if (f.kind === 'create') assert.ok(sched.isYmd(f.date) && /^\d{2}:\d{2}$/.test(f.time)); } }
  }
  assert.ok(asked > 400 && made > 400, `되묻기 ${asked}, 만들기 ${made}`);
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
  const q = CH.createQuestion({ kind: 'create', date: '2026-10-25', time: '15:00', title: '회의' });
  assert.strictEqual(q.head, '10월 25일 일요일'); assert.strictEqual(q.big, '오후 3시'); assert.strictEqual(q.question, "10월 25일 일요일 오후 3시에 '회의' 알람을 만들까요?"); assert.strictEqual(q.note, '');
  assert.strictEqual(CH.createQuestion({ kind: 'create', date: '2026-10-25', time: '15:00', title: '' }).note, '', '더 이상 "가까운 시각으로 맞췄어요" 보조 문구가 없다');
  assert.strictEqual(CH.createQuestion({ kind: 'create', date: '2026-10-25', time: '15:00', title: '' }).question, '10월 25일 일요일 오후 3시에 알람을 만들까요?');
  assert.deepStrictEqual(CH.whenParts('2026-10-26', '00:00'), { dateText: '10월 26일 월요일', timeText: '오전 12시', noteText: '자정' });
  assert.deepStrictEqual(CH.whenParts('2026-10-26', '12:00'), { dateText: '10월 26일 월요일', timeText: '오후 12시', noteText: '정오' });
  assert.strictEqual(CH.whenParts('2026-10-26', '07:05').timeText, '오전 7시 5분'); assert.strictEqual(CH.whenParts('2026-10-26', '23:30').timeText, '오후 11시 30분');
  const mid = CH.createQuestion({ kind: 'create', date: '2026-10-26', time: '00:00', title: '', midnight: true }); assert.ok(mid.note.includes('10월 25일 밤 12시') && mid.big.includes('자정'));
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
  assert.ok(/const typed = text;\s*const cmd = parseAlarmCommand\(typed, now\);\s*setText\(''\);/.test(chat), '제출하면 바로 비운다(되묻는 동안만 화면 상태로 보관)');
  assert.ok(/setStep\(\{ s: 'ask', ask: cmd, text: typed \}\)/.test(chat) && !/localStorage|sessionStorage/.test(chat), '되묻기 중 문장은 카드 상태에만');
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
  assert.ok(/onShowDay=\{\(q\) => \{ setAlarmQuery\(q\); setView\('alarm'\); \}\}/.test(page) && /todayAlarmList\(s, now, shown \?\? undefined\)/.test(page) && /weekAlarmList\(s, now, parseYmd\(week\.start\)\)/.test(page), '조회는 기존 알람 카드를 재사용');
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
t('주간 조회 카드: 월~일, 반복 알람은 날마다 펼침, 점심·퇴근 제외, 날짜·시각 순, 오늘이 든 주만 지남·다음 표시', () => {
  const s = { lunchOn: true, leaveOn: true, lunchTime: '12:00', leaveTime: '18:00', alarms: [
    al('w', '09:00', { name: '스탠드업', repeat: { kind: 'weekly', days: [1, 3] } }),      // 월·수
    al('d', '15:00', { name: '병원', repeat: { kind: 'date', date: '2026-10-24' } }),
    al('x', '08:00', { name: '꺼짐', enabled: false, repeat: { kind: 'weekly', days: [1] } }),
    al('n', '07:00', { name: '다음 주만', repeat: { kind: 'date', date: '2026-10-27' } })] };
  const cur = QA.weekAlarmList(s, NOW, D(2026, 10, 19));
  assert.deepStrictEqual(cur.map(x => `${x.date} ${x.time}`), ['2026-10-19 09:00', '2026-10-21 09:00', '2026-10-24 15:00'], '월~일, 날짜·시각 순, 꺼진 알람·다른 주 알람·점심퇴근 제외');
  assert.deepStrictEqual(cur.map(x => x.heading), ['월 10/19', '수 10/21', '토 10/24']);
  assert.deepStrictEqual(cur.map(x => x.past), [true, true, false], '오늘이 든 주: 지난 알람은 흐리게');
  assert.deepStrictEqual(cur.map(x => x.next), [false, false, true]); assert.strictEqual(cur[2].minutesUntil, 50, '다음 알람 N분 뒤는 오늘 것 기준');
  const nxt = QA.weekAlarmList(s, NOW, D(2026, 10, 26));
  assert.deepStrictEqual(nxt.map(x => `${x.date} ${x.time}`), ['2026-10-26 09:00', '2026-10-27 07:00', '2026-10-28 09:00']);
  assert.ok(nxt.every(x => !x.past && !x.next && x.minutesUntil === null), '다음 주: 지남·다음 표시 없음');
  assert.deepStrictEqual(QA.weekAlarmList({ ...s, alarms: [] }, NOW, D(2026, 10, 26)), [], '직접 설정한 알람이 없으면 빈 목록(기본 알림이 켜져 있어도)');
  assert.deepStrictEqual(QA.weekAlarmList(null, NOW, D(2026, 10, 26)), []);
  const past = QA.weekAlarmList(s, NOW, D(2026, 10, 12)); assert.ok(past.every(x => x.past && !x.next), '지난 주는 모두 흐리게');
  assert.strictEqual(QA.noWeekAlarmText('다음 주'), '다음 주에 직접 설정한 알람이 없어요'); assert.strictEqual(QA.noWeekAlarmText('이번 주'), '이번 주에 직접 설정한 알람이 없어요');
});
t('주간 조회: 연말·연초 경계, 윤년, 한 주 안의 일 번호 경계', () => {
  const s = { lunchOn: false, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [
    al('a', '10:00', { repeat: { kind: 'date', date: '2026-12-31' } }), al('b', '11:00', { repeat: { kind: 'date', date: '2027-01-01' } }),
    al('c', '09:00', { repeat: { kind: 'weekly', days: [0] } }), al('e', '12:00', { repeat: { kind: 'date', date: '2028-02-29' } })] };
  const l = QA.weekAlarmList(s, D(2026, 12, 24, 9), D(2026, 12, 28));
  assert.deepStrictEqual(l.map(x => `${x.date} ${x.time}`), ['2026-12-31 10:00', '2027-01-01 11:00', '2027-01-03 09:00'], '12/28~1/3: 해가 바뀌는 주');
  assert.deepStrictEqual(l.map(x => x.heading), ['목 12/31', '금 1/1', '일 1/3']);
  const leap = QA.weekAlarmList(s, D(2028, 2, 28, 10), D(2028, 2, 28)); assert.deepStrictEqual(leap.map(x => x.date), ['2028-02-29', '2028-03-05'], '2/28(월)~3/5(일): 윤일 포함');
  assert.ok(leap.some(x => x.date === '2028-02-29' && x.heading === '화 2/29'));
});
t('카드 3개 제한과 더보기 개수: 전체 합계가 기준, 3개 이하면 더보기 없음', () => {
  assert.strictEqual(QA.CARD_MAX_ITEMS, 3);
  for (const [n, shown, more] of [[0, 0, 0], [1, 1, 0], [3, 3, 0], [4, 3, 1], [5, 3, 2], [11, 3, 8]]) {
    const r = QA.limitItems(Array.from({ length: n }, (_, i) => i)); assert.strictEqual(r.shown.length, shown, `n=${n}`); assert.strictEqual(r.more, more, `n=${n}`);
  }
  const s = { lunchOn: false, leaveOn: false, lunchTime: '12:00', leaveTime: '18:00', alarms: [al('a', '09:00', { repeat: { kind: 'weekly', days: [1, 2, 3] } }), al('b', '10:00', { repeat: { kind: 'weekly', days: [1, 2] } })] };
  const week = QA.weekAlarmList(s, NOW, D(2026, 10, 26)), r = QA.limitItems(week);
  assert.strictEqual(week.length, 5); assert.deepStrictEqual(r.shown.map(x => `${x.date} ${x.time}`), ['2026-10-26 09:00', '2026-10-26 10:00', '2026-10-27 09:00']); assert.strictEqual(r.more, 2, '+2개 더보기');
});
t('머리글: 이번 주·다음 주 · 시작~끝(월~일)', () => {
  assert.strictEqual(QA.weekTitle('이번 주', D(2026, 10, 19)), '이번 주 · 10/19(월)~10/25(일)');
  assert.strictEqual(QA.weekTitle('다음 주', D(2026, 10, 26)), '다음 주 · 10/26(월)~11/1(일)');
  assert.strictEqual(QA.weekTitle('다음 주', D(2026, 12, 28)), '다음 주 · 12/28(월)~1/3(일)');
});
t('더보기: 설정창 알람 캘린더를 그 주로 옮겨 연다(검증된 값만, 이미 열린 창에도)', () => {
  const Q = require('../quick-menu.cjs');
  assert.ok(Q.isQuickAction('alarm-calendar'));
  assert.deepStrictEqual(Q.sanitizeTarget(Q.settingsTargetFor('alarm-calendar', { weekStart: '2026-10-26' })), { page: 'alarm', week: '2026-10-26' });
  for (const bad of [undefined, null, {}, { weekStart: 5 }, { weekStart: '2026-13-01' }, { weekStart: '2026-02-30' }, { weekStart: '10/26' }, { weekStart: '<script>' }]) assert.deepStrictEqual(Q.sanitizeTarget(Q.settingsTargetFor('alarm-calendar', bad)), { page: 'alarm' }, JSON.stringify(bad));
  assert.deepStrictEqual(Q.settingsTargetFor('alarm-settings'), { page: 'alarm' }, '기존 알람 설정 열기는 그대로');
  const page = read('src/pages/QuickPage.tsx'), pane = read('src/components/settings/AlarmPane.tsx'), set = read('src/pages/SettingsPage.tsx'), main = read('main.cjs'), pre = read('preload.cjs');
  assert.match(page, /quickAction\('alarm-calendar', \{ weekStart: calendarWeek \}\)/); assert.match(page, /\+\{more\}개 더보기/);
  assert.match(main, /settingsTargetFor\(action, arg\)/); assert.match(pre, /quickAction:\s+\(action, arg\) => ipcRenderer\.send\('quick-action', action, arg\)/);
  assert.match(set, /setWeekGoto\(\{ start: t\.week, n: Date\.now\(\) \}\)/); assert.match(set, /gotoWeek=\{weekGoto\}/);
  assert.match(pane, /setFocus\(\{ date: parseYmd\(gotoWeek\.start\), n: Date\.now\(\) \}\)/);
  assert.ok(/openSettingsTo\(target\)[\s\S]*?settings-goto/.test(main), '이미 열린 창에는 settings-goto로 바로 보낸다');
  assert.strictEqual(CH.EXAMPLES[2], '다음 주 알람 알려줘');
});
// 2026년 월별 주차 날짜 범위(월~일). 기준: 주는 월요일 시작, 그 주의 목요일이 든 달의 주, 그 달 첫 목요일이 든 주가 1주차
const R26 = (...ranges) => ranges.map((r) => r.split('~').map((p) => (/^\d{4}/.test(p) ? p : `2026-${p}`)).join('~'));   // 연도를 안 쓴 날짜는 2026
const RANGES_2026 = {
  1: R26('2025-12-29~01-04', '01-05~01-11', '01-12~01-18', '01-19~01-25', '01-26~02-01'),
  2: R26('02-02~02-08', '02-09~02-15', '02-16~02-22', '02-23~03-01'),
  3: R26('03-02~03-08', '03-09~03-15', '03-16~03-22', '03-23~03-29'),
  4: R26('03-30~04-05', '04-06~04-12', '04-13~04-19', '04-20~04-26', '04-27~05-03'),
  5: R26('05-04~05-10', '05-11~05-17', '05-18~05-24', '05-25~05-31'),
  6: R26('06-01~06-07', '06-08~06-14', '06-15~06-21', '06-22~06-28'),
  7: R26('06-29~07-05', '07-06~07-12', '07-13~07-19', '07-20~07-26', '07-27~08-02'),
  8: R26('08-03~08-09', '08-10~08-16', '08-17~08-23', '08-24~08-30'),
  9: R26('08-31~09-06', '09-07~09-13', '09-14~09-20', '09-21~09-27'),
  10: R26('09-28~10-04', '10-05~10-11', '10-12~10-18', '10-19~10-25', '10-26~11-01'),
  11: R26('11-02~11-08', '11-09~11-15', '11-16~11-22', '11-23~11-29'),
  12: R26('11-30~12-06', '12-07~12-13', '12-14~12-20', '12-21~12-27', '12-28~2027-01-03'),
};
t('주차 계산(2026년 매달): 1주차~마지막 주차의 날짜 범위 표, 월초가 금·토·일인 달, 월말이 월·화·수인 달, 5주차가 있는 달·없는 달', () => {
  const fmt = (d) => sched.ymd(d), full = (s, e) => `${fmt(s)}~${fmt(e)}`;
  for (let m = 1; m <= 12; m++) {
    const want = RANGES_2026[m], got = [];
    assert.strictEqual(WOM.weeksInMonth(2026, m), want.length, `${m}월 주 수`);
    for (let n = 1; n <= want.length; n++) { const s = WOM.weekOfMonthStart(2026, m, n); got.push(full(s, sched.addDays(s, 6))); }
    assert.deepStrictEqual(got, want, `${m}월`);
  }
  assert.strictEqual(WOM.weekOfMonthStart(2026, 11, 5), null); assert.strictEqual(WOM.weekOfMonthStart(2026, 11, 0), null); assert.strictEqual(WOM.weekOfMonthStart(2026, 12, 6), null); assert.strictEqual(WOM.weekOfMonthStart(2026, 11, 1.5), null);
  assert.strictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((a, m) => a + WOM.weeksInMonth(2026, m), 0), 53, '2026년은 ISO 기준 53주');
});
t('주차 계산: 이어지는 주(빈틈·겹침 없음), 역방향 일치, 여러 해(윤년 포함), 기준 상수', () => {
  assert.deepStrictEqual({ ...WOM.WEEK_BASIS }, { weekStartsOn: 1, anchorWeekday: 4 }, '기준은 상수 한 곳(월요일 시작, 목요일이 든 달)');
  for (const y of [2024, 2025, 2026, 2027, 2028, 2032]) {
    let prev = null, total = 0;
    for (let m = 1; m <= 12; m++) {
      const c = WOM.weeksInMonth(y, m); assert.ok(c === 4 || c === 5, `${y}-${m}: ${c}`); total += c;
      for (let n = 1; n <= c; n++) {
        const s = WOM.weekOfMonthStart(y, m, n); assert.strictEqual(s.getDay(), 1, '월요일 시작');
        if (prev) assert.strictEqual(Math.round((s - prev) / 86400000), 7, `${y}-${m}-${n}: 앞 주와 7일 간격`);
        prev = s;
        const back = WOM.weekOfMonthOf(sched.addDays(s, 3)); assert.deepStrictEqual([back.year, back.month, back.n], [y, m, n], '목요일 날짜로 되짚으면 같은 주차');
        for (let k = 0; k < 7; k++) { const b = WOM.weekOfMonthOf(sched.addDays(s, k)); assert.deepStrictEqual([b.month, b.n, sched.ymd(b.start)], [m, n, sched.ymd(s)], '그 주의 어느 날이든 같은 주차'); }
      }
    }
    assert.ok(total === 52 || total === 53, `${y}년 ${total}주`);
  }
  assert.strictEqual(WOM.weeksInMonth(2028, 2), 4); assert.strictEqual(sched.ymd(WOM.weekOfMonthStart(2028, 2, 4)), '2028-02-21');   // 윤년 2월(2/29 포함)
  assert.strictEqual(sched.ymd(WOM.weekOfMonthStart(2027, 1, 1)), '2027-01-04', '2026-12-28~2027-01-03은 12월 5주차이므로 2027년 1월 1주차는 1/4');
  const nov = WOM.weekOfMonthOf(D(2026, 11, 1)); assert.deepStrictEqual([nov.month, nov.n], [10, 5], '11/1(일)은 10월 5주차(10/26~11/1)');
});
t('주 조회 카드 머리글: 이번 주·다음 주·N월 N주차 모두 같은 형식', () => {
  assert.strictEqual(QA.weekTitle('11월 2주차', D(2026, 11, 9)), '11월 2주차 · 11/9(월)~11/15(일)');
  assert.strictEqual(QA.weekTitle('12월 5주차', D(2026, 12, 28)), '12월 5주차 · 12/28(월)~1/3(일)');
  assert.strictEqual(QA.weekTitle('1월 1주차', D(2025, 12, 29)), '1월 1주차 · 12/29(월)~1/4(일)');
  assert.strictEqual(QA.noWeekAlarmText('11월 2주차'), '11월 2주차에 직접 설정한 알람이 없어요');
  const hit = P.parseAlarmCommand('11월 2주차 알람', NOW); const s = { lunchOn: true, leaveOn: true, lunchTime: '12:00', leaveTime: '18:00', alarms: [al('a', '09:00', { repeat: { kind: 'weekly', days: [1] } })] };
  const l = QA.weekAlarmList(s, NOW, D(2026, 11, 9)); assert.strictEqual(l.length, 1); assert.ok(!l[0].past && !l[0].next, '미래 주: 지남·다음 표시 없음');
  assert.strictEqual(hit.week.start, '2026-11-09', '더보기는 해석한 주(11/9)로 캘린더를 옮긴다');
  const past = QA.weekAlarmList(s, NOW, D(2026, 9, 28)); assert.ok(past.length === 1 && past[0].past, '지난 주차도 조회되고 지난 알람은 흐리게');
  const page = read('src/utils/weekOfMonth.ts'); assert.ok(!page.includes(FFFD) && !/\?{3}/.test(page));
});

(async () => { let fail = 0; for (const [name, fn] of queue) { try { await fn(); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } } if (fail) { console.log(`\n${fail}개 실패 / ${queue.length}개`); process.exit(1); } console.log(`  ok  알람 대화 ${queue.length}개 검사(해석 사례 ${cases.length}개 포함)\n\n${queue.length}개 통과`); })();
