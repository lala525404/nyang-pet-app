export interface AnimalData {
  id: string;
  name: string;
  emoji: string;
  moods: Record<string, string>;
  nags: string[];
  reactions: string[];
  escapeLines: string[];
}

export const ANIMALS: AnimalData[] = [
  {
    id: 'cat', name: '고양이', emoji: '🐱',
    moods: { normal:'🐱', happy:'😸', sleepy:'😴', surprised:'🙀', angry:'😾', party:'🎉', love:'😻', cool:'😎', scared:'🙀' },
    nags: ['냥... 아직도 일해?','쉬어라냥 🐾','커피 마셔라냥 ☕','눈 좀 쉬게 해라냥 👀','허리 펴라냥!','물 마셨냥? 💧','밥은 먹었냥? 🍱','야근은 적당히 하라냥 🌙'],
    reactions: ['왜 건드려 냥! 😾','냥냥냥 🐾','간식 줘라냥! 🍖','건드리지 마라냥 😤','졸려냥... 😴','무야호~냥!','으... 깜짝이야 냥 😹'],
    escapeLines: ['잡으려고? 냥!','도망가는 냥! 🏃','못 잡아 냥~','냥냥냥!!! 💨'],
  },
  {
    id: 'dog', name: '강아지', emoji: '🐶',
    moods: { normal:'🐶', happy:'🐶', sleepy:'😴', surprised:'🐶', angry:'🐶', party:'🎉', love:'🐶', cool:'😎', scared:'🐶' },
    nags: ['멍... 쉬어요 🐾','산책 가고 싶멍!','물 마셔요 멍 💧','밥 먹었어요 멍? 🍖','허리 펴요 멍!','커피 마셔요 멍 ☕','야근은 싫멍 🌙'],
    reactions: ['왜 건드려요 멍! 🐾','멍멍멍!','간식 줘요 멍! 🦴','졸려요 멍... 😴','무야호 멍!','깜짝이야 멍! 😮'],
    escapeLines: ['잡아봐요 멍!','도망가는 멍! 🏃','못 잡아요 멍~','멍멍멍!!! 💨'],
  },
  {
    id: 'rabbit', name: '토끼', emoji: '🐰',
    moods: { normal:'🐰', happy:'🐰', sleepy:'😴', surprised:'🐰', angry:'🐰', party:'🎉', love:'🐰', cool:'😎', scared:'🐰' },
    nags: ['뚜... 쉬어요 🥕','당근 먹을 시간!','물 마셔요 뚜 💧','눈 쉬게 해요 뚜 👀','허리 펴요 뚜!','야근은 싫뚜 🌙'],
    reactions: ['왜 건드려요 뚜! 🐾','뚜뚜뚜!','당근 줘요 뚜! 🥕','졸려요 뚜... 😴','깜짝이야 뚜!','무야호 뚜!'],
    escapeLines: ['잡아봐요 뚜!','도망가는 뚜! 🏃','못 잡아요 뚜~','뚜뚜뚜!!! 💨'],
  },
  {
    id: 'fox', name: '여우', emoji: '🦊',
    moods: { normal:'🦊', happy:'🦊', sleepy:'😴', surprised:'🦊', angry:'🦊', party:'🎉', love:'🦊', cool:'😎', scared:'🦊' },
    nags: ['링... 쉬어요 🦊','물 마셔요 링 💧','밥 먹었어요 링? 🍱','눈 쉬게 해요 링 👀','허리 펴요 링!','야근은 싫링 🌙'],
    reactions: ['왜 건드려요 링! 🦊','링링링!','간식 줘요 링! 🍖','졸려요 링... 😴','깜짝이야 링!','무야호 링!'],
    escapeLines: ['잡아봐요 링!','도망가는 링! 🏃','못 잡아요 링~','링링링!!! 💨'],
  },
  {
    id: 'hamster', name: '햄스터', emoji: '🐹',
    moods: { normal:'🐹', happy:'🐹', sleepy:'😴', surprised:'🐹', angry:'🐹', party:'🎉', love:'🐹', cool:'😎', scared:'🐹' },
    nags: ['햄... 쉬어요 🌰','해바라기씨 먹을 시간!','물 마셔요 햄 💧','눈 쉬게 해요 햄 👀','허리 펴요 햄!','야근은 싫햄 🌙'],
    reactions: ['왜 건드려요 햄! 🐾','햄햄햄!','해바라기씨 줘요 🌰','졸려요 햄... 😴','깜짝이야 햄!','무야호 햄!'],
    escapeLines: ['잡아봐요 햄!','도망가는 햄! 🏃','못 잡아요 햄~','햄햄햄!!! 💨'],
  },
  {
    id: 'bear', name: '곰', emoji: '🐻',
    moods: { normal:'🐻', happy:'🐻', sleepy:'😴', surprised:'🐻', angry:'🐻', party:'🎉', love:'🐻', cool:'😎', scared:'🐻' },
    nags: ['곰... 쉬어요 🍯','꿀 먹을 시간!','물 마셔요 곰 💧','눈 쉬게 해요 곰 👀','허리 펴요 곰!','야근은 싫곰 🌙'],
    reactions: ['왜 건드려요 곰! 🐾','곰곰곰!','꿀 줘요 곰! 🍯','졸려요 곰... 😴','깜짝이야 곰!','무야호 곰!'],
    escapeLines: ['잡아봐요 곰!','도망가는 곰! 🏃','못 잡아요 곰~','곰곰곰!!! 💨'],
  },
  {
    id: 'penguin', name: '펭귄', emoji: '🐧',
    moods: { normal:'🐧', happy:'🐧', sleepy:'😴', surprised:'🐧', angry:'🐧', party:'🎉', love:'🐧', cool:'😎', scared:'🐧' },
    nags: ['펭... 쉬어요 🐟','생선 먹을 시간!','물 마셔요 펭 💧','눈 쉬게 해요 펭 👀','허리 펴요 펭!','야근은 싫펭 🌙'],
    reactions: ['왜 건드려요 펭! 🐾','펭펭펭!','생선 줘요 펭! 🐟','졸려요 펭... 😴','깜짝이야 펭!','무야호 펭!'],
    escapeLines: ['잡아봐요 펭!','도망가는 펭! 🏃','못 잡아요 펭~','펭펭펭!!! 💨'],
  },
  {
    id: 'duck', name: '오리', emoji: '🦆',
    moods: { normal:'🦆', happy:'🦆', sleepy:'😴', surprised:'🦆', angry:'🦆', party:'🎉', love:'🦆', cool:'😎', scared:'🦆' },
    nags: ['꽥... 쉬어요 🦆','물놀이 할 시간!','물 마셔요 꽥 💧','눈 쉬게 해요 꽥 👀','허리 펴요 꽥!','야근은 싫꽥 🌙'],
    reactions: ['왜 건드려요 꽥! 🐾','꽥꽥꽥!','빵 줘요 꽥! 🍞','졸려요 꽥... 😴','깜짝이야 꽥!','무야호 꽥!'],
    escapeLines: ['잡아봐요 꽥!','도망가는 꽥! 🏃','못 잡아요 꽥~','꽥꽥꽥!!! 💨'],
  },
];

export function getAnimal(id: string): AnimalData {
  return ANIMALS.find(a => a.id === id) || ANIMALS[0];
}
