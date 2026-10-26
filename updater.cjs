'use strict';
// 자동 업데이트(electron-updater, GitHub 릴리스). 이 파일은 Electron·electron-updater를 직접 부르지 않고 주입받아서
// 시각(타이머)·대화상자·"지금 알람 중인가"를 가짜로 바꿔 단위 테스트한다(tests/updater-unit.cjs). main.cjs가 실제 값을 넣는다.
//
// 흐름: 확인(시작 10초 뒤 + 6시간마다 + 설정창 버튼) → 새 버전이면 "지금 업데이트할까요?" → 받기(진행률) → "재시작해서 설치할까요?"
//  - "나중에"는 그 확인 한 번에서만 묻지 않는다. 다음 확인(6시간 뒤나 수동)에 다시 알려 준다.
//  - 재시작은 requestQuit()(저장·창 정리·종료 플래그)를 끝까지 거친 뒤, 원래 app.quit()을 하던 자리(finishQuit)에서 runInstall()로 설치한다.
//  - "나중에"를 골라도 종료할 때 설치된다(autoInstallOnAppQuit).
//  - 알람·전체화면 알림이 떠 있으면 재시작을 미룬다.
//  - 맥에서 응용 프로그램 폴더 밖(dmg 안, translocation, 다운로드 폴더 등)이면 설치를 시도하지 않고 안내만 한다.
const path = require('path');

const FIRST_CHECK_MS = 10 * 1000;               // 앱 시작 10초 뒤 첫 확인
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;   // 이후 6시간마다
const BUSY_RETRY_MS = 3000;                     // 알림 중이면 재시작을 미루고 이 간격으로 다시 본다

const MESSAGES = {
  title: '최애를 풀어놨습니다',
  available: (v) => `새 버전(v${v})이 나왔어요. 지금 업데이트할까요?`,
  downloaded: '다운로드가 끝났어요. 재시작해서 설치할까요?',
  upToDate: '최신 버전이에요 :)',
  checkFailed: '업데이트를 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요',
  downloadFailed: '업데이트를 받지 못했어요',
  moveToApplications: '응용 프로그램 폴더로 옮겨서 실행해 주세요',
  moveToApplicationsDetail: (v) => `새 버전(v${v})이 나왔지만, 자동 업데이트는 응용 프로그램 폴더에 있는 앱에서만 할 수 있어요.\n앱을 응용 프로그램 폴더로 옮겨서 실행해 주세요.`,
  buttons: { updateNow: '지금 업데이트', later: '나중에', restart: '재시작', ok: '확인' },
};

// 업데이트 기능을 켤 조건: 패키징된 앱이고 업데이트 설정(app-update.yml)이 들어 있을 때만. 개발 모드·npm run fresh(dist-mode)에서는 꺼진다.
// 테스트용 피드 주소를 환경 변수로 바꾸는 기능은 일부러 두지 않는다(테스트 빌드는 빌드 설정의 publish를 로컬 서버로 바꿔서 만든다).
const isUpdaterEnabled = ({ isPackaged, hasUpdateConfig }) => !!isPackaged && !!hasUpdateConfig;

// 맥에서 자동 업데이트(Squirrel.Mac)가 되는 위치인지. 응용 프로그램 폴더(/Applications, ~/Applications) 밖이면 안 된다.
//  - dmg 안에서 바로 실행(/Volumes/…), 다운로드 폴더에서 실행해 translocation(/AppTranslocation/…)된 경우 등
function installLocationStatus({ platform, exePath, home }) {
  if (platform !== 'darwin') return { ok: true, reason: null };
  const p = String(exePath || '');
  if (p.includes('/AppTranslocation/')) return { ok: false, reason: 'translocated' };
  if (p.startsWith('/Volumes/')) return { ok: false, reason: 'dmg' };
  const userApps = home ? path.posix.join(home, 'Applications') + '/' : null;   // 맥 경로 판정이라 어느 OS에서 돌려도 '/' 구분자(Windows의 path.join은 '\\')
  if (p.startsWith('/Applications/') || (userApps && p.startsWith(userApps))) return { ok: true, reason: null };
  return { ok: false, reason: 'location' };
}

