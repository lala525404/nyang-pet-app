// 공휴일 표시 단위 테스트: 내장 목록(2026~2027)의 날짜 유효성·요일 규칙·대체공휴일 규칙, 짧은 이름, 표시만 한다는 연결(알람 동작에 영향 없음).
// `node tests/holiday-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, () => ({})); return m.exports; };
const H = load('src/data/holidays.ts');
const FFFD = String.fromCharCode(0xFFFD);
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const entries = Object.entries(H.HOLIDAYS);
const weekday = (k) => parse(k).getDay();   // 0=일 6=토

t('날짜 형식·실제 존재하는 날, 2026~2027년만, 중복 없음, 이름 깨짐 없음', () => {
  assert.deepStrictEqual([...H.HOLIDAY_YEARS], [2026, 2027]);
  assert.strictEqual(new Set(entries.map(e => e[0])).size, entries.length);
  for (const [k, name] of entries) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(k), k); assert.strictEqual(key(parse(k)), k, `없는 날짜 ${k}`); assert.ok([2026, 2027].includes(parse(k).getFullYear()), k);
    assert.ok(name && !name.includes(FFFD) && !/\?{3}/.test(name) && /[가-힣]/.test(name), name);
  }
  assert.ok(!read('src/data/holidays.ts').includes(FFFD));
});
t('알려진 날짜(공식 달력): 설날·추석 연휴, 삼일절, 어린이날, 부처님오신날, 노동절·제헌절, 요일이 맞다', () => {
  const dow = (k) => '일월화수목금토'[weekday(k)];
  const exp = { '2026-01-01': '목', '2026-02-17': '화', '2026-03-01': '일', '2026-05-01': '금', '2026-05-05': '화', '2026-05-24': '일', '2026-06-06': '토', '2026-07-17': '금', '2026-08-15': '토', '2026-09-25': '금', '2026-10-03': '토', '2026-10-09': '금', '2026-12-25': '금',
    '2027-01-01': '금', '2027-02-07': '일', '2027-03-01': '월', '2027-05-01': '토', '2027-05-05': '수', '2027-05-13': '목', '2027-06-06': '일', '2027-07-17': '토', '2027-08-15': '일', '2027-09-15': '수', '2027-10-03': '일', '2027-10-09': '토', '2027-12-25': '토' };
  for (const [k, d] of Object.entries(exp)) { assert.ok(H.HOLIDAYS[k], `${k} 빠짐`); assert.strictEqual(dow(k), d, `${k} 요일`); }
  assert.strictEqual(H.HOLIDAYS['2026-05-01'], '노동절'); assert.strictEqual(H.HOLIDAYS['2026-07-17'], '제헌절'); assert.strictEqual(H.HOLIDAYS['2027-05-01'], '노동절'); assert.strictEqual(H.HOLIDAYS['2027-07-17'], '제헌절');
});
t('설날·추석 연휴는 사흘 연속(가운데가 명절 당일)', () => {
  for (const [mid, name] of [['2026-02-17', '설날'], ['2026-09-25', '추석'], ['2027-02-07', '설날'], ['2027-09-15', '추석']]) {
    const d = parse(mid); const prev = new Date(d); prev.setDate(d.getDate() - 1); const next = new Date(d); next.setDate(d.getDate() + 1);
    assert.strictEqual(H.HOLIDAYS[mid], name); assert.strictEqual(H.HOLIDAYS[key(prev)], `${name} 연휴`); assert.strictEqual(H.HOLIDAYS[key(next)], `${name} 연휴`);
  }
});
t('대체공휴일 규칙: 원래 공휴일이 주말(또는 다른 공휴일과 겹침)일 때만, 그 뒤 첫 번째 비공휴일 평일. 현충일은 대체 없음', () => {
  const subs = entries.filter(([, n]) => n.startsWith('대체공휴일('));
  assert.strictEqual(subs.filter(([k]) => k.startsWith('2026')).length, 4, '2026 대체공휴일 4일'); assert.strictEqual(subs.filter(([k]) => k.startsWith('2027')).length, 7, '2027 대체공휴일 7일(월력요항)');
  for (const [k, n] of subs) {
    const base = /^대체공휴일\((.+)\)$/.exec(n)[1]; assert.ok(![0, 6].includes(weekday(k)), `대체공휴일이 주말: ${k}`);
    // 원래 공휴일(설날·추석은 연휴 중 하나)이 그 앞에 있어야 하고, 그 사이는 모두 공휴일/주말
    const baseKeys = entries.filter(([, nm]) => nm === base || nm === `${base} 연휴`).map(([bk]) => bk).filter(bk => bk < k); assert.ok(baseKeys.length, `${k}의 원래 공휴일 ${base}`);
    const latest = baseKeys[baseKeys.length - 1];
    for (let cur = parse(latest); key(cur) < k; cur.setDate(cur.getDate() + 1)) { if (key(cur) === latest) continue; const kk = key(cur); assert.ok([0, 6].includes(cur.getDay()) || H.HOLIDAYS[kk], `${latest}와 ${k} 사이의 ${kk}는 휴일이어야 한다`); }
  }
  assert.ok(!entries.some(([, n]) => n === '대체공휴일(현충일)'), '현충일은 대체공휴일이 없다');
  for (const k of ['2026-05-01', '2026-07-17']) assert.ok(![0, 6].includes(weekday(k)) && !H.HOLIDAYS[key(new Date(parse(k).getTime() + 86400000))]?.startsWith('대체'), `${k}는 금요일이라 대체공휴일 없음`);
  assert.ok(![...entries].some(([k, n]) => n.startsWith('대체공휴일') && weekday(k) !== 1 && weekday(k) !== 2), '대체공휴일은 월·화(설날 대체 화요일)');
});
t('이름 조회·짧은 이름: 평일은 null, 범위 밖 연도는 null, 대체공휴일은 "OO 대체"', () => {
  assert.strictEqual(H.holidayName(new Date(2026, 9, 5)), '대체공휴일(개천절)'); assert.strictEqual(H.holidayName(new Date(2026, 9, 6)), null); assert.strictEqual(H.holidayName(new Date(2025, 0, 1)), null); assert.strictEqual(H.holidayName(new Date(2028, 0, 1)), null);
  assert.strictEqual(H.holidayShort('대체공휴일(삼일절)'), '삼일절 대체'); assert.strictEqual(H.holidayShort('설날 연휴'), '설날 연휴'); assert.strictEqual(H.holidayShort('노동절'), '노동절');
  assert.strictEqual(H.holidayName(new Date(2027, 1, 9)), '대체공휴일(설날)');
});
t('표시만 한다: 알람 판정·스케줄러·알람 목록 코드는 공휴일을 쓰지 않고, 캘린더는 이름 표시에만 쓴다. 날짜 칸 누르기(알람 만들기) 동작은 그대로', () => {
  for (const f of ['alarms.cjs', 'main.cjs', 'src/utils/alarmSchedule.ts', 'src/utils/alarmCalendar.ts', 'src/utils/quickAlarms.ts']) assert.ok(!/holiday/i.test(read(f)), `${f}는 공휴일을 모른다`);
  const cal = read('src/components/settings/AlarmCalendar.tsx');
  assert.ok(/import \{ holidayName, holidayShort \} from '..\/..\/data\/holidays'/.test(cal));
  assert.ok(/data-holiday=/.test(cal) && /st-cal-hol/.test(cal) && /st-agenda-hol/.test(cal));
  assert.ok(/const create = \(col: number, zone: Zone\) => \{\s*if \(isPastDay\(dates\[col\], now\)\)/.test(cal), '날짜 칸 누르기 로직 그대로');
  assert.ok(/data-holiday/.test(read('src/styles/settings.css')) || /st-cal-dayhead\[data-holiday\]/.test(read('src/styles/settings.css')));
});

(async () => { let fail = 0; for (const [name, fn] of queue) { try { await fn(); console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } } if (fail) { console.log(`\n${fail}개 실패`); process.exit(1); } console.log(`\n${queue.length}개 통과`); })();
