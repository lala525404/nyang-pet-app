// 업데이트 소식 카드 단위 테스트: 버전 비교, 후 카드(신규 설치·기존 사용자 첫 실행은 저장만, 낮은 저장값일 때만 보임, 여러 버전 건너뜀),
// 전 카드(같은 버전 한 번만·다시 보기), 앱 내장 소식 데이터(package.json 버전 항목 필수), 저장(새 설치 판정을 깨지 않음), 메인·카드 창 연결(정적 확인).
// `node tests/update-news-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const load = (rel, deps = {}) => { const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, (p) => (p in deps ? deps[p] : {})); return m.exports; };
const FFFD = String.fromCharCode(0xFFFD);
const pkg = JSON.parse(read('package.json'));
const N = load('src/utils/updateNews.ts'), D = load('src/data/releaseNotes.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));

t('버전 해석: 1.7.0·v1.7.0만 인정하고 시험판 꼬리표·모자라거나 넘치는 조각·문자 아닌 값은 null', () => {
  assert.deepStrictEqual(N.parseVersion('1.7.0'), [1, 7, 0]); assert.deepStrictEqual(N.parseVersion('v1.10.2'), [1, 10, 2]); assert.deepStrictEqual(N.parseVersion(' 1.7.0 '), [1, 7, 0]);
  for (const v of ['1.7', '1.7.0.1', '1.7.0-beta', 'x', '', null, undefined, 170, '1.7.a', '99999.0.0', '-1.0.0']) assert.strictEqual(N.parseVersion(v), null, String(v));
});
t('버전 비교: 숫자로 비교(1.10.0 > 1.9.0), 같으면 0, 한쪽이라도 이상하면 null', () => {
  assert.strictEqual(N.compareVersions('1.6.0', '1.7.0'), -1); assert.strictEqual(N.compareVersions('1.7.0', '1.7.0'), 0); assert.strictEqual(N.compareVersions('1.7.1', '1.7.0'), 1);
  assert.strictEqual(N.compareVersions('1.9.0', '1.10.0'), -1); assert.strictEqual(N.compareVersions('2.0.0', '1.99.99'), 1); assert.strictEqual(N.compareVersions('v1.7.0', '1.7.0'), 0);
  assert.strictEqual(N.compareVersions('', '1.7.0'), null); assert.strictEqual(N.compareVersions('1.7.0', 'abc'), null);
});
t('업데이트 후 카드: 저장값이 없으면(신규 설치·기존 사용자 첫 실행) 저장만 하고 카드 없음(seed)', () => {
  for (const stored of [undefined, null, '', '  ', 'garbage', 5]) assert.strictEqual(N.decideWhatsNew({ stored, current: '1.7.0', hasNotes: true }), 'seed', String(stored));
});
t('업데이트 후 카드: 저장값이 현재보다 낮고 소식이 있으면 보인다(show). 같거나 높으면 아무것도 안 한다(none)', () => {
  assert.strictEqual(N.decideWhatsNew({ stored: '1.6.0', current: '1.7.0', hasNotes: true }), 'show');
  assert.strictEqual(N.decideWhatsNew({ stored: '1.7.0', current: '1.7.0', hasNotes: true }), 'none');
  assert.strictEqual(N.decideWhatsNew({ stored: '1.8.0', current: '1.7.0', hasNotes: true }), 'none', '내려받은 경우');
  assert.strictEqual(N.decideWhatsNew({ stored: '1.6.0', current: '1.7.0', hasNotes: false }), 'seed', '현재 버전 소식이 없으면 카드 없이 저장만');
});
t('업데이트 후 카드: 건너뛴 버전이 여러 개여도 현재 버전 소식만 한 번(1.4.0 → 1.7.0), 닫아 저장한 뒤에는 다시 안 나온다', () => {
  assert.strictEqual(N.decideWhatsNew({ stored: '1.4.0', current: '1.7.0', hasNotes: true }), 'show');
  const r = N.decideNotice({ kind: 'whatsnew', payload: { version: '1.7.0' } }, { stored: { lastSeenVersion: '1.4.0' }, current: '1.7.0', notesFor: D.notesFor });
  assert.strictEqual(r.view.version, '1.7.0'); assert.deepStrictEqual(r.view.items, D.notesFor('1.7.0').items); assert.strictEqual(r.view.persist, true);
  assert.notDeepStrictEqual(r.view.items, D.notesFor('1.6.0').items, '이전 버전 소식을 이어 붙이지 않는다');
  assert.strictEqual(N.decideNotice({ kind: 'whatsnew', payload: { version: '1.7.0' } }, { stored: { lastSeenVersion: '1.7.0' }, current: '1.7.0', notesFor: D.notesFor }).skip, true);
});
t('업데이트 후 카드: 시험용 force는 저장값을 무시하고 보이지만 저장하지 않는다. 소식이 없으면 force여도 안 보인다. 현재 버전이 이상하면 none', () => {
  assert.strictEqual(N.decideWhatsNew({ stored: '1.7.0', current: '1.7.0', hasNotes: true, force: true }), 'show');
  assert.strictEqual(N.decideWhatsNew({ stored: '1.7.0', current: '1.7.0', hasNotes: false, force: true }), 'none');
  assert.strictEqual(N.decideWhatsNew({ stored: '1.6.0', current: 'abc', hasNotes: true }), 'none');
  const r = N.decideNotice({ kind: 'whatsnew', payload: { force: true } }, { stored: { lastSeenVersion: '1.7.0' }, current: '1.7.0', notesFor: D.notesFor });
  assert.strictEqual(r.view.persist, false);
});
t('카드 판단(whatsnew): 저장된 설정이 아직 없으면(새 설치가 하트 기본값을 심기 전) 아무것도 저장하지 않고 건너뛴다. 저장값은 있는데 기록이 없으면 현재 버전만 저장(seed)', () => {
  assert.deepStrictEqual(plain(N.decideNotice({ kind: 'whatsnew', payload: null }, { stored: null, current: '1.7.0', notesFor: D.notesFor })), { skip: true });
  assert.deepStrictEqual(plain(N.decideNotice({ kind: 'whatsnew', payload: null }, { stored: { animalId: 'heart' }, current: '1.7.0', notesFor: D.notesFor })), { skip: true, seed: '1.7.0' });
  const replay = N.decideNotice({ kind: 'whatsnew', payload: { force: true, replay: true } }, { stored: null, current: '1.7.0', notesFor: D.notesFor });
  assert.ok(replay.view && replay.view.persist === false, '다시 보기는 저장값 없이도 보이고 저장하지 않는다');
});
t('업데이트 전 카드: 같은 버전에는 자동으로 한 번만(lastPromptedVersion), 다른 버전이면 다시, force(설정창 소식 보기)는 항상', () => {
  assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: '', version: '1.8.0' }), true); assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: undefined, version: '1.8.0' }), true);
  assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: '1.8.0', version: '1.8.0' }), false); assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: 'v1.8.0', version: '1.8.0' }), false);
  assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: '1.8.0', version: '1.9.0' }), true);
  assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: '1.8.0', version: '1.8.0', force: true }), true);
  assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: '', version: 'abc' }), false); assert.strictEqual(N.shouldPromptUpdate({ lastPrompted: '', version: undefined, force: true }), false);
});
t('카드 판단(update): 같은 버전을 이미 안내했으면 건너뜀, 아니면 달라지는 점(문자열만 최대 4개)과 함께 보임, 시험·다시 보기는 저장 안 함', () => {
  const ctx = (stored) => ({ stored, current: '1.7.0', notesFor: D.notesFor });
  assert.strictEqual(N.decideNotice({ kind: 'update', payload: { version: '1.8.0', notes: ['가'] } }, ctx({ lastPromptedVersion: '1.8.0' })).skip, true);
  const r = N.decideNotice({ kind: 'update', payload: { version: '1.8.0', notes: ['가', '', '  ', 5, '나', '다', '라', '마'] } }, ctx({ lastPromptedVersion: '' }));
  assert.deepStrictEqual(plain(r.view), { kind: 'update', version: '1.8.0', notes: ['가', '나', '다', '라'], persist: true });
  assert.strictEqual(N.decideNotice({ kind: 'update', payload: { version: '1.8.0', notes: [], force: true } }, ctx({ lastPromptedVersion: '1.8.0' })).view.persist, false);
  assert.strictEqual(N.decideNotice({ kind: 'update', payload: { version: '1.8.0', fake: true } }, ctx(null)).view.persist, false);
  assert.strictEqual(N.decideNotice({ kind: 'update', payload: { version: '1.8.0' } }, ctx(null)).view.notes.length, 0, '노트가 없으면 빈 배열(새 버전이 나왔어요 카드)');
  assert.strictEqual(N.decideNotice({ kind: 'update', payload: { version: 'zzz' } }, ctx(null)).skip, true, '버전이 이상하면 안 띄운다');
  assert.strictEqual(N.decideNotice({ kind: 'update', payload: null }, ctx(null)).skip, true);
  assert.strictEqual(N.decideNotice({ kind: 'nope', payload: null }, ctx(null)).skip, true, '모르는 종류는 건너뜀');
});

