'use strict';
// 업데이트 시험용 로컬 피드 서버(루프백 127.0.0.1 전용). 시험용 빌드(scripts/make-update-test-config.cjs)가 이 주소를 피드로 쓴다.
//   node scripts/update-test-feed.cjs <새 버전 빌드 폴더> [포트=8787]
//   THROTTLE_MS=25 node scripts/update-test-feed.cjs …   (256KB마다 25ms 쉬어서 다운로드를 느리게 → 진행률 UI를 볼 수 있다)
// 요청은 콘솔에 한 줄씩 찍힌다. 끝낼 때는 Ctrl+C(또는 실행한 PID를 종료).
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || '.'); const port = +(process.argv[3] || 8787); const throttle = +process.env.THROTTLE_MS || 0;
http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split('?')[0])); const ok = f.startsWith(dir) && fs.existsSync(f) && fs.statSync(f).isFile();
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${req.headers.range || ''} -> ${ok ? 200 : 404}`);
  if (!ok) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) { const s = range[1] ? +range[1] : 0, e = range[2] ? +range[2] : size - 1; res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': e - s + 1, 'Accept-Ranges': 'bytes' }); return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  if (!throttle) return fs.createReadStream(f).pipe(res);
  const fd = fs.openSync(f, 'r'); let pos = 0; const buf = Buffer.alloc(262144);
  const step = () => { const n = fs.readSync(fd, buf, 0, buf.length, pos); if (!n) { fs.closeSync(fd); return res.end(); } pos += n; res.write(Buffer.from(buf.subarray(0, n)), () => setTimeout(step, throttle)); };
  step();
}).listen(port, '127.0.0.1', () => console.log(`업데이트 시험 피드: http://127.0.0.1:${port}  (폴더: ${dir}${throttle ? `, 느리게 ${throttle}ms` : ''})`));
