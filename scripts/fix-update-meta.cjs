'use strict';
// latest.yml / latest-mac.yml의 파일별 sha512·size를 release/의 실제 파일에서 다시 계산해 맞춘다.
// 쓰는 때: 빌드 뒤에 dmg·exe·zip을 손댔을 때(예: dmg에 직접 staple) — 안 맞으면 electron-updater가 "checksum mismatch"로 업데이트를 거부한다.
// afterSign에서 공증하는 지금 파이프라인은 빌드 뒤에 파일을 고치지 않으므로 보통은 "이미 맞음"이 나오고, 릴리스 올리기 전 검사용으로 --check를 쓴다.
//
//   node scripts/fix-update-meta.cjs            release/의 yml을 실제 파일에 맞게 고친다
//   node scripts/fix-update-meta.cjs --check    고치지 않고 맞는지만 본다(안 맞거나 파일이 없으면 종료 코드 1)
//   node scripts/fix-update-meta.cjs --dir <폴더>
//
// yml의 들여쓰기·순서는 건드리지 않고 sha512·size 줄만 바꾼다(electron-builder가 쓴 모양 그대로).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const META_FILES = ['latest.yml', 'latest-mac.yml'];

function fileInfo(file) {
  const buf = fs.readFileSync(file);
  return { sha512: crypto.createHash('sha512').update(buf).digest('base64'), size: buf.length };
}

// yml 문자열을 받아 { text, changes, missing }을 돌려준다. info(url) → {sha512,size} | null (파일이 없으면 null)
function fixMetaText(text, info) {
  const lines = text.split(/\r?\n/); const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const changes = [], missing = [];
  let topPath = null; const entries = []; let cur = null;
  lines.forEach((ln, i) => {                                       // 1) 구조 파악: files 항목별 줄 번호와 최상위 path
    let m;
    if ((m = ln.match(/^\s*-\s*url:\s*(.+?)\s*$/))) { cur = { url: m[1], shaLine: -1, sizeLine: -1 }; entries.push(cur); }
    else if (cur && (m = ln.match(/^\s+sha512:\s*(.+?)\s*$/))) cur.shaLine = i;
    else if (cur && (m = ln.match(/^\s+size:\s*(\d+)\s*$/))) cur.sizeLine = i;
    else if ((m = ln.match(/^path:\s*(.+?)\s*$/))) { topPath = m[1]; cur = null; }
  });
  const set = (idx, key, val, label) => {
    const m = lines[idx].match(/^(\s*)([a-z0-9]+):\s*(.+?)\s*$/); if (!m || m[3] === String(val)) return;
    changes.push({ file: label, key, from: m[3], to: String(val) }); lines[idx] = `${m[1]}${key}: ${val}`;
  };
  for (const e of entries) {
    const inf = info(e.url); if (!inf) { missing.push(e.url); continue; }
    if (e.shaLine >= 0) set(e.shaLine, 'sha512', inf.sha512, e.url);
    if (e.sizeLine >= 0) set(e.sizeLine, 'size', inf.size, e.url);
  }
  if (topPath) {                                                    // 2) 최상위 sha512(= path에 적힌 파일의 해시)
    const inf = info(topPath);
    if (!inf) { if (!missing.includes(topPath)) missing.push(topPath); }
    else lines.forEach((ln, i) => { if (/^sha512:/.test(ln)) set(i, 'sha512', inf.sha512, `${topPath} (최상위)`); });
  }
  return { text: lines.join(eol), changes, missing };
}

function run({ dir, check }) {
  let found = 0, bad = 0;
  for (const name of META_FILES) {
    const file = path.join(dir, name); if (!fs.existsSync(file)) continue; found++;
    const { text, changes, missing } = fixMetaText(fs.readFileSync(file, 'utf8'), (url) => { const f = path.join(dir, url); return fs.existsSync(f) ? fileInfo(f) : null; });
    for (const u of missing) { console.log(`  ✗ ${name}: 파일이 없어요 → ${u}`); bad++; }
    if (!changes.length) { if (!missing.length) console.log(`  ✓ ${name}: 이미 맞아요`); continue; }
    for (const c of changes) console.log(`  ${check ? '✗' : '→'} ${name}: ${c.file} ${c.key} ${String(c.from).slice(0, 14)}… → ${String(c.to).slice(0, 14)}…`);
    if (check) bad += changes.length; else { fs.writeFileSync(file, text); console.log(`  ✔ ${name}: ${changes.length}곳 고쳤어요`); }
  }
  if (!found) { console.log(`  ✗ ${dir}에 latest.yml / latest-mac.yml이 없어요(빌드를 먼저 하세요)`); bad++; }
  return bad;
}

module.exports = { fixMetaText, fileInfo, run, META_FILES };

if (require.main === module) {
  const args = process.argv.slice(2); const di = args.indexOf('--dir');
  const dir = path.resolve(di >= 0 ? args[di + 1] : path.join(__dirname, '..', 'release'));
  const check = args.includes('--check');
  console.log(`${check ? '검사' : '보정'}: ${dir}`);
  const bad = run({ dir, check });
  if (bad) { console.log(check ? '\n업데이트 메타파일이 실제 파일과 달라요. `npm run release:meta`로 고치세요.' : '\n일부 항목을 처리하지 못했어요.'); process.exit(1); }
  console.log('\n업데이트 메타파일이 실제 파일과 일치해요.');
}
