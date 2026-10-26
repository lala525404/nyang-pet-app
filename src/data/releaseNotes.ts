// 업데이트를 마치고 처음 실행했을 때 카드로 보여 주는 "달라진 점"(앱에 들어 있는 글이라 네트워크가 필요 없다).
// 릴리스를 만들 때마다 package.json 버전의 항목을 여기에 한 개 추가한다(없으면 tests/update-news-unit.cjs가 실패해서 잊지 않게 한다).
// 항목은 3~5개, 한 줄에 하나씩, 쉬운 말로 쓴다. 새 버전이 위로 오게 쌓는다.

export interface ReleaseNote { version: string; items: string[] }

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.7.0',
    items: [
      '지난 알람은 7일 뒤에 알아서 정리돼요',
      '캘린더에서 일정과 알람이 다르게 보여요',
      '컴퓨터를 켜고 3분 뒤, 오늘 할 일을 알려 줘요',
      '대화로 "오늘 브리핑해줘"라고 해도 돼요',
      '업데이트 소식을 카드로 알려 줘요',
    ],
  },
  {
    version: '1.6.0',
    items: [
      '버디를 우클릭하면 작은 퀵 바가 열려요',
      '말로 알람을 만들고, 지우고, 찾아볼 수 있어요',
      '이번 주나 몇 주차 알람을 한눈에 볼 수 있어요',
      '알람 캘린더에 공휴일이 표시돼요',
      '말풍선 문구가 훨씬 다양해졌어요',
    ],
  },
];

// 그 버전의 소식. 없으면 null
export const notesFor = (version: string): ReleaseNote | null => RELEASE_NOTES.find(n => n.version === version) ?? null;
