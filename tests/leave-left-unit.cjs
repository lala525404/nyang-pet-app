// 초집중 모드 "퇴근까지 남은 시간" 단위 테스트: 남은 시간 계산, 초집중 켜짐/꺼짐에 따른 표시, 1분 타이머 하나와 정리.
// `node tests/leave-left-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const load = (rel) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, () => ({})); return m.exports; };
const L = load('src/utils/leaveLeft.ts'), T = load('src/utils/minuteTicker.ts');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const at = (h, m, s = 0) => new Date(2026, 9, 23, h, m, s, 0);
const text = (h, m, leave = '18:00', start = '09:00', s = 0) => L.leaveLeftText(at(h, m, s), start, leave);

t('남은 시간: 2시간 15분 / 42분 / 정확히 1시간 / 1분 / 12시간', () => {
  assert.strictEqual(text(15, 45), '퇴근까지 2시간 15분'); assert.strictEqual(text(17, 18), '퇴근까지 42분');
  assert.strictEqual(text(17, 0), '퇴근까지 1시간'); assert.strictEqual(text(17, 59), '퇴근까지 1분'); assert.strictEqual(text(6, 0), '퇴근까지 12시간');
  assert.strictEqual(text(17, 59, '18:00', '09:00', 59), '퇴근까지 1분', '초는 무시(분 단위)');
  assert.strictEqual(text(16, 30, '17:30'), '퇴근까지 1시간'); assert.strictEqual(text(16, 5, '18:30'), '퇴근까지 2시간 25분');
});
t('점심 시간은 근무시간에서 빼지 않는다(퇴근 시간만 기준)', () => {
  assert.strictEqual(L.minutesUntilLeave(at(11, 0), '09:00', '18:00'), 7 * 60); assert.strictEqual(text(11, 0), '퇴근까지 7시간');
  assert.ok(!read('src/utils/leaveLeft.ts').split('\n').filter(l => !l.trim().startsWith('//')).join('\n').includes('lunch'), '계산에 lunch 없음');
});
t('퇴근 시각 정각: "퇴근 시간이에요 🎉", 지난 뒤 59분까지만 한 줄, 60분이 지나면 표시하지 않는다', () => {
  assert.strictEqual(text(18, 0), '퇴근 시간이에요 🎉'); assert.strictEqual(text(18, 0, '18:00', '09:00', 30), '퇴근 시간이에요 🎉');
  assert.strictEqual(text(18, 30), '퇴근 시간이에요 🎉'); assert.strictEqual(text(18, 59), '퇴근 시간이에요 🎉');
  assert.strictEqual(text(19, 0), null); assert.strictEqual(text(23, 0), null);
  assert.strictEqual(L.LEAVE_NOW_TEXT, '퇴근 시간이에요 🎉'); assert.strictEqual(L.AFTER_LEAVE_SHOW_MIN, 60);
});
t('설정이 없거나 비어 있거나 형식이 틀리면 기본값(근무 시작 09:00, 퇴근 18:00)을 쓴다', () => {
  assert.strictEqual(L.DEFAULT_WORK_START, '09:00'); assert.strictEqual(L.DEFAULT_LEAVE, '18:00');
  for (const bad of [undefined, null, '', '  ', 'abc', '25:00', '18:60', '1800', '18:0', 7]) { assert.strictEqual(L.leaveLeftText(at(15, 0), '09:00', bad), '퇴근까지 3시간', String(bad)); assert.strictEqual(L.leaveLeftText(at(15, 0), bad, '18:00'), '퇴근까지 3시간', String(bad)); }
  assert.strictEqual(L.leaveLeftText(at(15, 0), undefined, undefined), '퇴근까지 3시간'); assert.strictEqual(L.dayRatio(at(13, 30), '', ''), 0.5, '둘 다 비면 09:00~18:00');
  assert.strictEqual(L.leaveLeftText(at(15, 0), '09:00', '9:30'), null, '9:30 퇴근은 이미 지났고 한 시간도 넘음');
});
t('진행바 퍼센트: 시작 전 0, 시작 정각 0, 중간, 퇴근 정각 100, 퇴근 후 100(가득), 59분 뒤까지만 보이고 그 뒤 숨김', () => {
  const pct = (h, m, s = '09:00', e = '18:00') => Math.round(L.dayRatio(at(h, m), s, e) * 1000) / 10;
  assert.strictEqual(pct(7, 0), 0); assert.strictEqual(pct(8, 59), 0); assert.strictEqual(pct(9, 0), 0);
  assert.strictEqual(pct(9, 54), 10); assert.strictEqual(pct(13, 30), 50); assert.strictEqual(pct(15, 45), 75); assert.strictEqual(pct(17, 59), 99.8);
  assert.strictEqual(pct(18, 0), 100); assert.strictEqual(pct(18, 30), 100); assert.strictEqual(pct(23, 0), 100);
  assert.deepStrictEqual(L.leaveView(at(15, 45), '09:00', '18:00'), { text: '퇴근까지 2시간 15분', ratio: 0.75 });
  assert.deepStrictEqual(L.leaveView(at(18, 0), '09:00', '18:00'), { text: '퇴근 시간이에요 🎉', ratio: 1 });
  assert.deepStrictEqual(L.leaveView(at(18, 59), '09:00', '18:00'), { text: '퇴근 시간이에요 🎉', ratio: 1 }); assert.strictEqual(L.leaveView(at(19, 0), '09:00', '18:00'), null);
  assert.deepStrictEqual(L.leaveView(at(7, 0), '09:00', '18:00'), { text: '퇴근까지 11시간', ratio: 0 }, '시작 전: 0%와 남은 시간');
  assert.strictEqual(pct(10, 30, '10:30', '19:30'), 0); assert.strictEqual(pct(15, 0, '10:30', '19:30'), 50, '사용자가 바꾼 시간 기준');
  // 야간 근무(22:00~06:00): 자정을 넘어도 이어서 채운다
  assert.strictEqual(pct(22, 0, '22:00', '06:00'), 0); assert.strictEqual(pct(2, 0, '22:00', '06:00'), 50); assert.strictEqual(pct(0, 0, '22:00', '06:00'), 25); assert.strictEqual(pct(5, 30, '22:00', '06:00'), 93.8);
  assert.strictEqual(pct(6, 0, '22:00', '06:00'), 100); assert.strictEqual(pct(6, 30, '22:00', '06:00'), 100); assert.strictEqual(L.leaveView(at(7, 0), '22:00', '06:00'), null); assert.strictEqual(pct(12, 0, '22:00', '06:00'), 100, '퇴근 후(숨김 상태)에는 가득');
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 7) { const r = L.dayRatio(at(h, m), '09:00', '18:00'); assert.ok(r >= 0 && r <= 1); }
});
t('자정 근처: 퇴근 23:50이면 23:49에 1분 남음, 야간 근무(22:00~06:00)는 자정을 넘겨도 계속 계산', () => {
  assert.strictEqual(text(23, 49, '23:50', '09:00'), '퇴근까지 1분'); assert.strictEqual(text(23, 50, '23:50', '09:00'), '퇴근 시간이에요 🎉');
  assert.strictEqual(text(0, 0, '18:00'), '퇴근까지 18시간', '오늘 퇴근 시간까지(자정 직후)'); assert.strictEqual(text(0, 0, '00:10', '00:30'), '퇴근까지 10분', '근무 시작(00:30)보다 이른 퇴근(00:10)은 다음 날: 자정 직후에도 아직 근무 중');
  assert.strictEqual(text(23, 30, '06:00', '22:00'), '퇴근까지 6시간 30분'); assert.strictEqual(text(0, 30, '06:00', '22:00'), '퇴근까지 5시간 30분');
  assert.strictEqual(text(5, 30, '06:00', '22:00'), '퇴근까지 30분'); assert.strictEqual(text(6, 0, '06:00', '22:00'), '퇴근 시간이에요 🎉'); assert.strictEqual(text(7, 0, '06:00', '22:00'), null);
  assert.strictEqual(text(22, 0, '06:00', '22:00'), '퇴근까지 8시간');
});
t('시간 표기: 2시간 15분 / 42분 / 1시간 / 최소 1분', () => {
  assert.strictEqual(L.durationText(135), '2시간 15분'); assert.strictEqual(L.durationText(42), '42분'); assert.strictEqual(L.durationText(60), '1시간'); assert.strictEqual(L.durationText(0.2), '1분');
});

