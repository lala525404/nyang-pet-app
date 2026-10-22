'use strict';
// 업데이트 시험용 electron-builder 설정을 만든다. 실제 앱(com.choeae.app · choeae-app)과 사용자 데이터(userData)·피드가 완전히 분리되도록
// 앱 이름(choeae-test)·appId·publish(로컬 피드)를 바꾼다. 환경 변수 같은 시험용 코드를 앱에 넣지 않고, 빌드 설정만 바꿔서 시험한다.
//   node scripts/make-update-test-config.cjs <시험 버전> <출력 폴더> [포트=8787]  →  <출력 폴더>.config.json
//   CHOEAE_SKIP_NOTARIZE=1 npx electron-builder --mac --arm64 --publish never --config <출력 폴더>.config.json
const fs = require('fs'), path = require('path');
const [version, out, port = '8787'] = process.argv.slice(2);
if (!version || !out) { console.error('사용: node scripts/make-update-test-config.cjs <시험 버전> <출력 폴더> [포트]'); process.exit(1); }
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const b = JSON.parse(JSON.stringify(pkg.build));
b.appId = 'com.choeae.updatetest'; b.productName = 'choeae-test';
b.extraMetadata = { name: 'choeae-test', version };
b.publish = [{ provider: 'generic', url: `http://127.0.0.1:${port}` }];
b.mac.target = [{ target: 'zip', arch: ['arm64'] }];
b.directories = { output: path.resolve(out) };
fs.writeFileSync(`${path.resolve(out)}.config.json`, JSON.stringify(b, null, 1));
console.log(`${path.resolve(out)}.config.json`);
