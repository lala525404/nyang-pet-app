'use strict';
// 부팅 후 오늘 브리핑의 "언제 띄울까" 계산(메인 전용 순수 함수: tests/brief-unit.cjs). 시계·uptime은 모두 인자로 받는다.
//  - 컴퓨터가 켜진 지 BRIEF_DELAY_SEC(3분)가 지난 시점에 띄운다. 앱이 그보다 일찍 켜졌으면 3분이 될 때까지 기다리고,
//    앱이 3분 뒤에 켜졌으면(수동 실행 등) 앱이 준비된 뒤 LATE_START_DELAY_MS(약 10초) 뒤에 띄운다.
//  - 앱이 오래 켜져 있다가 날짜가 바뀌었을 때는 띄우지 않는다: 앱 시작 때 한 번만 판단하고, 기다리다 날이 바뀌면 포기한다.
//  - 오늘 이미 띄웠는지·요일·공휴일·일정 유무·켜기/끄기는 카드 창이 설정 저장값을 읽어 정한다(src/utils/brief.ts).
const BRIEF_DELAY_SEC = 180;            // 부팅 후 기다리는 시간(여기 한 곳에서만 관리)
const LATE_START_DELAY_MS = 10 * 1000;  // 부팅 3분 뒤에 앱이 켜졌을 때: 앱 준비 후 이만큼 뒤
const FORCE_DELAY_MS = 3000;            // 시험용(CHOEAE_FORCE_BRIEF=1): 조건을 무시하고 곧 띄운다

// 몇 ms 뒤에 브리핑을 쌓을지. uptimeSec가 올바른 숫자가 아니면 null(띄우지 않는다)
function planBrief({ uptimeSec, force = false }) {
  if (force) return FORCE_DELAY_MS;
  if (typeof uptimeSec !== 'number' || !Number.isFinite(uptimeSec) || uptimeSec < 0) return null;
  if (uptimeSec >= BRIEF_DELAY_SEC) return LATE_START_DELAY_MS;
  return Math.ceil((BRIEF_DELAY_SEC - uptimeSec) * 1000);
}

const pad2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// 기다린 끝에 쌓을지: 앱을 시작한 날과 지금 날짜가 같을 때만(자정을 넘겼으면 포기). 시험용(force)은 항상
function shouldEnqueue({ startDay, now, force = false }) {
  if (force) return true;
  return typeof startDay === 'string' && startDay === ymdOf(now);
}

// 그날이 속한 주의 월요일(YYYY-MM-DD): "+N개 더보기"로 설정창 알람 캘린더를 오늘 주로 옮길 때 쓴다
function weekStartOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymdOf(d);
}

module.exports = { BRIEF_DELAY_SEC, LATE_START_DELAY_MS, FORCE_DELAY_MS, planBrief, shouldEnqueue, weekStartOf, ymdOf };