// ── 1분 타이머 하나, 정리 ───────────────────────────────────────────────────
const fake = (start) => { let now = start; const timers = new Map(); let nextId = 1; let cleared = 0, created = 0;
  return { deps: { now: () => new Date(now), setTimer: (fn, ms) => { const id = nextId++; created++; timers.set(id, { fn, at: now + ms }); return id; }, clearTimer: (id) => { cleared++; timers.delete(id); } },
    advance: (ms) => { const end = now + ms; for (;;) { const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); } now = end; },
    pending: () => timers.size, stats: () => ({ created, cleared }) }; };
t('1분 타이머: 분이 바뀐 직후마다 한 번, 대기 중인 타이머는 항상 하나', () => {
  const f = fake(new Date(2026, 9, 23, 15, 45, 20, 500).getTime()); const seen = [];
  const stop = T.startMinuteTicker((d) => seen.push(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`), f.deps);
  assert.strictEqual(seen.length, 1); assert.strictEqual(f.pending(), 1);
  f.advance(60 * 60 * 1000); assert.strictEqual(seen.length, 61, '한 시간 동안 60번(분마다 한 번)'); assert.strictEqual(f.pending(), 1);
  assert.ok(seen.slice(1).every(s => s.endsWith(':00')), `분 경계 직후: ${seen.slice(1, 4)}`);
  stop(); assert.strictEqual(f.pending(), 0, '정리 뒤 타이머 없음');
});
t('정리(초집중 꺼짐): stop 뒤에는 더 이상 호출되지 않고 타이머가 남지 않는다, 여러 번 stop해도 안전', () => {
  const f = fake(new Date(2026, 9, 23, 15, 45, 0, 0).getTime()); let n = 0;
  const stop = T.startMinuteTicker(() => { n++; }, f.deps); f.advance(3 * 60 * 1000); const before = n; assert.strictEqual(before, 3, '처음 한 번 + 3분 동안 분 경계 직후 두 번');
  stop(); stop(); f.advance(10 * 60 * 1000); assert.strictEqual(n, before); assert.strictEqual(f.pending(), 0);
  // 켰다 껐다 반복해도 타이머가 쌓이지 않는다
  for (let i = 0; i < 20; i++) { const s = T.startMinuteTicker(() => {}, f.deps); assert.strictEqual(f.pending(), 1); s(); assert.strictEqual(f.pending(), 0); }
  assert.strictEqual(T.msToNextMinute(new Date(2026, 9, 23, 15, 45, 59, 900)), 120); assert.strictEqual(T.msToNextMinute(new Date(2026, 9, 23, 15, 45, 0, 0)), 60020);
});
t('화면 연결(정적): 초집중 모드가 켜져 있고 알림이 없을 때만 그려지고, 타이머는 컴포넌트 정리에서 멈춘다, 새 창·칩·설정 스위치 없음', () => {
  const pet = read('src/pages/PetPage.tsx'), comp = read('src/components/FocusLeaveLeft.tsx');
  assert.ok(/\{focus\.enabled && !alertActive && <FocusLeaveLeft workStart=\{settings\.workStart\} leaveTime=\{settings\.leaveTime\} \/>\}/.test(pet), '초집중 켜짐 + 알림 없음일 때만');
  assert.ok(/useEffect\(\(\) => startMinuteTicker\(setNow\), \[\]\)/.test(comp), '마운트 때 시작하고 정리 함수(stop)를 돌려준다');
  assert.ok(/if \(!v\) return null/.test(comp) && /leaveView\(now, workStart, leaveTime\)/.test(comp) && /width: `\$\{\(v\.ratio \* 100\)/.test(comp), '진행바 폭은 비율로, 숨길 때는 전부 숨김'); assert.ok(!/requestAnimationFrame/.test(comp + read('src/utils/minuteTicker.ts')), 'rAF 반복 없음');
  assert.ok(/transition: width/.test(read('src/styles/pet.css')) && /\.focus-leave \{[^}]*margin: 2px 0 6px/.test(read('src/styles/pet.css')), 'CSS transition, 창 아래 끝에서 6px 위 유지'); assert.ok(!/setInterval/.test(comp + read('src/utils/minuteTicker.ts')), 'setInterval 없음(분 경계 타이머 하나)');
  assert.ok(/pointer-events: none/.test(read('src/styles/pet.css').slice(read('src/styles/pet.css').indexOf('.focus-leave'))));
  const home = read('src/components/settings/HomePane.tsx'); assert.strictEqual([...home.matchAll(/^\s+id: '([a-z]+)', label:/gm)].length, 8, '홈 칩 8개');
  assert.ok(!/leave-left|leaveLeft|FocusLeaveLeft/.test(home + read('src/utils/settings.ts')), '새 설정 스위치·키 없음');
  assert.ok(!/leaveLeft|FocusLeaveLeft|minuteTicker/.test(read('alarms.cjs') + read('main.cjs')), '알람 스케줄러·메인과 무관');
});

(async () => {
  let n = 0;
  for (const [name, fn] of queue) { try { await fn(); n++; console.log(`  ok  ${name}`); } catch (e) { console.error(`FAIL  ${name}\n`, e); process.exit(1); } }
  console.log(`\n${n}개 통과`);
})();
