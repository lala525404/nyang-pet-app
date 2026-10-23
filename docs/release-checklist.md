# 릴리스 절차 (자동 업데이트 포함)

앱은 시작 10초 뒤와 6시간마다 GitHub 릴리스의 `latest.yml`(Windows) / `latest-mac.yml`(macOS)을 확인하고, 새 버전이면 "업데이트할까요?"를 묻는다.
그래서 **릴리스에 올리는 파일의 이름과 내용이 메타파일과 정확히 맞아야** 업데이트가 된다. 아래 순서를 그대로 따른다.

## 0. 꼭 지킬 규칙

- **릴리스는 draft도 prerelease도 아니어야 한다.** 업데이터는 "최신(latest)" 정식 릴리스만 본다. draft나 prerelease로 두면 사용자에게 보이지 않는다.
  (버전이 `1.4.1-rc1`처럼 시험판이면 앱이 알리지 않는다. 시험판은 prerelease로 올린다.)
- **태그는 `v` + `package.json`의 버전**이다. 예: 버전 `1.4.1` → 태그 `v1.4.1`.
- **에셋 이름은 공백 없는 ASCII**여야 한다(한글·공백 금지). GitHub는 공백을 `.`으로 바꿔 올리기 때문에 `latest*.yml`에 적힌 이름과 달라져 404가 난다.
  이미 `package.json`에 `choeae-app-Setup-${version}.exe`, `${productName}-${version}-${arch}.dmg`, `${productName}-${version}-${arch}-mac.zip`으로 고정돼 있으니 **`productName`·`appId`·artifactName을 바꾸지 않는다**
  (`appId`·`productName`을 바꾸면 사용자 데이터 폴더(userData) 경로와 설치 위치가 달라질 수 있다).
- **빌드가 끝난 파일을 수정하지 않는다**(dmg에 직접 staple, 이름 바꾸기 등). 수정하면 `latest*.yml`의 해시·크기가 어긋나 "checksum mismatch"로 업데이트가 거부된다.
  어쩔 수 없이 수정했다면 `npm run release:meta`로 yml을 실제 파일에 맞게 고친다.
- 업데이트에 쓰이는 건 **Windows는 `Setup .exe`, macOS는 `-mac.zip`**이다(dmg는 처음 설치하는 사용자용). zip이 릴리스에 없으면 맥 업데이트가 실패한다.

## 1. 올릴 파일 (정확히 이 목록)

| 플랫폼 | 파일 | 용도 |
|---|---|---|
| Windows | `choeae-app-Setup-X.Y.Z.exe` | 설치 파일 + 자동 업데이트 대상 |
| Windows | `choeae-app-Setup-X.Y.Z.exe.blockmap` | 차등 다운로드 |
| Windows | `latest.yml` | Windows 업데이트 정보 |
| macOS | `choeae-app-X.Y.Z-arm64.dmg` | 처음 설치하는 사용자용 |
| macOS | `choeae-app-X.Y.Z-arm64.dmg.blockmap` | |
| macOS | `choeae-app-X.Y.Z-arm64-mac.zip` | 자동 업데이트 대상(Squirrel.Mac) |
| macOS | `choeae-app-X.Y.Z-arm64-mac.zip.blockmap` | 차등 다운로드 |
| macOS | `latest-mac.yml` | macOS 업데이트 정보 |

포터블 `.exe`는 더 이상 만들지 않는다(자동 업데이트가 안 된다).

## 2. 순서

1. **준비** — 버전을 올리고(`package.json`과 `package-lock.json`의 version) `npm ci` → `npx tsc --noEmit` → `npm test`.
   Electron 바이너리가 불완전하게 설치되면(`node_modules/electron/path.txt` 없음) 캐시된 zip을 `ditto -x -k <zip> node_modules/electron/dist`로 풀고 `path.txt`·`dist/version`을 만든다.