// 확인 실패를 로그에서 구분하려고 종류를 나눈다. 404는 "서버는 답했는데 업데이트 정보(latest.yml)가 없음", 네트워크는 "서버에 닿지 못함".
//  notfound | network | other
function classifyUpdateError(err) {
  const msg = String((err && err.message) || err || '');
  const code = String((err && err.code) || '');
  if ((err && err.statusCode === 404) || code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' || /\b404\b|not found/i.test(msg)) return 'notfound';
  if (/^(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ERR_INTERNET_DISCONNECTED)$/.test(code)
    || /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|net::ERR_|getaddrinfo|socket hang up|network|timed? ?out/i.test(msg)) return 'network';
  return 'other';
}
const ERROR_KIND_LOG = { notfound: '업데이트 정보 없음(404)', network: '네트워크 오류', other: '기타 오류' };

function createUpdater(deps) {
  const {
    autoUpdater,                 // electron-updater의 autoUpdater (꺼져 있으면 null)
    enabled = false,
    location = { ok: true, reason: null },
    isBusy = () => false,        // 알람·전체화면 알림이 떠 있는지
    showPrompt = async () => 'later',   // (kind, ctx) → 'yes' | 'later' | 'ok'   kind: available | downloaded | location   (available의 ctx: { version, notes })
    parseNotes = () => [],              // info.releaseNotes → 달라지는 점 제목들(release-notes.cjs). 못 뽑으면 빈 배열
    requestInstallQuit = () => {},      // 재시작 요청: main이 설치 표시를 하고 requestQuit()을 호출한다
    onState = () => {},
    timers = { setTimeout, clearTimeout, setInterval, clearInterval },
    log = () => {},
  } = deps;

  let state = enabled ? { status: 'idle' } : { status: 'disabled' };
  let initialized = false, firstTimer = null, intervalTimer = null, busyTimer = null;
  let promptToken = 0;           // 지나간 대화상자의 답이 늦게 도착해도 무시하기 위한 번호
  let checkManual = false, checkErrored = false;
  let installRequested = false, locationNoticeShown = false;
  let notes = [];                // 새 버전의 "달라지는 점"(받기에 실패해 available로 돌아갈 때도 다시 보여 주려고 기억한다)

  const setState = (next) => { state = next; try { onState({ ...state }); } catch (e) { log('onState 오류', e && e.message); } return state; };
  const getState = () => ({ ...state });

  function init() {
    if (initialized || !enabled || !autoUpdater) return;
    initialized = true;
    autoUpdater.autoDownload = false;            // 받기 전에 사용자에게 묻는다
    autoUpdater.autoInstallOnAppQuit = true;     // "나중에"를 골라도 앱을 종료할 때 설치한다
    autoUpdater.allowPrerelease = false;         // 시험판(prerelease)은 알리지 않는다
    autoUpdater.allowDowngrade = false;
    autoUpdater.logger = { info: (m) => log(m), warn: (m) => log('경고', m), error: (m) => log('오류', m), debug: () => {} };
    autoUpdater.on('update-available', (info) => onAvailable(info));
    autoUpdater.on('update-not-available', () => { if (state.status === 'checking') setState({ status: 'none' }); });
    autoUpdater.on('download-progress', (p) => onProgress(p));
    autoUpdater.on('update-downloaded', (info) => onDownloaded(info));
    autoUpdater.on('error', (err) => onError(err));
  }

  // 시작 10초 뒤 첫 확인, 이후 6시간마다. 개발 모드에서는 아무것도 걸지 않는다.
  function start() {
    if (!enabled || !autoUpdater) return;
    init();
    stop();
    firstTimer = timers.setTimeout(() => {
      firstTimer = null;
      check({ manual: false });
      intervalTimer = timers.setInterval(() => check({ manual: false }), CHECK_INTERVAL_MS);
    }, FIRST_CHECK_MS);
  }
  function stop() {
    if (firstTimer) { timers.clearTimeout(firstTimer); firstTimer = null; }
    if (intervalTimer) { timers.clearInterval(intervalTimer); intervalTimer = null; }
    if (busyTimer) { timers.clearTimeout(busyTimer); busyTimer = null; }
  }

  async function check({ manual = false } = {}) {
    if (!enabled || !autoUpdater) { setState({ status: 'disabled' }); return getState(); }
    init();
    if (state.status === 'checking' || state.status === 'downloading') return getState();   // 이미 진행 중
    if (state.status === 'downloaded') {                                                    // 이미 받아 둠: 수동 확인이면 재시작을 다시 묻는다
      if (manual) promptDownloaded();
      return getState();
    }
    checkManual = !!manual; checkErrored = false;
    setState({ status: 'checking' });
    try { await autoUpdater.checkForUpdates(); }
    catch (e) { onError(e); }
    return getState();
  }

  function onAvailable(info) {
    const version = info && info.version;
    if (!location.ok) {   // 응용 프로그램 폴더 밖: 받지도, 설치도 시도하지 않는다
      setState({ status: 'blocked', reason: location.reason, version });
      if (checkManual || !locationNoticeShown) { locationNoticeShown = true; promptLocation(version); }
      return;
    }
    // 달라지는 점: 이미 받은 info.releaseNotes만 읽는다(새 요청 없음). 못 뽑으면 빈 배열
    let parsed = [];
    try { const r = parseNotes(info && info.releaseNotes); if (Array.isArray(r)) parsed = r.filter(x => typeof x === 'string' && x).slice(0, 4); } catch (e) { log('릴리스 노트 해석 오류', e && e.message); }
    notes = parsed;
    setState({ status: 'available', version, notes });
    promptAvailable(version, notes);
  }

  async function promptAvailable(version, notesForPrompt = []) {
    const token = ++promptToken;
    const answer = await showPrompt('available', { version, notes: notesForPrompt }).catch(() => 'later');
    if (token !== promptToken || state.status !== 'available') return;   // 그 사이 상태가 바뀜(버튼으로 이미 진행 등)
    if (answer === 'yes') download();
    // 'later': 상태는 available로 남고(설정창에 "새 버전이 있어요"), 다음 확인 때 다시 묻는다
  }
  async function promptLocation(version) { await showPrompt('location', { version }).catch(() => 'ok'); }
  async function promptDownloaded() {
    const token = ++promptToken;
    const answer = await showPrompt('downloaded', { version: state.version }).catch(() => 'later');
    if (token !== promptToken || state.status !== 'downloaded') return;
    if (answer === 'yes') install();
    // 'later': 종료할 때 설치된다
  }

  async function download() {
    if (state.status !== 'available' || !autoUpdater) return getState();
    const version = state.version;
    setState({ status: 'downloading', version, percent: 0 });
    try { await autoUpdater.downloadUpdate(); }
    catch (e) { onError(e, { downloading: true, version }); }
    return getState();
  }
  function onProgress(p) {
    if (state.status !== 'downloading') return;
    const percent = Math.max(0, Math.min(100, Math.round((p && p.percent) || 0)));
    if (percent !== state.percent) setState({ status: 'downloading', version: state.version, percent });
  }
  function onDownloaded(info) {
    setState({ status: 'downloaded', version: (info && info.version) || state.version });
    promptDownloaded();
  }

  // 재시작해서 설치. 알람·전체화면 알림 중이면 끝날 때까지 미룬다.
  function install() {
    if (state.status !== 'downloaded' && !installRequested) return false;
    if (isBusy()) {
      setState({ ...state, status: 'downloaded', pendingInstall: true });
      if (!busyTimer) busyTimer = timers.setTimeout(() => { busyTimer = null; install(); }, BUSY_RETRY_MS);
      return 'deferred';
    }
    const { pendingInstall, ...rest } = state; setState(rest);
    installRequested = true;
    requestInstallQuit();
    return true;
  }
  // main의 finishQuit()가 app.quit() 대신 부른다. 설치 요청이 없으면 false(그냥 app.quit()).
  function runInstall() {
    if (!installRequested || !autoUpdater) return false;
    try { autoUpdater.quitAndInstall(true, true); return true; }   // 조용히 설치하고 끝나면 다시 실행
    catch (e) { log('quitAndInstall 오류', e && e.message); return false; }
  }

  function onError(err, opts = {}) {
    if (checkErrored && !opts.downloading) return;   // 같은 확인에서 error 이벤트와 reject가 둘 다 오는 경우 한 번만
    checkErrored = true;
    const kind = classifyUpdateError(err);
    log(`업데이트 ${opts.downloading ? '받기' : '확인'} 오류 [${ERROR_KIND_LOG[kind]}]`, err && err.message);
    if (opts.downloading) {
      setState({ status: 'available', version: opts.version, notes, error: MESSAGES.downloadFailed });   // 다시 받을 수 있게 되돌린다
      return;
    }
    if (state.status === 'downloading') { setState({ status: 'available', version: state.version, notes, error: MESSAGES.downloadFailed }); return; }
    // 수동 확인 실패는 설정창 상태 문구로만 알린다(네이티브 대화상자 없음: 대화상자는 알람 스케줄러를 멈출 수 있고, 설정창이 닫혀 있으면 보여 줄 곳도 없다)
    if (checkManual) setState({ status: 'error', message: MESSAGES.checkFailed, errorKind: kind });
    else setState({ status: 'idle' });                                                                                              // 자동 확인은 조용히
  }

  return { init, start, stop, check, download, install, runInstall, getState };
}

module.exports = { createUpdater, isUpdaterEnabled, installLocationStatus, classifyUpdateError, MESSAGES, FIRST_CHECK_MS, CHECK_INTERVAL_MS, BUSY_RETRY_MS };
