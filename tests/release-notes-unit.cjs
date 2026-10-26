// 릴리스 노트 파서 단위 테스트(업데이트 전 카드): HTML·마크다운·배열·이상한 입력, 최대 4개, 제목만(콜론 앞), SHA·링크·마크다운 기호 제거, 일반 텍스트만.
// `node tests/release-notes-unit.cjs` (npm test에 포함)
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = require('../release-notes.cjs');
const queue = []; const t = (name, fn) => queue.push([name, fn]);
const FFFD = String.fromCharCode(0xFFFD);

// 실제 v1.6.0 릴리스 본문(마크다운 원문)의 필요한 부분
const MD_160 = `최애를 풀어놨습니다 v1.6.0

우클릭 퀵 메뉴와, 말로 알람을 만들고 지우고 찾아보는 대화 기능이 생겼어요.

새로 생겼어요
- 우클릭 퀵 메뉴: 버디를 우클릭하면 바로 옆에 작은 바가 열려요. 설정 열기, 날씨, 오늘 알람, 대화하기, 종료를 한 번에 누를 수 있고요.
- 대화로 알람 만들기·삭제·조회: 퀵 메뉴의 [대화하기]에 "내일 오후 3시에 회의 알람 만들어줘"처럼 입력해요.
- 오전/오후 확인: "3시"처럼 오전/오후 구분이 없는 시각은 먼저 물어봐요.
- 주간·N주차 조회: "이번 주 알람"처럼 물어보면 보여줘요.
- 공휴일 표시: 알람 캘린더에 공휴일이 표시돼요.

다듬었어요
- 초집중 모드 간격 개선: 버디 이미지와 시계 사이의 빈 칸을 줄였어요.
- 버디 창의 투명한 부분: 클릭 문제를 고쳤어요.

그대로예요
- 기존 설정, 알람, 말풍선 메시지는 그대로 유지돼요.

다운로드
- macOS (Apple Silicon): choeae-app-1.6.0-arm64.dmg
- SHA-256: 38cd60bfa5158081520137940cf467bb112d8d8e3c3586a0c298d569f0d1c7af
  - Windows: choeae-app-Setup-1.6.0.exe
  - SHA-256: 18fc61f06a1df0546ca3c942074d5b7cfe41276e92510570edcd257cc80cc87e`;

// GitHub이 렌더링한 HTML(Atom 피드 <content>)과 같은 모양
const HTML_160 = `<p>최애를 풀어놨습니다 v1.6.0</p>\n<p>우클릭 퀵 메뉴가 생겼어요.</p>\n<p>새로 생겼어요</p>\n<ul>\n<li>우클릭 퀵 메뉴: 버디를 우클릭하면 작은 바가 열려요.</li>\n<li>대화로 알람 만들기·삭제·조회: 말로 알람을 만들어요 &amp; 지워요.</li>\n<li>공휴일 표시: 알람 캘린더에 공휴일이 표시돼요.</li>\n</ul>\n<p>다듬었어요</p>\n<ul>\n<li>초집중 모드 간격 개선: 빈 칸을 줄였어요.</li>\n</ul>\n<p>고쳤어요</p>\n<ul><li>이건 안 보여야 해요: 고친 것</li></ul>\n<p>다운로드</p>\n<ul><li>SHA-256: 18fc61f06a1df0546ca3c942074d5b7cfe41276e92510570edcd257cc80cc87e</li></ul>`;

