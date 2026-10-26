// 업데이트 소식 카드의 판단(화면과 분리해 시험한다: tests/update-news-unit.cjs).
//  - 업데이트 후: 저장값(lastSeenVersion)이 현재보다 낮을 때만 카드를 보인다. 저장값이 없으면(새 설치·기존 사용자의 첫 실행) 저장만 하고 카드는 없다.
//  - 업데이트 전: 새 버전이 확인되면 같은 버전에 대해 한 번만 자동으로 보인다(lastPromptedVersion). 이후에는 설정창의 "소식 보기"로만.

// "1.7.0"·"v1.7.0" → [1, 7, 0]. 숫자.숫자.숫자가 아니면 null(시험판 꼬리표 등은 인정하지 않는다)
export function parseVersion(v: unknown): [number, number, number] | null {
  if (typeof v !== 'string') return null;
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// a가 더 낮으면 -1, 같으면 0, 높으면 1. 어느 한쪽이 버전 모양이 아니면 null
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export type WhatsNewAction = 'seed' | 'show' | 'none';

// 업데이트 후 카드: seed = 현재 버전을 저장만(카드 없음), show = 카드를 보이고 닫으면 저장, none = 아무것도 안 함
//  - force(시험용 환경변수): 저장값을 무시하고 소식이 있으면 보인다
//  - 저장값이 현재보다 낮아도 현재 버전의 소식이 없으면 카드 없이 저장만 한다. 저장값이 같거나 더 높으면(내려받은 경우 등) 그대로 둔다
export function decideWhatsNew({ stored, current, hasNotes, force = false }: { stored: unknown; current: unknown; hasNotes: boolean; force?: boolean }): WhatsNewAction {
  if (!parseVersion(current)) return 'none';
  if (force) return hasNotes ? 'show' : 'none';
  if (!parseVersion(stored)) return 'seed';
  const c = compareVersions(stored, current);
  if (c === null || c >= 0) return 'none';
  return hasNotes ? 'show' : 'seed';
}

// 업데이트 전 카드: 같은 버전에는 자동으로 한 번만. force(설정창의 "소식 보기")는 항상 보인다
export function shouldPromptUpdate({ lastPrompted, version, force = false }: { lastPrompted: unknown; version: unknown; force?: boolean }): boolean {
  if (!parseVersion(version)) return false;
  if (force) return true;
  return typeof lastPrompted !== 'string' || compareVersions(lastPrompted, version) !== 0;
}

// ── 카드 하나에 대한 최종 판단(NoticePage가 쓴다) ─────────────────────────────
// item: 메인이 알려 준 카드(종류와 메인이 정한 값만), stored: 설정 저장값(없으면 null), current: 지금 앱 버전, notesFor: 그 버전의 앱 내장 소식
export interface NoticeItemLike { kind: string; payload: { version?: string; notes?: string[]; force?: boolean; replay?: boolean; fake?: boolean } | null }
export type NoticeView =
  | { kind: 'whatsnew'; version: string; items: string[]; persist: boolean }   // persist: 닫을 때 lastSeenVersion을 저장할지(다시 보기·시험은 저장하지 않는다)
  | { kind: 'update'; version: string; notes: string[]; persist: boolean };    // persist: 닫을 때 lastPromptedVersion을 저장할지
export type NoticeDecision = { view: NoticeView } | { skip: true; seed?: string };   // seed: 카드 없이 현재 버전만 저장하라는 뜻

export function decideNotice(
  item: NoticeItemLike,
  { stored, current, notesFor }: { stored: Record<string, unknown> | null; current: string; notesFor: (v: string) => { items: string[] } | null },
): NoticeDecision {
  const p = item.payload ?? {};
  if (item.kind === 'whatsnew') {
    const note = notesFor(current);
    // 저장된 설정이 아직 없는 새 설치: 설정이 만들어진 뒤에 판단한다(기본값을 대신 저장해 새 설치 판정을 깨지 않는다). 다시 보기(force)는 저장값 없이도 보인다
    if (!stored && !p.force) return { skip: true };
    const action = decideWhatsNew({ stored: stored?.lastSeenVersion, current, hasNotes: !!note, force: !!p.force });
    if (action === 'show' && note) return { view: { kind: 'whatsnew', version: current, items: note.items.slice(0, 5), persist: !p.force } };
    return { skip: true, seed: action === 'seed' ? current : undefined };
  }
  if (item.kind === 'update') {
    const version = typeof p.version === 'string' ? p.version : '';
    if (!shouldPromptUpdate({ lastPrompted: stored?.lastPromptedVersion, version, force: !!p.force })) return { skip: true };
    const notes = (Array.isArray(p.notes) ? p.notes : []).filter((n): n is string => typeof n === 'string' && !!n.trim()).slice(0, 4);
    return { view: { kind: 'update', version, notes, persist: !p.force && !p.fake } };
  }
  return { skip: true };
}
