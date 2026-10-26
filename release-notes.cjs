'use strict';
// 새 버전 안내 카드(업데이트 전)에 보여 줄 "달라지는 점"을 릴리스 노트에서 뽑는 순수 함수(tests/release-notes-unit.cjs). 새 네트워크 요청은 없다:
// electron-updater가 update-available로 이미 건네준 info.releaseNotes만 읽는다.
//
// info.releaseNotes의 모양(electron-updater 6.x, GitHub provider):
//  - 기본: 최신 릴리스 하나의 HTML 문자열(릴리스 Atom 피드의 <content>: GitHub이 렌더링한 <p>/<ul>/<li>)
//  - fullChangelog를 켜거나 latest.yml에 노트가 있으면: 마크다운 문자열이거나 [{ version, note }] 배열
//  - 노트가 없으면 '' 또는 null
// 그래서 문자열(HTML·마크다운)과 배열을 모두 받고, 결과는 항상 일반 텍스트 문자열 배열이다(렌더러는 HTML을 끼워 넣지 않는다).
//
// 뽑는 규칙: "새로 생겼어요"·"다듬었어요" 구역의 "- 제목: 설명" 항목에서 콜론 앞의 제목만, 최대 MAX_ITEMS개. 못 뽑으면 빈 배열.

const MAX_ITEMS = 4;
const MAX_TITLE_CHARS = 24;
const MAX_INPUT_CHARS = 20000;   // 이보다 긴 노트는 앞부분만 본다(이상한 입력에 오래 걸리지 않게)
const SECTION_OK = /^(새로 생겼어요|다듬었어요)$/;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// HTML이든 마크다운이든 "줄 단위 일반 텍스트"로: 목록 항목은 "- "로 시작하는 줄이 된다.
function toLines(input) {
  let s = String(input).slice(0, MAX_INPUT_CHARS).replace(/\r\n?/g, '\n');
  if (/<[a-z!/][^>]*>/i.test(s)) {
    s = s.replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<h[1-6][^>]*>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr|blockquote|pre)>/gi, '\n')
      .replace(/<[^>]*>/g, '');
  }
  return decodeEntities(s).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const stripMarkdown = (s) => s
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')       // [글자](주소) → 글자
  .replace(/https?:\/\/\S+/gi, '')                  // 주소
  .replace(/\b[0-9a-f]{32,}\b/gi, '')               // SHA 같은 긴 16진수
  .replace(/\bsha-?\d+\b\s*[:=]?/gi, '')
  .replace(/[*_`~#|\\<>[\]]/g, '')                  // 마크다운·HTML 기호
  .replace(/\s+/g, ' ').trim();

const isHeadingText = (line) => line.replace(/^[#>*_\s]+|[*_:：\s]+$/g, '');

function cleanTitle(raw) {
  const t = stripMarkdown(raw).replace(/[:：]+$/, '').trim();
  if (!t || /^[\d\s.,·-]+$/.test(t)) return '';
  const chars = Array.from(t);
  return chars.length > MAX_TITLE_CHARS ? `${chars.slice(0, MAX_TITLE_CHARS - 1).join('')}…` : t;
}

// 문자열 하나(HTML 또는 마크다운)에서 제목들
function parseText(text) {
  const out = [];
  let inSection = false;
  for (const line of toLines(text)) {
    const li = /^(?:[-*•·]|\d+[.)])\s+(.*)$/.exec(line);
    if (!li) {   // 목록이 아닌 줄: 구역 제목이면 구역을 바꾸고, 다른 글이면 구역을 끝낸다
      const h = isHeadingText(line);
      inSection = SECTION_OK.test(h);   // 다른 구역 제목(고쳤어요·다운로드 등)이나 일반 문장이면 구역 밖
      continue;
    }
    if (!inSection) continue;
    const m = /^([^:：]+)[:：]/.exec(stripMarkdown(li[1]));   // 링크 주소 안의 콜론(https:)에서 잘리지 않게 먼저 지우고 나눈다
    if (!m) continue;
    const title = cleanTitle(m[1]);
    if (title && !out.includes(title)) out.push(title);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

// info.releaseNotes → string[] (최대 MAX_ITEMS). 어떤 입력이든 던지지 않는다.
function parseReleaseNotes(raw) {
  try {
    if (typeof raw === 'string') return parseText(raw);
    if (Array.isArray(raw)) {   // [{ version, note }] — 새 버전부터 정렬돼 있다. 위에서부터 채운다
      const out = [];
      for (const e of raw) {
        const note = e && typeof e === 'object' ? e.note : typeof e === 'string' ? e : '';
        if (typeof note !== 'string') continue;
        for (const t of parseText(note)) { if (!out.includes(t)) out.push(t); if (out.length >= MAX_ITEMS) return out; }
      }
      return out;
    }
  } catch { /* 이상한 입력은 빈 배열 */ }
  return [];
}

// 릴리스 페이지 주소: 버전 문자열이 숫자와 점으로만 이뤄졌을 때만 만든다(사용자가 누를 때만 기본 브라우저로 연다). 아니면 null
const RELEASE_BASE = 'https://github.com/lala525404/nyang-pet-app/releases';
function releaseUrl(version) {
  const v = typeof version === 'string' ? version.replace(/^v/i, '') : '';
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v) ? `${RELEASE_BASE}/tag/v${v}` : null;
}

module.exports = { MAX_ITEMS, MAX_TITLE_CHARS, parseReleaseNotes, releaseUrl, RELEASE_BASE };
