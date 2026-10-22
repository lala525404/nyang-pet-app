// 알람 목록 "자세히" 펼침 상태 전환(한 번에 하나만). 화면과 분리해 시험한다.
// 펼침 상태는 저장하지 않는다: 설정창을 다시 열면 모두 접힌 상태(null)로 시작한다.
export type OpenId = string | null;

// 접힌 항목을 열면 이미 열려 있던 항목은 자동으로 접히고, 열린 항목을 다시 누르면 접힌다.
export const toggleOpen = (open: OpenId, id: string): OpenId => (open === id ? null : id);
// 새 알람(추가·복제)은 자동으로 펼쳐지고 나머지는 접힌다.
export const openAfterAdd = (_open: OpenId, newId: string): OpenId => newId;
// 펼쳐 둔 알람을 지우면 모두 접힌 상태로, 다른 알람을 지웠으면 그대로.
export const openAfterRemove = (open: OpenId, removedId: string): OpenId => (open === removedId ? null : open);
// 목록에 없는 id가 열려 있으면(다른 곳에서 지워졌을 때) 접는다.
export const openIfExists = (open: OpenId, ids: string[]): OpenId => (open !== null && ids.includes(open) ? open : null);
