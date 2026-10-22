// 기본 버디(최애 하트) 회귀 테스트. 의존성 없이 `node scripts/test-default-heart.cjs`로 실행한다.
// 신규 설치만 하트, 기존 사용자는 그대로, 동물 선택·사진 대표 지정·교체 설정과 충돌하지 않는지 확인한다.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
function load(rel, env) {
  const file = path.join(root, rel);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  const req = (p) => (p.startsWith('.') ? load(path.join(path.dirname(rel), p).split(path.sep).join('/') + (path.extname(p) ? '' : '.ts'), env).exports : require(p));
  new Function('module', 'exports', 'require', 'localStorage', 'window', out)(m, m.exports, req, env.localStorage, env.window);
  return m;
}
function env(stored, hash = '') {
  const store = new Map(stored ? [['petSettings', JSON.stringify(stored)]] : []);
  return {
    store,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    window: { location: { hash } },
  };
}
const saved = (e) => JSON.parse(e.store.get('petSettings'));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

t('펫 목록 맨 앞이 최애 하트, id 중복 없음', () => {
  const a = load('src/data/animals.ts', env()).exports;
  assert.strictEqual(a.ANIMALS[0].id, 'heart');
  assert.strictEqual(a.ANIMALS[0].name, '최애 하트');
  assert.strictEqual(a.ANIMALS.length, new Set(a.ANIMALS.map(x => x.id)).size);
  assert.strictEqual(a.ANIMALS.length, 9);
  for (const m of Object.values(a.ANIMALS[0].moods)) assert.strictEqual(m, a.HEART_EMOJI);
});
t('모르는 animalId는 하트가 아니라 고양이(기존 동작)', () => {
  const a = load('src/data/animals.ts', env()).exports;
  assert.strictEqual(a.getAnimal('nope').id, 'cat');
  assert.strictEqual(a.getAnimal('dog').id, 'dog');
  assert.strictEqual(a.getAnimal('heart').id, 'heart');
});
t('신규 설치(메인=새 설치, 저장값 없음): 하트가 저장되고 로드된다', () => {
  const e = env(null);
  const s = load('src/utils/settings.ts', e).exports;
  assert.strictEqual(s.seedFreshInstall(true), true);
  assert.strictEqual(saved(e).animalId, 'heart');
  assert.strictEqual(s.loadSettings().animalId, 'heart');
  assert.strictEqual(s.seedFreshInstall(true), true);   // 다시 불러도 같은 판단
  assert.strictEqual(s.loadSettings().useCustomMode, false);   // 동물 탭에서 하트가 선택된 채로 열린다(사진 업로드 시 true로 켜진다)
});
t('저장값이 있으면 메인이 새 설치라 해도 건드리지 않는다', () => {
  const e = env({ animalId: 'dog', customImages: ['data:a', null, 'data:b'], useCustomMode: false });
  const s = load('src/utils/settings.ts', e).exports;
  assert.strictEqual(s.seedFreshInstall(true), false);
  assert.deepStrictEqual(saved(e), { animalId: 'dog', customImages: ['data:a', null, 'data:b'], useCustomMode: false });
  assert.strictEqual(s.loadSettings().animalId, 'dog');
});
t('새 설치가 아니면(저장값 없음) 예전 기본값 고양이 그대로, 아무것도 쓰지 않는다', () => {
  const e = env(null);
  const s = load('src/utils/settings.ts', e).exports;
  assert.strictEqual(s.seedFreshInstall(false), false);
  assert.strictEqual(e.store.size, 0);
  assert.strictEqual(s.loadSettings().animalId, 'cat');
});
t('기존 사용자 마이그레이션은 animalId·사진·모드를 바꾸지 않는다', () => {
  const raw = { animalId: 'cat', customImages: ['data:x', null, null], useCustomMode: true, breakTimeEnabled: true };
  const e = env(raw);
  const s = load('src/utils/settings.ts', e).exports;
  const out = s.readStoredSettings();
  assert.strictEqual(out.animalId, 'cat');
  assert.deepStrictEqual(out.customImages, ['data:x', null, null]);
  assert.strictEqual(out.useCustomMode, true);
});
t('버디 창은 #/pet?fresh=1 일 때만 새 설치 취급', () => {
  assert.strictEqual(load('src/utils/settings.ts', env(null, '#/pet?fresh=1')).exports.isFreshWindow(), true);
  assert.strictEqual(load('src/utils/settings.ts', env(null, '#/pet')).exports.isFreshWindow(), false);
  assert.strictEqual(load('src/utils/settings.ts', env(null, '#/pet?fresh=1')).exports.loadSettings().animalId, 'heart');
  assert.strictEqual(load('src/utils/settings.ts', env(null, '#/pet')).exports.loadSettings().animalId, 'cat');
});
t('사진 대표 지정·활성 사진 목록은 그대로 동작', () => {
  const s = load('src/utils/settings.ts', env()).exports;
  assert.deepStrictEqual(s.activePhotos(['a', null, 'c']), ['a', 'c']);
  assert.deepStrictEqual(s.makeRepresentative(['a', null, 'c'], 2), ['c', null, 'a']);
  assert.deepStrictEqual(s.makeRepresentative(['a', 'b', null], 0), ['a', 'b', null]);
  assert.deepStrictEqual(s.makeRepresentative([null, null, null], 1), [null, null, null]);
});
t('하트 선택 중에도 사진을 올리면 사진이 우선(useCustomMode+사진)', () => {
  const e = env({ animalId: 'heart', useCustomMode: true, customImages: ['data:p', null, null] });
  const s = load('src/utils/settings.ts', e).exports;
  const v = s.loadSettings();
  assert.strictEqual(v.animalId, 'heart');
  assert.strictEqual(s.activePhotos(v.customImages)[0], 'data:p');
});

console.log(`\n${n}개 통과`);
