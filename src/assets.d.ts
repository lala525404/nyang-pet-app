// 이미지 가져오기 타입 (Vite가 파일 주소 문자열로 바꿔 준다)
declare module '*.png' {
  const src: string;
  export default src;
}