// ── 앱 내장 소식 데이터 ──
t('내장 소식: 버전은 숫자.숫자.숫자·중복 없음·새 버전이 위, 항목 3~5개·한 줄·깨진 글자 없음, 1.6.0과 1.7.0이 있다', () => {
  const list = D.RELEASE_NOTES; assert.ok(list.length >= 2);
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const n = list[i]; assert.ok(N.parseVersion(n.version), n.version); assert.ok(!seen.has(n.version), '중복 ' + n.version); seen.add(n.version);
    if (i > 0) assert.strictEqual(N.compareVersions(list[i - 1].version, n.version), 1, '새 버전이 위로');
    assert.ok(n.items.length >= 3 && n.items.length <= 5, `${n.version} 항목 수 ${n.items.length}`);
    for (const it of n.items) { assert.ok(typeof it === 'string' && it.trim() === it && it.length > 0 && it.length <= 40 && !/\n/.test(it), it); assert.ok(!it.includes(FFFD) && !/\?{3}/.test(it) && /[가-힣]/.test(it), it); }
  }
  assert.ok(D.notesFor('1.6.0') && D.notesFor('1.7.0')); assert.strictEqual(D.notesFor('9.9.9'), null);
  const v17 = D.notesFor('1.7.0').items.join(' ');
  for (const w of ['정리', '일정', '3분', '소식']) assert.ok(v17.includes(w), `1.7.0 소식에 "${w}"`);
});
t('릴리스 때 소식을 잊지 않게: package.json 버전의 소식이 src/data/releaseNotes.ts에 있어야 한다', () => {
  assert.ok(N.parseVersion(pkg.version), pkg.version);
  assert.ok(D.notesFor(pkg.version), `package.json 버전(${pkg.version})의 소식(RELEASE_NOTES 항목)이 없어요. src/data/releaseNotes.ts에 추가해 주세요`);
});

