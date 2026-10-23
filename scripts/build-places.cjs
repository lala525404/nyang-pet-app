'use strict';
// 읍·면·동 → 시·군·구 대응표(src/data/places.json) 생성기. 앱 실행 중에는 쓰지 않는 개발용 스크립트다.
//  입력: 공공데이터포털 "국토교통부_전국 법정동"(https://www.data.go.kr/data/15063424/fileData.do, 이용허락범위 제한 없음) CSV
//        열: 법정동코드,시도명,시군구명,읍면동명,리명,순번,생성일자  (UTF-8, BOM 있음)
//  사용: node scripts/build-places.cjs <법정동.csv> [src/data/places.json]
//  리 단위는 뺀다(읍·면·동까지). 내장 시·군·구 목록(src/data/cities.ts)에 없는 시·군·구는 건너뛰고 개수를 알려 준다.
const fs = require('fs'), path = require('path');
const ts = require('typescript');

const [csv, out = path.join(__dirname, '..', 'src', 'data', 'places.json')] = process.argv.slice(2);
if (!csv) { console.error('사용: node scripts/build-places.cjs <법정동.csv> [출력 json]'); process.exit(1); }

const load = (rel) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, () => ({})); return m.exports;
};
const { CITIES } = load('src/data/cities.ts');
const byKey = new Map(CITIES.map(c => [`${c.parent}|${c.name.replace(/ /g, '')}`, c.id]));
// 광주·전남 두 지역은 같은 시·도(전남광주통합특별시) 아래 있으므로 시·군·구 이름으로 구분한다(겹치는 이름은 없음)
const rows = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split(','));
const per = new Map(); let skipped = 0, used = 0; const unknown = new Set();
for (const [, sido, sigungu, dong, ri] of rows) {
  if (!sigungu || !dong || ri) continue;                 // 시·도/시·군·구 줄과 리 줄은 건너뛴다
  const id = byKey.get(`${sido}|${sigungu}`);
  if (!id) { skipped++; unknown.add(`${sido} ${sigungu}`); continue; }
  if (!per.has(id)) per.set(id, []);
  const list = per.get(id); if (!list.includes(dong)) { list.push(dong); used++; }
}
const cities = {};
for (const c of CITIES) if (per.has(c.id)) cities[c.id] = per.get(c.id).join('|');
const json = { _source: '국토교통부_전국 법정동 (공공데이터포털 15063424, 이용허락범위 제한 없음) 읍·면·동만 추림', cities };
fs.writeFileSync(out, JSON.stringify(json), 'utf8');
console.log(`시·군·구 ${Object.keys(cities).length}곳, 읍·면·동 ${used}개, 건너뜀 ${skipped}줄(${[...unknown].join(', ') || '없음'}) → ${out}`);
const missing = CITIES.filter(c => !cities[c.id]).map(c => c.id);
console.log('읍·면·동이 없는 내장 시·군·구(상위 시 항목 등):', missing.length, missing.slice(0, 40).join(' '));