2. **main에 반영·푸시** — 릴리스할 커밋을 `main`에 머지하고 푸시한다. (태그는 4번에서 릴리스를 만들 때 붙인다.)
3. **빌드 (이 맥에서)**
   - macOS: `npm run dist:mac` — 앱이 서명된 직후 **dmg·zip에 들어가기 전에** 공증·staple된다(`scripts/notarize.cjs`, 키체인 프로필 `choeae-notary`, 몇 분 걸린다).
     프로필이 없으면 먼저 `xcrun notarytool store-credentials "choeae-notary"`로 저장한다(앱 암호는 그 프롬프트에 직접 입력).
   - Windows: `npm run dist:win` (Wine으로 NSIS 설치 파일을 만든다).
   - 두 명령 모두 `--publish never`라서 **자동으로 업로드하지 않는다**. 결과는 `release/`에 생긴다.
4. **검사** — 올리기 전에:
   - `npm run release:meta -- --check` → `latest.yml`과 `latest-mac.yml`이 실제 파일과 일치하는지(안 맞으면 종료 코드 1).
   - `spctl -a -t exec -vv release/mac-arm64/choeae-app.app` → `accepted` / `source=Notarized Developer ID`
   - `xcrun stapler validate release/mac-arm64/choeae-app.app`
   - `ls release/` 에 위 표의 파일이 모두 있고 이름에 공백·한글이 없는지.
5. **GitHub 릴리스 만들기** — 태그 `vX.Y.Z`, 대상 `main`. **먼저 draft로 만들어 파일을 올리고, 확인한 뒤에 게시한다.**
   1. draft로 릴리스를 만든다.
   2. 설치 파일·zip·dmg·blockmap을 먼저 올린다.
   3. **`latest.yml`, `latest-mac.yml`은 마지막에 올린다**(메타파일이 아직 없는 파일을 가리키는 순간을 만들지 않으려고).
   4. 에셋 목록을 확인한 뒤 **게시(Publish)** 한다. "Set as the latest release"를 켜고, "pre-release"는 끈다.
6. **게시 후 확인**
   - `gh release view vX.Y.Z --repo lala525404/nyang-pet-app --json isDraft,isPrerelease,assets -q '.isDraft, .isPrerelease, (.assets[].name)'` → `false`, `false`, 8개 파일 이름.
   - `curl -sL https://github.com/lala525404/nyang-pet-app/releases/latest/download/latest.yml | head -5` 의 `version`이 새 버전인지(`latest-mac.yml`도 같게).
   - 이전 버전 앱에서 설정창의 "업데이트 확인"을 눌러 새 버전이 보이는지.

## 3. 문제가 생겼을 때

- 잘못된 릴리스를 올렸다면 **릴리스를 draft로 되돌리거나 삭제**한다(업데이터는 latest 정식 릴리스만 본다). 업데이터는 다운그레이드를 하지 않으니, 고친 새 버전(더 높은 번호)을 올리는 것이 정석이다.
- "checksum mismatch" → 업로드한 파일이 빌드 결과와 다르거나 yml이 낡았다. `npm run release:meta -- --check`로 확인하고 `npm run release:meta`로 고친 뒤 yml을 다시 올린다.
- 맥에서 "응용 프로그램 폴더로 옮겨서 실행해 주세요"가 뜬다 → dmg 안이나 다운로드 폴더에서 실행 중이다. 앱을 응용 프로그램 폴더로 옮겨 실행하면 된다.
- Windows는 코드 서명이 없어 SmartScreen 경고가 뜰 수 있다(설치·업데이트 자체는 된다).

## 4. 첫 업데이터 버전(처음 한 번만)

업데이터가 들어가기 전 버전(1.3.0 이하)에는 업데이트 기능이 없다. **업데이터가 처음 들어간 버전은 모든 사용자가 한 번 직접 설치**해야 하고, 그다음 버전부터 자동으로 올라간다.
Windows 기존 포터블 사용자는 새 설치 파일을 실행하면 되고, 기존 포터블 `.exe`는 지워도 된다(설정·알람·사진은 `%APPDATA%\choeae-app`에 있어 그대로 이어진다).
안내 문구 초안은 `docs/landing-update-notice-draft.md`.