// ── 저장 ──
function fakeStorage(init = {}, { throwOnSet = false } = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (throwOnSet) throw new Error('quota'); m.set(k, String(v)); }, _m: m };
}
const loadSettings = () => load('src/utils/settings.ts', { './theme': { seedFreshTheme() {} } });
t('저장: 저장된 설정이 없으면 아무것도 쓰지 않는다(새 설치의 하트 기본값 판정을 깨지 않음)', () => {
  global.localStorage = fakeStorage(); const S = loadSettings();
  assert.strictEqual(S.patchStoredSettings({ lastSeenVersion: '1.7.0' }), false); assert.strictEqual(S.hasStoredSettings(), false); assert.strictEqual(global.localStorage._m.size, 0);
});
t('저장: 있으면 그 키만 덧붙이고 나머지(없는 키 포함)는 그대로 둔다. 기본값을 끼워 넣지 않는다', () => {
  global.localStorage = fakeStorage({ petSettings: JSON.stringify({ animalId: 'fox', size: 120, alarms: [{ id: 'a', time: '09:00', enabled: true }] }) }); const S = loadSettings();
  assert.strictEqual(S.patchStoredSettings({ lastSeenVersion: '1.7.0' }), true);
  const saved = JSON.parse(global.localStorage.getItem('petSettings'));
  assert.strictEqual(saved.lastSeenVersion, '1.7.0'); assert.strictEqual(saved.animalId, 'fox'); assert.strictEqual(saved.size, 120); assert.strictEqual(saved.alarms.length, 1);
  assert.strictEqual('lastPromptedVersion' in saved, false); assert.strictEqual('bubbleEnabled' in saved, false, '기본값을 채워 넣지 않는다');
  assert.strictEqual(S.loadSettings().lastPromptedVersion, '', '읽을 때는 기본값 ""가 보인다');
});
t('저장: 저장소가 막혀 있거나(throw) 깨진 JSON이면 false, 예외를 던지지 않는다. 새 키의 기본값은 빈 문자열', () => {
  global.localStorage = fakeStorage({ petSettings: JSON.stringify({ a: 1 }) }, { throwOnSet: true }); let S = loadSettings();
  assert.strictEqual(S.patchStoredSettings({ lastSeenVersion: '1.7.0' }), false);
  global.localStorage = fakeStorage({ petSettings: '{깨짐' }); S = loadSettings(); assert.strictEqual(S.patchStoredSettings({ lastSeenVersion: '1.7.0' }), false);
  assert.strictEqual(S.DEFAULT_SETTINGS.lastSeenVersion, ''); assert.strictEqual(S.DEFAULT_SETTINGS.lastPromptedVersion, '');
});

