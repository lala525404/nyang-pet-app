// 기본 테마(라이트) 회귀 테스트. 신규 설치만 라이트, 기존 사용자의 테마·설정은 그대로. `node scripts/test-default-light.cjs`
const ts = require('typescript'), fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
function load(rel, env) {
  const out = ts.transpileModule(fs.readFileSync(path.join(root, rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  const req = (p) => (p.startsWith('.') ? load(path.join(path.dirname(rel), p).split(path.sep).join('/') + (path.extname(p) ? '' : '.ts'), env) : require(p));
  new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, req, env.localStorage, env.window);
  return m.exports;
}
const env = (init = {}, hash = '') => {
  const store = new Map(Object.entries(init));
  return { store, localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) }, window: { location: { hash } } };
};
let n = 0; const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

t('새 설치 창(저장값 없음)은 라이트로 시작', () => {
  assert.strictEqual(load('src/utils/theme.ts', env({}, '#/settings?intro=1&entrance=new')).getThemePref(), 'light');
  assert.strictEqual(load('src/utils/theme.ts', env({}, '#/pet?fresh=1')).getThemePref(), 'light');
});
t('새 설치 확정 시 테마·설정이 함께 저장되고 이후 창에서도 라이트', () => {
  const e = env({}, '#/settings?intro=1&entrance=new');
  const s = load('src/utils/settings.ts', e);
  assert.strictEqual(s.seedFreshInstall(true), true);
  assert.strictEqual(e.store.get('themePref'), 'light');
  assert.strictEqual(JSON.parse(e.store.get('petSettings')).animalId, 'heart');
  assert.strictEqual(load('src/utils/theme.ts', env(Object.fromEntries(e.store), '#/settings')).getThemePref(), 'light');
});
t('기존 사용자: 저장된 테마는 새 설치 표시가 있어도 그대로', () => {
  for (const v of ['dark', 'system', 'light']) assert.strictEqual(load('src/utils/theme.ts', env({ themePref: v }, '#/settings?entrance=new')).getThemePref(), v);
  const e = env({ themePref: 'dark', petSettings: '{"animalId":"dog"}' }, '#/settings?entrance=new');
  assert.strictEqual(load('src/utils/settings.ts', e).seedFreshInstall(true), false);
  assert.strictEqual(e.store.get('themePref'), 'dark');
});
t('기존 사용자: 테마를 저장한 적 없으면 예전 기본값(시스템) 유지, 아무것도 쓰지 않는다', () => {
  assert.strictEqual(load('src/utils/theme.ts', env({ petSettings: '{"animalId":"cat"}' }, '#/settings?entrance=old')).getThemePref(), 'system');
  assert.strictEqual(load('src/utils/theme.ts', env({ petSettings: '{"animalId":"cat"}' }, '#/settings?entrance=new')).getThemePref(), 'system');
  assert.strictEqual(load('src/utils/theme.ts', env({}, '#/settings')).getThemePref(), 'system');
  const e = env({ petSettings: '{}' }, '#/settings'); load('src/utils/settings.ts', e).seedFreshInstall(false);
  assert.strictEqual(e.store.has('themePref'), false);
});
t('테마 옵션은 라이트/다크/시스템 세 가지, 순환 순서 유지', () => {
  const th = load('src/utils/theme.ts', env());
  assert.deepStrictEqual(th.THEME_ORDER, ['light', 'dark', 'system']);
  assert.strictEqual(th.nextThemePref('system'), 'light');
});
console.log(`\n${n}개 통과`);
