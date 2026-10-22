'use strict';
// electron-builder의 afterSign 훅: 앱이 서명된 직후, dmg·zip에 들어가기 "전에" 앱을 공증하고 staple한다.
// 그래서 dmg 안의 앱도, 자동 업데이트가 받는 zip 안의 앱도 공증된 상태이고, 빌드 뒤에 파일을 고치지 않으니 latest-mac.yml의 해시·크기도 맞는다.
//
// 인증 정보는 이 스크립트나 환경 변수에 두지 않는다. 사용자가 터미널에서 한 번 키체인에 저장해 둔 프로필만 쓴다:
//   xcrun notarytool store-credentials "choeae-notary"      (Apple ID · Team ID · 앱 암호는 그 프롬프트에 직접 입력)
// 환경 변수: CHOEAE_SKIP_NOTARIZE=1 → 공증 건너뜀(업데이트 시험용 빌드처럼 매번 공증할 필요가 없을 때), CHOEAE_NOTARY_PROFILE → 프로필 이름 바꾸기
const path = require('path');

const PROFILE = () => process.env.CHOEAE_NOTARY_PROFILE || 'choeae-notary';

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;                         // Windows 빌드에는 해당 없음
  if (process.env.CHOEAE_SKIP_NOTARIZE === '1') { console.log('  • 공증 건너뜀 (CHOEAE_SKIP_NOTARIZE=1)'); return; }
  const { notarize } = require('@electron/notarize');
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • 공증 시작  app=${appPath}  profile=${PROFILE()}  (몇 분 걸려요)`);
  await notarize({ tool: 'notarytool', appPath, keychainProfile: PROFILE() });   // 완료되면 라이브러리가 앱에 staple까지 한다
  console.log('  • 공증·staple 완료');
};

exports.PROFILE = PROFILE;