t('설정창이 낡은 값으로 덮어쓰지 않는다: 저장할 때 다른 창이 쓴 기록(lastSeenVersion·lastPromptedVersion)은 저장값의 것을 이어받고, 나머지는 설정창 값 그대로', () => {
  global.localStorage = fakeStorage({ petSettings: JSON.stringify({ animalId: 'fox', lastSeenVersion: '1.7.0', lastPromptedVersion: '1.8.0' }) }); const S = loadSettings();
  const stale = { ...S.DEFAULT_SETTINGS, animalId: 'cat', size: 130, lastSeenVersion: '1.5.0', lastPromptedVersion: '' };
  const out = S.inheritOtherWindowKeys(stale);
  assert.strictEqual(out.lastSeenVersion, '1.7.0'); assert.strictEqual(out.lastPromptedVersion, '1.8.0');
  assert.strictEqual(out.animalId, 'cat'); assert.strictEqual(out.size, 130, '설정창에서 바꾼 값은 그대로');
  assert.strictEqual(stale.lastSeenVersion, '1.5.0', '입력을 바꾸지 않는다');
  global.localStorage = fakeStorage({ petSettings: JSON.stringify({ animalId: 'fox' }) });   // 저장값에 그 키가 아직 없으면 설정창 값을 둔다
  assert.strictEqual(loadSettings().inheritOtherWindowKeys(stale).lastSeenVersion, '1.5.0');
  global.localStorage = fakeStorage();   // 저장값이 없으면 그대로
  assert.strictEqual(loadSettings().inheritOtherWindowKeys(stale), stale);
  assert.deepStrictEqual([...S.OTHER_WINDOW_KEYS], ['lastSeenVersion', 'lastPromptedVersion', 'alarmCleanupDay', 'alarmClockMark', 'alarmCleanupUndo', 'lastBriefDate']);
});

