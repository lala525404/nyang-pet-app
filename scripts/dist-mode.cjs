// 개발 서버 없이 빌드된 dist 화면으로 앱을 띄우기 위해 패키지 실행처럼 보이게 한다(electron -r 로 먼저 불러온다).
const { app } = require('electron');
Object.defineProperty(app, 'isPackaged', { get: () => true, configurable: true });