t('마크다운: 새로 생겼어요·다듬었어요 구역에서 콜론 앞 제목만, 최대 4개(고쳤어요·그대로예요·다운로드는 제외)', () => {
  const r = R.parseReleaseNotes(MD_160);
  assert.deepStrictEqual(r, ['우클릭 퀵 메뉴', '대화로 알람 만들기·삭제·조회', '오전/오후 확인', '주간·N주차 조회']);
  assert.ok(r.length <= R.MAX_ITEMS);
});
t('HTML(GitHub 렌더링): 같은 제목을 뽑고, 엔티티를 풀고, 태그는 남지 않는다. 고쳤어요·SHA 구역은 제외', () => {
  const r = R.parseReleaseNotes(HTML_160);
  assert.deepStrictEqual(r, ['우클릭 퀵 메뉴', '대화로 알람 만들기·삭제·조회', '공휴일 표시', '초집중 모드 간격 개선']);
  for (const x of r) assert.ok(!/[<>]/.test(x), x);
});
t('구역이 하나뿐이어도, 구역이 없으면(고쳤어요만 등) 빈 배열', () => {
  assert.deepStrictEqual(R.parseReleaseNotes('다듬었어요\n- 부드러워졌어요: 설명'), ['부드러워졌어요']);
  assert.deepStrictEqual(R.parseReleaseNotes('고쳤어요\n- 버그: 고쳤어요'), []);
  assert.deepStrictEqual(R.parseReleaseNotes('그냥 한 문장이에요.'), []);
});
t('콜론이 없는 항목은 건너뛴다(제목만 뽑는다는 규칙), 콜론은 전각(：)도 인정', () => {
  assert.deepStrictEqual(R.parseReleaseNotes('새로 생겼어요\n- 설명만 있는 줄이에요\n- 제목：설명이에요'), ['제목']);
});
t('마크다운 제목 표기(## 새로 생겼어요, **굵게**)와 번호 목록, • 목록도 읽는다', () => {
  assert.deepStrictEqual(R.parseReleaseNotes('## 새로 생겼어요\n1. **굵은 제목**: 설명\n• `코드` 제목: 설명'), ['굵은 제목', '코드 제목']);
  assert.deepStrictEqual(R.parseReleaseNotes('**새로 생겼어요**\n- 제목: 설명'), ['제목']);
});
t('SHA·링크·URL·마크다운·HTML 기호를 제거하고, 24자를 넘으면 …으로 줄인다, 순수 숫자·빈 제목은 버린다', () => {
  const r = R.parseReleaseNotes('새로 생겼어요\n- [링크 제목](https://evil.example/x): 설명\n- https://evil.example 주소 제목: 설명\n- 38cd60bfa5158081520137940cf467bb112d8d8e3c3586a0c298d569f0d1c7af 해시: 설명\n- 12345: 숫자만\n- : 빈 제목\n- 아주아주아주아주아주아주아주아주아주아주 긴 제목이에요 정말로: 설명');
  assert.strictEqual(r[0], '링크 제목');
  assert.strictEqual(r[1], '주소 제목');
  assert.strictEqual(r[2], '해시');
  assert.strictEqual(r.length, 4);
  assert.ok(Array.from(r[3]).length <= R.MAX_TITLE_CHARS && r[3].endsWith('…'), r[3]);
  for (const x of r) assert.ok(!/https?:|[0-9a-f]{32}|[*_`<>\[\]|]/i.test(x), x);
});
t('악의적인 HTML도 일반 텍스트만 남는다: script·style·주석은 통째로 제거, 이벤트 속성 태그는 글자만', () => {
  const r = R.parseReleaseNotes('<p>새로 생겼어요</p><ul><li><script>alert(1)</script>안전한 제목: 설명</li><li><img src=x onerror="alert(2)">이미지 제목: 설명<!-- 주석: 숨김 --></li><li><b onclick="x()">굵은</b> 제목: 설명</li><li><style>a{}</style>스타일 제목: 설명</li></ul>');
  assert.deepStrictEqual(r, ['안전한 제목', '이미지 제목', '굵은 제목', '스타일 제목']);
  for (const x of r) assert.ok(!/[<>]|alert|onerror|onclick/.test(x), x);
});
t('배열 형태([{version, note}], 새 버전부터): 위에서부터 채우고 중복·최대 4개', () => {
  const r = R.parseReleaseNotes([{ version: '1.7.0', note: '새로 생겼어요\n- 가: 1\n- 나: 2\n- 가: 3' }, { version: '1.6.0', note: '새로 생겼어요\n- 다: 1\n- 라: 2\n- 마: 3' }]);
  assert.deepStrictEqual(r, ['가', '나', '다', '라']);
  assert.deepStrictEqual(R.parseReleaseNotes([{ version: '1', note: 5 }, null, 7, 'x']), []);
});
t('이상한 입력은 던지지 않고 빈 배열: null·undefined·숫자·객체·빈 문자열·깨진 HTML·아주 긴 입력', () => {
  for (const v of [null, undefined, 0, 12, {}, [], '', ' ', '<', '<<<>>>', '&#xFFFFFFFF; &#0; &bogus;', true]) assert.deepStrictEqual(R.parseReleaseNotes(v), [], String(v));
  const big = '새로 생겼어요\n' + '- 제목: 설명\n'.repeat(200000);
  const t0 = Date.now(); const r = R.parseReleaseNotes(big); assert.ok(Date.now() - t0 < 1000); assert.ok(r.length <= R.MAX_ITEMS);
  assert.deepStrictEqual(R.parseReleaseNotes('새로 생겼어요\r\n- 줄바꿈: 설명\r\n'), ['줄바꿈']);   // CRLF
});
t('릴리스 페이지 주소: 숫자.숫자.숫자(앞 v 허용)일 때만 만든다, 나머지는 null(사용자가 누를 때만 열기 위한 값)', () => {
  assert.strictEqual(R.releaseUrl('1.7.0'), 'https://github.com/lala525404/nyang-pet-app/releases/tag/v1.7.0');
  assert.strictEqual(R.releaseUrl('v1.7.0'), 'https://github.com/lala525404/nyang-pet-app/releases/tag/v1.7.0');
  for (const v of ['', null, undefined, 5, '1.7', '1.7.0.1', '1.7.0/../x', 'javascript:alert(1)', '1.7.0?x=1', ' 1.7.0', '1.7.0-beta']) assert.strictEqual(R.releaseUrl(v), null, String(v));
});
t('파일에 깨진 글자(U+FFFD)·???가 없다, 새 네트워크 호출 없음(정적 확인)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'release-notes.cjs'), 'utf8');
  assert.ok(!src.includes(FFFD) && !/\?{3}/.test(src));
  assert.ok(!/require\(|fetch\(|http\.request|https\.request|net\./.test(src), '이 모듈은 아무것도 불러오지 않는다');
});

(async () => {
  let n = 0;
  for (const [name, fn] of queue) { await fn(); n++; console.log('  ok  ' + name); }
  console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