// ── 연결(정적 확인) ──
t('메인 연결: 카드는 한 번에 하나(큐), 퀵 메뉴가 열리면 치우고, 포커스를 빼앗지 않고 보이며, 열기는 사용자가 누를 때만·주소는 메인이 만든다', () => {
  const m = read('main.cjs');
  assert.ok(m.includes("require('./notice-card.cjs')") && m.includes("require('./release-notes.cjs')"));
  assert.ok(m.includes('deferActiveNotice();') && m.includes('showInactive()'));
  assert.ok(/ipcMain\.on\('notice-action'/.test(m) && m.includes("const NOTICE_ACTIONS = ['ok', 'later', 'close', 'update', 'details', 'week']"), '카드 창이 보낸 동작은 정해진 값만');
  assert.ok(m.includes('releaseNotes.releaseUrl(it && it.payload && it.payload.version)'), '릴리스 주소는 카드의 버전(메인 값)으로만 만든다');
  assert.ok(/if \(url\) \{ try \{ shell\.openExternal\(url\)/.test(m));
  assert.ok(m.includes('parseNotes: releaseNotes.parseReleaseNotes'), '업데이터는 이미 받은 info.releaseNotes만 해석한다');
  assert.ok(m.includes("if (kind === 'available') return promptAvailableCard(ctx);"), '새 버전 안내는 카드로');
  assert.ok(m.includes('updater.download()'), '지금 업데이트는 기존 download() 흐름');
  assert.ok(m.includes('stopNoticeTimers();'), '종료 때 카드 타이머 정리');
  assert.ok(m.includes('startNoticeChecks();'));
});
t('새 네트워크 요청 없음: 안내 카드 관련 파일에 fetch·http·net이 없다(업데이트 전 카드는 기존 update-available 응답만)', () => {
  for (const f of ['notice-card.cjs', 'release-notes.cjs', 'src/pages/NoticePage.tsx', 'src/utils/updateNews.ts', 'src/data/releaseNotes.ts']) { const s = read(f); assert.ok(!/\bfetch\(|https?\.request|XMLHttpRequest|net\.fetch|axios/.test(s), f); }
});
t('카드 창: 글자로만 그린다(HTML 삽입 없음), 저장은 patchStoredSettings 한 길, 색은 퀵 바 변수 재사용, 펫 클릭 핸들러가 있는 PetPage는 건드리지 않는다', () => {
  const p = read('src/pages/NoticePage.tsx'), css = read('src/styles/notice.css');
  assert.ok(!/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|eval\(/.test(p));
  assert.ok(p.includes('patchStoredSettings') && !/localStorage\.setItem/.test(p));
  assert.ok(css.includes('--quick-bar-hover') && css.includes('.qk-card') && !/#[0-9a-fA-F]{3,6}\b/.test(css), '색은 퀵 바 변수만(하드코딩 색 없음)');
  assert.ok(/prefers-reduced-motion/.test(css));
  assert.ok(!/noticeGet|noticeAction|NoticePage/.test(read('src/pages/PetPage.tsx')));
  const sp = read('src/pages/SettingsPage.tsx');
  assert.ok(sp.includes('inheritOtherWindowKeys(latestRef.current)') && sp.includes('OTHER_WINDOW_KEYS.filter'), '설정창은 저장할 때 다른 창의 기록을 이어받고, 저장소 변경 때 가져온다');
});
t('파일에 깨진 글자(U+FFFD)·???가 없다', () => {
  for (const f of ['src/utils/updateNews.ts', 'src/data/releaseNotes.ts', 'src/pages/NoticePage.tsx', 'src/styles/notice.css', 'notice-card.cjs', 'release-notes.cjs']) { const s = read(f); assert.ok(!s.includes(FFFD) && !/\?{3}/.test(s), f); }
});

(async () => {
  let n = 0;
  for (const [name, fn] of queue) { await fn(); n++; console.log('  ok  ' + name); }
  console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
