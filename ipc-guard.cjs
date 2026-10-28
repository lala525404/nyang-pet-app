'use strict';
// IPC 안전장치의 순수 판단 로직(Electron을 부르지 않는다: tests/ipc-guard-unit.cjs). main.cjs가 실제 값을 넣는다.
//  - isTrustedUrl: IPC를 보낸 프레임이 우리 앱 페이지인지. 배포: dist/index.html(file:) 하나만, 개발: 개발 서버 http://localhost:<포트>만. 해시(#/pet 등)와 쿼리는 무시한다.
//  - clampYarMinutes: 야르 간격(분). 0 이하는 "꺼짐(0)", 숫자가 아니면 null(무시), 켜면 1분 이상 24시간 이하.
//  - isPlainObject / isBreakType: 설정 동기화 객체, 점심·퇴근·알람 카드 종류 검사.
const path = require('path');
const { fileURLToPath } = require('url');

const YAR_MIN_MINUTES = 1;
const YAR_MAX_MINUTES = 24 * 60;
const BREAK_TYPES = ['lunch', 'leave', 'alarm'];

const sameFile = (a, b, platform) => {
  const x = path.resolve(a), y = path.resolve(b);
  return platform === 'linux' ? x === y : x.toLowerCase() === y.toLowerCase();
};

function isTrustedUrl(url, { isPackaged, indexPath, devOrigin, platform = process.platform } = {}) {
  if (typeof url !== 'string' || !url) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (isPackaged) {
    if (u.protocol !== 'file:' || !indexPath) return false;
    try { return sameFile(fileURLToPath(u), indexPath, platform); } catch { return false; }
  }
  if (!devOrigin) return false;
  try { return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === new URL(devOrigin).origin; } catch { return false; }
}

function clampYarMinutes(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v <= 0) return 0;
  return Math.min(YAR_MAX_MINUTES, Math.max(YAR_MIN_MINUTES, v));
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isBreakType = (t) => typeof t === 'string' && BREAK_TYPES.includes(t);

module.exports = { YAR_MIN_MINUTES, YAR_MAX_MINUTES, BREAK_TYPES, isTrustedUrl, clampYarMinutes, isPlainObject, isBreakType };
