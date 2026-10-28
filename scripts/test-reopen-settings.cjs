// 설정창 다시 여는 길 회귀 테스트(소스 정적 확인). `node scripts/test-reopen-settings.cjs`
const fs = require('fs'), path = require('path'), assert = require('assert');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const main = read('main.cjs'), pet = read('src/pages/PetPage.tsx'), ob = read('src/components/Onboarding.tsx');
let n = 0; const t = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };

t('버디 우클릭은 퀵 메뉴를 열고, 퀵 메뉴의 "메인" 동작이 설정창을 연다', () => {
  assert.match(main, /trustedOn\('pet-right-click',\s*\(\) => openQuickMenu\(\)\);/);
  assert.match(main, /function openSettingsTo\(target\)[\s\S]*?createSettingsWindow\(\);/);
  assert.match(main, /ipcMain\.on\('quick-action'[\s\S]*?openSettingsTo\(quickMenu\.settingsTargetFor\(action, arg\)\)/);
  assert.match(pet, /onContextMenu=\{\(e\) => \{ e\.preventDefault\(\); window\.electronAPI\?\.petRightClick\(\); \}\}/);
});
t('드래그는 왼쪽 버튼(0)에서만 시작 — 우클릭과 충돌 없음', () => {
  assert.match(pet, /const handleMouseDown = [^\n]*\n\s*if \(e\.button !== 0\) return;/);
});
t('닫기 안내가 Windows/맥 문구로 나뉘고 트레이 위치를 적는다', () => {
  assert.match(main, /darwin'\s*\n?\s*\? '[^']*메뉴 막대 오른쪽[^']*'/);
  assert.match(main, /: '[^']*작업 표시줄 오른쪽 \^ 안의 하트 아이콘[^']*'/);
});
t('우클릭 말풍선은 새 설치 표시(newInstall)가 있고 한 번도 안 보인 경우에만', () => {
  assert.match(main, /if \(freshInstall\) markFlag\('newInstall'\)/);
  assert.match(main, /flags\.newInstall && !flags\.reopenHintShown/);
  assert.match(main, /markFlag\('reopenHintShown'\)/);
});
t('온보딩 마무리에 다시 여는 방법 3가지', () => {
  for (const s of ['설정창은 이렇게 다시 열어요', '버디를 우클릭해요', '트레이의 하트 아이콘을 눌러요', '앱을 다시 실행해요', '숨겨진 아이콘 칸', '메뉴 막대']) assert.ok(ob.includes(s), s);
});
console.log(`\n${n}개 통과`);
