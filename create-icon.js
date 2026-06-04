// Node.js로 간단한 PNG 아이콘 생성
// Electron은 ICO 또는 PNG 지원
const fs = require('fs');
const path = require('path');

// 256x256 PNG를 base64로 인코딩된 고양이 이모지 아이콘
// sharp 없이 직접 최소 PNG 바이너리 생성
// 대신 SVG를 HTML canvas로 렌더링하는 방식 사용

console.log('아이콘은 public/icon.png 에 직접 넣어주세요');
