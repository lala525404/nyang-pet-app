// 패키징 누락 방지: main.cjs가 불러오는 앱 폴더의 .cjs 파일은 모두 package.json의 build.files에 있어야 한다
// (없으면 설치한 앱이 시작할 때 require에서 죽는다. 개발 모드에서는 티가 나지 않는다).
// `node tests/package-files-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const pkg = JSON.parse(read('package.json')); const files = pkg.build.files;

const needed = (src) => [...src.matchAll(/require\('\.\/([\w-]+\.cjs)'\)/g)].map(m => m[1]);
const seen = new Set(); const todo = ['main.cjs', 'preload.cjs'];
while (todo.length) { const f = todo.pop(); if (seen.has(f)) continue; seen.add(f); for (const n of needed(read(f))) todo.push(n); }

const missing = [...seen].filter(f => !files.includes(f));
assert.deepStrictEqual(missing, [], 'build.files에 빠진 파일: ' + missing.join(', '));
for (const f of seen) assert.ok(fs.existsSync(path.join(root, f)), f + ' 파일이 없다');
console.log(`  ok  main.cjs가 (간접으로) 불러오는 ${seen.size}개 .cjs가 모두 build.files에 있다: ${[...seen].sort().join(', ')}\n\n1개 통과`);
