// 완전 새 설치 상태로 앱을 띄운다: 비어 있는 임시 설정 폴더를 쓰므로 입구("처음 왔어요")부터 볼 수 있다.
// 사용법: npm run fresh           (화면을 새로 빌드한 뒤 새 임시 폴더로 시작, 앱을 끄면 임시 폴더도 지운다)
//         npm run fresh -- --keep  (임시 폴더를 남긴다. 끄고 다시 켜서 "다음 실행은 홈으로"를 확인할 때)
//         npm run fresh -- --dir C:\choeae-fresh-test   (이 폴더를 그대로 다시 쓴다)
// 설치한 exe로 하려면: choeae-app-1.4.1.exe --user-data-dir="%TEMP%\choeae-fresh-test"  (빈 폴더면 새 설치, 있던 폴더면 기존 사용자)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const dirIdx = args.indexOf('--dir');
const dir = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'choeae-fresh-'));
fs.mkdirSync(dir, { recursive: true });
console.log(`설정 폴더: ${dir}  (${fs.readdirSync(dir).length === 0 ? '비어 있음 = 완전 새 설치' : '이미 내용이 있음 = 기존 사용자'})`);

const child = spawn(require('electron'), ['-r', path.join(__dirname, 'dist-mode.cjs'), '.', `--user-data-dir=${dir}`], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => {
  if (!keep && dirIdx < 0) { try { fs.rmSync(dir, { recursive: true, force: true }); console.log('임시 설정 폴더를 지웠어요.'); } catch {} }
  else console.log(`설정 폴더를 남겼어요: ${dir}`);
  process.exit(code ?? 0);
});