## 5. 업데이트 흐름을 이 맥에서 시험하기 (릴리스 전에 권장)

실제 앱·실제 사용자 데이터를 건드리지 않고, 로컬 서버를 피드로 써서 "확인 → 알림 → 받기 → 재시작 설치"를 시험한다. 앱 코드에 시험용 환경 변수는 없고, **시험용 빌드의 설정만** 바꾼다(앱 이름 `choeae-test`, appId `com.choeae.updatetest`).

```bash
# 1) 시험용 빌드 설정 두 개: 옛 버전(설치해 둘 앱)과 새 버전(피드가 내려줄 앱)
node scripts/make-update-test-config.cjs 1.3.0 /tmp/choeae-test-old
node scripts/make-update-test-config.cjs 1.3.1 /tmp/choeae-test-new
npm run build
CHOEAE_SKIP_NOTARIZE=1 npx electron-builder --mac --arm64 --publish never --config /tmp/choeae-test-old.config.json
CHOEAE_SKIP_NOTARIZE=1 npx electron-builder --mac --arm64 --publish never --config /tmp/choeae-test-new.config.json

# 2) 새 버전 폴더를 로컬 피드로 서비스(진행률 UI를 보려면 THROTTLE_MS=25로 느리게)
THROTTLE_MS=25 node scripts/update-test-feed.cjs /tmp/choeae-test-new 8787 &

# 3) 옛 버전을 ~/Applications에 설치해 실행(자동 업데이트는 응용 프로그램 폴더 안에서만 된다)
ditto /tmp/choeae-test-old/mac-arm64/choeae-test.app ~/Applications/choeae-test.app
~/Applications/choeae-test.app/Contents/MacOS/choeae-test
```

- 앱이 켜지고 10초 뒤 새 버전을 찾으면 설정창 버전 옆에 `새 버전 v1.3.1이 있어요 · 지금 업데이트`가 보이고, 대화상자가 뜬다.
- 시험이 끝나면 **시험용 앱과 데이터만** 정리한다: `~/Applications/choeae-test.app`, `~/Library/Application Support/choeae-test`, `~/Library/Caches/choeae-test-updater`, `~/Library/Caches/com.choeae.updatetest.ShipIt`. (실제 앱 `choeae-app`의 데이터는 건드리지 않는다.)
- 이 맥에서 확인한 것: 자동 확인 → 알림 → 받기(진행률) → 재시작 설치(약 2초 만에 새 버전으로 다시 실행), 알림이 떠 있으면 재시작을 미뤘다가 끝난 뒤 설치, "나중에" 후 종료하면 종료 시 설치(재실행 없음), 모든 경우에 알람 설정(userData)이 그대로 유지.
- **Windows 설치·업데이트는 이 맥에서 실행해 볼 수 없다.** Windows PC에서 설치 파일 실행 → 다음 버전으로 업데이트 → 알람·사진 유지를 따로 확인한다.

## 6. 알아 둘 동작·한계

- **대화상자는 항상 보이는 창(설정창, 없으면 버디 창)에 붙여서 띄운다.** 부모 창 없는 네이티브 대화상자는 맥에서 떠 있는 동안 앱의 타이머(알람 스케줄러 포함)를 멈춘다(실측). 보이는 창이 없으면 대화상자 없이 상태 표시만 한다.
- **맥에서 "나중에"를 고른 뒤 종료하면 설치되는 건, 받은 뒤 약 20초 이상 지나서 종료할 때**다. 받자마자 곧바로 종료하면 업데이트가 아직 준비 중이라 그 종료에서는 설치되지 않고, 다음 확인 때 다시 알려 준다.
- 알람·전체화면 알림이 떠 있으면 재시작을 미룬다(알림이 끝나면 3초 안에 이어서 재시작).
- 앱을 응용 프로그램 폴더 밖(dmg 안, 다운로드 폴더, translocation)에서 실행 중이면 업데이트를 받지 않고 "응용 프로그램 폴더로 옮겨서 실행해 주세요"만 안내한다.
